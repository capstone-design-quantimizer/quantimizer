from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import json
import uuid

from app.db.session import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.admin import Workload, WorkloadExecution
from app.schemas.admin import DBTuneResult, WorkloadCreate, WorkloadRead, WorkloadExecutionRead
from app.services.admin_service import apply_db_configuration, create_workload, execute_workload

router = APIRouter(prefix="/admin", tags=["admin"])

def check_admin(user: User):
    if user.email != "admin@admin.com":
        raise HTTPException(status_code=403, detail="Admin access required")

@router.post("/tune", response_model=DBTuneResult)
async def tune_database(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin(current_user)
    try:
        content = await file.read()
        config_data = json.loads(content)
        return apply_db_configuration(db, config_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/workloads", response_model=WorkloadRead)
def create_new_workload(
    workload_in: WorkloadCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin(current_user)
    try:
        wl = create_workload(db, workload_in.name, workload_in.description, workload_in.count)
        return WorkloadRead(
            id=wl.id, name=wl.name, description=wl.description,
            query_count=len(wl.queries), created_at=wl.created_at
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workloads", response_model=List[WorkloadRead])
def list_workloads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin(current_user)
    workloads = db.query(Workload).order_by(Workload.created_at.desc()).all()
    return [
        WorkloadRead(
            id=w.id, name=w.name, description=w.description,
            query_count=len(w.queries), created_at=w.created_at
        ) for w in workloads
    ]

@router.post("/workloads/{workload_id}/execute", response_model=WorkloadExecutionRead)
def run_workload(
    workload_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin(current_user)
    try:
        return execute_workload(db, str(workload_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Workload not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/executions", response_model=List[WorkloadExecutionRead])
def list_executions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin(current_user)
    execs = db.query(WorkloadExecution).order_by(WorkloadExecution.created_at.desc()).all()
    return execs