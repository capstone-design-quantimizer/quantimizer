from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.session import Base, engine
from app.routers import auth, backtests, community, ml_models, strategies

settings = get_settings()

app = FastAPI(title=settings.app_name)

origins = [
    "http://localhost:5173",   # Vite dev 서버
    "http://127.0.0.1:5173",
    "http://4.190.161.33",     # 배포된 프론트 주소 
    "https://4.190.161.33",    # HTTPS 접속 시
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
