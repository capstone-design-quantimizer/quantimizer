from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel
from .backtest_setting import BacktestSettingRead


class BacktestCreate(BaseModel):
    strategy_id: uuid.UUID
    setting_id: uuid.UUID
    ml_model_id: uuid.UUID | None = None


class BacktestRead(BaseModel):
    id: uuid.UUID
    strategy_id: uuid.UUID
    setting_id: uuid.UUID | None
    start_date: date
    end_date: date
    initial_capital: Decimal
    ml_model_id: uuid.UUID | None
    equity_curve: list[dict]
    metrics: dict
    created_at: datetime
    setting: BacktestSettingRead | None = None

    class Config:
        from_attributes = True


class BacktestListResponse(BaseModel):
    total: int
    items: list[BacktestRead]