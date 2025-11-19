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

type PageKey =
  | "dashboard"
  | "builder"
  | "backtests"
  | "strategies"
  | "models"
  | "community"
  | "settings";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

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
  start_date: string;
  end_date: string;
  initial_capital: number;
  ml_model_id: string | null;
  equity_curve: EquityPoint[];
  metrics: Record<string, number>;
  created_at: string;
}

interface MLModelItem {
  id: string;
  name: string;
  created_at: string;
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

interface ModelListResponse {
  items: MLModelItem[];
}

interface CommunityListResponse {
  items: CommunityFeedItem[];
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_STORAGE_KEY = "quantimizer.tokens";
const NEW_STRATEGY_ID = "__new__";

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
};

const navTabs: Array<{ id: PageKey; label: string; icon: string }> = [
  { id: "dashboard", label: "대시보드", icon: ICONS.home },
  { id: "builder", label: "전략 빌더", icon: ICONS.sliders },
  { id: "backtests", label: "백테스트", icon: ICONS.beaker },
  { id: "strategies", label: "내 전략", icon: ICONS.layers },
  { id: "community", label: "커뮤니티", icon: ICONS.share },
  { id: "settings", label: "설정", icon: ICONS.settings },
];

const Btn = ({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => (
  <button
    type="button"
    className={`btn btn--${variant} ${className}`.trim()}
    {...props}
  >
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
          {icon && (
            <span className="card__icon" aria-hidden>
              {icon}
            </span>
          )}
          <span>{title}</span>
        </div>
        {right && <div className="card__right">{right}</div>}
      </header>
    )}
    <div className="card__body">{children}</div>
  </section>
);

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <label className="field">
    <span className="field__label">{label}</span>
    {children}
    {hint && <span className="field__hint">{hint}</span>}
  </label>
);

const Input = ({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) => (
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
    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
      onChange(event.target.value)
    }
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const Switch = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <button
    type="button"
    className={`switch ${checked ? "switch--on" : "switch--off"}`}
    onClick={() => onChange(!checked)}
    aria-pressed={checked}
  >
    <span className="switch__thumb" />
  </button>
);

const Modal = ({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onClose} role="presentation" />
      <div className="modal__content" role="dialog" aria-modal="true">
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
};

const formatNumber = (value: number) => value.toLocaleString("ko-KR");

const formatPercent = (
  value: number | null | undefined,
  fractionDigits = 2
) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(fractionDigits)}%`;
};

const toDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
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

const getStrategyTags = (strategy: Strategy): string[] => {
  const raw = strategy.strategy_json?.factors;
  if (!Array.isArray(raw)) {
    return [];
  }
  const tags = raw
    .map((item) => {
      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name: unknown }).name);
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(tags)).slice(0, 4);
};

const METRIC_LABELS: Array<{
  key: string;
  label: string;
  format?: (value: number) => string;
}> = [
  {
    key: "total_return",
    label: "누적 수익률",
    format: (value: number) => formatPercent(value, 2),
  },
  {
    key: "cagr",
    label: "CAGR",
    format: (value: number) => formatPercent(value, 2),
  },
  {
    key: "max_drawdown",
    label: "최대 낙폭",
    format: (value: number) => formatPercent(value, 2),
  },
  {
    key: "volatility",
    label: "연환산 변동성",
    format: (value: number) => formatPercent(value, 2),
  },
  {
    key: "sharpe",
    label: "Sharpe Ratio",
    format: (value: number) => value.toFixed(2),
  },
];

const AuthForm = ({
  onLogin,
  onRegister,
  error,
  loading,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (
    email: string,
    username: string,
    password: string
  ) => Promise<void>;
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
      try {
        await onLogin(email, password);
      } catch {
        // handled by parent
      }
      return;
    }

    try {
      await onRegister(email, username, password);
    } catch {
      // handled by parent
    }
  };

  return (
    <div className="auth-card">
      <h1 className="auth-card__title">QuantiMizer</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-form__field">
          <span>이메일</span>
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {mode === "register" && (
          <label className="auth-form__field">
            <span>닉네임</span>
            <Input
              type="text"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
        )}
        <label className="auth-form__field">
          <span>비밀번호</span>
          <Input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <div className="alert alert--error auth-form__alert">
            {ICONS.info} {error}
          </div>
        )}
        <Btn
          type="submit"
          variant="primary"
          className="auth-form__submit"
          disabled={loading}
        >
          {loading ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
        </Btn>
        <button
          type="button"
          className="auth-form__toggle"
          onClick={() =>
            setMode((prev) => (prev === "login" ? "register" : "login"))
          }
        >
          {mode === "login"
            ? "계정이 없으신가요? 회원가입"
            : "이미 계정이 있으신가요? 로그인"}
        </button>
      </form>
    </div>
  );
};

interface SimpleLineChartProps {
  data: Array<{ label: string; [key: string]: number | string }>;
  series: Array<{ key: string; color: string; label: string }>;
}

const SimpleLineChart = ({ data, series }: SimpleLineChartProps) => {
  const { points, min, max } = useMemo(() => {
    if (data.length === 0 || series.length === 0) {
      return {
        points: [] as Array<{ key: string; value: string }>,
        min: 0,
        max: 1,
      };
    }

    const numericValues: number[] = [];
    data.forEach((item) => {
      series.forEach(({ key }) => {
        const raw = item[key];
        if (typeof raw === "number") {
          numericValues.push(raw);
        }
      });
    });

    if (numericValues.length === 0) {
      return { points: [], min: 0, max: 1 };
    }

    const minValue = Math.min(...numericValues);
    const maxValue = Math.max(...numericValues);
    const denominator = maxValue - minValue || 1;

    const computed = series.map(({ key }) => {
      const polyline = data
        .map((item, index) => {
          const raw = item[key];
          if (typeof raw !== "number") {
            return "";
          }
          const x = (index / Math.max(1, data.length - 1)) * 100;
          const normalized = (raw - minValue) / denominator;
          const y = 100 - normalized * 100;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .filter(Boolean)
        .join(" ");
      return { key, value: polyline };
    });

    return { points: computed, min: minValue, max: maxValue };
  }, [data, series]);

  return (
    <div className="line-chart">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Equity chart"
      >
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill="var(--chart-background)"
        />
        <line x1="0" y1="100" x2="100" y2="100" className="line-chart__axis" />
        <line x1="0" y1="0" x2="0" y2="100" className="line-chart__axis" />
        {points.map(({ key, value }) => {
          const color =
            series.find((item) => item.key === key)?.color ?? "#2563eb";
          return (
            <polyline
              key={key}
              points={value}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
            />
          );
        })}
      </svg>
      <div className="line-chart__legend">
        {series.map((item) => (
          <span key={item.key} className="line-chart__legend-item">
            <span
              className="line-chart__legend-dot"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="line-chart__range">
        범위: {min.toFixed(2)} ~ {max.toFixed(2)}
      </div>
    </div>
  );
};

const EquityChart = ({ data }: { data: EquityPoint[] }) => {
  // 차트 설정 (SVG 내부 좌표계)
  const WIDTH = 800;
  const HEIGHT = 400;
  const PADDING = { TOP: 20, BOTTOM: 30, LEFT: 60, RIGHT: 60 };
  const CHART_W = WIDTH - PADDING.LEFT - PADDING.RIGHT;
  const CHART_H = HEIGHT - PADDING.TOP - PADDING.BOTTOM;

  const {
    equityPoints,
    drawdownPoints,
    xLabels,
    leftTicks,
    rightTicks,
    gridLines,
  } = useMemo(() => {
    if (data.length === 0) {
      return {
        equityPoints: "",
        drawdownPoints: "",
        xLabels: [],
        leftTicks: [],
        rightTicks: [],
        gridLines: [],
      };
    }

    // 1. 데이터 가공
    // Equity(금액) -> Return(%) 변환
    const initialEquity = data[0].equity || 1;
    const returns = data.map((d) => (d.equity - initialEquity) / initialEquity);
    const drawdowns = data.map((d) => d.drawdown ?? 0); // 0 ~ -0.xx

    // 2. Min/Max 계산
    const minRet = Math.min(...returns);
    const maxRet = Math.max(...returns);
    const minDd = Math.min(...drawdowns);
    // Drawdown은 보통 0이 최대(낙폭 없음)
    const maxDd = 0; 

    // 여유 공간 확보 (위아래 5% 정도)
    const retRange = maxRet - minRet || 1;
    const ddRange = maxDd - minDd || 1;
    
    // Y축 스케일링 (Linear Interpolation)
    // val -> pixel Y
    const getYRet = (val: number) => {
      const ratio = (val - minRet) / retRange;
      // SVG는 y가 아래로 갈수록 커지므로 (1 - ratio)
      return PADDING.TOP + CHART_H * (1 - ratio);
    };
    
    const getYDd = (val: number) => {
      const ratio = (val - minDd) / ddRange;
      return PADDING.TOP + CHART_H * (1 - ratio);
    };

    // X축 스케일링
    const getX = (index: number) => {
      return PADDING.LEFT + (index / (data.length - 1)) * CHART_W;
    };

    // 3. Polyline 포인트 생성
    const equityPointsStr = returns
      .map((val, i) => `${getX(i).toFixed(1)},${getYRet(val).toFixed(1)}`)
      .join(" ");

    const drawdownPointsStr = drawdowns
      .map((val, i) => `${getX(i).toFixed(1)},${getYDd(val).toFixed(1)}`)
      .join(" ");

    // 4. X축 라벨 (날짜) - 5~6개 정도만 표시
    const xLabelCount = 6;
    const xLabels = [];
    for (let i = 0; i < xLabelCount; i++) {
      const index = Math.round((i * (data.length - 1)) / (xLabelCount - 1));
      if (data[index]) {
        xLabels.push({
          x: getX(index),
          y: HEIGHT - 5, // 바닥 부근
          text: toDateLabel(data[index].date),
        });
      }
    }

    // 5. Y축 라벨 및 그리드 (왼쪽: 수익률) - 5개 구간
    const yTickCount = 5;
    const leftTicks = [];
    const gridLines = [];
    for (let i = 0; i < yTickCount; i++) {
      const ratio = i / (yTickCount - 1);
      const val = minRet + ratio * retRange;
      const y = getYRet(val);
      leftTicks.push({
        x: PADDING.LEFT - 10,
        y: y + 4, // 텍스트 수직 중앙 정렬 보정
        text: `${(val * 100).toFixed(1)}%`,
      });
      // 가로 그리드 라인
      gridLines.push(y);
    }

    // 6. Y축 라벨 (오른쪽: 낙폭) - 5개 구간
    const rightTicks = [];
    for (let i = 0; i < yTickCount; i++) {
      const ratio = i / (yTickCount - 1);
      const val = minDd + ratio * ddRange;
      const y = getYDd(val);
      rightTicks.push({
        x: WIDTH - PADDING.RIGHT + 10,
        y: y + 4,
        text: `${(val * 100).toFixed(1)}%`,
      });
    }

    return {
      equityPoints: equityPointsStr,
      drawdownPoints: drawdownPointsStr,
      xLabels,
      leftTicks,
      rightTicks,
      gridLines,
    };
  }, [data]);

  return (
    <div className="equity-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        {/* 배경 */}
        <rect width={WIDTH} height={HEIGHT} fill="var(--chart-background)" opacity={0.3} />
        
        {/* 그리드 라인 */}
        {gridLines.map((y, i) => (
          <line
            key={i}
            x1={PADDING.LEFT}
            y1={y}
            x2={WIDTH - PADDING.RIGHT}
            y2={y}
            className="chart-grid"
          />
        ))}

        {/* 데이터 라인 - Drawdown (뒤) */}
        <polyline
          points={drawdownPoints}
          fill="none"
          stroke="rgba(244, 63, 94, 0.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* 데이터 라인 - Equity (앞) */}
        <polyline
          points={equityPoints}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* 축 선 (Y축 좌/우) */}
        <line 
          x1={PADDING.LEFT} y1={PADDING.TOP} 
          x2={PADDING.LEFT} y2={HEIGHT - PADDING.BOTTOM} 
          className="chart-axis-line" 
        />
        <line 
          x1={WIDTH - PADDING.RIGHT} y1={PADDING.TOP} 
          x2={WIDTH - PADDING.RIGHT} y2={HEIGHT - PADDING.BOTTOM} 
          className="chart-axis-line" 
        />

        {/* X축 텍스트 */}
        {xLabels.map((label, i) => (
          <text key={i} x={label.x} y={label.y} className="chart-text chart-text--x">
            {label.text}
          </text>
        ))}

        {/* Y축 왼쪽 텍스트 (Return) */}
        {leftTicks.map((tick, i) => (
          <text key={i} x={tick.x} y={tick.y} className="chart-text chart-text--y-left">
            {tick.text}
          </text>
        ))}

        {/* Y축 오른쪽 텍스트 (Drawdown) */}
        {rightTicks.map((tick, i) => (
          <text key={i} x={tick.x} y={tick.y} className="chart-text chart-text--y-right">
            {tick.text}
          </text>
        ))}
      </svg>

      <div className="equity-chart__footer">
        <span style={{ color: "#22c55e", fontWeight: 600 }}>● 누적 수익률</span>
        <span style={{ color: "#e11d48", fontWeight: 600 }}>● 최대 낙폭</span>
      </div>
    </div>
  );
};

const PerformanceReport = ({ result }: { result: Backtest }) => {
  const curve = useMemo(
    () => buildDrawdownSeries(result.equity_curve ?? []),
    [result.equity_curve]
  );

  return (
    <div className="performance">
      <EquityChart data={curve} />

      <div className="performance__stats">
        {METRIC_LABELS.map(({ key, label, format }) => {
          const raw = result.metrics?.[key as keyof typeof result.metrics];
          const value = typeof raw === "number" ? raw : NaN;
          const text = format
            ? format(value)
            : Number.isNaN(value)
            ? "-"
            : value.toFixed(2);

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
  const strategyMap = useMemo(
    () => new Map(strategies.map((item) => [item.id, item])),
    [strategies]
  );
  const sortedBacktests = useMemo(
    () =>
      [...backtests].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [backtests]
  );
  const latestBacktest = sortedBacktests[0];

  const chartData = useMemo(() => {
    if (!latestBacktest || !latestBacktest.equity_curve?.length) {
      return [];
    }
    const base = latestBacktest.equity_curve[0]?.equity ?? 1;
    if (!base) {
      return [];
    }
    return latestBacktest.equity_curve.map((point) => ({
      label: toDateLabel(point.date),
      strategy: (point.equity / base) * 100,
    }));
  }, [latestBacktest]);

  const strategyName = latestBacktest
    ? strategyMap.get(latestBacktest.strategy_id)?.name ?? "-"
    : "-";
  const kpiBacktest = latestBacktest ? `${latestBacktest.id}` : "-";
  const kpiStrategy = latestBacktest ? strategyName : "-";
  const ytd = latestBacktest?.metrics?.total_return;

  return (
    <div className="page-section">
      <div className="kpi-grid">
        <KPI
          label="투자 모델"
          value={strategies.length}
          sub="등록된 전략 수"
          onClick={() => onNavigate("strategies")}
        />
        <KPI
          label="대표 모델 누적 수익률"
          value={latestBacktest ? formatPercent(ytd ?? null) : "-"}
          onClick={() => onNavigate("strategies")}
        />
        <KPI
          label="최근 백테스트"
          value={kpiBacktest}
          sub={kpiStrategy}
          onClick={() => onNavigate("backtests")}
        />
      </div>

      <Card title="대표 전략 에쿼티 커브" icon={ICONS.chart}>
        {chartData.length > 0 ? (
          <SimpleLineChart
            data={chartData}
            series={[{ key: "strategy", color: "#2563eb", label: "Strategy" }]}
          />
        ) : (
          <div className="placeholder">
            <div className="placeholder__icon">{ICONS.chart}</div>
            <p className="placeholder__text">최근 백테스트 결과가 없습니다.</p>
          </div>
        )}
      </Card>

      <Card title="최근 백테스트" icon={ICONS.beaker}>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>전략</th>
                <th>기간</th>
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
                    <td className="mono">{item.id}</td>
                    <td>{strategy?.name ?? "-"}</td>
                    <td>
                      {toDateLabel(item.start_date)} ~{" "}
                      {toDateLabel(item.end_date)}
                    </td>
                    <td>{formatPercent(item.metrics?.cagr ?? null)}</td>
                    <td>{formatPercent(item.metrics?.max_drawdown ?? null)}</td>
                    <td>
                      {typeof item.metrics?.sharpe === "number"
                        ? item.metrics.sharpe.toFixed(2)
                        : "-"}
                    </td>
                    <td>
                      <Btn variant="ghost" onClick={() => onOpenBacktest(item)}>
                        상세
                      </Btn>
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

const KPI = ({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
}) => (
  <div className={`kpi ${onClick ? "kpi--clickable" : ""}`} onClick={onClick}>
    <span className="kpi__label">{label}</span>
    <span className="kpi__value">{value}</span>
    {sub && <span className="kpi__sub">{sub}</span>}
  </div>
);

const StrategyBuilder = ({
  strategies,
  onRunBacktest,
  onSaveStrategy,
}: {
  strategies: Strategy[];
  models: MLModelItem[];
  onRunBacktest: (params: {
    strategyId: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
    mlModelId: string | null;
  }) => Promise<Backtest>;
  onSaveStrategy: (params: {
    id?: string;
    name: string;
    description?: string | null;
    strategy_json: StrategyConfig;
  }) => Promise<Strategy>;
}) => {
  const [strategyId, setStrategyId] = useState<string>(NEW_STRATEGY_ID);
  const [start, setStart] = useState<string>(() =>
    new Date(new Date().setFullYear(new Date().getFullYear() - 5))
      .toISOString()
      .slice(0, 10)
  );
  const [end, setEnd] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [capital, setCapital] = useState<number>(10_000_000);
  const [builderConfig, setBuilderConfig] = useState<StrategyConfig>(() =>
    normalizeStrategyConfig(DEFAULT_STRATEGY_CONFIG)
  );
  const [builderName, setBuilderName] = useState<string>("");
  const [builderDescription, setBuilderDescription] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingStrategyId, setPendingStrategyId] = useState<string | null>(
    null
  );
  const [result, setResult] = useState<Backtest | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (strategyId === NEW_STRATEGY_ID) {
      return;
    }
    const exists = strategies.some((item) => item.id === strategyId);
    if (exists) {
      if (pendingStrategyId === strategyId) {
        setPendingStrategyId(null);
      }
      return;
    }
    if (pendingStrategyId === strategyId) {
      return;
    }
    if (strategies.length === 0) {
      setStrategyId(NEW_STRATEGY_ID);
    } else {
      setStrategyId(strategies[0].id);
    }
  }, [strategies, strategyId, pendingStrategyId]);

  const selectedStrategy = useMemo(
    () =>
      strategyId === NEW_STRATEGY_ID
        ? null
        : strategies.find((item) => item.id === strategyId) ?? null,
    [strategies, strategyId]
  );

  useEffect(() => {
    if (strategyId === NEW_STRATEGY_ID) {
      setBuilderConfig(normalizeStrategyConfig(DEFAULT_STRATEGY_CONFIG));
      setBuilderName("");
      setBuilderDescription("");
      setResult(null);
      setSuccessMessage(null);
      setError(null);
      return;
    }
    if (selectedStrategy) {
      setBuilderConfig(normalizeStrategyConfig(selectedStrategy.strategy_json));
      setBuilderName(selectedStrategy.name);
      setBuilderDescription(selectedStrategy.description ?? "");
      setResult(null);
      setSuccessMessage(null);
      setError(null);
      if (pendingStrategyId === selectedStrategy.id) {
        setPendingStrategyId(null);
      }
    }
  }, [strategyId, selectedStrategy, pendingStrategyId]);

  const handleConfigChange = useCallback(
    (next: StrategyConfig) => {
      setBuilderConfig(next);
      setResult(null);
      setSuccessMessage(null);
      setError(null);
    },
    [setBuilderConfig, setResult, setSuccessMessage, setError]
  );

  const handleCapitalChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    setCapital(Number.isFinite(next) ? next : 0);
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBuilderName(event.target.value);
    setSuccessMessage(null);
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBuilderDescription(event.target.value);
    setSuccessMessage(null);
  };

  const handleStrategySelect = (id: string) => {
    setPendingStrategyId(null);
    setStrategyId(id);
  };

  const handleExport = () => {
    const exportName = (
      builderName.trim() ||
      selectedStrategy?.name ||
      "strategy"
    ).replace(/\s+/g, "_");
    const blob = new Blob([JSON.stringify(builderConfig, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    const name = builderName.trim();
    if (name === "") {
      setError("전략 이름을 입력하세요.");
      setSuccessMessage(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const saved = await onSaveStrategy({
        id: strategyId === NEW_STRATEGY_ID ? undefined : strategyId,
        name,
        description:
          builderDescription.trim() === "" ? null : builderDescription.trim(),
        strategy_json: builderConfig,
      });
      setSuccessMessage("전략이 저장되었습니다.");
      setPendingStrategyId(saved.id);
      setStrategyId(saved.id);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "전략을 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  const runBacktest = async () => {
    if (!strategyId || strategyId === NEW_STRATEGY_ID) {
      setError("백테스트를 실행하려면 저장된 전략을 선택하세요.");
      setSuccessMessage(null);
      return;
    }
    setIsRunning(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const data = await onRunBacktest({
        strategyId,
        startDate: start,
        endDate: end,
        initialCapital: capital,
        mlModelId: null,
      });
      setResult(data);
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "백테스트 실행 중 문제가 발생했습니다."
      );
    } finally {
      setIsRunning(false);
    }
  };

  const strategyOptions = useMemo(
    () => [
      { label: "새 전략 만들기", value: NEW_STRATEGY_ID },
      ...strategies.map((item) => ({ label: item.name, value: item.id })),
    ],
    [strategies]
  );

  // 전략 불러오기 셀렉터 (상위 헤더용)
  const strategyLoader = (
    <div style={{ width: "220px" }}>
      <Select
        value={strategyId}
        onChange={handleStrategySelect}
        options={strategyOptions}
      />
    </div>
  );

  return (
    <Card title="전략 빌더" icon={ICONS.sliders} right={strategyLoader}>
      {/* 상단 Controls */}
      <div className="builder-controls">
        {/* Row 1: Name, Description, Capital */}
        <div className="builder-row builder-row--3">
          <label className="builder-field">
            <span className="builder-label">전략 이름</span>
            <Input
              value={builderName}
              onChange={handleNameChange}
              placeholder="예: 가치 + 퀄리티 전략"
            />
          </label>
          <label className="builder-field">
            <span className="builder-label">설명</span>
            <Input
              value={builderDescription}
              onChange={handleDescriptionChange}
              placeholder="전략 특징을 요약하세요"
            />
          </label>
          <label className="builder-field">
            <span className="builder-label">초기 자금</span>
            <Input
              type="number"
              min={0}
              step={1000000}
              value={capital}
              onChange={handleCapitalChange}
            />
          </label>
        </div>

        {/* Row 2: Start Date, End Date */}
        <div className="builder-row builder-row--2">
          <label className="builder-field">
            <span className="builder-label">시작일</span>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="builder-field">
            <span className="builder-label">종료일</span>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        {/* 버튼 그룹 */}
        <div className="builder-buttons">
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중…" : `${ICONS.save} 전략 저장`}
          </Btn>
          <Btn variant="ghost" onClick={handleExport}>
            {ICONS.download}
            JSON 내보내기
          </Btn>
          <Btn
            variant="secondary"
            onClick={runBacktest}
            disabled={isRunning || strategyId === NEW_STRATEGY_ID}
          >
            {isRunning ? "실행 중." : `${ICONS.play} 백테스트 실행`}
          </Btn>
        </div>
      </div>

      {/* 하단: 좌측 Blockly / 우측 백테스트 결과 */}
      <div className="builder-layout" style={{ marginTop: "16px" }}>
        <div className="builder-main-row">
          <div className="builder-canvas">
            <StrategyBlocklyEditor
              value={builderConfig}
              onChange={handleConfigChange}
            />
          </div>

          <div className="builder-backtest builder-backtest--side">
            {error && (
              <div className="alert alert--error builder-alert">
                {ICONS.info} {error}
              </div>
            )}
            {successMessage && (
              <div className="alert alert--success builder-alert">
                {successMessage}
              </div>
            )}

            {result ? (
              <PerformanceReport result={result} />
            ) : (
              <div className="placeholder placeholder--compact">
                <div className="placeholder__icon">{ICONS.beaker}</div>
                <p className="placeholder__text">
                  좌측에서 전략을 구성하고, 위에서 기간과 초기 자금을 설정한 뒤
                  백테스트를 실행해 보세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

const BacktestsPage = ({
  backtests,
  strategies,
  onSelect,
}: {
  backtests: Backtest[];
  strategies: Strategy[];
  onSelect: (item: Backtest) => void;
}) => {
  const strategyMap = useMemo(
    () => new Map(strategies.map((item) => [item.id, item])),
    [strategies]
  );
  const rows = useMemo(
    () =>
      [...backtests].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [backtests]
  );

  return (
    <div className="page-section">
      <Card title="백테스트 내역" icon={ICONS.beaker}>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>전략</th>
                <th>기간</th>
                <th>초기자금</th>
                <th>CAGR</th>
                <th>MDD</th>
                <th>Sharpe</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const strategy = strategyMap.get(item.strategy_id);
                return (
                  <tr key={item.id}>
                    <td className="mono">{item.id}</td>
                    <td>{strategy?.name ?? "-"}</td>
                    <td>
                      {toDateLabel(item.start_date)} ~{" "}
                      {toDateLabel(item.end_date)}
                    </td>
                    <td>₩{formatNumber(Number(item.initial_capital) || 0)}</td>
                    <td>{formatPercent(item.metrics?.cagr ?? null)}</td>
                    <td>{formatPercent(item.metrics?.max_drawdown ?? null)}</td>
                    <td>
                      {typeof item.metrics?.sharpe === "number"
                        ? item.metrics.sharpe.toFixed(2)
                        : "-"}
                    </td>
                    <td>
                      <Btn variant="ghost" onClick={() => onSelect(item)}>
                        자세히
                      </Btn>
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

const MyStrategies = ({
  strategies,
  backtests,
  onRename,
  onDelete,
}: {
  strategies: Strategy[];
  backtests: Backtest[];
  onRename: (id: string, name: string) => Promise<void>;
  onClone: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) => {
  const backtestsByStrategy = useMemo(() => {
    const map = new Map<string, Backtest[]>();
    backtests.forEach((item) => {
      const list = map.get(item.strategy_id) ?? [];
      list.push(item);
      map.set(item.strategy_id, list);
    });
    map.forEach((list, key) => {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      map.set(key, list);
    });
    return map;
  }, [backtests]);

  // 비교용 선택 상태
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareTargets, setCompareTargets] = useState<{
    left: Backtest;
    right: Backtest;
  } | null>(null);
  const [viewStrategy, setViewStrategy] = useState<{
    strategy: Strategy;
    returnVal: number | null;
  } | null>(null);

  const handleRenameClick = async (id: string, currentName: string) => {
    const next = window.prompt("새 전략 이름을 입력하세요.", currentName);
    if (!next || next.trim() === "" || next.trim() === currentName) return;
    try {
      await onRename(id, next.trim());
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "전략 이름을 변경하지 못했습니다."
      );
    }
  };

  const handleDeleteClick = async (id: string) => {
    if (!window.confirm("정말 이 전략을 삭제하시겠습니까?")) return;
    try {
      await onDelete(id);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "전략 삭제에 실패했습니다."
      );
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((v) => v !== id);
      }
      if (prev.length >= 2) {
        window.alert("최대 두 개의 전략만 선택할 수 있습니다.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCompareClick = () => {
    if (selectedIds.length !== 2) return;
    const [first, second] = selectedIds;
    const firstBt = backtestsByStrategy.get(first)?.[0];
    const secondBt = backtestsByStrategy.get(second)?.[0];

    if (!firstBt || !secondBt) {
      window.alert("선택한 전략 중 백테스트 결과가 없는 전략이 있습니다.");
      return;
    }
    setCompareTargets({ left: firstBt, right: secondBt });
  };

  const handleCloseCompare = () => {
    setCompareTargets(null);
  };

  return (
    <div className="strategy-list">
      {/* 상단 비교 툴바 */}
      <div className="strategy-list__toolbar">
        <span className="strategy-list__hint">
          비교할 전략을 최대 2개까지 체크한 뒤, 버튼을 눌러주세요.
        </span>
        <Btn
          variant="primary"
          onClick={handleCompareClick}
          disabled={selectedIds.length !== 2}
        >
          선택 전략 비교
        </Btn>
      </div>

      {strategies.length === 0 && (
        <Card title="내 전략" icon={ICONS.layers}>
          <p>
            등록된 전략이 없습니다. 커뮤니티에서 전략을 포크하거나 직접
            등록해보세요.
          </p>
        </Card>
      )}

      {strategies.length > 0 && (
        <div className="strategy-grid">
          {strategies.map((item) => {
            const tags = getStrategyTags(item);
            const latest = backtestsByStrategy.get(item.id)?.[0];
            const totalReturn = latest?.metrics?.total_return ?? null;
            const selected = selectedIds.includes(item.id);

            return (
              <Card
                key={item.id}
                title={item.name}
                icon={ICONS.layers}
                right={
                  <div className="strategy-card__header">
                    <span className="card__meta">
                      업데이트 {toDateLabel(item.updated_at)}
                    </span>
                    <label className="strategy-card__compare">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </label>
                  </div>
                }
              >
                <div className="strategy-tags">
                  {tags.length > 0 ? (
                    tags.map((tag) => (
                      <span key={tag} className="tag">
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="tag">#strategy</span>
                  )}
                </div>

                <div className="strategy-ytd">
                  누적 수익률 {formatPercent(totalReturn)}
                </div>
                {item.description && (
                  <p className="strategy-description">{item.description}</p>
                )}

                <div className="strategy-actions">
                  <Btn
                    variant="secondary"
                    onClick={() =>
                      setViewStrategy({ strategy: item, returnVal: totalReturn })
                    }
                  >
                    상세
                  </Btn>
                  <Btn
                    variant="secondary"
                    onClick={() => handleRenameClick(item.id, item.name)}
                  >
                    이름 변경
                  </Btn>
                  <Btn
                    variant="ghost"
                    onClick={() => handleDeleteClick(item.id)}
                  >
                    삭제
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 상세 모달 */}
      <Modal
        open={!!viewStrategy}
        onClose={() => setViewStrategy(null)}
        title={`전략 상세: ${viewStrategy?.strategy.name ?? ""}`}
      >
        {viewStrategy && (
          <div className="community-json">
            <div className="community-json__section">
              <h4>누적 수익률</h4>
              <p>{formatPercent(viewStrategy.returnVal)}</p>
            </div>
            <div className="community-json__section">
              <h4>전략 JSON</h4>
              <pre className="modal-json">
                {JSON.stringify(viewStrategy.strategy.strategy_json, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* 비교 모달: 두 전략의 백테스트 결과 차트를 나란히 */}
      <Modal
        open={!!compareTargets}
        onClose={handleCloseCompare}
        title="전략 비교"
      >
        {compareTargets && (
          <div className="compare-grid">
            <div className="compare-grid__column">
              <h4 className="compare-grid__title">
                {strategies.find(
                  (s) => s.id === compareTargets.left.strategy_id
                )?.name ?? "전략 A"}
              </h4>
              <PerformanceReport result={compareTargets.left} />
            </div>
            <div className="compare-grid__column">
              <h4 className="compare-grid__title">
                {strategies.find(
                  (s) => s.id === compareTargets.right.strategy_id
                )?.name ?? "전략 B"}
              </h4>
              <PerformanceReport result={compareTargets.right} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const CommunityPage = ({
  strategies,
  items,
  onFork,
  onCreate,
}: {
  strategies: Strategy[];
  items: CommunityFeedItem[];
  onFork: (id: string) => Promise<void>;
  onCreate: (params: {
    strategyId: string;
    title: string;
    content: string;
  }) => Promise<void>;
}) => {
  const [detail, setDetail] = useState<CommunityFeedItem | null>(null);
  const [open, setOpen] = useState(false);
  const [strategyId, setStrategyId] = useState<string>(
    () => strategies[0]?.id ?? ""
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ensure selected strategy remains valid when strategies list changes
  useEffect(() => {
    if (strategies.length > 0 && !strategies.find((s) => s.id === strategyId)) {
      setStrategyId(strategies[0].id);
    }
  }, [strategies, strategyId]);

  const handleSubmit = async () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!strategyId) {
      window.alert("게시할 전략을 선택하세요.");
      return;
    }
    if (!trimmedTitle) {
      window.alert("제목을 입력하세요.");
      return;
    }
    if (!trimmedContent) {
      window.alert("내용을 입력하세요.");
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        strategyId,
        title: trimmedTitle,
        content: trimmedContent,
      });
      window.alert("게시글이 등록되었습니다.");
      setOpen(false);
      setTitle("");
      setContent("");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "게시글을 등록하지 못했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const strategyOptions = strategies.map((item) => ({
    label: item.name,
    value: item.id,
  }));

  return (
    <>
      <div className="community-header">
        <div className="community-header__left">
          <h2 className="community-header__title">커뮤니티</h2>
        </div>
        <div className="community-header__right">
          <Btn variant="primary" onClick={() => setOpen(true)}>
            + 새 글
          </Btn>
        </div>
      </div>
      <div className="community-grid">
        {items.map((item) => {
          const strategyKeys = Object.keys(item.strategy.strategy_json ?? {});
          const displayedKeys = strategyKeys.slice(0, 4);
          const metricsEntries = item.last_backtest
            ? Object.entries(item.last_backtest.metrics ?? {})
            : [];
          return (
            <Card
              key={item.id}
              title={item.title}
              icon={ICONS.share}
              right={
                <span className="card__meta">
                  작성자 {item.author_username}
                </span>
              }
            >
              <div className="community-meta">
                게시일 {toDateLabel(item.created_at)}
              </div>
              <p className="community-content">{item.content}</p>
              <div className="community-strategy">
                <span className="community-strategy__title">전략 정보</span>
                <div className="community-strategy__name">
                  {item.strategy.name}
                </div>
                {item.strategy.description && (
                  <div className="community-strategy__description">
                    {item.strategy.description}
                  </div>
                )}
                {displayedKeys.length > 0 && (
                  <div className="community-strategy__meta">
                    주요 키: {displayedKeys.join(", ")}
                    {strategyKeys.length > displayedKeys.length ? " …" : ""}
                  </div>
                )}
              </div>
              {item.last_backtest ? (
                <div className="community-backtest">
                  <div className="community-backtest__title">최근 백테스트</div>
                  <div className="community-backtest__meta">
                    {toDateLabel(item.last_backtest.start_date)} ~{" "}
                    {toDateLabel(item.last_backtest.end_date)} · 초기 자본 ₩
                    {formatNumber(item.last_backtest.initial_capital)}
                  </div>
                  {metricsEntries.length > 0 ? (
                    <ul className="community-backtest__metrics">
                      {metricsEntries.map(([metricKey, metricValue]) => (
                        <li
                          key={metricKey}
                          className="community-backtest__metric"
                        >
                          <span className="community-backtest__metric-name">
                            {metricKey}
                          </span>
                          <span className="community-backtest__metric-value">
                            {metricValue.toLocaleString("ko-KR", {
                              maximumFractionDigits: 4,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="community-backtest__empty">
                      지표 정보가 없습니다.
                    </div>
                  )}
                </div>
              ) : (
                <div className="community-backtest community-backtest--empty">
                  최근 백테스트 기록이 없습니다.
                </div>
              )}
              <div className="card__actions">
                <Btn variant="ghost" onClick={() => setDetail(item)}>
                  JSON 보기
                </Btn>
                <Btn
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await onFork(item.id);
                      window.alert("전략이 내 전략 목록에 추가되었습니다.");
                    } catch (error) {
                      window.alert(
                        error instanceof Error
                          ? error.message
                          : "전략 복사에 실패했습니다."
                      );
                    }
                  }}
                >
                  {ICONS.fork} 복사
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`커뮤니티 상세: ${detail?.title ?? ""}`}
      >
        {detail && (
          <div className="community-json">
            <div className="community-json__section">
              <h4>전략 JSON</h4>
              <pre className="modal-json">
                {JSON.stringify(detail.strategy, null, 2)}
              </pre>
            </div>
            {detail.last_backtest ? (
              <div className="community-json__section">
                <h4>최근 백테스트 결과</h4>
                <pre className="modal-json">
                  {JSON.stringify(detail.last_backtest, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="community-json__empty">
                최근 백테스트 기록이 없습니다.
              </div>
            )}
          </div>
        )}
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title="새 글 작성">
        <div className="form">
          <label className="field">
            <span className="field__label">전략 선택</span>
            <Select
              options={strategyOptions}
              value={strategyId}
              onChange={(value) => setStrategyId(value)}
            />
          </label>
          <label className="field">
            <span className="field__label">제목</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
            />
          </label>
          <label className="field">
            <span className="field__label">내용</span>
            <textarea
              className="textarea"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="내용을 입력하세요"
            />
          </label>
          <div className="dialog-actions">
            <Btn variant="secondary" onClick={() => setOpen(false)}>
              취소
            </Btn>
            <Btn variant="primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "등록 중…" : "등록"}
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
};

const SettingsPage = () => {
  const [rebalance, setRebalance] = useState("M");
  const [language, setLanguage] = useState("ko");
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className="settings-grid">
      <Card title="일반" icon={ICONS.settings}>
        <div className="settings-fields">
          <Field label="기본 리밸런싱 주기">
            <Select
              value={rebalance}
              onChange={setRebalance}
              options={[
                { label: "월말", value: "M" },
                { label: "분기", value: "Q" },
              ]}
            />
          </Field>
          <Field label="표시 언어">
            <Select
              value={language}
              onChange={setLanguage}
              options={[
                { label: "한국어", value: "ko" },
                { label: "English", value: "en" },
              ]}
            />
          </Field>
          <Field label="다크 모드">
            <div className="settings-switch">
              <Switch checked={darkMode} onChange={setDarkMode} />
              <span>실험적</span>
            </div>
          </Field>
        </div>
      </Card>
    </div>
  );
};

const TopHeader = ({
  page,
  onChange,
  onLogout,
}: {
  page: PageKey;
  onChange: (value: PageKey) => void;
  onLogout: () => void;
}) => (
  <header className="top-header">
    <div className="top-header__inner">
      <div className="brand">QuantiMizer</div>
      <nav className="nav-tabs" aria-label="주요 메뉴">
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`nav-tab ${
              page === tab.id ? "nav-tab--active" : ""
            }`.trim()}
            onClick={() => onChange(tab.id)}
          >
            <span className="nav-tab__icon" aria-hidden>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>
      <button
        type="button"
        className="logout-button"
        title="로그아웃"
        onClick={onLogout}
      >
        {ICONS.logout}
      </button>
    </div>
  </header>
);

const normalizeBacktest = (item: Backtest): Backtest => {
  const initialCapital =
    typeof item.initial_capital === "number"
      ? item.initial_capital
      : Number(item.initial_capital);
  const equityCurve = Array.isArray(item.equity_curve)
    ? item.equity_curve.map((point) => {
        const rawEquity =
          typeof point.equity === "number"
            ? point.equity
            : Number(point.equity);
        return {
          date: String(point.date),
          equity: Number.isFinite(rawEquity) ? rawEquity : 0,
          drawdown: point.drawdown,
        };
      })
    : [];
  const metricsEntries = Object.entries(item.metrics ?? {});
  const metrics: Record<string, number> = {};
  metricsEntries.forEach(([key, value]) => {
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      metrics[key] = numeric;
    }
  });
  return {
    ...item,
    initial_capital: Number.isFinite(initialCapital) ? initialCapital : 0,
    equity_curve: equityCurve,
    metrics,
  };
};

const App = () => {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [tokens, setTokensState] = useState<AuthTokens | null>(() => {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthTokens;
      if (parsed?.accessToken && parsed?.refreshToken) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [models, setModels] = useState<MLModelItem[]>([]);
  const [communityItems, setCommunityItems] = useState<CommunityFeedItem[]>([]);
  const [selectedBacktest, setSelectedBacktest] = useState<Backtest | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const setTokens = useCallback((next: AuthTokens | null) => {
    setTokensState(next);
    if (next) {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, []);

  const authorized = Boolean(tokens?.accessToken);

  const login = useCallback(
    async (email: string, password: string) => {
      const body = new URLSearchParams();
      body.set("username", email);
      body.set("password", password);
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!response.ok) {
        let message = "로그인에 실패했습니다.";
        try {
          const data = (await response.json()) as { detail?: string };
          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const data = (await response.json()) as TokenResponse;
      setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
    },
    [setTokens]
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      if (!response.ok) {
        let message = "회원가입에 실패했습니다.";
        try {
          const data = (await response.json()) as { detail?: string };
          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      await login(email, password);
    },
    [login]
  );

  const apiFetch = useCallback(
    async (
      path: string,
      init?: RequestInit,
      skipAuth = false
    ): Promise<Response> => {
      const headers = new Headers(init?.headers ?? {});
      if (!skipAuth && tokens?.accessToken) {
        headers.set("Authorization", `Bearer ${tokens.accessToken}`);
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
      });
      if (response.status !== 401 || skipAuth || !tokens?.refreshToken) {
        return response;
      }

      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.refreshToken}` },
      });
      if (!refreshResponse.ok) {
        setTokens(null);
        throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
      }
      const refreshData = (await refreshResponse.json()) as TokenResponse;
      const nextTokens = {
        accessToken: refreshData.access_token,
        refreshToken: refreshData.refresh_token,
      };
      setTokens(nextTokens);

      const retryHeaders = new Headers(init?.headers ?? {});
      retryHeaders.set("Authorization", `Bearer ${nextTokens.accessToken}`);
      return fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: retryHeaders,
      });
    },
    [setTokens, tokens]
  );

  const loadStrategies = useCallback(async () => {
    const response = await apiFetch("/strategies?skip=0&limit=100");
    if (!response.ok) {
      throw new Error("전략 목록을 불러오지 못했습니다.");
    }
    const data = (await response.json()) as StrategyListResponse;
    setStrategies(data.items);
  }, [apiFetch]);

  const loadBacktests = useCallback(async () => {
    const response = await apiFetch("/backtests?skip=0&limit=100");
    if (!response.ok) {
      throw new Error("백테스트 목록을 불러오지 못했습니다.");
    }
    const data = (await response.json()) as BacktestListResponse;
    setBacktests(data.items.map((item) => normalizeBacktest(item)));
  }, [apiFetch]);

  const loadModels = useCallback(async () => {
    const response = await apiFetch("/models");
    if (!response.ok) {
      throw new Error("모델 목록을 불러오지 못했습니다.");
    }
    const data = (await response.json()) as ModelListResponse;
    setModels(data.items);
  }, [apiFetch]);

  const loadCommunity = useCallback(async () => {
    const response = await apiFetch("/community/posts");
    if (!response.ok) {
      throw new Error("커뮤니티 게시글을 불러오지 못했습니다.");
    }
    const data = (await response.json()) as CommunityListResponse;
    const normalizedItems = data.items.map((item) => ({
      ...item,
      last_backtest: item.last_backtest
        ? normalizeBacktest(item.last_backtest)
        : null,
    }));
    setCommunityItems(normalizedItems);
  }, [apiFetch]);

  useEffect(() => {
    if (!authorized) {
      setStrategies([]);
      setBacktests([]);
      setModels([]);
      setCommunityItems([]);
      return;
    }

    let cancelled = false;
    const loadAll = async () => {
      setIsLoading(true);
      setGlobalError(null);
      try {
        await Promise.all([
          loadStrategies(),
          loadBacktests(),
          loadModels(),
          loadCommunity(),
        ]);
      } catch (error) {
        if (!cancelled) {
          setGlobalError(
            error instanceof Error
              ? error.message
              : "데이터를 불러오는 중 오류가 발생했습니다."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [authorized, loadStrategies, loadBacktests, loadModels, loadCommunity]);

  const handleRunBacktest = useCallback(
    async ({
      strategyId,
      startDate,
      endDate,
      initialCapital,
      mlModelId,
    }: {
      strategyId: string;
      startDate: string;
      endDate: string;
      initialCapital: number;
      mlModelId: string | null;
    }) => {
      const response = await apiFetch("/backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_id: strategyId,
          start_date: startDate,
          end_date: endDate,
          initial_capital: initialCapital,
          ml_model_id: mlModelId,
        }),
      });
      if (!response.ok) {
        let message = "백테스트 실행에 실패했습니다.";
        try {
          const data = (await response.json()) as { detail?: string };
          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const data = (await response.json()) as Backtest;
      const normalized = normalizeBacktest(data);
      setBacktests((prev) => [
        normalized,
        ...prev.filter((item) => item.id !== normalized.id),
      ]);
      return normalized;
    },
    [apiFetch]
  );

  const handleSaveStrategy = useCallback(
    async ({
      id,
      name,
      description,
      strategy_json,
    }: {
      id?: string;
      name: string;
      description?: string | null;
      strategy_json: StrategyConfig;
    }) => {
      const payload = {
        name,
        description: description ?? null,
        strategy_json,
      };
      console.log(
        "서버로 전송할 최종 데이터:",
        JSON.stringify(payload, null, 2)
      );
      const path = id ? `/strategies/${id}` : "/strategies";
      const method = id ? "PUT" : "POST";
      const response = await apiFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        let message = id
          ? "전략을 수정하지 못했습니다."
          : "전략을 생성하지 못했습니다.";
        try {
          const data = (await response.json()) as { detail?: string };
          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const saved = (await response.json()) as Strategy;
      setStrategies((prev) => {
        if (id) {
          return prev.map((item) => (item.id === saved.id ? saved : item));
        }
        return [saved, ...prev.filter((item) => item.id !== saved.id)];
      });
      return saved;
    },
    [apiFetch]
  );

  const handleRenameStrategy = useCallback(
    async (id: string, name: string) => {
      const response = await apiFetch(`/strategies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error("전략 이름을 수정하지 못했습니다.");
      }
      const updated = (await response.json()) as Strategy;
      setStrategies((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    },
    [apiFetch]
  );

  const handleCloneStrategy = useCallback(
    async (id: string) => {
      const source = strategies.find((item) => item.id === id);
      if (!source) return;
      const response = await apiFetch("/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${source.name} (copy)`,
          description: source.description,
          strategy_json: source.strategy_json,
        }),
      });
      if (!response.ok) {
        throw new Error("전략 복제에 실패했습니다.");
      }
      const created = (await response.json()) as Strategy;
      setStrategies((prev) => [created, ...prev]);
    },
    [apiFetch, strategies]
  );

  const handleDeleteStrategy = useCallback(
    async (id: string) => {
      const response = await apiFetch(`/strategies/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("전략 삭제에 실패했습니다.");
      }
      setStrategies((prev) => prev.filter((item) => item.id !== id));
    },
    [apiFetch]
  );

  const handleForkCommunity = useCallback(
    async (postId: string) => {
      const response = await apiFetch(`/community/posts/${postId}/fork`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("전략 복사에 실패했습니다.");
      }
      const created = (await response.json()) as Strategy;
      setStrategies((prev) => [created, ...prev]);
    },
    [apiFetch]
  );

  const handleCreateCommunityPost = useCallback(
    async ({
      strategyId,
      title,
      content,
    }: {
      strategyId: string;
      title: string;
      content: string;
    }) => {
      const response = await apiFetch("/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: strategyId, title, content }),
      });
      if (!response.ok) {
        let message = "게시글을 등록하지 못했습니다.";
        try {
          const data = (await response.json()) as { detail?: string };
          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      await loadCommunity();
    },
    [apiFetch, loadCommunity]
  );

  const handleLogout = useCallback(() => {
    setTokens(null);
    setPage("dashboard");
  }, [setTokens]);

  const handleLoginSubmit = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      setAuthLoading(true);
      try {
        await login(email, password);
      } catch (error) {
        setAuthError(
          error instanceof Error
            ? error.message
            : "로그인 중 오류가 발생했습니다."
        );
        throw error;
      } finally {
        setAuthLoading(false);
      }
    },
    [login]
  );

  const handleRegisterSubmit = useCallback(
    async (email: string, username: string, password: string) => {
      setAuthError(null);
      setAuthLoading(true);
      try {
        await register(email, username, password);
      } catch (error) {
        setAuthError(
          error instanceof Error
            ? error.message
            : "회원가입 중 오류가 발생했습니다."
        );
        throw error;
      } finally {
        setAuthLoading(false);
      }
    },
    [register]
  );

  if (!authorized) {
    return (
      <div className="auth-shell">
        <AuthForm
          onLogin={handleLoginSubmit}
          onRegister={handleRegisterSubmit}
          error={authError}
          loading={authLoading}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopHeader page={page} onChange={setPage} onLogout={handleLogout} />
      <main className="main-content">
        {isLoading && (
          <div className="alert alert--info">
            {ICONS.info} 데이터를 불러오는 중입니다...
          </div>
        )}
        {globalError && (
          <div className="alert alert--error">
            {ICONS.info} {globalError}
          </div>
        )}
        {page === "dashboard" && (
          <Dashboard
            strategies={strategies}
            backtests={backtests}
            onOpenBacktest={setSelectedBacktest}
            onNavigate={setPage}
          />
        )}
        {page === "builder" && (
          <StrategyBuilder
            strategies={strategies}
            models={models}
            onRunBacktest={handleRunBacktest}
            onSaveStrategy={handleSaveStrategy}
          />
        )}
        {page === "backtests" && (
          <BacktestsPage
            backtests={backtests}
            strategies={strategies}
            onSelect={setSelectedBacktest}
          />
        )}
        {page === "strategies" && (
          <MyStrategies
            strategies={strategies}
            backtests={backtests}
            onRename={handleRenameStrategy}
            onClone={handleCloneStrategy}
            onDelete={handleDeleteStrategy}
          />
        )}
        {page === "community" && (
          <CommunityPage
            strategies={strategies}
            items={communityItems}
            onFork={handleForkCommunity}
            onCreate={handleCreateCommunityPost}
          />
        )}
        {page === "settings" && <SettingsPage />}
      </main>

      <Modal
        open={Boolean(selectedBacktest)}
        onClose={() => setSelectedBacktest(null)}
        title={`백테스트 상세: ${selectedBacktest?.id ?? ""}`}
      >
        {selectedBacktest && <PerformanceReport result={selectedBacktest} />}
      </Modal>
    </div>
  );
};

export default App;