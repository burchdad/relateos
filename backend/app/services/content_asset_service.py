import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import ContentAsset, FunnelCampaign
from app.schemas.content_asset import (
    ContentAssetCreate,
    ContentAssetUpdate,
    ContentFunnelGenerateResponse,
    FunnelCampaignCreate,
    ImportMapRequest,
    ImportMapResponse,
)


# Heuristic column mapping rules for AI import mapper
_COLUMN_HINTS: dict[str, str] = {
    "name": "people.first_name + last_name",
    "first name": "people.first_name",
    "last name": "people.last_name",
    "email": "people.email",
    "phone": "people.phone",
    "company": "organizations.name",
    "organization": "organizations.name",
    "title": "people.primary_role",
    "role": "people.primary_role",
    "sf buyer": "people.primary_role=sf_buyer",
    "sf seller": "people.primary_role=sf_seller",
    "cre buyer": "people.primary_role=cre_buyer",
    "cre seller": "people.primary_role=cre_seller",
    "buyer type": "people.primary_role",
    "seller type": "people.primary_role",
    "source": "people.source",
    "notes": "people.notes_summary",
    "tags": "people.tags",
    "watched story": "engagement_events.event_type=story_view",
    "story view": "engagement_events.event_type=story_view",
    "attended": "meeting_attendees.attendance_status=attended",
    "joined": "meeting_attendees.joined_at",
    "left": "meeting_attendees.left_at",
    "duration": "meeting_attendees.duration_seconds",
    "amount": "deals.amount",
    "deal type": "deals.deal_type",
    "status": "deals.status",
    "close date": "deals.close_date",
    "referred by": "deals.referred_by_contact_id",
    "split": "deal_participants.split_percentage",
    "website": "organizations.website",
    "location": "people.notes_summary",
}

_SOURCE_TYPE_TABLE_MAP: dict[str, str] = {
    "contacts": "people",
    "linkedin": "people",
    "webinar_attendees": "meeting_attendees",
    "story_viewers": "engagement_events",
    "podcast_leads": "people",
    "deal_list": "deals",
    "vendor_list": "people + organizations",
    "buyer_leads": "people",
    "seller_leads": "people",
}


class ContentAssetService:
    @staticmethod
    def create(db: Session, payload: ContentAssetCreate) -> ContentAsset:
        asset = ContentAsset(id=uuid.uuid4(), **payload.model_dump())
        db.add(asset)
        db.commit()
        db.refresh(asset)
        return asset

    @staticmethod
    def get_by_id(db: Session, asset_id: uuid.UUID) -> ContentAsset | None:
        return db.query(ContentAsset).filter(ContentAsset.id == asset_id).first()

    @staticmethod
    def list_all(db: Session) -> list[ContentAsset]:
        return db.query(ContentAsset).order_by(ContentAsset.created_at.desc()).all()

    @staticmethod
    def update(db: Session, asset_id: uuid.UUID, payload: ContentAssetUpdate) -> ContentAsset | None:
        asset = db.query(ContentAsset).filter(ContentAsset.id == asset_id).first()
        if not asset:
            return None
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(asset, field, value)
        db.commit()
        db.refresh(asset)
        return asset

    @staticmethod
    def generate_funnel(asset_id: uuid.UUID, db: Session) -> ContentFunnelGenerateResponse:
        """
        AI content funnel generator. Uses GPT-4o when OPENAI_API_KEY is set,
        otherwise returns structured template copy.
        """
        import json, logging
        asset = db.query(ContentAsset).filter(ContentAsset.id == asset_id).first()
        title = asset.title if asset else "Content"
        transcript = (asset.transcript or "")[:1200] if asset else ""

        if settings.openai_api_key:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.openai_api_key)
                prompt = (
                    f"Content title: {title}\n"
                    f"Content type: {asset.content_type if asset else 'unknown'}\n"
                    f"Transcript/notes: {transcript}\n\n"
                    "Generate a content repurposing funnel. Return JSON with:\n"
                    "- clips (array of {title, hook}): 3 clip angles\n"
                    "- captions (array of 3 strings): IG/social captions\n"
                    "- hooks (array of 3 strings): scroll-stopping hooks\n"
                    "- email_followup (string): personalized email template\n"
                    "- dm_followup (string): short DM template\n"
                    "- ad_copy (array of {headline, body}): 2 ad variants\n"
                    "- landing_page_concept (string)\n"
                    "- target_segments (array of strings): 4 audience types\n"
                    "- lead_magnet_idea (string)\n"
                    "Return only valid JSON."
                )
                raw = client.chat.completions.create(
                    model=settings.openai_model or "gpt-4o",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.6,
                    response_format={"type": "json_object"},
                ).choices[0].message.content or ""
                data = json.loads(raw)
                return ContentFunnelGenerateResponse(
                    content_asset_id=asset_id,
                    clips=data.get("clips", []),
                    captions=data.get("captions", []),
                    hooks=data.get("hooks", []),
                    email_followup=data.get("email_followup", ""),
                    dm_followup=data.get("dm_followup", ""),
                    ad_copy=data.get("ad_copy", []),
                    landing_page_concept=data.get("landing_page_concept", ""),
                    target_segments=data.get("target_segments", []),
                    lead_magnet_idea=data.get("lead_magnet_idea", ""),
                )
            except Exception as exc:
                logging.getLogger(__name__).warning("AI funnel generation failed, using template: %s", exc)

        # Template fallback
        return ContentFunnelGenerateResponse(
            content_asset_id=asset_id,
            clips=[
                {"title": f"Clip 1 from {title}", "hook": "Here is the key takeaway...", "duration_seconds": 60},
                {"title": f"Clip 2 from {title}", "hook": "Most people don't know this...", "duration_seconds": 45},
            ],
            captions=[
                f"🔥 {title} — watch this if you want to level up your network.",
                f"This one insight from {title} changed how I think about relationships.",
            ],
            hooks=[
                "Most people overlook this...",
                "This is how the top 1% build their network...",
                "I wish someone told me this earlier...",
            ],
            email_followup=(
                f"Subject: Thoughts after {title}\n\n"
                "Hey [Name],\n\nJust wanted to follow up after sharing some thoughts on this topic. "
                "Would love to connect and explore how this applies to your situation.\n\nBest,"
            ),
            dm_followup=(
                f"Hey! Just thought of you after {title}. "
                "Figured you'd appreciate this perspective — would love to chat."
            ),
            ad_copy=[
                {"headline": f"Learn from {title}", "body": "Join the network and access insights like this every week."},
            ],
            landing_page_concept=f"A focused landing page for {title} with a lead magnet and email capture.",
            target_segments=["investors", "buyers", "community members", "coaches"],
            lead_magnet_idea=f"Free checklist or mini-guide based on {title}",
        )

    @staticmethod
    def create_funnel_campaign(db: Session, payload: FunnelCampaignCreate) -> FunnelCampaign:
        campaign = FunnelCampaign(id=uuid.uuid4(), **payload.model_dump())
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        return campaign

    @staticmethod
    def list_funnel_campaigns(db: Session) -> list[FunnelCampaign]:
        return db.query(FunnelCampaign).order_by(FunnelCampaign.created_at.desc()).all()

    @staticmethod
    def map_import(payload: ImportMapRequest) -> ImportMapResponse:
        """
        Deterministic AI import mapper.
        TODO: Replace with GPT-4o call via AIService when OPENAI_API_KEY is set.
        """
        suggested_table = _SOURCE_TYPE_TABLE_MAP.get(payload.source_type, "people")
        mapping: dict[str, str] = {}
        unmapped: list[str] = []
        warnings: list[str] = []

        for col in payload.raw_columns:
            key = col.strip().lower()
            matched = False
            for hint_key, hint_val in _COLUMN_HINTS.items():
                if hint_key in key:
                    mapping[col] = hint_val
                    matched = True
                    break
            if not matched:
                unmapped.append(col)

        confidence = 1.0 - (len(unmapped) / max(len(payload.raw_columns), 1)) * 0.5
        if unmapped:
            warnings.append(f"Could not map {len(unmapped)} column(s): {', '.join(unmapped)}")

        return ImportMapResponse(
            suggested_table=suggested_table,
            suggested_column_mapping=mapping,
            confidence=round(confidence, 2),
            warnings=warnings,
            unmapped_fields=unmapped,
        )
