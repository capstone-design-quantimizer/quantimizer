from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List

from pydantic import BaseModel, ConfigDict


class BacktestSettingBase(BaseModel):
    name: str
    market: str
    min_market_cap: Decimal
    exclude_list: List[str] = []
    start_date: date
    end_date: date
    initial_capital: Decimal


class BacktestSettingCreate(BacktestSettingBase):
    pass


class BacktestSettingRead(BacktestSettingBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BacktestSettingListResponse(BaseModel):
    total: int
    items: List[BacktestSettingRead]