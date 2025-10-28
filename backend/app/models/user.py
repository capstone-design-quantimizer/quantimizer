from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:  # pragma: no cover - type checking only
    from app.models.community import CommunityPost
    from app.models.ml_model import MLModel
    from app.models.strategy import Strategy


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    strategies: Mapped[list["Strategy"]] = relationship(
        "Strategy", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )
    models: Mapped[list["MLModel"]] = relationship(
        "MLModel", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )
    posts: Mapped[list["CommunityPost"]] = relationship(
        "CommunityPost", back_populates="author", cascade="all, delete-orphan", passive_deletes=True
    )