import type { StrategyConfig } from '../StrategyBlocklyEditor';

export interface PresetStrategy {
    name: string;
    description: string;
    config: StrategyConfig;
}

export const PRESET_STRATEGIES: PresetStrategy[] = [
    {
        name: "[AI 추천] 강세장 모멘텀 전략",
        description: "예측 모델이 상승 추세를 가리킬 때 유효합니다. 최근 3개월/12개월 모멘텀이 강력하고 거래량이 동반되는 종목을 선정하여 추세를 추종합니다.",
        config: {
            factors: [
                { name: 'Momentum_12M', direction: 'desc', weight: 0.4 },
                { name: 'Momentum_3M', direction: 'desc', weight: 0.3 },
                { name: 'GPM', direction: 'desc', weight: 0.3 }
            ],
            portfolio: { top_n: 10, weight_method: 'market_cap' },
            rebalancing: { frequency: 'monthly' }
        }
    },
    {
        name: "[AI 추천] 약세장 방어형 전략",
        description: "예측 모델이 하락 또는 횡보를 가리킬 때 유효합니다. 변동성이 낮고(Low Vol) 배당 수익률이 높으며 현금 흐름이 우수한 대형주 위주로 포트폴리오를 방어합니다.",
        config: {
            factors: [
                { name: 'Volatility_20D', direction: 'asc', weight: 0.4 },
                { name: 'DividendYield', direction: 'desc', weight: 0.3 },
                { name: 'InterestCoverage', direction: 'desc', weight: 0.3 }
            ],
            portfolio: { top_n: 20, weight_method: 'equal' },
            rebalancing: { frequency: 'quarterly' }
        }
    },
    {
        name: "[AI 추천] 턴어라운드 저평가 전략",
        description: "예측 모델이 저점 반등을 시사할 때 사용합니다. PBR이 낮지만 영업이익률(OPM)이 개선되고 있는 낙폭 과대 우량주를 선별합니다.",
        config: {
            factors: [
                { name: 'PBR', direction: 'asc', weight: 0.4 },
                { name: 'OPM', direction: 'desc', weight: 0.3 },
                { name: 'ROE', direction: 'desc', weight: 0.3 }
            ],
            portfolio: { top_n: 15, weight_method: 'equal' },
            rebalancing: { frequency: 'monthly' }
        }
    },
    {
        name: "[AI 추천] 퀄리티 성장주 전략",
        description: "장기적인 우상향 예측 시 적합합니다. ROE가 높고 부채비율이 낮으며 꾸준한 매출 성장을 보이는 퀄리티 주식에 집중 투자합니다.",
        config: {
            factors: [
                { name: 'ROE', direction: 'desc', weight: 0.4 },
                { name: 'DebtToEquity', direction: 'asc', weight: 0.3 },
                { name: 'EPS', direction: 'desc', weight: 0.3 }
            ],
            portfolio: { top_n: 10, weight_method: 'market_cap' },
            rebalancing: { frequency: 'quarterly' }
        }
    }
];