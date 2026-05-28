import re
import uuid

from sqlalchemy.orm import Session

from app.models.entities import Meeting, RecordingArtifact
from app.schemas.recording_artifact import RecordingArtifactCreate, RecordingArtifactSummary


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

