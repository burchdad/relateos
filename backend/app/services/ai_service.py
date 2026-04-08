from datetime import datetime, timezone

from sqlalchemy.orm import Session

from openai import OpenAI

from app.core.config import settings
from app.models import AIInsight, Interaction, Opportunity, Relationship, RelationshipSignal
from app.services.style_profile_service import DEFAULT_STYLE, get_style_profile


RELATIONSHIP_TYPE_MESSAGE_PLAYBOOK = {
    "investor": {
        "intent": "validate buying criteria and surface near-term deal readiness",
        "angle": "lead with market or asset specifics and ask for current buy box",
        "cta": "ask for a quick yes/no on current acquisition focus",
    },
    "lead": {
        "intent": "advance qualification and remove decision friction",
        "angle": "reference their current goal and offer one concrete next step",
        "cta": "ask for a short call or one specific scheduling window",
    },
    "agent": {
        "intent": "keep referral momentum active with fast exchange of opportunities",
        "angle": "share matching demand signals and ask for active inventory intel",
        "cta": "request 1-2 relevant opportunities to review this week",
    },
    "partner": {
        "intent": "align priorities and keep shared pipeline moving",
        "angle": "anchor on shared outcomes and one decision point",
        "cta": "propose a tight sync to confirm ownership and timing",
    },
}

CURRENT_STATUS_MESSAGE_PLAYBOOK = {
    "hot": {
        "tone": "high-conviction and fast-moving",
        "urgency": "same-day or next-day follow-up",
        "cta": "offer immediate options and ask for a direct yes/no",
    },
    "active": {
        "tone": "confident and practical",
        "urgency": "follow-up this week",
        "cta": "offer one concrete next step and confirm timing",
    },
    "cold": {
        "tone": "low-pressure and re-engaging",
        "urgency": "light touchpoint to test intent",
        "cta": "ask a simple re-qualification question",
    },
    "past_deal": {
        "tone": "relationship-first and referral-aware",
        "urgency": "reopen timing with a soft touch",
        "cta": "ask what changed since the last deal and suggest one way to help",
    },
}


class AIService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def _style_instructions(self, style_profile: dict) -> str:
        return (
            "Style profile:\n"
            f"- Tone: {style_profile['tone']}\n"
            f"- Length: {style_profile['length']}\n"
            f"- Energy: {style_profile['energy']}\n"
            f"- Emoji usage: {style_profile['emoji_usage']}"
        )

    def _latest_summary(self, db: Session, relationship_id) -> str | None:
        item = (
            db.query(AIInsight)
            .filter(AIInsight.relationship_id == relationship_id, AIInsight.type == "summary")
            .order_by(AIInsight.created_at.desc())
            .first()
        )
        return item.content if item else None

    def _message_playbook(self, relationship_type: str) -> dict:
        relationship_key = (relationship_type or "").strip().lower()
        return RELATIONSHIP_TYPE_MESSAGE_PLAYBOOK.get(
            relationship_key,
            {
                "intent": "maintain relationship momentum",
                "angle": "reference one concrete context detail",
                "cta": "ask for a clear next step this week",
            },
        )

    def _status_message_playbook(self, current_status: str) -> dict:
        status_key = (current_status or "").strip().lower()
        return CURRENT_STATUS_MESSAGE_PLAYBOOK.get(
            status_key,
            {
                "tone": "clear and human",
                "urgency": "timely follow-up",
                "cta": "ask for one next step",
            },
        )

    def _days_since_last_contact(self, rel: Relationship) -> int | None:
        if rel.last_contacted_at is None:
            return None
        now = datetime.now(timezone.utc)
        last_contact = rel.last_contacted_at
        if last_contact.tzinfo is None:
            last_contact = last_contact.replace(tzinfo=timezone.utc)
        return max(0, int((now - last_contact.astimezone(timezone.utc)).total_seconds() // 86400))

    def _message_prompt_rules(self, relationship_type: str, current_status: str, days_since: int | None) -> str:
        playbook = self._message_playbook(relationship_type)
        status_playbook = self._status_message_playbook(current_status)
        recency_guidance = "No recency pressure."
        if days_since is None:
            recency_guidance = "No recent touchpoint logged. Open with a context-reset check-in."
        elif days_since >= 14:
            recency_guidance = f"Contact gap is {days_since} days. Lead with urgency and re-qualification."
        return (
            "Message strategy by relationship type:\n"
            f"- Primary intent: {playbook['intent']}\n"
            f"- Angle: {playbook['angle']}\n"
            f"- CTA style: {playbook['cta']}\n"
            "Status-based adjustment:\n"
            f"- Tone: {status_playbook['tone']}\n"
            f"- Urgency: {status_playbook['urgency']}\n"
            f"- CTA refinement: {status_playbook['cta']}\n"
            f"- Recency guidance: {recency_guidance}"
        )

    def _memory_context(self, db: Session, relationship_id, style_override: dict | None = None) -> str:
        rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
        if not rel:
            return "Relationship not found"

        interactions = (
            db.query(Interaction)
            .filter(Interaction.relationship_id == relationship_id)
            .order_by(Interaction.created_at.desc())
            .limit(5)
            .all()
        )
        opps = db.query(Opportunity).filter(Opportunity.relationship_id == relationship_id).all()
        signals = (
            db.query(RelationshipSignal)
            .filter(RelationshipSignal.relationship_id == relationship_id)
            .order_by(RelationshipSignal.detected_at.desc())
            .all()
        )
        style_profile = get_style_profile(db, rel.owner_user_id)
        if style_override:
            style_profile = {**style_profile, **style_override}
        else:
            style_profile = {**DEFAULT_STYLE, **style_profile}

        summary = self._latest_summary(db, relationship_id)

        person_metadata = rel.person.metadata_json if rel.person else {}
        interests = person_metadata.get("interests") or "their stated priorities"
        current_status = person_metadata.get("current_status") or rel.lifecycle_stage or "active"

        context_lines = [
            f"Person name: {rel.person.first_name} {rel.person.last_name}",
            f"Relationship type: {rel.type}",
            f"Lifecycle stage: {rel.lifecycle_stage}",
            f"Current status: {current_status}",
            f"Interests: {interests}",
            f"Priority score: {rel.priority_score}",
            f"Owner user id: {rel.owner_user_id or 'unknown'}",
        ]
        context_lines.append(f"Last summary: {summary or 'No summary yet.'}")
        context_lines.append("Recent interactions:")
        context_lines += [f"- [{i.type}] {i.content}" for i in interactions]
        context_lines.append("Opportunities:")
        context_lines += [f"- {o.title}: {o.value_estimate} ({o.status})" for o in opps]
        context_lines.append("Current signals:")
        context_lines += [f"- {s.signal_key}: {s.reason}" for s in signals]
        context_lines.append(self._style_instructions(style_profile))
        return "\n".join(context_lines)

    def _fallback(self, db: Session, relationship_id, insight_type: str, goal: str | None = None) -> str:
        rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
        if not rel:
            return "Relationship context unavailable."

        name = f"{rel.person.first_name} {rel.person.last_name}" if rel.person else "this contact"
        metadata = rel.person.metadata_json if rel.person else {}
        interests = metadata.get("interests") or "their current priorities"
        status = (metadata.get("current_status") or rel.lifecycle_stage or "active").replace("_", " ")

        now = datetime.now(timezone.utc)
        if rel.last_contacted_at is None:
            days_since = None
        else:
            last_contact = rel.last_contacted_at
            if last_contact.tzinfo is None:
                last_contact = last_contact.replace(tzinfo=timezone.utc)
            days_since = max(0, int((now - last_contact.astimezone(timezone.utc)).total_seconds() // 86400))

        timing_phrase = "No recent touchpoint is logged."
        if days_since is not None:
            timing_phrase = "Last contact was today." if days_since == 0 else f"Last contact was {days_since} days ago."

        if insight_type == "summary":
            return (
                f"Who: {name} is a {rel.type} relationship in your active network.\n"
                f"What they want: They are focused on {interests}.\n"
                f"Current status: {status.title()}. {timing_phrase}\n"
                "Why they matter financially: Timely follow-through can create deal flow and referral upside."
            )
        if insight_type == "suggestion":
            first_name = rel.person.first_name if rel.person else "there"
            relationship_type = (rel.type or "").lower()
            status_key = (metadata.get("current_status") or rel.lifecycle_stage or "active").strip().lower()
            if days_since is None or days_since >= 14:
                if relationship_type == "investor":
                    if status_key == "hot":
                        return f"Hey {first_name}, quick pulse check: are you still ready to move fast on {interests}? I can send top-fit options today."
                    if status_key == "cold":
                        return f"Hey {first_name}, checking if {interests} is still on your radar, or if your buy box has changed recently."
                    return f"Hey {first_name}, are you still targeting {interests}, or has your buy box shifted over the last few weeks?"
                if relationship_type == "lead":
                    if status_key == "hot":
                        return f"Hey {first_name}, since {interests} is active, want to lock a quick call and map the fastest next step?"
                    if status_key == "cold":
                        return f"Hey {first_name}, light check-in on {interests}. Is this still a priority for you right now?"
                    return f"Hey {first_name}, quick check-in on {interests}. Is this still a priority, and want to map the next step?"
                if relationship_type == "agent":
                    if status_key == "hot":
                        return f"Hey {first_name}, I have strong demand around {interests}. Any fresh matches you can share this week?"
                    if status_key == "cold":
                        return f"Hey {first_name}, touching base on {interests}. Anything new I should keep an eye on?"
                    return f"Hey {first_name}, checking in on {interests}. Any active opportunities I should look at this week?"
                return f"Hey {first_name}, quick check-in. Are you still focused on {interests}, or has anything changed recently?"

            if relationship_type == "investor":
                if status_key == "hot":
                    return f"Hey {first_name}, keeping this moving on {interests}. Want 2 high-fit options in your inbox today?"
                if status_key == "cold":
                    return f"Hey {first_name}, wanted to keep a light touch on {interests}. Still worth sharing opportunities this month?"
                return f"Hey {first_name}, keeping momentum on {interests}. Want me to send over 1-2 aligned opportunities this week?"
            if relationship_type == "lead":
                if status_key == "hot":
                    return f"Hey {first_name}, momentum is strong on {interests}. Open for a 15-minute decision call this week?"
                if status_key == "cold":
                    return f"Hey {first_name}, quick pulse check on {interests}. Should we pause or pick one simple next step?"
                return f"Hey {first_name}, wanted to keep momentum on {interests}. Open to a quick 15-minute next-step call this week?"
            if relationship_type == "agent":
                if status_key == "hot":
                    return f"Hey {first_name}, active demand is building around {interests}. Can you send your best near-term matches?"
                if status_key == "cold":
                    return f"Hey {first_name}, keeping this warm around {interests}. Any listings worth a quick look this week?"
                return f"Hey {first_name}, staying synced on {interests}. Do you have fresh inventory that matches this focus?"
            return f"Hey {first_name}, wanted to keep momentum on {interests}. Want to do a quick sync this week?"
        if insight_type == "risk":
            return f"{timing_phrase} Engagement risk rises if follow-up slips again."
        if insight_type == "opportunity":
            return f"{name} has active upside around {interests}; a timely outreach can unlock near-term movement."
        return f"Keep {name} warm with a short follow-up tied to {interests}."

    def _run_prompt(self, prompt: str) -> str:
        if not self.client:
            return ""
        response = self.client.responses.create(
            model=settings.openai_model,
            input=prompt,
            temperature=0.3,
        )
        return (response.output_text or "").strip()

    def _store_insight(self, db: Session, relationship_id, insight_type: str, content: str, score: float | None = None):
        item = AIInsight(
            relationship_id=relationship_id,
            type=insight_type,
            content=content,
            score=score,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    def generate_contact_summary(self, db: Session, relationship_id):
        context = self._memory_context(db, relationship_id)
        prompt = (
            "You are a relationship intelligence assistant. Return exactly 4 lines with these labels and nothing else:\n"
            "Who: ...\n"
            "What they want: ...\n"
            "Current status: ...\n"
            "Why they matter financially: ...\n"
            "Keep each line concise, specific, and grounded in the provided context.\n\n"
            f"{context}"
        )
        content = self._run_prompt(prompt) or self._fallback(db, relationship_id, "summary")
        self._store_insight(db, relationship_id, "summary", content)
        return content

    def generate_message_suggestion(self, db: Session, relationship_id, goal: str):
        rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
        context = self._memory_context(db, relationship_id)
        relationship_type = rel.type if rel else ""
        metadata = rel.person.metadata_json if rel and rel.person else {}
        current_status = metadata.get("current_status") or (rel.lifecycle_stage if rel else "active")
        days_since = self._days_since_last_contact(rel) if rel else None
        prompt = (
            "Write one short outreach message under 45 words."
            " Tone rules: casual, human, direct, no corporate language, no buzzwords, no robotic phrasing."
            " Include one specific detail from context when possible."
            " Avoid openers like 'Hope you're doing well'."
            f" {self._message_prompt_rules(relationship_type, current_status, days_since)}"
            f" Goal: {goal}\n\n{context}"
        )
        content = self._run_prompt(prompt) or self._fallback(db, relationship_id, "suggestion", goal=goal)
        self._store_insight(db, relationship_id, "suggestion", content)
        return content

    def generate_message_suggestion_with_style(
        self, db: Session, relationship_id, goal: str, style_override: dict | None = None
    ):
        rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
        context = self._memory_context(db, relationship_id, style_override=style_override)
        relationship_type = rel.type if rel else ""
        metadata = rel.person.metadata_json if rel and rel.person else {}
        current_status = metadata.get("current_status") or (rel.lifecycle_stage if rel else "active")
        days_since = self._days_since_last_contact(rel) if rel else None
        prompt = (
            "Write one short outreach message under 45 words."
            " Tone rules: casual, human, direct, no corporate language, no buzzwords, no robotic phrasing."
            " Follow the provided style profile exactly."
            " Include one specific detail from context when possible."
            " Avoid openers like 'Hope you're doing well'."
            f" {self._message_prompt_rules(relationship_type, current_status, days_since)}"
            f" Goal: {goal}\n\n{context}"
        )
        content = self._run_prompt(prompt) or self._fallback(db, relationship_id, "suggestion", goal=goal)
        self._store_insight(db, relationship_id, "suggestion", content)
        return content

    def generate_insights(self, db: Session, relationship_id):
        context = self._memory_context(db, relationship_id)
        prompt = (
            "Generate exactly 2 lines and nothing else:\n"
            "Risk: ...\n"
            "Opportunity: ...\n"
            "Keep each line under 20 words and grounded in the provided context.\n\n"
            f"{context}"
        )
        content = self._run_prompt(prompt)

        risk_content = self._fallback(db, relationship_id, "risk")
        opportunity_content = self._fallback(db, relationship_id, "opportunity")
        if content:
            for line in content.splitlines():
                lower_line = line.strip().lower()
                if lower_line.startswith("risk:"):
                    risk_content = line.split(":", 1)[1].strip() or risk_content
                if lower_line.startswith("opportunity:"):
                    opportunity_content = line.split(":", 1)[1].strip() or opportunity_content

        self._store_insight(db, relationship_id, "risk", risk_content)
        self._store_insight(db, relationship_id, "opportunity", opportunity_content)
        content = f"Risk: {risk_content}\nOpportunity: {opportunity_content}"
        return content
