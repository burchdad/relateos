from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.connections import (
    AgentSyncRequest,
    AgentSyncResponse,
    ConnectionsOverview,
    ConnectorKey,
    ConnectorStatus,
    ConnectorUpdateRequest,
    ConnectorUpdateResponse,
)
from app.services.connections_service import ConnectionsService


router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=ConnectionsOverview)
def get_connections(db: Session = Depends(get_db)):
    return ConnectionsOverview.model_validate(ConnectionsService.overview(db))


@router.post("/agent-sync", response_model=AgentSyncResponse)
def request_agent_sync(payload: AgentSyncRequest, db: Session = Depends(get_db)):
    return AgentSyncResponse.model_validate(ConnectionsService.request_agent_sync(db, payload.mode))


@router.get("/{connector_key}", response_model=ConnectorStatus)
def get_connector(connector_key: ConnectorKey, db: Session = Depends(get_db)):
    return ConnectorStatus.model_validate(ConnectionsService.connector_status(db, connector_key))


@router.put("/{connector_key}", response_model=ConnectorUpdateResponse)
def update_connector(connector_key: ConnectorKey, payload: ConnectorUpdateRequest, db: Session = Depends(get_db)):
    return ConnectorUpdateResponse.model_validate(ConnectionsService.update_connector(db, connector_key, payload))
