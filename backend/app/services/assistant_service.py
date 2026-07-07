import json
import re

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import WorkspaceContext
from app.models import AssistantActionLog, Person
from app.schemas.ai import AssistantRequest
from app.schemas.contact import ContactCreate
from app.schemas.content import ContentCreate
from app.schemas.event import EventCreate
from app.schemas.outbox import OutboxMessageCreate
from app.schemas.task import FollowUpTaskCreate
from app.services.connections_service import ConnectionsService
from app.services.contact_service import ContactService
from app.services.content_service import ContentService
from app.services.deal_service import DealService
from app.services.event_service import EventService
from app.services.outbox_service import OutboxService
from app.services.task_service import TaskService
from app.services.team_service import TeamService
from app.services.zoom_import_service import ZoomImportService


PAGE_ROUTES = {
    "dashboard": "/dashboard",
    "contacts": "/contacts",
    "contact": "/contacts",
    "content": "/content",
    "events": "/events",
    "deals": "/deals",
    "partners": "/partners",
    "network": "/network/graph",
    "graph": "/network/graph",
    "scoreboard": "/scoreboard",
    "meetings": "/meetings",
    "imports": "/imports",
    "tasks": "/tasks",
    "task": "/tasks",
    "connections": "/connections",
    "settings": "/settings",
}

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
URL_RE = re.compile(r"https?://[^\s]+", re.IGNORECASE)
CONFIRMATION_PREFIXES = ("confirm ", "yes confirm ", "go ahead ")


def _name_from_contact(contact: Person) -> str:
    name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
    return name or contact.email or "Unknown contact"


def _extract_name_and_email(text: str) -> tuple[str | None, str | None]:
    email_match = EMAIL_RE.search(text)
    email = email_match.group(0).lower() if email_match else None
    without_email = EMAIL_RE.sub("", text)
    match = re.search(r"(?:contact|person|lead|client)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})", without_email)
    if not match:
        match = re.search(r"(?:add|create)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})", without_email)
    return (match.group(1).strip() if match else None), email


def _split_name(name: str | None) -> tuple[str, str]:
    if not name:
        return "Unknown", ""
    parts = name.strip().split(" ", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


class AssistantService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def handle(self, db: Session, *, payload: AssistantRequest, context: WorkspaceContext) -> dict:
        message = payload.message.strip()
        if not message:
            return {"reply": "Tell me what you want done.", "actions": [], "navigate_to": None}

        confirmed = self._handle_confirmation(db, message=message, context=context)
        if confirmed:
            return confirmed

        deterministic = self._handle_deterministic(db, message=message, context=context)
        if deterministic:
            return deterministic

        plan = self._plan_with_ai(message, payload.history)
        if plan:
            handled = self._execute_plan(db, plan=plan, context=context, original_message=message)
            if handled:
                return handled

        return self._answer_from_context(db, message=message, context=context)

    def _handle_deterministic(self, db: Session, *, message: str, context: WorkspaceContext) -> dict | None:
        lowered = message.lower()
        for key, href in PAGE_ROUTES.items():
            if re.search(rf"\b(open|go to|show|take me to)\s+(the\s+)?{re.escape(key)}\b", lowered):
                return {
                    "reply": f"Opening {key}.",
                    "actions": [{"type": "navigate", "label": f"Open {key}", "href": href, "metadata": {}}],
                    "navigate_to": href,
                }

        if ("add" in lowered or "create" in lowered) and any(word in lowered for word in ["contact", "lead", "person", "client"]):
            if not context.has("contacts:write"):
                return {"reply": "You do not have permission to create contacts.", "actions": [], "navigate_to": None}
            name, email = _extract_name_and_email(message)
            if not name and not email:
                return {
                    "reply": "I can create that contact. Tell me the name, and email if you have it.",
                    "actions": [],
                    "navigate_to": None,
                }
            first_name, last_name = _split_name(name)
            contact = ContactService.create(
                db,
                ContactCreate(
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    source="assistant",
                    relationship_stage="new",
                    notes_summary=message,
                ),
                workspace_id=context.workspace_id,
            )
            self._log_action(db, context=context, action_type="create_contact", status="completed", prompt=message, target_type="person", target_id=contact.id)
            return {
                "reply": f"Created contact for {_name_from_contact(contact)}.",
                "actions": [
                    {
                        "type": "create_contact",
                        "label": f"Created {_name_from_contact(contact)}",
                        "href": f"/contacts?contact_id={contact.id}",
                        "metadata": {"contact_id": str(contact.id)},
                    }
                ],
                "navigate_to": f"/contacts?contact_id={contact.id}",
            }

        if any(word in lowered for word in ["find", "search", "look up", "show"]) and any(word in lowered for word in ["contact", "person", "lead", "client"]):
            term = re.sub(r"\b(find|search|look up|show|contact|person|lead|client|for)\b", " ", lowered).strip()
            term = " ".join(term.split())
            if not term:
                return None
            contacts = ContactService.list_all(db, workspace_id=context.workspace_id, search=term, limit=5)
            if not contacts:
                return {"reply": f"I could not find a contact matching '{term}'.", "actions": [], "navigate_to": None}
            lines = ", ".join(_name_from_contact(contact) for contact in contacts[:3])
            return {
                "reply": f"I found {len(contacts)} matching contact{'s' if len(contacts) != 1 else ''}: {lines}.",
                "actions": [
                    {
                        "type": "search_contacts",
                        "label": "Open contact results",
                        "href": f"/contacts?search={term}",
                        "metadata": {"search": term},
                    }
                ],
                "navigate_to": f"/contacts?search={term}",
            }

        if ("task" in lowered or "remind" in lowered or "follow up" in lowered) and any(word in lowered for word in ["create", "add", "remind", "make"]):
            return self._create_task_from_text(db, message=message, context=context)

        if any(word in lowered for word in ["delete", "remove", "bulk", "send all", "email all", "sync "]):
            proposal = self._proposal_for_sensitive_action(message)
            if proposal:
                return proposal

        if any(word in lowered for word in ["connector", "connection", "connected", "zoom", "calendar", "read.ai", "skool"]):
            if any(word in lowered for word in ["status", "health", "ready", "connected", "check"]):
                return self._connector_status(db, context=context)
            if "sync zoom ai" in lowered or "sync ai notes" in lowered or "ai companion" in lowered:
                return self._propose_confirmation(
                    "Zoom AI notes sync can import meeting summaries into this workspace.",
                    "confirm sync zoom ai notes",
                    action_type="sync_zoom_ai_notes",
                )
            if "sync zoom" in lowered:
                return self._propose_confirmation(
                    "Zoom recording sync can import recordings, attendees, transcripts, and related artifacts into this workspace.",
                    "confirm sync zoom recordings",
                    action_type="sync_zoom_recordings",
                )

        if any(word in lowered for word in ["invite", "add teammate", "team member"]) and EMAIL_RE.search(message):
            return self._invite_team_member(db, message=message, context=context)

        if ("event" in lowered or "webinar" in lowered or "session" in lowered) and any(word in lowered for word in ["create", "add", "schedule"]):
            return self._create_event_from_text(db, message=message, context=context)

        if "deal" in lowered and any(word in lowered for word in ["create", "add", "log"]):
            return self._create_deal_from_text(db, message=message, context=context)

        if any(word in lowered for word in ["content", "link", "resource", "recording", "transcript"]) and any(word in lowered for word in ["add", "create", "save"]):
            return self._create_content_from_text(db, message=message, context=context)

        return None

    def _log_action(
        self,
        db: Session,
        *,
        context: WorkspaceContext,
        action_type: str,
        status: str,
        prompt: str | None = None,
        target_type: str | None = None,
        target_id=None,
        metadata: dict | None = None,
    ) -> None:
        db.add(
            AssistantActionLog(
                workspace_id=context.workspace_id,
                user_id=context.user.id,
                action_type=action_type,
                status=status,
                prompt=prompt,
                target_type=target_type,
                target_id=target_id,
                metadata_json=metadata or {},
            )
        )
        db.commit()

    def _propose_confirmation(self, reply: str, confirm_command: str, *, action_type: str) -> dict:
        return {
            "reply": f"{reply} Confirm before I run it.",
            "actions": [
                {
                    "type": action_type,
                    "label": "Confirm",
                    "status": "needs_confirmation",
                    "href": None,
                    "metadata": {"confirm_command": confirm_command},
                }
            ],
            "navigate_to": None,
        }

    def _proposal_for_sensitive_action(self, message: str) -> dict | None:
        lowered = message.lower()
        if "sync zoom ai" in lowered or "sync ai notes" in lowered or "ai companion" in lowered:
            return self._propose_confirmation("Zoom AI notes sync can import summaries and action items.", "confirm sync zoom ai notes", action_type="sync_zoom_ai_notes")
        if "sync zoom" in lowered:
            return self._propose_confirmation("Zoom recording sync can import recording and attendee data.", "confirm sync zoom recordings", action_type="sync_zoom_recordings")
        if "delete" in lowered or "remove" in lowered:
            return self._propose_confirmation("That changes or removes data and needs a manual review path.", "open settings", action_type="destructive_review")
        if "send all" in lowered or "email all" in lowered or "bulk" in lowered:
            return self._propose_confirmation("Bulk send actions need review before anything leaves the workspace.", "open tasks", action_type="bulk_send_review")
        return None

    def _handle_confirmation(self, db: Session, *, message: str, context: WorkspaceContext) -> dict | None:
        lowered = message.lower().strip()
        if not lowered.startswith(CONFIRMATION_PREFIXES):
            return None
        if "sync zoom ai" in lowered or "sync ai notes" in lowered or "ai companion" in lowered:
            if not context.has("automation:run"):
                return {"reply": "You do not have permission to run automation syncs.", "actions": [], "navigate_to": None}
            imported = ZoomImportService.import_ai_companion_summaries(db, workspace_id=context.workspace_id)
            self._log_action(db, context=context, action_type="sync_zoom_ai_notes", status=imported.get("status", "completed"), prompt=message, metadata=imported)
            return {
                "reply": f"Zoom AI notes sync {imported.get('status', 'completed')}. AI notes found: {imported.get('ai_notes_found', 0)}.",
                "actions": [{"type": "sync_zoom_ai_notes", "label": "Open Connections", "href": "/connections", "metadata": imported}],
                "navigate_to": "/connections",
            }
        if "sync zoom" in lowered:
            if not context.has("automation:run"):
                return {"reply": "You do not have permission to run automation syncs.", "actions": [], "navigate_to": None}
            imported = ZoomImportService.import_recent_recordings(db, workspace_id=context.workspace_id)
            self._log_action(db, context=context, action_type="sync_zoom_recordings", status=imported.get("status", "completed"), prompt=message, metadata=imported)
            return {
                "reply": f"Zoom sync {imported.get('status', 'completed')}. Recordings found: {imported.get('recordings_found', 0)}.",
                "actions": [{"type": "sync_zoom_recordings", "label": "Open Connections", "href": "/connections", "metadata": imported}],
                "navigate_to": "/connections",
            }
        if "open settings" in lowered:
            return {"reply": "Opening settings.", "actions": [{"type": "navigate", "label": "Open settings", "href": "/settings", "metadata": {}}], "navigate_to": "/settings"}
        if "open tasks" in lowered:
            return {"reply": "Opening tasks.", "actions": [{"type": "navigate", "label": "Open tasks", "href": "/tasks", "metadata": {}}], "navigate_to": "/tasks"}
        if "open deals" in lowered:
            return {"reply": "Opening deals.", "actions": [{"type": "navigate", "label": "Open deals", "href": "/deals", "metadata": {}}], "navigate_to": "/deals"}
        return None

    def _create_task_from_text(self, db: Session, *, message: str, context: WorkspaceContext) -> dict:
        if not context.has("tasks:write"):
            return {"reply": "You do not have permission to create tasks.", "actions": [], "navigate_to": None}
        contacts = ContactService.list_all(db, workspace_id=context.workspace_id, limit=500)
        matched_contact = None
        lowered = message.lower()
        for contact in contacts:
            name = _name_from_contact(contact).lower()
            if name and name != "unknown contact" and name in lowered:
                matched_contact = contact
                break
            if contact.email and contact.email.lower() in lowered:
                matched_contact = contact
                break

        cleaned = re.sub(r"^(create|add|make)\s+(a\s+)?(task|reminder)\s+(to\s+)?", "", message, flags=re.IGNORECASE).strip()
        title = cleaned[:120] or "Follow up"
        task = TaskService.create_task(
            db,
            payload=FollowUpTaskCreate(
                title=title,
                contact_id=matched_contact.id if matched_contact else None,
                relationship_id=getattr(matched_contact, "relationship_id", None) if matched_contact else None,
                description=message,
                suggested_message=None,
                task_type="follow_up",
                priority="normal",
                metadata_json={"source": "assistant", "created_from": message},
            ),
            workspace_id=context.workspace_id,
            user=context.user,
        )
        self._log_action(db, context=context, action_type="create_task", status="completed", prompt=message, target_type="follow_up_task", target_id=task["id"])
        return {
            "reply": f"Created task: {task['title']}.",
            "actions": [
                {
                    "type": "create_task",
                    "label": f"Created task: {task['title']}",
                    "href": "/tasks",
                    "metadata": {"task_id": str(task["id"])},
                }
            ],
            "navigate_to": "/tasks",
        }

    def _invite_team_member(self, db: Session, *, message: str, context: WorkspaceContext) -> dict:
        if not context.has("members:invite"):
            return {"reply": "You do not have permission to invite team members.", "actions": [], "navigate_to": None}
        email_match = EMAIL_RE.search(message)
        if not email_match:
            return {"reply": "Who should I invite?", "actions": [], "navigate_to": None}
        role_match = re.search(r"\b(owner|admin|member|viewer)\b", message, re.IGNORECASE)
        role = role_match.group(1).lower() if role_match else "member"
        try:
            invite = TeamService.create_invite(
                db,
                workspace_id=context.workspace_id,
                invited_by=context.user,
                email=email_match.group(0),
                role=role,
            )
            self._log_action(db, context=context, action_type="team_invite", status="completed", prompt=message, target_type="workspace_invite", target_id=invite.id, metadata={"email": invite.invited_email, "role": invite.role})
        except ValueError as exc:
            return {"reply": str(exc), "actions": [], "navigate_to": "/settings"}
        return {
            "reply": f"Invited {invite.invited_email} as {invite.role}.",
            "actions": [{"type": "team_invite", "label": "Open Settings", "href": "/settings", "metadata": {"invite_id": str(invite.id)}}],
            "navigate_to": "/settings",
        }

    def _create_event_from_text(self, db: Session, *, message: str, context: WorkspaceContext) -> dict:
        if not context.has("events:write"):
            return {"reply": "You do not have permission to create events.", "actions": [], "navigate_to": None}
        url_match = URL_RE.search(message)
        time_match = re.search(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)\b", message)
        title_match = re.search(r"(?:event|webinar|session)\s+(?:called|named|for)?\s*([^,.;]+)", message, re.IGNORECASE)
        title = (title_match.group(1).strip() if title_match else message.strip())[:80]
        if not title or not url_match or not time_match:
            return {
                "reply": "I can create the event. I need a title, link, and time.",
                "actions": [{"type": "navigate", "label": "Open Events", "href": "/events", "metadata": {}}],
                "navigate_to": "/events",
            }
        lowered = message.lower()
        event_type = "weekly" if "weekly" in lowered or "every week" in lowered else "monthly" if "monthly" in lowered else "one-time"
        day_map = {"sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6}
        day_of_week = next((day for name, day in day_map.items() if name in lowered), None)
        event = EventService.create_event(
            db,
            EventCreate(
                title=title,
                description=message,
                event_type=event_type,
                event_url=url_match.group(0),
                day_of_week=day_of_week,
                time_of_day=time_match.group(1),
            ),
            workspace_id=context.workspace_id,
        )
        self._log_action(db, context=context, action_type="create_event", status="completed", prompt=message, target_type="event", target_id=event.id)
        return {
            "reply": f"Created event: {event.title}.",
            "actions": [{"type": "create_event", "label": "Open Events", "href": "/events", "metadata": {"event_id": str(event.id)}}],
            "navigate_to": "/events",
        }

    def _create_deal_from_text(self, db: Session, *, message: str, context: WorkspaceContext) -> dict:
        if not context.has("deals:write"):
            return {"reply": "You do not have permission to create deals.", "actions": [], "navigate_to": None}
        parsed = DealService.parse_natural_language(message)
        deal_payload = parsed.parsed
        if parsed.needs_confirmation:
            return self._propose_confirmation(
                f"I parsed this as '{deal_payload.title}' for ${deal_payload.amount:,.0f}, but it needs review.",
                "open deals",
                action_type="deal_review",
            )
        deal = DealService.create(db, deal_payload, workspace_id=context.workspace_id)
        self._log_action(db, context=context, action_type="create_deal", status="completed", prompt=message, target_type="deal", target_id=deal.id, metadata={"amount": deal.amount, "status": deal.status})
        return {
            "reply": f"Logged deal: {deal.title}.",
            "actions": [{"type": "create_deal", "label": "Open Deals", "href": "/deals", "metadata": {"deal_id": str(deal.id)}}],
            "navigate_to": "/deals",
        }

    def _create_content_from_text(self, db: Session, *, message: str, context: WorkspaceContext) -> dict:
        if not context.has("content:write"):
            return {"reply": "You do not have permission to create content.", "actions": [], "navigate_to": None}
        url_match = URL_RE.search(message)
        if not url_match:
            return {
                "reply": "I can save that content. Send me the URL or upload it from Content.",
                "actions": [{"type": "navigate", "label": "Open Content", "href": "/content", "metadata": {}}],
                "navigate_to": "/content",
            }
        url = url_match.group(0)
        lowered = url.lower()
        source_type = "youtube" if "youtube." in lowered or "youtu.be" in lowered else "zoom" if "zoom." in lowered else "skool" if "skool." in lowered else "website"
        title_match = re.search(r"(?:called|titled|named)\s+([^,.;]+)", message, re.IGNORECASE)
        title = (title_match.group(1).strip() if title_match else "Saved content")[:120]
        item = ContentService.create_content_item(
            db,
            ContentCreate(
                title=title,
                description=message,
                source_type=source_type,
                source_url=url,
                owner_user_id=str(context.user.id),
            ),
            workspace_id=context.workspace_id,
        )
        self._log_action(db, context=context, action_type="create_content", status="completed", prompt=message, target_type="content_item", target_id=item.id, metadata={"source_type": source_type})
        return {
            "reply": f"Saved content: {item.title}.",
            "actions": [{"type": "create_content", "label": "Open Content", "href": "/content", "metadata": {"content_id": str(item.id)}}],
            "navigate_to": "/content",
        }

    def _connector_status(self, db: Session, *, context: WorkspaceContext) -> dict:
        if not context.has("workspace:read"):
            return {"reply": "You do not have permission to view connector status.", "actions": [], "navigate_to": None}
        overview = ConnectionsService.overview(db, context.workspace_id)
        ready = [connector["name"] for connector in overview.get("connectors", []) if connector.get("status") == "ready"]
        missing = [connector["name"] for connector in overview.get("connectors", []) if connector.get("status") != "ready"]
        reply = f"Ready connectors: {len(ready)}. Needs config: {', '.join(missing) if missing else 'none'}."
        return {
            "reply": reply,
            "actions": [{"type": "connector_status", "label": "Open Connections", "href": "/connections", "metadata": {"ready": ready, "missing": missing}}],
            "navigate_to": "/connections",
        }

    def _plan_with_ai(self, message: str, history: list) -> dict | None:
        if not self.client:
            return None
        try:
            response = self.client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.1,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You classify RelateOS user commands into JSON only. "
                            "Allowed intents: navigate, create_task, create_contact, draft_email, answer. "
                            "Also classify requests for events, deals, content, connector status, team invites, or syncs as answer if uncertain. "
                            "Return keys: intent, page, title, name, email, subject, body, search, reply. "
                            "Do not invent missing emails."
                        ),
                    },
                    *[
                        {"role": item.role if item.role in {"user", "assistant"} else "user", "content": item.content}
                        for item in history[-6:]
                    ],
                    {"role": "user", "content": message},
                ],
            )
            raw = response.choices[0].message.content or "{}"
            return json.loads(raw)
        except Exception:
            return None

    def _execute_plan(self, db: Session, *, plan: dict, context: WorkspaceContext, original_message: str) -> dict | None:
        intent = str(plan.get("intent") or "").strip().lower()
        if intent == "navigate":
            page = str(plan.get("page") or "").strip().lower()
            href = PAGE_ROUTES.get(page)
            if href:
                return {
                    "reply": plan.get("reply") or f"Opening {page}.",
                    "actions": [{"type": "navigate", "label": f"Open {page}", "href": href, "metadata": {}}],
                    "navigate_to": href,
                }
        if intent == "create_task":
            return self._create_task_from_text(db, message=plan.get("title") or original_message, context=context)
        if intent == "create_contact" and context.has("contacts:write"):
            first_name, last_name = _split_name(plan.get("name"))
            contact = ContactService.create(
                db,
                ContactCreate(
                    first_name=first_name,
                    last_name=last_name,
                    email=plan.get("email"),
                    source="assistant",
                    notes_summary=original_message,
                ),
                workspace_id=context.workspace_id,
            )
            self._log_action(db, context=context, action_type="create_contact", status="completed", prompt=original_message, target_type="person", target_id=contact.id)
            return {
                "reply": f"Created contact for {_name_from_contact(contact)}.",
                "actions": [{"type": "create_contact", "label": f"Created {_name_from_contact(contact)}", "href": f"/contacts?contact_id={contact.id}", "metadata": {"contact_id": str(contact.id)}}],
                "navigate_to": f"/contacts?contact_id={contact.id}",
            }
        if intent == "draft_email":
            return self._draft_email_from_plan(db, plan=plan, context=context)
        return None

    def _draft_email_from_plan(self, db: Session, *, plan: dict, context: WorkspaceContext) -> dict | None:
        if not context.has("tasks:write"):
            return {"reply": "You do not have permission to draft outbound messages.", "actions": [], "navigate_to": None}
        search = str(plan.get("name") or plan.get("email") or "").strip()
        if not search:
            return {"reply": "Who should I draft that email to?", "actions": [], "navigate_to": None}
        contacts = ContactService.list_all(db, workspace_id=context.workspace_id, search=search, limit=1)
        if not contacts:
            return {"reply": f"I could not find a contact matching {search}.", "actions": [], "navigate_to": None}
        contact = contacts[0]
        try:
            message = OutboxService.create_message(
                db,
                payload=OutboxMessageCreate(
                    contact_id=contact.id,
                    relationship_id=getattr(contact, "relationship_id", None),
                    to_email=contact.email,
                    to_name=_name_from_contact(contact),
                    subject=plan.get("subject") or "Following up",
                    body=plan.get("body") or "Wanted to follow up with you.",
                    status="draft",
                    metadata_json={"source": "assistant"},
                ),
                workspace_id=context.workspace_id,
                user=context.user,
            )
        except ValueError as exc:
            return {"reply": str(exc), "actions": [], "navigate_to": f"/contacts?contact_id={contact.id}"}
        self._log_action(db, context=context, action_type="draft_email", status="completed", prompt=str(plan), target_type="outbox_message", target_id=message["id"])
        return {
            "reply": f"Drafted an email to {_name_from_contact(contact)}.",
            "actions": [{"type": "draft_email", "label": f"Drafted email: {message['subject']}", "href": "/tasks", "metadata": {"outbox_message_id": str(message["id"])}}],
            "navigate_to": "/tasks",
        }

    def _answer_from_context(self, db: Session, *, message: str, context: WorkspaceContext) -> dict:
        open_tasks = TaskService.list_tasks(db, workspace_id=context.workspace_id, status="open", limit=5)
        top_contacts = ContactService.list_all(db, workspace_id=context.workspace_id, limit=5)
        if self.client:
            try:
                response = self.client.chat.completions.create(
                    model=settings.openai_model,
                    temperature=0.3,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are Teifke AI inside RelateOS. Be concise and action-oriented. "
                                "You can help navigate, create contacts, create tasks, search contacts, draft emails, and explain next steps. "
                                "If asked to perform unsupported destructive or billing/admin work, say what page to use."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"User question: {message}\n"
                                f"Open tasks: {[task['title'] for task in open_tasks]}\n"
                                f"Recent contacts: {[_name_from_contact(contact) for contact in top_contacts]}"
                            ),
                        },
                    ],
                )
                reply = (response.choices[0].message.content or "").strip()
                if reply:
                    return {"reply": reply, "actions": [], "navigate_to": None}
            except Exception:
                pass
        return {
            "reply": (
                "I can help with contacts, tasks, follow-up drafts, navigation, and relationship next steps. "
                "Try: 'create a task to follow up with Avery' or 'open contacts'."
            ),
            "actions": [],
            "navigate_to": None,
        }
