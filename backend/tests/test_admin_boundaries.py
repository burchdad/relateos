from app.core.permissions import ROLE_PERMISSIONS
from app.routes.admin import _support_permissions
from app.services.admin_service import WorkspaceAdminService


def test_workspace_admin_permissions_do_not_grant_software_admin_access():
    admin_permissions = ROLE_PERMISSIONS["admin"]

    assert "workspace:manage" in admin_permissions
    assert "connections:manage" in admin_permissions
    assert "software:admin" not in admin_permissions
    assert "platform:manage" not in admin_permissions


def test_member_and_viewer_cannot_manage_workspace_admin_surface():
    assert "workspace:manage" not in ROLE_PERMISSIONS["member"]
    assert "workspace:manage" not in ROLE_PERMISSIONS["viewer"]
    assert "members:manage" not in ROLE_PERMISSIONS["member"]
    assert "connections:manage" not in ROLE_PERMISSIONS["viewer"]


def test_support_access_never_receives_mutating_workspace_permissions():
    read_permissions = set(_support_permissions("support_read"))
    assist_permissions = set(_support_permissions("support_assist"))
    forbidden = {
        "contacts:write",
        "contacts:delete",
        "events:write",
        "imports:run",
        "automation:run",
        "connections:manage",
        "members:manage",
        "settings:manage",
        "workspace:manage",
    }

    assert forbidden.isdisjoint(read_permissions)
    assert forbidden.isdisjoint(assist_permissions)
    assert {"workspace:read", "connectors:read", "audit:read"}.issubset(read_permissions)
    assert {"contacts:assist", "tasks:assist", "messages:draft"}.issubset(assist_permissions)


def test_support_access_normalizes_unrecognized_access_level(fake_db_factory, fake_user):
    db = fake_db_factory()
    grant, token = WorkspaceAdminService.create_support_access(
        db,
        workspace_id=fake_user.workspace_id,
        created_by=fake_user,
        label="Helper",
        access_level="owner",
        expires_in_hours=1,
    )

    assert token.startswith("rso_support_")
    assert grant.access_level == "support_read"
    assert grant.workspace_id == fake_user.workspace_id
