import { useCallback, useEffect, useState, useMemo, type FormEvent } from "react";
import "./App.css";
import StrategyBlocklyEditor, {
  DEFAULT_STRATEGY_CONFIG,
  type StrategyConfig,
  normalizeStrategyConfig
} from "./StrategyBlocklyEditor";

// -------------------- Types --------------------

interface BacktestSetting {
  id: string;
  owner_id: string;
  name: string;
  market: string;
  min_market_cap: number;
  exclude_list: string[];
  start_date: string;
  end_date: string;
  initial_capital: number;
  created_at: string;
}

interface Strategy {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  strategy_json: any;
  created_at: string;
  updated_at: string;
}

interface EquityPoint {
  date: string;
  equity: number;
  drawdown?: number;
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
  metrics: any;
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
  latest_metrics?: {
    return: number;
    mdd: number;
    cagr: number;
  };
}

// -------------------- Constants --------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "quant.token";
const NEW_STRAT_ID = "__new__";

const formatDate = (s: string) =>
  new Date(s).toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric'
  });

const formatPct = (n: number) =>
  n ? `${(n * 100).toFixed(2)}%` : "0.00%";

const formatNum = (n: number) =>
  new Intl.NumberFormat('en-US', {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(n);

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
    return <div className="equity-chart empty">No Data Available</div>;
  }

  // Data Processing
  const mainData = data.map(d => d.equity);
  const compData = comparison ? comparison.data.map(d => d.equity) : [];
  const allValues = [...mainData, ...compData];

  const minVal = Math.min(...allValues) * 0.98;
  const maxVal = Math.max(...allValues) * 1.02;
  const range = maxVal - minVal || 1;

  const padding = { top: 10, bottom: 25, left: 45, right: 10 };
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

  // Y-Axis Ticks
  const yTicks = [0, 1, 2, 3].map(i => {
    const val = minVal + (range * (i / 3));
    const y = padding.top + graphH - ((val - minVal) / range) * graphH;
    return { y, val };
  });

  // X-Axis Ticks
  const xTicks = [
    { x: padding.left, label: formatDate(data[0].date) },
    { x: padding.left + graphW / 2, label: formatDate(data[Math.floor(data.length / 2)].date) },
    { x: padding.left + graphW, label: formatDate(data[data.length - 1].date) }
  ];

  // Visuals - White Mode Colors
  const mainColor = "#2563eb"; // Blue 600
  const compColor = "#dc2626"; // Red 600

  return (
    <div className="equity-chart-container">
      <div className="equity-chart" style={{ height }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" className="chart-svg">
          {/* Grid Lines */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={padding.left} y1={tick.y} x2={svgW - padding.right} y2={tick.y} className="chart-grid" />
              <text x={padding.left - 8} y={tick.y + 4} textAnchor="end" className="chart-axis-text">
                {formatNum(tick.val)}
              </text>
            </g>
          ))}

          {/* X Axis */}
          {xTicks.map((tick, i) => (
            <text key={i} x={tick.x} y={svgH - 5} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="chart-axis-text">
              {tick.label}
            </text>
          ))}

          {/* Comparison Line (Red) */}
          {comparison && (
            <polyline
              points={getPoints(compData)}
              fill="none"
              stroke={compColor}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4,2"
            />
          )}

          {/* Main Strategy Line (Blue) */}
          <polyline
            points={getPoints(mainData)}
            fill="none"
            stroke={mainColor}
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* External Legend */}
      <div className="chart-legend-html">
        <div className="legend-item">
          <div className="legend-dot" style={{ background: mainColor }}></div>
          <span>Strategy (Eq)</span>
        </div>
        {comparison && (
          <div className="legend-item">
            <div className="legend-dot" style={{ background: compColor }}></div>
            <span style={{ color: compColor, fontWeight: 600 }}>{comparison.label}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  isPct = false,
  color
}: {
  label: string;
  value: number;
  isPct?: boolean;
  color?: string;
}) => {
  const formatted = isPct ? formatPct(value) : value.toFixed(2);
  const colorStyle = color
    ? { color }
    : isPct
      ? value > 0 ? '#059669' : value < 0 ? '#dc2626' : 'inherit'
      : 'inherit';

  return (
    <div className="metric-box">
      <label>{label}</label>
      <span style={{ color: typeof colorStyle === 'string' ? colorStyle : colorStyle.color }}>
        {formatted}
      </span>
    </div>
  );
};

const Modal = ({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <div className="modal__backdrop" onClick={onClose}>
    <div className="modal__content" onClick={e => e.stopPropagation()}>
      <div className="modal__header">
        <span>{title}</span>
        <button className="btn--ghost" onClick={onClose} style={{ fontSize: '1.5rem', lineHeight: 1 }}>
          &times;
        </button>
      </div>
      <div className="modal__body">{children}</div>
    </div>
  </div>
);

// -------------------- Main App --------------------

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(false);

  // Data State
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  // Dashboard Sort State
  const [dashSort, setDashSort] = useState<'latest' | 'return'>('latest');

  // Builder State
  const [bStratId, setBStratId] = useState(NEW_STRAT_ID);
  const [bName, setBName] = useState("");
  const [bDesc, setBDesc] = useState("");
  const [bConfig, setBConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [bSettingId, setBSettingId] = useState("");
  const [bResult, setBResult] = useState<Backtest | null>(null);

  // Detail & Modals State
  const [detailStrat, setDetailStrat] = useState<Strategy | null>(null);
  const [selectedDetailBts, setSelectedDetailBts] = useState<string[]>([]);
  const [compareModal, setCompareModal] = useState<{ labelA: string; dataA: any; labelB: string; dataB: any } | null>(null);
  const [resultModal, setResultModal] = useState<Backtest | null>(null);

  const [settingModal, setSettingModal] = useState(false);
  const [settingForm, setSettingForm] = useState<Partial<BacktestSetting>>({});

  const [writeModal, setWriteModal] = useState(false);
  const [postForm, setPostForm] = useState({ title: '', content: '', strategyId: '' });

  // Pagination & Filtering
  const [stPage, setStPage] = useState(1);
  const [btPage, setBtPage] = useState(1);
  const [btFilter, setBtFilter] = useState("ALL");

  // Auth State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' });

  // -------------------- API --------------------

  const api = useCallback(async (url: string, opts: any = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}` };
    const res = await fetch(API_BASE + url, { ...opts, headers });
    if (res.status === 401) {
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
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

      // Mocking latest metrics for posts if not available
      const augmentedPosts = (p.items || []).map((post: any) => ({
        ...post,
        latest_metrics: b.items
          .filter((bt: Backtest) => bt.strategy_id === post.strategy_id)
          .sort((x: Backtest, y: Backtest) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())[0]?.metrics
          || { return: 0.12, mdd: -0.05, cagr: 0.15 }
      }));
      setPosts(augmentedPosts);

      if (st.items && st.items.length > 0 && !bSettingId) {
        setBSettingId(st.items[0].id);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token, api, bSettingId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -------------------- Handlers --------------------

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    const endpoint = authMode === 'login' ? "/auth/login" : "/auth/register";
    const body = authMode === 'login'
      ? new URLSearchParams({ username: authForm.email, password: authForm.password })
      : JSON.stringify(authForm);
    const headers = authMode === 'register'
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/x-www-form-urlencoded" };

    try {
      const res = await fetch(API_BASE + endpoint, { method: "POST", headers, body });
      if (res.ok) {
        if (authMode === 'register') {
          alert("가입 완료");
          setAuthMode('login');
        } else {
          const d = await res.json();
          setToken(d.access_token);
          localStorage.setItem(TOKEN_KEY, d.access_token);
        }
      } else {
        alert("로그인/가입 실패");
      }
    } catch {
      alert("네트워크 오류");
    }
  };

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

  const saveStrategy = async () => {
    if (!bName) return alert("전략 이름을 입력하세요");
    const method = bStratId === NEW_STRAT_ID ? "POST" : "PUT";
    const url = bStratId === NEW_STRAT_ID ? "/strategies" : `/strategies/${bStratId}`;

    const res = await api(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bName, description: bDesc, strategy_json: bConfig })
    });

    if (res.ok) {
      const d = await res.json();
      setBStratId(d.id);
      loadData();
      alert("저장 완료");
    }
  };

  const runBacktest = async () => {
    if (bStratId === NEW_STRAT_ID) return alert("전략 저장 후 실행하세요.");
    if (!bSettingId) return alert("설정을 선택하세요.");

    setLoading(true);
    try {
      const res = await api("/backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: bStratId, setting_id: bSettingId })
      });
      if (res.ok) {
        setBResult(await res.json());
        loadData();
      } else {
        const err = await res.json();
        alert(err.detail || "실행 실패");
      }
    } catch {
      alert("실행 실패");
    }
    setLoading(false);
  };

  const saveSetting = async () => {
    try {
      await api("/backtest-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setSettingModal(false);
      loadData();
    } catch {
      alert("저장 실패");
    }
  };

  const createPost = async () => {
    if (!postForm.title || !postForm.content || !postForm.strategyId) {
      alert("모든 필드를 입력하세요.");
      return;
    }
    try {
      const res = await api("/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: postForm.title,
          content: postForm.content,
          strategy_id: postForm.strategyId
        })
      });
      if (res.ok) {
        setWriteModal(false);
        setPostForm({ title: '', content: '', strategyId: '' });
        loadData();
        alert("게시글이 등록되었습니다.");
      }
    } catch {
      alert("게시글 등록 실패");
    }
  };

  const compareBacktestsInModal = () => {
    const b1 = backtests.find(b => b.id === selectedDetailBts[0]);
    const b2 = backtests.find(b => b.id === selectedDetailBts[1]);
    if (b1 && b2) {
      setCompareModal({
        labelA: b1.setting_name,
        dataA: b1,
        labelB: b2.setting_name,
        dataB: b2
      });
    }
  };

  const dashboardBacktests = useMemo(() => {
    const sorted = [...backtests].sort((a, b) => {
      if (dashSort === 'latest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return b.metrics.total_return - a.metrics.total_return;
    });
    return sorted.slice(0, 3);
  }, [backtests, dashSort]);

  // -------------------- Render --------------------

  if (!token) {
    return (
      <div className="auth-card">
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', marginBottom: 8 }}>
          QuantiMizer
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
          Login to your dashboard
        </p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {authMode === 'register' && (
            <input
              className="input"
              placeholder="Username"
              value={authForm.username}
              onChange={e => setAuthForm({ ...authForm, username: e.target.value })}
              required
            />
          )}
          <input
            className="input"
            placeholder="Email"
            type="email"
            value={authForm.email}
            onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Password"
            type="password"
            value={authForm.password}
            onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
            required
          />
          <button className="btn btn--primary" style={{ height: 44 }}>
            {authMode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>
        <button
          className="btn--ghost"
          style={{ marginTop: 16 }}
          onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
        >
          {authMode === 'login' ? '계정 만들기' : '로그인으로 돌아가기'}
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header__inner">
          <div className="brand" onClick={() => setPage('dashboard')}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>✦</span> QuantiMizer
          </div>
          <nav className="nav-tabs">
            {['dashboard', 'builder', 'settings', 'strategies', 'backtests', 'community'].map(p => (
              <button
                key={p}
                className={`nav-tab ${page === p ? 'nav-tab--active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </nav>
          <button
            className="logout-button"
            onClick={() => { setToken(null); localStorage.removeItem(TOKEN_KEY); }}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="main-content">
        {page === 'dashboard' && (
          <>
            <div className="kpi-grid">
              <div className="kpi" onClick={() => setPage('strategies')}>
                <div className="kpi__label">Total Strategies</div>
                <div className="kpi__value">{strategies.length}</div>
                <div className="kpi__sub">Active Strategies</div>
              </div>
              <div className="kpi" onClick={() => setPage('backtests')}>
                <div className="kpi__label">Total Backtests</div>
                <div className="kpi__value">{backtests.length}</div>
                <div className="kpi__sub">Since Account Creation</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">Best Performance</div>
                <div className="kpi__value text-success">
                  {formatPct(Math.max(...backtests.map(b => b.metrics.total_return), 0))}
                </div>
                <div className="kpi__sub">All time high return</div>
              </div>
            </div>

            <div className="page-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Recent Backtest Performance</h3>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${dashSort === 'latest' ? 'active' : ''}`}
                    onClick={() => setDashSort('latest')}
                  >
                    Latest
                  </button>
                  <button
                    className={`toggle-btn ${dashSort === 'return' ? 'active' : ''}`}
                    onClick={() => setDashSort('return')}
                  >
                    High Return
                  </button>
                </div>
              </div>

              <div className="dashboard-top-grid">
                {dashboardBacktests.map(bt => (
                  <div key={bt.id} className="card">
                    <div className="card__header" style={{ fontSize: '0.95rem' }}>
                      {strategies.find(s => s.id === bt.strategy_id)?.name}
                    </div>
                    <div className="card__body" style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <span className="text-secondary" style={{ fontSize: '0.8rem' }}>{bt.setting_name}</span>
                        <span className="text-success" style={{ fontWeight: 700 }}>
                          {formatPct(bt.metrics.total_return)}
                        </span>
                      </div>
                      <EquityChart data={bt.equity_curve} height={180} />
                    </div>
                  </div>
                ))}
                {dashboardBacktests.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                    No backtests yet.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {page === 'builder' && (
          <div className="builder-layout">
            <div className="builder-control-bar">
              <div className="builder-info-group">
                <select
                  className="select"
                  style={{ width: 220 }}
                  value={bStratId}
                  onChange={e => loadStratToBuilder(e.target.value)}
                >
                  <option value={NEW_STRAT_ID}>+ Create New Strategy</option>
                  {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Strategy Name"
                  value={bName}
                  onChange={e => setBName(e.target.value)}
                />
                <input
                  className="input"
                  style={{ flex: 1.5 }}
                  placeholder="Description"
                  value={bDesc}
                  onChange={e => setBDesc(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <select
                  className="select"
                  style={{ width: 180 }}
                  value={bSettingId}
                  onChange={e => setBSettingId(e.target.value)}
                >
                  <option value="">Select Setting...</option>
                  {settings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="btn btn--secondary" onClick={saveStrategy}>Save</button>
                <button className="btn btn--primary" onClick={runBacktest} disabled={loading}>
                  {loading ? 'Running...' : 'Run Backtest'}
                </button>
              </div>
            </div>

            <div className="builder-body">
              <div className="builder-canvas">
                <StrategyBlocklyEditor value={bConfig} onChange={setBConfig} />
              </div>
              <div className="builder-results">
                <div className="card__header">Result Preview</div>
                <div className="card__body">
                  {bResult ? (
                    <>
                      <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Return</div>
                        <div
                          style={{
                            fontSize: '2.5rem',
                            fontWeight: 800,
                            color: bResult.metrics.total_return > 0 ? 'var(--success)' : 'var(--danger)'
                          }}
                        >
                          {formatPct(bResult.metrics.total_return)}
                        </div>
                      </div>
                      <EquityChart data={bResult.equity_curve} height={200} />
                      <div className="metric-grid-mini">
                        <MetricCard label="CAGR" value={bResult.metrics.cagr} isPct />
                        <MetricCard label="MDD" value={bResult.metrics.max_drawdown} isPct />
                        <MetricCard label="Sharpe" value={bResult.metrics.sharpe} color="#dc2626" />
                        <MetricCard label="Win Rate" value={0.65} isPct />
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                      Ready to Run
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {page === 'settings' && (
          <div className="card">
            <div className="card__header">
              <span>Backtest Settings</span>
              <button
                className="btn btn--primary"
                onClick={() => { setSettingForm({}); setSettingModal(true); }}
              >
                + Create New
              </button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Market</th><th>Start Date</th><th>End Date</th><th>Capital</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {settings.slice((stPage - 1) * 10, stPage * 10).map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>
                        <span style={{ padding: '4px 8px', borderRadius: 6, background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 600 }}>
                          {s.market}
                        </span>
                      </td>
                      <td>{s.start_date}</td>
                      <td>{s.end_date}</td>
                      <td>{formatNum(s.initial_capital)}</td>
                      <td>
                        <button
                          className="btn btn--ghost"
                          onClick={async () => {
                            if (confirm("Delete?")) {
                              await api(`/backtest-settings/${s.id}`, { method: 'DELETE' });
                              loadData();
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {settings.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No settings found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
              <button className="btn btn--secondary" disabled={stPage === 1} onClick={() => setStPage(p => p - 1)}>Prev</button>
              <button className="btn btn--secondary" onClick={() => setStPage(p => p + 1)}>Next</button>
            </div>
          </div>
        )}

        {page === 'strategies' && (
          <div className="page-section">
            <div className="strategy-grid">
              {strategies.map(s => {
                const lastBt = backtests
                  .filter(b => b.strategy_id === s.id)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

                return (
                  <div key={s.id} className="card">
                    <div className="card__header">{s.name}</div>
                    <div className="card__body">
                      <p style={{ color: 'var(--text-secondary)', height: 40, overflow: 'hidden', margin: '0 0 16px 0' }}>
                        {s.description || "No description."}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest Return</div>
                          <div
                            style={{
                              fontSize: '1.2rem',
                              fontWeight: 700,
                              color: lastBt?.metrics.total_return > 0 ? 'var(--success)' : 'var(--text-main)'
                            }}
                          >
                            {formatPct(lastBt?.metrics.total_return)}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {lastBt ? formatDate(lastBt.created_at) : '-'}
                        </div>
                      </div>
                      <div className="strategy-card-actions">
                        <button
                          className="btn btn--secondary"
                          onClick={() => { setDetailStrat(s); setSelectedDetailBts([]); }}
                        >
                          Details
                        </button>
                        <button
                          className="btn btn--primary"
                          onClick={() => { loadStratToBuilder(s.id); setPage('builder'); }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {page === 'backtests' && (
          <div className="card">
            <div className="card__header">
              <span>Backtest History</span>
              <select
                className="select"
                style={{ width: 200 }}
                value={btFilter}
                onChange={e => { setBtFilter(e.target.value); setBtPage(1); }}
              >
                <option value="ALL">All Strategies</option>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Strategy</th><th>Setting</th><th>Return</th><th>MDD</th><th>Date</th><th>Report</th></tr>
                </thead>
                <tbody>
                  {backtests
                    .filter(b => btFilter === 'ALL' || b.strategy_id === btFilter)
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice((btPage - 1) * 10, btPage * 10)
                    .map(b => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600 }}>{strategies.find(s => s.id === b.strategy_id)?.name}</td>
                        <td>{b.setting_name}</td>
                        <td className={b.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>
                          {formatPct(b.metrics.total_return)}
                        </td>
                        <td>{formatPct(b.metrics.max_drawdown)}</td>
                        <td>{formatDate(b.created_at)}</td>
                        <td>
                          <button className="btn btn--secondary" onClick={() => setResultModal(b)}>
                            View Graph
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
              <button className="btn btn--secondary" disabled={btPage === 1} onClick={() => setBtPage(p => p - 1)}>Prev</button>
              <button className="btn btn--secondary" onClick={() => setBtPage(p => p + 1)}>Next</button>
            </div>
          </div>
        )}

        {page === 'community' && (
          <div className="page-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Community Feed</h2>
              <button className="btn btn--primary" onClick={() => setWriteModal(true)}>+ Write Post</button>
            </div>
            <div className="strategy-grid">
              {posts.map(p => (
                <div key={p.id} className="card">
                  <div className="card__header">{p.title}</div>
                  <div className="card__body">
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{p.content}</p>

                    <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                        Latest Performance
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', display: 'block' }}>Return</span>
                          <span className="text-success" style={{ fontWeight: 700 }}>
                            {formatPct(p.latest_metrics?.return || 0)}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', display: 'block' }}>MDD</span>
                          <span className="text-danger" style={{ fontWeight: 700 }}>
                            {formatPct(p.latest_metrics?.mdd || 0)}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', display: 'block' }}>CAGR</span>
                          <span style={{ fontWeight: 700 }}>
                            {formatPct(p.latest_metrics?.cagr || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        by <strong>{p.author_username}</strong>
                      </span>
                      <button
                        className="btn btn--secondary"
                        onClick={async () => {
                          await api(`/community/posts/${p.id}/fork`, { method: 'POST' });
                          alert("Forked!");
                          loadData();
                        }}
                      >
                        Fork Strategy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* -------------------- Modals -------------------- */}

      {/* Detail & Compare Modal */}
      {detailStrat && (
        <Modal title={detailStrat.name} onClose={() => setDetailStrat(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p style={{ color: 'var(--text-secondary)' }}>{detailStrat.description}</p>
            <div className="card">
              <div className="card__header">
                Compare Backtest Results (Select 2)
                <button
                  className="btn btn--primary"
                  disabled={selectedDetailBts.length !== 2}
                  onClick={compareBacktestsInModal}
                >
                  Compare
                </button>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr><th style={{ width: 40 }}></th><th>Setting</th><th>Date Range</th><th>Return</th><th>MDD</th></tr>
                  </thead>
                  <tbody>
                    {backtests.filter(b => b.strategy_id === detailStrat.id).map(b => (
                      <tr
                        key={b.id}
                        style={{ background: selectedDetailBts.includes(b.id) ? '#eff6ff' : 'transparent' }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedDetailBts.includes(b.id)}
                            onChange={() => {
                              if (selectedDetailBts.includes(b.id)) setSelectedDetailBts(p => p.filter(x => x !== b.id));
                              else if (selectedDetailBts.length < 2) setSelectedDetailBts(p => [...p, b.id]);
                            }}
                          />
                        </td>
                        <td>{b.setting_name}</td>
                        <td>{b.start_date} ~ {b.end_date}</td>
                        <td className={b.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>
                          {formatPct(b.metrics.total_return)}
                        </td>
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
              <EquityChart
                data={compareModal.dataA.equity_curve}
                comparison={{ label: compareModal.labelB, data: compareModal.dataB.equity_curve }}
                height={300}
              />
              <div className="metric-grid-mini" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 32 }}>
                <div style={{ borderRight: '1px solid var(--border)', paddingRight: 16 }}>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary)' }}>{compareModal.labelA}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <MetricCard label="Return" value={compareModal.dataA.metrics.total_return} isPct />
                    <MetricCard label="Sharpe" value={compareModal.dataA.metrics.sharpe} color="#dc2626" />
                  </div>
                </div>
                <div style={{ paddingLeft: 16 }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#dc2626' }}>{compareModal.labelB}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <MetricCard label="Return" value={compareModal.dataB.metrics.total_return} isPct />
                    <MetricCard label="Sharpe" value={compareModal.dataB.metrics.sharpe} color="#dc2626" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Single Result Modal */}
      {resultModal && (
        <Modal title={`${resultModal.setting_name} Report`} onClose={() => setResultModal(null)}>
          <div className="card__body">
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '2rem',
                  color: resultModal.metrics.total_return > 0 ? 'var(--success)' : 'var(--danger)'
                }}
              >
                {formatPct(resultModal.metrics.total_return)}
              </h3>
              <span style={{ color: 'var(--text-muted)' }}>Cumulative Return</span>
            </div>
            <EquityChart data={resultModal.equity_curve} height={300} />
            <div className="metric-grid-mini" style={{ marginTop: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <MetricCard label="CAGR" value={resultModal.metrics.cagr} isPct />
              <MetricCard label="MDD" value={resultModal.metrics.max_drawdown} isPct />
              <MetricCard label="Sharpe Ratio" value={resultModal.metrics.sharpe} color="#dc2626" />
              <MetricCard label="Win Rate" value={0.65} isPct />
            </div>
          </div>
        </Modal>
      )}

      {/* Settings Modal */}
      {settingModal && (
        <Modal title="New Configuration" onClose={() => setSettingModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Config Name</label>
              <input
                className="input"
                value={settingForm.name || ''}
                onChange={e => setSettingForm({ ...settingForm, name: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Market</label>
                <select
                  className="select"
                  value={settingForm.market || 'ALL'}
                  onChange={e => setSettingForm({ ...settingForm, market: e.target.value })}
                >
                  <option value="ALL">All Markets</option>
                  <option value="KOSPI">KOSPI</option>
                  <option value="KOSDAQ">KOSDAQ</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Min Market Cap</label>
                <input
                  className="input"
                  type="number"
                  value={settingForm.min_market_cap || 0}
                  onChange={e => setSettingForm({ ...settingForm, min_market_cap: Number(e.target.value) })}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Start Date</label>
                <input
                  className="input"
                  type="date"
                  value={settingForm.start_date || ''}
                  onChange={e => setSettingForm({ ...settingForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>End Date</label>
                <input
                  className="input"
                  type="date"
                  value={settingForm.end_date || ''}
                  onChange={e => setSettingForm({ ...settingForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>Initial Capital</label>
              <input
                className="input"
                type="number"
                value={settingForm.initial_capital || 10000000}
                onChange={e => setSettingForm({ ...settingForm, initial_capital: Number(e.target.value) })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--primary" onClick={saveSetting}>Save Configuration</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Write Post Modal */}
      {writeModal && (
        <Modal title="Share Strategy" onClose={() => setWriteModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <input
              className="input"
              placeholder="Title"
              value={postForm.title}
              onChange={e => setPostForm({ ...postForm, title: e.target.value })}
            />
            <select
              className="select"
              value={postForm.strategyId}
              onChange={e => setPostForm({ ...postForm, strategyId: e.target.value })}
            >
              <option value="">Select Strategy...</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea
              className="textarea"
              placeholder="Describe your logic..."
              value={postForm.content}
              onChange={e => setPostForm({ ...postForm, content: e.target.value })}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--primary" onClick={createPost}>Post</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}