from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.backtest import BacktestResult
from app.models.backtest_setting import BacktestSetting
from app.models.ml_model import MLModel
from app.models.strategy import Strategy
from app.schemas.backtest import BacktestCreate
from app.services.strategy_execution import execute_strategy, StrategyExecutionError
from app.services.strategies import get_strategy
from app.utils.pagination import paginate


def create_backtest(db: Session, owner_id: uuid.UUID, backtest_in: BacktestCreate) -> BacktestResult:
    strategy = get_strategy(db, owner_id, backtest_in.strategy_id)
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")

    setting = (
        db.query(BacktestSetting)
        .filter(BacktestSetting.id == backtest_in.setting_id, BacktestSetting.owner_id == owner_id)
        .one_or_none()
    )
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest Setting not found")

    if backtest_in.ml_model_id:
        model = (
            db.query(MLModel)
            .filter(MLModel.id == backtest_in.ml_model_id, MLModel.owner_id == owner_id)
            .one_or_none()
        )
        if not model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    try:
        result_info = execute_strategy(
            db=db,
            strategy_json=strategy.strategy_json,
            setting=setting,
            strategy_id=strategy.id,
            ml_model_id=backtest_in.ml_model_id,
        )
    except StrategyExecutionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Backtest execution failed: {str(e)}")

    backtest_id = uuid.UUID(result_info["backtest_id"])
    backtest = (
        db.query(BacktestResult)
        .join(Strategy)
        .filter(BacktestResult.id == backtest_id, Strategy.owner_id == owner_id)
        .one_or_none()
    )
    if not backtest:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Backtest persistence failed")

    return backtest


def get_backtest(db: Session, owner_id: uuid.UUID, result_id: uuid.UUID) -> BacktestResult:
    backtest = (
        db.query(BacktestResult)
        .join(Strategy)
        .filter(BacktestResult.id == result_id, Strategy.owner_id == owner_id)
        .one_or_none()
    )
    if not backtest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest not found")
    return backtest


def list_backtests(db: Session, owner_id: uuid.UUID, skip: int, limit: int) -> tuple[int, list[BacktestResult]]:
    query = (
        db.query(BacktestResult)
        .join(Strategy)
        .filter(Strategy.owner_id == owner_id)
        .order_by(BacktestResult.created_at.desc())
    )
    return paginate(query, skip, limit)