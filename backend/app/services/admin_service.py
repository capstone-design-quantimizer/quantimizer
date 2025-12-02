import json
import random
import time
import re
from datetime import date, timedelta, datetime
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.admin import Workload, WorkloadExecution
from app.services.strategy_execution import (
    _build_scored_sql,
    UniverseSpec,
    StrategySpec,
    FactorSpec,
    PortfolioSpec,
    RebalancingSpec,
    FACTOR_COLUMN_MAP,
)

def apply_db_configuration(db: Session, config: Dict[str, Any]) -> Dict[str, Any]:
    best_config = config.get("best_configuration", {})
    if not best_config:
        raise ValueError("Invalid JSON: 'best_configuration' missing")

    applied_keys = []
    errors = []
    key_pattern = re.compile(r"^[a-z0-9_]+$")

    db.commit()

    for key, value in best_config.items():
        if not key_pattern.match(key):
            errors.append(f"Skipped invalid key format: {key}")
            continue

        try:
            if isinstance(value, str):
                val_str = f"'{value}'"
            elif isinstance(value, bool):
                val_str = "'on'" if value else "'off'"
            else:
                val_str = str(value)

            query = text(f"ALTER SYSTEM SET {key} = {val_str}")
            db.execute(query)
            
            db.commit()
            applied_keys.append(key)

        except Exception as e:
            db.rollback()
            errors.append(f"Failed to set {key}: {str(e)}")

    try:
        db.execute(text("SELECT pg_reload_conf()"))
        db.commit()
    except Exception as e:
        db.rollback()
        errors.append(f"Reload failed: {str(e)}")

    restart_required = []
    try:
        restart_query = text("SELECT name FROM pg_settings WHERE pending_restart = true")
        restart_rows = db.execute(restart_query).fetchall()
        restart_required = [row[0] for row in restart_rows]
    except Exception as e:
        db.rollback()
        errors.append(f"Failed to check pending restarts: {str(e)}")

    return {
        "status": "success" if not errors else "partial_success",
        "message": "Configuration applied process completed.",
        "applied_count": len(applied_keys),
        "restart_required_params": restart_required,
        "errors": errors
    }

def _generate_random_workload_queries(count: int) -> List[Dict[str, Any]]:
    queries = []
    factor_keys = list(FACTOR_COLUMN_MAP.keys())
    markets = ["KOSPI", "KOSDAQ", "ALL"]
    
    base_date = date(2020, 1, 1)
    
    for _ in range(count):
        market = random.choice(markets)
        min_cap = random.choice([0, 10000000000, 50000000000])
        start_delta = random.randint(0, 365 * 2)
        duration = random.randint(30, 365)
        start_date = base_date + timedelta(days=start_delta)
        end_date = start_date + timedelta(days=duration)

        universe = UniverseSpec(market=market, min_market_cap=min_cap, excludes=[])
        
        num_factors = random.randint(1, 5)
        selected_factors = random.sample(factor_keys, num_factors)
        factors = [
            FactorSpec(name=f, direction=random.choice(["asc", "desc"]), weight=round(random.random(), 2))
            for f in selected_factors
        ]

        strategy = StrategySpec(
            factors=factors,
            portfolio=PortfolioSpec(top_n=20, weight_method="equal"),
            rebalancing=RebalancingSpec(frequency="monthly")
        )

        sql, params, _ = _build_scored_sql(universe, strategy, start_date, end_date)
        
        serializable_params = {k: v.isoformat() if isinstance(v, (date, datetime)) else v for k, v in params.items()}
        queries.append({"sql": sql, "params": serializable_params})

    return queries

def create_workload(db: Session, name: str, description: str, count: int) -> Workload:
    queries = _generate_random_workload_queries(count)
    workload = Workload(
        name=name,
        description=description,
        queries=queries
    )
    db.add(workload)
    db.commit()
    db.refresh(workload)
    return workload

def execute_workload(db: Session, workload_id: str) -> WorkloadExecution:
    workload = db.query(Workload).filter(Workload.id == workload_id).first()
    if not workload:
        raise ValueError("Workload not found")

    settings_query = text("SELECT name, setting FROM pg_settings")
    current_config = {row[0]: row[1] for row in db.execute(settings_query).fetchall()}

    start_time = time.perf_counter()
    
    for q in workload.queries:
        stmt = text(q["sql"])
        db.execute(stmt, q["params"])
    
    end_time = time.perf_counter()
    duration_ms = (end_time - start_time) * 1000

    execution = WorkloadExecution(
        workload_id=workload.id,
        execution_time_ms=duration_ms,
        db_config_snapshot=current_config
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    return execution