import os
from types import SimpleNamespace
from uuid import uuid4

import pytest


os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")
os.environ.setdefault("SOFTWARE_ADMIN_TOKEN", "test-software-admin-token")


class FakeDb:
    def __init__(self):
        self.rows = []

    def add(self, row):
        self.rows.append(row)

    def commit(self):
        return None

    def refresh(self, row):
        return row


@pytest.fixture
def fake_db_factory():
    return FakeDb


@pytest.fixture
def fake_user():
    return SimpleNamespace(id=uuid4(), email="owner@example.com", workspace_id=uuid4())
