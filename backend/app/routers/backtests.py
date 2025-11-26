from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.backtest import BacktestResult
from app.models.backtest_setting import BacktestSetting
from app.models.strategy import Strategy
from app.models.user import User
from app.schemas.backtest import BacktestCreate, BacktestRead, BacktestListResponse
from app.services.strategy_execution import execute_strategy, StrategyExecutionError
from app.utils.pagination import paginate

router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("", response_model=BacktestRead)
def run_backtest(
    backtest_in: BacktestCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    strategy = db.query(Strategy).filter(Strategy.id == backtest_in.strategy_id, Strategy.owner_id == current_user.id).one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    setting = db.query(BacktestSetting).filter(BacktestSetting.id == backtest_in.setting_id, BacktestSetting.owner_id == current_user.id).one_or_none()
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest settings not found")

    try:
        result_info = execute_strategy(
            db=db,
            strategy_json=strategy.strategy_json,
            setting=setting,
            strategy_id=strategy.id,
            ml_model_id=backtest_in.ml_model_id
        )
    except StrategyExecutionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Backtest execution failed: {str(e)}")

    backtest_id = uuid.UUID(result_info["backtest_id"])
    backtest = (
        db.query(BacktestResult)
        .filter(BacktestResult.id == backtest_id)
        .one_or_none()
    )
    if not backtest:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Backtest persistence failed")

    return backtest


@router.get("", response_model=BacktestListResponse)
def list_my_backtests(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 20,
):
    query = (
        db.query(BacktestResult)
        .join(Strategy)
        .filter(Strategy.owner_id == current_user.id)
        .order_by(BacktestResult.created_at.desc())
    )
    return paginate(query, skip, limit)