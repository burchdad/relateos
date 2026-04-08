from sqlalchemy.orm import Session

from openai import OpenAI

from app.core.config import settings
from app.models import AIInsight, Interaction, Opportunity, Relationship, RelationshipSignal
from app.services.style_profile_service import DEFAULT_STYLE, get_style_profile


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

        context_lines = [
            f"Relationship type: {rel.type}",
            f"Lifecycle stage: {rel.lifecycle_stage}",
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

    def _fallback(self, relationship_id, insight_type: str, goal: str | None = None) -> str:
        if insight_type == "summary":
            return (
                "Who: Strategic relationship in your active network.\n"
                "What they want: Clear momentum and quick, practical follow-through.\n"
                "Current status: Warm but needs a timely touchpoint to avoid drift.\n"
                "Why they matter financially: Ongoing upside through repeat opportunities and referrals."
            )
        if insight_type == "suggestion":
            g = goal or "reconnect"
            return f"Hey, quick one. Wanted to reconnect on {g}. You free for a short call this week?"
        if insight_type == "risk":
            return "Contact gap is growing and momentum could stall if no follow-up happens this week."
        if insight_type == "opportunity":
            return "Relationship has active upside right now; a timely outreach can unlock near-term deal movement."
        return "High-value relationship with moderate risk due to contact gap. Follow-up advised within 48 hours."

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
        content = self._run_prompt(prompt) or self._fallback(relationship_id, "summary")
        self._store_insight(db, relationship_id, "summary", content)
        return content

    def generate_message_suggestion(self, db: Session, relationship_id, goal: str):
        context = self._memory_context(db, relationship_id)
        prompt = (
            "Write one short outreach message under 45 words."
            " Tone rules: casual, human, direct, no corporate language, no buzzwords, no robotic phrasing."
            " Include one specific detail from context when possible."
            " Avoid openers like 'Hope you're doing well'."
            f" Goal: {goal}\n\n{context}"
        )
        content = self._run_prompt(prompt) or self._fallback(relationship_id, "suggestion", goal=goal)
        self._store_insight(db, relationship_id, "suggestion", content)
        return content

    def generate_message_suggestion_with_style(
        self, db: Session, relationship_id, goal: str, style_override: dict | None = None
    ):
        context = self._memory_context(db, relationship_id, style_override=style_override)
        prompt = (
            "Write one short outreach message under 45 words."
            " Tone rules: casual, human, direct, no corporate language, no buzzwords, no robotic phrasing."
            " Follow the provided style profile exactly."
            " Include one specific detail from context when possible."
            " Avoid openers like 'Hope you're doing well'."
            f" Goal: {goal}\n\n{context}"
        )
        content = self._run_prompt(prompt) or self._fallback(relationship_id, "suggestion", goal=goal)
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

        risk_content = self._fallback(relationship_id, "risk")
        opportunity_content = self._fallback(relationship_id, "opportunity")
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
