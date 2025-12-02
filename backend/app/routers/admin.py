from typing import List
from datetime import datetime, date, time
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from sqlalchemy import func
import json
import uuid

from app.db.session import get_db
from app.core.security import get_current_user, create_access_token, verify_password
from app.models.user import User
from app.models.admin import Workload, WorkloadExecution
from app.models.backtest import BacktestResult
from app.models.strategy import Strategy
from app.models.community import CommunityPost
from app.schemas.admin import (
    DBTuneResult, 
    WorkloadCreate, 
    WorkloadRead, 
    WorkloadExecutionRead, 
    AdminDashboardStats,
    AdminLoginRequest,
    AdminLoginResponse,
    UserSummary
)
from app.services.admin_service import apply_db_configuration, create_workload, execute_workload
from app.services.users import get_user_by_email

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAIL = "admin@admin.com"

def check_admin(user: User):
    if user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")

@router.post("/auth/login", response_model=AdminLoginResponse)
def admin_login(
    login_data: AdminLoginRequest,
    db: Session = Depends(get_db)
):
    user = get_user_by_email(db, login_data.email)
    if not user or user.email != ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
        )
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    
    access_token = create_access_token(subject=str(user.id))
    
    return {"access_token": access_token, "token_type": "bearer"}

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

@router.get("/dashboard/stats", response_model=AdminDashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin(current_user)
    
    total_users = db.query(User).count()
    total_backtests = db.query(BacktestResult).count()
    total_strategies = db.query(Strategy).count()
    
    today_start = datetime.combine(date.today(), time.min)
    posts_today = db.query(CommunityPost).filter(CommunityPost.created_at >= today_start).count()
    posts_total = db.query(CommunityPost).count()
    
    return AdminDashboardStats(
        total_users=total_users,
        total_backtests=total_backtests,
        total_strategies=total_strategies,
        community_posts_today=posts_today,
        community_posts_total=posts_total
    )

@router.get("/users", response_model=List[UserSummary])
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin(current_user)
    
    users = db.query(User).all()
    result = []
    
    for u in users:
        s_count = db.query(Strategy).filter(Strategy.owner_id == u.id).count()
        b_count = db.query(BacktestResult).join(Strategy).filter(Strategy.owner_id == u.id).count()
        
        result.append(UserSummary(
            id=u.id,
            email=u.email,
            username=u.username,
            joined_at=u.created_at,
            strategy_count=s_count,
            backtest_count=b_count
        ))
    
    return result