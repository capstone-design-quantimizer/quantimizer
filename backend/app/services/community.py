from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.community import CommunityPost
from app.models.backtest import BacktestResult
from app.models.strategy import Strategy
from app.schemas.community import CommunityPostCreate
from app.services.strategies import fork_strategy, get_strategy


def create_post(db: Session, author_id: uuid.UUID, post_in: CommunityPostCreate) -> CommunityPost:
    strategy = get_strategy(db, author_id, post_in.strategy_id)
    post = CommunityPost(
        author_id=author_id,
        strategy_id=strategy.id,
        title=post_in.title,
        content=post_in.content,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def list_posts(db: Session) -> list[CommunityPost]:
    return (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author),
            joinedload(CommunityPost.strategy),
        )
        .order_by(CommunityPost.created_at.desc())
        .all()
    )


def get_post(db: Session, post_id: uuid.UUID) -> CommunityPost:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


def fork_post_strategy(db: Session, current_user_id: uuid.UUID, post: CommunityPost) -> Strategy:
    source_strategy = post.strategy
    return fork_strategy(db, current_user_id, source_strategy)


def get_last_backtest(db: Session, strategy_id: uuid.UUID) -> BacktestResult | None:
    return (
        db.query(BacktestResult)
        .filter(BacktestResult.strategy_id == strategy_id)
        .order_by(BacktestResult.created_at.desc())
        .first()
    )


def get_last_backtests(db: Session, strategy_ids: set[uuid.UUID]) -> dict[uuid.UUID, BacktestResult]:
    if not strategy_ids:
        return {}

    latest_subquery = (
        db.query(
            BacktestResult.strategy_id.label("strategy_id"),
            func.max(BacktestResult.created_at).label("created_at"),
        )
        .filter(BacktestResult.strategy_id.in_(strategy_ids))
        .group_by(BacktestResult.strategy_id)
        .subquery()
    )

    rows = (
        db.query(BacktestResult)
        .join(
            latest_subquery,
            (BacktestResult.strategy_id == latest_subquery.c.strategy_id)
            & (BacktestResult.created_at == latest_subquery.c.created_at),
        )
        .all()
    )

    return {row.strategy_id: row for row in rows}