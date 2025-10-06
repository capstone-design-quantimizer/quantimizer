from fastapi import FastAPI

app = FastAPI(
    title="Quantimizer API",
    description="API for Quantimizer, the ML-based quantitative backtesting system.",
    version="0.1.0"
)

@app.get("/")
def read_root():
    return {"message": "Quantimizer Backend is running successfully!"}
