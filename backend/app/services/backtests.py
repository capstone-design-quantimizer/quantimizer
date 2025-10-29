from __future__ import annotations

import random
import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.backtest import BacktestResult
from app.models.ml_model import MLModel
from app.models.strategy import Strategy
from app.schemas.backtest import BacktestCreate
from app.services.strategies import get_strategy
from app.utils.pagination import paginate


def _generate_equity_curve(start_date: date, end_date: date, initial_capital: float) -> list[dict]:
    delta = end_date - start_date
    days = max(delta.days, 1)
    step = max(days // 30, 1)
    curve = []
    equity = initial_capital
    for offset in range(0, days + 1, step):
        current_date = start_date + timedelta(days=offset)
        drift = 1 + 0.0005 * offset
        noise = random.uniform(-0.02, 0.02)
        equity *= drift + noise
        curve.append({"date": current_date.isoformat(), "equity": round(equity, 2)})
    if curve[-1]["date"] != end_date.isoformat():
        curve.append({"date": end_date.isoformat(), "equity": round(equity * 1.01, 2)})
    return curve


def _generate_metrics(curve: list[dict]) -> dict:
    returns = [point["equity"] for point in curve]
    if not returns:
        return {}
    total_return = (returns[-1] - returns[0]) / returns[0]
    max_drawdown = min(random.uniform(-0.3, -0.05), -0.01)
    volatility = abs(random.uniform(0.05, 0.25))
    sharpe = total_return / (volatility if volatility else 1)
    return {
        "total_return": round(total_return, 4),
        "max_drawdown": round(max_drawdown, 4),
        "volatility": round(volatility, 4),
        "sharpe": round(sharpe, 4),
    }


def create_backtest(db: Session, owner_id: uuid.UUID, backtest_in: BacktestCreate) -> BacktestResult:
    if backtest_in.end_date < backtest_in.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be after start_date")

    strategy = get_strategy(db, owner_id, backtest_in.strategy_id)

    if backtest_in.ml_model_id:
        model_exists = (
            db.query(MLModel)
            .filter(MLModel.id == backtest_in.ml_model_id, MLModel.owner_id == owner_id)
            .one_or_none()
        )
        if not model_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    initial_capital_amount = (
        backtest_in.initial_capital
        if isinstance(backtest_in.initial_capital, Decimal)
        else Decimal(str(backtest_in.initial_capital))
    )
    initial_capital_float = float(initial_capital_amount)

    equity_curve = _generate_equity_curve(
        backtest_in.start_date, backtest_in.end_date, initial_capital_float
    )
    metrics = _generate_metrics(equity_curve)

    result = BacktestResult(
        strategy_id=strategy.id,
        start_date=backtest_in.start_date,
        end_date=backtest_in.end_date,
        initial_capital=initial_capital_amount,
        ml_model_id=backtest_in.ml_model_id,
        equity_curve=equity_curve,
        metrics=metrics,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


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