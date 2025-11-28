import { useCallback, useEffect, useState, useMemo, type FormEvent } from "react";
import Swal from 'sweetalert2';
import "./App.css";

import type { StrategyConfig } from "./StrategyBlocklyEditor";
import type { Backtest, BacktestSetting, CommunityPost, Strategy } from "./types";
import EquityChart from "./components/EquityChart";
import { Modal, Pagination } from "./components/Shared";
import StrategyBuilder from "./pages/StrategyBuilder";
import Onboarding from "./pages/Onboarding";

// -------------------- Constants --------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "quant.token";
const NEW_STRAT_ID = "__new__";

const formatDate = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
const formatPct = (n: number) => n ? `${(n * 100).toFixed(2)}%` : "0.00%";
const formatNum = (n: number) => new Intl.NumberFormat('ko-KR', { notation: "compact", maximumFractionDigits: 1 }).format(n);

// -------------------- Main App --------------------

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string>("");
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(false);

  // Global State
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  // Dashboard State
  const [slideIndex, setSlideIndex] = useState(0);
  const [dashboardFilter, setDashboardFilter] = useState<'return' | 'latest'>('return');

  // Comparison & List State
  const [stratPage, setStratPage] = useState(1);
  const [btPage, setBtPage] = useState(1);
  const [stPage, setStPage] = useState(1);
  const [btFilter, setBtFilter] = useState("ALL");

  const [compareStratIds, setCompareStratIds] = useState<string[]>([]);
  const [isStrategyCompareModalOpen, setIsStrategyCompareModalOpen] = useState(false);
  const [strategyCompareSettingId, setStrategyCompareSettingId] = useState<string>("");

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

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUsername(payload.sub || payload.username || "");
      } catch (e) {
        console.error("Invalid token format");
      }
    } else {
      setUsername("");
    }
  }, [token]);

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
      if (st.items && st.items.length > 0 && !strategyCompareSettingId) {
        setStrategyCompareSettingId(st.items[0].id);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, api, strategyCompareSettingId]);

  useEffect(() => { if (token) loadData(); }, [token]);

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

  const saveStrategy = async (id: string, name: string, desc: string, config: StrategyConfig) => {
    if (!name) return Swal.fire("알림", "전략 이름을 입력해주세요.", "warning");
    const method = id === NEW_STRAT_ID ? "POST" : "PUT";
    const url = id === NEW_STRAT_ID ? "/strategies" : `/strategies/${id}`;
    const res = await api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, description: desc, strategy_json: config }) });
    if (res.ok) {
      const d = await res.json();
      loadData();
      Swal.fire("저장 완료", "전략이 성공적으로 저장되었습니다.", "success");
      return d.id;
    }
  };

  const deleteStrategy = async (id: string) => {
    const r = await Swal.fire({ title: '삭제하시겠습니까?', text: "이 작업은 되돌릴 수 없습니다.", icon: 'warning', showCancelButton: true, confirmButtonText: '삭제', cancelButtonText: '취소', confirmButtonColor: '#d33' });
    if (r.isConfirmed) {
      const res = await api(`/strategies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadData();
        Swal.fire("삭제됨", "전략이 삭제되었습니다.", "success");
      } else {
        Swal.fire("실패", "전략 삭제 중 오류가 발생했습니다.", "error");
      }
    }
  };

  const runBacktest = async (stratId: string, settingId: string) => {
    if (stratId === NEW_STRAT_ID) { Swal.fire("알림", "전략을 먼저 저장해주세요.", "warning"); return null; }
    if (!settingId) { Swal.fire("알림", "백테스트 설정을 선택해주세요.", "warning"); return null; }
    setLoading(true);
    try {
      const res = await api("/backtests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy_id: stratId, setting_id: settingId }) });
      setLoading(false);
      if (res.ok) {
        const result = await res.json();
        loadData();
        return result;
      }
      else { Swal.fire("실패", "백테스트 실행 중 오류가 발생했습니다.", "error"); return null; }
    } catch {
      setLoading(false);
      Swal.fire("오류", "실행 실패", "error");
      return null;
    }
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

  const deletePost = async (id: string) => {
    const r = await Swal.fire({ title: '게시글 삭제', text: "정말 삭제하시겠습니까?", icon: 'warning', showCancelButton: true, confirmButtonText: '삭제', cancelButtonText: '취소', confirmButtonColor: '#d33' });
    if (r.isConfirmed) {
      const res = await api(`/community/posts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadData();
        Swal.fire("삭제됨", "게시글이 삭제되었습니다.", "success");
      } else {
        Swal.fire("오류", "삭제 권한이 없거나 오류가 발생했습니다.", "error");
      }
    }
  };

  const toggleStratSelection = (id: string) => {
    if (compareStratIds.includes(id)) {
      setCompareStratIds(prev => prev.filter(x => x !== id));
    } else {
      if (compareStratIds.length < 2) {
        setCompareStratIds(prev => [...prev, id]);
      } else {
        Swal.fire("알림", "비교는 최대 2개의 전략까지 선택 가능합니다.", "info");
      }
    }
  };

  const maxReturnBacktest = useMemo(() => {
    if (backtests.length === 0) return null;
    return backtests.reduce((max, curr) => curr.metrics.total_return > max.metrics.total_return ? curr : max, backtests[0]);
  }, [backtests]);

  const dashboardCards = useMemo(() => {
    const sorted = [...backtests];
    if (dashboardFilter === 'return') {
      sorted.sort((a, b) => b.metrics.total_return - a.metrics.total_return);
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted.slice(0, 3);
  }, [backtests, dashboardFilter]);

  // Top 3 Posts for Community Page
  const topCommunityPosts = useMemo(() => {
    return [...posts]
      .filter(p => p.last_backtest) // Ensure backtest data exists
      .sort((a, b) => (b.last_backtest!.metrics.total_return - a.last_backtest!.metrics.total_return))
      .slice(0, 3);
  }, [posts]);

  const strategyCompareData = useMemo(() => {
    if (compareStratIds.length !== 2 || !strategyCompareSettingId) return null;
    const s1 = strategies.find(s => s.id === compareStratIds[0]);
    const s2 = strategies.find(s => s.id === compareStratIds[1]);
    const bt1 = backtests.filter(b => b.strategy_id === compareStratIds[0] && b.setting_id === strategyCompareSettingId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const bt2 = backtests.filter(b => b.strategy_id === compareStratIds[1] && b.setting_id === strategyCompareSettingId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return { s1, s2, bt1, bt2 };
  }, [compareStratIds, strategyCompareSettingId, strategies, backtests]);

  const handleSlide = (dir: 'next' | 'prev') => {
    if (dashboardCards.length === 0) return;
    setSlideIndex(prev => {
      if (dir === 'next') return (prev + 1) % dashboardCards.length;
      return (prev - 1 + dashboardCards.length) % dashboardCards.length;
    });
  };

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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="logout-button" onClick={() => setPage('onboarding')} style={{ border: 'none', background: 'var(--bg-subtle)', fontWeight: 600 }}>
                💡 처음이신가요?
              </button>
              <button className="logout-button" onClick={() => { setToken(null); localStorage.removeItem(TOKEN_KEY); }}>로그아웃</button>
            </div>
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
        {page === 'onboarding' && (
          <Onboarding onStart={() => setPage('builder')} />
        )}

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
                  <span style={{ fontWeight: 600, color: '#000' }}>{maxReturnBacktest ? strategies.find(s => s.id === maxReturnBacktest.strategy_id)?.name : '-'}</span> 전략
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
          <StrategyBuilder
            strategies={strategies}
            settings={settings}
            onSave={saveStrategy}
            onRunBacktest={runBacktest}
            loading={loading}
          />
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
                const isSelected = compareStratIds.includes(s.id);
                return (
                  <div key={s.id} className={`card ${isSelected ? 'card-selected' : ''}`} style={{ position: 'relative' }}>
                    <div className="card-selection-overlay">
                      <input
                        type="checkbox"
                        className="strategy-checkbox"
                        checked={isSelected}
                        onChange={() => toggleStratSelection(s.id)}
                      />
                    </div>
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
                      <div className="strategy-card-actions" style={{ justifyContent: 'space-between' }}>
                        <button className="btn btn--danger" onClick={() => deleteStrategy(s.id)}>삭제</button>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn--secondary" onClick={() => { setDetailStrat(s); setSelectedDetailBts([]); }}>상세 정보</button>
                          <button className="btn btn--primary" onClick={() => {
                            setPage('builder');
                          }}>수정 (빌더에서 선택)</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination current={stratPage} total={strategies.length} limit={6} onChange={setStratPage} />

            {compareStratIds.length === 2 && (
              <div className="compare-floating-bar">
                <div className="compare-info">
                  <span className="compare-count">2개 선택됨</span>
                  <span className="compare-names">
                    {strategies.find(s => s.id === compareStratIds[0])?.name} vs {strategies.find(s => s.id === compareStratIds[1])?.name}
                  </span>
                </div>
                <div className="compare-actions">
                  <button className="btn btn--ghost" style={{ color: '#fff' }} onClick={() => setCompareStratIds([])}>취소</button>
                  <button className="btn btn--primary" style={{ background: '#fff', color: '#000' }} onClick={() => setIsStrategyCompareModalOpen(true)}>전략 비교하기</button>
                </div>
              </div>
            )}
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

            {/* Top 3 Performers Section */}
            {topCommunityPosts.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 16 }}>최근 수익률 TOP 3</h3>
                <div className="top-performers-grid">
                  {topCommunityPosts.map(p => {
                    const metrics = p.last_backtest!.metrics;
                    const tags = settings.find(s => s.id === p.last_backtest!.setting_id)?.market || 'ALL';
                    const author = p.author_username;

                    return (
                      <div key={p.id} className="top-card" onClick={() => setResultModal(p.last_backtest!)}>
                        <div className="top-card-tags">
                          <span className="top-tag">{tags}</span>
                          <span className="top-tag sub">{author}</span>
                        </div>
                        <div className="top-card-title">{p.title}</div>
                        <div className="top-card-return">
                          {formatPct(metrics.total_return)}
                        </div>
                        <div className="top-card-body">
                          <div className="top-card-metrics">
                            <div className="mini-metric-row">
                              <span className="mini-metric-label">누적수익률</span>
                              <span className="mini-metric-value">{formatPct(metrics.total_return)}</span>
                            </div>
                            <div className="mini-metric-row">
                              <span className="mini-metric-label">연평균수익률</span>
                              <span className="mini-metric-value">{formatPct(metrics.cagr)}</span>
                            </div>
                            <div className="mini-metric-row">
                              <span className="mini-metric-label">최대손실폭</span>
                              <span className="mini-metric-value">{formatPct(metrics.max_drawdown)}</span>
                            </div>
                          </div>
                          <div className="mini-chart-container">
                            <EquityChart data={p.last_backtest!.equity_curve} height={80} minimal={true} />
                          </div>
                        </div>
                        <div className="top-card-footer">
                          <button className="view-btn" onClick={(e) => {
                            e.stopPropagation();
                            api(`/community/posts/${p.id}/fork`, { method: 'POST' }).then(() => {
                              Swal.fire("완료", "전략을 가져왔습니다!", "success");
                              loadData();
                            });
                          }}>
                            전략 가져오기 ➔
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="strategy-grid">
              {posts.map(p => {
                const stratName = p.strategy?.name || "Unknown Strategy";
                const metrics = p.last_backtest?.metrics || { total_return: 0, max_drawdown: 0, cagr: 0 };
                const stratId = p.strategy?.id;

                return (
                  <div key={p.id} className="card">
                    <div className="card__header" style={{ justifyContent: 'space-between' }}>
                      <span>{p.title}</span>
                      {p.author_username === username && (
                        <button className="btn--danger btn--sm" onClick={() => deletePost(p.id)}>삭제</button>
                      )}
                    </div>
                    <div className="card__body">
                      <p className="card-desc">{p.content}</p>

                      <div style={{ marginBottom: 12, fontSize: '13px', color: 'var(--text-secondary)' }}>
                        전략명: <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{stratName}</span>
                      </div>

                      <div className="post-metrics">
                        <div className="post-metric-label">최근 성과</div>
                        <div className="post-metric-row">
                          <div>
                            <span>수익률</span>
                            <span className={metrics.total_return > 0 ? 'text-success' : 'text-danger'}>
                              {formatPct(metrics.total_return)}
                            </span>
                          </div>
                          <div><span>MDD</span><span className="text-danger">{formatPct(metrics.max_drawdown)}</span></div>
                          <div><span>CAGR</span><span>{formatPct(metrics.cagr)}</span></div>
                        </div>
                      </div>
                      <div className="post-footer">
                        <span className="author">by <strong>{p.author_username}</strong></span>
                        {stratId && (
                          <button className="btn btn--secondary btn--sm" onClick={async () => { await api(`/community/posts/${p.id}/fork`, { method: 'POST' }); Swal.fire("완료", "전략을 가져왔습니다!", "success"); loadData(); }}>전략 가져오기</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {isStrategyCompareModalOpen && (
        <Modal title="전략 성과 비교 분석" onClose={() => setIsStrategyCompareModalOpen(false)}>
          <div className="comparison-layout">
            <div className="comparison-controls">
              <label style={{ fontWeight: 600, marginRight: 12 }}>비교할 백테스트 조건:</label>
              <select className="select" style={{ width: 300 }} value={strategyCompareSettingId} onChange={e => setStrategyCompareSettingId(e.target.value)}>
                {settings.map(s => <option key={s.id} value={s.id}>{s.name} ({s.market})</option>)}
              </select>
            </div>

            {strategyCompareData && strategyCompareData.bt1 && strategyCompareData.bt2 ? (
              <>
                <div className="comparison-chart-section">
                  <EquityChart
                    data={strategyCompareData.bt1.equity_curve}
                    comparison={{ label: strategyCompareData.s2?.name || "B", data: strategyCompareData.bt2.equity_curve }}
                    height={320}
                  />
                </div>

                <div className="comparison-table-wrapper">
                  <table className="table comparison-table">
                    <thead>
                      <tr>
                        <th>지표</th>
                        <th style={{ color: '#2563eb' }}>{strategyCompareData.s1?.name}</th>
                        <th style={{ color: '#dc2626' }}>{strategyCompareData.s2?.name}</th>
                        <th>차이 (Diff)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>총 수익률</td>
                        <td className={strategyCompareData.bt1.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>{formatPct(strategyCompareData.bt1.metrics.total_return)}</td>
                        <td className={strategyCompareData.bt2.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>{formatPct(strategyCompareData.bt2.metrics.total_return)}</td>
                        <td style={{ fontWeight: 700 }}>{formatPct(strategyCompareData.bt1.metrics.total_return - strategyCompareData.bt2.metrics.total_return)}</td>
                      </tr>
                      <tr>
                        <td>MDD</td>
                        <td>{formatPct(strategyCompareData.bt1.metrics.max_drawdown)}</td>
                        <td>{formatPct(strategyCompareData.bt2.metrics.max_drawdown)}</td>
                        <td>{formatPct(strategyCompareData.bt1.metrics.max_drawdown - strategyCompareData.bt2.metrics.max_drawdown)}</td>
                      </tr>
                      <tr>
                        <td>CAGR</td>
                        <td>{formatPct(strategyCompareData.bt1.metrics.cagr)}</td>
                        <td>{formatPct(strategyCompareData.bt2.metrics.cagr)}</td>
                        <td>{formatPct(strategyCompareData.bt1.metrics.cagr - strategyCompareData.bt2.metrics.cagr)}</td>
                      </tr>
                      <tr>
                        <td>Sharpe</td>
                        <td>{strategyCompareData.bt1.metrics.sharpe.toFixed(2)}</td>
                        <td>{strategyCompareData.bt2.metrics.sharpe.toFixed(2)}</td>
                        <td>{(strategyCompareData.bt1.metrics.sharpe - strategyCompareData.bt2.metrics.sharpe).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>선택하신 조건({settings.find(s => s.id === strategyCompareSettingId)?.name})으로 실행된 백테스트 결과가 두 전략 모두에 존재해야 비교가 가능합니다.</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>각 전략의 수정 화면에서 해당 조건으로 백테스트를 실행해주세요.</p>
              </div>
            )}
          </div>
        </Modal>
      )}

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
            <div className="comparison-table-wrapper">
              <table className="table comparison-table">
                <thead>
                  <tr>
                    <th>지표</th>
                    <th style={{ color: '#2563eb' }}>{compareModal.labelA}</th>
                    <th style={{ color: '#dc2626' }}>{compareModal.labelB}</th>
                    <th>차이</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>수익률</td>
                    <td className={compareModal.dataA.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>{formatPct(compareModal.dataA.metrics.total_return)}</td>
                    <td className={compareModal.dataB.metrics.total_return > 0 ? 'text-success' : 'text-danger'}>{formatPct(compareModal.dataB.metrics.total_return)}</td>
                    <td style={{ fontWeight: 700 }}>{formatPct(compareModal.dataA.metrics.total_return - compareModal.dataB.metrics.total_return)}</td>
                  </tr>
                  <tr>
                    <td>MDD</td>
                    <td>{formatPct(compareModal.dataA.metrics.max_drawdown)}</td>
                    <td>{formatPct(compareModal.dataB.metrics.max_drawdown)}</td>
                    <td>{formatPct(compareModal.dataA.metrics.max_drawdown - compareModal.dataB.metrics.max_drawdown)}</td>
                  </tr>
                </tbody>
              </table>
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
            <div className="metric-grid-results">
              <div className="metric-box"><label>CAGR</label><span>{formatPct(resultModal.metrics.cagr)}</span></div>
              <div className="metric-box"><label>MDD</label><span className="text-danger">{formatPct(resultModal.metrics.max_drawdown)}</span></div>
              <div className="metric-box"><label>Sharpe</label><span>{resultModal.metrics.sharpe.toFixed(2)}</span></div>
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
            <textarea className="textarea" placeholder="전략에 대한 설명을 공유해주세요..." value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} />
            <div className="form-actions"><button className="btn btn--primary" onClick={createPost}>등록하기</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}