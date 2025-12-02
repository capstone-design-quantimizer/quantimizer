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

class WorkloadDetailRead(WorkloadRead):
    queries: List[Dict[str, Any]]

class WorkloadExecutionRead(BaseModel):
    id: uuid.UUID
    workload_id: uuid.UUID
    execution_time_ms: float
    db_config_snapshot: Dict[str, Any]
    extended_metrics: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        orm_mode = True

class DBTuningLogRead(BaseModel):
    id: uuid.UUID
    applied_by: str
    filename: Optional[str]
    applied_at: datetime
    target_config: Dict[str, Any]
    backup_config: Dict[str, Any]
    is_reverted: bool
    reverted_at: Optional[datetime]

    class Config:
        orm_mode = True

class AdminLoginRequest(BaseModel):
    email: str
    password: str

class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str

class UserSummary(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    joined_at: datetime
    strategy_count: int
    backtest_count: int

    class Config:
        orm_mode = True

class AdminDashboardStats(BaseModel):
    total_users: int
    total_backtests: int
    total_strategies: int
    community_posts_today: int
    community_posts_total: int