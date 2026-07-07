import hashlib
import hmac
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.models import AppUser, Workspace
from app.schemas.connections import (
    AgentSyncRequest,
    AgentSyncResponse,
    ConnectionsOverview,
    ConnectorKey,
    ConnectorStatus,
    OAuthStartResponse,
    ConnectorUpdateRequest,
    ConnectorUpdateResponse,
    GoogleContactsSyncResponse,
)
from app.services.connections_service import ConnectionsService
from app.services.google_contacts_service import GoogleContactsService
from app.services.zoom_import_service import ZoomImportService


router = APIRouter(prefix="/connections", tags=["connections"])


def _workspace_id(db: Session, user: AppUser):
    db_user = db.query(AppUser).filter(AppUser.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not db_user.workspace_id:
        workspace = Workspace(id=uuid.uuid4(), name=db_user.company_name or f"{db_user.name}'s Workspace", owner_user_id=db_user.id)
        db.add(workspace)
        db.flush()
        db_user.workspace_id = workspace.id
        db.commit()
        db.refresh(db_user)
    return db_user.workspace_id


@router.get("", response_model=ConnectionsOverview)
def get_connections(db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return ConnectionsOverview.model_validate(ConnectionsService.overview(db, _workspace_id(db, user)))


@router.post("/agent-sync", response_model=AgentSyncResponse)
def request_agent_sync(
    payload: AgentSyncRequest,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("automation:run")),
):
    return AgentSyncResponse.model_validate(ConnectionsService.request_agent_sync(db, payload.mode, context.workspace_id))


@router.post("/zoom/sync", response_model=AgentSyncResponse)
def sync_zoom_recordings(db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("automation:run"))):
    workspace_id = context.workspace_id
    imported = ZoomImportService.import_recent_recordings(db, workspace_id=workspace_id)
    errors = imported.get("errors", [])
    recordings_found = int(imported.get("recordings_found_count") or 0)
    imported_total = (
        int(imported.get("imported_content_count") or 0)
        + int(imported.get("imported_meeting_count") or 0)
        + int(imported.get("imported_attendee_count") or 0)
        + int(imported.get("imported_artifact_count") or 0)
    )
    return AgentSyncResponse.model_validate(
        {
            "job_id": str(uuid.uuid4()),
            "mode": "archive",
            "status": "partial" if errors else "completed",
            "message": (
                "Zoom sync completed, but no Zoom cloud recordings were found in the last year."
                if not errors and recordings_found == 0
                else "Zoom sync completed. No new Zoom records were imported because the available recordings already exist."
                if not errors and imported_total == 0
                else "Zoom sync completed. Recordings, attendees, and available transcript/chat artifacts were imported."
                if not errors
                else "Zoom sync partially completed. Review Zoom scopes, recording access, or transcript availability."
            ),
            "pipeline": ConnectionsService.overview(db, workspace_id)["pipeline"],
            "blockers": [],
            "requested_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            **imported,
        }
    )


@router.post("/zoom/ai-companion/sync", response_model=AgentSyncResponse)
def sync_zoom_ai_companion(db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("automation:run"))):
    workspace_id = context.workspace_id
    imported = ZoomImportService.import_ai_companion_summaries(db, workspace_id=workspace_id)
    errors = imported.get("errors", [])
    ai_notes_found = int(imported.get("ai_notes_found_count") or 0)
    imported_total = int(imported.get("imported_meeting_count") or 0) + int(imported.get("imported_artifact_count") or 0)
    return AgentSyncResponse.model_validate(
        {
            "job_id": str(uuid.uuid4()),
            "mode": "archive",
            "status": "partial" if errors else "completed",
            "message": (
                "Zoom AI sync completed, but no AI Companion meeting summaries were found in the last year."
                if not errors and ai_notes_found == 0
                else "Zoom AI sync completed. No new AI Companion summaries were imported because the available notes already exist."
                if not errors and imported_total == 0
                else "Zoom AI sync completed. AI Companion summaries were imported into meeting intelligence."
                if not errors
                else "Zoom AI sync partially completed. Review Zoom meeting summary scopes or AI Companion account settings."
            ),
            "pipeline": ConnectionsService.overview(db, workspace_id)["pipeline"],
            "blockers": [],
            "requested_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            **imported,
        }
    )


@router.post("/google/contacts/sync", response_model=GoogleContactsSyncResponse)
def sync_google_contacts(db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("imports:run"))):
    return GoogleContactsSyncResponse.model_validate(GoogleContactsService.sync_contacts(db, workspace_id=context.workspace_id))


@router.get("/zoom/oauth/start", response_model=OAuthStartResponse)
def start_zoom_oauth(db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("connections:manage"))):
    try:
        return OAuthStartResponse(auth_url=ConnectionsService.oauth_start_url("zoom", context.workspace_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/zoom/oauth/callback")
def zoom_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    ConnectionsService.oauth_callback(db, "zoom", code, state)
    return RedirectResponse(f"{settings.frontend_app_url.rstrip('/')}/connections?connected=zoom")


@router.get("/google-calendar/oauth/start", response_model=OAuthStartResponse)
def start_google_calendar_oauth(db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("connections:manage"))):
    try:
        return OAuthStartResponse(auth_url=ConnectionsService.oauth_start_url("google_calendar", context.workspace_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/google-calendar/oauth/callback")
def google_calendar_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    ConnectionsService.oauth_callback(db, "google_calendar", code, state)
    return RedirectResponse(f"{settings.frontend_app_url.rstrip('/')}/connections?connected=google_calendar")


@router.post("/zoom/webhook")
async def zoom_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    payload = await request.json()

    if settings.zoom_webhook_secret_token:
        plain_token = payload.get("payload", {}).get("plainToken")
        if payload.get("event") == "endpoint.url_validation" and plain_token:
            encrypted = hmac.new(
                settings.zoom_webhook_secret_token.encode("utf-8"),
                str(plain_token).encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            return {"plainToken": plain_token, "encryptedToken": encrypted}

        timestamp = request.headers.get("x-zm-request-timestamp")
        signature = request.headers.get("x-zm-signature")
        if timestamp and signature:
            message = f"v0:{timestamp}:{body.decode('utf-8')}"
            expected = "v0=" + hmac.new(
                settings.zoom_webhook_secret_token.encode("utf-8"),
                message.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(signature, expected):
                return {"status": "ignored", "message": "Zoom webhook signature did not match."}

    event = payload.get("event")
    recording = payload.get("payload", {}).get("object") or {}
    if event in {"recording.completed", "recording.transcript_completed", "meeting.recording_completed"} and recording:
        workspace_id = ConnectionsService.workspace_for_connector_value(
            db,
            "zoom",
            "account_id",
            recording.get("account_id") or payload.get("payload", {}).get("account_id"),
        )
        imported = ZoomImportService.import_recording_payload(db, recording, workspace_id=workspace_id)
        return {"status": "processed", **imported}

    return {"status": "ignored", "message": f"Zoom event {event or 'unknown'} does not require import."}


@router.get("/{connector_key}", response_model=ConnectorStatus)
def get_connector(
    connector_key: ConnectorKey,
    db: Session = Depends(get_db),
    user: AppUser = Depends(current_user),
):
    return ConnectorStatus.model_validate(ConnectionsService.connector_status(db, connector_key, _workspace_id(db, user)))


@router.put("/{connector_key}", response_model=ConnectorUpdateResponse)
def update_connector(
    connector_key: ConnectorKey,
    payload: ConnectorUpdateRequest,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("connections:manage")),
):
    return ConnectorUpdateResponse.model_validate(
        ConnectionsService.update_connector(db, connector_key, payload, context.workspace_id)
    )
