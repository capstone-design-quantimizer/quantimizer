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
  start_date: string;       // 추가됨
  end_date: string;         // 추가됨
  initial_capital: number;  // 추가됨
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
    return <div className="equity-chart" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 12 }}>데이터 없음</div>;
  }

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
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={padding.left} y1={tick.y} x2={svgW - padding.right} y2={tick.y} className="chart-grid" />
              <text x={padding.left - 8} y={tick.y + 4} textAnchor="end" className="chart-axis-text">{formatNum(tick.val)}</text>
            </g>
          ))}
          {xTicks.map((tick, i) => (
            <text key={i} x={tick.x} y={svgH - 5} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="chart-axis-text">{tick.label}</text>
          ))}
          {comparison && (
            <polyline points={getPoints(compData)} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="4,2" vectorEffect="non-scaling-stroke" />
          )}
          <polyline points={getPoints(mainData)} fill="none" stroke="#2563eb" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="chart-legend-html">
        <div className="legend-item"><div className="legend-dot" style={{ background: "#2563eb" }}></div><span>내 전략 (Equity)</span></div>
        {comparison && <div className="legend-item"><div className="legend-dot" style={{ background: "#dc2626" }}></div><span style={{ color: "#dc2626", fontWeight: 600 }}>{comparison.label}</span></div>}
      </div>
    </div>
  );
};

const Modal = ({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) => (
  <div className="modal__backdrop" onClick={onClose}>
    <div className="modal__content" onClick={e => e.stopPropagation()}>
      <div className="modal__header">
        <span>{title}</span>
        <button className="btn--ghost" onClick={onClose} style={{ fontSize: '1.5rem', lineHeight: 1 }}>&times;</button>
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

  // Data
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  // Dashboard Carousel
  const [slideIndex, setSlideIndex] = useState(0);

  // Builder
  const [bStratId, setBStratId] = useState(NEW_STRAT_ID);
  const [bName, setBName] = useState("");
  const [bDesc, setBDesc] = useState("");
  const [bConfig, setBConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [bSettingId, setBSettingId] = useState("");
  const [bResult, setBResult] = useState<Backtest | null>(null);

  // Pagination
  const [stratPage, setStratPage] = useState(1);
  const [btPage, setBtPage] = useState(1);
  const [stPage, setStPage] = useState(1);

  // Filtering
  const [btFilter, setBtFilter] = useState("ALL");

  // Modals
  const [detailStrat, setDetailStrat] = useState<Strategy | null>(null);
  const [selectedDetailBts, setSelectedDetailBts] = useState<string[]>([]);
  const [compareModal, setCompareModal] = useState<any>(null);
  const [resultModal, setResultModal] = useState<Backtest | null>(null);
  const [settingModal, setSettingModal] = useState(false);
  const [writeModal, setWriteModal] = useState(false);

  // Forms
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

  const dashboardCards = useMemo(() => {
    return [...backtests]
      .sort((a, b) => b.metrics.total_return - a.metrics.total_return)
      .slice(0, 3);
  }, [backtests]);

  const handleSlide = (dir: 'next' | 'prev') => {
    if (dashboardCards.length === 0) return;
    setSlideIndex(prev => {
      if (dir === 'next') return (prev + 1) % dashboardCards.length;
      return (prev - 1 + dashboardCards.length) % dashboardCards.length;
    });
  };

  // -------------------- Render --------------------

  if (!token) return (
    <div className="auth-card">
      <h2 style={{ color: 'var(--primary)', marginBottom: 8, fontSize: '2rem' }}>QuantiMizer</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>퀀트 투자의 시작</p>
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {authMode === 'register' && <input className="input" placeholder="사용자명" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} required />}
        <input className="input" placeholder="이메일" type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} required />
        <input className="input" placeholder="비밀번호" type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} required />
        <button className="btn btn--primary" style={{ height: 48 }}>{authMode === 'login' ? '로그인' : '회원가입'}</button>
      </form>
      <button className="btn--ghost" style={{ marginTop: 16 }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
        {authMode === 'login' ? '계정 만들기' : '로그인하기'}
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header__inner">
          <div className="brand" onClick={() => setPage('dashboard')}>
            <span style={{ fontSize: '1.4rem' }}>✦</span> QuantiMizer
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
          <button className="logout-button" onClick={() => { setToken(null); localStorage.removeItem(TOKEN_KEY); }}>로그아웃</button>
        </div>
      </header>

      <main className="main-content">
        {page === 'dashboard' && (
          <>
            <div className="kpi-grid">
              <div className="kpi" onClick={() => setPage('strategies')}>
                <div className="kpi__label">보유 전략</div>
                <div className="kpi__value">{strategies.length}개</div>
                <div className="kpi__sub">현재 운용 가능한 전략</div>
              </div>
              <div className="kpi" onClick={() => setPage('backtests')}>
                <div className="kpi__label">총 백테스트</div>
                <div className="kpi__value">{backtests.length}회</div>
                <div className="kpi__sub">누적 실행 횟수</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">최고 수익률</div>
                <div className="kpi__value text-success">
                  {formatPct(Math.max(...backtests.map(b => b.metrics.total_return), 0))}
                </div>
                <div className="kpi__sub">역대 최고 기록</div>
              </div>
            </div>

            <div className="page-section">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>대표 백테스트 결과</h3>

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
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>총 수익률</div>
                          </div>
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <EquityChart data={bt.equity_curve} height={280} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="carousel-nav next" onClick={() => handleSlide('next')}>›</div>
                  <div className="carousel-dots">
                    {dashboardCards.map((_, i) => (
                      <div key={i} className={`carousel-dot ${i === slideIndex ? 'active' : ''}`} onClick={() => setSlideIndex(i)} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                  아직 실행된 백테스트가 없습니다.
                </div>
              )}
            </div>
          </>
        )}

        {page === 'builder' && (
          <div className="builder-layout">
            <div className="builder-editor-pane">
              <StrategyBlocklyEditor value={bConfig} onChange={setBConfig} />
            </div>

            <div className="builder-sidebar-pane">
              <div className="sidebar-card">
                <label className="sidebar-label">전략 불러오기</label>
                <select className="select" value={bStratId} onChange={e => loadStratToBuilder(e.target.value)}>
                  <option value={NEW_STRAT_ID}>+ 새 전략 작성</option>
                  {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="sidebar-card">
                <label className="sidebar-label">전략 정보</label>
                <input className="input" placeholder="전략 이름" value={bName} onChange={e => setBName(e.target.value)} />
                <textarea className="textarea" placeholder="전략에 대한 간단한 설명..." value={bDesc} onChange={e => setBDesc(e.target.value)} style={{ minHeight: 80 }} />
                <button className="btn btn--secondary" onClick={saveStrategy} style={{ width: '100%' }}>전략 저장</button>
              </div>

              <div className="sidebar-card">
                <label className="sidebar-label">백테스트 시뮬레이션</label>
                <select className="select" value={bSettingId} onChange={e => setBSettingId(e.target.value)}>
                  <option value="">백테스트 조건 선택...</option>
                  {settings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="btn btn--primary" onClick={runBacktest} disabled={loading} style={{ width: '100%' }}>
                  {loading ? '실행 중...' : '백테스트 실행'}
                </button>
              </div>

              {bResult && (
                <div className="sidebar-card" style={{ flex: 1, minHeight: 0 }}>
                  <label className="sidebar-label">실행 결과</label>
                  <div style={{ textAlign: 'center', margin: '12px 0' }}>
                    <span className={bResult.metrics.total_return > 0 ? 'text-success' : 'text-danger'} style={{ fontSize: '2rem' }}>
                      {formatPct(bResult.metrics.total_return)}
                    </span>
                  </div>
                  <EquityChart data={bResult.equity_curve} height={180} />
                  <div className="metric-grid-mini">
                    <div className="metric-box"><label>CAGR</label><span>{formatPct(bResult.metrics.cagr)}</span></div>
                    <div className="metric-box"><label>MDD</label><span>{formatPct(bResult.metrics.max_drawdown)}</span></div>
                    <div className="metric-box"><label>Sharpe</label><span style={{ color: '#dc2626' }}>{bResult.metrics.sharpe.toFixed(2)}</span></div>
                  </div>
                </div>
              )}
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
                      <td><span style={{ padding: '4px 8px', borderRadius: 6, background: '#f1f5f9', fontWeight: 600 }}>{s.market}</span></td>
                      <td>{s.start_date} ~ {s.end_date}</td>
                      <td>{formatNum(s.initial_capital)}</td>
                      <td>
                        <button className="btn btn--danger" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => deleteSetting(s.id)}>삭제</button>
                      </td>
                    </tr>
                  ))}
                  {settings.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>등록된 설정이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button className="btn btn--secondary" disabled={stPage === 1} onClick={() => setStPage(p => p - 1)}>이전</button>
              <span>{stPage}</span>
              <button className="btn btn--secondary" disabled={stPage * 10 >= settings.length} onClick={() => setStPage(p => p + 1)}>다음</button>
            </div>
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
                      <p style={{ color: 'var(--text-secondary)', height: 40, overflow: 'hidden', margin: '0 0 16px 0' }}>{s.description || "설명 없음"}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>최근 수익률</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 700 }} className={lastBt?.metrics.total_return > 0 ? 'text-success' : ''}>
                            {lastBt ? formatPct(lastBt.metrics.total_return) : '-'}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{lastBt ? formatDate(lastBt.created_at) : '기록 없음'}</div>
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
            <div className="pagination">
              <button className="btn btn--secondary" disabled={stratPage === 1} onClick={() => setStratPage(p => p - 1)}>이전</button>
              <span>{stratPage}</span>
              <button className="btn btn--secondary" disabled={stratPage * 6 >= strategies.length} onClick={() => setStratPage(p => p + 1)}>다음</button>
            </div>
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
                        <td><button className="btn btn--secondary" onClick={() => setResultModal(b)}>그래프 보기</button></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button className="btn btn--secondary" disabled={btPage === 1} onClick={() => setBtPage(p => p - 1)}>이전</button>
              <span>{btPage}</span>
              <button className="btn btn--secondary" onClick={() => setBtPage(p => p + 1)}>다음</button>
            </div>
          </div>
        )}

        {page === 'community' && (
          <div className="page-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>커뮤니티</h2>
              <button className="btn btn--primary" onClick={() => setWriteModal(true)}>+ 글쓰기</button>
            </div>
            <div className="strategy-grid">
              {posts.map(p => (
                <div key={p.id} className="card">
                  <div className="card__header">{p.title}</div>
                  <div className="card__body">
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{p.content}</p>
                    <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>최근 성과</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div><span style={{ fontSize: '0.8rem', display: 'block' }}>수익률</span><span className="text-success">{formatPct(p.latest_metrics?.return || 0)}</span></div>
                        <div><span style={{ fontSize: '0.8rem', display: 'block' }}>MDD</span><span className="text-danger">{formatPct(p.latest_metrics?.mdd || 0)}</span></div>
                        <div><span style={{ fontSize: '0.8rem', display: 'block' }}>CAGR</span><span>{formatPct(p.latest_metrics?.cagr || 0)}</span></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>작성자: <strong>{p.author_username}</strong></span>
                      <button className="btn btn--secondary" onClick={async () => { await api(`/community/posts/${p.id}/fork`, { method: 'POST' }); Swal.fire("완료", "전략을 가져왔습니다!", "success"); loadData(); }}>전략 가져오기</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {detailStrat && (
        <Modal title={detailStrat.name} onClose={() => setDetailStrat(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p style={{ color: 'var(--text-secondary)' }}>{detailStrat.description}</p>
            <div className="card">
              <div className="card__header">
                백테스트 결과 비교 (2개 선택)
                <button className="btn btn--primary" disabled={selectedDetailBts.length !== 2} onClick={() => {
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
                      <tr key={b.id} style={{ background: selectedDetailBts.includes(b.id) ? '#eff6ff' : 'transparent' }}>
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
          <div className="card__body">
            <EquityChart data={compareModal.dataA.equity_curve} comparison={{ label: compareModal.labelB, data: compareModal.dataB.equity_curve }} height={300} />
            <div className="metric-grid-mini" style={{ marginTop: 30 }}>
              <div style={{ borderRight: '1px solid var(--border)', paddingRight: 16 }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#2563eb' }}>{compareModal.labelA}</h4>
                <div className="metric-box" style={{ marginBottom: 8 }}><label>수익률</label><span>{formatPct(compareModal.dataA.metrics.total_return)}</span></div>
                <div className="metric-box"><label>Sharpe</label><span style={{ color: '#dc2626' }}>{compareModal.dataA.metrics.sharpe.toFixed(2)}</span></div>
              </div>
              <div style={{ paddingLeft: 16 }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#dc2626' }}>{compareModal.labelB}</h4>
                <div className="metric-box" style={{ marginBottom: 8 }}><label>수익률</label><span>{formatPct(compareModal.dataB.metrics.total_return)}</span></div>
                <div className="metric-box"><label>Sharpe</label><span style={{ color: '#dc2626' }}>{compareModal.dataB.metrics.sharpe.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {resultModal && (
        <Modal title={`${resultModal.setting_name} 상세 리포트`} onClose={() => setResultModal(null)}>
          <div className="card__body">
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800 }} className={resultModal.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>
                {formatPct(resultModal.metrics.total_return)}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>누적 수익률</div>
            </div>
            <EquityChart data={resultModal.equity_curve} height={320} />
            <div className="metric-grid-mini" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 32 }}>
              <div className="metric-box"><label>CAGR</label><span>{formatPct(resultModal.metrics.cagr)}</span></div>
              <div className="metric-box"><label>MDD</label><span>{formatPct(resultModal.metrics.max_drawdown)}</span></div>
              <div className="metric-box"><label>Sharpe</label><span style={{ color: '#dc2626' }}>{resultModal.metrics.sharpe.toFixed(2)}</span></div>
              <div className="metric-box"><label>Win Rate</label><span>65.00%</span></div>
            </div>
          </div>
        </Modal>
      )}

      {settingModal && (
        <Modal title="새 백테스트 조건" onClose={() => setSettingModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div><label style={{ display: 'block', marginBottom: 6 }}>설정 이름</label><input className="input" value={settingForm.name || ''} onChange={e => setSettingForm({ ...settingForm, name: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div><label style={{ display: 'block', marginBottom: 6 }}>대상 시장</label><select className="select" value={settingForm.market || 'ALL'} onChange={e => setSettingForm({ ...settingForm, market: e.target.value })}><option value="ALL">전체</option><option value="KOSPI">코스피</option><option value="KOSDAQ">코스닥</option></select></div>
              <div><label style={{ display: 'block', marginBottom: 6 }}>최소 시가총액</label><input className="input" type="number" value={settingForm.min_market_cap || 0} onChange={e => setSettingForm({ ...settingForm, min_market_cap: Number(e.target.value) })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div><label style={{ display: 'block', marginBottom: 6 }}>시작일</label><input className="input" type="date" value={settingForm.start_date || ''} onChange={e => setSettingForm({ ...settingForm, start_date: e.target.value })} /></div>
              <div><label style={{ display: 'block', marginBottom: 6 }}>종료일</label><input className="input" type="date" value={settingForm.end_date || ''} onChange={e => setSettingForm({ ...settingForm, end_date: e.target.value })} /></div>
            </div>
            <div><label style={{ display: 'block', marginBottom: 6 }}>초기 자본금</label><input className="input" type="number" value={settingForm.initial_capital || 10000000} onChange={e => setSettingForm({ ...settingForm, initial_capital: Number(e.target.value) })} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn--primary" onClick={saveSetting}>저장하기</button></div>
          </div>
        </Modal>
      )}

      {writeModal && (
        <Modal title="전략 공유하기" onClose={() => setWriteModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <input className="input" placeholder="제목" value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} />
            <select className="select" value={postForm.strategyId} onChange={e => setPostForm({ ...postForm, strategyId: e.target.value })}>
              <option value="">공유할 전략 선택...</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea className="textarea" placeholder="전략에 대한 설명과 논리를 공유해주세요..." value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn--primary" onClick={createPost}>등록하기</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}