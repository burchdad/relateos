from types import SimpleNamespace
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.services.campaign_optimization_service import CampaignOptimizationService
from app.services.followup_service import FollowUpSuggestionService
from app.services.targeting_service import TargetingService


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self.rows


class FakeDb:
    def __init__(self, relationships):
        self.relationships = relationships

    def query(self, _model):
        return FakeQuery(self.relationships)


def _relationship(rel_type: str, interests: str, priority_score: float, signals: list[str]):
    signal_rows = [SimpleNamespace(signal_key=signal, reason=f"signal:{signal}") for signal in signals]
    return SimpleNamespace(
        id=uuid4(),
        type=rel_type,
        priority_score=priority_score,
        person=SimpleNamespace(first_name="Alex", last_name="Morgan", metadata_json={"interests": interests}),
        signals=signal_rows,
    )


def test_targeting_score_prefers_overlap_and_positive_signals():
    content = SimpleNamespace(title="Investor financing playbook", description="duplex financing and off market strategy")
    high_fit = _relationship("investor", "duplex financing off market", 82.0, ["ACTIVE_DEAL", "RECENT_REPLY"])
    low_fit = _relationship("lead", "new construction", 12.0, [])

    high_score, high_reason = TargetingService._score_relationship(content, high_fit)
    low_score, _ = TargetingService._score_relationship(content, low_fit)

    assert high_score > low_score
    assert "Interest overlap" in high_reason


def test_followup_generation_returns_day_0_2_5_plan(monkeypatch):
    content_id = uuid4()
    relationship_id = uuid4()

    fake_content = SimpleNamespace(id=content_id, title="Weekly market update")
    fake_target = SimpleNamespace(content_id=content_id, relationship_id=relationship_id, reason="Strong market fit")
    fake_relationship = SimpleNamespace(
        id=relationship_id,
        person=SimpleNamespace(first_name="Jamie", last_name="Lee"),
    )

    monkeypatch.setattr(
        "app.services.followup_service.ContentService.get_content_by_id",
        lambda db, _content_id: fake_content,
    )
    monkeypatch.setattr(
        "app.services.followup_service.FollowUpSuggestionService._load_targets",
        lambda db, _content_id: [fake_target],
    )
    monkeypatch.setattr(
        "app.services.followup_service.AIService.generate_message_suggestion_with_style",
        lambda self, db, _relationship_id, goal, style_override=None: f"msg:{goal}",
    )

    db = FakeDb([fake_relationship])
    payload = FollowUpSuggestionService.generate_content_followups(db, content_id)

    assert str(payload["content_id"]) == str(content_id)
    labels = [step["label"] for step in payload["steps"]]
    assert labels == ["Day 0: Send replay", "Day 2: Send clip", "Day 5: Check-in"]
    assert all(step["targets"] for step in payload["steps"])


def test_campaign_insights_include_proof_summary(monkeypatch):
    now = datetime.now(timezone.utc)
    content_a = uuid4()
    content_b = uuid4()

    def _target(content_id, title, experiment_key, experiment_variant, status, sent_hours_ago, response_hours_after=None, tags=None):
        last_sent_at = now - timedelta(hours=sent_hours_ago)
        last_engagement_at = None
        if response_hours_after is not None:
            last_engagement_at = last_sent_at + timedelta(hours=response_hours_after)
        content = SimpleNamespace(
            id=content_id,
            title=title,
            experiment_key=experiment_key,
            experiment_variant=experiment_variant,
            created_at=last_sent_at,
        )
        return SimpleNamespace(
            content_id=content_id,
            relationship_id=uuid4(),
            engagement_status=status,
            last_sent_at=last_sent_at,
            last_engagement_at=last_engagement_at,
            created_at=last_sent_at,
            content=content,
            relationship=SimpleNamespace(person=SimpleNamespace(tags=tags or {})),
        )

    targets = [
        _target(content_a, "Dallas Control", "dallas-proof", "control", "responded", 10, response_hours_after=5, tags={"investor": True}),
        _target(content_a, "Dallas Control", "dallas-proof", "control", "responded", 9, response_hours_after=4, tags={"investor": True}),
        _target(content_a, "Dallas Control", "dallas-proof", "control", "ignored", 8, tags={"broker": True}),
        _target(content_a, "Dallas Control", "dallas-proof", "control", "ignored", 7, tags={"broker": True}),
        _target(content_a, "Dallas Control", "dallas-proof", "control", "sent", 7, tags={"broker": True}),
        _target(content_a, "Dallas Control", "dallas-proof", "control", "sent", 7, tags={"broker": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "responded", 6, response_hours_after=2, tags={"investor": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "ignored", 5, tags={"lead": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "responded", 4, response_hours_after=1, tags={"investor": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "responded", 3, response_hours_after=2, tags={"investor": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "ignored", 2, tags={"lead": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "responded", 1, response_hours_after=2, tags={"investor": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "responded", 1, response_hours_after=2, tags={"investor": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "responded", 1, response_hours_after=1, tags={"investor": True}),
        _target(content_b, "Dallas Optimized", "dallas-proof", "optimized", "sent", 1, tags={"lead": True}),
    ]

    monkeypatch.setattr(
        "app.services.campaign_optimization_service.CampaignOptimizationService._campaign_targets",
        lambda db: targets,
    )
    monkeypatch.setattr(
        "app.services.campaign_optimization_service.CampaignOptimizationService._message_style_insight",
        lambda db, relationship_ids: "Softer follow-ups converted better.",
    )
    monkeypatch.setattr(
        "app.services.campaign_optimization_service.get_active_signal_preset",
        lambda db: {
            "active_preset": "balanced",
            "weights": {"RECENT_REPLY": 12.0, "NEGATIVE_SENTIMENT": -8.0, "NO_CONTACT_21_DAYS": -6.0},
        },
    )

    payload = CampaignOptimizationService.build_insights(SimpleNamespace())

    assert payload["sent_count"] == 15
    assert payload["proof_summary"]["sample_size_valid"] is True
    assert payload["proof_summary"]["confidence_label"] in {"Medium", "High"}
    assert payload["proof_summary"]["average_time_to_response_hours"] == 2.4
    assert payload["proof_summary"]["projected_lift_low"] is not None
    assert payload["proof_summary"]["projected_lift_high"] is not None
    assert payload["proof_summary"]["baseline_metrics"][0]["detail"] == "8 replies from 15 sends"
    assert payload["proof_summary"]["action_applied"]
    assert payload["proof_summary"]["comparison"]["experiment_key"] == "dallas-proof"
    assert payload["proof_summary"]["comparison"]["winning_strategy"] == "Optimized"
