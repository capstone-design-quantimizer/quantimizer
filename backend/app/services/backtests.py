from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.backtest import BacktestResult
from app.models.ml_model import MLModel
from app.models.strategy import Strategy
from app.schemas.backtest import BacktestCreate
from app.services.strategy_execution import execute_strategy
from app.services.strategies import get_strategy
from app.utils.pagination import paginate


def create_backtest(db: Session, owner_id: uuid.UUID, backtest_in: BacktestCreate) -> BacktestResult:
    # 1) 기간 검증
    if backtest_in.end_date < backtest_in.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be after start_date")

    # 2) 전략 로드
    strategy = get_strategy(db, owner_id, backtest_in.strategy_id)
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")

    # 3) ML 모델 소유권 검증
    if backtest_in.ml_model_id:
        model = (
            db.query(MLModel)
            .filter(MLModel.id == backtest_in.ml_model_id, MLModel.owner_id == owner_id)
            .one_or_none()
        )
        if not model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    # 4) 초기 자본금
    init_cap = float(Decimal(str(backtest_in.initial_capital)))

    # 5) 실제 실행 (SQL → Backtesting.py)
    result_info = execute_strategy(
        db=db,
        strategy_json=strategy.strategy_json,
        start_date=backtest_in.start_date,
        end_date=backtest_in.end_date,
        initial_capital=init_cap,
        strategy_id=strategy.id,
    )

    # 6) 저장된 결과 로드 후 반환
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
