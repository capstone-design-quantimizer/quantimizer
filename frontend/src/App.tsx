import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import "./App.css";
import StrategyBlocklyEditor, {
  DEFAULT_STRATEGY_CONFIG,
  type StrategyConfig,
  normalizeStrategyConfig,
} from "./StrategyBlocklyEditor";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type PageKey =
  | "dashboard"
  | "builder"
  | "backtests"
  | "strategies"
  | "settings"
  | "community";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

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
  description: string | null;
  strategy_json: Record<string, unknown>;
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
  setting_id: string | null;
  setting_name: string | null;
  start_date: string;
  end_date: string;
  initial_capital: number;
  ml_model_id: string | null;
  equity_curve: EquityPoint[];
  metrics: Record<string, number>;
  created_at: string;
  setting?: BacktestSetting | null;
}

interface CommunityStrategySummary {
  id: string;
  name: string;
  description: string | null;
  strategy_json: Record<string, unknown>;
}

interface CommunityFeedItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_username: string;
  strategy: CommunityStrategySummary;
  last_backtest: Backtest | null;
}

interface StrategyListResponse {
  total: number;
  items: Strategy[];
}

interface BacktestListResponse {
  total: number;
  items: Backtest[];
}

interface BacktestSettingListResponse {
  total: number;
  items: BacktestSetting[];
}

interface CommunityListResponse {
  items: CommunityFeedItem[];
}

// -----------------------------------------------------------------------------
// Constants & Config
// -----------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_STORAGE_KEY = "quantimizer.tokens";
const NEW_STRATEGY_ID = "__new__";
const NEW_SETTING_ID = "__new_setting__";

const ICONS: Record<string, string> = {
  home: "🏠",
  sliders: "🎛️",
  beaker: "🧪",
  layers: "🗂️",
  share: "🤝",
  settings: "⚙️",
  logout: "⎋",
  chart: "📈",
  upload: "📤",
  download: "⬇️",
  edit: "✏️",
  trash: "🗑️",
  fork: "🔀",
  play: "▶️",
  save: "💾",
  info: "ℹ️",
  left: "←",
  right: "→",
};

const navTabs: Array<{ id: PageKey; label: string; icon: string }> = [
  { id: "dashboard", label: "대시보드", icon: ICONS.home },
  { id: "strategies", label: "내 전략", icon: ICONS.layers },
  { id: "builder", label: "전략 빌더", icon: ICONS.sliders },
  { id: "settings", label: "백테스트 조건", icon: ICONS.settings },
  { id: "backtests", label: "백테스트 내역", icon: ICONS.beaker },
  { id: "community", label: "커뮤니티", icon: ICONS.share },
];

const METRIC_LABELS: Array<{
  key: string;
  label: string;
  format?: (value: number) => string;
}> = [
    { key: "total_return", label: "누적 수익률", format: (v) => formatPercent(v, 2) },
    { key: "cagr", label: "CAGR", format: (v) => formatPercent(v, 2) },
    { key: "max_drawdown", label: "최대 낙폭", format: (v) => formatPercent(v, 2) },
    { key: "volatility", label: "연환산 변동성", format: (v) => formatPercent(v, 2) },
    { key: "sharpe", label: "Sharpe Ratio", format: (v) => v.toFixed(2) },
  ];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const formatNumber = (value: number) => value.toLocaleString("ko-KR");

const formatPercent = (value: number | null | undefined, fractionDigits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(fractionDigits)}%`;
};

const toDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

const buildDrawdownSeries = (curve: EquityPoint[]): EquityPoint[] => {
  let peak = Number.NEGATIVE_INFINITY;
  return curve.map((point) => {
    const equity = Number(point.equity) || 0;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? equity / peak - 1 : 0;
    return { ...point, equity, drawdown };
  });
};

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

const Btn = ({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => (
  <button type="button" className={`btn btn--${variant} ${className}`.trim()} {...props}>
    {children}
  </button>
);

const Card = ({
  title,
  icon,
  right,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`card ${className}`.trim()}>
    {(title || icon || right) && (
      <header className="card__header">
        <div className="card__title">
          {icon && <span className="card__icon" aria-hidden>{icon}</span>}
          <span>{title}</span>
        </div>
        {right && <div className="card__right">{right}</div>}
      </header>
    )}
    <div className="card__body">{children}</div>
  </section>
);

const Input = ({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`input ${className}`.trim()} />
);

const Select = ({
  options,
  value,
  onChange,
  className = "",
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => (
  <select
    className={`select ${className}`.trim()}
    value={value}
    onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const Modal = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onClose} role="presentation" />
      <div className="modal__content" role="dialog" aria-modal="true">
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Specialized Components
// -----------------------------------------------------------------------------

const EquityChart = ({ data, comparisonData }: { data: EquityPoint[], comparisonData?: { label: string, data: EquityPoint[] }[] }) => {
  const WIDTH = 800;
  const HEIGHT = 300;
  const PADDING = { TOP: 20, BOTTOM: 30, LEFT: 60, RIGHT: 60 };
  const CHART_W = WIDTH - PADDING.LEFT - PADDING.RIGHT;
  const CHART_H = HEIGHT - PADDING.TOP - PADDING.BOTTOM;

  const allPoints = useMemo(() => {
    let points = [...data];
    if (comparisonData) {
      comparisonData.forEach(cd => points = points.concat(cd.data));
    }
    return points;
  }, [data, comparisonData]);

  const { paths, xLabels, leftTicks, gridLines } = useMemo(() => {
    if (allPoints.length === 0) {
      return { paths: [], xLabels: [], leftTicks: [], rightTicks: [], gridLines: [] };
    }

    const dates = allPoints.map(p => new Date(p.date).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const dateRange = maxDate - minDate || 1;

    const normalize = (pts: EquityPoint[]) => {
      if (pts.length === 0) return [];
      const startEq = pts[0].equity;
      return pts.map(p => ({ ...p, ret: (p.equity - startEq) / startEq }));
    };

    const mainNorm = normalize(data);
    const compNorms = comparisonData?.map(c => ({ label: c.label, points: normalize(c.data) })) || [];

    const allRets = mainNorm.map(p => p.ret).concat(compNorms.flatMap(c => c.points.map(p => p.ret)));
    const minRet = Math.min(...allRets);
    const maxRet = Math.max(...allRets);
    const retRange = (maxRet - minRet) || 1;

    const getX = (dateStr: string) => {
      const t = new Date(dateStr).getTime();
      return PADDING.LEFT + ((t - minDate) / dateRange) * CHART_W;
    };
    const getY = (ret: number) => PADDING.TOP + CHART_H * (1 - (ret - minRet) / retRange);

    const makePath = (pts: { date: string, ret: number }[]) => {
      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.date).toFixed(1)} ${getY(p.ret).toFixed(1)}`).join(" ");
    };

    const paths = [
      { d: makePath(mainNorm), color: "#22c55e", strokeWidth: 2 },
      ...compNorms.map((c, i) => ({
        d: makePath(c.points),
        color: ["#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"][i % 4],
        strokeWidth: 1.5,
        label: c.label
      }))
    ];

    const xLabelCount = 6;
    const xLabels = [];
    for (let i = 0; i < xLabelCount; i++) {
      const t = minDate + (i / (xLabelCount - 1)) * dateRange;
      xLabels.push({ x: PADDING.LEFT + (i / (xLabelCount - 1)) * CHART_W, y: HEIGHT - 5, text: toDateLabel(new Date(t).toISOString()) });
    }

    const yTickCount = 5;
    const leftTicks = [];
    const gridLines = [];
    for (let i = 0; i < yTickCount; i++) {
      const ratio = i / (yTickCount - 1);
      const retVal = minRet + ratio * retRange;
      const y = getY(retVal);
      leftTicks.push({ x: PADDING.LEFT - 10, y: y + 4, text: `${(retVal * 100).toFixed(1)}%` });
      gridLines.push(y);
    }

    return { paths, xLabels, leftTicks, rightTicks: [], gridLines };
  }, [data, comparisonData, allPoints]);

  return (
    <div className="equity-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        <rect width={WIDTH} height={HEIGHT} fill="var(--chart-background)" opacity={0.3} />
        {gridLines.map((y, i) => <line key={i} x1={PADDING.LEFT} y1={y} x2={WIDTH - PADDING.RIGHT} y2={y} className="chart-grid" />)}

        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} strokeLinejoin="round" />
        ))}

        <line x1={PADDING.LEFT} y1={PADDING.TOP} x2={PADDING.LEFT} y2={HEIGHT - PADDING.BOTTOM} className="chart-axis-line" />
        <line x1={WIDTH - PADDING.RIGHT} y1={PADDING.TOP} x2={WIDTH - PADDING.RIGHT} y2={HEIGHT - PADDING.BOTTOM} className="chart-axis-line" />

        {xLabels.map((l, i) => <text key={i} x={l.x} y={l.y} className="chart-text chart-text--x">{l.text}</text>)}
        {leftTicks.map((l, i) => <text key={i} x={l.x} y={l.y} className="chart-text chart-text--y-left">{l.text}</text>)}
      </svg>
      {comparisonData && (
        <div className="chart-legend">
          <div className="legend-item"><span style={{ backgroundColor: "#22c55e" }}></span> Current</div>
          {comparisonData.map((c, i) => (
            <div key={i} className="legend-item">
              <span style={{ backgroundColor: ["#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"][i % 4] }}></span>
              {c.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PerformanceReport = ({ metrics }: { metrics: Record<string, number> }) => (
  <div className="metrics-grid">
    {METRIC_LABELS.map(({ key, label, format }) => (
      <div key={key} className="metric-card">
        <div className="metric-card__label">{label}</div>
        <div className="metric-card__value">
          {metrics && metrics[key] !== undefined ? (format ? format(metrics[key]) : metrics[key]) : "-"}
        </div>
      </div>
    ))}
  </div>
);

const KPI = ({ label, value, sub, onClick }: { label: string; value: string | number; sub?: string; onClick?: () => void }) => (
  <div className={`kpi ${onClick ? "kpi--clickable" : ""}`} onClick={onClick}>
    <span className="kpi__label">{label}</span>
    <span className="kpi__value">{value}</span>
    {sub && <span className="kpi__sub">{sub}</span>}
  </div>
);

const AuthForm = ({
  onLogin,
  onRegister,
  error,
  loading,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<void>;
  error: string | null;
  loading: boolean;
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    if (mode === "login") {
      try { await onLogin(email, password); } catch { }
    } else {
      try { await onRegister(email, username, password); } catch { }
    }
  };

  return (
    <div className="auth-card">
      <h1 className="auth-card__title">QuantiMizer</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-form__field">
          <span>이메일</span>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === "register" && (
          <label className="auth-form__field">
            <span>닉네임</span>
            <Input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
        )}
        <label className="auth-form__field">
          <span>비밀번호</span>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="alert alert--error auth-form__alert">{ICONS.info} {error}</div>}
        <Btn type="submit" variant="primary" className="auth-form__submit" disabled={loading}>
          {loading ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
        </Btn>
        <button type="button" className="auth-form__toggle" onClick={() => setMode((p) => (p === "login" ? "register" : "login"))}>
          {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </form>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------

const Dashboard = ({ token, onNavigate }: { token: string, onNavigate: (page: PageKey) => void }) => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sortMethod, setSortMethod] = useState<"latest" | "return">("latest");

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/strategies?limit=100`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/backtests?limit=10`, { headers: { Authorization: `Bearer ${token}` } })
    ]).then(async ([sRes, bRes]) => {
      if (sRes.ok) setStrategies((await sRes.json()).items);
      if (bRes.ok) setBacktests((await bRes.json()).items);
    });
  }, [token]);

  const sortedBacktests = useMemo(() => {
    const list = [...backtests];
    if (sortMethod === "latest") {
      return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      return list.sort((a, b) => (b.metrics?.total_return ?? -999) - (a.metrics?.total_return ?? -999));
    }
  }, [backtests, sortMethod]);

  const top3 = sortedBacktests.slice(0, 3);
  const latestBacktest = backtests.length > 0 ? backtests[0] : null;

  useEffect(() => {
    const timer = setInterval(() => {
      if (top3.length > 1) setCurrentSlide((prev) => (prev + 1) % top3.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [top3.length]);

  return (
    <div className="page-section">
      <div className="kpi-grid">
        <KPI label="보유 전략" value={strategies.length} sub="개" onClick={() => onNavigate("strategies")} />
        <KPI
          label="최근 수익률"
          value={latestBacktest ? formatPercent(latestBacktest.metrics?.total_return) : "-"}
          sub={latestBacktest ? `${latestBacktest.setting_name}` : "데이터 없음"}
          onClick={() => onNavigate("strategies")}
        />
        <KPI
          label="최근 백테스트"
          value={latestBacktest ? new Date(latestBacktest.created_at).toLocaleDateString() : "-"}
          sub="날짜"
          onClick={() => onNavigate("backtests")}
        />
      </div>

      <Card
        title="전략 에쿼티 커브 슬라이드"
        icon={ICONS.chart}
        right={
          <div style={{ display: "flex", gap: "8px" }}>
            <Btn variant="ghost" onClick={() => setSortMethod("latest")} style={sortMethod === "latest" ? { fontWeight: "bold", color: "var(--brand-blue)" } : {}}>최신순</Btn>
            <Btn variant="ghost" onClick={() => setSortMethod("return")} style={sortMethod === "return" ? { fontWeight: "bold", color: "var(--brand-blue)" } : {}}>수익률순</Btn>
          </div>
        }
      >
        {top3.length > 0 ? (
          <div className="carousel">
            <div className="carousel__controls">
              <button className="carousel__btn" onClick={() => setCurrentSlide((currentSlide - 1 + top3.length) % top3.length)}>{ICONS.left}</button>
              <button className="carousel__btn" onClick={() => setCurrentSlide((currentSlide + 1) % top3.length)}>{ICONS.right}</button>
            </div>
            <div className="carousel__inner" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
              {top3.map((bt) => {
                const curve = buildDrawdownSeries(bt.equity_curve);
                const stratName = strategies.find(s => s.id === bt.strategy_id)?.name || "Unknown";
                return (
                  <div key={bt.id} className="carousel__slide">
                    <div className="carousel__metrics">
                      <div className="carousel__metric-row">전략: <span className="carousel__metric-value">{stratName}</span></div>
                      <div className="carousel__metric-row">수익률: <span className="carousel__metric-value">{formatPercent(bt.metrics.total_return)}</span></div>
                    </div>
                    <EquityChart data={curve} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="placeholder">
            <p>최근 백테스트 결과가 없습니다.</p>
          </div>
        )}
      </Card>
    </div>
  );
};

const BacktestSettingsPage = ({
  token,
}: {
  token: string;
}) => {
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<BacktestSetting>>({});

  const ITEMS_PER_PAGE = 10;

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const res = await fetch(`${API_BASE_URL}/backtest-settings?skip=${offset}&limit=${ITEMS_PER_PAGE}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: BacktestSettingListResponse = await res.json();
        setSettings(data.items);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleCreate = () => {
    setEditingId(NEW_SETTING_ID);
    setFormData({
      name: "새 설정",
      market: "KOSPI",
      min_market_cap: 0,
      exclude_list: [],
      start_date: "2020-01-01",
      end_date: "2023-12-31",
      initial_capital: 100000000,
    });
  };

  const handleEdit = (setting: BacktestSetting) => {
    setEditingId(setting.id);
    setFormData(setting);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await fetch(`${API_BASE_URL}/backtest-settings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchSettings();
  };

  const handleSave = async () => {
    const url = editingId === NEW_SETTING_ID
      ? `${API_BASE_URL}/backtest-settings`
      : `${API_BASE_URL}/backtest-settings/${editingId}`;
    const method = editingId === NEW_SETTING_ID ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      setEditingId(null);
      fetchSettings();
    } else {
      alert("저장 실패");
    }
  };

  if (editingId) {
    return (
      <Card title={editingId === NEW_SETTING_ID ? "새 설정 생성" : "설정 수정"}>
        <div className="form-group">
          <label>설정 이름</label>
          <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>시장</label>
            <Select options={[{ label: "KOSPI", value: "KOSPI" }, { label: "KOSDAQ", value: "KOSDAQ" }, { label: "ALL", value: "ALL" }]}
              value={formData.market || "KOSPI"} onChange={v => setFormData({ ...formData, market: v })} />
          </div>
          <div className="form-group">
            <label>최소 시가총액 (원)</label>
            <Input type="number" value={formData.min_market_cap} onChange={e => setFormData({ ...formData, min_market_cap: Number(e.target.value) })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>시작일</label>
            <Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>종료일</label>
            <Input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>초기 자본금</label>
          <Input type="number" value={formData.initial_capital} onChange={e => setFormData({ ...formData, initial_capital: Number(e.target.value) })} />
        </div>
        <div className="form-actions">
          <Btn onClick={handleSave}>저장</Btn>
          <Btn variant="secondary" onClick={() => setEditingId(null)}>취소</Btn>
        </div>
      </Card>
    );
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>백테스트 조건</h2>
        <Btn onClick={handleCreate}>+ 새 조건 만들기</Btn>
      </div>
      {loading && <div className="alert alert--info">로딩 중...</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>시장</th>
            <th>기간</th>
            <th>초기자본</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {settings.map(s => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.market}</td>
              <td>{s.start_date} ~ {s.end_date}</td>
              <td>{formatNumber(s.initial_capital)}</td>
              <td>
                <Btn variant="ghost" onClick={() => handleEdit(s)}>{ICONS.edit}</Btn>
                <Btn variant="ghost" onClick={() => handleDelete(s.id)}>{ICONS.trash}</Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="pagination">
          <button className="pagination__btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</button>
          <span>{page} / {totalPages}</span>
          <button className="pagination__btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>다음</button>
        </div>
      )}
    </div>
  );
};

const StrategyBuilder = ({
  token,
  strategyId,
  onSave,
}: {
  token: string;
  strategyId: string;
  onSave: () => void;
}) => {
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [name, setName] = useState("새 전략");
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [selectedSettingId, setSelectedSettingId] = useState<string>("");
  const [backtestResult, setBacktestResult] = useState<Backtest | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (strategyId === NEW_STRATEGY_ID) {
      setConfig(DEFAULT_STRATEGY_CONFIG);
      setName("새 전략");
      return;
    }
    fetch(`${API_BASE_URL}/strategies/${strategyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: Strategy) => {
        setName(data.name);
        setConfig(normalizeStrategyConfig(data.strategy_json));
      });
  }, [strategyId, token]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/backtest-settings?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: BacktestSettingListResponse) => {
        setSettings(data.items);
        if (data.items.length > 0) setSelectedSettingId(data.items[0].id);
      });
  }, [token]);

  const handleSave = async () => {
    const url = strategyId === NEW_STRATEGY_ID ? `${API_BASE_URL}/strategies` : `${API_BASE_URL}/strategies/${strategyId}`;
    const method = strategyId === NEW_STRATEGY_ID ? "POST" : "PUT";

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, strategy_json: config }),
    });
    onSave();
  };

  const handleRunBacktest = async () => {
    if (!selectedSettingId) {
      alert("백테스트 조건을 선택해주세요.");
      return;
    }
    setRunning(true);
    try {
      let currentStrategyId = strategyId;
      if (strategyId === NEW_STRATEGY_ID) {
        const res = await fetch(`${API_BASE_URL}/strategies`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, strategy_json: config }),
        });
        const data = await res.json();
        currentStrategyId = data.id;
        onSave();
      } else {
        await fetch(`${API_BASE_URL}/strategies/${strategyId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, strategy_json: config }),
        });
      }

      const res = await fetch(`${API_BASE_URL}/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ strategy_id: currentStrategyId, setting_id: selectedSettingId }),
      });

      if (!res.ok) throw new Error("Backtest failed");
      const result: Backtest = await res.json();
      setBacktestResult(result);
    } catch (e) {
      alert("백테스트 실행 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="builder-container">
      <div className="builder-header">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="strategy-name-input" />
        <div className="builder-actions">
          <Btn variant="secondary" onClick={handleSave}>저장</Btn>
        </div>
      </div>

      <div className="builder-content">
        <div className="editor-pane">
          <StrategyBlocklyEditor value={config} onChange={setConfig} />
        </div>
        <div className="result-pane">
          <div className="builder-backtest builder-backtest--side">
            <div className="setting-form">
              <div className="setting-form__header">백테스트 실행</div>
              <label style={{ fontSize: "0.85rem", marginBottom: "4px", display: "block" }}>조건 선택</label>
              <Select
                options={settings.map(s => ({ label: s.name, value: s.id }))}
                value={selectedSettingId}
                onChange={setSelectedSettingId}
              />
              <div className="builder-buttons" style={{ marginTop: "12px" }}>
                <Btn onClick={handleRunBacktest} disabled={running}>{running ? "실행 중..." : "백테스트 실행"}</Btn>
              </div>
            </div>
            {backtestResult && (
              <div style={{ marginTop: "16px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem" }}>결과</h3>
                <EquityChart data={backtestResult.equity_curve} />
                <PerformanceReport metrics={backtestResult.metrics} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const BacktestsPage = ({ token }: { token: string }) => {
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [filterStrategyId, setFilterStrategyId] = useState<string>("ALL");
  const [selectedBacktest, setSelectedBacktest] = useState<Backtest | null>(null);

  const fetchBacktests = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/backtests?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: BacktestListResponse = await res.json();
      setBacktests(data.items);
    }
  }, [token]);

  useEffect(() => {
    fetchBacktests();
    fetch(`${API_BASE_URL}/strategies`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: StrategyListResponse) => setStrategies(data.items));
  }, [fetchBacktests, token]);

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`${API_BASE_URL}/backtests/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchBacktests();
  };

  const filtered = filterStrategyId === "ALL"
    ? backtests
    : backtests.filter(b => b.strategy_id === filterStrategyId);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>백테스트 내역</h2>
        <Select
          options={[{ label: "전체 전략", value: "ALL" }, ...strategies.map(s => ({ label: s.name, value: s.id }))]}
          value={filterStrategyId}
          onChange={setFilterStrategyId}
        />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>전략</th>
            <th>조건</th>
            <th>실행일</th>
            <th>기간</th>
            <th>CAGR</th>
            <th>MDD</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(b => (
            <tr key={b.id}>
              <td>{strategies.find(s => s.id === b.strategy_id)?.name || "Unknown"}</td>
              <td>{b.setting_name || "-"}</td>
              <td>{new Date(b.created_at).toLocaleDateString()}</td>
              <td>{b.start_date} ~ {b.end_date}</td>
              <td>{formatPercent(b.metrics.cagr)}</td>
              <td>{formatPercent(b.metrics.max_drawdown)}</td>
              <td>
                <Btn variant="ghost" onClick={() => setSelectedBacktest(b)}>자세히</Btn>
                <Btn variant="ghost" onClick={() => handleDelete(b.id)}>{ICONS.trash}</Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={!!selectedBacktest} onClose={() => setSelectedBacktest(null)} title="백테스트 상세">
        {selectedBacktest && (
          <>
            <EquityChart data={selectedBacktest.equity_curve} />
            <PerformanceReport metrics={selectedBacktest.metrics} />
          </>
        )}
      </Modal>
    </div>
  );
};

const MyStrategies = ({
  token,
  onEdit
}: {
  token: string;
  onEdit: (id: string) => void;
}) => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [selectedBacktestIds, setSelectedBacktestIds] = useState<Set<string>>(new Set());

  const fetchStrategies = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/strategies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: StrategyListResponse = await res.json();
      setStrategies(data.items);
    }
  }, [token]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setSelectedBacktestIds(new Set());

    const res = await fetch(`${API_BASE_URL}/backtests?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: BacktestListResponse = await res.json();
      setBacktests(data.items.filter(b => b.strategy_id === id));
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedBacktestIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedBacktestIds(newSet);
  };

  const comparisonData = useMemo(() => {
    const selected = backtests.filter(b => selectedBacktestIds.has(b.id));
    if (selected.length === 0) return undefined;

    return selected.map(b => ({
      label: `${b.setting_name || '설정'} (${b.start_date})`,
      data: b.equity_curve
    }));
  }, [backtests, selectedBacktestIds]);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>내 전략</h2>
        <Btn onClick={() => onEdit(NEW_STRATEGY_ID)}>+ 새 전략 만들기</Btn>
      </div>
      <div className="strategy-list">
        {strategies.map(s => (
          <Card key={s.id} className="strategy-card">
            <div className="strategy-header">
              <div onClick={() => handleExpand(s.id)} style={{ cursor: "pointer", fontWeight: "bold", fontSize: "1.1rem" }}>
                {s.name}
              </div>
              <div>
                <Btn variant="ghost" onClick={() => onEdit(s.id)}>{ICONS.edit}</Btn>
              </div>
            </div>
            {expandedId === s.id && (
              <div className="strategy-details">
                <h4 style={{ marginTop: "16px", marginBottom: "8px" }}>백테스트 비교 (선택하여 차트 보기)</h4>
                {comparisonData && comparisonData.length > 0 && (
                  <EquityChart data={comparisonData[0].data} comparisonData={comparisonData.slice(1)} />
                )}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>선택</th>
                      <th>조건</th>
                      <th>기간</th>
                      <th>CAGR</th>
                      <th>MDD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtests.map(b => (
                      <tr key={b.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBacktestIds.has(b.id)}
                            onChange={() => toggleSelection(b.id)}
                          />
                        </td>
                        <td>{b.setting_name}</td>
                        <td>{b.start_date} ~ {b.end_date}</td>
                        <td>{formatPercent(b.metrics.cagr)}</td>
                        <td>{formatPercent(b.metrics.max_drawdown)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

const CommunityPage = ({ token }: { token: string }) => {
  const [feed, setFeed] = useState<CommunityFeedItem[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/community/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: CommunityListResponse) => setFeed(data.items));
  }, [token]);

  return (
    <div className="page-container">
      <h2>커뮤니티</h2>
      <div className="feed-list">
        {feed.map((item) => (
          <Card key={item.id} title={item.title}>
            <p>{item.content}</p>
            <small>By {item.author_username}</small>
          </Card>
        ))}
      </div>
    </div>
  );
};

function App() {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const [activeTab, setActiveTab] = useState<PageKey>("dashboard");
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLogin = async (email: string, pass: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const params = new URLSearchParams();
      params.append("username", email);
      params.append("password", pass);
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (!res.ok) throw new Error("로그인 실패");
      const data = await res.json();
      const newTokens = { accessToken: data.access_token, refreshToken: data.refresh_token || "" };
      setTokens(newTokens);
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(newTokens));
    } catch (e) {
      setAuthError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (email: string, username: string, pass: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password: pass }),
      });
      if (!res.ok) throw new Error("회원가입 실패");
      alert("회원가입 성공! 로그인해주세요.");
    } catch (e) {
      setAuthError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setTokens(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  };

  const handleEditStrategy = (id: string) => {
    setEditingStrategyId(id);
    setActiveTab("builder");
  };

  const handleSaveStrategy = () => {
    setEditingStrategyId(null);
    setActiveTab("strategies");
  };

  if (!tokens) {
    return <AuthForm onLogin={handleLogin} onRegister={handleRegister} loading={authLoading} error={authError} />;
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="brand">Quantimizer</div>
        <div className="nav-links">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="user-profile">
          <Btn variant="ghost" onClick={handleLogout}>
            {ICONS.logout} 로그아웃
          </Btn>
        </div>
      </nav>

      <main className="main-content">
        {activeTab === "dashboard" && (
          <Dashboard token={tokens.accessToken} onNavigate={setActiveTab} />
        )}

        {activeTab === "builder" && (
          <StrategyBuilder
            token={tokens.accessToken}
            strategyId={editingStrategyId || NEW_STRATEGY_ID}
            onSave={handleSaveStrategy}
          />
        )}

        {activeTab === "settings" && (
          <BacktestSettingsPage token={tokens.accessToken} />
        )}

        {activeTab === "backtests" && (
          <BacktestsPage token={tokens.accessToken} />
        )}

        {activeTab === "strategies" && (
          <MyStrategies token={tokens.accessToken} onEdit={handleEditStrategy} />
        )}

        {activeTab === "community" && (
          <CommunityPage token={tokens.accessToken} />
        )}
      </main>
    </div>
  );
}

export default App;