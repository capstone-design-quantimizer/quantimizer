from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.strategy import Strategy
from app.models.user import User
from app.schemas.strategy import StrategyCreate, StrategyRead, StrategyUpdate, StrategyListResponse
from app.services.strategy_execution import parse_strategy, StrategyExecutionError
from app.utils.pagination import paginate

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.post("", response_model=StrategyRead)
def create_strategy(
    strategy_in: StrategyCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        parse_strategy(strategy_in.strategy_json)
    except StrategyExecutionError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    strategy = Strategy(
        owner_id=current_user.id,
        name=strategy_in.name,
        description=strategy_in.description,
        strategy_json=strategy_in.strategy_json,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy


@router.get("", response_model=StrategyListResponse)
def list_strategies(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 20,
):
    query = db.query(Strategy).filter(Strategy.owner_id == current_user.id).order_by(Strategy.created_at.desc())
    total, items = paginate(query, skip, limit)
    return StrategyListResponse(total=total, items=items)


@router.get("/{strategy_id}", response_model=StrategyRead)
def get_strategy(
    strategy_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    strategy = (
        db.query(Strategy)
        .filter(Strategy.id == strategy_id, Strategy.owner_id == current_user.id)
        .one_or_none()
    )
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    return strategy


@router.put("/{strategy_id}", response_model=StrategyRead)
def update_strategy(
    strategy_id: uuid.UUID,
    strategy_in: StrategyUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    strategy = (
        db.query(Strategy)
        .filter(Strategy.id == strategy_id, Strategy.owner_id == current_user.id)
        .one_or_none()
    )
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")

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


@router.delete("/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_strategy(
    strategy_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    strategy = (
        db.query(Strategy)
        .filter(Strategy.id == strategy_id, Strategy.owner_id == current_user.id)
        .one_or_none()
    )
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    db.delete(strategy)
    db.commit()


@router.post("/fork", response_model=StrategyRead)
def fork_strategy(
    source_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    source = db.query(Strategy).filter(Strategy.id == source_id).one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source strategy not found")
    
    new_strategy = Strategy(
        owner_id=current_user.id,
        name=f"{source.name} (forked)",
        description=source.description,
        strategy_json=source.strategy_json,
    )
    db.add(new_strategy)
    db.commit()
    db.refresh(new_strategy)
    return new_strategy