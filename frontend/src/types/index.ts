export interface BacktestSetting {
    id: string;
    name: string;
    market: string;
    min_market_cap: number;
    exclude_list: string[]; 
    start_date: string;
    end_date: string;
    initial_capital: number;
    created_at: string;
    owner_id?: string; 
}

export interface Strategy {
    id: string;
    name: string;
    description: string;
    strategy_json: any;
    created_at: string;
    updated_at?: string;
    owner_id?: string;
}

export interface EquityPoint {
    date: string;
    equity: number;
}

export interface BacktestMetrics {
    total_return: number;
    cagr: number;
    max_drawdown: number;
    sharpe: number;
}

export interface Backtest {
    id: string;
    strategy_id: string;
    setting_id: string;
    setting_name: string;
    start_date: string;
    end_date: string;
    initial_capital: number;
    equity_curve: EquityPoint[];
    metrics: BacktestMetrics;
    created_at: string;
}

export interface CommunityPost {
    id: string;
    title: string;
    content: string;
    author_username: string;
    created_at: string;
    strategy?: Strategy;
    last_backtest?: Backtest;
}

export interface DBTuneResult {
    status: string;
    message: string;
    applied_count: number;
    restart_required_params: string[];
    errors: string[];
}

export interface Workload {
    id: string;
    name: string;
    description?: string;
    query_count: number;
    created_at: string;
}

export interface WorkloadExecution {
    id: string;
    workload_id: string;
    execution_time_ms: number;
    db_config_snapshot: Record<string, string>;
    created_at: string;
    workload_name?: string; 
}