import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.content_asset import (
    ContentAssetCreate,
    ContentAssetOut,
    ContentAssetUpdate,
    ContentFunnelGenerateResponse,
    FunnelCampaignCreate,
    FunnelCampaignOut,
    ImportMapRequest,
    ImportMapResponse,
    ImportUrlRequest,
    ImportUploadResponse,
)
from app.services.content_asset_service import ContentAssetService
from app.services.import_service import ImportService

router = APIRouter(tags=["content-assets"])


@router.get("/content-assets", response_model=list[ContentAssetOut])
def list_content_assets(db: Session = Depends(get_db)):
    return ContentAssetService.list_all(db)


@router.post("/content-assets", response_model=ContentAssetOut, status_code=201)
def create_content_asset(payload: ContentAssetCreate, db: Session = Depends(get_db)):
    return ContentAssetService.create(db, payload)


@router.get("/content-assets/{asset_id}", response_model=ContentAssetOut)
def get_content_asset(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    asset = ContentAssetService.get_by_id(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Content asset not found")
    return asset


@router.put("/content-assets/{asset_id}", response_model=ContentAssetOut)
def update_content_asset(asset_id: uuid.UUID, payload: ContentAssetUpdate, db: Session = Depends(get_db)):
    asset = ContentAssetService.update(db, asset_id, payload)
    if not asset:
        raise HTTPException(status_code=404, detail="Content asset not found")
    return asset


@router.post("/content-assets/{asset_id}/generate-funnel", response_model=ContentFunnelGenerateResponse)
def generate_funnel(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    asset = ContentAssetService.get_by_id(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Content asset not found")
    return ContentAssetService.generate_funnel(asset_id, db)


@router.get("/funnel-campaigns", response_model=list[FunnelCampaignOut])
def list_funnel_campaigns(db: Session = Depends(get_db)):
    return ContentAssetService.list_funnel_campaigns(db)


@router.post("/funnel-campaigns", response_model=FunnelCampaignOut, status_code=201)
def create_funnel_campaign(payload: FunnelCampaignCreate, db: Session = Depends(get_db)):
    return ContentAssetService.create_funnel_campaign(db, payload)


@router.post("/imports/map", response_model=ImportMapResponse)
def map_import(payload: ImportMapRequest):
    return ImportService.map_import(payload)


@router.post("/imports/upload", response_model=ImportUploadResponse)
async def upload_import(
    file: UploadFile = File(...),
    source_type: str = Form("contacts"),
    sheet_name: str | None = Form(None),
    header_row: int | None = Form(None),
    include_all_sheets: bool = Form(False),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        return ImportService.import_contacts_file(
            db,
            file_name=file.filename,
            file_bytes=payload,
            source_type=source_type,
            sheet_name=sheet_name,
            header_row=header_row,
            include_all_sheets=include_all_sheets,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("import upload failed")
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc


@router.post("/imports/url", response_model=ImportUploadResponse)
def import_from_url(payload: ImportUrlRequest, db: Session = Depends(get_db)):
    try:
        return ImportService.import_contacts_from_url(
            db,
            sheet_url=payload.sheet_url,
            source_type=payload.source_type,
            sheet_name=payload.sheet_name,
            header_row=payload.header_row,
            include_all_sheets=payload.include_all_sheets,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("import url failed")
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc
