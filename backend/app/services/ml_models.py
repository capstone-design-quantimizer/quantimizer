from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models.ml_model import MLModel

STORAGE_ROOT = Path(__file__).resolve().parent.parent / "storage" / "models"


def upload_model(db: Session, owner_id: uuid.UUID, name: str, file: UploadFile) -> MLModel:
    if not file.filename or not file.filename.lower().endswith(".onnx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be an ONNX model")

    model_id = uuid.uuid4()
    user_dir = STORAGE_ROOT / str(owner_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_dir / f"{model_id}.onnx"

    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    model = MLModel(id=model_id, owner_id=owner_id, name=name, file_path=str(file_path))
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def list_models(db: Session, owner_id: uuid.UUID) -> list[MLModel]:
    return db.query(MLModel).filter(MLModel.owner_id == owner_id).order_by(MLModel.created_at.desc()).all()


def delete_model(db: Session, owner_id: uuid.UUID, model_id: uuid.UUID) -> None:
    model = db.query(MLModel).filter(MLModel.id == model_id, MLModel.owner_id == owner_id).one_or_none()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    file_path = Path(model.file_path)
    if file_path.exists():
        file_path.unlink()

    db.delete(model)
    db.commit()