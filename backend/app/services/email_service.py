import logging
from html import escape

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)


class EmailService:
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
