from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base

class Workload(Base):
    __tablename__ = "workloads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    queries = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    executions = relationship("WorkloadExecution", back_populates="workload", cascade="all, delete-orphan")

class WorkloadExecution(Base):
    __tablename__ = "workload_executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workload_id = Column(UUID(as_uuid=True), ForeignKey("workloads.id"), nullable=False)
    execution_time_ms = Column(Float, nullable=False)
    db_config_snapshot = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    workload = relationship("Workload", back_populates="executions")