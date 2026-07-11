from __future__ import annotations

import base64
from email.message import EmailMessage
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.services.connections_service import ConnectionsService


class GoogleEmailService:
    @staticmethod
    def send_email_for_workspace(
        db: Session,
        *,
        workspace_id: UUID,
        to_email: str,
        subject: str,
        body: str,
    ) -> dict[str, Any]:
        access_token = ConnectionsService.stored_connector_value(db, "google_calendar", "access_token", workspace_id)
        refresh_token = ConnectionsService.stored_connector_value(db, "google_calendar", "refresh_token", workspace_id)

        if not access_token and refresh_token:
            access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
        if not access_token:
            raise ValueError("Connect Google before sending event invites from Gmail.")

        payload = GoogleEmailService._message_payload(to_email=to_email, subject=subject, body=body)
        response = GoogleEmailService._send_message(access_token, payload)
        if response.status_code == 401 and refresh_token:
            access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
            response = GoogleEmailService._send_message(access_token, payload)

        if response.status_code == 403:
            raise ValueError("Reconnect Google to approve Gmail send access before emailing event invites.")
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = GoogleEmailService._google_error_detail(response)
            raise ValueError(f"Google could not send the invite: {detail}") from exc
        return response.json()

    @staticmethod
    def _message_payload(*, to_email: str, subject: str, body: str) -> dict[str, str]:
        message = EmailMessage()
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(body)
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
        return {"raw": raw}

    @staticmethod
    def _send_message(access_token: str, payload: dict[str, str]) -> httpx.Response:
        return httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )

    @staticmethod
    def _google_error_detail(response: httpx.Response) -> str:
        try:
            payload = response.json()
            return str(payload.get("error", {}).get("message") or payload.get("error") or response.text)
        except ValueError:
            return response.text or f"HTTP {response.status_code}"
