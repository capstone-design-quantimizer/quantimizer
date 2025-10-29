from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.community import CommunityPost
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
    return db.query(CommunityPost).order_by(CommunityPost.created_at.desc()).all()


def get_post(db: Session, post_id: uuid.UUID) -> CommunityPost:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


def fork_post_strategy(db: Session, current_user_id: uuid.UUID, post: CommunityPost) -> Strategy:
    source_strategy = post.strategy
    return fork_strategy(db, current_user_id, source_strategy)