from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class CommunityPostCreate(BaseModel):
    strategy_id: uuid.UUID
    title: str
    content: str


class CommunityStrategySummary(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    strategy_json: dict


class CommunityBacktestSummary(BaseModel):
    id: uuid.UUID
    strategy_id: uuid.UUID
    start_date: date
    end_date: date
    initial_capital: float
    ml_model_id: uuid.UUID | None
    equity_curve: list[dict]
    metrics: dict
    created_at: datetime


class CommunityPostRead(BaseModel):
    id: uuid.UUID
    strategy_id: uuid.UUID
    title: str
    content: str
    created_at: datetime
    author_id: uuid.UUID
    author_username: str
    strategy: CommunityStrategySummary
    last_backtest: CommunityBacktestSummary | None

    class Config:
        orm_mode = True


class CommunityFeedItem(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    created_at: datetime
    author_username: str
    strategy: CommunityStrategySummary
    last_backtest: CommunityBacktestSummary | None


class CommunityPostListResponse(BaseModel):
    items: list[CommunityFeedItem]