from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    username: str


class UserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    created_at: datetime

    class Config:
        orm_mode = True