from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.strategy import Strategy
from app.schemas.strategy import StrategyCreate, StrategyUpdate
from app.utils.pagination import paginate
from app.services.strategy_execution import parse_strategy, StrategyExecutionError


def create_strategy(db: Session, owner_id: uuid.UUID, strategy_in: StrategyCreate) -> Strategy:
    try:
        parse_strategy(strategy_in.strategy_json)
    except StrategyExecutionError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    strategy = Strategy(
        owner_id=owner_id,
        name=strategy_in.name,
        description=strategy_in.description,
        strategy_json=strategy_in.strategy_json,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy


def list_strategies(db: Session, owner_id: uuid.UUID, skip: int, limit: int) -> tuple[int, list[Strategy]]:
    query = db.query(Strategy).filter(Strategy.owner_id == owner_id).order_by(Strategy.created_at.desc())
    return paginate(query, skip, limit)


def get_strategy(db: Session, owner_id: uuid.UUID, strategy_id: uuid.UUID) -> Strategy:
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id, Strategy.owner_id == owner_id).one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    return strategy


def update_strategy(
    db: Session, owner_id: uuid.UUID, strategy_id: uuid.UUID, strategy_in: StrategyUpdate
) -> Strategy:
    strategy = get_strategy(db, owner_id, strategy_id)

    if strategy_in.name is not None:
        strategy.name = strategy_in.name
    if strategy_in.description is not None:
        strategy.description = strategy_in.description
    if strategy_in.strategy_json is not None:
        try:
            parse_strategy(strategy_in.strategy_json)
        except StrategyExecutionError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
        strategy.strategy_json = strategy_in.strategy_json

    db.commit()
    db.refresh(strategy)
    return strategy


def delete_strategy(db: Session, owner_id: uuid.UUID, strategy_id: uuid.UUID) -> None:
    strategy = get_strategy(db, owner_id, strategy_id)
    db.delete(strategy)
    db.commit()


def fork_strategy(db: Session, owner_id: uuid.UUID, source_strategy: Strategy) -> Strategy:
    new_strategy = Strategy(
        owner_id=owner_id,
        name=f"{source_strategy.name} (forked)",
        description=source_strategy.description,
        strategy_json=source_strategy.strategy_json,
    )
    db.add(new_strategy)
    db.commit()
    db.refresh(new_strategy)
    return new_strategy