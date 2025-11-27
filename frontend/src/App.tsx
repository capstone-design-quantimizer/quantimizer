import { useCallback, useEffect, useState, useMemo, type FormEvent } from "react";
import "./App.css";
import StrategyBlocklyEditor, { DEFAULT_STRATEGY_CONFIG, type StrategyConfig, normalizeStrategyConfig } from "./StrategyBlocklyEditor";

// -------------------- Types --------------------
interface BacktestSetting {
  id: string; owner_id: string; name: string; market: string; min_market_cap: number; exclude_list: string[];
  start_date: string; end_date: string; initial_capital: number; created_at: string;
}
interface Strategy {
  id: string; owner_id: string; name: string; description: string; strategy_json: any; created_at: string; updated_at: string;
}
interface EquityPoint { date: string; equity: number; drawdown?: number; }
interface Backtest {
  id: string; strategy_id: string; setting_id: string; setting_name: string; start_date: string; end_date: string;
  initial_capital: number; equity_curve: EquityPoint[]; metrics: any; created_at: string;
}
interface CommunityPost {
  id: string; title: string; content: string; author_username: string; created_at: string; strategy_name: string; strategy_id: string;
  latest_metrics?: { return: number; mdd: number; cagr: number }; // Mocking for display
}

// -------------------- Constants --------------------
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "quant.token";
const NEW_STRAT_ID = "__new__";

const formatDate = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
const formatPct = (n: number) => n ? `${(n * 100).toFixed(2)}%` : "0.00%";
const formatNum = (n: number) => new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(n);

// -------------------- Improved Chart Component --------------------
const EquityChart = ({ data, comparison, height = 300 }: { data: EquityPoint[], comparison?: { label: string, data: EquityPoint[] }, height?: number }) => {
  if (!data || data.length === 0) return <div className="equity-chart empty">데이터가 충분하지 않습니다.</div>;

  // Process Data
  const mainData = data.map(d => d.equity);
  const compData = comparison ? comparison.data.map(d => d.equity) : [];
  const allValues = [...mainData, ...compData];

  const minVal = Math.min(...allValues) * 0.95;
  const maxVal = Math.max(...allValues) * 1.05;
  const range = maxVal - minVal || 1;

  const padding = { top: 20, bottom: 30, left: 40, right: 20 };
  const svgW = 1000;
  const svgH = height;
  const graphW = svgW - padding.left - padding.right;
  const graphH = svgH - padding.top - padding.bottom;

  const getPoints = (series: number[]) => {
    return series.map((val, i) => {
      const x = padding.left + (i / (series.length - 1)) * graphW;
      const y = padding.top + graphH - ((val - minVal) / range) * graphH;
      return `${x},${y}`;
    }).join(" ");
  };

  // Generate Y Axis ticks (5 steps)
  const yTicks = [0, 1, 2, 3, 4].map(i => {
    const val = minVal + (range * (i / 4));
    const y = padding.top + graphH - ((val - minVal) / range) * graphH;
    return { y, val };
  });

  // Generate X Axis ticks (Start, Middle, End)
  const xTicks = [
    { x: padding.left, label: formatDate(data[0].date) },
    { x: padding.left + graphW / 2, label: formatDate(data[Math.floor(data.length / 2)].date) },
    { x: padding.left + graphW, label: formatDate(data[data.length - 1].date) }
  ];

  // Colors: Main = Green (Success), Comparison = Red (Danger/Contrast)
  const mainColor = comparison ? "#10b981" : "#3b82f6"; // Green if comparing, else Brand Blue
  const compColor = "#ef4444"; // Red for comparison

  return (
    <div className="equity-chart" style={{ height }}>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" className="chart-svg">
        {/* Grid & Y Axis */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={padding.left} y1={tick.y} x2={svgW - padding.right} y2={tick.y} className="chart-grid" />
            <text x={padding.left - 5} y={tick.y + 4} textAnchor="end" className="chart-axis-text">
              {formatNum(tick.val)}
            </text>
          </g>
        ))}

        {/* X Axis Labels */}
        {xTicks.map((tick, i) => (
          <text key={i} x={tick.x} y={svgH - 5} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="chart-axis-text">
            {tick.label}
          </text>
        ))}

        {/* Comparison Line (Red) */}
        {comparison && (
          <polyline points={getPoints(compData)} fill="none" stroke={compColor} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeOpacity="0.8" />
        )}

        {/* Main Line (Green/Blue) */}
        <polyline points={getPoints(mainData)} fill="none" stroke={mainColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-dot" style={{ background: mainColor }}></div>
          <span>Strategy (Eq)</span>
        </div>
        {comparison && (
          <div className="legend-item">
            <div className="legend-dot" style={{ background: compColor }}></div>
            <span>{comparison.label}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// -------------------- Sub Components --------------------
const MetricCard = ({ label, value, isPct = false }: { label: string, value: number, isPct?: boolean }) => {
  const formatted = isPct ? formatPct(value) : value.toFixed(2);
  const colorClass = isPct ? (value > 0 ? 'text-success' : value < 0 ? 'text-danger' : '') : '';
  return (
    <div className="metric-box">
      <label>{label}</label>
      <span className={colorClass}>{formatted}</span>
    </div>
  );
};

const Modal = ({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) => (
  <div className="modal__backdrop" onClick={onClose}>
    <div className="modal__content" onClick={e => e.stopPropagation()}>
      <div className="modal__header">
        <span>{title}</span>
        <button className="btn--ghost" onClick={onClose} style={{ fontSize: '1.2rem' }}>×</button>
      </div>
      <div className="modal__body">{children}</div>
    </div>
  </div>
);

// -------------------- Main App --------------------
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [page, setPage] = useState("dashboard"); // Order: dashboard -> builder -> settings -> strategies -> backtests -> community
  const [loading, setLoading] = useState(false);

  // Data State
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  // Builder State
  const [bStratId, setBStratId] = useState(NEW_STRAT_ID);
  const [bName, setBName] = useState("");
  const [bDesc, setBDesc] = useState("");
  const [bConfig, setBConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [bSettingId, setBSettingId] = useState("");
  const [bResult, setBResult] = useState<Backtest | null>(null);

  // UI State
  const [detailStrat, setDetailStrat] = useState<Strategy | null>(null);
  const [selectedDetailBts, setSelectedDetailBts] = useState<string[]>([]);

  // Modals
  const [compareModal, setCompareModal] = useState<{ labelA: string, dataA: any, labelB: string, dataB: any } | null>(null);
  const [settingModal, setSettingModal] = useState(false);
  const [settingForm, setSettingForm] = useState<Partial<BacktestSetting>>({});
  const [writeModal, setWriteModal] = useState(false);
  const [postForm, setPostForm] = useState({ title: '', content: '', strategyId: '' });
  const [resultModal, setResultModal] = useState<Backtest | null>(null);

  // Pagination & Filtering
  const [stPage, setStPage] = useState(1);
  const [btPage, setBtPage] = useState(1);
  const [btFilter, setBtFilter] = useState("ALL");

  // Auth
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' });

  // -------------------- API & Effects --------------------
  const api = useCallback(async (url: string, opts: any = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}` };
    const res = await fetch(API_BASE + url, { ...opts, headers });
    if (res.status === 401) { setToken(null); localStorage.removeItem(TOKEN_KEY); throw new Error("Auth"); }
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

      // Augment posts with mocked metrics for demo if not present
      const augmentedPosts = (p.items || []).map((post: any) => ({
        ...post,
        latest_metrics: backtests.filter(bt => bt.strategy_id === post.strategy_id).pop()?.metrics
          || { total_return: Math.random() * 0.5, max_drawdown: -0.15, cagr: 0.2 } // Fallback for visuals
      }));
      setPosts(augmentedPosts);

      if (st.items && st.items.length > 0 && !bSettingId) setBSettingId(st.items[0].id);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, api, bSettingId, backtests]); // Added backtests dependency for metric lookup

  useEffect(() => { loadData(); }, [loadData]);

  // -------------------- Actions --------------------
  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    const endpoint = authMode === 'login' ? "/auth/login" : "/auth/register";
    const body = authMode === 'login'
      ? new URLSearchParams({ username: authForm.email, password: authForm.password })
      : JSON.stringify(authForm);
    const headers = authMode === 'register' ? { "Content-Type": "application/json" } : { "Content-Type": "application/x-www-form-urlencoded" };
    try {
      const res = await fetch(API_BASE + endpoint, { method: "POST", headers, body });
      if (res.ok) {
        if (authMode === 'register') { alert("가입 완료"); setAuthMode('login'); }
        else { const d = await res.json(); setToken(d.access_token); localStorage.setItem(TOKEN_KEY, d.access_token); }
      } else alert("로그인/가입 실패");
    } catch { alert("네트워크 오류"); }
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
    if (!bName) return alert("전략 이름을 입력하세요");
    const method = bStratId === NEW_STRAT_ID ? "POST" : "PUT";
    const url = bStratId === NEW_STRAT_ID ? "/strategies" : `/strategies/${bStratId}`;
    const res = await api(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bName, description: bDesc, strategy_json: bConfig })
    });
    if (res.ok) { const d = await res.json(); setBStratId(d.id); loadData(); alert("저장되었습니다."); }
  };

  const runBacktest = async () => {
    if (bStratId === NEW_STRAT_ID) return alert("전략을 먼저 저장하세요.");
    if (!bSettingId) return alert("백테스트 설정을 선택하세요.");
    setLoading(true);
    try {
      const res = await api("/backtests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: bStratId, setting_id: bSettingId })
      });
      if (res.ok) { setBResult(await res.json()); loadData(); }
      else { const err = await res.json(); alert(err.detail || "실행 실패"); }
    } catch { alert("실행 실패"); }
    setLoading(false);
  };

  const saveSetting = async () => {
    try {
      await api("/backtest-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settingForm.name,
          market: settingForm.market || "ALL",
          min_market_cap: Number(settingForm.min_market_cap) || 0,
          exclude_list: [],
          start_date: settingForm.start_date,
          end_date: settingForm.end_date,
          initial_capital: Number(settingForm.initial_capital)
        })
      });
      setSettingModal(false); loadData();
    } catch { alert("저장 실패"); }
  };

  const compareBacktestsInModal = () => {
    const b1 = backtests.find(b => b.id === selectedDetailBts[0]);
    const b2 = backtests.find(b => b.id === selectedDetailBts[1]);
    if (!b1 || !b2) return;
    setCompareModal({
      labelA: b1.setting_name, dataA: b1,
      labelB: b2.setting_name, dataB: b2
    });
  };

  const createPost = async () => {
    const res = await api("/community/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: postForm.title, content: postForm.content, strategy_id: postForm.strategyId })
    });
    if (res.ok) { setWriteModal(false); loadData(); }
  };

  // Dashboard Metrics
  const latestBt = useMemo(() => [...backtests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0], [backtests]);
  const latestStratName = strategies.find(s => s.id === latestBt?.strategy_id)?.name;

  if (!token) return (
    <div className="auth-card">
      <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8, background: 'linear-gradient(to right, #3b82f6, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>QuantiMizer</div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Professional Quant Platform</div>
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {authMode === 'register' && <input className="input" placeholder="Username" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} required />}
        <input className="input" placeholder="Email" type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} required />
        <input className="input" placeholder="Password" type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} required />
        <button className="btn btn--primary" style={{ height: 48, fontSize: '1rem' }}>{authMode === 'login' ? '로그인' : '회원가입'}</button>
      </form>
      <button className="btn--ghost" style={{ marginTop: 24, fontSize: '0.85rem' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
        {authMode === 'login' ? '계정이 없으신가요? 가입하기' : '이미 계정이 있으신가요? 로그인'}
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header__inner">
          <div className="brand" onClick={() => setPage('dashboard')}>QuantiMizer</div>
          <nav className="nav-tabs">
            {/* 2. Reordered Tabs */}
            <button className={`nav-tab ${page === 'dashboard' ? 'nav-tab--active' : ''}`} onClick={() => setPage('dashboard')}>대시보드</button>
            <button className={`nav-tab ${page === 'builder' ? 'nav-tab--active' : ''}`} onClick={() => setPage('builder')}>전략 빌더</button>
            <button className={`nav-tab ${page === 'settings' ? 'nav-tab--active' : ''}`} onClick={() => setPage('settings')}>백테스트 설정</button>
            <button className={`nav-tab ${page === 'strategies' ? 'nav-tab--active' : ''}`} onClick={() => setPage('strategies')}>내 전략</button>
            <button className={`nav-tab ${page === 'backtests' ? 'nav-tab--active' : ''}`} onClick={() => setPage('backtests')}>백테스트 내역</button>
            <button className={`nav-tab ${page === 'community' ? 'nav-tab--active' : ''}`} onClick={() => setPage('community')}>커뮤니티</button>
          </nav>
          <button className="logout-button" onClick={() => { setToken(null); localStorage.removeItem(TOKEN_KEY); }}>로그아웃</button>
        </div>
      </header>

      <main className="main-content">
        {page === 'dashboard' && (
          <>
            <div className="kpi-grid">
              <div className="kpi" onClick={() => setPage('strategies')}>
                <div className="kpi__label">Total Strategies</div>
                <div className="kpi__value">{strategies.length}</div>
                <div className="kpi__sub">Active: {strategies.length}</div>
              </div>
              <div className="kpi" onClick={() => setPage('backtests')}>
                <div className="kpi__label">Latest Return</div>
                <div className="kpi__value text-success">{formatPct(latestBt?.metrics.total_return)}</div>
                <div className="kpi__sub">{latestStratName || 'N/A'}</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">Recent Activity</div>
                <div className="kpi__value" style={{ fontSize: '1.4rem', marginTop: 18 }}>{latestBt ? formatDate(latestBt.created_at) : '-'}</div>
                <div className="kpi__sub">Last Backtest Run</div>
              </div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div className="card__header">Recent Performance</div>
              <div className="card__body">
                {latestBt ? (
                  <>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                      <span className="card__title">{latestStratName} - {latestBt.setting_name}</span>
                      <span className="text-success" style={{ fontWeight: 700 }}>{formatPct(latestBt.metrics.total_return)}</span>
                    </div>
                    {/* 1. Updated Chart */}
                    <EquityChart data={latestBt.equity_curve} />
                  </>
                ) : <div className="equity-chart empty">최근 데이터 없음</div>}
              </div>
            </div>
          </>
        )}

        {page === 'builder' && (
          <div className="builder-layout">
            <div className="builder-control-bar">
              {/* 4. Inputs and Run button moved here */}
              <div className="builder-inputs">
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Strategy Details</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <select className="select" style={{ width: 180 }} value={bStratId} onChange={e => loadStratToBuilder(e.target.value)}>
                    <option value={NEW_STRAT_ID}>+ New Strategy</option>
                    {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input className="input" placeholder="Strategy Name" value={bName} onChange={e => setBName(e.target.value)} />
                </div>
                <input className="input" placeholder="Short Description..." value={bDesc} onChange={e => setBDesc(e.target.value)} />
              </div>

              <div className="builder-actions">
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Simulation Settings</label>
                <select className="select" value={bSettingId} onChange={e => setBSettingId(e.target.value)}>
                  <option value="">Select Settings...</option>
                  {settings.map(s => <option key={s.id} value={s.id}>{s.name} ({s.market})</option>)}
                </select>
                <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                  <button className="btn btn--secondary" style={{ flex: 1 }} onClick={saveStrategy}>Save Strategy</button>
                  <button className="btn btn--primary" style={{ flex: 1 }} onClick={runBacktest} disabled={loading}>{loading ? 'Running...' : 'Run Backtest'}</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderLeft: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status</div>
                <div style={{ fontWeight: 700, color: bResult ? 'var(--success)' : 'var(--text-muted)' }}>{bResult ? 'Completed' : 'Ready'}</div>
              </div>
            </div>

            <div className="builder-body">
              <div className="builder-canvas">
                <StrategyBlocklyEditor value={bConfig} onChange={setBConfig} />
              </div>
              <div className="builder-results">
                <div className="result-header">Backtest Results</div>
                <div className="result-content">
                  {bResult ? (
                    <>
                      <div className="kpi__value text-success" style={{ fontSize: '1.8rem' }}>{formatPct(bResult.metrics.total_return)}</div>
                      <EquityChart data={bResult.equity_curve} height={150} />
                      <div className="metric-grid-mini">
                        <MetricCard label="CAGR" value={bResult.metrics.cagr} isPct />
                        <MetricCard label="MDD" value={bResult.metrics.max_drawdown} isPct />
                        <MetricCard label="Sharpe" value={bResult.metrics.sharpe} />
                        <MetricCard label="Win Rate" value={0.65} isPct /> {/* Mock */}
                      </div>
                    </>
                  ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>Run a backtest to see results.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {page === 'settings' && (
          <div className="card">
            <div className="card__header">
              <span>Backtest Configurations</span>
              <button className="btn btn--primary" onClick={() => { setSettingForm({}); setSettingModal(true); }}>+ New Config</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Name</th><th>Market</th><th>Range</th><th>Capital</th><th>Action</th></tr></thead>
                <tbody>
                  {settings.slice((stPage - 1) * 10, stPage * 10).map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td><span style={{ fontWeight: 600, color: s.market === 'KOSPI' ? '#fbbf24' : '#f87171' }}>{s.market}</span></td>
                      <td>{s.start_date} ~ {s.end_date}</td>
                      <td>{formatNum(s.initial_capital)}</td>
                      <td><button className="btn btn--ghost" onClick={async () => { if (confirm("Delete?")) { await api(`/backtest-settings/${s.id}`, { method: 'DELETE' }); loadData(); } }}>Delete</button></td>
                    </tr>
                  ))}
                  {settings.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>No settings found.</td></tr>}
                </tbody>
              </table>
            </div>
            {settings.length > 10 && (
              <div className="card__body" style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                <button className="btn btn--secondary" disabled={stPage === 1} onClick={() => setStPage(p => p - 1)}>Prev</button>
                <button className="btn btn--secondary" disabled={stPage * 10 >= settings.length} onClick={() => setStPage(p => p + 1)}>Next</button>
              </div>
            )}
          </div>
        )}

        {page === 'strategies' && (
          <div className="page-section">
            <div className="strategy-grid">
              {strategies.map(s => {
                const lastBt = backtests.filter(b => b.strategy_id === s.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                return (
                  <div key={s.id} className="card">
                    <div className="card__header">
                      {s.name}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>{formatDate(s.updated_at)}</span>
                    </div>
                    <div className="card__body">
                      <p style={{ color: 'var(--text-secondary)', height: 40, overflow: 'hidden' }}>{s.description || "No description provided."}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest Return</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: lastBt?.metrics.total_return > 0 ? 'var(--success)' : 'var(--text-main)' }}>
                            {formatPct(lastBt?.metrics.total_return)}
                          </div>
                        </div>
                      </div>
                      <div className="strategy-card-actions">
                        <button className="btn btn--secondary" onClick={() => { setDetailStrat(s); setSelectedDetailBts([]); }}>Details</button>
                        <button className="btn btn--primary" onClick={() => { loadStratToBuilder(s.id); setPage('builder'); }}>Edit</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {page === 'backtests' && (
          <div className="card">
            <div className="card__header">
              <span>Backtest History</span>
              <select className="select" style={{ width: 200, padding: '4px 8px' }} value={btFilter} onChange={e => { setBtFilter(e.target.value); setBtPage(1); }}>
                <option value="ALL">All Strategies</option>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Strategy</th><th>Setting</th><th>Return</th><th>MDD</th><th>Date</th><th>Action</th></tr></thead>
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
                        <td>
                          {/* 5. Details button showing Graph */}
                          <button className="btn btn--secondary" style={{ marginRight: 8 }} onClick={() => setResultModal(b)}>View Graph</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="card__body" style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button className="btn btn--secondary" disabled={btPage === 1} onClick={() => setBtPage(p => p - 1)}>Prev</button>
              <button className="btn btn--secondary" onClick={() => setBtPage(p => p + 1)}>Next</button>
            </div>
          </div>
        )}

        {page === 'community' && (
          <div className="page-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Community Strategies</h2>
              <button className="btn btn--primary" onClick={() => setWriteModal(true)}>+ Share Strategy</button>
            </div>
            <div className="community-feed">
              {posts.map(p => (
                <div key={p.id} className="card">
                  <div className="card__header">{p.title}</div>
                  <div className="card__body">
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>{p.content}</p>

                    {/* 6. Community Latest Metrics */}
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>Performance (Latest)</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div><span style={{ fontSize: '0.75rem', display: 'block' }}>Return</span><span className="text-success" style={{ fontWeight: 700 }}>{formatPct(p.latest_metrics?.return || 0)}</span></div>
                        <div><span style={{ fontSize: '0.75rem', display: 'block' }}>CAGR</span><span style={{ fontWeight: 700 }}>{formatPct(p.latest_metrics?.cagr || 0)}</span></div>
                        <div><span style={{ fontSize: '0.75rem', display: 'block' }}>MDD</span><span className="text-danger" style={{ fontWeight: 700 }}>{formatPct(p.latest_metrics?.mdd || 0)}</span></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>by {p.author_username}</span>
                      <button className="btn btn--primary" style={{ padding: '6px 12px' }} onClick={async () => {
                        await api(`/community/posts/${p.id}/fork`, { method: 'POST' });
                        alert("Strategy forked to your collection!");
                        loadData();
                      }}>Fork Strategy</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* -------------------- MODALS -------------------- */}

      {/* Strategy Detail Modal with Comparison Logic (Request 3) */}
      {detailStrat && (
        <Modal title={detailStrat.name} onClose={() => setDetailStrat(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ color: 'var(--text-secondary)' }}>{detailStrat.description}</div>

            <div className="card">
              <div className="card__header">
                Compare Backtest Results
                <button className="btn btn--primary" disabled={selectedDetailBts.length !== 2} onClick={compareBacktestsInModal}>Compare (2)</button>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th style={{ width: 50 }}>Select</th><th>Setting Name</th><th>Period</th><th>Return</th><th>MDD</th></tr></thead>
                  <tbody>
                    {backtests.filter(b => b.strategy_id === detailStrat.id).map(b => (
                      <tr key={b.id} style={{ background: selectedDetailBts.includes(b.id) ? 'rgba(59, 130, 246, 0.1)' : 'transparent' }}>
                        <td>
                          <input type="checkbox" checked={selectedDetailBts.includes(b.id)} onChange={() => {
                            if (selectedDetailBts.includes(b.id)) setSelectedDetailBts(p => p.filter(x => x !== b.id));
                            else if (selectedDetailBts.length < 2) setSelectedDetailBts(p => [...p, b.id]);
                          }} />
                        </td>
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

      {/* Comparison Chart Modal */}
      {compareModal && (
        <Modal title="Performance Comparison" onClose={() => setCompareModal(null)}>
          <div className="card">
            <div className="card__body">
              {/* 1. Comparison Graph (Green vs Red) */}
              <EquityChart
                data={compareModal.dataA.equity_curve}
                comparison={{ label: compareModal.labelB, data: compareModal.dataB.equity_curve }}
              />
              <div className="metric-grid-mini" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div style={{ borderRight: '1px solid var(--border)', paddingRight: 12 }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#10b981' }}>{compareModal.labelA}</h4>
                  <MetricCard label="Return" value={compareModal.dataA.metrics.total_return} isPct />
                  <MetricCard label="Sharpe" value={compareModal.dataA.metrics.sharpe} />
                </div>
                <div style={{ paddingLeft: 12 }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#ef4444' }}>{compareModal.labelB}</h4>
                  <MetricCard label="Return" value={compareModal.dataB.metrics.total_return} isPct />
                  <MetricCard label="Sharpe" value={compareModal.dataB.metrics.sharpe} />
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Single Result Modal (Request 5) */}
      {resultModal && (
        <Modal title={`${resultModal.setting_name} Report`} onClose={() => setResultModal(null)}>
          <div className="card__body">
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem', color: resultModal.metrics.total_return > 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatPct(resultModal.metrics.total_return)}
              </h3>
              <span style={{ color: 'var(--text-muted)' }}>Total Return</span>
            </div>
            <EquityChart data={resultModal.equity_curve} />
            <div className="metric-grid-mini" style={{ marginTop: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <MetricCard label="CAGR" value={resultModal.metrics.cagr} isPct />
              <MetricCard label="MDD" value={resultModal.metrics.max_drawdown} isPct />
              <MetricCard label="Sharpe Ratio" value={resultModal.metrics.sharpe} />
              <MetricCard label="Win Rate" value={0.65} isPct />
            </div>
          </div>
        </Modal>
      )}

      {/* Settings Modal */}
      {settingModal && (
        <Modal title="New Backtest Configuration" onClose={() => setSettingModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Configuration Name</label>
              <input className="input" value={settingForm.name || ''} onChange={e => setSettingForm({ ...settingForm, name: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Market</label><select className="select" value={settingForm.market || 'ALL'} onChange={e => setSettingForm({ ...settingForm, market: e.target.value })}><option value="ALL">All Markets</option><option value="KOSPI">KOSPI</option><option value="KOSDAQ">KOSDAQ</option></select></div>
              <div><label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Min Market Cap (KRW)</label><input className="input" type="number" value={settingForm.min_market_cap || 0} onChange={e => setSettingForm({ ...settingForm, min_market_cap: Number(e.target.value) })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Start Date</label><input className="input" type="date" value={settingForm.start_date || ''} onChange={e => setSettingForm({ ...settingForm, start_date: e.target.value })} /></div>
              <div><label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>End Date</label><input className="input" type="date" value={settingForm.end_date || ''} onChange={e => setSettingForm({ ...settingForm, end_date: e.target.value })} /></div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Initial Capital</label>
              <input className="input" type="number" value={settingForm.initial_capital || 10000000} onChange={e => setSettingForm({ ...settingForm, initial_capital: Number(e.target.value) })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn--primary" onClick={saveSetting}>Save Configuration</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Write Post Modal */}
      {writeModal && (
        <Modal title="Share Strategy" onClose={() => setWriteModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input className="input" placeholder="Post Title" value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} />
            <select className="select" value={postForm.strategyId} onChange={e => setPostForm({ ...postForm, strategyId: e.target.value })}>
              <option value="">Select a Strategy to Share...</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea className="textarea" placeholder="Describe your strategy logic..." value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--primary" onClick={createPost}>Post to Community</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}