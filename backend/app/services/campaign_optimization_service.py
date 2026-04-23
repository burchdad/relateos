from collections import Counter, defaultdict

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import ContentRelationshipTarget, Interaction, Relationship
from app.services.relateos_service import SIGNAL_WEIGHT_PRESETS, get_active_signal_preset, set_active_signal_preset
from app.services.scoring_service import recalculate_all_priority_scores


class CampaignOptimizationService:
	@staticmethod
	def _campaign_targets(db: Session) -> list[ContentRelationshipTarget]:
		return (
			db.query(ContentRelationshipTarget)
			.filter(
				or_(
					ContentRelationshipTarget.delivery_count > 0,
					ContentRelationshipTarget.engagement_status.in_(["responded", "ignored"]),
				)
			)
			.all()
		)

	@staticmethod
	def _top_tags(targets: list[ContentRelationshipTarget], status: str) -> tuple[str, float] | None:
		responded: Counter[str] = Counter()
		baseline: Counter[str] = Counter()

		for target in targets:
			relationship = target.relationship
			person = relationship.person if relationship else None
			tags = []
			if person and isinstance(person.tags, dict):
				tags = [str(k).lower().strip() for k in person.tags.keys() if str(k).strip()]

			for tag in tags:
				baseline[tag] += 1
				if target.engagement_status == status:
					responded[tag] += 1

		if not responded:
			return None

		best_tag = None
		best_lift = 0.0
		total_hits = sum(responded.values())
		total_baseline = sum(baseline.values())
		baseline_rate = (total_hits / total_baseline) if total_baseline else 0.0

		for tag, hits in responded.items():
			denom = baseline.get(tag, 0)
			if denom <= 0:
				continue
			rate = hits / denom
			lift = (rate / baseline_rate) if baseline_rate > 0 else 0.0
			if lift > best_lift:
				best_lift = lift
				best_tag = tag

		if not best_tag:
			return None
		return best_tag, best_lift

	@staticmethod
	def _message_style_insight(db: Session, relationship_ids: list) -> str:
		if not relationship_ids:
			return "Insufficient data to estimate message tone performance."

		rows = (
			db.query(Interaction)
			.filter(
				Interaction.relationship_id.in_(relationship_ids),
				Interaction.summary.is_not(None),
				Interaction.summary.ilike("Content follow-up sent%"),
			)
			.order_by(Interaction.created_at.desc())
			.all()
		)
		if not rows:
			return "Insufficient data to estimate message tone performance."

		by_length: dict[str, list[int]] = defaultdict(list)
		for row in rows:
			content_len = len((row.content or "").strip())
			bucket = "short" if content_len < 170 else "long"
			by_length[bucket].append(content_len)

		if len(by_length["short"]) >= len(by_length["long"]):
			return "Cold leads responded better to softer check-in messages."
		return "Long-form follow-up messages are trending stronger for this audience."

	@staticmethod
	def _pick_suggested_preset(engaged_rate: float, ignored_rate: float) -> str:
		if ignored_rate >= 0.45:
			return "relationship_nurture"
		if engaged_rate >= 0.4:
			return "aggressive_followup"
		return "balanced"

	@staticmethod
	def build_insights(db: Session) -> dict:
		targets = CampaignOptimizationService._campaign_targets(db)
		sent = len([t for t in targets if t.engagement_status in {"sent", "responded", "ignored"}])
		engaged = len([t for t in targets if t.engagement_status == "responded"])
		ignored = len([t for t in targets if t.engagement_status == "ignored"])
		next_actions = engaged

		engaged_rate = (engaged / sent) if sent else 0.0
		ignored_rate = (ignored / sent) if sent else 0.0

		top_engaged_tag = CampaignOptimizationService._top_tags(targets, "responded")
		if top_engaged_tag:
			tag, lift = top_engaged_tag
			top_tag_line = f"Contacts tagged '{tag}' show {lift:.1f}x higher engagement than baseline."
			suggested_tags = [tag]
		else:
			top_tag_line = "Tag-level engagement is still warming up; keep collecting campaign responses."
			suggested_tags = []

		responded_ids = [t.relationship_id for t in targets if t.engagement_status == "responded"]
		message_line = CampaignOptimizationService._message_style_insight(db, responded_ids)

		active = get_active_signal_preset(db)
		suggested_preset = CampaignOptimizationService._pick_suggested_preset(engaged_rate, ignored_rate)
		suggested_weights = SIGNAL_WEIGHT_PRESETS[suggested_preset]
		adjustments = {
			key: round(suggested_weights[key] - active["weights"].get(key, 0.0), 2)
			for key in suggested_weights
			if abs(suggested_weights[key] - active["weights"].get(key, 0.0)) >= 0.5
		}
		tone = "softer_check_in" if ignored_rate > engaged_rate else "direct_confident"

		return {
			"sent_count": sent,
			"engaged_count": engaged,
			"ignored_count": ignored,
			"next_actions_suggested": next_actions,
			"insights": [
				{
					"label": "Top segment",
					"detail": top_tag_line,
				},
				{
					"label": "Message performance",
					"detail": message_line,
				},
				{
					"label": "Signal weighting",
					"detail": (
						f"Consider moving signal preset from '{active['active_preset']}' to '{suggested_preset}' "
						"to better match recent engagement behavior."
					),
				},
			],
			"suggestion": {
				"suggested_preset": suggested_preset,
				"suggested_tone": tone,
				"suggested_target_tags": suggested_tags,
				"suggested_weight_adjustments": adjustments,
			},
		}

	@staticmethod
	def apply_suggested_adjustments(db: Session) -> dict:
		insights = CampaignOptimizationService.build_insights(db)
		suggested_preset = insights["suggestion"]["suggested_preset"]
		updated = set_active_signal_preset(db, suggested_preset)
		refreshed = recalculate_all_priority_scores(db)
		return {
			"applied_preset": updated["active_preset"],
			"updated_scores": refreshed,
			"message": (
				f"Applied preset '{updated['active_preset']}' and recalculated {refreshed} relationship priorities."
			),
		}
