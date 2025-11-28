import type { StrategyConfig } from '../StrategyBlocklyEditor';

export const PRESET_STRATEGIES: { name: string; description: string; config: StrategyConfig }[] = [
    {
        name: "저평가 가치주 전략 (Value)",
        description: "PER와 PBR이 낮은 종목을 선별하여 내재 가치 대비 저평가된 주식에 투자합니다.",
        config: {
            factors: [
                { name: 'PER', direction: 'asc', weight: 1 },
                { name: 'PBR', direction: 'asc', weight: 1 },
            ],
            portfolio: { top_n: 20, weight_method: 'equal' },
            rebalancing: { frequency: 'quarterly' }
        }
    },
    {
        name: "소형주 모멘텀 전략",
        description: "시가총액이 낮은 종목 중 최근 12개월 수익률이 좋은 종목을 추세 추종합니다.",
        config: {
            factors: [
                { name: 'MarketCap', direction: 'asc', weight: 1 },
                { name: 'Momentum_12M', direction: 'desc', weight: 1 },
            ],
            portfolio: { top_n: 30, weight_method: 'equal' },
            rebalancing: { frequency: 'monthly' }
        }
    },
    {
        name: "고배당 우량주 전략",
        description: "배당수익률이 높고 부채비율이 낮은 안정적인 기업에 투자합니다.",
        config: {
            factors: [
                { name: 'DividendYield', direction: 'desc', weight: 1 },
                { name: 'DebtToEquity', direction: 'asc', weight: 0.5 },
                { name: 'ROE', direction: 'desc', weight: 0.5 },
            ],
            portfolio: { top_n: 15, weight_method: 'market_cap' },
            rebalancing: { frequency: 'quarterly' }
        }
    },
    {
        name: "기술적 반등 (RSI 역추세)",
        description: "RSI가 낮아 과매도 구간에 진입한 종목을 매수하여 반등을 노립니다.",
        config: {
            factors: [
                { name: 'RSI_14', direction: 'asc', weight: 1 },
                { name: 'Volatility_20D', direction: 'asc', weight: 0.5 },
            ],
            portfolio: { top_n: 10, weight_method: 'equal' },
            rebalancing: { frequency: 'monthly' }
        }
    }
];