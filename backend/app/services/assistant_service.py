import json
import re

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import WorkspaceContext
from app.models import Person
from app.schemas.ai import AssistantRequest
from app.schemas.contact import ContactCreate
from app.schemas.outbox import OutboxMessageCreate
from app.schemas.task import FollowUpTaskCreate
from app.services.contact_service import ContactService
from app.services.outbox_service import OutboxService
from app.services.task_service import TaskService


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
