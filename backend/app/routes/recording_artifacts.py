import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.recording_artifact import RecordingArtifactOut, RecordingArtifactSummary
from app.services.recording_artifact_service import RecordingArtifactService

router = APIRouter(prefix="/meetings/{meeting_id}/recording-artifacts", tags=["recording-artifacts"])


@router.get("", response_model=list[RecordingArtifactOut])
def list_recording_artifacts(meeting_id: uuid.UUID, db: Session = Depends(get_db)):
    return RecordingArtifactService.list_for_meeting(db, meeting_id)


@router.get("/summary", response_model=RecordingArtifactSummary)
def recording_artifact_summary(meeting_id: uuid.UUID, db: Session = Depends(get_db)):
    return RecordingArtifactService.summary(db, meeting_id)


@router.post("/upload", response_model=list[RecordingArtifactOut], status_code=201)
async def upload_recording_artifacts(
    meeting_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    artifacts = []
    try:
        for file in files:
            if not file.filename:
                continue
            payload = await file.read()
            if not payload:
                continue
            artifacts.append(
                RecordingArtifactService.create_from_upload(
                    db,
                    meeting_id,
                    file_name=file.filename,
                    content_type=file.content_type,
                    file_bytes=payload,
                )
            )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not artifacts:
        raise HTTPException(status_code=400, detail="Uploaded files were empty")
    return artifacts

