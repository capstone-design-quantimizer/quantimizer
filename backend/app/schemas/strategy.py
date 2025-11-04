from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field, ConfigDict, field_validator


class StrategyBase(BaseModel):
    name: str
    description: Optional[str] = None
    strategy_json: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("strategy_json")
    @classmethod
    def validate_strategy_json(cls, v: Dict[str, Any]):
        try:
            factors = v.get("definition", {}).get("factors", [])
            if not factors:
                raise ValueError("At least one factor must be supplied")
        except Exception:
            raise ValueError("Strategy JSON must include 'definition.factors' with at least one factor")
        return v


class StrategyCreate(StrategyBase):
    pass


class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    strategy_json: Optional[Dict[str, Any]] = None

    @field_validator("strategy_json")
    @classmethod
    def validate_strategy_json_on_update(cls, v: Optional[Dict[str, Any]]):
        if v is None:
            return v
        factors = v.get("definition", {}).get("factors", [])
        if not factors:
            raise ValueError("At least one factor must be supplied")
        return v


class StrategyRead(StrategyBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StrategyListResponse(BaseModel):
    total: int
    items: List[StrategyRead]
