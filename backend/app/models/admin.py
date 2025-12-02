from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base

class Workload(Base):
    __tablename__ = "workloads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    queries = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    executions = relationship("WorkloadExecution", back_populates="workload", cascade="all, delete-orphan")

class WorkloadExecution(Base):
    __tablename__ = "workload_executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workload_id = Column(UUID(as_uuid=True), ForeignKey("workloads.id"), nullable=False)
    execution_time_ms = Column(Float, nullable=False)
    db_config_snapshot = Column(JSONB, nullable=False)
    extended_metrics = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workload = relationship("Workload", back_populates="executions")

class DBTuningLog(Base):
    __tablename__ = "db_tuning_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    applied_by = Column(String, nullable=False)
    filename = Column(String, nullable=True)
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    
    target_config = Column(JSONB, nullable=False)

    backup_config = Column(JSONB, nullable=False)
    
    is_reverted = Column(Boolean, default=False)
    reverted_at = Column(DateTime(timezone=True), nullable=True)