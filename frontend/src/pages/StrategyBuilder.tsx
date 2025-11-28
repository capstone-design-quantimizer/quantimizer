import React, { useState } from 'react';
import StrategyBlocklyEditor, { DEFAULT_STRATEGY_CONFIG, normalizeStrategyConfig } from '../StrategyBlocklyEditor';
import type { StrategyConfig } from '../StrategyBlocklyEditor';
import EquityChart from '../components/EquityChart';
import type { BacktestSetting, Strategy, Backtest } from '../types';
import { PRESET_STRATEGIES } from '../data/presets';
import { Modal } from '../components/Shared';

interface Props {
    strategies: Strategy[];
    settings: BacktestSetting[];
    onSave: (id: string, name: string, desc: string, config: StrategyConfig) => Promise<any>;
    onRunBacktest: (stratId: string, settingId: string) => Promise<Backtest | null>;
    loading: boolean;
    initialStratId?: string;
    initialConfig?: StrategyConfig;
    initialName?: string;
    initialDesc?: string;
}

const NEW_STRAT_ID = "__new__";
const formatPct = (n: number) => n ? `${(n * 100).toFixed(2)}%` : "0.00%";

const StrategyBuilder: React.FC<Props> = ({
    strategies, settings, onSave, onRunBacktest, loading,
    initialStratId = NEW_STRAT_ID,
    initialConfig = DEFAULT_STRATEGY_CONFIG,
    initialName = "",
    initialDesc = ""
}) => {
    const [bStratId, setBStratId] = useState(initialStratId);
    const [bName, setBName] = useState(initialName);
    const [bDesc, setBDesc] = useState(initialDesc);
    const [bConfig, setBConfig] = useState<StrategyConfig>(initialConfig);
    const [bSettingId, setBSettingId] = useState("");
    const [bResult, setBResult] = useState<Backtest | null>(null);
    const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

    const loadStratToBuilder = (id: string) => {
        setBStratId(id);
        if (id === NEW_STRAT_ID) {
            setBName("");
            setBDesc("");
            setBConfig(DEFAULT_STRATEGY_CONFIG);
            setBResult(null);
        } else {
            const s = strategies.find(x => x.id === id);
            if (s) {
                setBName(s.name);
                setBDesc(s.description);
                setBConfig(normalizeStrategyConfig(s.strategy_json));
                setBResult(null);
            }
        }
    };

    const handleImportPreset = (preset: typeof PRESET_STRATEGIES[0]) => {
        setBName(preset.name);
        setBDesc(preset.description);
        setBConfig(preset.config);
        setIsPresetModalOpen(false);
    };

    const handleSave = () => {
        onSave(bStratId, bName, bDesc, bConfig).then((newId) => {
            if (newId && typeof newId === 'string') setBStratId(newId);
        });
    };

    const handleRun = async () => {
        const res = await onRunBacktest(bStratId, bSettingId);
        if (res) setBResult(res);
    };

    return (
        <div className="builder-container">
            <div className="builder-top-controls card">
                <div className="control-group">
                    <div className="control-item" style={{ flex: 1 }}>
                        <label>전략 선택</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <select className="select" value={bStratId} onChange={e => loadStratToBuilder(e.target.value)} style={{ flex: 1 }}>
                                <option value={NEW_STRAT_ID}>+ 새 전략 작성</option>
                                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <button className="btn btn--secondary" onClick={() => setIsPresetModalOpen(true)}>
                                📂 기본 전략 가져오기
                            </button>
                        </div>
                    </div>
                </div>

                <div className="control-group">
                    <div className="control-item" style={{ flex: 1 }}>
                        <label>전략 이름</label>
                        <input className="input" placeholder="전략 이름 입력" value={bName} onChange={e => setBName(e.target.value)} />
                    </div>
                    <div className="control-item">
                        <label>&nbsp;</label>
                        <button className="btn btn--secondary" onClick={handleSave}>전략 저장</button>
                    </div>
                </div>

                <div className="control-divider" />

                <div className="control-group">
                    <div className="control-item" style={{ flex: 2 }}>
                        <label>백테스트 설정</label>
                        <select className="select" value={bSettingId} onChange={e => setBSettingId(e.target.value)}>
                            <option value="">설정 선택...</option>
                            {settings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="control-item">
                        <label>&nbsp;</label>
                        <button className="btn btn--primary" onClick={handleRun} disabled={loading}>
                            {loading ? '실행 중...' : '백테스트 실행'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="builder-split-view">
                <div className="builder-editor-pane">
                    <StrategyBlocklyEditor value={bConfig} onChange={setBConfig} />
                </div>
                <div className="builder-result-pane card">
                    {bResult ? (
                        <>
                            <div className="result-header">
                                <span className="result-title">실행 결과</span>
                                <span className={bResult.metrics.total_return > 0 ? 'text-success' : 'text-danger'} style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                                    {formatPct(bResult.metrics.total_return)}
                                </span>
                            </div>
                            <div className="result-chart">
                                <EquityChart data={bResult.equity_curve} height={200} />
                            </div>
                            <div className="metric-grid-compact">
                                <div className="metric-item">
                                    <span className="metric-label">CAGR</span>
                                    <span className="metric-value">{formatPct(bResult.metrics.cagr)}</span>
                                </div>
                                <div className="metric-item">
                                    <span className="metric-label">MDD</span>
                                    <span className="metric-value text-danger">{formatPct(bResult.metrics.max_drawdown)}</span>
                                </div>
                                <div className="metric-item">
                                    <span className="metric-label">Sharpe</span>
                                    <span className="metric-value">{bResult.metrics.sharpe.toFixed(2)}</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state-small">
                            백테스트 실행 결과가 여기에 표시됩니다.
                        </div>
                    )}
                </div>
            </div>

            {isPresetModalOpen && (
                <Modal title="기본 투자 전략 가져오기" onClose={() => setIsPresetModalOpen(false)}>
                    <div className="strategy-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                        {PRESET_STRATEGIES.map((preset, idx) => (
                            <div key={idx} className="card" style={{ cursor: 'pointer' }} onClick={() => handleImportPreset(preset)}>
                                <div className="card__header">{preset.name}</div>
                                <div className="card__body">
                                    <p className="card-desc">{preset.description}</p>
                                    <button className="btn btn--primary btn--sm" style={{ width: '100%' }}>선택</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default StrategyBuilder;