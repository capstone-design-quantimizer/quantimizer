import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  id: string; title: string; content: string; author_username: string; created_at: string; strategy_name: string;
}

// -------------------- Constants --------------------
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "quant.token";
const NEW_STRAT_ID = "__new__";

const formatDate = (s: string) => new Date(s).toLocaleDateString();
const formatPct = (n: number) => n ? `${(n * 100).toFixed(2)}%` : "0.00%";

// -------------------- Components --------------------
const EquityChart = ({ data, comparison }: { data: EquityPoint[], comparison?: { label: string, data: EquityPoint[] }[] }) => {
  if (!data || data.length === 0) return <div className="equity-chart empty">데이터 없음</div>;

  const allSeries = [{ label: 'Current', data }, ...(comparison || [])];
  const allValues = allSeries.flatMap(s => s.data.map(d => d.equity));
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const colors = ['#2563eb', '#ea580c', '#16a34a'];

  return (
    <div className="equity-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
        {[0, 25, 50, 75, 100].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} className="chart-grid-line" />)}
        {allSeries.map((s, idx) => {
          const pts = s.data.map((d, i) => {
            const x = (i / (s.data.length - 1)) * 100;
            const y = 100 - ((d.equity - minVal) / range) * 100;
            return `${x},${y}`;
          }).join(" ");
          return <polyline key={idx} points={pts} fill="none" stroke={colors[idx % colors.length]} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div className="chart-legend">
        <span>{formatDate(data[0].date)}</span>
        <div style={{ display: 'flex', gap: 12 }}>
          {allSeries.map((s, i) => <span key={i} style={{ color: colors[i % colors.length] }}>● {s.label}</span>)}
        </div>
        <span>{formatDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value }: { label: string, value: string }) => (
  <div className="metric-box"><label>{label}</label><span>{value}</span></div>
);

const Modal = ({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) => (
  <div className="modal__backdrop" onClick={onClose}>
    <div className="modal__content" onClick={e => e.stopPropagation()}>
      <div className="modal__header"><span>{title}</span><button className="btn--ghost" onClick={onClose}>✕</button></div>
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

  // Features
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [sortMethod, setSortMethod] = useState<'latest' | 'return'>('latest');

  // Builder
  const [bStratId, setBStratId] = useState(NEW_STRAT_ID);
  const [bName, setBName] = useState("");
  const [bDesc, setBDesc] = useState("");
  const [bConfig, setBConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [bSettingId, setBSettingId] = useState("");
  const [bResult, setBResult] = useState<Backtest | null>(null);

  // Comparison
  const [selectedStrats, setSelectedStrats] = useState<string[]>([]);
  const [compareModal, setCompareModal] = useState<{ type: 'strat' | 'bt', data: any } | null>(null);

  // Detail Modal
  const [detailStrat, setDetailStrat] = useState<Strategy | null>(null);
  const [selectedDetailBts, setSelectedDetailBts] = useState<string[]>([]);

  // Backtest Settings Tab
  const [stPage, setStPage] = useState(1);
  const [settingForm, setSettingForm] = useState<Partial<BacktestSetting>>({});
  const [settingModal, setSettingModal] = useState(false);

  // Filter & Pagination
  const [btFilter, setBtFilter] = useState("ALL");
  const [btPage, setBtPage] = useState(1);

  // Auth
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' });

  // Community
  const [writeModal, setWriteModal] = useState(false);
  const [postForm, setPostForm] = useState({ title: '', content: '', strategyId: '' });

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
      setPosts(p.items || []);
      if (st.items && st.items.length > 0 && !bSettingId) setBSettingId(st.items[0].id);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, api, bSettingId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Handlers
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
      } else alert("실패");
    } catch { alert("Network Error"); }
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
    if (res.ok) { const d = await res.json(); setBStratId(d.id); loadData(); alert("저장 완료"); }
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
      setSettingModal(false);
      loadData();
    } catch { alert("저장 실패"); }
  };

  const deleteSetting = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await api(`/backtest-settings/${id}`, { method: "DELETE" });
    loadData();
  };

  const compareStrategies = () => {
    const s1 = strategies.find(s => s.id === selectedStrats[0]);
    const s2 = strategies.find(s => s.id === selectedStrats[1]);
    const b1 = backtests.filter(b => b.strategy_id === s1?.id).sort((a, b) => new Date(b.created_at) < new Date(a.created_at) ? -1 : 1).pop();
    const b2 = backtests.filter(b => b.strategy_id === s2?.id).sort((a, b) => new Date(b.created_at) < new Date(a.created_at) ? -1 : 1).pop();
    if (!b1 || !b2) return alert("비교할 백테스트 데이터가 없습니다.");
    setCompareModal({ type: 'strat', data: [{ name: s1?.name, bt: b1 }, { name: s2?.name, bt: b2 }] });
  };

  const compareBacktests = () => {
    const b1 = backtests.find(b => b.id === selectedDetailBts[0]);
    const b2 = backtests.find(b => b.id === selectedDetailBts[1]);
    setCompareModal({ type: 'bt', data: [{ name: b1?.setting_name, bt: b1 }, { name: b2?.setting_name, bt: b2 }] });
  };

  const createPost = async () => {
    const res = await api("/community/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: postForm.title, content: postForm.content, strategy_id: postForm.strategyId })
    });
    if (res.ok) { setWriteModal(false); loadData(); }
  };

  const sortedBts = [...backtests].sort((a, b) => sortMethod === 'latest'
    ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    : (b.metrics.total_return - a.metrics.total_return)
  );
  const top3 = sortedBts.slice(0, 3);
  const latestBt = backtests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const latestStratName = strategies.find(s => s.id === latestBt?.strategy_id)?.name;

  useEffect(() => {
    const t = setInterval(() => setCarouselIdx(p => (p + 1) % (top3.length || 1)), 5000);
    return () => clearInterval(t);
  }, [top3.length]);

  if (!token) return (
    <div className="auth-card">
      <h2 style={{ color: 'var(--brand-blue)', marginBottom: 20 }}>QuantiMizer</h2>
      <form onSubmit={handleAuth} className="auth-form">
        {authMode === 'register' && <input className="input" placeholder="Username" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} required />}
        <input className="input" placeholder="Email" type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} required />
        <input className="input" placeholder="Password" type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} required />
        <button className="btn btn--primary" style={{ height: 44 }}>{authMode === 'login' ? '로그인' : '회원가입'}</button>
      </form>
      <button className="btn--ghost" style={{ marginTop: 16 }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? '계정 만들기' : '로그인하기'}</button>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header__inner">
          <div className="brand" onClick={() => setPage('dashboard')}>QuantiMizer</div>
          <nav className="nav-tabs">
            <button className={`nav-tab ${page === 'dashboard' ? 'nav-tab--active' : ''}`} onClick={() => setPage('dashboard')}>대시보드</button>
            <button className={`nav-tab ${page === 'strategies' ? 'nav-tab--active' : ''}`} onClick={() => setPage('strategies')}>내 전략</button>
            <button className={`nav-tab ${page === 'builder' ? 'nav-tab--active' : ''}`} onClick={() => setPage('builder')}>전략 빌더</button>
            <button className={`nav-tab ${page === 'settings' ? 'nav-tab--active' : ''}`} onClick={() => setPage('settings')}>백테스트 설정</button>
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
                <div className="kpi__label">보유 전략</div>
                <div className="kpi__value">{strategies.length}</div>
                <div className="kpi__sub">최근: {strategies[0]?.name || '-'}</div>
              </div>
              <div className="kpi" onClick={() => setPage('strategies')}>
                <div className="kpi__label">최근 수익률</div>
                <div className="kpi__value">{formatPct(latestBt?.metrics.total_return)}</div>
                <div className="kpi__sub">{latestStratName}</div>
              </div>
              <div className="kpi" onClick={() => setPage('backtests')}>
                <div className="kpi__label">최근 백테스트</div>
                <div className="kpi__value">{latestStratName || '-'}</div>
                <div className="kpi__sub">{latestBt?.created_at.slice(0, 10)}</div>
              </div>
            </div>
            <div className="card">
              <div className="card__header">
                <div className="card__title">전략 성과 비교</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`btn--ghost ${sortMethod === 'latest' ? 'nav-tab--active' : ''}`} onClick={() => setSortMethod('latest')}>최신순</button>
                  <button className={`btn--ghost ${sortMethod === 'return' ? 'nav-tab--active' : ''}`} onClick={() => setSortMethod('return')}>수익률순</button>
                </div>
              </div>
              <div className="card__body">
                {top3.length > 0 ? (
                  <div className="carousel">
                    <div className="carousel__inner" style={{ transform: `translateX(-${carouselIdx * 100}%)` }}>
                      {top3.map(bt => (
                        <div key={bt.id} className="carousel__slide">
                          <div style={{ marginBottom: 12, fontWeight: 'bold' }}>{strategies.find(s => s.id === bt.strategy_id)?.name} ({formatPct(bt.metrics.total_return)})</div>
                          <EquityChart data={bt.equity_curve} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <div style={{ padding: 20, textAlign: 'center' }}>데이터 없음</div>}
              </div>
            </div>
          </>
        )}

        {page === 'strategies' && (
          <div className="page-section">
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--primary" disabled={selectedStrats.length !== 2} onClick={compareStrategies}>선택 전략 비교</button>
            </div>
            <div className="strategy-grid">
              {strategies.map(s => {
                const lastBt = backtests.filter(b => b.strategy_id === s.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).pop();
                return (
                  <div key={s.id} className="card">
                    <div className="card__header">
                      <span>{s.name}</span>
                      <input type="checkbox" checked={selectedStrats.includes(s.id)} onChange={() => {
                        if (selectedStrats.includes(s.id)) setSelectedStrats(p => p.filter(x => x !== s.id));
                        else if (selectedStrats.length < 2) setSelectedStrats(p => [...p, s.id]);
                      }} />
                    </div>
                    <div className="card__body">
                      <div>최근 수익률: <strong>{formatPct(lastBt?.metrics.total_return || 0)}</strong></div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: 8 }}>수정일: {formatDate(s.updated_at)}</div>
                      <div className="strategy-card-actions">
                        <button className="btn btn--ghost" onClick={async () => {
                          if (confirm("삭제하시겠습니까?")) { await api(`/strategies/${s.id}`, { method: 'DELETE' }); loadData(); }
                        }}>삭제</button>
                        <button className="btn btn--secondary" onClick={() => setDetailStrat(s)}>자세히 보기</button>
                        <button className="btn btn--secondary" onClick={() => { loadStratToBuilder(s.id); setPage('builder'); }}>편집</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {page === 'builder' && (
          <div className="builder-layout">
            <div className="builder-header-row">
              <select className="select" style={{ width: 250 }} value={bStratId} onChange={e => loadStratToBuilder(e.target.value)}>
                <option value={NEW_STRAT_ID}>+ 새 전략 만들기</option>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="builder-info-row">
              <input className="input" style={{ width: 250 }} placeholder="전략 이름" value={bName} onChange={e => setBName(e.target.value)} />
              <input className="input" style={{ flex: 1 }} placeholder="전략 설명" value={bDesc} onChange={e => setBDesc(e.target.value)} />
              <button className="btn btn--secondary" onClick={saveStrategy}>저장</button>
            </div>
            <div className="builder-body">
              <div className="builder-canvas">
                <StrategyBlocklyEditor value={bConfig} onChange={setBConfig} />
              </div>
              <div className="builder-sidebar">
                <h4 style={{ margin: '0 0 10px 0' }}>백테스트 실행</h4>
                <div style={{ marginBottom: 10 }}>
                  <label className="setting-label">설정 선택</label>
                  <select className="select" value={bSettingId} onChange={e => setBSettingId(e.target.value)}>
                    <option value="">선택...</option>
                    {settings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button className="btn btn--primary" style={{ width: '100%', marginBottom: 20 }} onClick={runBacktest} disabled={loading}>
                  {loading ? "실행 중..." : "백테스트 실행"}
                </button>
                {bResult && (
                  <div className="sidebar-results">
                    <h4>결과: {formatPct(bResult.metrics.total_return)}</h4>
                    <div style={{ height: 150 }}><EquityChart data={bResult.equity_curve} /></div>
                    <div className="metric-grid-mini">
                      <div className="metric-item"><span>CAGR</span><strong>{formatPct(bResult.metrics.cagr)}</strong></div>
                      <div className="metric-item"><span>MDD</span><strong>{formatPct(bResult.metrics.max_drawdown)}</strong></div>
                      <div className="metric-item"><span>Sharpe</span><strong>{bResult.metrics.sharpe.toFixed(2)}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {page === 'settings' && (
          <div className="card">
            <div className="card__header">
              <div className="card__title">백테스트 설정 관리</div>
              <button className="btn btn--primary" onClick={() => { setSettingForm({}); setSettingModal(true); }}>+ 새 설정</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>이름</th><th>시장</th><th>기간</th><th>초기자본</th><th>관리</th></tr></thead>
                <tbody>
                  {settings.slice((stPage - 1) * 10, stPage * 10).map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.market} ({s.min_market_cap / 1e8}억↑)</td>
                      <td>{s.start_date} ~ {s.end_date}</td>
                      <td>{s.initial_capital.toLocaleString()}</td>
                      <td><button className="btn btn--ghost" onClick={() => deleteSetting(s.id)}>삭제</button></td>
                    </tr>
                  ))}
                  {settings.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center' }}>설정이 없습니다.</td></tr>}
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

        {page === 'backtests' && (
          <div className="card">
            <div className="card__header">
              <div className="card__title">백테스트 내역</div>
              <select className="select" style={{ width: 200 }} value={btFilter} onChange={e => { setBtFilter(e.target.value); setBtPage(1); }}>
                <option value="ALL">전체 전략</option>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>전략</th><th>설정</th><th>수익률</th><th>MDD</th><th>실행일</th><th>관리</th></tr></thead>
                <tbody>
                  {backtests.filter(b => btFilter === 'ALL' || b.strategy_id === btFilter)
                    .slice((btPage - 1) * 10, btPage * 10).map(b => (
                      <tr key={b.id}>
                        <td>{strategies.find(s => s.id === b.strategy_id)?.name}</td>
                        <td>{b.setting_name}</td>
                        <td style={{ color: b.metrics.total_return > 0 ? 'red' : 'blue' }}>{formatPct(b.metrics.total_return)}</td>
                        <td>{formatPct(b.metrics.max_drawdown)}</td>
                        <td>{new Date(b.created_at).toLocaleString()}</td>
                        <td><button className="btn btn--ghost" onClick={async () => {
                          if (confirm("삭제?")) { await api(`/backtests/${b.id}`, { method: 'DELETE' }); loadData(); }
                        }}>삭제</button></td>
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
              <h2>커뮤니티</h2>
              <button className="btn btn--primary" onClick={() => setWriteModal(true)}>+ 글 쓰기</button>
            </div>
            <div className="community-feed">
              {posts.map(p => (
                <div key={p.id} className="card community-card">
                  <div className="card__header"><div className="card__title">{p.title}</div></div>
                  <div className="card__body">
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{p.author_username} | {formatDate(p.created_at)}</div>
                    <p style={{ height: 60, overflow: 'hidden', margin: '10px 0' }}>{p.content}</p>
                    <div style={{ fontWeight: 'bold', color: 'var(--brand-blue)', fontSize: '0.9rem' }}>Strategy: {p.strategy_name}</div>
                    <div className="strategy-card-actions">
                      <button className="btn btn--secondary" onClick={async () => {
                        await api(`/community/posts/${p.id}/fork`, { method: 'POST' }); loadData(); alert("내 전략으로 복사되었습니다.");
                      }}>가져오기</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {detailStrat && (
        <Modal title={detailStrat.name} onClose={() => setDetailStrat(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card" style={{ background: '#f9fafb', border: 'none' }}>
              <div className="card__body">
                <h4>Description</h4>
                <p>{detailStrat.description}</p>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <h4>Backtest History</h4>
                <button className="btn btn--primary" disabled={selectedDetailBts.length !== 2} onClick={compareBacktests}>비교하기</button>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>선택</th><th>조건</th><th>수익률</th><th>MDD</th></tr></thead>
                  <tbody>
                    {backtests.filter(b => b.strategy_id === detailStrat.id).map(b => (
                      <tr key={b.id}>
                        <td><input type="checkbox" checked={selectedDetailBts.includes(b.id)} onChange={() => {
                          if (selectedDetailBts.includes(b.id)) setSelectedDetailBts(p => p.filter(x => x !== b.id));
                          else if (selectedDetailBts.length < 2) setSelectedDetailBts(p => [...p, b.id]);
                        }} /></td>
                        <td>{b.setting_name}</td>
                        <td>{formatPct(b.metrics.total_return)}</td>
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
        <Modal title="비교 분석" onClose={() => setCompareModal(null)}>
          <div className="comparison-grid">
            {compareModal.data.map((item: any, i: number) => (
              <div key={i} className="card">
                <div className="card__header" style={{ justifyContent: 'center' }}>{item.name}</div>
                <div className="card__body">
                  <EquityChart data={item.bt.equity_curve} />
                  <div className="metric-grid" style={{ marginTop: 16 }}>
                    <MetricCard label="Return" value={formatPct(item.bt.metrics.total_return)} />
                    <MetricCard label="CAGR" value={formatPct(item.bt.metrics.cagr)} />
                    <MetricCard label="MDD" value={formatPct(item.bt.metrics.max_drawdown)} />
                    <MetricCard label="Sharpe" value={item.bt.metrics.sharpe.toFixed(2)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {settingModal && (
        <Modal title="새 백테스트 설정" onClose={() => setSettingModal(false)}>
          <div className="setting-form">
            <label>설정 이름</label>
            <input className="input" value={settingForm.name || ''} onChange={e => setSettingForm({ ...settingForm, name: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>시장</label><select className="select" value={settingForm.market || 'ALL'} onChange={e => setSettingForm({ ...settingForm, market: e.target.value })}><option value="ALL">ALL</option><option value="KOSPI">KOSPI</option><option value="KOSDAQ">KOSDAQ</option></select></div>
              <div><label>최소 시가총액 (원)</label><input className="input" type="number" value={settingForm.min_market_cap || 0} onChange={e => setSettingForm({ ...settingForm, min_market_cap: Number(e.target.value) })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>시작일</label><input className="input" type="date" value={settingForm.start_date || ''} onChange={e => setSettingForm({ ...settingForm, start_date: e.target.value })} /></div>
              <div><label>종료일</label><input className="input" type="date" value={settingForm.end_date || ''} onChange={e => setSettingForm({ ...settingForm, end_date: e.target.value })} /></div>
            </div>
            <label>초기 자본금</label>
            <input className="input" type="number" value={settingForm.initial_capital || 10000000} onChange={e => setSettingForm({ ...settingForm, initial_capital: Number(e.target.value) })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn--primary" onClick={saveSetting}>저장</button>
            </div>
          </div>
        </Modal>
      )}

      {writeModal && (
        <Modal title="글 쓰기" onClose={() => setWriteModal(false)}>
          <div className="setting-form">
            <input className="input" placeholder="제목" value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} />
            <select className="select" value={postForm.strategyId} onChange={e => setPostForm({ ...postForm, strategyId: e.target.value })}>
              <option value="">공유할 전략 선택...</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea className="textarea" placeholder="내용" value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--primary" onClick={createPost}>등록</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}