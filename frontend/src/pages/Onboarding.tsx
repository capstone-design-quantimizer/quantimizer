import React, { useEffect, useState, useRef } from 'react';

import imgBuilder from '../assets/onboarding/builder.png';
import imgCommunity from '../assets/onboarding/community.png';
import imgCompare from '../assets/onboarding/compare.png';
import imgPrediction from '../assets/onboarding/prediction.png';

const useCountUp = (end: number, duration: number = 2000, start: boolean = false) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!start) return;

        let startTime: number | null = null;
        const startValue = 0;
        
        const step = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            
            setCount(Math.floor(easeProgress * (end - startValue) + startValue));

            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };

        window.requestAnimationFrame(step);
    }, [end, duration, start]);

    return count;
};

const ScrollRevealSection: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const domRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => setIsVisible(entry.isIntersecting));
        }, { threshold: 0.15 });

        const currentElement = domRef.current;
        if (currentElement) observer.observe(currentElement);

        return () => {
            if (currentElement) observer.unobserve(currentElement);
        };
    }, []);

    return (
        <div 
            ref={domRef}
            className={`${className} ${isVisible ? 'in-view' : ''}`}
        >
            {children}
        </div>
    );
};

interface Props {
    onStart: () => void;
}

const FACTORS_LIST = [
    'PER', 'PBR', 'RSI_14', 'Momentum', 'Volatility', 'Beta', 'Sharpe', 
    'EPS Growth', 'ROE', 'Debt/Equity', 'Moving Average', 'MACD', 
    'Bollinger Bands', 'Stochastic', 'OBV', 'ATR', 'Dividend Yield'
];

const Onboarding: React.FC<Props> = ({ onStart }) => {
    const [pageLoaded, setPageLoaded] = useState(false);
    
    const [statsVisible, setStatsVisible] = useState(false);
    const statsRef = useRef<HTMLDivElement>(null);

    const strategyCount = useCountUp(12850000, 2500, statsVisible);
    const backtestCount = useCountUp(84200, 2000, statsVisible);
    const accuracyCount = useCountUp(94, 1500, statsVisible);

    useEffect(() => {
        setPageLoaded(true);

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                setStatsVisible(true);
                observer.disconnect();
            }
        }, { threshold: 0.2 });

        if (statsRef.current) {
            observer.observe(statsRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div className="onboarding-container">
            <div className="onboarding-bg-orb" />
            
            <div className={`onboarding-hero ${pageLoaded ? 'animate-fade-up' : ''}`}>
                <div className="hero-badge">Ver 2.0 AI Update</div>
                <h1 className="onboarding-title">
                    데이터와 AI가 만드는<br />
                    <span className="text-gradient">완벽한 투자 시나리오</span>
                </h1>
                <p className="onboarding-subtitle">
                    Temporal Fusion Transformer 기반의 시장 예측부터<br />
                    노코딩 전략 설계까지. 당신의 투자를 과학으로 증명하세요.
                </p>
                <button className="btn-onboarding-cta" onClick={onStart}>
                    무료로 시작하기
                    <span className="arrow-icon">→</span>
                </button>
            </div>

            <div className={`factor-ticker-wrapper ${pageLoaded ? 'animate-fade-up-delay' : ''}`}>
                <div className="factor-ticker-track">
                    {[...FACTORS_LIST, ...FACTORS_LIST, ...FACTORS_LIST].map((factor, i) => (
                        <div key={i} className="factor-pill">{factor}</div>
                    ))}
                </div>
            </div>

            <div ref={statsRef} className="stat-grid-container">
                <div className="stat-card">
                    <div className="stat-value">
                        {strategyCount.toLocaleString()}+
                    </div>
                    <div className="stat-label">생성 가능한 전략 조합</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">
                        {backtestCount.toLocaleString()}
                    </div>
                    <div className="stat-label">누적 백테스트 실행</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">
                        {accuracyCount}%
                    </div>
                    <div className="stat-label">AI 트렌드 예측 정확도</div>
                </div>
            </div>

            <div className="onboarding-features">
                
                <ScrollRevealSection className="feature-section ai-section">
                    <div className="feature-content">
                        <div className="feature-icon-wrapper ai-icon">
                            <span className="feature-icon">🤖</span>
                        </div>
                        <h2 className="feature-heading">AI 기반 시장 예측</h2>
                        <p className="feature-desc">
                            최신 딥러닝 모델(TFT)을 활용하여 KOSPI 200, S&P 500 변동성, 
                            환율 등 주요 지표의 미래 흐름을 예측합니다. 
                            과거 데이터 학습을 통해 산출된 신뢰 구간과 
                            예측 트렌드를 실전 투자에 참고하세요.
                        </p>
                        <ul className="feature-list">
                            <li>KOSPI / NASDAQ / 환율 실시간 예측</li>
                            <li>배터리, 반도체 등 섹터별 트렌드 분석</li>
                            <li>TFT 모델 기반의 신뢰도 높은 구간 추정</li>
                        </ul>
                    </div>
                    <div className="feature-visual ai-visual">
                        <img src={imgPrediction} alt="AI 예측 대시보드" className="feature-img shadow-lg animate-float" />
                    </div>
                </ScrollRevealSection>

                <ScrollRevealSection className="feature-section">
                    <div className="feature-visual">
                        <img src={imgBuilder} alt="노코딩 전략 빌더" className="feature-img animate-float" style={{ animationDelay: '1s' }} />
                    </div>
                    <div className="feature-content">
                        <div className="feature-icon-wrapper">
                            <span className="feature-icon">🧩</span>
                        </div>
                        <h2 className="feature-heading">직관적인 노코딩 빌더</h2>
                        <p className="feature-desc">
                            복잡한 파이썬 코드 없이 클릭만으로 알고리즘을 완성하세요.
                            재무 데이터부터 기술적 지표까지, 블록을 조립하듯 
                            팩터를 연결하면 나만의 퀀트 엔진이 작동합니다.
                        </p>
                        <ul className="feature-list">
                            <li>20종 이상의 핵심 재무/기술적 팩터 제공</li>
                            <li>드래그 앤 드롭으로 완성하는 로직</li>
                            <li>실시간 문법 체크 및 가이드</li>
                        </ul>
                    </div>
                </ScrollRevealSection>

                <ScrollRevealSection className="feature-section reverse">
                    <div className="feature-visual">
                        <img src={imgCompare} alt="전략 비교 분석" className="feature-img animate-float" style={{ animationDelay: '0.5s' }} />
                    </div>
                    <div className="feature-content">
                        <div className="feature-icon-wrapper">
                            <span className="feature-icon">📊</span>
                        </div>
                        <h2 className="feature-heading">정밀한 성과 비교</h2>
                        <p className="feature-desc">
                            MDD, CAGR, Sharpe Ratio 등 핵심 지표를 한눈에 비교하세요.
                            다양한 전략 시나리오를 동시에 백테스트하고, 
                            시장 상황에 가장 견고한 최적의 모델을 선별할 수 있습니다.
                        </p>
                    </div>
                </ScrollRevealSection>

                <ScrollRevealSection className="feature-section">
                    <div className="feature-visual">
                        <img src={imgCommunity} alt="커뮤니티" className="feature-img animate-float" style={{ animationDelay: '1.5s' }} />
                    </div>
                    <div className="feature-content">
                        <div className="feature-icon-wrapper">
                            <span className="feature-icon">🌐</span>
                        </div>
                        <h2 className="feature-heading">검증된 전략 라이브러리</h2>
                        <p className="feature-desc">
                            상위 랭커들의 전략을 확인하고 내 워크스페이스로 복사하세요.
                            전문가들이 만드는 강력한 수익 모델을 분석하고,
                            나만의 아이디어를 더해 발전시킬 수 있습니다.
                        </p>
                    </div>
                </ScrollRevealSection>
            </div>

            <div className="onboarding-cta-footer">
                <h2>지금 바로 데이터 기반 투자를 경험하세요</h2>
                <p>복잡한 설치 없이 웹에서 즉시 시작할 수 있습니다.</p>
                <button className="btn-onboarding-cta large" onClick={onStart}>
                    QuantiMizer 시작하기
                </button>
            </div>

            <div className="onboarding-footer">
                <p>© 2025 QuantiMizer. All rights reserved.</p>
            </div>
        </div>
    );
};

export default Onboarding;