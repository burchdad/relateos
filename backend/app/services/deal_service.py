import json
import logging
import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Deal, DealParticipant
from app.schemas.deal import DealCreate, DealUpdate, NaturalLanguageDealResult
from app.services.network_service import NetworkService


class DealService:
    @staticmethod
    def create(db: Session, payload: DealCreate) -> Deal:
        deal = Deal(
            id=uuid.uuid4(),
            title=payload.title,
            description=payload.description,
            deal_type=payload.deal_type,
            status=payload.status,
            primary_contact_id=payload.primary_contact_id,
            organization_id=payload.organization_id,
            source_contact_id=payload.source_contact_id,
            referred_by_contact_id=payload.referred_by_contact_id,
            amount=payload.amount,
            expected_value=payload.expected_value,
            probability=payload.probability,
            close_date=payload.close_date,
        )
        db.add(deal)
        db.flush()

        for p in payload.participants:
            participant = DealParticipant(
                id=uuid.uuid4(),
                deal_id=deal.id,
                contact_id=p.contact_id,
                role=p.role,
                split_percentage=p.split_percentage,
                split_amount=p.split_amount,
                referral_fee=p.referral_fee,
                notes=p.notes,
            )
            db.add(participant)

        DealService._update_network_edges(db, deal)

        db.commit()
        db.refresh(deal)
        return deal

    @staticmethod
    def _update_network_edges(db: Session, deal: Deal) -> None:
        participant_ids = [p.contact_id for p in deal.participants if p.contact_id]
        anchor_ids = [deal.primary_contact_id, deal.source_contact_id, deal.referred_by_contact_id]
        contact_ids = []
        for contact_id in anchor_ids + participant_ids:
            if contact_id and contact_id not in contact_ids:
                contact_ids.append(contact_id)

        if len(contact_ids) < 2:
            return

        for idx, source_id in enumerate(contact_ids[:20]):
            for target_id in contact_ids[idx + 1 : 20]:
                try:
                    NetworkService.upsert_edge(
                        db,
                        source_id,
                        target_id,
                        relationship_type="deal_collaboration",
                        strength=1.5,
                        organization_id=deal.organization_id,
                        revenue_attributed=float(deal.actual_value or deal.expected_value or deal.amount or 0.0),
                        deal_count=1,
                        evidence={
                            "source": "deal",
                            "deal_id": str(deal.id),
                            "deal_title": deal.title,
                            "deal_status": deal.status,
                        },
                    )
                except ValueError:
                    continue

    @staticmethod
    def get_by_id(db: Session, deal_id: uuid.UUID) -> Deal | None:
        return db.query(Deal).filter(Deal.id == deal_id).first()

    @staticmethod
    def list_all(
        db: Session,
        deal_type: str | None = None,
        status: str | None = None,
        organization_id: uuid.UUID | None = None,
        limit: int = 100,
    ) -> list[Deal]:
        q = db.query(Deal)
        if deal_type:
            q = q.filter(Deal.deal_type == deal_type)
        if status:
            q = q.filter(Deal.status == status)
        if organization_id:
            q = q.filter(Deal.organization_id == organization_id)
        return q.order_by(Deal.created_at.desc()).limit(limit).all()

    @staticmethod
    def update(db: Session, deal_id: uuid.UUID, payload: DealUpdate) -> Deal | None:
        deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if not deal:
            return None
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(deal, field, value)
        db.commit()
        db.refresh(deal)
        return deal

    @staticmethod
    def parse_natural_language(text: str) -> NaturalLanguageDealResult:
        """
        Natural language deal parser. Uses GPT-4o when OPENAI_API_KEY is set,
        otherwise falls back to deterministic regex parsing.
        """
        from app.schemas.deal import DealCreate, DealParticipantCreate

        if settings.openai_api_key:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.openai_api_key)
                prompt = (
                    f"Parse this deal description into structured JSON: \"{text}\"\n\n"
                    "Return JSON with keys: title, deal_type (one of: coaching/buyer_lead/seller_lead/"
                    "referral/investment/property/vendor/sponsorship/podcast_funnel/community_membership/other), "
                    "status (lead/active/negotiating/closed_won/closed_lost), amount (number), "
                    "split_percentage (number 0-100 or null), close_date (YYYY-MM-DD or null), "
                    "confidence (0.0-1.0), missing_fields (array of strings). "
                    "Return only valid JSON."
                )
                raw = client.chat.completions.create(
                    model=settings.openai_model or "gpt-4o",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    response_format={"type": "json_object"},
                ).choices[0].message.content or ""
                data = json.loads(raw)
                participants = []
                split = data.get("split_percentage")
                if split:
                    participants = [
                        DealParticipantCreate(role="partner", split_percentage=float(split)),
                        DealParticipantCreate(role="closer", split_percentage=100 - float(split)),
                    ]
                close_date = None
                if data.get("close_date"):
                    try:
                        close_date = datetime.strptime(data["close_date"], "%Y-%m-%d")
                    except ValueError:
                        pass
                parsed = DealCreate(
                    title=data.get("title", text[:80]),
                    deal_type=data.get("deal_type", "other"),
                    status=data.get("status", "lead"),
                    amount=float(data.get("amount") or 0),
                    close_date=close_date,
                    participants=participants,
                )
                missing = data.get("missing_fields", [])
                confidence = float(data.get("confidence", 0.85))
                return NaturalLanguageDealResult(
                    parsed=parsed,
                    confidence=confidence,
                    missing_fields=missing,
                    needs_confirmation=len(missing) > 0 or confidence < 0.8,
                    raw_input=text,
                )
            except Exception as exc:
                logging.getLogger(__name__).warning("AI deal parse failed, using regex fallback: %s", exc)

        # Deterministic regex fallback
        from app.schemas.deal import DealCreate, DealParticipantCreate

        lower = text.lower()
        missing: list[str] = []
        confidence = 0.6

        # Extract amount
        amount = 0.0
        amount_match = re.search(r"\$?([\d,]+)k?\b", lower)
        if amount_match:
            raw = amount_match.group(1).replace(",", "")
            amount = float(raw) * (1000 if "k" in lower[amount_match.start():amount_match.end() + 1] else 1)
            confidence += 0.1
        else:
            missing.append("amount")

        # Deal type
        deal_type = "other"
        type_map = {
            "coaching": "coaching",
            "buyer": "buyer_lead",
            "seller": "seller_lead",
            "referral": "referral",
            "invest": "investment",
            "property": "property",
            "vendor": "vendor",
            "sponsor": "sponsorship",
            "podcast": "podcast_funnel",
            "community": "community_membership",
        }
        for keyword, dtype in type_map.items():
            if keyword in lower:
                deal_type = dtype
                confidence += 0.05
                break

        # Status
        status = "lead"
        if any(w in lower for w in ["closed", "won", "done", "completed"]):
            status = "closed_won"
            confidence += 0.05
        elif "lost" in lower:
            status = "closed_lost"

        # Split
        split_pct = 0.0
        split_match = re.search(r"split\s+(\d+)/(\d+)", lower)
        if split_match:
            split_pct = float(split_match.group(1))
            confidence += 0.05

        # Close date
        close_date = None
        months = ["january", "february", "march", "april", "may", "june",
                  "july", "august", "september", "october", "november", "december"]
        for i, month in enumerate(months):
            if month in lower:
                day_match = re.search(rf"{month}\s+(\d+)", lower)
                day = int(day_match.group(1)) if day_match else 1
                year = datetime.now().year
                try:
                    close_date = datetime(year, i + 1, day)
                    confidence += 0.05
                except ValueError:
                    pass
                break

        # Title
        title = text[:80].strip() if len(text) > 10 else "Deal"

        participants = []
        if split_pct > 0:
            participants.append(DealParticipantCreate(role="partner", split_percentage=split_pct))
            participants.append(DealParticipantCreate(role="closer", split_percentage=100 - split_pct))

        if amount == 0:
            missing.append("amount")

        parsed = DealCreate(
            title=title,
            deal_type=deal_type,
            status=status,
            amount=amount,
            close_date=close_date,
            participants=participants,
        )

        return NaturalLanguageDealResult(
            parsed=parsed,
            confidence=min(confidence, 1.0),
            missing_fields=list(set(missing)),
            needs_confirmation=len(missing) > 0 or confidence < 0.8,
            raw_input=text,
        )
