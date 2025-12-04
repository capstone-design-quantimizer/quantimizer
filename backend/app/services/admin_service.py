import json
import random
import time
import re
from datetime import date, timedelta, datetime
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.admin import Workload, WorkloadExecution, DBTuningLog
from app.services.strategy_execution import (
    _build_scored_sql,
    UniverseSpec,
    StrategySpec,
    FactorSpec,
    PortfolioSpec,
    RebalancingSpec,
    FACTOR_COLUMN_MAP,
)


def _get_current_params(db: Session, keys: List[str]) -> Dict[str, str]:
    if not keys:
        return {}
    
    params_str = ",".join([f"'{k}'" for k in keys])
    query = text(f"SELECT name, setting FROM pg_settings WHERE name IN ({params_str})")
    rows = db.execute(query).fetchall()
    return {row[0]: row[1] for row in rows}


def apply_db_configuration(db: Session, config: Dict[str, Any], applied_by: str = "system", filename: str = None) -> Dict[str, Any]:
    best_config = config.get("best_configuration", config)
    if not best_config:
        raise ValueError("Invalid configuration data")

    applied_system_keys: List[str] = []
    applied_session_keys: List[str] = []
    errors: List[str] = []
    key_pattern = re.compile(r"^[a-z0-9_]+$")

    target_keys = [k for k in best_config.keys() if key_pattern.match(k)]
    backup_config = _get_current_params(db, target_keys)

    log_entry = DBTuningLog(
        applied_by=applied_by,
        filename=filename,
        target_config=best_config,
        backup_config=backup_config,
        applied_at=datetime.now()
    )
    db.add(log_entry)
    
    valid_names = None
    try:
        rows = db.execute(text("SELECT name FROM pg_settings")).fetchall()
        valid_names = {row[0] for row in rows}
    except Exception as e:
        errors.append(f"Failed to load pg_settings: {str(e)}")

    for key, value in best_config.items():
        if key not in target_keys:
            continue

        if valid_names is not None and key not in valid_names:
            errors.append(f"Skipped unknown parameter: {key}")
            continue

        val_str = f"'{value}'" if isinstance(value, str) else str(value)

        system_applied = False
        try:
            with db.begin_nested():
                db.execute(text(f"ALTER SYSTEM SET {key} = {val_str}"))
            applied_system_keys.append(key)
            system_applied = True
        except Exception as e:
            errors.append(f"ALTER SYSTEM failed for {key}: {str(e)}")

        if not system_applied:
            try:
                with db.begin_nested():
                    db.execute(text(f"SET {key} = {val_str}"))
                applied_session_keys.append(key)
            except Exception as e:
                errors.append(f"SET failed for {key}: {str(e)}")

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        errors.append(f"Final commit failed: {str(e)}")

    restart_required: List[str] = []
    if applied_system_keys:
        try:
            with db.begin_nested():
                db.execute(text("SELECT pg_reload_conf()"))
            rows = db.execute(
                text("SELECT name FROM pg_settings WHERE pending_restart = true")
            ).fetchall()
            restart_required = [row[0] for row in rows]
            db.commit()
        except Exception as e:
            db.rollback()
            errors.append(f"Reload or pending restart check failed: {str(e)}")

    total_applied = len(applied_system_keys) + len(applied_session_keys)
    status = "failed" if errors and total_applied == 0 else "partial_success" if errors else "success"

    return {
        "status": status,
        "message": "Configuration apply process completed.",
        "applied_count": total_applied,
        "restart_required_params": restart_required,
        "errors": errors,
    }

def restore_db_configuration(db: Session, log_id: str, applied_by: str) -> Dict[str, Any]:
    log = db.query(DBTuningLog).filter(DBTuningLog.id == log_id).first()
    if not log:
        raise ValueError("Log not found")
    
    if log.is_reverted:
        raise ValueError("Already reverted")

    result = apply_db_configuration(db, log.backup_config, applied_by=f"{applied_by} (Restore)")
    
    log.is_reverted = True
    log.reverted_at = datetime.now()
    db.commit()

    return result

def _generate_workload_queries(count: int, workload_type: str = "MIXED") -> List[Dict[str, Any]]:
    queries = []
    factor_keys = list(FACTOR_COLUMN_MAP.keys())
    markets = ["KOSPI", "KOSDAQ", "ALL"]
    base_date = date(2020, 1, 1)

    for _ in range(count):
        start_delta = random.randint(0, 365 * 2)
        duration = random.randint(30, 365)
        start_date = base_date + timedelta(days=start_delta)
        end_date = start_date + timedelta(days=duration)

        universe = None
        strategy = None

        if workload_type == "FUNDAMENTAL":
            # Type 1: Fundamental Composite
            # KOSPI/KOSDAQ Large-cap, PER/PBR/EPS/DividendYield
            market = random.choice(["KOSPI", "KOSDAQ"])
            universe = UniverseSpec(market=market, min_market_cap=50000000000, excludes=[])
            
            factors = [
                FactorSpec(name="PER", direction="asc", weight=0.3),
                FactorSpec(name="PBR", direction="asc", weight=0.2),
                FactorSpec(name="EPS", direction="desc", weight=0.3),
                FactorSpec(name="DIVIDENDYIELD", direction="desc", weight=0.2),
            ]
            strategy = StrategySpec(
                factors=factors,
                portfolio=PortfolioSpec(top_n=20, weight_method="equal"),
                rebalancing=RebalancingSpec(frequency="monthly"),
            )

        elif workload_type == "MOMENTUM":
            # Type 2: Momentum Trend
            # Large Universe, Momentum_3M & Momentum_12M
            universe = UniverseSpec(market="ALL", min_market_cap=100000000000, excludes=[])
            factors = [
                FactorSpec(name="MOMENTUM_3M", direction="desc", weight=0.5),
                FactorSpec(name="MOMENTUM_12M", direction="desc", weight=0.5),
            ]
            strategy = StrategySpec(
                factors=factors,
                portfolio=PortfolioSpec(top_n=30, weight_method="market_cap"),
                rebalancing=RebalancingSpec(frequency="monthly"),
            )

        elif workload_type == "SMALLCAP":
            # Type 3: High-turnover Small Cap
            # Small-cap Universe (represented by min_cap=0 and assuming universe selection), Momentum + PER
            universe = UniverseSpec(market="ALL", min_market_cap=0, excludes=[])
            factors = [
                FactorSpec(name="MOMENTUM_3M", direction="desc", weight=0.6),
                FactorSpec(name="PER", direction="asc", weight=0.4),
            ]
            strategy = StrategySpec(
                factors=factors,
                portfolio=PortfolioSpec(top_n=50, weight_method="equal"),
                rebalancing=RebalancingSpec(frequency="monthly"), # High-turnover simulation via query freq
            )

        else:
            # MIXED / Random
            market = random.choice(markets)
            min_cap = random.choice([0, 10000000000, 50000000000])
            universe = UniverseSpec(market=market, min_market_cap=min_cap, excludes=[])
            
            num_factors = random.randint(1, 5)
            selected_factors = random.sample(factor_keys, num_factors)
            factors = [
                FactorSpec(
                    name=f,
                    direction=random.choice(["asc", "desc"]),
                    weight=round(random.random(), 2),
                )
                for f in selected_factors
            ]
            strategy = StrategySpec(
                factors=factors,
                portfolio=PortfolioSpec(top_n=20, weight_method="equal"),
                rebalancing=RebalancingSpec(frequency="monthly"),
            )

        sql, params, _ = _build_scored_sql(universe, strategy, start_date, end_date)

        serializable_params = {
            k: v.isoformat() if isinstance(v, (date, datetime)) else v
            for k, v in params.items()
        }
        queries.append({"sql": sql, "params": serializable_params})

    return queries


def create_workload(db: Session, name: str, description: str, count: int, workload_type: str = "MIXED") -> Workload:
    queries = _generate_workload_queries(count, workload_type)
    workload = Workload(
        name=name, 
        description=description, 
        queries=queries,
        created_at=datetime.now()
    )
    db.add(workload)
    db.commit()
    db.refresh(workload)
    return workload


def _get_pg_stats(db: Session) -> Dict[str, Any]:
    query = text("""
        SELECT 
            coalesce(sum(blks_hit), 0) as blks_hit, 
            coalesce(sum(blks_read), 0) as blks_read, 
            coalesce(sum(tup_returned), 0) as tup_returned, 
            coalesce(sum(tup_fetched), 0) as tup_fetched,
            coalesce(sum(xact_commit), 0) as xact_commit,
            coalesce(sum(xact_rollback), 0) as xact_rollback
        FROM pg_stat_database 
        WHERE datname = current_database()
    """)
    row = db.execute(query).fetchone()
    if not row:
        return {}
    return {
        "blks_hit": row[0],
        "blks_read": row[1],
        "tup_returned": row[2],
        "tup_fetched": row[3],
        "xact_commit": row[4],
        "xact_rollback": row[5]
    }


def execute_workload(db: Session, workload_id: str) -> WorkloadExecution:
    workload = db.query(Workload).filter(Workload.id == workload_id).first()
    if not workload:
        raise ValueError("Workload not found")

    settings_query = text("SELECT name, setting FROM pg_settings")
    current_config = {row[0]: row[1] for row in db.execute(settings_query).fetchall()}

    pre_stats = _get_pg_stats(db)
    
    start_time = time.perf_counter()

    for q in workload.queries:
        stmt = text(q["sql"])
        db.execute(stmt, q["params"])

    end_time = time.perf_counter()
    duration_ms = (end_time - start_time) * 1000

    post_stats = _get_pg_stats(db)

    metrics = {}
    if pre_stats and post_stats:
        delta_hit = post_stats["blks_hit"] - pre_stats["blks_hit"]
        delta_read = post_stats["blks_read"] - pre_stats["blks_read"]
        delta_returned = post_stats["tup_returned"] - pre_stats["tup_returned"]
        delta_fetched = post_stats["tup_fetched"] - pre_stats["tup_fetched"]
        
        total_blocks = delta_hit + delta_read
        buffer_hit_ratio = (delta_hit / total_blocks * 100) if total_blocks > 0 else 100.0
        
        metrics = {
            "buffer_hit_ratio": float(f"{buffer_hit_ratio:.2f}"),
            "blocks_read": int(delta_read),
            "blocks_hit": int(delta_hit),
            "tuples_returned": int(delta_returned),
            "tuples_fetched": int(delta_fetched),
            "transactions": int(post_stats["xact_commit"] - pre_stats["xact_commit"])
        }

    execution = WorkloadExecution(
        workload_id=workload.id,
        execution_time_ms=duration_ms,
        db_config_snapshot=current_config,
        extended_metrics=metrics,
        created_at=datetime.now()
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    return execution