from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StrategyBase(BaseModel):
    name: str
    description: str | None = None
    strategy_json: dict = Field(default_factory=dict)


class StrategyCreate(StrategyBase):
    pass


class StrategyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    strategy_json: dict | None = None


class StrategyRead(StrategyBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class StrategyListResponse(BaseModel):
    total: int
    items: list[StrategyRead]