from __future__ import annotations

import math
import uuid
import logging
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, Sequence

import numpy as np
import pandas as pd
from backtesting import Backtest, Strategy as BTStrategy
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.backtest import BacktestResult
from app.models.ml_model import MLModel
from app.services.ml_inference import get_onnx_session, score_dataframe

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class UniverseSpec:
    market: str
    min_market_cap: float | None
    excludes: Sequence[str]
    exclude_tickers: Sequence[str]


@dataclass(slots=True)
class FactorSpec:
    name: str
    direction: str
    weight: float
    model_id: uuid.UUID | None = None


@dataclass(slots=True)
class PortfolioSpec:
    top_n: int
    weight_method: str


@dataclass(slots=True)
class RebalancingSpec:
    frequency: str


@dataclass(slots=True)
class StrategySpec:
    universe: UniverseSpec
    factors: list[FactorSpec]
    portfolio: PortfolioSpec
    rebalancing: RebalancingSpec


FACTOR_COLUMN_MAP: dict[str, str] = {
    "PCTCHANGE": "pct_change",
    "RSI_14": "rsi_14",
    "MA_20D": "ma_20d",
    "MOMENTUM_3M": "momentum_3m",
    "MOMENTUM_12M": "momentum_12m",
    "VOLATILITY_20D": "volatility_20d",
    "MARKETCAP": "market_cap",
    "PER": "per",
    "PBR": "pbr",
    "EPS": "eps",
    "BPS": "bps",
    "DIVIDENDYIELD": "dividend_yield",
    "ROE": "roe",
    "ROA": "roa",
    "OPM": "opm",
    "GPM": "gpm",
    "DEBTTOEQUITY": "debt_to_equity",
    "CURRENTRATIO": "current_ratio",
    "ASSETTURNOVER": "asset_turnover",
    "INTERESTCOVERAGE": "interest_coverage",
}

FINANCIAL_COMPONENTS: dict[str, set[str]] = {
    "roe": {"Net Income", "Stockholders Equity"},
    "roa": {"Net Income", "Total Assets"},
    "opm": {"Operating Income", "Total Revenue"},
    "gpm": {"Gross Profit", "Total Revenue"},
    "debt_to_equity": {"Total Debt", "Stockholders Equity"},
    "current_ratio": {"Current Assets", "Current Liabilities"},
    "asset_turnover": {"Total Revenue", "Total Assets"},
    "interest_coverage": {"EBIT", "Interest Expense"},
}

VALID_MARKETS = {"ALL", "KOSPI", "KOSDAQ"}
VALID_DIRECTIONS = {"asc", "desc"}
VALID_WEIGHT_METHODS = {"equal", "market_cap"}
VALID_FREQUENCIES = {"monthly", "quarterly"}


class StrategyExecutionError(RuntimeError):
    pass


class _EquityReplayStrategy(BTStrategy):
    def init(self) -> None:
        pass

    def next(self) -> None:
        if not self.position:
            price = float(self.data.Close[-1])
            if price > 0.0:
                size = self.equity / price
                if size > 0.0:
                    self.buy(size=size)


def parse_strategy(strategy_json: dict[str, Any]) -> StrategySpec:
    definition = strategy_json.get("definition", strategy_json)

    uni = definition.get("universe") or {}
    market = str(uni.get("market", "ALL")).upper()
    if market not in VALID_MARKETS:
        raise StrategyExecutionError(f"Unsupported market '{market}'")

    mmc = uni.get("min_market_cap")
    if mmc is not None:
        try:
            mmc = float(mmc)
        except (TypeError, ValueError) as exc:
            raise StrategyExecutionError("min_market_cap must be numeric") from exc

    excludes = uni.get("exclude") or []
    if not isinstance(excludes, Iterable) or isinstance(excludes, (str, bytes)):
        raise StrategyExecutionError("universe.exclude must be a list")

    exclude_tickers = uni.get("exclude_tickers") or []
    if not isinstance(exclude_tickers, Iterable) or isinstance(exclude_tickers, (str, bytes)):
        raise StrategyExecutionError("universe.exclude_tickers must be a list")

    facs_raw = definition.get("factors") or []
    if not facs_raw:
        raise StrategyExecutionError("At least one factor must be supplied")

    facs: list[FactorSpec] = []
    for rf in facs_raw:
        name = str(rf.get("name", rf.get("type", ""))).upper().replace(" ", "")
        direction = str(rf.get("direction", rf.get("order", "desc"))).lower()
        
        weight = rf.get("weight", 1.0)
        model_id: uuid.UUID | None = None

        if name != "ML_MODEL" and name not in FACTOR_COLUMN_MAP:
            raise StrategyExecutionError(f"Unsupported factor '{name}'")
        if direction not in VALID_DIRECTIONS:
            raise StrategyExecutionError(f"Unsupported factor direction '{direction}'")
        try:
            weight = float(weight)
        except (TypeError, ValueError) as exc:
            raise StrategyExecutionError("Factor weight must be numeric") from exc

        if name == "ML_MODEL":
            raw_model_id = rf.get("model_id")
            if raw_model_id is None:
                raise StrategyExecutionError("ML_MODEL factor requires a model_id")
            try:
                model_id = uuid.UUID(str(raw_model_id))
            except (TypeError, ValueError) as exc:
                raise StrategyExecutionError("Invalid ML model UUID") from exc

        facs.append(FactorSpec(name=name, direction=direction, weight=weight, model_id=model_id))

    port = definition.get("portfolio") or {}
    top_n = int(port.get("top_n", 30))
    if top_n <= 0:
        raise StrategyExecutionError("portfolio.top_n must be positive")
    weight_method = str(port.get("weight_method", "equal")).lower()
    if weight_method not in VALID_WEIGHT_METHODS:
        raise StrategyExecutionError(f"Unsupported weight method '{weight_method}'")

    reb = definition.get("rebalancing") or {}
    freq = str(reb.get("frequency", "monthly")).lower()
    if freq not in VALID_FREQUENCIES:
        raise StrategyExecutionError(f"Unsupported rebalancing frequency '{freq}'")

    return StrategySpec(
        universe=UniverseSpec(
            market=market,
            min_market_cap=mmc,
            excludes=list(excludes),
            exclude_tickers=list(exclude_tickers),
        ),
        factors=facs,
        portfolio=PortfolioSpec(top_n=top_n, weight_method=weight_method),
        rebalancing=RebalancingSpec(frequency=freq),
    )


def _build_scored_sql(spec: StrategySpec, start: date, end: date) -> tuple[str, dict[str, Any], list[str]]:
    non_ml = [f for f in spec.factors if f.name != "ML_MODEL" and f.weight != 0.0]

    FINANCIAL_COLS = set(FINANCIAL_COMPONENTS.keys())
    
    required_cols = {
        "s.event_date", "s.ticker", "s.company_name", "s.market", "s.market_cap",
        "s.close_price", "s.open_price", "s.low_price", "s.pct_change",
        "s.rsi_14", "s.ma_20d", "s.momentum_3m", "s.momentum_12m", "s.volatility_20d",
        "f.per", "f.pbr", "f.eps", "f.bps", "f.dividend_yield"
    }
    
    financial_items_needed = set()
    
    for f in non_ml:
        col = FACTOR_COLUMN_MAP.get(f.name)
        if col is not None:
            if col in FINANCIAL_COLS:
                required_cols.add(f"fin.{col}")
                financial_items_needed.update(FINANCIAL_COMPONENTS[col])
            elif col not in {
                "rsi_14", "ma_20d", "momentum_3m", "momentum_12m", "volatility_20d", "market_cap",
                "per", "pbr", "eps", "bps", "dividend_yield"
            }:
                required_cols.add(f"f.{col}")

    select_cols = ",\n        ".join(sorted(required_cols))

    where = ["s.event_date BETWEEN :start_date AND :end_date"]
    params: dict[str, Any] = {"start_date": start, "end_date": end}

    if spec.universe.market != "ALL":
        where.append("s.market = :market")
        params["market"] = spec.universe.market
    if spec.universe.min_market_cap is not None:
        where.append("COALESCE(s.market_cap, 0) >= :min_market_cap")
        params["min_market_cap"] = spec.universe.min_market_cap
    if spec.universe.exclude_tickers:
        where.append("s.ticker <> ALL(:exclude_tickers)")
        params["exclude_tickers"] = list(spec.universe.exclude_tickers)

    where_sql = " AND ".join(where)

    join_financials_sql = ""
    if financial_items_needed:
        item_filters = " OR ".join([f"item_name = '{item}'" for item in financial_items_needed])
        
        aggs = []
        if "roe" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'Net Income' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Stockholders Equity' THEN value END), 0)) as roe")
        if "roa" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'Net Income' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Total Assets' THEN value END), 0)) as roa")
        if "opm" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'Operating Income' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Total Revenue' THEN value END), 0)) as opm")
        if "gpm" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'Gross Profit' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Total Revenue' THEN value END), 0)) as gpm")
        if "debt_to_equity" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'Total Debt' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Stockholders Equity' THEN value END), 0)) as debt_to_equity")
        if "current_ratio" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'Current Assets' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Current Liabilities' THEN value END), 0)) as current_ratio")
        if "asset_turnover" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'Total Revenue' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Total Assets' THEN value END), 0)) as asset_turnover")
        if "interest_coverage" in [FACTOR_COLUMN_MAP.get(f.name) for f in non_ml]:
            aggs.append("(MAX(CASE WHEN item_name = 'EBIT' THEN value END) / NULLIF(MAX(CASE WHEN item_name = 'Interest Expense' THEN value END), 0)) as interest_coverage")

        agg_sql = ",\n            ".join(aggs)
        
        join_financials_sql = f"""
    LEFT JOIN LATERAL (
        SELECT
            {agg_sql}
        FROM financials_quarterly fq
        WHERE fq.ticker = s.ticker
          AND fq.period_end <= s.event_date
          AND ({item_filters})
        GROUP BY fq.period_end
        ORDER BY fq.period_end DESC
        LIMIT 1
    ) fin ON true
        """

    z_terms = []
    used: list[str] = []
    for f in non_ml:
        col = FACTOR_COLUMN_MAP[f.name]
        raw_col_name = col
        
        z = (
            f"({raw_col_name} - AVG({raw_col_name}) OVER (PARTITION BY event_date)) "
            f"/ NULLIF(STDDEV_SAMP({raw_col_name}) OVER (PARTITION BY event_date), 0)"
        )
        signed = f"-({z})" if f.direction == "asc" else z
        z_terms.append(f"{float(max(f.weight, 0.0)):.10f} * ({signed})")
        used.append(f.name)

    final_score_expr = " + ".join(z_terms) if z_terms else "0.0"

    sql = f"""
WITH base AS (
    SELECT
        {select_cols}
    FROM stocks_daily_info AS s
    LEFT JOIN fundamentals_daily AS f
      ON s.event_date = f.event_date AND s.ticker = f.ticker
    {join_financials_sql}
    WHERE {where_sql}
),
scored AS (
    SELECT
        base.*,
        ({final_score_expr}) AS final_score
    FROM base
)
SELECT *
FROM scored
ORDER BY event_date ASC, ticker ASC;
""".strip()
    
    logger.info(
        "Generated scored SQL", extra={"sql": sql, "params": params, "used_factors": used}
    )

    return sql, params, used


def _fetch_scored_frame(db: Session, sql: str, params: dict[str, Any]) -> pd.DataFrame:
    bind = db.get_bind()
    with bind.connect() as conn:
        start_time = time.perf_counter()
        logger.info("Executing scored SQL", extra={"sql": sql, "params": params})
        df = pd.read_sql_query(text(sql), conn, params=params)
        elapsed = time.perf_counter() - start_time
        logger.info(
            "Executed scored SQL",
            extra={"rows": len(df), "duration": elapsed},
        )

    if not df.empty:
        df["event_date"] = pd.to_datetime(df["event_date"])
    return df


def _apply_ml_and_rank(
    frame: pd.DataFrame,
    factors: Sequence[FactorSpec],
    used_factor_names: Sequence[str],
    ml_session,
) -> pd.DataFrame:
    df = frame.copy()
    has_ml = any(f.name == "ML_MODEL" and f.weight != 0.0 for f in factors)
    ml_weight = next((f.weight for f in factors if f.name == "ML_MODEL"), 0.0)

    groups = []
    for dt, g in df.groupby("event_date"):
        g = g.copy()
        if has_ml:
            ml_scores = score_dataframe(ml_session, g, output_index=g.index)
            mu, sigma = ml_scores.mean(), ml_scores.std(ddof=0)
            z_ml = (ml_scores - mu) / sigma if sigma > 1e-12 else pd.Series(0.0, index=g.index)
            g.loc[:, "__ml_score"] = z_ml.astype(float)
            g.loc[:, "final_score"] = g["final_score"].astype(float) + float(max(ml_weight, 0.0)) * g["__ml_score"]
        else:
            g.loc[:, "__ml_score"] = 0.0
        g = g.sort_values("final_score", ascending=False)
        groups.append(g)

    return pd.concat(groups).sort_values(["event_date", "final_score"], ascending=[True, False])


def _determine_rebalancing_dates(frame: pd.DataFrame, frequency: str) -> list[pd.Timestamp]:
    events = frame["event_date"].drop_duplicates().sort_values()
    periods = {"monthly": events.dt.to_period("M"), "quarterly": events.dt.to_period("Q")}[frequency]
    return list(events.groupby(periods).max())


def _build_allocations(
    scored: pd.DataFrame,
    portfolio: PortfolioSpec,
    frequency: str,
) -> dict[pd.Timestamp, pd.DataFrame]:
    rebal_dates = _determine_rebalancing_dates(scored, frequency)
    allocations: dict[pd.Timestamp, pd.DataFrame] = {}
    for d in rebal_dates:
        day_slice = scored[scored["event_date"] == d]
        ranked = day_slice.sort_values("final_score", ascending=False).head(portfolio.top_n)
        if ranked.empty:
            continue
        if portfolio.weight_method == "equal":
            w = 1.0 / len(ranked)
            ranked = ranked.assign(target_weight=w)
        else:
            caps = ranked["market_cap"].astype(float).clip(lower=0.0)
            s = caps.sum()
            if s <= 0.0:
                w = 1.0 / len(ranked)
                ranked = ranked.assign(target_weight=w)
            else:
                ranked = ranked.assign(target_weight=caps / s)
        allocations[d] = ranked[["ticker", "target_weight"]]
    if not allocations:
        raise StrategyExecutionError("Rebalancing produced no allocations")
    return allocations


def _prepare_price_matrix(frame: pd.DataFrame) -> pd.DataFrame:
    pivot = (
        frame.pivot_table(index="event_date", columns="ticker", values="close_price", aggfunc="last")
        .sort_index()
        .fillna(method="ffill")
    )
    pivot = pivot.dropna(how="all")
    if pivot.empty:
        raise StrategyExecutionError("No price data available to simulate equity curve")
    return pivot


def _simulate_equity_curve_Tplus1(
    prices: pd.DataFrame,
    allocations: dict[pd.Timestamp, pd.DataFrame],
    initial_capital: float,
) -> dict[date, float]:
    equity_curve: dict[date, float] = {}
    capital = float(initial_capital)
    current_shares: dict[str, float] = {}
    idx = prices.index.sort_values()

    tplus1_allocs: dict[pd.Timestamp, pd.DataFrame] = {}
    for d in allocations.keys():
        pos = idx.get_indexer([d], method="nearest")
        if pos.size and pos[0] >= 0 and pos[0] + 1 < len(idx):
            tplus1_allocs[idx[pos[0] + 1]] = allocations[d]

    for current_date in idx:
        price_row = prices.loc[current_date]
        if current_shares:
            capital = float(sum(current_shares.get(t, 0.0) * price_row.get(t, np.nan) for t in current_shares))
        equity_curve[current_date.date()] = float(capital)

        if current_date in tplus1_allocs:
            snap = tplus1_allocs[current_date]
            valid_prices = price_row.reindex(snap["ticker"]).astype(float)
            valid = snap.copy()
            valid.loc[:, "price"] = valid_prices.values
            valid = valid.dropna(subset=["price"])
            if valid.empty:
                continue
            available_capital = float(capital)
            current_shares = {}
            for _, row in valid.iterrows():
                ticker = row["ticker"]
                weight = float(row["target_weight"])
                price = float(row["price"])
                if price <= 0.0 or weight <= 0.0:
                    continue
                allocation_value = available_capital * weight
                current_shares[ticker] = allocation_value / price

    return equity_curve


def _compute_metrics(equity_curve: dict[date, float], initial_capital: float) -> dict[str, float]:
    if not equity_curve or len(equity_curve) < 2:
        return {"total_return": 0.0, "cagr": 0.0, "volatility": 0.0, "sharpe": 0.0, "max_drawdown": 0.0}
    
    series = pd.Series(equity_curve).sort_index()
    series.index = pd.to_datetime(series.index)
    rets = series.pct_change().dropna()

    total_return = float(series.iloc[-1] / max(initial_capital, 1e-9) - 1.0)
    days = max((series.index[-1] - series.index[0]).days, 1)
    years = days / 365.25
    cagr = float((1.0 + total_return) ** (1.0 / years) - 1.0) if years > 0 else 0.0

    vol = float(rets.std(ddof=0) * math.sqrt(252)) if not rets.empty else 0.0
    mean = float(rets.mean()) if not rets.empty else 0.0
    sharpe = float((mean * 252) / vol) if vol > 0 else 0.0

    cum_max = series.cummax()
    dd = (series / cum_max) - 1.0
    mdd = float(dd.min()) if not dd.empty else 0.0

    return {"total_return": total_return, "cagr": cagr, "volatility": vol, "sharpe": sharpe, "max_drawdown": mdd}


def _run_backtesting_adapter(equity_curve: dict[date, float], initial_capital: float) -> None:
    if not equity_curve:
        return
    eq = pd.Series(equity_curve).sort_index()
    eq.index = pd.to_datetime(eq.index)
    price = eq.to_frame(name="Close")
    price["Open"] = price["Close"]
    price["High"] = price["Close"]
    price["Low"] = price["Close"]
    Backtest(price, _EquityReplayStrategy, cash=initial_capital, commission=0.0).run()


def _persist_backtest(
    db: Session,
    strategy_id: uuid.UUID,
    start: date,
    end: date,
    initial_capital: float,
    ml_model: MLModel | None,
    equity_curve_list: list[dict],
    metrics: dict[str, float],
) -> BacktestResult:
    rec = BacktestResult(
        strategy_id=strategy_id,
        start_date=start,
        end_date=end,
        initial_capital=initial_capital,
        ml_model_id=ml_model.id if ml_model else None,
        equity_curve=equity_curve_list,
        metrics=metrics,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def execute_strategy(
    db: Session,
    strategy_json: dict[str, Any],
    start_date: date,
    end_date: date,
    initial_capital: float,
    strategy_id: uuid.UUID,
) -> dict[str, Any]:
    if start_date >= end_date:
        raise StrategyExecutionError("start_date must be before end_date")
    if initial_capital <= 0:
        raise StrategyExecutionError("initial_capital must be positive")

    spec = parse_strategy(strategy_json)

    ml_model: MLModel | None = None
    ml_session = None
    ml_factors = [f for f in spec.factors if f.name == "ML_MODEL" and f.model_id]
    if ml_factors and float(ml_factors[0].weight) != 0.0:
        model_id = ml_factors[0].model_id
        assert model_id is not None
        ml_model = db.get(MLModel, model_id)
        if not ml_model:
            raise StrategyExecutionError("Requested ML model not found")
        ml_session = get_onnx_session(ml_model.file_path)

    sql, params, used = _build_scored_sql(spec, start_date, end_date)
    universe_scored = _fetch_scored_frame(db, sql, params)

    if universe_scored.empty:
        logger.warning("No data found for the given strategy and period, returning empty result.")
        equity_curve_list = []
        metrics = {"total_return": 0.0, "cagr": 0.0, "volatility": 0.0, "sharpe": 0.0, "max_drawdown": 0.0}
        rec = _persist_backtest(
            db=db,
            strategy_id=strategy_id,
            start=start_date,
            end=end_date,
            initial_capital=initial_capital,
            ml_model=ml_model,
            equity_curve_list=equity_curve_list,
            metrics=metrics,
        )
        return {"backtest_id": str(rec.id), "equity_curve": equity_curve_list, "metrics": metrics}

    ranked = _apply_ml_and_rank(universe_scored, spec.factors, used, ml_session)
    allocations = _build_allocations(ranked, spec.portfolio, spec.rebalancing.frequency)
    price_matrix = _prepare_price_matrix(universe_scored)
    equity_curve = _simulate_equity_curve_Tplus1(price_matrix, allocations, initial_capital)

    metrics = _compute_metrics(equity_curve, initial_capital)
    _run_backtesting_adapter(equity_curve, initial_capital)

    equity_curve_list = [{"date": k.isoformat(), "equity": float(v)} for k, v in equity_curve.items()]
    rec = _persist_backtest(
        db=db,
        strategy_id=strategy_id,
        start=start_date,
        end=end_date,
        initial_capital=initial_capital,
        ml_model=ml_model,
        equity_curve_list=equity_curve_list,
        metrics=metrics,
    )

    return {"backtest_id": str(rec.id), "equity_curve": equity_curve_list, "metrics": metrics}