from __future__ import annotations

from sqlalchemy.orm import Query


def paginate(query: Query, skip: int, limit: int) -> tuple[int, list]:
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return total, items