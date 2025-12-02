import React, { useEffect, useState } from 'react';

import imgBuilder from '../assets/onboarding/builder.png';
import imgCommunity from '../assets/onboarding/community.png';
import imgCompare from '../assets/onboarding/compare.png';
import imgPrediction from '../assets/onboarding/prediction.png';

interface Props {
    onStart: () => void;
}

const Onboarding: React.FC<Props> = ({ onStart }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    return (
        <div className="onboarding-container">
            <div className="onboarding-bg-gradient" />
            
            {/* Hero Section */}
            <div className={`onboarding-hero ${isVisible ? 'animate-fade-up' : ''}`}>
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

            {/* Feature Sections */}
            <div className={`onboarding-features ${isVisible ? 'animate-fade-up-delay' : ''}`}>
                
                {/* Feature 1: AI Prediction (New) */}
                <div className="feature-section ai-section">
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
                        <img src={imgPrediction} alt="AI 예측 대시보드" className="feature-img shadow-lg" />
                    </div>
                </div>

                {/* Feature 2: Strategy Builder */}
                <div className="feature-section">
                    <div className="feature-visual">
                        <img src={imgBuilder} alt="노코딩 전략 빌더" className="feature-img" />
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
                    </div>
                </div>

                {/* Feature 3: Strategy Comparison */}
                <div className="feature-section reverse">
                    <div className="feature-visual">
                        <img src={imgCompare} alt="전략 비교 분석" className="feature-img" />
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
                </div>

                {/* Feature 4: Community */}
                <div className="feature-section">
                    <div className="feature-visual">
                        <img src={imgCommunity} alt="커뮤니티" className="feature-img" />
                    </div>
                    <div className="feature-content">
                        <div className="feature-icon-wrapper">
                            <span className="feature-icon">🌐</span>
                        </div>
                        <h2 className="feature-heading">검증된 전략 라이브러리</h2>
                        <p className="feature-desc">
                            상위 1% 랭커들의 전략을 확인하고 내 워크스페이스로 복사하세요.
                            집단 지성이 만드는 강력한 수익 모델을 분석하고,
                            나만의 아이디어를 더해 발전시킬 수 있습니다.
                        </p>
                    </div>
                </div>
            </div>

            {/* CTA Footer */}
            <div className="onboarding-cta-footer">
                <h2>지금 바로 데이터 기반 투자를 경험하세요</h2>
                <p>복잡한 설치 없이 웹에서 즉시 시작할 수 있습니다.</p>
                <button className="btn-onboarding-cta large" onClick={onStart}>
                    QuantiMizer 시작하기
                </button>
            </div>

            {/* Footer */}
            <div className="onboarding-footer">
                <p>© 2025 QuantiMizer. All rights reserved.</p>
            </div>
        </div>
    );
};

export default Onboarding;