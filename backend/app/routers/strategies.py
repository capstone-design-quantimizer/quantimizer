from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.strategy import (
    StrategyCreate,
    StrategyListResponse,
    StrategyRead,
    StrategyUpdate,
)
from app.services.strategies import create_strategy, delete_strategy, get_strategy, list_strategies, update_strategy
from app.utils.validators import parse_uuid

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.post("", response_model=StrategyRead, status_code=status.HTTP_201_CREATED)
def create_strategy_endpoint(
    strategy_in: StrategyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StrategyRead:
    strategy = create_strategy(db, current_user.id, strategy_in)
    return strategy


@router.get("", response_model=StrategyListResponse)
def list_strategies_endpoint(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StrategyListResponse:
    total, items = list_strategies(db, current_user.id, skip, limit)
    return StrategyListResponse(total=total, items=items)


@router.get("/{strategy_id}", response_model=StrategyRead)
def get_strategy_endpoint(
    strategy_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StrategyRead:
    strategy_uuid = parse_uuid(strategy_id)
    strategy = get_strategy(db, current_user.id, strategy_uuid)
    return strategy


@router.put("/{strategy_id}", response_model=StrategyRead)
def update_strategy_endpoint(
    strategy_id: str,
    strategy_in: StrategyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StrategyRead:
    strategy_uuid = parse_uuid(strategy_id)
    strategy = update_strategy(db, current_user.id, strategy_uuid, strategy_in)
    return strategy


@router.delete("/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_strategy_endpoint(
    strategy_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    strategy_uuid = parse_uuid(strategy_id)
    delete_strategy(db, current_user.id, strategy_uuid)