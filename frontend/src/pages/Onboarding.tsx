import React from 'react';

interface Props {
    onStart: () => void;
}

const Onboarding: React.FC<Props> = ({ onStart }) => {
    return (
        <div className="onboarding-container">
            <div className="onboarding-hero">
                <h1 className="onboarding-title">
                    투자 전략의 모든 것,<br />
                    <span className="text-gradient">QuantiMizer</span>
                </h1>
                <p className="onboarding-subtitle">
                    복잡한 코딩 없이 나만의 퀀트 전략을 설계하고 검증하세요.<br />
                    데이터 기반의 투자가 지금 시작됩니다.
                </p>
                <button className="btn-onboarding-cta" onClick={onStart}>
                    시작하기
                </button>
            </div>

            <div className="onboarding-grid">
                <div className="feature-card">
                    <div className="feature-icon">🧩</div>
                    <h3>비주얼 전략 빌더</h3>
                    <p>블록을 조립하듯 직관적인 UI로 복잡한 투자 알고리즘을 설계할 수 있습니다. 팩터 조합, 가중치 설정, 리밸런싱 규칙을 한눈에 파악하세요.</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">⚡</div>
                    <h3>초고속 백테스트</h3>
                    <p>설계한 전략을 과거 데이터에 대입해 즉시 검증합니다. CAGR, MDD, Sharpe Ratio 등 전문적인 성과 지표를 제공합니다.</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">📊</div>
                    <h3>전략 비교 분석</h3>
                    <p>여러 전략의 성과를 한 화면에서 비교하고, 시장 상황에 맞는 최적의 포트폴리오를 찾아보세요.</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">🌐</div>
                    <h3>커뮤니티 & 공유</h3>
                    <p>다른 투자자들과 전략을 공유하고 토론하세요. 검증된 전략을 포크(Fork)하여 나만의 스타일로 발전시킬 수 있습니다.</p>
                </div>
            </div>

            <div className="onboarding-footer">
                <p>© 2025 QuantiMizer. All rights reserved.</p>
            </div>
        </div>
    );
};

export default Onboarding;