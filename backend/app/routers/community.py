from __future__ import annotations

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
)
from app.schemas.strategy import StrategyRead
from app.services.community import create_post, fork_post_strategy, get_post, list_posts
from app.utils.validators import parse_uuid

router = APIRouter(prefix="/community", tags=["community"])


@router.post("/posts", response_model=CommunityPostRead, status_code=status.HTTP_201_CREATED)
def create_post_endpoint(
    post_in: CommunityPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommunityPostRead:
    post = create_post(db, current_user.id, post_in)
    return CommunityPostRead(
        id=post.id,
        strategy_id=post.strategy_id,
        title=post.title,
        content=post.content,
        created_at=post.created_at,
        author_id=post.author_id,
        author_username=post.author.username,
    )


@router.get("/posts", response_model=CommunityPostListResponse)
def list_posts_endpoint(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> CommunityPostListResponse:
    posts = list_posts(db)
    items = [
        CommunityFeedItem(
            id=post.id,
            title=post.title,
            content=post.content,
            created_at=post.created_at,
            author_username=post.author.username,
            strategy={"name": post.strategy.name, "description": post.strategy.description},
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