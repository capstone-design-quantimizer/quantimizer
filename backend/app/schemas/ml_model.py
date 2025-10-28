from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class MLModelRead(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime

    class Config:
        orm_mode = True


class MLModelListResponse(BaseModel):
    items: list[MLModelRead]