from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ml_model import MLModelListResponse, MLModelRead
from app.services.ml_models import delete_model, list_models, upload_model
from app.utils.validators import parse_uuid

router = APIRouter(prefix="/models", tags=["models"])


@router.post("/upload", response_model=MLModelRead, status_code=status.HTTP_201_CREATED)
def upload_model_endpoint(
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MLModelRead:
    model = upload_model(db, current_user.id, name, file)
    return model


@router.get("", response_model=MLModelListResponse)
def list_models_endpoint(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> MLModelListResponse:
    models = list_models(db, current_user.id)
    return MLModelListResponse(items=models)


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model_endpoint(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    model_uuid = parse_uuid(model_id)
    delete_model(db, current_user.id, model_uuid)