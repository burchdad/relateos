import logging
from html import escape

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def _registration_code_html(name: str, code: str) -> str:
        safe_name = escape(name or "there")
        safe_code = escape(code)
        return f"""
        <div style="font-family: Arial, sans-serif; color: #1C3A2A; line-height: 1.5;">
          <h1 style="font-size: 22px;">Verify your Teifke / Relationships login</h1>
          <p>Hi {safe_name},</p>
          <p>Use this code to finish creating your account. It expires in 10 minutes.</p>
          <p style="display: inline-block; background: #F5EDDB; border: 1px solid #C8D9CF; color: #1C3A2A; font-size: 28px; letter-spacing: 6px; padding: 12px 16px; border-radius: 6px; font-weight: 700;">
            {safe_code}
          </p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
        """

    @staticmethod
    def _password_reset_html(name: str, reset_url: str) -> str:
        safe_name = escape(name or "there")
        safe_url = escape(reset_url, quote=True)
        return f"""
        <div style="font-family: Arial, sans-serif; color: #1C3A2A; line-height: 1.5;">
          <h1 style="font-size: 22px;">Reset your Teifke / Relationships password</h1>
          <p>Hi {safe_name},</p>
          <p>Use the button below to create a new password. This link expires soon for security.</p>
          <p>
            <a href="{safe_url}" style="display: inline-block; background: #E3B864; color: #1C3A2A; padding: 12px 16px; border-radius: 6px; text-decoration: none; font-weight: 700;">
              Reset password
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p><a href="{safe_url}">{safe_url}</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
        """

    @staticmethod
    def _team_invite_html(invited_by_name: str, workspace_name: str, role: str, invite_url: str) -> str:
        safe_inviter = escape(invited_by_name or "A teammate")
        safe_workspace = escape(workspace_name or "Teifke / Relationships")
        safe_role = escape(role.title())
        safe_url = escape(invite_url, quote=True)
        return f"""
        <div style="font-family: Arial, sans-serif; color: #1C3A2A; line-height: 1.5;">
          <h1 style="font-size: 22px;">Join {safe_workspace}</h1>
          <p>{safe_inviter} invited you to collaborate in Teifke / Relationships as <strong>{safe_role}</strong>.</p>
          <p>
            <a href="{safe_url}" style="display: inline-block; background: #E3B864; color: #1C3A2A; padding: 12px 16px; border-radius: 6px; text-decoration: none; font-weight: 700;">
              Accept invite
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p><a href="{safe_url}">{safe_url}</a></p>
          <p>If you were not expecting this invite, you can ignore this email.</p>
        </div>
        """

    @staticmethod
    def send_registration_code(*, to_email: str, name: str, code: str, idempotency_key: str) -> bool:
        if not settings.resend_api_key:
            logger.info("RESEND_API_KEY not set; registration verification code for %s: %s", to_email, code)
            return False

        payload = {
            "from": settings.auth_email_from,
            "to": [to_email],
            "subject": "Verify your Teifke / Relationships login",
            "html": EmailService._registration_code_html(name, code),
        }
        headers = {
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        }

        try:
            response = httpx.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            return True
        except Exception as exc:
            logger.warning("Registration verification email failed for %s: %s", to_email, exc)
            return False

    @staticmethod
    def send_password_reset(*, to_email: str, name: str, reset_url: str, idempotency_key: str) -> bool:
        if not settings.resend_api_key:
            logger.info("RESEND_API_KEY not set; password reset link for %s: %s", to_email, reset_url)
            return False

        payload = {
            "from": settings.auth_email_from,
            "to": [to_email],
            "subject": "Reset your Teifke / Relationships password",
            "html": EmailService._password_reset_html(name, reset_url),
        }
        headers = {
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        }

        try:
            response = httpx.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            return True
        except Exception as exc:
            logger.warning("Password reset email failed for %s: %s", to_email, exc)
            return False

    @staticmethod
    def send_team_invite(
        *,
        to_email: str,
        invited_by_name: str,
        workspace_name: str,
        role: str,
        invite_url: str,
        idempotency_key: str,
    ) -> bool:
        if not settings.resend_api_key:
            logger.warning("RESEND_API_KEY not set; team invite email was not sent for %s", to_email)
            return False

        payload = {
            "from": settings.auth_email_from,
            "to": [to_email],
            "subject": f"Join {workspace_name} in Teifke / Relationships",
            "html": EmailService._team_invite_html(invited_by_name, workspace_name, role, invite_url),
        }
        headers = {
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        }

        try:
            response = httpx.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            logger.info("Team invite email queued for %s via Resend", to_email)
            return True
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Team invite email rejected by Resend for %s: %s",
                to_email,
                exc.response.text,
            )
            return False
        except Exception as exc:
            logger.warning("Team invite email failed for %s: %s", to_email, exc)
            return False
