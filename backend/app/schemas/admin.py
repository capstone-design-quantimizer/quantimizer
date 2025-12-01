from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Dict, Optional
from pydantic import BaseModel

class DBTuneResult(BaseModel):
    status: str
    message: str
    applied_count: int
    restart_required_params: List[str]
    errors: List[str]

class WorkloadCreate(BaseModel):
    name: str
    description: Optional[str] = None
    count: int = 100

class WorkloadRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    query_count: int
    created_at: datetime

    class Config:
        orm_mode = True

class WorkloadExecutionRead(BaseModel):
    id: uuid.UUID
    workload_id: uuid.UUID
    execution_time_ms: float
    db_config_snapshot: Dict[str, Any]
    created_at: datetime

    class Config:
        orm_mode = True