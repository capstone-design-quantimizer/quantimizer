from __future__ import annotations
from fastapi import FastAPI

from app.core.config import get_settings
from app.db.session import Base, engine
from app.routers import auth, backtests, community, ml_models, strategies

settings = get_settings()

app = FastAPI(title=settings.app_name)

@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)

@app.get("/")
def health_check() -> dict[str, str]:
    return {"message": "QuantiMizer backend is running"}

app.include_router(auth.router)
app.include_router(strategies.router)
app.include_router(backtests.router)
app.include_router(ml_models.router)
app.include_router(community.router)
