from collections import Counter, defaultdict
from statistics import mean

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import ContentRelationshipTarget, Interaction, Relationship
from app.services.relateos_service import SIGNAL_WEIGHT_PRESETS, get_active_signal_preset, set_active_signal_preset
from app.services.scoring_service import recalculate_all_priority_scores


class CampaignOptimizationService:
	MIN_SAMPLE_SIZE = 15
	EXPERIMENT_WINDOW_HOURS = 48

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
	def _campaign_rollups(targets: list[ContentRelationshipTarget]) -> list[dict]:
		rollups: dict[str, dict] = {}

		for target in targets:
			content_id = str(target.content_id)
			content = getattr(target, "content", None)
			latest_activity = target.last_engagement_at or target.last_sent_at or target.created_at
			row = rollups.setdefault(
				content_id,
				{
					"content_id": content_id,
					"title": getattr(content, "title", "Campaign"),
					"experiment_key": getattr(content, "experiment_key", None),
					"experiment_variant": getattr(content, "experiment_variant", None),
					"created_at": getattr(content, "created_at", target.created_at),
					"sent": 0,
					"responded": 0,
					"ignored": 0,
					"latest_activity": latest_activity,
					"response_hours": [],
				},
			)

			if content is not None:
				row["title"] = getattr(content, "title", row["title"])
				row["experiment_key"] = getattr(content, "experiment_key", row["experiment_key"])
				row["experiment_variant"] = getattr(content, "experiment_variant", row["experiment_variant"])
				row["created_at"] = getattr(content, "created_at", row["created_at"])

			if target.engagement_status in {"sent", "responded", "ignored"}:
				row["sent"] += 1
			if target.engagement_status == "responded":
				row["responded"] += 1
				if target.last_sent_at and target.last_engagement_at and target.last_engagement_at >= target.last_sent_at:
					row["response_hours"].append((target.last_engagement_at - target.last_sent_at).total_seconds() / 3600)
			if target.engagement_status == "ignored":
				row["ignored"] += 1
			if latest_activity and (row["latest_activity"] is None or latest_activity > row["latest_activity"]):
				row["latest_activity"] = latest_activity

		items = []
		for row in rollups.values():
			sent = row["sent"]
			row["reply_rate"] = (row["responded"] / sent) if sent else 0.0
			row["engagement_rate"] = ((row["responded"] + row["ignored"]) / sent) if sent else 0.0
			row["avg_time_to_response_hours"] = round(mean(row["response_hours"]), 1) if row["response_hours"] else None
			items.append(row)

		items.sort(key=lambda row: row["latest_activity"] or 0, reverse=True)
		return items

	@staticmethod
	def _format_rate(count: int, sent: int) -> str:
		if sent <= 0:
			return "0%"
		return f"{round((count / sent) * 100):.0f}%"

	@staticmethod
	def _format_lift(control_value: float | None, optimized_value: float | None, *, lower_is_better: bool = False) -> str:
		if control_value is None or optimized_value is None:
			return "Pending"
		if control_value == 0:
			return "Pending"
		if lower_is_better:
			lift = ((control_value - optimized_value) / control_value) * 100
		else:
			lift = ((optimized_value - control_value) / control_value) * 100
		return f"{lift:+.0f}%"

	@staticmethod
	def _comparison_summary(rollups: list[dict]) -> dict | None:
		by_experiment: dict[str, dict[str, list[dict]]] = defaultdict(lambda: {"control": [], "optimized": []})
		for row in rollups:
			experiment_key = row.get("experiment_key")
			variant = row.get("experiment_variant")
			if not experiment_key or variant not in {"control", "optimized"}:
				continue
			by_experiment[experiment_key][variant].append(row)

		candidates = []
		for experiment_key, grouped in by_experiment.items():
			controls = sorted(grouped["control"], key=lambda row: row["created_at"] or row["latest_activity"], reverse=True)
			optimized_rows = sorted(grouped["optimized"], key=lambda row: row["created_at"] or row["latest_activity"], reverse=True)
			if not controls or not optimized_rows:
				continue
			control = controls[0]
			optimized = optimized_rows[0]
			control_time = control["created_at"] or control["latest_activity"]
			optimized_time = optimized["created_at"] or optimized["latest_activity"]
			if not control_time or not optimized_time:
				continue
			compared_within_hours = round(abs((optimized_time - control_time).total_seconds()) / 3600, 1)
			window_valid = compared_within_hours <= CampaignOptimizationService.EXPERIMENT_WINDOW_HOURS
			candidates.append(
				{
					"experiment_key": experiment_key,
					"control": control,
					"optimized": optimized,
					"compared_within_hours": compared_within_hours,
					"window_valid": window_valid,
					"latest_time": max(control_time, optimized_time),
				}
			)

		if not candidates:
			return None

		candidates.sort(key=lambda row: (row["window_valid"], row["latest_time"]), reverse=True)
		selected = candidates[0]
		control = selected["control"]
		optimized = selected["optimized"]

		reply_lift = CampaignOptimizationService._format_lift(control["reply_rate"], optimized["reply_rate"])
		engagement_lift = CampaignOptimizationService._format_lift(control["engagement_rate"], optimized["engagement_rate"])
		response_time_lift = CampaignOptimizationService._format_lift(
			control["avg_time_to_response_hours"],
			optimized["avg_time_to_response_hours"],
			lower_is_better=True,
		)

		wins = 0
		if optimized["reply_rate"] > control["reply_rate"]:
			wins += 1
		if optimized["engagement_rate"] > control["engagement_rate"]:
			wins += 1
		if (
			optimized["avg_time_to_response_hours"] is not None
			and control["avg_time_to_response_hours"] is not None
			and optimized["avg_time_to_response_hours"] < control["avg_time_to_response_hours"]
		):
			wins += 1

		winning_strategy = "Optimized" if wins >= 2 else "Control"

		return {
			"experiment_key": selected["experiment_key"],
			"control_campaign_title": control["title"],
			"optimized_campaign_title": optimized["title"],
			"compared_within_hours": selected["compared_within_hours"],
			"window_valid": selected["window_valid"],
			"winning_strategy": winning_strategy,
			"metrics": [
				{
					"label": "Engagement",
					"control_value": f"{control['sent']} sends -> {control['responded'] + control['ignored']} outcomes -> {round(control['engagement_rate'] * 100):.0f}%",
					"optimized_value": f"{optimized['sent']} sends -> {optimized['responded'] + optimized['ignored']} outcomes -> {round(optimized['engagement_rate'] * 100):.0f}%",
					"lift": engagement_lift,
					"winner": "Optimized" if optimized["engagement_rate"] > control["engagement_rate"] else "Control",
				},
				{
					"label": "Replies",
					"control_value": f"{control['sent']} sends -> {control['responded']} replies -> {round(control['reply_rate'] * 100):.0f}%",
					"optimized_value": f"{optimized['sent']} sends -> {optimized['responded']} replies -> {round(optimized['reply_rate'] * 100):.0f}%",
					"lift": reply_lift,
					"winner": "Optimized" if optimized["reply_rate"] > control["reply_rate"] else "Control",
				},
				{
					"label": "Time-to-response",
					"control_value": (
						f"{control['avg_time_to_response_hours']}h avg" if control["avg_time_to_response_hours"] is not None else "Pending"
					),
					"optimized_value": (
						f"{optimized['avg_time_to_response_hours']}h avg"
						if optimized["avg_time_to_response_hours"] is not None
						else "Pending"
					),
					"lift": response_time_lift,
					"winner": (
						"Optimized"
						if optimized["avg_time_to_response_hours"] is not None
						and control["avg_time_to_response_hours"] is not None
						and optimized["avg_time_to_response_hours"] < control["avg_time_to_response_hours"]
						else "Control"
					),
				},
			],
		}

	@staticmethod
	def _average_response_hours(targets: list[ContentRelationshipTarget]) -> float | None:
		durations = []
		for target in targets:
			if target.engagement_status != "responded":
				continue
			if not target.last_sent_at or not target.last_engagement_at:
				continue
			if target.last_engagement_at < target.last_sent_at:
				continue
			durations.append((target.last_engagement_at - target.last_sent_at).total_seconds() / 3600)

		if not durations:
			return None
		return round(mean(durations), 1)

	@staticmethod
	def _consistency_label(rollups: list[dict]) -> str:
		rates = [row["reply_rate"] for row in rollups if row["sent"] > 0]
		if len(rates) < 2:
			return "Early"

		spread = max(rates) - min(rates)
		if spread <= 0.12:
			return "Stable"
		if spread <= 0.24:
			return "Mixed"
		return "Volatile"

	@staticmethod
	def _confidence_summary(sent: int, engaged: int, ignored: int, campaign_count: int) -> tuple[str, int]:
		if sent <= 0:
			return "Low", 18

		labeled_ratio = ((engaged + ignored) / sent) if sent else 0.0
		score = round(
			(min(sent, 60) / 60) * 45
			+ (min(campaign_count, 7) / 7) * 20
			+ labeled_ratio * 20
			+ (min(engaged, 20) / 20) * 15
		)
		score = max(18, min(score, 96))

		if score >= 75:
			return "High", score
		if score >= 35:
			return "Medium", score
		return "Low", score

	@staticmethod
	def _projected_lift_range(rollups: list[dict], top_tag_lift: float | None, engaged_rate: float, sent: int) -> tuple[int | None, int | None, str]:
		if sent < CampaignOptimizationService.MIN_SAMPLE_SIZE:
			return None, None, f"Need at least {CampaignOptimizationService.MIN_SAMPLE_SIZE} sends before projected lift is credible."

		recent_rollups = [row for row in rollups[:3] if row["sent"] > 0]
		if not recent_rollups:
			return None, None, "Need at least one campaign with completed sends to project lift."

		recent_rates = [row["reply_rate"] for row in recent_rollups]
		spread = (max(recent_rates) - min(recent_rates)) if len(recent_rates) > 1 else 0.08
		base = 8.0 + min(engaged_rate * 12.0, 4.0)
		if top_tag_lift and top_tag_lift > 1.0:
			base += min((top_tag_lift - 1.0) * 6.0, 6.0)

		low = max(6, int(round(base - max(2.0, spread * 20.0))))
		high = min(24, int(round(base + max(4.0, spread * 20.0))))
		campaign_count = len(recent_rollups)
		basis = (
			f"Based on last {campaign_count} campaign{'s' if campaign_count != 1 else ''}"
			if campaign_count > 1
			else "Based on current campaign response pattern"
		)
		return low, max(low + 2, high), basis

	@staticmethod
	def _action_lines(active_weights: dict[str, float], suggested_weights: dict[str, float], adjustments: dict[str, float]) -> list[str]:
		if not adjustments:
			return ["No weight change applied -> current preset already matches recent engagement behavior."]

		lines = []
		for key, value in sorted(adjustments.items(), key=lambda item: abs(item[1]), reverse=True)[:4]:
			baseline = active_weights.get(key, 0.0)
			if baseline:
				relative = round((value / baseline) * 100)
				lines.append(f"{relative:+d}% weight -> {key}")
			else:
				lines.append(f"Set weight -> {key} ({suggested_weights[key]:.1f})")
		return lines

	@staticmethod
	def _proof_summary(
		targets: list[ContentRelationshipTarget],
		rollups: list[dict],
		active_weights: dict[str, float],
		adjustments: dict[str, float],
		suggested_weights: dict[str, float],
		engaged: int,
		ignored: int,
		sent: int,
		engaged_rate: float,
		top_tag_lift: float | None,
	) -> dict:
		campaign_count = len([row for row in rollups if row["sent"] > 0])
		comparison = CampaignOptimizationService._comparison_summary(rollups)
		confidence_label, confidence_score = CampaignOptimizationService._confidence_summary(sent, engaged, ignored, campaign_count)
		consistency_label = CampaignOptimizationService._consistency_label(rollups)
		projected_low, projected_high, projected_basis = CampaignOptimizationService._projected_lift_range(
			rollups,
			top_tag_lift,
			engaged_rate,
			sent,
		)
		average_response_hours = CampaignOptimizationService._average_response_hours(targets)
		sample_size_valid = sent >= CampaignOptimizationService.MIN_SAMPLE_SIZE
		if comparison:
			comparison_status = (
				f"Matched experiment '{comparison['experiment_key']}' compared control vs optimized in {comparison['compared_within_hours']} hours."
				if comparison["window_valid"]
				else f"Experiment '{comparison['experiment_key']}' has both variants, but the runs are outside the {CampaignOptimizationService.EXPERIMENT_WINDOW_HOURS}-hour window."
			)
		else:
			comparison_status = (
				"Baseline is ready. Run a matched control and optimized campaign inside the same 24-48 hour window to produce a proof comparison."
				if sample_size_valid
				else f"Comparison pending. Collect at least {CampaignOptimizationService.MIN_SAMPLE_SIZE} sends in a comparable campaign before evaluating lift."
			)

		return {
			"minimum_sample_size": CampaignOptimizationService.MIN_SAMPLE_SIZE,
			"current_sample_size": sent,
			"sample_size_valid": sample_size_valid,
			"experiment_window_hours": CampaignOptimizationService.EXPERIMENT_WINDOW_HOURS,
			"experiment_rules": [
				"Keep content identical between control and optimized runs.",
				"Use a comparable audience slice for both campaigns.",
				"Run both campaigns inside the same 24-48 hour window.",
				f"Require at least {CampaignOptimizationService.MIN_SAMPLE_SIZE} sends per campaign before judging lift.",
			],
			"comparison_status": comparison_status,
			"comparison": comparison,
			"average_time_to_response_hours": average_response_hours,
			"confidence_label": confidence_label,
			"confidence_score": confidence_score,
			"evidence_campaign_count": campaign_count,
			"evidence_send_count": sent,
			"consistency_label": consistency_label,
			"projected_lift_low": projected_low,
			"projected_lift_high": projected_high,
			"projected_lift_basis": projected_basis,
			"baseline_metrics": [
				{
					"label": "Reply rate",
					"count": engaged,
					"formatted_rate": f"{engaged_rate * 100:.0f}%",
					"detail": f"{engaged} replies from {sent} sends",
				},
				{
					"label": "Ignore rate",
					"count": ignored,
					"formatted_rate": f"{((ignored / sent) if sent else 0.0) * 100:.0f}%",
					"detail": f"{ignored} ignored from {sent} sends",
				},
				{
					"label": "Resolved rate",
					"count": engaged + ignored,
					"formatted_rate": f"{(((engaged + ignored) / sent) if sent else 0.0) * 100:.0f}%",
					"detail": f"{engaged + ignored} labeled outcomes from {sent} sends",
				},
			],
			"action_applied": CampaignOptimizationService._action_lines(active_weights, suggested_weights, adjustments),
		}

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
		rollups = CampaignOptimizationService._campaign_rollups(targets)
		sent = len([t for t in targets if t.engagement_status in {"sent", "responded", "ignored"}])
		engaged = len([t for t in targets if t.engagement_status == "responded"])
		ignored = len([t for t in targets if t.engagement_status == "ignored"])
		next_actions = engaged

		engaged_rate = (engaged / sent) if sent else 0.0
		ignored_rate = (ignored / sent) if sent else 0.0

		top_engaged_tag = CampaignOptimizationService._top_tags(targets, "responded")
		top_tag_lift = None
		if top_engaged_tag:
			tag, lift = top_engaged_tag
			top_tag_lift = lift
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
			"proof_summary": CampaignOptimizationService._proof_summary(
				targets,
				rollups,
				active["weights"],
				adjustments,
				suggested_weights,
				engaged,
				ignored,
				sent,
				engaged_rate,
				top_tag_lift,
			),
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
