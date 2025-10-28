from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class BacktestCreate(BaseModel):
    strategy_id: uuid.UUID
    start_date: date
    end_date: date
    initial_capital: Decimal
    ml_model_id: uuid.UUID | None = None


class BacktestRead(BaseModel):
    id: uuid.UUID
    strategy_id: uuid.UUID
    start_date: date
    end_date: date
    initial_capital: Decimal
    ml_model_id: uuid.UUID | None
    equity_curve: list[dict]
    metrics: dict
    created_at: datetime

    class Config:
        orm_mode = True


class BacktestListResponse(BaseModel):
    total: int
    items: list[BacktestRead]