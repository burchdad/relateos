"""Delete test/business data while preserving auth and connector setup.

Run from the backend directory with DATABASE_URL set:
    python scripts/cleanup_data.py --confirm DELETE_APP_DATA

Add --include-auth to also remove users, workspaces, connector credentials,
password reset tokens, and system settings.
"""

from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import create_engine, text


PRESERVE_AUTH_TABLES = [
    "recording_artifacts",
    "meeting_attendees",
    "meetings",
    "engagement_events",
    "funnel_campaigns",
    "content_assets",
    "relationship_edges",
    "deal_participants",
    "deals",
    "content_relationship_targets",
    "content_insights",
    "content_items",
    "relationship_signals",
    "ai_insights",
    "opportunities",
    "interactions",
    "relationships",
    "people",
    "organizations",
    "events",
    "user_style_profiles",
]

AUTH_AND_SYSTEM_TABLES = [
    "password_reset_tokens",
    "connector_credentials",
    "app_users",
    "workspaces",
    "system_settings",
]


def normalize_database_url(raw_url: str) -> str:
    url = raw_url.strip().strip('"').strip("'")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    return url


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean RelateOS application data.")
    parser.add_argument("--confirm", required=True, help="Must be DELETE_APP_DATA.")
    parser.add_argument(
        "--include-auth",
        action="store_true",
        help="Also delete login users, workspaces, connector credentials, password reset tokens, and system settings.",
    )
    args = parser.parse_args()

    if args.confirm != "DELETE_APP_DATA":
        print("Refusing cleanup: --confirm must equal DELETE_APP_DATA.", file=sys.stderr)
        return 2

    database_url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_PUBLIC_URL")
    if not database_url:
        print("Refusing cleanup: DATABASE_URL or DATABASE_PUBLIC_URL is not set.", file=sys.stderr)
        return 2

    tables = list(PRESERVE_AUTH_TABLES)
    if args.include_auth:
        tables.extend(AUTH_AND_SYSTEM_TABLES)

    engine = create_engine(normalize_database_url(database_url), pool_pre_ping=True)
    with engine.begin() as connection:
        existing = {
            row[0]
            for row in connection.execute(
                text(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    """
                )
            )
        }
        selected = [table for table in tables if table in existing]
        if not selected:
            print("No matching RelateOS data tables found.")
            return 0
        selected_sql = ", ".join(f'"{table}"' for table in selected)
        connection.execute(text(f"TRUNCATE TABLE {selected_sql} RESTART IDENTITY CASCADE"))

    print("Cleaned tables:")
    for table in selected:
        print(f"- {table}")
    if not args.include_auth:
        print("Preserved auth, workspaces, connector credentials, and system settings.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
