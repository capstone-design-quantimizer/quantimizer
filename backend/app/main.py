from __future__ import annotations

from datetime import date, timedelta
from math import sin
from typing import Dict, List

from fastapi import FastAPI
from pydantic import BaseModel


class EquityPoint(BaseModel):
    date: date
    equity: float
    drawdown: float


class BacktestResult(BaseModel):
    stats: Dict[str, float]
    equityCurve: List[EquityPoint]


app = FastAPI(
    title="Quantimizer API",
    description="API for Quantimizer, the ML-based quantitative backtesting system.",
    version="0.1.0",
)


@app.get("/")
def read_root() -> Dict[str, str]:
    return {"message": "Quantimizer Backend is running successfully!"}


@app.get("/backtest/mock", response_model=BacktestResult)
def get_mock_backtest() -> BacktestResult:
    base_equity = 10_000_000.0
    start = date(2020, 1, 1)

    equity_curve: List[EquityPoint] = []
    for index in range(250):
        current_date = start + timedelta(days=index * 7)
        growth_factor = 1 + index * 0.005 + sin(index / 15) * 0.05
        equity_value = base_equity * growth_factor
        drawdown = -abs(sin(index / 8) * 12)

        equity_curve.append(
            EquityPoint(
                date=current_date,
                equity=round(equity_value, 2),
                drawdown=round(drawdown, 2),
            )
        )

    stats: Dict[str, float] = {
        "Return (Ann.) [%]": 11.0,
        "Volatility (Ann.) [%]": 15.2,
        "Sharpe Ratio": 0.72,
        "Max. Drawdown [%]": -22.8,
        "Calmar Ratio": 0.48,
        "Win Rate [%]": 54.2,
        "Return [%]": 184.5,
        "Buy & Hold Return [%]": 121.3,
        "# Trades": 120,
    }

    return BacktestResult(stats=stats, equityCurve=equity_curve)
