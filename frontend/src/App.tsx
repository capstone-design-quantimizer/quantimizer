import { useCallback, useEffect, useState, useMemo, type FormEvent } from "react";
import Swal from 'sweetalert2';
import "./App.css";
import StrategyBlocklyEditor, {
  DEFAULT_STRATEGY_CONFIG,
  type StrategyConfig,
  normalizeStrategyConfig
} from "./StrategyBlocklyEditor";

// -------------------- Types --------------------

interface BacktestSetting {
  id: string;
  name: string;
  market: string;
  min_market_cap: number;
  start_date: string;
  end_date: string;
  initial_capital: number;
  created_at: string;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  strategy_json: any;
  created_at: string;
  updated_at: string;
}

interface EquityPoint {
  date: string;
  equity: number;
}

interface Backtest {
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

interface CommunityPost {
  id: string;
  title: string;
  content: string;
  author_username: string;
  created_at: string;
  strategy_name: string;
  strategy_id: string;
  latest_metrics?: { return: number; mdd: number; cagr: number };
}

// -------------------- Constants --------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "quant.token";
const NEW_STRAT_ID = "__new__";

const formatDate = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
const formatPct = (n: number) => n ? `${(n * 100).toFixed(2)}%` : "0.00%";
const formatNum = (n: number) => new Intl.NumberFormat('ko-KR', { notation: "compact", maximumFractionDigits: 1 }).format(n);

// -------------------- Components --------------------

const EquityChart = ({
  data,
  comparison,
  height = 240
}: {
  data: EquityPoint[];
  comparison?: { label: string; data: EquityPoint[] };
  height?: number;
}) => {
  if (!data || data.length === 0) {
    return <div className="equity-chart" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#fafafa', borderRadius: 6, border: '1px dashed #eaeaea' }}>데이터 없음</div>;
  }

  const mainData = data.map(d => d.equity);
  const compData = comparison ? comparison.data.map(d => d.equity) : [];
  const allValues = [...mainData, ...compData];

  const minVal = Math.min(...allValues) * 0.98;
  const maxVal = Math.max(...allValues) * 1.02;
  const range = maxVal - minVal || 1;

  // MDD Calculation
  let peak = -Infinity;
  const mddSeries = data.map(d => {
    if (d.equity > peak) peak = d.equity;
    return (d.equity - peak) / peak;
  });
  const minMdd = Math.min(...mddSeries);
  const mddRange = Math.abs(minMdd) || 0.1;

  const padding = { top: 20, bottom: 30, left: 50, right: 20 };
  const svgW = 1000;
  const svgH = height;
  const graphW = svgW - padding.left - padding.right;
  const graphH = svgH - padding.top - padding.bottom;

  const getPoints = (series: number[]) => {
    if (series.length === 0) return "";
    return series.map((val, i) => {
      const x = padding.left + (i / (series.length - 1)) * graphW;
      const y = padding.top + graphH - ((val - minVal) / range) * graphH;
      return `${x},${y}`;
    }).join(" ");
  };

  const getMddPoints = () => {
    if (mddSeries.length === 0) return "";
    return mddSeries.map((val, i) => {
      const x = padding.left + (i / (mddSeries.length - 1)) * graphW;
      // MDD 그래프는 하단 25% 영역에 표시
      const y = padding.top + graphH - (Math.abs(val) / mddRange) * (graphH * 0.25);
      return `${x},${y}`;
    }).join(" ");
  };

  const yTicks = [0, 1, 2, 3].map(i => {
    const val = minVal + (range * (i / 3));
    const y = padding.top + graphH - ((val - minVal) / range) * graphH;
    return { y, val };
  });

  const xTicks = [
    { x: padding.left, label: formatDate(data[0].date) },
    { x: padding.left + graphW / 2, label: formatDate(data[Math.floor(data.length / 2)].date) },
    { x: padding.left + graphW, label: formatDate(data[data.length - 1].date) }
  ];

  return (
    <div>
      <div className="equity-chart" style={{ height }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" className="chart-svg">
          {/* Grid & Axis */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={padding.left} y1={tick.y} x2={svgW - padding.right} y2={tick.y} className="chart-grid" />
              <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="chart-axis-text">{formatNum(tick.val)}</text>
            </g>
          ))}
          {xTicks.map((tick, i) => (
            <text key={i} x={tick.x} y={svgH - 5} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="chart-axis-text">{tick.label}</text>
          ))}

          {/* Comparison Line */}
          {comparison && (
            <polyline points={getPoints(compData)} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="4,2" vectorEffect="non-scaling-stroke" opacity={0.5} />
          )}

          {/* Main Equity Line */}
          <polyline points={getPoints(mainData)} fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" />

          {/* MDD Line (Red, Bottom) */}
          <polyline points={getMddPoints()} fill="none" stroke="#ef4444" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity={0.8} />
        </svg>
      </div>
      <div className="chart-legend-html">
        <div className="legend-item"><div className="legend-dot" style={{ background: "#2563eb" }}></div><span>Equity</span></div>
        <div className="legend-item"><div className="legend-dot" style={{ background: "#ef4444" }}></div><span>Drawdown</span></div>
        {comparison && <div className="legend-item"><div className="legend-dot" style={{ background: "#dc2626", opacity: 0.5 }}></div><span style={{ color: "#dc2626" }}>{comparison.label}</span></div>}
      </div>
    </div>
  );
};

const Modal = ({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) => (
  <div className="modal__backdrop" onClick={onClose}>
    <div className="modal__content" onClick={e => e.stopPropagation()}>
      <div className="modal__header">
        <span>{title}</span>
        <button className="btn--ghost" onClick={onClose} style={{ fontSize: '1.25rem' }}>&times;</button>
      </div>
      <div className="modal__body">{children}</div>
    </div>
  </div>
);

const Pagination = ({ current, total, limit, onChange }: { current: number, total: number, limit: number, onChange: (p: number) => void }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button className="btn--icon" disabled={current === 1} onClick={() => onChange(current - 1)}>‹</button>
      {pages.map(p => (
        <button key={p} className={`page-num ${p === current ? 'active' : ''}`} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
      <button className="btn--icon" disabled={current === totalPages} onClick={() => onChange(current + 1)}>›</button>
    </div>
  );
};

// -------------------- Main App --------------------

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(false);

  // Data
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  // Dashboard Control
  const [slideIndex, setSlideIndex] = useState(0);
  const [dashboardFilter, setDashboardFilter] = useState<'return' | 'latest'>('return');

  // Builder State
  const [bStratId, setBStratId] = useState(NEW_STRAT_ID);
  const [bName, setBName] = useState("");
  const [bDesc, setBDesc] = useState("");
  const [bConfig, setBConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [bSettingId, setBSettingId] = useState("");
  const [bResult, setBResult] = useState<Backtest | null>(null);

  // Pagination State
  const [stratPage, setStratPage] = useState(1);
  const [btPage, setBtPage] = useState(1);
  const [stPage, setStPage] = useState(1);

  // Filtering
  const [btFilter, setBtFilter] = useState("ALL");

  // Modals & Forms
  const [detailStrat, setDetailStrat] = useState<Strategy | null>(null);
  const [selectedDetailBts, setSelectedDetailBts] = useState<string[]>([]);
  const [compareModal, setCompareModal] = useState<any>(null);
  const [resultModal, setResultModal] = useState<Backtest | null>(null);
  const [settingModal, setSettingModal] = useState(false);
  const [writeModal, setWriteModal] = useState(false);

  const [settingForm, setSettingForm] = useState<Partial<BacktestSetting>>({});
  const [postForm, setPostForm] = useState({ title: '', content: '', strategyId: '' });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' });

  // -------------------- API --------------------

  const api = useCallback(async (url: string, opts: any = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}` };
    const res = await fetch(API_BASE + url, { ...opts, headers });
    if (res.status === 401) {
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
      Swal.fire("인증 만료", "다시 로그인해주세요.", "warning");
      throw new Error("Auth");
    }
    return res;
  }, [token]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [s, st, b, p] = await Promise.all([
        api("/strategies?limit=100").then(r => r.json()),
        api("/backtest-settings?limit=100").then(r => r.json()),
        api("/backtests?limit=100").then(r => r.json()),
        api("/community/posts").then(r => r.json())
      ]);
      setStrategies(s.items || []);
      setSettings(st.items || []);
      setBacktests(b.items || []);
      setPosts(p.items || []);
      // Default setting selection
      if (st.items && st.items.length > 0 && !bSettingId) setBSettingId(st.items[0].id);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, api, bSettingId]);

  useEffect(() => { loadData(); }, [loadData]);

  // -------------------- Handlers --------------------

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    const endpoint = authMode === 'login' ? "/auth/login" : "/auth/register";
    const body = authMode === 'login' ? new URLSearchParams({ username: authForm.email, password: authForm.password }) : JSON.stringify(authForm);
    const headers = authMode === 'register' ? { "Content-Type": "application/json" } : { "Content-Type": "application/x-www-form-urlencoded" };
    try {
      const res = await fetch(API_BASE + endpoint, { method: "POST", headers, body });
      if (res.ok) {
        if (authMode === 'register') {
          Swal.fire("성공", "회원가입이 완료되었습니다.", "success");
          setAuthMode('login');
        } else {
          const d = await res.json();
          setToken(d.access_token);
          localStorage.setItem(TOKEN_KEY, d.access_token);
        }
      } else Swal.fire("실패", "로그인 또는 가입 정보를 확인하세요.", "error");
    } catch { Swal.fire("오류", "네트워크 오류가 발생했습니다.", "error"); }
  };

  const loadStratToBuilder = (id: string) => {
    setBStratId(id);
    if (id === NEW_STRAT_ID) {
      setBName(""); setBDesc(""); setBConfig(DEFAULT_STRATEGY_CONFIG); setBResult(null);
    } else {
      const s = strategies.find(x => x.id === id);
      if (s) { setBName(s.name); setBDesc(s.description); setBConfig(normalizeStrategyConfig(s.strategy_json)); setBResult(null); }
    }
  };

  const saveStrategy = async () => {
    if (!bName) return Swal.fire("알림", "전략 이름을 입력해주세요.", "warning");
    const method = bStratId === NEW_STRAT_ID ? "POST" : "PUT";
    const url = bStratId === NEW_STRAT_ID ? "/strategies" : `/strategies/${bStratId}`;
    const res = await api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: bName, description: bDesc, strategy_json: bConfig }) });
    if (res.ok) {
      const d = await res.json();
      setBStratId(d.id);
      loadData();
      Swal.fire("저장 완료", "전략이 성공적으로 저장되었습니다.", "success");
    }
  };

  const runBacktest = async () => {
    if (bStratId === NEW_STRAT_ID) return Swal.fire("알림", "전략을 먼저 저장해주세요.", "warning");
    if (!bSettingId) return Swal.fire("알림", "백테스트 설정을 선택해주세요.", "warning");
    setLoading(true);
    try {
      const res = await api("/backtests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy_id: bStratId, setting_id: bSettingId }) });
      if (res.ok) { setBResult(await res.json()); loadData(); }
      else Swal.fire("실패", "백테스트 실행 중 오류가 발생했습니다.", "error");
    } catch { Swal.fire("오류", "실행 실패", "error"); }
    setLoading(false);
  };

  const saveSetting = async () => {
    await api("/backtest-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settingForm, market: settingForm.market || "ALL", min_market_cap: Number(settingForm.min_market_cap), initial_capital: Number(settingForm.initial_capital), exclude_list: [] }) });
    setSettingModal(false); loadData(); Swal.fire("완료", "설정이 저장되었습니다.", "success");
  };

  const deleteSetting = async (id: string) => {
    const r = await Swal.fire({ title: '삭제하시겠습니까?', icon: 'warning', showCancelButton: true, confirmButtonText: '삭제', cancelButtonText: '취소' });
    if (r.isConfirmed) { await api(`/backtest-settings/${id}`, { method: 'DELETE' }); loadData(); Swal.fire("삭제됨", "삭제되었습니다.", "success"); }
  };

  const createPost = async () => {
    if (!postForm.title) return Swal.fire("알림", "제목을 입력하세요.", "warning");
    await api("/community/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: postForm.title, content: postForm.content, strategy_id: postForm.strategyId }) });
    setWriteModal(false); loadData(); Swal.fire("등록 완료", "게시글이 등록되었습니다.", "success");
  };

  // -------------------- Computed --------------------

  const maxReturnBacktest = useMemo(() => {
    if (backtests.length === 0) return null;
    return backtests.reduce((max, curr) => curr.metrics.total_return > max.metrics.total_return ? curr : max, backtests[0]);
  }, [backtests]);

  const maxReturnStrategyName = useMemo(() => {
    if (!maxReturnBacktest) return "-";
    return strategies.find(s => s.id === maxReturnBacktest.strategy_id)?.name || "Unknown";
  }, [maxReturnBacktest, strategies]);

  const dashboardCards = useMemo(() => {
    const sorted = [...backtests];
    if (dashboardFilter === 'return') {
      sorted.sort((a, b) => b.metrics.total_return - a.metrics.total_return);
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted.slice(0, 3);
  }, [backtests, dashboardFilter]);

  const handleSlide = (dir: 'next' | 'prev') => {
    if (dashboardCards.length === 0) return;
    setSlideIndex(prev => {
      if (dir === 'next') return (prev + 1) % dashboardCards.length;
      return (prev - 1 + dashboardCards.length) % dashboardCards.length;
    });
  };

  // -------------------- Render --------------------

  if (!token) return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 style={{ marginBottom: 8, fontSize: '1.8rem', fontWeight: 800 }}>QuantiMizer</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>퀀트 투자의 모든 것</p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {authMode === 'register' && <input className="input" placeholder="사용자명" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} required />}
          <input className="input" placeholder="이메일" type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} required />
          <input className="input" placeholder="비밀번호" type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} required />
          <button className="btn btn--primary" style={{ height: 44 }}>{authMode === 'login' ? '로그인' : '회원가입'}</button>
        </form>
        <button className="btn--ghost" style={{ marginTop: 16 }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
          {authMode === 'login' ? '계정 만들기' : '로그인하기'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header__inner">
          <div className="header-top-row">
            <div className="brand" onClick={() => setPage('dashboard')}>
              <div className="brand-logo">Q</div> QuantiMizer
            </div>
            <button className="logout-button" onClick={() => { setToken(null); localStorage.removeItem(TOKEN_KEY); }}>로그아웃</button>
          </div>
          <nav className="nav-tabs">
            {[
              { id: 'dashboard', label: '대시보드' },
              { id: 'builder', label: '전략 빌더' },
              { id: 'settings', label: '백테스트 조건' },
              { id: 'strategies', label: '내 전략' },
              { id: 'backtests', label: '백테스트 내역' },
              { id: 'community', label: '커뮤니티' }
            ].map(tab => (
              <button key={tab.id} className={`nav-tab ${page === tab.id ? 'nav-tab--active' : ''}`} onClick={() => setPage(tab.id)}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main-content">
        {page === 'dashboard' && (
          <>
            <div className="kpi-grid">
              <div className="kpi" onClick={() => setPage('strategies')}>
                <div className="kpi__label">보유 전략</div>
                <div className="kpi__value">{strategies.length}</div>
                <div className="kpi__sub">현재 운용 가능한 전략 수</div>
              </div>
              <div className="kpi" onClick={() => setPage('backtests')}>
                <div className="kpi__label">총 백테스트</div>
                <div className="kpi__value">{backtests.length}</div>
                <div className="kpi__sub">누적 시뮬레이션 횟수</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">최고 수익률</div>
                <div className="kpi__value text-success">
                  {formatPct(Math.max(...backtests.map(b => b.metrics.total_return), 0))}
                </div>
                <div className="kpi__sub">
                  <span style={{ fontWeight: 600, color: '#000' }}>{maxReturnStrategyName}</span> 전략
                </div>
              </div>
            </div>

            <div className="page-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="section-title">대표 백테스트 결과</h3>
                <div className="toggle-group">
                  <button className={`toggle-btn ${dashboardFilter === 'return' ? 'active' : ''}`} onClick={() => { setDashboardFilter('return'); setSlideIndex(0); }}>수익률순</button>
                  <button className={`toggle-btn ${dashboardFilter === 'latest' ? 'active' : ''}`} onClick={() => { setDashboardFilter('latest'); setSlideIndex(0); }}>최신순</button>
                </div>
              </div>

              {dashboardCards.length > 0 ? (
                <div className="dashboard-carousel">
                  <div className="carousel-nav prev" onClick={() => handleSlide('prev')}>‹</div>
                  <div className="carousel-track" style={{ transform: `translateX(-${slideIndex * 100}%)` }}>
                    {dashboardCards.map(bt => (
                      <div key={bt.id} className="carousel-slide">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                          <div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{strategies.find(s => s.id === bt.strategy_id)?.name}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>{bt.setting_name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div className="text-success" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatPct(bt.metrics.total_return)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>총 수익률</div>
                          </div>
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <EquityChart data={bt.equity_curve} height={280} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="carousel-nav next" onClick={() => handleSlide('next')}>›</div>
                  <div className="carousel-dots-container">
                    <div className="carousel-dots">
                      {dashboardCards.map((_, i) => (
                        <div key={i} className={`carousel-dot ${i === slideIndex ? 'active' : ''}`} onClick={() => setSlideIndex(i)} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card empty-state">
                  아직 실행된 백테스트가 없습니다.
                </div>
              )}
            </div>
          </>
        )}

        {page === 'builder' && (
          <div className="builder-container">
            <div className="builder-top-controls card">
              <div className="control-group">
                <div className="control-item">
                  <label>전략 선택</label>
                  <select className="select" value={bStratId} onChange={e => loadStratToBuilder(e.target.value)}>
                    <option value={NEW_STRAT_ID}>+ 새 전략 작성</option>
                    {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="control-item" style={{ flex: 2 }}>
                  <label>전략 이름</label>
                  <input className="input" placeholder="전략 이름 입력" value={bName} onChange={e => setBName(e.target.value)} />
                </div>
                <div className="control-item">
                  <label>&nbsp;</label>
                  <button className="btn btn--secondary" onClick={saveStrategy}>전략 저장</button>
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
                  <button className="btn btn--primary" onClick={runBacktest} disabled={loading}>
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
          </div>
        )}

        {page === 'settings' && (
          <div className="card">
            <div className="card__header">
              <span>백테스트 조건 관리</span>
              <button className="btn btn--primary" onClick={() => { setSettingForm({}); setSettingModal(true); }}>+ 조건 생성</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>이름</th><th>시장</th><th>기간</th><th>초기 자본</th><th>관리</th></tr></thead>
                <tbody>
                  {settings.slice((stPage - 1) * 10, stPage * 10).map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td><span className="badge">{s.market}</span></td>
                      <td>{s.start_date} ~ {s.end_date}</td>
                      <td>{formatNum(s.initial_capital)}</td>
                      <td>
                        <button className="btn btn--danger btn--sm" onClick={() => deleteSetting(s.id)}>삭제</button>
                      </td>
                    </tr>
                  ))}
                  {settings.length === 0 && <tr><td colSpan={5} className="empty-table">등록된 설정이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pagination current={stPage} total={settings.length} limit={10} onChange={setStPage} />
          </div>
        )}

        {page === 'strategies' && (
          <div className="page-section">
            <div className="strategy-grid">
              {strategies.slice((stratPage - 1) * 6, stratPage * 6).map(s => {
                const lastBt = backtests.filter(b => b.strategy_id === s.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                return (
                  <div key={s.id} className="card">
                    <div className="card__header">{s.name}</div>
                    <div className="card__body">
                      <p className="card-desc">{s.description || "설명 없음"}</p>
                      <div className="card-meta">
                        <div>
                          <div className="meta-label">최근 수익률</div>
                          <div className={`meta-value ${lastBt?.metrics.total_return > 0 ? 'text-success' : ''}`}>
                            {lastBt ? formatPct(lastBt.metrics.total_return) : '-'}
                          </div>
                        </div>
                        <div className="meta-label">{lastBt ? formatDate(lastBt.created_at) : '기록 없음'}</div>
                      </div>
                      <div className="strategy-card-actions">
                        <button className="btn btn--secondary" onClick={() => { setDetailStrat(s); setSelectedDetailBts([]); }}>상세 정보</button>
                        <button className="btn btn--primary" onClick={() => { loadStratToBuilder(s.id); setPage('builder'); }}>수정</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination current={stratPage} total={strategies.length} limit={6} onChange={setStratPage} />
          </div>
        )}

        {page === 'backtests' && (
          <div className="card">
            <div className="card__header">
              <span>백테스트 내역</span>
              <select className="select" style={{ width: 200 }} value={btFilter} onChange={e => { setBtFilter(e.target.value); setBtPage(1); }}>
                <option value="ALL">전체 전략 보기</option>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>전략명</th><th>조건명</th><th>수익률</th><th>MDD</th><th>실행일</th><th>결과</th></tr></thead>
                <tbody>
                  {backtests.filter(b => btFilter === 'ALL' || b.strategy_id === btFilter)
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice((btPage - 1) * 10, btPage * 10).map(b => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600 }}>{strategies.find(s => s.id === b.strategy_id)?.name}</td>
                        <td>{b.setting_name}</td>
                        <td className={b.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>{formatPct(b.metrics.total_return)}</td>
                        <td>{formatPct(b.metrics.max_drawdown)}</td>
                        <td>{formatDate(b.created_at)}</td>
                        <td><button className="btn btn--secondary btn--sm" onClick={() => setResultModal(b)}>그래프 보기</button></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Pagination current={btPage} total={backtests.filter(b => btFilter === 'ALL' || b.strategy_id === btFilter).length} limit={10} onChange={setBtPage} />
          </div>
        )}

        {page === 'community' && (
          <div className="page-section">
            <div className="section-header">
              <h2 className="section-title">커뮤니티</h2>
              <button className="btn btn--primary" onClick={() => setWriteModal(true)}>+ 글쓰기</button>
            </div>
            <div className="strategy-grid">
              {posts.map(p => (
                <div key={p.id} className="card">
                  <div className="card__header">{p.title}</div>
                  <div className="card__body">
                    <p className="card-desc">{p.content}</p>
                    <div className="post-metrics">
                      <div className="post-metric-label">최근 성과</div>
                      <div className="post-metric-row">
                        <div><span>수익률</span><span className="text-success">{formatPct(p.latest_metrics?.return || 0)}</span></div>
                        <div><span>MDD</span><span className="text-danger">{formatPct(p.latest_metrics?.mdd || 0)}</span></div>
                        <div><span>CAGR</span><span>{formatPct(p.latest_metrics?.cagr || 0)}</span></div>
                      </div>
                    </div>
                    <div className="post-footer">
                      <span className="author">by <strong>{p.author_username}</strong></span>
                      <button className="btn btn--secondary btn--sm" onClick={async () => { await api(`/community/posts/${p.id}/fork`, { method: 'POST' }); Swal.fire("완료", "전략을 가져왔습니다!", "success"); loadData(); }}>전략 가져오기</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* -------------------- Modals -------------------- */}

      {detailStrat && (
        <Modal title={detailStrat.name} onClose={() => setDetailStrat(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p style={{ color: 'var(--text-secondary)' }}>{detailStrat.description}</p>
            <div className="card">
              <div className="card__header">
                백테스트 결과 비교 (2개 선택)
                <button className="btn btn--primary btn--sm" disabled={selectedDetailBts.length !== 2} onClick={() => {
                  const b1 = backtests.find(b => b.id === selectedDetailBts[0]);
                  const b2 = backtests.find(b => b.id === selectedDetailBts[1]);
                  if (b1 && b2) setCompareModal({ labelA: b1.setting_name, dataA: b1, labelB: b2.setting_name, dataB: b2 });
                }}>비교하기</button>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th style={{ width: 40 }}></th><th>설정명</th><th>기간</th><th>수익률</th><th>MDD</th></tr></thead>
                  <tbody>
                    {backtests.filter(b => b.strategy_id === detailStrat.id).map(b => (
                      <tr key={b.id} className={selectedDetailBts.includes(b.id) ? 'row-selected' : ''}>
                        <td><input type="checkbox" checked={selectedDetailBts.includes(b.id)} onChange={() => { if (selectedDetailBts.includes(b.id)) setSelectedDetailBts(p => p.filter(x => x !== b.id)); else if (selectedDetailBts.length < 2) setSelectedDetailBts(p => [...p, b.id]); }} /></td>
                        <td>{b.setting_name}</td>
                        <td>{b.start_date} ~ {b.end_date}</td>
                        <td className={b.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>{formatPct(b.metrics.total_return)}</td>
                        <td>{formatPct(b.metrics.max_drawdown)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {compareModal && (
        <Modal title="수익률 비교 분석" onClose={() => setCompareModal(null)}>
          <div>
            <EquityChart data={compareModal.dataA.equity_curve} comparison={{ label: compareModal.labelB, data: compareModal.dataB.equity_curve }} height={300} />
            <div className="metric-grid-mini" style={{ marginTop: 30 }}>
              <div className="compare-col">
                <h4 style={{ color: '#2563eb' }}>{compareModal.labelA}</h4>
                <div className="metric-box"><label>수익률</label><span>{formatPct(compareModal.dataA.metrics.total_return)}</span></div>
                <div className="metric-box"><label>Sharpe</label><span>{compareModal.dataA.metrics.sharpe.toFixed(2)}</span></div>
              </div>
              <div className="compare-col">
                <h4 style={{ color: '#dc2626' }}>{compareModal.labelB}</h4>
                <div className="metric-box"><label>수익률</label><span>{formatPct(compareModal.dataB.metrics.total_return)}</span></div>
                <div className="metric-box"><label>Sharpe</label><span>{compareModal.dataB.metrics.sharpe.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {resultModal && (
        <Modal title="상세 리포트" onClose={() => setResultModal(null)}>
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }} className={resultModal.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>
                {formatPct(resultModal.metrics.total_return)}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>누적 수익률</div>
            </div>
            <EquityChart data={resultModal.equity_curve} height={320} />
            <div className="metric-grid-mini" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 32 }}>
              <div className="metric-box"><label>CAGR</label><span>{formatPct(resultModal.metrics.cagr)}</span></div>
              <div className="metric-box"><label>MDD</label><span className="text-danger">{formatPct(resultModal.metrics.max_drawdown)}</span></div>
              <div className="metric-box"><label>Sharpe</label><span>{resultModal.metrics.sharpe.toFixed(2)}</span></div>
              <div className="metric-box"><label>Win Rate</label><span>65.00%</span></div>
            </div>
          </div>
        </Modal>
      )}

      {settingModal && (
        <Modal title="새 백테스트 조건" onClose={() => setSettingModal(false)}>
          <div className="form-stack">
            <div><label>설정 이름</label><input className="input" value={settingForm.name || ''} onChange={e => setSettingForm({ ...settingForm, name: e.target.value })} /></div>
            <div className="form-row">
              <div><label>대상 시장</label><select className="select" value={settingForm.market || 'ALL'} onChange={e => setSettingForm({ ...settingForm, market: e.target.value })}><option value="ALL">전체</option><option value="KOSPI">코스피</option><option value="KOSDAQ">코스닥</option></select></div>
              <div><label>최소 시가총액</label><input className="input" type="number" value={settingForm.min_market_cap || 0} onChange={e => setSettingForm({ ...settingForm, min_market_cap: Number(e.target.value) })} /></div>
            </div>
            <div className="form-row">
              <div><label>시작일</label><input className="input" type="date" value={settingForm.start_date || ''} onChange={e => setSettingForm({ ...settingForm, start_date: e.target.value })} /></div>
              <div><label>종료일</label><input className="input" type="date" value={settingForm.end_date || ''} onChange={e => setSettingForm({ ...settingForm, end_date: e.target.value })} /></div>
            </div>
            <div><label>초기 자본금</label><input className="input" type="number" value={settingForm.initial_capital || 10000000} onChange={e => setSettingForm({ ...settingForm, initial_capital: Number(e.target.value) })} /></div>
            <div className="form-actions"><button className="btn btn--primary" onClick={saveSetting}>저장하기</button></div>
          </div>
        </Modal>
      )}

      {writeModal && (
        <Modal title="전략 공유하기" onClose={() => setWriteModal(false)}>
          <div className="form-stack">
            <input className="input" placeholder="제목" value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} />
            <select className="select" value={postForm.strategyId} onChange={e => setPostForm({ ...postForm, strategyId: e.target.value })}>
              <option value="">공유할 전략 선택...</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea className="textarea" placeholder="전략에 대한 설명과 논리를 공유해주세요..." value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} />
            <div className="form-actions"><button className="btn btn--primary" onClick={createPost}>등록하기</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}