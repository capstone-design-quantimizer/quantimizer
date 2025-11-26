from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.backtest_setting import BacktestSetting
from app.models.user import User
from app.schemas.backtest_setting import (
    BacktestSettingCreate,
    BacktestSettingRead,
    BacktestSettingListResponse,
)
from app.utils.pagination import paginate

router = APIRouter(prefix="/backtest-settings", tags=["backtest-settings"])


@router.post("", response_model=BacktestSettingRead)
def create_setting(
    setting_in: BacktestSettingCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    setting = BacktestSetting(
        owner_id=current_user.id,
        name=setting_in.name,
        market=setting_in.market,
        min_market_cap=setting_in.min_market_cap,
        exclude_list=setting_in.exclude_list,
        start_date=setting_in.start_date,
        end_date=setting_in.end_date,
        initial_capital=setting_in.initial_capital,
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


@router.get("", response_model=BacktestSettingListResponse)
def list_settings(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 20,
):
    query = db.query(BacktestSetting).filter(BacktestSetting.owner_id == current_user.id).order_by(BacktestSetting.created_at.desc())
    return paginate(query, skip, limit)