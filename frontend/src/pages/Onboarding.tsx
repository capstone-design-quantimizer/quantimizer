import React from 'react';

import imgBuilder from '../assets/onboarding/builder.png';
import imgCommunity from '../assets/onboarding/community.png';
import imgCompare from '../assets/onboarding/compare.png';

interface Props {
    onStart: () => void;
}

const Onboarding: React.FC<Props> = ({ onStart }) => {
    return (
        <div className="onboarding-container">
            {/* Hero Section */}
            <div className="onboarding-hero">
                <h1 className="onboarding-title">
                    투자 전략의 모든 것,<br />
                    <span className="text-gradient">QuantiMizer</span>
                </h1>
                <p className="onboarding-subtitle">
                    복잡한 코딩 없이 나만의 퀀트 전략을 설계하고 검증하세요.<br />
                    데이터 기반의 스마트한 투자가 지금 시작됩니다.
                </p>
                <button className="btn-onboarding-cta" onClick={onStart}>
                    무료로 시작하기
                </button>
            </div>

            {/* Feature Sections */}
            <div className="onboarding-features">
                {/* Feature 1: Strategy Builder */}
                <div className="feature-row">
                    <div className="feature-text">
                        <div className="feature-icon-large">🧩</div>
                        <h3>노코딩 전략 빌더</h3>
                        <p>
                            더 이상 코드를 작성할 필요가 없습니다. 블록을 조립하듯 원하는 팩터(Factor)와 지표들을 연결하세요.
                            가치 지표부터 기술적 분석까지, 클릭 몇 번으로 나만의 알고리즘이 완성됩니다.
                        </p>
                    </div>
                    <div className="feature-image-container">
                        <img src={imgBuilder} alt="전략 빌더 예시" className="feature-image" />
                    </div>
                </div>

                {/* Feature 2: Strategy Comparison */}
                <div className="feature-row">
                    <div className="feature-text">
                        <div className="feature-icon-large">📊</div>
                        <h3>강력한 성과 분석 & 비교</h3>
                        <p>
                            백테스트 결과를 단순히 보는 것에 그치지 마세요. 두 가지 전략의 Equity Curve와
                            MDD, CAGR 등 핵심 지표를 한 화면에서 비교 분석하여 시장에 가장 적합한 전략을 찾아낼 수 있습니다.
                        </p>
                    </div>
                    <div className="feature-image-container">
                        <img src={imgCompare} alt="전략 비교 예시" className="feature-image" />
                    </div>
                </div>

                {/* Feature 3: Community */}
                <div className="feature-row">
                    <div className="feature-text">
                        <div className="feature-icon-large">🌐</div>
                        <h3>검증된 전략 공유</h3>
                        <p>
                            커뮤니티에서 수익률 상위 랭커들의 전략을 확인하세요. '전략 가져오기' 기능을 통해
                            검증된 모델을 내 작업공간으로 복사하고, 나만의 아이디어를 더해 발전시킬 수 있습니다.
                        </p>
                    </div>
                    <div className="feature-image-container">
                        <img src={imgCommunity} alt="커뮤니티 예시" className="feature-image" />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="onboarding-footer">
                <p>© 2025 QuantiMizer. All rights reserved.</p>
            </div>
        </div>
    );
};

export default Onboarding;