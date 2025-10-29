from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.backtest import BacktestCreate, BacktestListResponse, BacktestRead
from app.services.backtests import create_backtest, get_backtest, list_backtests
from app.utils.validators import parse_uuid

router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("", response_model=BacktestRead, status_code=status.HTTP_201_CREATED)
def create_backtest_endpoint(
    backtest_in: BacktestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BacktestRead:
    result = create_backtest(db, current_user.id, backtest_in)
    return result


@router.get("/{result_id}", response_model=BacktestRead)
def get_backtest_endpoint(
    result_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BacktestRead:
    result_uuid = parse_uuid(result_id)
    result = get_backtest(db, current_user.id, result_uuid)
    return result


@router.get("", response_model=BacktestListResponse)
def list_backtests_endpoint(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BacktestListResponse:
    total, items = list_backtests(db, current_user.id, skip, limit)
    return BacktestListResponse(total=total, items=items)