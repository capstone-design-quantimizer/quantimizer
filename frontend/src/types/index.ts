export interface BacktestSetting {
    id: string;
    name: string;
    market: string;
    min_market_cap: number;
    start_date: string;
    end_date: string;
    initial_capital: number;
    created_at: string;
}

export interface Strategy {
    id: string;
    name: string;
    description: string;
    strategy_json: any;
    created_at: string;
    updated_at: string;
}

export interface EquityPoint {
    date: string;
    equity: number;
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
    metrics: {
        total_return: number;
        cagr: number;
        max_drawdown: number;
        sharpe: number;
    };
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