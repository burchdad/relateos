from __future__ import annotations

import re
from typing import Any
from uuid import UUID, uuid4

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.entities import Person
from app.services.connections_service import ConnectionsService


PEOPLE_URL = "https://people.googleapis.com/v1/people/me/connections"


def _clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _phone_key(value: str | None) -> str:
    return re.sub(r"\D+", "", value or "")


class GoogleContactsService:
    @staticmethod
    def sync_contacts(db: Session, *, workspace_id: UUID) -> dict[str, Any]:
        access_token = ConnectionsService.stored_connector_value(db, "google_calendar", "access_token", workspace_id)
        refresh_token = ConnectionsService.stored_connector_value(db, "google_calendar", "refresh_token", workspace_id)
        if not access_token and refresh_token:
            access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
        if not access_token:
            return {
                "status": "needs_config",
                "message": "Google is not connected for this workspace.",
                "errors": ["Reconnect Google Calendar and approve contacts access."],
            }

        errors: list[str] = []
        people: list[dict[str, Any]] = []
        page_token = ""
        try:
            while True:
                response = GoogleContactsService._fetch_people(access_token, page_token)
                if response.status_code == 401 and refresh_token:
                    access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
                    response = GoogleContactsService._fetch_people(access_token, page_token)
                response.raise_for_status()
                payload = response.json()
                people.extend(payload.get("connections") or [])
                page_token = payload.get("nextPageToken") or ""
                if not page_token:
                    break
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:300] if exc.response is not None else str(exc)
            return {
                "status": "partial",
                "message": "Google Contacts sync could not complete. Reconnect Google and approve People API contacts access.",
                "contacts_found": len(people),
                "errors": [detail],
            }
        except Exception as exc:
            return {
                "status": "partial",
                "message": "Google Contacts sync could not complete.",
                "contacts_found": len(people),
                "errors": [str(exc)],
            }

        created = 0
        updated = 0
        skipped = 0
        for person_payload in people:
            normalized = GoogleContactsService._normalize_person(person_payload)
            if not normalized["first_name"] and not normalized["last_name"] and not normalized["email"] and not normalized["phone"]:
                skipped += 1
                continue
            existing = GoogleContactsService._find_existing(db, workspace_id, normalized["email"], normalized["phone"])
            if existing:
                GoogleContactsService._update_existing(existing, normalized)
                updated += 1
            else:
                db.add(
                    Person(
                        id=uuid4(),
                        workspace_id=workspace_id,
                        first_name=normalized["first_name"] or "Unknown",
                        last_name=normalized["last_name"],
                        email=normalized["email"] or None,
                        phone=normalized["phone"] or None,
                        primary_role=normalized["title"] or None,
                        source="google_contacts",
                        notes_summary=normalized["notes"] or None,
                        tags={"labels": ["google_contacts"]},
                        metadata_json=normalized["metadata"],
                        data_quality_score=0.75,
                    )
                )
                created += 1
        db.commit()

        return {
            "status": "completed" if not errors else "partial",
            "message": f"Google Contacts sync completed. Created {created}, updated {updated}, skipped {skipped}.",
            "contacts_found": len(people),
            "contacts_created": created,
            "contacts_updated": updated,
            "contacts_skipped": skipped,
            "errors": errors,
        }

    @staticmethod
    def _fetch_people(access_token: str, page_token: str = "") -> httpx.Response:
        params = {
            "pageSize": "1000",
            "personFields": "names,emailAddresses,phoneNumbers,organizations,biographies,metadata",
        }
        if page_token:
            params["pageToken"] = page_token
        return httpx.get(
            PEOPLE_URL,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        )

    @staticmethod
    def _normalize_person(payload: dict[str, Any]) -> dict[str, Any]:
        names = payload.get("names") or []
        name = names[0] if names else {}
        emails = payload.get("emailAddresses") or []
        phones = payload.get("phoneNumbers") or []
        orgs = payload.get("organizations") or []
        bios = payload.get("biographies") or []
        org = orgs[0] if orgs else {}
        notes = _clean((bios[0] if bios else {}).get("value"))
        email = _clean((emails[0] if emails else {}).get("value")).lower()
        phone = _clean((phones[0] if phones else {}).get("value"))
        title = _clean(org.get("title"))
        company = _clean(org.get("name"))
        return {
            "first_name": (_clean(name.get("givenName")) or _clean(name.get("displayName")).split(" ", 1)[0])[:100],
            "last_name": (_clean(name.get("familyName")) or (_clean(name.get("displayName")).split(" ", 1)[1] if len(_clean(name.get("displayName")).split(" ", 1)) > 1 else ""))[:100],
            "display_name": _clean(name.get("displayName")),
            "email": email,
            "phone": phone[:50],
            "title": title[:50],
            "company": company,
            "notes": notes,
            "metadata": {
                "google_resource_name": payload.get("resourceName"),
                "google_etag": payload.get("etag"),
                "source": "google_people_api",
                "company": company,
            },
        }

    @staticmethod
    def _find_existing(db: Session, workspace_id: UUID, email: str, phone: str) -> Person | None:
        filters = []
        if email:
            filters.append(Person.email == email)
        phone_digits = _phone_key(phone)
        if phone_digits:
            for existing in (
                db.query(Person)
                .filter(Person.workspace_id == workspace_id, Person.phone.isnot(None))
                .all()
            ):
                if _phone_key(existing.phone) == phone_digits:
                    return existing
        if not filters:
            return None
        return db.query(Person).filter(Person.workspace_id == workspace_id, or_(*filters)).first()

    @staticmethod
    def _update_existing(person: Person, values: dict[str, Any]) -> None:
        if not person.email and values["email"]:
            person.email = values["email"]
        if not person.phone and values["phone"]:
            person.phone = values["phone"]
        if person.first_name == "Unknown" and values["first_name"]:
            person.first_name = values["first_name"]
        if not person.last_name and values["last_name"]:
            person.last_name = values["last_name"]
        if not person.primary_role and values["title"]:
            person.primary_role = values["title"]
        if not person.notes_summary and values["notes"]:
            person.notes_summary = values["notes"]
        person.source = person.source or "google_contacts"
        person.tags = {**(person.tags or {}), "labels": sorted(set([*(person.tags or {}).get("labels", []), "google_contacts"]))}
        person.metadata_json = {**(person.metadata_json or {}), **values["metadata"]}
