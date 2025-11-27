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
const formatPct = (n: number) => n ? `${(n * 100).toFixed(2)}%` : "-";

// -------------------- Components --------------------
const EquityChart = ({ data, comparison }: { data: EquityPoint[], comparison?: { label: string, data: EquityPoint[] }[] }) => {
  if (!data || data.length === 0) return <div className="equity-chart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>데이터 없음</div>;

  const allSeries = [{ label: 'Current', data }, ...(comparison || [])];
  const allValues = allSeries.flatMap(s => s.data.map(d => d.equity));
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const colors = ['#2563eb', '#ea580c', '#16a34a'];

  return (
    <div className="equity-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
        {/* Grid */}
        {[0, 25, 50, 75, 100].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2" />)}

        {/* Lines */}
        {allSeries.map((s, idx) => {
          const pts = s.data.map((d, i) => {
            const x = (i / (s.data.length - 1)) * 100;
            const y = 100 - ((d.equity - minVal) / range) * 100;
            return `${x},${y}`;
          }).join(" ");
          return <polyline key={idx} points={pts} fill="none" stroke={colors[idx % colors.length]} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#666', marginTop: 8 }}>
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

  // States for features
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
      setStrategies(s.items);
      setSettings(st.items);
      setBacktests(b.items);
      setPosts(p.items);
      if (st.items.length > 0 && !bSettingId) setBSettingId(st.items[0].id);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, api]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Handlers ---
  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    const endpoint = authMode === 'login' ? "/auth/login" : "/auth/register";
    const body = authMode === 'login'
      ? new URLSearchParams({ username: authForm.email, password: authForm.password })
      : JSON.stringify(authForm);
    const headers = authMode === 'register' ? { "Content-Type": "application/json" } : { "Content-Type": "application/x-www-form-urlencoded" };

    const res = await fetch(API_BASE + endpoint, { method: "POST", headers, body });
    if (res.ok) {
      if (authMode === 'register') { alert("가입 완료"); setAuthMode('login'); }
      else { const d = await res.json(); setToken(d.access_token); localStorage.setItem(TOKEN_KEY, d.access_token); }
    } else alert("실패");
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
    setLoading(true);
    try {
      const res = await api("/backtests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: bStratId, setting_id: bSettingId })
      });
      if (res.ok) { setBResult(await res.json()); loadData(); }
    } catch { alert("실행 실패"); }
    setLoading(false);
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

  // Dashboard Data Prep
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
          <div className="brand">QuantiMizer</div>
          <nav className="nav-tabs">
            {['dashboard', 'strategies', 'builder', 'backtests', 'community'].map(k => (
              <button key={k} className={`nav-tab ${page === k ? 'nav-tab--active' : ''}`} onClick={() => setPage(k)}>
                {k === 'dashboard' ? '대시보드' : k === 'strategies' ? '내 전략' : k === 'builder' ? '전략 빌더' : k === 'backtests' ? '백테스트 내역' : '커뮤니티'}
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
                <div className="kpi__value">{strategies.length}</div>
                <div className="kpi__sub">최근: {strategies[0]?.name || '-'}</div>
              </div>
              <div className="kpi" onClick={() => setPage('strategies')}>
                <div className="kpi__label">최근 수익률</div>
                <div className="kpi__value">{formatPct(latestBt?.metrics.total_return)}</div>
                <div className="kpi__sub">{latestStratName} | {latestBt?.setting_name} | {latestBt?.created_at.slice(0, 10)}</div>
              </div>
              <div className="kpi" onClick={() => setPage('backtests')}>
                <div className="kpi__label">최근 백테스트</div>
                <div className="kpi__value">{latestStratName || '-'}</div>
                <div className="kpi__sub">{latestBt?.setting_name} | {latestBt?.created_at.slice(0, 10)}</div>
              </div>
            </div>

            <div className="card">
              <div className="card__header">
                <div className="card__title">전략 성과 비교 (자동 슬라이드)</div>
                <div>
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
                ) : <div>데이터 없음</div>}
              </div>
            </div>

            <div className="card">
              <div className="card__header"><div className="card__title">최근 백테스트</div></div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>전략</th><th>조건</th><th>기간</th><th>수익률</th><th>MDD</th><th>실행일</th></tr></thead>
                  <tbody>
                    {top3.map(b => (
                      <tr key={b.id}>
                        <td>{strategies.find(s => s.id === b.strategy_id)?.name}</td>
                        <td>{b.setting_name}</td>
                        <td>{b.start_date}~{b.end_date}</td>
                        <td>{formatPct(b.metrics.total_return)}</td>
                        <td>{formatPct(b.metrics.max_drawdown)}</td>
                        <td>{new Date(b.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <div>최근 수익률: <strong>{formatPct(lastBt?.metrics.total_return)}</strong></div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: 8 }}>수정일: {formatDate(s.updated_at)}</div>
                      <div className="strategy-card-actions">
                        <button className="btn btn--ghost" onClick={async () => {
                          if (confirm("삭제하시겠습니까?")) { await api(`/strategies/${s.id}`, { method: 'DELETE' }); loadData(); }
                        }}>삭제</button>
                        <button className="btn btn--secondary" onClick={() => setDetailStrat(s)}>자세히 보기</button>
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
            <div className="builder-controls">
              <select className="select" style={{ width: 200 }} value={bStratId} onChange={e => loadStratToBuilder(e.target.value)}>
                <option value={NEW_STRAT_ID}>새 전략 만들기</option>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="input" style={{ width: 200 }} placeholder="전략 이름" value={bName} onChange={e => setBName(e.target.value)} />
              <input className="input" style={{ flex: 1 }} placeholder="설명" value={bDesc} onChange={e => setBDesc(e.target.value)} />
              <button className="btn btn--secondary" onClick={saveStrategy}>저장</button>
            </div>
            <div className="builder-controls" style={{ marginTop: -10 }}>
              <span className="setting-label">백테스트 조건:</span>
              <select className="select" style={{ flex: 1 }} value={bSettingId} onChange={e => setBSettingId(e.target.value)}>
                {settings.map(s => <option key={s.id} value={s.id}>{s.name} ({s.market}, {s.start_date}~)</option>)}
              </select>
            </div>
            <div className="builder-main-row">
              <div className="builder-canvas">
                <StrategyBlocklyEditor value={bConfig} onChange={setBConfig} />
              </div>
              <div className="builder-backtest">
                <button className="btn btn--primary" style={{ width: '100%' }} onClick={runBacktest} disabled={loading}>
                  {loading ? "실행 중..." : "백테스트 실행"}
                </button>
                {bResult ? (
                  <>
                    <h4 style={{ margin: '10px 0' }}>결과: {formatPct(bResult.metrics.total_return)}</h4>
                    <EquityChart data={bResult.equity_curve} />
                    <div className="metric-grid">
                      <MetricCard label="CAGR" value={formatPct(bResult.metrics.cagr)} />
                      <MetricCard label="MDD" value={formatPct(bResult.metrics.max_drawdown)} />
                      <MetricCard label="Sharpe" value={bResult.metrics.sharpe.toFixed(2)} />
                      <MetricCard label="Vol" value={formatPct(bResult.metrics.volatility)} />
                    </div>
                  </>
                ) : <div style={{ textAlign: 'center', color: '#888', marginTop: 40 }}>실행 결과가 여기에 표시됩니다.</div>}
              </div>
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
                <thead><tr><th>전략</th><th>조건</th><th>기간</th><th>수익률</th><th>MDD</th><th>일시</th></tr></thead>
                <tbody>
                  {backtests.filter(b => btFilter === 'ALL' || b.strategy_id === btFilter)
                    .slice((btPage - 1) * 10, btPage * 10).map(b => (
                      <tr key={b.id}>
                        <td>{strategies.find(s => s.id === b.strategy_id)?.name}</td>
                        <td>{b.setting_name}</td>
                        <td>{b.start_date}~{b.end_date}</td>
                        <td>{formatPct(b.metrics.total_return)}</td>
                        <td>{formatPct(b.metrics.max_drawdown)}</td>
                        <td>{new Date(b.created_at).toLocaleString()}</td>
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
                    <p style={{ height: 50, overflow: 'hidden' }}>{p.content}</p>
                    <div style={{ marginTop: 8, fontWeight: 'bold', color: 'var(--brand-blue)' }}>전략: {p.strategy_name}</div>
                    <div className="strategy-card-actions">
                      <button className="btn btn--secondary" onClick={async () => {
                        await api(`/community/posts/${p.id}/fork`, { method: 'POST' }); loadData(); alert("복사 완료");
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
                <h4>전략 JSON</h4>
                <pre style={{ overflow: 'auto', maxHeight: 150, fontSize: '0.8rem' }}>{JSON.stringify(detailStrat.strategy_json, null, 2)}</pre>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <h4>최근 백테스트</h4>
                <button className="btn btn--primary" disabled={selectedDetailBts.length !== 2} onClick={compareBacktests}>선택 비교</button>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>선택</th><th>조건</th><th>기간</th><th>수익률</th><th>MDD</th></tr></thead>
                  <tbody>
                    {backtests.filter(b => b.strategy_id === detailStrat.id).map(b => (
                      <tr key={b.id}>
                        <td><input type="checkbox" checked={selectedDetailBts.includes(b.id)} onChange={() => {
                          if (selectedDetailBts.includes(b.id)) setSelectedDetailBts(p => p.filter(x => x !== b.id));
                          else if (selectedDetailBts.length < 2) setSelectedDetailBts(p => [...p, b.id]);
                        }} /></td>
                        <td>{b.setting_name}</td>
                        <td>{b.start_date}~{b.end_date}</td>
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
                    <MetricCard label="CAGR" value={formatPct(item.bt.metrics.cagr)} />
                    <MetricCard label="MDD" value={formatPct(item.bt.metrics.max_drawdown)} />
                  </div>
                </div>
              </div>
            ))}
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