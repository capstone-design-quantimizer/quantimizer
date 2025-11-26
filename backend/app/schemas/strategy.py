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
    def validate_strategy_json(cls, v: dict):
        if "definition" in v and isinstance(v["definition"], dict):
            d = v["definition"]
        else:
            d = v
            v = {"definition": dict(v)} 

        factors = d.get("factors", [])
        if not isinstance(factors, list) or len(factors) == 0:
            raise ValueError("At least one factor must be supplied")
        normalized = []
        for f in factors:
            f2 = dict(f)
            if "type" not in f2 and "name" in f2:
                f2["type"] = f2.pop("name")
            if "order" not in f2 and "direction" in f2:
                f2["order"] = f2.pop("direction")
            f2.setdefault("weight", 1.0)
            f2.setdefault("order", "desc")
            if f2["order"] not in ("asc", "desc"):
                raise ValueError("factor.order must be 'asc' or 'desc'")
            normalized.append(f2)
        v["definition"]["factors"] = normalized

        for key in ("portfolio", "rebalancing"):
            if key not in v["definition"] and key in d:
                v["definition"][key] = d[key]
        
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
        return StrategyBase.validate_strategy_json(v)


class StrategyRead(StrategyBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StrategyListResponse(BaseModel):
    total: int
    items: List[StrategyRead]