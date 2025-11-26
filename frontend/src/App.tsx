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
  start_date: string;
  end_date: string;
  initial_capital: number;
  ml_model_id: string | null;
  equity_curve: EquityPoint[];
  metrics: Record<string, number>;
  created_at: string;
  setting?: BacktestSetting | null; // Joined info
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
  { id: "builder", label: "전략 빌더", icon: ICONS.sliders },
  { id: "backtests", label: "백테스트", icon: ICONS.beaker },
  { id: "strategies", label: "내 전략", icon: ICONS.layers },
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
// Components
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

const EquityChart = ({ data }: { data: EquityPoint[] }) => {
  // Chart dimensions
  const WIDTH = 800;
  const HEIGHT = 300;
  const PADDING = { TOP: 20, BOTTOM: 30, LEFT: 60, RIGHT: 60 };
  const CHART_W = WIDTH - PADDING.LEFT - PADDING.RIGHT;
  const CHART_H = HEIGHT - PADDING.TOP - PADDING.BOTTOM;

  const { equityPoints, drawdownPoints, xLabels, leftTicks, rightTicks, gridLines } = useMemo(() => {
    if (data.length === 0) {
      return { equityPoints: "", drawdownPoints: "", xLabels: [], leftTicks: [], rightTicks: [], gridLines: [] };
    }

    const initialEquity = data[0].equity || 1;
    const returns = data.map((d) => (d.equity - initialEquity) / initialEquity);
    const drawdowns = data.map((d) => d.drawdown ?? 0);

    const minRet = Math.min(...returns);
    const maxRet = Math.max(...returns);
    const minDd = Math.min(...drawdowns);
    
    const retRange = (maxRet - minRet) || 1;
    const ddRange = (0 - minDd) || 1; 

    const getYRet = (val: number) => PADDING.TOP + CHART_H * (1 - (val - minRet) / retRange);
    const getYDd = (val: number) => PADDING.TOP + CHART_H * (1 - (val - minDd) / ddRange);
    const getX = (index: number) => PADDING.LEFT + (index / (data.length - 1)) * CHART_W;

    const equityPointsStr = returns.map((val, i) => `${getX(i).toFixed(1)},${getYRet(val).toFixed(1)}`).join(" ");
    const drawdownPointsStr = drawdowns.map((val, i) => `${getX(i).toFixed(1)},${getYDd(val).toFixed(1)}`).join(" ");

    const xLabelCount = 6;
    const xLabels = [];
    for (let i = 0; i < xLabelCount; i++) {
      const index = Math.round((i * (data.length - 1)) / (xLabelCount - 1));
      if (data[index]) xLabels.push({ x: getX(index), y: HEIGHT - 5, text: toDateLabel(data[index].date) });
    }

    const yTickCount = 5;
    const leftTicks = [];
    const rightTicks = [];
    const gridLines = [];
    for (let i = 0; i < yTickCount; i++) {
      const ratio = i / (yTickCount - 1);
      
      const retVal = minRet + ratio * retRange;
      const yRet = getYRet(retVal);
      leftTicks.push({ x: PADDING.LEFT - 10, y: yRet + 4, text: `${(retVal * 100).toFixed(1)}%` });
      gridLines.push(yRet);

      const ddVal = minDd + ratio * ddRange;
      const yDd = getYDd(ddVal);
      rightTicks.push({ x: WIDTH - PADDING.RIGHT + 10, y: yDd + 4, text: `${(ddVal * 100).toFixed(1)}%` });
    }

    return { equityPoints: equityPointsStr, drawdownPoints: drawdownPointsStr, xLabels, leftTicks, rightTicks, gridLines };
  }, [data]);

  return (
    <div className="equity-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        <rect width={WIDTH} height={HEIGHT} fill="var(--chart-background)" opacity={0.3} />
        {gridLines.map((y, i) => <line key={i} x1={PADDING.LEFT} y1={y} x2={WIDTH - PADDING.RIGHT} y2={y} className="chart-grid" />)}
        <polyline points={drawdownPoints} fill="none" stroke="rgba(244, 63, 94, 0.6)" strokeWidth={2} strokeLinejoin="round" />
        <polyline points={equityPoints} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" />
        
        {/* Axis Lines */}
        <line x1={PADDING.LEFT} y1={PADDING.TOP} x2={PADDING.LEFT} y2={HEIGHT - PADDING.BOTTOM} className="chart-axis-line" />
        <line x1={WIDTH - PADDING.RIGHT} y1={PADDING.TOP} x2={WIDTH - PADDING.RIGHT} y2={HEIGHT - PADDING.BOTTOM} className="chart-axis-line" />
        
        {/* Labels */}
        {xLabels.map((l, i) => <text key={i} x={l.x} y={l.y} className="chart-text chart-text--x">{l.text}</text>)}
        {leftTicks.map((l, i) => <text key={i} x={l.x} y={l.y} className="chart-text chart-text--y-left">{l.text}</text>)}
        {rightTicks.map((l, i) => <text key={i} x={l.x} y={l.y} className="chart-text chart-text--y-right">{l.text}</text>)}
      </svg>
      <div className="equity-chart__footer">
        <span style={{ color: "#22c55e", fontWeight: 600 }}>● 누적 수익률</span>
        <span style={{ color: "#e11d48", fontWeight: 600 }}>● 최대 낙폭</span>
      </div>
    </div>
  );
};

const PerformanceReport = ({ result }: { result: Backtest }) => {
  const curve = useMemo(() => buildDrawdownSeries(result.equity_curve ?? []), [result.equity_curve]);
  return (
    <div className="performance">
      <EquityChart data={curve} />
      <div className="performance__stats">
        {METRIC_LABELS.map(({ key, label, format }) => {
          const raw = result.metrics?.[key] ?? NaN;
          const text = format ? format(raw) : (Number.isNaN(raw) ? "-" : raw.toFixed(2));
          return (
            <div key={key} className="performance__stat">
              <div className="performance__stat-label">{label}</div>
              <span className="performance__stat-value">{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

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
      try { await onLogin(email, password); } catch {}
    } else {
      try { await onRegister(email, username, password); } catch {}
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

const Dashboard = ({
  strategies,
  backtests,
  onOpenBacktest,
  onNavigate,
}: {
  strategies: Strategy[];
  backtests: Backtest[];
  onOpenBacktest: (item: Backtest) => void;
  onNavigate: (page: PageKey) => void;
}) => {
  const strategyMap = useMemo(() => new Map(strategies.map((item) => [item.id, item])), [strategies]);
  const [sortMethod, setSortMethod] = useState<"latest" | "return">("latest");
  const [currentSlide, setCurrentSlide] = useState(0);

  // Sort backtests based on selected method
  const sortedBacktests = useMemo(() => {
    const list = [...backtests];
    if (sortMethod === "latest") {
      return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      return list.sort((a, b) => (b.metrics?.total_return ?? -999) - (a.metrics?.total_return ?? -999));
    }
  }, [backtests, sortMethod]);

  // Get top 3 for carousel
  const top3 = sortedBacktests.slice(0, 3);
  
  // Most recent one for KPI stats (Always latest regardless of sort)
  const latestBacktest = backtests.length > 0 
    ? [...backtests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] 
    : null;

  // Auto-play carousel
  useEffect(() => {
    const timer = setInterval(() => {
      if (top3.length > 1) setCurrentSlide((prev) => (prev + 1) % top3.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [top3.length]);

  return (
    <div className="page-section">
      {/* KPI Grid */}
      <div className="kpi-grid">
        <KPI label="투자 모델" value={strategies.length} sub="등록된 전략 수" onClick={() => onNavigate("strategies")} />
        <KPI
          label="대표 모델 누적 수익률"
          value={latestBacktest ? formatPercent(latestBacktest.metrics?.total_return) : "-"}
          sub={
            latestBacktest && latestBacktest.setting
              ? `${formatNumber(latestBacktest.setting.initial_capital)}원 | ${strategyMap.get(latestBacktest.strategy_id)?.name ?? ""} | ${latestBacktest.setting.start_date}~`
              : "데이터 없음"
          }
          onClick={() => onNavigate("strategies")}
        />
        <KPI
          label="최근 백테스트"
          value={latestBacktest ? latestBacktest.created_at.slice(0, 10) : "-"}
          sub={latestBacktest ? strategyMap.get(latestBacktest.strategy_id)?.name : "-"}
          onClick={() => onNavigate("backtests")}
        />
      </div>

      {/* Equity Curve Carousel */}
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
                return (
                  <div key={bt.id} className="carousel__slide">
                    <div className="carousel__metrics">
                      <div className="carousel__metric-row">전략: <span className="carousel__metric-value">{strategyMap.get(bt.strategy_id)?.name}</span></div>
                      <div className="carousel__metric-row">수익률: <span className="carousel__metric-value">{formatPercent(bt.metrics.total_return)}</span></div>
                      <div className="carousel__metric-row">MDD: <span className="carousel__metric-value">{formatPercent(bt.metrics.max_drawdown)}</span></div>
                    </div>
                    <EquityChart data={curve} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="placeholder">
            <div className="placeholder__icon">{ICONS.chart}</div>
            <p className="placeholder__text">최근 백테스트 결과가 없습니다.</p>
          </div>
        )}
      </Card>

      {/* Recent Backtests Table */}
      <Card title="최근 백테스트" icon={ICONS.beaker}>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>전략 이름</th>
                <th>백테스트 날짜</th>
                <th>설정</th>
                <th>CAGR</th>
                <th>MDD</th>
                <th>Sharpe</th>
                <th>보기</th>
              </tr>
            </thead>
            <tbody>
              {sortedBacktests.slice(0, 10).map((item) => {
                const strategy = strategyMap.get(item.strategy_id);
                return (
                  <tr key={item.id}>
                    <td>{strategy?.name ?? "-"}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{item.setting?.name ?? "-"}</td>
                    <td>{formatPercent(item.metrics?.cagr)}</td>
                    <td>{formatPercent(item.metrics?.max_drawdown)}</td>
                    <td>{item.metrics?.sharpe?.toFixed(2) ?? "-"}</td>
                    <td>
                      <Btn variant="ghost" onClick={() => onOpenBacktest(item)}>상세</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const StrategyBuilder = ({
  strategies,
  settings,
  onRunBacktest,
  onSaveStrategy,
  onSaveSetting,
}: {
  strategies: Strategy[];
  settings: BacktestSetting[];
  onRunBacktest: (params: { strategyId: string; settingId: string; mlModelId: string | null }) => Promise<Backtest>;
  onSaveStrategy: (params: { id?: string; name: string; description?: string | null; strategy_json: StrategyConfig }) => Promise<Strategy>;
  onSaveSetting: (params: Omit<BacktestSetting, "id" | "owner_id" | "created_at">) => Promise<BacktestSetting>;
}) => {
  const [strategyId, setStrategyId] = useState<string>(NEW_STRATEGY_ID);
  const [settingId, setSettingId] = useState<string>(settings.length > 0 ? settings[0].id : NEW_SETTING_ID);

  const [builderConfig, setBuilderConfig] = useState<StrategyConfig>(() => normalizeStrategyConfig(DEFAULT_STRATEGY_CONFIG));
  const [builderName, setBuilderName] = useState<string>("");
  const [builderDescription, setBuilderDescription] = useState<string>("");

  const [settingForm, setSettingForm] = useState({
    name: "기본 설정",
    market: "ALL",
    min_market_cap: 0,
    exclude_list: [] as string[],
    start_date: new Date(new Date().setFullYear(new Date().getFullYear() - 5)).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    initial_capital: 10000000,
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Backtest | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync Setting Form when settingId changes
  useEffect(() => {
    if (settingId === NEW_SETTING_ID) {
      setSettingForm({
        name: "", market: "ALL", min_market_cap: 0, exclude_list: [],
        start_date: "2020-01-01", end_date: "2023-12-31", initial_capital: 10000000,
      });
    } else {
      const found = settings.find((s) => s.id === settingId);
      if (found) {
        setSettingForm({
          name: found.name,
          market: found.market,
          min_market_cap: found.min_market_cap,
          exclude_list: found.exclude_list,
          start_date: found.start_date,
          end_date: found.end_date,
          initial_capital: found.initial_capital,
        });
      }
    }
  }, [settingId, settings]);

  // Sync Strategy Logic when strategyId changes
  const selectedStrategy = useMemo(() => (strategyId === NEW_STRATEGY_ID ? null : strategies.find((item) => item.id === strategyId) ?? null), [strategies, strategyId]);

  useEffect(() => {
    if (strategyId === NEW_STRATEGY_ID) {
      setBuilderConfig(normalizeStrategyConfig(DEFAULT_STRATEGY_CONFIG));
      setBuilderName("");
      setBuilderDescription("");
      setResult(null);
    } else if (selectedStrategy) {
      setBuilderConfig(normalizeStrategyConfig(selectedStrategy.strategy_json));
      setBuilderName(selectedStrategy.name);
      setBuilderDescription(selectedStrategy.description ?? "");
      setResult(null);
    }
  }, [strategyId, selectedStrategy]);

  const handleConfigChange = useCallback((next: StrategyConfig) => {
    setBuilderConfig(next);
    setResult(null);
    setSuccessMessage(null);
    setError(null);
  }, []);

  const handleSaveStrategy = async () => {
    if (!builderName.trim()) return setError("전략 이름을 입력하세요.");
    setSaving(true);
    try {
      const saved = await onSaveStrategy({
        id: strategyId === NEW_STRATEGY_ID ? undefined : strategyId,
        name: builderName,
        description: builderDescription,
        strategy_json: builderConfig,
      });
      setSuccessMessage("전략이 저장되었습니다.");
      setStrategyId(saved.id);
    } catch (e) {
      setError("전략 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCurrentSetting = async () => {
    if (!settingForm.name.trim()) return alert("설정 이름을 입력하세요");
    try {
      const saved = await onSaveSetting(settingForm);
      setSettingId(saved.id);
      alert("백테스트 설정이 저장되었습니다.");
    } catch (e) {
      alert("설정 저장 실패");
    }
  };

  const runBacktest = async () => {
    if (strategyId === NEW_STRATEGY_ID) return setError("저장된 전략을 선택하세요.");
    if (settingId === NEW_SETTING_ID) {
      if (!confirm("현재 설정이 저장되지 않았습니다. 저장 후 실행하시겠습니까?")) return;
      await handleSaveCurrentSetting();
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const data = await onRunBacktest({ strategyId, settingId, mlModelId: null });
      setResult(data);
    } catch (e) {
      setError("백테스트 실행 실패");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card
      title="전략 빌더"
      icon={ICONS.sliders}
      right={
        <div style={{ width: "220px" }}>
          <Select
            value={strategyId}
            onChange={setStrategyId}
            options={[{ label: "새 전략 만들기", value: NEW_STRATEGY_ID }, ...strategies.map((s) => ({ label: s.name, value: s.id }))]}
          />
        </div>
      }
    >
      <div className="builder-controls">
        <div className="builder-row builder-row--2">
          <label className="builder-field">
            <span className="builder-label">전략 이름</span>
            <Input value={builderName} onChange={(e) => setBuilderName(e.target.value)} />
          </label>
          <label className="builder-field">
            <span className="builder-label">설명</span>
            <Input value={builderDescription} onChange={(e) => setBuilderDescription(e.target.value)} />
          </label>
        </div>
        <div className="builder-buttons">
          <Btn variant="primary" onClick={handleSaveStrategy} disabled={saving}>
            {ICONS.save} 전략 저장
          </Btn>
        </div>
      </div>

      <div className="builder-layout" style={{ marginTop: "16px" }}>
        <div className="builder-main-row">
          <div className="builder-canvas">
            <StrategyBlocklyEditor value={builderConfig} onChange={handleConfigChange} />
          </div>

          <div className="builder-backtest builder-backtest--side">
            <div className="setting-form">
              <div className="setting-form__header">백테스트 조건 설정</div>
              <Select
                value={settingId}
                onChange={setSettingId}
                options={[{ label: "+ 새 설정", value: NEW_SETTING_ID }, ...settings.map((s) => ({ label: s.name, value: s.id }))]}
              />
              <Input placeholder="설정 이름" value={settingForm.name} onChange={(e) => setSettingForm({ ...settingForm, name: e.target.value })} />
              <div className="builder-row builder-row--2">
                <Select
                  value={settingForm.market}
                  onChange={(e) => setSettingForm({ ...settingForm, market: e })}
                  options={[{ label: "ALL", value: "ALL" }, { label: "KOSPI", value: "KOSPI" }, { label: "KOSDAQ", value: "KOSDAQ" }]}
                />
                <Input
                  type="number"
                  placeholder="최소 시총(억)"
                  value={settingForm.min_market_cap}
                  onChange={(e) => setSettingForm({ ...settingForm, min_market_cap: Number(e.target.value) })}
                />
              </div>
              <div className="builder-row builder-row--2">
                <Input type="date" value={settingForm.start_date} onChange={(e) => setSettingForm({ ...settingForm, start_date: e.target.value })} />
                <Input type="date" value={settingForm.end_date} onChange={(e) => setSettingForm({ ...settingForm, end_date: e.target.value })} />
              </div>
              <Input
                type="number"
                placeholder="초기 자본"
                value={settingForm.initial_capital}
                onChange={(e) => setSettingForm({ ...settingForm, initial_capital: Number(e.target.value) })}
              />
              <div className="builder-buttons">
                <Btn variant="secondary" onClick={handleSaveCurrentSetting}>
                  설정 저장
                </Btn>
                <Btn variant="primary" onClick={runBacktest} disabled={isRunning}>
                  {isRunning ? "실행 중..." : "백테스트 실행"}
                </Btn>
              </div>
            </div>

            {error && <div className="alert alert--error">{error}</div>}
            {successMessage && <div className="alert alert--success">{successMessage}</div>}
            {result && <PerformanceReport result={result} />}
          </div>
        </div>
      </div>
    </Card>
  );
};

const BacktestsPage = ({ backtests, strategies, onSelect }: { backtests: Backtest[]; strategies: Strategy[]; onSelect: (item: Backtest) => void }) => {
  const ITEMS_PER_PAGE = 10;
  const [page, setPage] = useState(1);
  const strategyMap = useMemo(() => new Map(strategies.map((s) => [s.id, s])), [strategies]);

  const sorted = useMemo(() => [...backtests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [backtests]);
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const rows = sorted.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <div className="page-section">
      <Card title="백테스트 내역" icon={ICONS.beaker}>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>전략</th>
                <th>설정명</th>
                <th>기간</th>
                <th>CAGR</th>
                <th>MDD</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{strategyMap.get(item.strategy_id)?.name ?? "-"}</td>
                  <td>{item.setting?.name ?? "-"}</td>
                  <td>
                    {toDateLabel(item.start_date)} ~ {toDateLabel(item.end_date)}
                  </td>
                  <td>{formatPercent(item.metrics?.cagr)}</td>
                  <td>{formatPercent(item.metrics?.max_drawdown)}</td>
                  <td>
                    <Btn variant="ghost" onClick={() => onSelect(item)}>
                      자세히
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="pagination__btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              이전
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button className="pagination__btn" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              다음
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};

const MyStrategies = ({
  strategies,
  backtests,
  onDelete,
}: {
  strategies: Strategy[];
  backtests: Backtest[];
  settings: BacktestSetting[];
  onRename: (id: string, name: string) => Promise<void>;
  onClone: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareTargets, setCompareTargets] = useState<{ left: Backtest; right: Backtest } | null>(null);

  const getBestBacktestForStrategy = (strategyId: string) => {
    const related = backtests.filter((b) => b.strategy_id === strategyId);
    if (related.length === 0) return null;
    return related.sort((a, b) => (b.metrics?.total_return ?? 0) - (a.metrics?.total_return ?? 0))[0];
  };

  const handleCompareClick = () => {
    if (selectedIds.length !== 2) return;
    const bt1 = getBestBacktestForStrategy(selectedIds[0]);
    const bt2 = getBestBacktestForStrategy(selectedIds[1]);
    if (!bt1 || !bt2) {
      alert("비교할 백테스트 결과가 부족한 전략이 포함되어 있습니다.");
      return;
    }
    setCompareTargets({ left: bt1, right: bt2 });
  };

  return (
    <div className="strategy-list">
      <div className="strategy-list__toolbar">
        <span className="strategy-list__hint">비교할 전략 2개를 선택하세요.</span>
        <Btn variant="primary" onClick={handleCompareClick} disabled={selectedIds.length !== 2}>
          전략 비교
        </Btn>
      </div>

      <div className="strategy-grid">
        {strategies.map((item) => {
          const best = getBestBacktestForStrategy(item.id);
          const selected = selectedIds.includes(item.id);
          return (
            <Card
              key={item.id}
              title={item.name}
              right={
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => setSelectedIds((prev) => (prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id].slice(0, 2)))}
                />
              }
            >
              <div className="strategy-ytd">최고 수익률: {formatPercent(best?.metrics?.total_return)}</div>
              <div className="card__meta">조건: {best?.setting?.name ?? "없음"}</div>
              <div className="strategy-actions">
                <Btn variant="ghost" onClick={() => onDelete(item.id)}>
                  삭제
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={!!compareTargets} onClose={() => setCompareTargets(null)} title="전략 비교">
        {compareTargets && (
          <div className="compare-grid">
            <div className="compare-grid__column">
              <h4>전략 A ({compareTargets.left.setting?.name})</h4>
              <PerformanceReport result={compareTargets.left} />
            </div>
            <div className="compare-grid__column">
              <h4>전략 B ({compareTargets.right.setting?.name})</h4>
              <PerformanceReport result={compareTargets.right} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// -----------------------------------------------------------------------------
// App Root
// -----------------------------------------------------------------------------

const App = () => {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [tokens, setTokensState] = useState<AuthTokens | null>(() => {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [settings, setSettings] = useState<BacktestSetting[]>([]);
  const [, setCommunityItems] = useState<CommunityFeedItem[]>([]);
  const [selectedBacktest, setSelectedBacktest] = useState<Backtest | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setTokens = useCallback((next: AuthTokens | null) => {
    setTokensState(next);
    if (next) localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      if (tokens?.accessToken) headers.set("Authorization", `Bearer ${tokens.accessToken}`);
      return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    },
    [tokens]
  );

  // Normalize Backtest (ensure numbers)
  const normalizeBacktest = useCallback((item: Backtest): Backtest => {
    const initialCapital = Number(item.initial_capital);
    const equityCurve = Array.isArray(item.equity_curve)
      ? item.equity_curve.map((point) => ({
          date: String(point.date),
          equity: Number(point.equity),
          drawdown: point.drawdown,
        }))
      : [];
    return {
      ...item,
      initial_capital: Number.isFinite(initialCapital) ? initialCapital : 0,
      equity_curve: equityCurve,
    };
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sRes, bRes, setRes, cRes] = await Promise.all([
        apiFetch("/strategies?limit=100"),
        apiFetch("/backtests?limit=100"),
        apiFetch("/backtest-settings?limit=100"),
        apiFetch("/community/posts"),
      ]);
      if (sRes.ok) setStrategies(((await sRes.json()) as StrategyListResponse).items);
      if (bRes.ok) setBacktests(((await bRes.json()) as BacktestListResponse).items.map(normalizeBacktest));
      if (setRes.ok) setSettings(((await setRes.json()) as BacktestSettingListResponse).items);
      if (cRes.ok) setCommunityItems(((await cRes.json()) as CommunityListResponse).items);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, normalizeBacktest]);

  useEffect(() => {
    if (tokens) loadData();
  }, [tokens, loadData]);

  const handleLogin = async (e: string, p: string) => {
    const body = new URLSearchParams();
    body.set("username", e);
    body.set("password", p);
    const res = await fetch(`${API_BASE_URL}/auth/login`, { method: "POST", body });
    if (!res.ok) throw new Error("Login Failed");
    const data = await res.json();
    setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
  };

  const handleRunBacktest = async (params: any) => {
    const res = await apiFetch("/backtests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy_id: params.strategyId,
        setting_id: params.settingId,
        ml_model_id: params.mlModelId,
      }),
    });
    if (!res.ok) throw new Error("Run Failed");
    const data = await res.json();
    const normalized = normalizeBacktest(data);
    setBacktests((prev) => [normalized, ...prev]);
    return normalized;
  };

  const handleSaveStrategy = async (params: any) => {
    const method = params.id ? "PUT" : "POST";
    const path = params.id ? `/strategies/${params.id}` : "/strategies";
    const res = await apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error("Save Failed");
    const saved = await res.json();
    setStrategies((prev) => (params.id ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev]));
    return saved;
  };

  const handleSaveSetting = async (params: any) => {
    const res = await apiFetch("/backtest-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error("Save Setting Failed");
    const saved = await res.json();
    setSettings((prev) => [saved, ...prev]);
    return saved;
  };

  if (!tokens) return <AuthForm onLogin={handleLogin} onRegister={async () => {}} error={null} loading={false} />;

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header__inner">
          <div className="brand">QuantiMizer</div>
          <nav className="nav-tabs">
            {navTabs.map((t) => (
              <button key={t.id} className={`nav-tab ${page === t.id ? "nav-tab--active" : ""}`} onClick={() => setPage(t.id)}>
                <span className="nav-tab__icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <button className="logout-button" onClick={() => setTokens(null)}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="main-content">
        {isLoading && <div className="alert alert--info">Loading...</div>}
        {page === "dashboard" && (
          <Dashboard strategies={strategies} backtests={backtests} onOpenBacktest={setSelectedBacktest} onNavigate={setPage} />
        )}
        {page === "builder" && (
          <StrategyBuilder
            strategies={strategies}
            settings={settings}
            onRunBacktest={handleRunBacktest}
            onSaveStrategy={handleSaveStrategy}
            onSaveSetting={handleSaveSetting}
          />
        )}
        {page === "backtests" && <BacktestsPage backtests={backtests} strategies={strategies} onSelect={setSelectedBacktest} />}
        {page === "strategies" && (
          <MyStrategies
            strategies={strategies}
            backtests={backtests}
            settings={settings}
            onRename={async () => {}}
            onClone={async () => {}}
            onDelete={async () => {}}
          />
        )}
      </main>
      <Modal open={!!selectedBacktest} onClose={() => setSelectedBacktest(null)} title="백테스트 상세">
        {selectedBacktest && <PerformanceReport result={selectedBacktest} />}
      </Modal>
    </div>
  );
};

export default App;