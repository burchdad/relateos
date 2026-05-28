import re
import uuid
from io import BytesIO

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Meeting, RecordingArtifact
from app.schemas.recording_artifact import RecordingArtifactCreate, RecordingArtifactSummary, RecordingTranscriptionResponse
from app.services.connections_service import ConnectionsService


TEXT_EXTENSIONS = (".txt", ".vtt", ".srt", ".csv", ".json", ".md")
MEDIA_EXTENSIONS = (".mp4", ".m4a", ".mp3", ".wav", ".mov", ".webm")


class RecordingArtifactService:
    @staticmethod
    def list_for_meeting(db: Session, meeting_id: uuid.UUID) -> list[RecordingArtifact]:
        return (
            db.query(RecordingArtifact)
            .filter(RecordingArtifact.meeting_id == meeting_id)
            .order_by(RecordingArtifact.created_at.desc())
            .all()
        )

    @staticmethod
    def create(db: Session, meeting_id: uuid.UUID, payload: RecordingArtifactCreate) -> RecordingArtifact:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise ValueError("Meeting not found")

        artifact = RecordingArtifact(
            id=uuid.uuid4(),
            meeting_id=meeting_id,
            artifact_type=payload.artifact_type,
            file_name=payload.file_name,
            content_type=payload.content_type,
            source_url=payload.source_url,
            text_content=payload.text_content,
            file_size_bytes=payload.file_size_bytes,
            status=payload.status,
            extraction_notes=payload.extraction_notes,
            raw_metadata=payload.raw_metadata,
        )
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
        return artifact

    @staticmethod
    def create_from_upload(
        db: Session,
        meeting_id: uuid.UUID,
        *,
        file_name: str,
        content_type: str | None,
        file_bytes: bytes,
    ) -> RecordingArtifact:
        lowered = file_name.lower()
        artifact_type = RecordingArtifactService._classify_file(file_name, content_type)
        notes: list[str] = []
        text_content = None
        status = "ready"

        if artifact_type in {"chat", "caption", "transcript", "text"}:
            text_content = RecordingArtifactService._decode_text(file_bytes)
            text_content = RecordingArtifactService._clean_text_artifact(text_content)
            notes.append(f"Extracted {len(text_content)} text characters from upload.")
            if not text_content:
                status = "needs_review"
                notes.append("Upload decoded as empty text.")
        elif lowered.endswith(MEDIA_EXTENSIONS) or (content_type or "").startswith(("audio/", "video/")):
            status = "pending_transcription"
            notes.append("Media artifact registered. Add object storage + transcription worker to process audio/video.")
        else:
            status = "needs_review"
            notes.append("Unsupported artifact format. Upload chat txt, captions vtt/srt, transcript txt, audio, or video.")

        return RecordingArtifactService.create(
            db,
            meeting_id,
            RecordingArtifactCreate(
                artifact_type=artifact_type,
                file_name=file_name,
                content_type=content_type,
                text_content=text_content,
                file_size_bytes=len(file_bytes),
                status=status,
                extraction_notes=notes,
                raw_metadata={"source": "upload"},
            ),
        )

    @staticmethod
    def combined_ready_text(db: Session, meeting_id: uuid.UUID) -> tuple[str, list[str]]:
        artifacts = RecordingArtifactService.list_for_meeting(db, meeting_id)
        text_parts = []
        notes = []
        for artifact in artifacts:
            if artifact.status != "ready" or not artifact.text_content:
                continue
            label = artifact.file_name or artifact.artifact_type
            text_parts.append(f"{artifact.artifact_type.upper()} artifact: {label}\n{artifact.text_content}")
            notes.append(f"Used {artifact.artifact_type} artifact: {label}.")
        return "\n\n".join(text_parts)[:40000], notes

    @staticmethod
    def summary(db: Session, meeting_id: uuid.UUID) -> RecordingArtifactSummary:
        artifacts = RecordingArtifactService.list_for_meeting(db, meeting_id)
        ready_text = [item for item in artifacts if item.status == "ready" and item.text_content]
        pending = [item for item in artifacts if item.status == "pending_transcription"]
        media = [item for item in artifacts if item.artifact_type in {"audio", "video"}]
        return RecordingArtifactSummary(
            total=len(artifacts),
            ready_text=len(ready_text),
            pending_transcription=len(pending),
            media=len(media),
            text_characters=sum(len(item.text_content or "") for item in ready_text),
        )

    @staticmethod
    def transcribe_pending(db: Session, meeting_id: uuid.UUID, limit: int = 3) -> RecordingTranscriptionResponse:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise ValueError("Meeting not found")

        pending = (
            db.query(RecordingArtifact)
            .filter(
                RecordingArtifact.meeting_id == meeting_id,
                RecordingArtifact.status == "pending_transcription",
                RecordingArtifact.artifact_type.in_(["audio", "video", "media"]),
            )
            .order_by(RecordingArtifact.created_at.asc())
            .limit(limit)
            .all()
        )

        processed = 0
        skipped = 0
        errors: list[str] = []
        transcripts: list[RecordingArtifact] = []

        for artifact in pending:
            try:
                transcript = RecordingArtifactService.transcribe_artifact(db, artifact)
                transcripts.append(transcript)
                processed += 1
            except ValueError as exc:
                skipped += 1
                errors.append(f"{artifact.file_name or artifact.id}: {exc}")
            except Exception as exc:
                errors.append(f"{artifact.file_name or artifact.id}: {exc}")

        return RecordingTranscriptionResponse(
            meeting_id=meeting_id,
            processed=processed,
            transcripts_created=len(transcripts),
            skipped=skipped,
            errors=errors,
            artifacts=transcripts,
        )

    @staticmethod
    def transcribe_artifact(db: Session, artifact: RecordingArtifact) -> RecordingArtifact:
        if not artifact.source_url:
            artifact.status = "needs_review"
            artifact.extraction_notes = [*artifact.extraction_notes, "Cannot transcribe media without a source URL."]
            db.commit()
            raise ValueError("Missing media source URL")

        if artifact.file_size_bytes and artifact.file_size_bytes > settings.recording_transcription_max_bytes:
            artifact.status = "needs_chunking"
            artifact.extraction_notes = [
                *artifact.extraction_notes,
                (
                    "Media is larger than the configured transcription limit. "
                    "Add chunking/audio extraction worker before processing this file."
                ),
            ]
            db.commit()
            raise ValueError("Media exceeds transcription size limit")

        api_key = settings.openai_api_key or ConnectionsService.stored_connector_value(db, "openai", "api_key")
        if not api_key:
            raise ValueError("OpenAI API key is not configured")

        media_bytes = RecordingArtifactService._download_media(artifact.source_url)
        if len(media_bytes) > settings.recording_transcription_max_bytes:
            artifact.status = "needs_chunking"
            artifact.file_size_bytes = artifact.file_size_bytes or len(media_bytes)
            artifact.extraction_notes = [
                *artifact.extraction_notes,
                (
                    "Downloaded media is larger than the configured transcription limit. "
                    "Add chunking/audio extraction worker before processing this file."
                ),
            ]
            db.commit()
            raise ValueError("Downloaded media exceeds transcription size limit")

        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        file_name = artifact.file_name or f"recording-{artifact.id}.m4a"
        file_obj = BytesIO(media_bytes)
        file_obj.name = file_name
        transcription = client.audio.transcriptions.create(
            model=settings.openai_transcription_model,
            file=file_obj,
            response_format="text",
        )
        transcript_text = str(transcription).strip()
        if not transcript_text:
            artifact.status = "needs_review"
            artifact.extraction_notes = [*artifact.extraction_notes, "Transcription returned empty text."]
            db.commit()
            raise ValueError("Transcription returned empty text")

        transcript_artifact = RecordingArtifact(
            id=uuid.uuid4(),
            meeting_id=artifact.meeting_id,
            artifact_type="transcript",
            file_name=f"{file_name}.transcript.txt",
            content_type="text/plain",
            source_url=artifact.source_url,
            text_content=RecordingArtifactService._clean_text_artifact(transcript_text),
            file_size_bytes=len(transcript_text.encode("utf-8")),
            status="ready",
            extraction_notes=[
                f"Transcribed from media artifact {artifact.id}.",
                f"Model: {settings.openai_transcription_model}.",
            ],
            raw_metadata={
                "source": "openai_transcription",
                "source_artifact_id": str(artifact.id),
                "source_file_name": artifact.file_name,
            },
        )
        artifact.status = "transcribed"
        artifact.extraction_notes = [*artifact.extraction_notes, f"Created transcript artifact {transcript_artifact.id}."]
        db.add(transcript_artifact)
        db.commit()
        db.refresh(transcript_artifact)
        return transcript_artifact

    @staticmethod
    def _download_media(url: str) -> bytes:
        response = httpx.get(url, follow_redirects=True, timeout=120)
        if response.status_code >= 400:
            raise ValueError(f"Could not download media: {response.status_code}")
        return response.content

    @staticmethod
    def _classify_file(file_name: str, content_type: str | None) -> str:
        lowered = file_name.lower()
        content = (content_type or "").lower()
        if "chat" in lowered:
            return "chat"
        if lowered.endswith((".vtt", ".srt")) or "caption" in lowered or "cc" in lowered:
            return "caption"
        if "transcript" in lowered:
            return "transcript"
        if lowered.endswith((".mp4", ".mov", ".webm")) or content.startswith("video/"):
            return "video"
        if lowered.endswith((".m4a", ".mp3", ".wav")) or content.startswith("audio/"):
            return "audio"
        if lowered.endswith(TEXT_EXTENSIONS) or content.startswith("text/"):
            return "text"
        return "unknown"

    @staticmethod
    def _decode_text(file_bytes: bytes) -> str:
        for encoding in ("utf-8-sig", "utf-16", "latin-1"):
            try:
                return file_bytes.decode(encoding)
            except UnicodeDecodeError:
                continue
        return file_bytes.decode("utf-8", errors="ignore")

    @staticmethod
    def _clean_text_artifact(value: str) -> str:
        lines = []
        for line in value.splitlines():
            stripped = line.strip()
            if not stripped or stripped.upper() == "WEBVTT" or stripped.isdigit():
                continue
            if "-->" in stripped:
                continue
            lines.append(stripped)
        return re.sub(r"\s+", " ", "\n".join(lines)).strip()
