from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class CommunityPostCreate(BaseModel):
    strategy_id: uuid.UUID
    title: str
    content: str


class CommunityPostRead(BaseModel):
    id: uuid.UUID
    strategy_id: uuid.UUID
    title: str
    content: str
    created_at: datetime
    author_id: uuid.UUID
    author_username: str

    class Config:
        orm_mode = True


class CommunityFeedItem(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    created_at: datetime
    author_username: str
    strategy: dict


class CommunityPostListResponse(BaseModel):
    items: list[CommunityFeedItem]