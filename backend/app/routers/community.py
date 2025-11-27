from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.community import (
    CommunityFeedItem,
    CommunityPostCreate,
    CommunityPostListResponse,
    CommunityPostRead,
    CommunityBacktestSummary,
    CommunityStrategySummary,
)
from app.schemas.strategy import StrategyRead
from app.services.community import (
    create_post,
    fork_post_strategy,
    get_last_backtest,
    get_last_backtests,
    get_post,
    list_posts,
)
from app.utils.validators import parse_uuid

router = APIRouter(prefix="/community", tags=["community"])


def _normalize_initial_capital(value: Decimal | float | int) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _build_strategy_summary(post) -> CommunityStrategySummary:
    strategy = post.strategy
    return CommunityStrategySummary(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description,
        strategy_json=strategy.strategy_json,
    )


def _build_backtest_summary(backtest) -> CommunityBacktestSummary | None:
    if not backtest:
        return None
    return CommunityBacktestSummary(
        id=backtest.id,
        strategy_id=backtest.strategy_id,
        start_date=backtest.start_date,
        end_date=backtest.end_date,
        initial_capital=_normalize_initial_capital(backtest.initial_capital),
        ml_model_id=backtest.ml_model_id,
        equity_curve=backtest.equity_curve,
        metrics=backtest.metrics,
        created_at=backtest.created_at,
    )


@router.post("/posts", response_model=CommunityPostRead, status_code=status.HTTP_201_CREATED)
def create_post_endpoint(
    post_in: CommunityPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommunityPostRead:
    post = create_post(db, current_user.id, post_in)
    last_backtest = get_last_backtest(db, post.strategy_id)
    return CommunityPostRead(
        id=post.id,
        strategy_id=post.strategy_id,
        title=post.title,
        content=post.content,
        created_at=post.created_at,
        author_id=post.author_id,
        author_username=post.author.username,
        strategy=_build_strategy_summary(post),
        last_backtest=_build_backtest_summary(last_backtest),
    )


@router.get("/posts", response_model=CommunityPostListResponse)
def list_posts_endpoint(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> CommunityPostListResponse:
    posts = list_posts(db)
    
    # Optimistic loading of last backtests.
    # Note: Requires DB migration to include 'setting_id' in backtest_results.
    strategy_ids = {post.strategy_id for post in posts}
    last_backtests = get_last_backtests(db, strategy_ids)
    
    items = [
        CommunityFeedItem(
            id=post.id,
            title=post.title,
            content=post.content,
            created_at=post.created_at,
            author_username=post.author.username,
            strategy=_build_strategy_summary(post),
            last_backtest=_build_backtest_summary(last_backtests.get(post.strategy_id)),
        )
        for post in posts
    ]
    return CommunityPostListResponse(items=items)


@router.post("/posts/{post_id}/fork", response_model=StrategyRead, status_code=status.HTTP_201_CREATED)
def fork_post_endpoint(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StrategyRead:
    post_uuid = parse_uuid(post_id)
    post = get_post(db, post_uuid)
    strategy = fork_post_strategy(db, current_user.id, post)
    return strategy