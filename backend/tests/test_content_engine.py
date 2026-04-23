from types import SimpleNamespace
from uuid import uuid4

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
