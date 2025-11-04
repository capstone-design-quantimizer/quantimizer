import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import './App.css'
import StrategyBlocklyEditor, {
  DEFAULT_STRATEGY_CONFIG,
  type StrategyConfig,
  normalizeStrategyConfig,
} from './StrategyBlocklyEditor'

type PageKey = 'dashboard' | 'builder' | 'backtests' | 'strategies' | 'models' | 'community' | 'settings'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'

type AuthTokens = {
  accessToken: string
  refreshToken: string
}

interface Strategy {
  id: string
  owner_id: string
  name: string
  description: string | null
  strategy_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface EquityPoint {
  date: string
  equity: number
  drawdown?: number
}

interface Backtest {
  id: string
  strategy_id: string
  start_date: string
  end_date: string
  initial_capital: number
  ml_model_id: string | null
  equity_curve: EquityPoint[]
  metrics: Record<string, number>
  created_at: string
}

interface MLModelItem {
  id: string
  name: string
  created_at: string
}

interface CommunityFeedItem {
  id: string
  title: string
  content: string
  created_at: string
  author_username: string
  strategy: Record<string, unknown>
}

interface StrategyListResponse {
  total: number
  items: Strategy[]
}

interface BacktestListResponse {
  total: number
  items: Backtest[]
}

interface ModelListResponse {
  items: MLModelItem[]
}

interface CommunityListResponse {
  items: CommunityFeedItem[]
}

interface TokenResponse {
  access_token: string
  refresh_token: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const TOKEN_STORAGE_KEY = 'quantimizer.tokens'
const NEW_STRATEGY_ID = '__new__'

const ICONS: Record<string, string> = {
  home: '🏠',
  sliders: '🎛️',
  beaker: '🧪',
  layers: '🗂️',
  share: '🤝',
  settings: '⚙️',
  logout: '⎋',
  chart: '📈',
  upload: '📤',
  download: '⬇️',
  edit: '✏️',
  trash: '🗑️',
  fork: '🔀',
  play: '▶️',
  save: '💾',
  info: 'ℹ️',
}

const navTabs: Array<{ id: PageKey; label: string; icon: string }> = [
  { id: 'dashboard', label: '대시보드', icon: ICONS.home },
  { id: 'builder', label: '전략 빌더', icon: ICONS.sliders },
  { id: 'backtests', label: '백테스트', icon: ICONS.beaker },
  { id: 'strategies', label: '내 전략', icon: ICONS.layers },
  { id: 'models', label: '모델', icon: ICONS.beaker },
  { id: 'community', label: '커뮤니티', icon: ICONS.share },
  { id: 'settings', label: '설정', icon: ICONS.settings },
]

const Btn = ({ variant = 'primary', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => (
  <button
    type="button"
    className={`btn btn--${variant} ${className}`.trim()}
    {...props}
  >
    {children}
  </button>
)

const Card = ({ title, icon, right, children, className = '' }: { title?: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) => (
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
)

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="field">
    <span className="field__label">{label}</span>
    {children}
    {hint && <span className="field__hint">{hint}</span>}
  </label>
)

const Input = ({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`input ${className}`.trim()} />
)

const Select = ({ options, value, onChange, className = '' }: { options: Array<{ label: string; value: string }>; value: string; onChange: (value: string) => void; className?: string }) => (
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
)

const Switch = ({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) => (
  <button
    type="button"
    className={`switch ${checked ? 'switch--on' : 'switch--off'}`}
    onClick={() => onChange(!checked)}
    aria-pressed={checked}
  >
    <span className="switch__thumb" />
  </button>
)

const Modal = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  if (!open) {
    return null
  }

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onClose} role="presentation" />
      <div className="modal__content" role="dialog" aria-modal="true">
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}

const formatNumber = (value: number) => value.toLocaleString('ko-KR')

const formatPercent = (value: number | null | undefined, fractionDigits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }
  return `${(value * 100).toFixed(fractionDigits)}%`
}

const toDateLabel = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toISOString().slice(0, 10)
}

const buildDrawdownSeries = (curve: EquityPoint[]): EquityPoint[] => {
  let peak = Number.NEGATIVE_INFINITY
  return curve.map((point) => {
    const equity = Number(point.equity) || 0
    peak = Math.max(peak, equity)
    const drawdown = peak > 0 ? equity / peak - 1 : 0
    return { ...point, equity, drawdown }
  })
}

const getStrategyTags = (strategy: Strategy): string[] => {
  const raw = strategy.strategy_json?.factors
  if (!Array.isArray(raw)) {
    return []
  }
  const tags = raw
    .map((item) => {
      if (item && typeof item === 'object' && 'name' in item) {
        return String((item as { name: unknown }).name)
      }
      return null
    })
    .filter((value): value is string => Boolean(value))
  return Array.from(new Set(tags)).slice(0, 4)
}

const METRIC_LABELS: Array<{ key: string; label: string; format?: (value: number) => string }> = [
  { key: 'total_return', label: '누적 수익률', format: (value: number) => formatPercent(value, 2) },
  { key: 'cagr', label: 'CAGR', format: (value: number) => formatPercent(value, 2) },
  { key: 'max_drawdown', label: '최대 낙폭', format: (value: number) => formatPercent(value, 2) },
  { key: 'volatility', label: '연환산 변동성', format: (value: number) => formatPercent(value, 2) },
  { key: 'sharpe', label: 'Sharpe Ratio', format: (value: number) => value.toFixed(2) },
]

const AuthForm = ({ onLogin, onRegister, error, loading }: { onLogin: (email: string, password: string) => Promise<void>; onRegister: (email: string, username: string, password: string) => Promise<void>; error: string | null; loading: boolean }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    if (mode === 'login') {
      try {
        await onLogin(email, password)
      } catch {
        // 상위 컴포넌트에서 에러를 표시함
      }
      return
    }

    try {
      await onRegister(email, username, password)
    } catch {
      // 상위 컴포넌트에서 에러를 표시함
    }
  }

  return (
    <div className="auth-card">
      <h1 className="auth-card__title">QuantiMizer</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-form__field">
          <span>이메일</span>
          <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        {mode === 'register' && (
          <label className="auth-form__field">
            <span>닉네임</span>
            <Input type="text" required value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
        )}
        <label className="auth-form__field">
          <span>비밀번호</span>
          <Input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="alert alert--error auth-form__alert">{ICONS.info} {error}</div>}
        <Btn type="submit" variant="primary" className="auth-form__submit" disabled={loading}>
          {loading ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}
        </Btn>
        <button
          type="button"
          className="auth-form__toggle"
          onClick={() => setMode((prev) => (prev === 'login' ? 'register' : 'login'))}
        >
          {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </form>
    </div>
  )
}

interface SimpleLineChartProps {
  data: Array<{ label: string; [key: string]: number | string }>
  series: Array<{ key: string; color: string; label: string }>
}

const SimpleLineChart = ({ data, series }: SimpleLineChartProps) => {
  const { points, min, max } = useMemo(() => {
    if (data.length === 0 || series.length === 0) {
      return { points: [] as Array<{ key: string; value: string }>, min: 0, max: 1 }
    }

    const numericValues: number[] = []
    data.forEach((item) => {
      series.forEach(({ key }) => {
        const raw = item[key]
        if (typeof raw === 'number') {
          numericValues.push(raw)
        }
      })
    })

    if (numericValues.length === 0) {
      return { points: [], min: 0, max: 1 }
    }

    const minValue = Math.min(...numericValues)
    const maxValue = Math.max(...numericValues)
    const denominator = maxValue - minValue || 1

    const computed = series.map(({ key }) => {
      const polyline = data
        .map((item, index) => {
          const raw = item[key]
          if (typeof raw !== 'number') {
            return ''
          }
          const x = (index / Math.max(1, data.length - 1)) * 100
          const normalized = (raw - minValue) / denominator
          const y = 100 - normalized * 100
          return `${x.toFixed(2)},${y.toFixed(2)}`
        })
        .filter(Boolean)
        .join(' ')
      return { key, value: polyline }
    })

    return { points: computed, min: minValue, max: maxValue }
  }, [data, series])

  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Equity chart">
        <rect x="0" y="0" width="100" height="100" fill="var(--chart-background)" />
        <line x1="0" y1="100" x2="100" y2="100" className="line-chart__axis" />
        <line x1="0" y1="0" x2="0" y2="100" className="line-chart__axis" />
        {points.map(({ key, value }) => {
          const color = series.find((item) => item.key === key)?.color ?? '#2563eb'
          return <polyline key={key} points={value} fill="none" stroke={color} strokeWidth={1.8} />
        })}
      </svg>
      <div className="line-chart__legend">
        {series.map((item) => (
          <span key={item.key} className="line-chart__legend-item">
            <span className="line-chart__legend-dot" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="line-chart__range">
        범위: {min.toFixed(2)} ~ {max.toFixed(2)}
      </div>
    </div>
  )
}

const EquityChart = ({ data }: { data: EquityPoint[] }) => {
  const points = useMemo(() => {
    if (data.length === 0) {
      return { equity: '', drawdown: '' }
    }

    const equityValues = data.map((item) => item.equity)
    const drawdownValues = data.map((item) => item.drawdown ?? 0)
    const minEquity = Math.min(...equityValues)
    const maxEquity = Math.max(...equityValues)
    const minDrawdown = Math.min(...drawdownValues, 0)
    const equityDenominator = maxEquity - minEquity || 1
    const drawdownDenominator = Math.abs(minDrawdown) || 1

    const equityPath = data
      .map((item, index) => {
        const x = (index / Math.max(1, data.length - 1)) * 100
        const normalized = (item.equity - minEquity) / equityDenominator
        const y = 100 - normalized * 100
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')

    const areaPoints = data
      .map((item, index) => {
        const x = (index / Math.max(1, data.length - 1)) * 100
        const normalized = Math.abs(item.drawdown ?? 0) / drawdownDenominator
        const y = 100 - normalized * 100
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')

    const drawdownPath = `0,100 ${areaPoints} 100,100`

    return { equity: equityPath, drawdown: drawdownPath }
  }, [data])

  const latest = data[data.length - 1]

  return (
    <div className="equity-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Equity and drawdown chart">
        <rect x="0" y="0" width="100" height="100" fill="var(--chart-background)" />
        <polygon points={points.drawdown} fill="rgba(239, 68, 68, 0.2)" stroke="rgba(239, 68, 68, 0.3)" strokeWidth={0.5} />
        <polyline points={points.equity} fill="none" stroke="#16a34a" strokeWidth={2} />
      </svg>
      <div className="equity-chart__footer">
        <span className="equity-chart__label">최근 기준일</span>
        <span className="equity-chart__value">{latest ? `${toDateLabel(latest.date)} · ₩${formatNumber(latest.equity)}` : '-'}</span>
      </div>
    </div>
  )
}

const PerformanceReport = ({ result }: { result: Backtest }) => {
  const curve = useMemo(() => buildDrawdownSeries(result.equity_curve ?? []), [result.equity_curve])
  const entries = useMemo(
    () =>
      METRIC_LABELS.map((item) => {
        const raw = result.metrics?.[item.key]
        if (raw === undefined || raw === null) {
          return { label: item.label, value: '-' }
        }
        const numeric = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(numeric)) {
          return { label: item.label, value: '-' }
        }
        return { label: item.label, value: item.format ? item.format(numeric) : numeric }
      }),
    [result.metrics],
  )

  return (
    <div className="performance">
      <EquityChart data={curve} />
      <div className="performance__stats">
        {entries.map((item) => (
          <div key={item.label} className="performance__stat">
            <span className="performance__stat-label">{item.label}</span>
            <span className="performance__stat-value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const Dashboard = ({ strategies, backtests, models, onOpenBacktest }: { strategies: Strategy[]; backtests: Backtest[]; models: MLModelItem[]; onOpenBacktest: (item: Backtest) => void }) => {
  const strategyMap = useMemo(() => new Map(strategies.map((item) => [item.id, item])), [strategies])
  const sortedBacktests = useMemo(() => {
    return [...backtests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [backtests])
  const latestBacktest = sortedBacktests[0]

  const chartData = useMemo(() => {
    if (!latestBacktest || !latestBacktest.equity_curve?.length) {
      return []
    }
    const base = latestBacktest.equity_curve[0]?.equity ?? 1
    if (!base) {
      return []
    }
    return latestBacktest.equity_curve.map((point) => ({
      label: toDateLabel(point.date),
      strategy: (point.equity / base) * 100,
    }))
  }, [latestBacktest])

  const strategyName = latestBacktest ? strategyMap.get(latestBacktest.strategy_id)?.name ?? '-' : '-'
  const kpiBacktest = latestBacktest ? `${latestBacktest.id}` : '-'
  const kpiStrategy = latestBacktest ? strategyName : '-'
  const ytd = latestBacktest?.metrics?.total_return

  return (
    <div className="page-section">
      <div className="kpi-grid">
        <KPI label="내 전략" value={strategies.length} sub="등록된 전략 수" />
        <KPI label="최근 백테스트" value={kpiBacktest} sub={kpiStrategy} />
        <KPI label="대표 전략 누적 수익률" value={latestBacktest ? formatPercent(ytd ?? null) : '-'} />
        <KPI label="등록 모델" value={models.length} sub="ONNX 추천" />
      </div>

      <Card title="대표 전략 에쿼티 커브" icon={ICONS.chart}>
        {chartData.length > 0 ? (
          <SimpleLineChart
            data={chartData}
            series={[
              { key: 'strategy', color: '#2563eb', label: 'Strategy' },
            ]}
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
              {sortedBacktests.slice(0, 5).map((item) => {
                const strategy = strategyMap.get(item.strategy_id)
                return (
                  <tr key={item.id}>
                    <td className="mono">{item.id}</td>
                    <td>{strategy?.name ?? '-'}</td>
                    <td>
                      {toDateLabel(item.start_date)} ~ {toDateLabel(item.end_date)}
                    </td>
                    <td>{formatPercent(item.metrics?.cagr ?? null)}</td>
                    <td>{formatPercent(item.metrics?.max_drawdown ?? null)}</td>
                    <td>{typeof item.metrics?.sharpe === 'number' ? item.metrics.sharpe.toFixed(2) : '-'}</td>
                    <td>
                      <Btn variant="ghost" onClick={() => onOpenBacktest(item)}>
                        상세
                      </Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

const KPI = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="kpi">
    <span className="kpi__label">{label}</span>
    <span className="kpi__value">{value}</span>
    {sub && <span className="kpi__sub">{sub}</span>}
  </div>
)

const StrategyBuilder = ({
  strategies,
  models,
  onRunBacktest,
  onSaveStrategy,
}: {
  strategies: Strategy[]
  models: MLModelItem[]
  onRunBacktest: (params: { strategyId: string; startDate: string; endDate: string; initialCapital: number; mlModelId: string | null }) => Promise<Backtest>
  onSaveStrategy: (params: { id?: string; name: string; description?: string | null; strategy_json: StrategyConfig }) => Promise<Strategy>
}) => {
  const [strategyId, setStrategyId] = useState<string>(NEW_STRATEGY_ID)
  const [start, setStart] = useState<string>(() => new Date(new Date().setFullYear(new Date().getFullYear() - 5)).toISOString().slice(0, 10))
  const [end, setEnd] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [capital, setCapital] = useState<number>(10_000_000)
  const [modelId, setModelId] = useState<string>('')
  const [builderConfig, setBuilderConfig] = useState<StrategyConfig>(() => normalizeStrategyConfig(DEFAULT_STRATEGY_CONFIG))
  const [builderName, setBuilderName] = useState<string>('')
  const [builderDescription, setBuilderDescription] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingStrategyId, setPendingStrategyId] = useState<string | null>(null)
  const [result, setResult] = useState<Backtest | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (strategyId === NEW_STRATEGY_ID) {
      return
    }
    const exists = strategies.some((item) => item.id === strategyId)
    if (exists) {
      if (pendingStrategyId === strategyId) {
        setPendingStrategyId(null)
      }
      return
    }
    if (pendingStrategyId === strategyId) {
      return
    }
    if (strategies.length === 0) {
      setStrategyId(NEW_STRATEGY_ID)
    } else {
      setStrategyId(strategies[0].id)
    }
  }, [strategies, strategyId, pendingStrategyId])

  const selectedStrategy = useMemo(
    () => (strategyId === NEW_STRATEGY_ID ? null : strategies.find((item) => item.id === strategyId) ?? null),
    [strategies, strategyId],
  )

  useEffect(() => {
    if (strategyId === NEW_STRATEGY_ID) {
      setBuilderConfig(normalizeStrategyConfig(DEFAULT_STRATEGY_CONFIG))
      setBuilderName('')
      setBuilderDescription('')
      setResult(null)
      setSuccessMessage(null)
      setError(null)
      return
    }
    if (selectedStrategy) {
      setBuilderConfig(normalizeStrategyConfig(selectedStrategy.strategy_json))
      setBuilderName(selectedStrategy.name)
      setBuilderDescription(selectedStrategy.description ?? '')
      setResult(null)
      setSuccessMessage(null)
      setError(null)
      if (pendingStrategyId === selectedStrategy.id) {
        setPendingStrategyId(null)
      }
    }
  }, [strategyId, selectedStrategy, pendingStrategyId])

  const handleConfigChange = useCallback(
    (next: StrategyConfig) => {
      setBuilderConfig(next)
      setResult(null)
      setSuccessMessage(null)
      setError(null)
    },
    [setBuilderConfig, setResult, setSuccessMessage, setError],
  )

  const handleCapitalChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value)
    setCapital(Number.isFinite(next) ? next : 0)
  }

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBuilderName(event.target.value)
    setSuccessMessage(null)
  }

  const handleDescriptionChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBuilderDescription(event.target.value)
    setSuccessMessage(null)
  }

  const handleStrategySelect = (id: string) => {
    setPendingStrategyId(null)
    setStrategyId(id)
  }

  const handleExport = () => {
    const exportName = (builderName.trim() || selectedStrategy?.name || 'strategy').replace(/\s+/g, '_')
    const blob = new Blob([JSON.stringify(builderConfig, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportName}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleSave = async () => {
    const name = builderName.trim()
    if (name === '') {
      setError('전략 이름을 입력하세요.')
      setSuccessMessage(null)
      return
    }
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const saved = await onSaveStrategy({
        id: strategyId === NEW_STRATEGY_ID ? undefined : strategyId,
        name,
        description: builderDescription.trim() === '' ? null : builderDescription.trim(),
        strategy_json: builderConfig,
      })
      setSuccessMessage('전략이 저장되었습니다.')
      setPendingStrategyId(saved.id)
      setStrategyId(saved.id)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '전략을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const runBacktest = async () => {
    if (!strategyId || strategyId === NEW_STRATEGY_ID) {
      setError('백테스트를 실행하려면 저장된 전략을 선택하세요.')
      setSuccessMessage(null)
      return
    }
    setIsRunning(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const data = await onRunBacktest({
        strategyId,
        startDate: start,
        endDate: end,
        initialCapital: capital,
        mlModelId: modelId || null,
      })
      setResult(data)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '백테스트 실행 중 문제가 발생했습니다.')
    } finally {
      setIsRunning(false)
    }
  }

  const strategyOptions = useMemo(
    () => [
      { label: '새 전략 만들기', value: NEW_STRATEGY_ID },
      ...strategies.map((item) => ({ label: item.name, value: item.id })),
    ],
    [strategies],
  )

  return (
    <Card
      title="전략 빌더"
      icon={ICONS.sliders}
      right={
        <div className="builder-controls">
          <div className="builder-fields">
            <label className="builder-field">
              <span>전략</span>
              <Select value={strategyId} onChange={handleStrategySelect} options={strategyOptions} />
            </label>
            <label className="builder-field">
              <span>전략 이름</span>
              <Input value={builderName} onChange={handleNameChange} placeholder="예: 가치 + 퀄리티 전략" />
            </label>
            <label className="builder-field">
              <span>설명</span>
              <Input value={builderDescription} onChange={handleDescriptionChange} placeholder="선택 입력" />
            </label>
            <label className="builder-field">
              <span>시작일</span>
              <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="builder-field">
              <span>종료일</span>
              <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
            <label className="builder-field">
              <span>초기자금</span>
              <Input type="number" value={capital} onChange={handleCapitalChange} />
            </label>
            <label className="builder-field">
              <span>모델</span>
              <Select
                value={modelId}
                onChange={setModelId}
                options={[{ label: '모델 사용 안함', value: '' }, ...models.map((item) => ({ label: item.name, value: item.id }))]}
              />
            </label>
          </div>

          <div className="builder-buttons">
            <Btn variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중…' : `${ICONS.save} 전략 저장`}
            </Btn>
            <Btn variant="ghost" onClick={handleExport}>
              {ICONS.download}
              JSON 내보내기
            </Btn>
            <Btn variant="secondary" onClick={runBacktest} disabled={isRunning || strategyId === NEW_STRATEGY_ID}>
              {isRunning ? '실행 중...' : `${ICONS.play} 백테스트 실행`}
            </Btn>
          </div>
        </div>
      }
    >
      <div className="builder-layout">
        <div className="builder-canvas">
          <div className="blockly">
            <div className="blockly__title">Blockly 전략 구성 캔버스</div>
            <p className="blockly__description">
              Universe → Factors → Portfolio → Rebalancing 순으로 블록을 조합해 투자 전략을 완성하세요.
            </p>
            <StrategyBlocklyEditor value={builderConfig} onChange={handleConfigChange} />
            <div className="blockly__grid">
              <div className="blockly__block">
                <span className="blockly__block-title">Universe</span>
                <span className="blockly__block-text">시장과 기본 필터를 선택합니다.</span>
              </div>
              <div className="blockly__block">
                <span className="blockly__block-title">Factors</span>
                <span className="blockly__block-text">팩터 블록을 추가하여 점수를 계산하세요.</span>
              </div>
              <div className="blockly__block">
                <span className="blockly__block-title">Portfolio</span>
                <span className="blockly__block-text">상위 종목 수와 가중 방식을 지정합니다.</span>
              </div>
              <div className="blockly__block">
                <span className="blockly__block-title">Rebalancing</span>
                <span className="blockly__block-text">리밸런싱 주기를 설정합니다.</span>
              </div>
            </div>
          </div>
        </div>
        <div className="builder-report">
          {successMessage && (
            <div className="alert alert--success">
              {ICONS.save} {successMessage}
            </div>
          )}
          {error && (
            <div className="alert alert--error">
              {ICONS.info} {error}
            </div>
          )}
          <div className="builder-json">
            <div className="builder-json__header">전략 JSON 미리보기</div>
            <pre className="builder-json__code">{JSON.stringify(builderConfig, null, 2)}</pre>
          </div>
          {result ? (
            <PerformanceReport result={result} />
          ) : (
            <div className="placeholder">
              <div className="placeholder__icon">{ICONS.chart}</div>
              <p className="placeholder__text">
                전략을 저장한 뒤 <strong>백테스트 실행</strong> 버튼을 눌러 성과를 확인하세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

const BacktestsPage = ({ backtests, strategies, onSelect }: { backtests: Backtest[]; strategies: Strategy[]; onSelect: (item: Backtest) => void }) => {
  const strategyMap = useMemo(() => new Map(strategies.map((item) => [item.id, item])), [strategies])
  const rows = useMemo(() => [...backtests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [backtests])

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
                const strategy = strategyMap.get(item.strategy_id)
                return (
                  <tr key={item.id}>
                    <td className="mono">{item.id}</td>
                    <td>{strategy?.name ?? '-'}</td>
                    <td>
                      {toDateLabel(item.start_date)} ~ {toDateLabel(item.end_date)}
                    </td>
                    <td>₩{formatNumber(Number(item.initial_capital) || 0)}</td>
                    <td>{formatPercent(item.metrics?.cagr ?? null)}</td>
                    <td>{formatPercent(item.metrics?.max_drawdown ?? null)}</td>
                    <td>{typeof item.metrics?.sharpe === 'number' ? item.metrics.sharpe.toFixed(2) : '-'}</td>
                    <td>
                      <Btn variant="ghost" onClick={() => onSelect(item)}>
                        자세히
                      </Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

const MyStrategies = ({ strategies, backtests, onRename, onClone, onDelete }: { strategies: Strategy[]; backtests: Backtest[]; onRename: (id: string, name: string) => Promise<void>; onClone: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) => {
  const backtestsByStrategy = useMemo(() => {
    const map = new Map<string, Backtest[]>()
    backtests.forEach((item) => {
      const list = map.get(item.strategy_id) ?? []
      list.push(item)
      map.set(item.strategy_id, list)
    })
    map.forEach((list, key) => {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      map.set(key, list)
    })
    return map
  }, [backtests])

  const handleRename = async (id: string) => {
    const current = strategies.find((item) => item.id === id)
    if (!current) return
    const name = window.prompt('전략 이름 변경', current.name)
    if (!name || name.trim() === '' || name === current.name) {
      return
    }
    try {
      await onRename(id, name.trim())
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '전략 이름을 변경하지 못했습니다.')
    }
  }

  const handleClone = async (id: string) => {
    try {
      await onClone(id)
      window.alert('전략이 복제되었습니다.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '전략 복제에 실패했습니다.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return
    try {
      await onDelete(id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '전략 삭제에 실패했습니다.')
    }
  }

  return (
    <div className="strategy-grid">
      {strategies.map((item) => {
        const tags = getStrategyTags(item)
        const latest = backtestsByStrategy.get(item.id)?.[0]
        const ytd = latest?.metrics?.total_return ?? null
        return (
          <Card
            key={item.id}
            title={item.name}
            icon={ICONS.layers}
            right={<span className="card__meta">업데이트 {toDateLabel(item.updated_at)}</span>}
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
            <div className="strategy-ytd">누적 수익률 {formatPercent(ytd)}</div>
            {item.description && <p className="strategy-description">{item.description}</p>}
            <div className="card__actions">
              <Btn variant="ghost" onClick={() => handleRename(item.id)}>
                {ICONS.edit} 이름 변경
              </Btn>
              <Btn variant="secondary" onClick={() => handleClone(item.id)}>
                {ICONS.fork} 복제
              </Btn>
              <Btn variant="danger" onClick={() => handleDelete(item.id)}>
                {ICONS.trash} 삭제
              </Btn>
            </div>
          </Card>
        )
      })}
      {strategies.length === 0 && (
        <Card title="전략 없음" icon={ICONS.info}>
          <p>등록된 전략이 없습니다. 커뮤니티에서 전략을 포크하거나 직접 등록해보세요.</p>
        </Card>
      )}
    </div>
  )
}

const ModelsPage = ({ models, onUpload, onDelete }: { models: MLModelItem[]; onUpload: (file: File) => Promise<void>; onDelete: (id: string) => Promise<void> }) => {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.onnx')) {
      window.alert('ONNX 모델만 업로드 가능합니다.')
      return
    }

    setUploading(true)
    try {
      await onUpload(file)
      if (fileRef.current) {
        fileRef.current.value = ''
      }
      window.alert('모델이 업로드되었습니다.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '모델 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('모델을 삭제하시겠습니까?')) return
    try {
      await onDelete(id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '모델 삭제에 실패했습니다.')
    }
  }

  return (
    <div className="page-section">
      <Card title="모델 업로드" icon={ICONS.upload}>
        <div className="model-upload">
          <input ref={fileRef} type="file" className="model-upload__input" accept=".onnx" />
          <Btn variant="primary" onClick={upload} disabled={uploading}>
            {uploading ? '업로드 중…' : `${ICONS.upload} 업로드`}
          </Btn>
        </div>
        <div className="model-upload__hint">허용: .onnx (ONNX 타입만 지원)</div>
      </Card>

      <Card title="모델 레지스트리" icon={ICONS.beaker}>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>버전</th>
                <th>프레임워크</th>
                <th>입력 스키마</th>
                <th>등록일</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {models.map((item) => (
                <tr key={item.id}>
                  <td className="bold">{item.name}</td>
                  <td>-</td>
                  <td>ONNX</td>
                  <td>-</td>
                  <td>{toDateLabel(item.created_at)}</td>
                  <td>
                    <div className="table-actions">
                      <Btn variant="ghost" disabled>
                        테스트
                      </Btn>
                      <Btn variant="secondary" disabled>
                        버전업
                      </Btn>
                      <Btn variant="danger" onClick={() => void remove(item.id)}>
                        {ICONS.trash} 삭제
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

const CommunityPage = ({ items, onFork }: { items: CommunityFeedItem[]; onFork: (id: string) => Promise<void> }) => {
  const [detail, setDetail] = useState<CommunityFeedItem | null>(null)

  return (
    <div className="community-grid">
      {items.map((item) => (
        <Card
          key={item.id}
          title={item.title}
          icon={ICONS.share}
          right={<span className="card__meta">작성자 {item.author_username}</span>}
        >
          <div className="community-meta">게시일 {toDateLabel(item.created_at)}</div>
          <p className="community-content">{item.content}</p>
          <div className="card__actions">
            <Btn variant="ghost" onClick={() => setDetail(item)}>
              JSON 보기
            </Btn>
            <Btn
              variant="secondary"
              onClick={async () => {
                try {
                  await onFork(item.id)
                  window.alert('전략이 내 전략 목록에 추가되었습니다.')
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : '전략 복사에 실패했습니다.')
                }
              }}
            >
              {ICONS.fork} 복사
            </Btn>
          </div>
        </Card>
      ))}

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`전략 JSON: ${detail?.title ?? ''}`}>
        {detail && <pre className="modal-json">{JSON.stringify(detail.strategy, null, 2)}</pre>}
      </Modal>
    </div>
  )
}

const SettingsPage = () => {
  const [rebalance, setRebalance] = useState('M')
  const [language, setLanguage] = useState('ko')
  const [darkMode, setDarkMode] = useState(false)

  return (
    <div className="settings-grid">
      <Card title="일반" icon={ICONS.settings}>
        <div className="settings-fields">
          <Field label="기본 리밸런싱 주기">
            <Select
              value={rebalance}
              onChange={setRebalance}
              options={[
                { label: '월말', value: 'M' },
                { label: '분기', value: 'Q' },
              ]}
            />
          </Field>
          <Field label="표시 언어">
            <Select
              value={language}
              onChange={setLanguage}
              options={[
                { label: '한국어', value: 'ko' },
                { label: 'English', value: 'en' },
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
      <Card title="데이터/보안" icon={ICONS.info}>
        <ul className="settings-list">
          <li>사용자 모델 실행은 샌드박스 격리(리소스/시간 제한) 권장</li>
          <li>PIT 원칙 보장(리밸런싱 기준일 직전 데이터만 사용)</li>
          <li>전략 비교 페이지/SQL 미리보기는 제품 범위에서 제외</li>
        </ul>
      </Card>
    </div>
  )
}

const TopHeader = ({ page, onChange, onLogout }: { page: PageKey; onChange: (value: PageKey) => void; onLogout: () => void }) => (
  <header className="top-header">
    <div className="top-header__inner">
      <div className="brand">QuantiMizer</div>
      <nav className="nav-tabs" aria-label="주요 메뉴">
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`nav-tab ${page === tab.id ? 'nav-tab--active' : ''}`.trim()}
            onClick={() => onChange(tab.id)}
          >
            <span className="nav-tab__icon" aria-hidden>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>
      <button type="button" className="logout-button" title="로그아웃" onClick={onLogout}>
        {ICONS.logout}
      </button>
    </div>
  </header>
)

const normalizeBacktest = (item: Backtest): Backtest => {
  const initialCapital = typeof item.initial_capital === 'number' ? item.initial_capital : Number(item.initial_capital)
  const equityCurve = Array.isArray(item.equity_curve)
    ? item.equity_curve.map((point) => {
        const rawEquity = typeof point.equity === 'number' ? point.equity : Number(point.equity)
        return {
          date: String(point.date),
          equity: Number.isFinite(rawEquity) ? rawEquity : 0,
        }
      })
    : []
  const metricsEntries = Object.entries(item.metrics ?? {})
  const metrics: Record<string, number> = {}
  metricsEntries.forEach(([key, value]) => {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) {
      metrics[key] = numeric
    }
  })
  return {
    ...item,
    initial_capital: Number.isFinite(initialCapital) ? initialCapital : 0,
    equity_curve: equityCurve,
    metrics,
  }
}

const App = () => {
  const [page, setPage] = useState<PageKey>('builder')
  const [tokens, setTokensState] = useState<AuthTokens | null>(() => {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as AuthTokens
      if (parsed?.accessToken && parsed?.refreshToken) {
        return parsed
      }
      return null
    } catch {
      return null
    }
  })
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [backtests, setBacktests] = useState<Backtest[]>([])
  const [models, setModels] = useState<MLModelItem[]>([])
  const [communityItems, setCommunityItems] = useState<CommunityFeedItem[]>([])
  const [selectedBacktest, setSelectedBacktest] = useState<Backtest | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  const setTokens = useCallback((next: AuthTokens | null) => {
    setTokensState(next)
    if (next) {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next))
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }, [])

  const authorized = Boolean(tokens?.accessToken)

  const login = useCallback(async (email: string, password: string) => {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!response.ok) {
      let message = '로그인에 실패했습니다.'
      try {
        const data = (await response.json()) as { detail?: string }
        if (data?.detail) {
          message = data.detail
        }
      } catch {
        // ignore
      }
      throw new Error(message)
    }
    const data = (await response.json()) as TokenResponse
    setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
  }, [setTokens])

  const register = useCallback(async (email: string, username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
    })
    if (!response.ok) {
      let message = '회원가입에 실패했습니다.'
      try {
        const data = (await response.json()) as { detail?: string }
        if (data?.detail) {
          message = data.detail
        }
      } catch {
        // ignore
      }
      throw new Error(message)
    }
    await login(email, password)
  }, [login])

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit, skipAuth = false): Promise<Response> => {
      const headers = new Headers(init?.headers ?? {})
      if (!skipAuth && tokens?.accessToken) {
        headers.set('Authorization', `Bearer ${tokens.accessToken}`)
      }

      const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
      if (response.status !== 401 || skipAuth || !tokens?.refreshToken) {
        return response
      }

      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.refreshToken}` },
      })
      if (!refreshResponse.ok) {
        setTokens(null)
        throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.')
      }
      const refreshData = (await refreshResponse.json()) as TokenResponse
      const nextTokens = { accessToken: refreshData.access_token, refreshToken: refreshData.refresh_token }
      setTokens(nextTokens)

      const retryHeaders = new Headers(init?.headers ?? {})
      retryHeaders.set('Authorization', `Bearer ${nextTokens.accessToken}`)
      return fetch(`${API_BASE_URL}${path}`, { ...init, headers: retryHeaders })
    },
    [setTokens, tokens],
  )

  const loadStrategies = useCallback(async () => {
    const response = await apiFetch('/strategies?skip=0&limit=100')
    if (!response.ok) {
      throw new Error('전략 목록을 불러오지 못했습니다.')
    }
    const data = (await response.json()) as StrategyListResponse
    setStrategies(data.items)
  }, [apiFetch])

  const loadBacktests = useCallback(async () => {
    const response = await apiFetch('/backtests?skip=0&limit=100')
    if (!response.ok) {
      throw new Error('백테스트 목록을 불러오지 못했습니다.')
    }
    const data = (await response.json()) as BacktestListResponse
    setBacktests(data.items.map((item) => normalizeBacktest(item)))
  }, [apiFetch])

  const loadModels = useCallback(async () => {
    const response = await apiFetch('/models')
    if (!response.ok) {
      throw new Error('모델 목록을 불러오지 못했습니다.')
    }
    const data = (await response.json()) as ModelListResponse
    setModels(data.items)
  }, [apiFetch])

  const loadCommunity = useCallback(async () => {
    const response = await apiFetch('/community/posts')
    if (!response.ok) {
      throw new Error('커뮤니티 게시글을 불러오지 못했습니다.')
    }
    const data = (await response.json()) as CommunityListResponse
    setCommunityItems(data.items)
  }, [apiFetch])

  useEffect(() => {
    if (!authorized) {
      setStrategies([])
      setBacktests([])
      setModels([])
      setCommunityItems([])
      return
    }

    let cancelled = false
    const loadAll = async () => {
      setIsLoading(true)
      setGlobalError(null)
      try {
        await Promise.all([loadStrategies(), loadBacktests(), loadModels(), loadCommunity()])
      } catch (error) {
        if (!cancelled) {
          setGlobalError(error instanceof Error ? error.message : '데이터를 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadAll()

    return () => {
      cancelled = true
    }
  }, [authorized, loadStrategies, loadBacktests, loadModels, loadCommunity])

  const handleRunBacktest = useCallback(
    async ({ strategyId, startDate, endDate, initialCapital, mlModelId }: { strategyId: string; startDate: string; endDate: string; initialCapital: number; mlModelId: string | null }) => {
      const response = await apiFetch('/backtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_id: strategyId,
          start_date: startDate,
          end_date: endDate,
          initial_capital: initialCapital,
          ml_model_id: mlModelId,
        }),
      })
      if (!response.ok) {
        let message = '백테스트 실행에 실패했습니다.'
        try {
          const data = (await response.json()) as { detail?: string }
          if (data?.detail) {
            message = data.detail
          }
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      const data = (await response.json()) as Backtest
      const normalized = normalizeBacktest(data)
      setBacktests((prev) => [normalized, ...prev.filter((item) => item.id !== normalized.id)])
      return normalized
    },
    [apiFetch],
  )

  const handleSaveStrategy = useCallback(
    async ({
      id,
      name,
      description,
      strategy_json,
    }: {
      id?: string
      name: string
      description?: string | null
      strategy_json: StrategyConfig
    }) => {
      const payload = {
        name,
        description: description ?? null,
        strategy_json,
      }
      console.log("서버로 전송할 최종 데이터:", JSON.stringify(payload, null, 2));
      const path = id ? `/strategies/${id}` : '/strategies'
      const method = id ? 'PUT' : 'POST'
      const response = await apiFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        let message = id ? '전략을 수정하지 못했습니다.' : '전략을 생성하지 못했습니다.'
        try {
          const data = (await response.json()) as { detail?: string }
          if (data?.detail) {
            message = data.detail
          }
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      const saved = (await response.json()) as Strategy
      setStrategies((prev) => {
        if (id) {
          return prev.map((item) => (item.id === saved.id ? saved : item))
        }
        return [saved, ...prev.filter((item) => item.id !== saved.id)]
      })
      return saved
    },
    [apiFetch],
  )

  const handleRenameStrategy = useCallback(
    async (id: string, name: string) => {
      const response = await apiFetch(`/strategies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) {
        throw new Error('전략 이름을 수정하지 못했습니다.')
      }
      const updated = (await response.json()) as Strategy
      setStrategies((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    },
    [apiFetch],
  )

  const handleCloneStrategy = useCallback(
    async (id: string) => {
      const source = strategies.find((item) => item.id === id)
      if (!source) return
      const response = await apiFetch('/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${source.name} (copy)`,
          description: source.description,
          strategy_json: source.strategy_json,
        }),
      })
      if (!response.ok) {
        throw new Error('전략 복제에 실패했습니다.')
      }
      const created = (await response.json()) as Strategy
      setStrategies((prev) => [created, ...prev])
    },
    [apiFetch, strategies],
  )

  const handleDeleteStrategy = useCallback(
    async (id: string) => {
      const response = await apiFetch(`/strategies/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('전략 삭제에 실패했습니다.')
      }
      setStrategies((prev) => prev.filter((item) => item.id !== id))
    },
    [apiFetch],
  )

  const handleUploadModel = useCallback(
    async (file: File) => {
      const form = new FormData()
      form.append('name', file.name.replace(/\.[^.]+$/, ''))
      form.append('file', file)
      const response = await apiFetch('/models/upload', {
        method: 'POST',
        body: form,
      })
      if (!response.ok) {
        let message = '모델 업로드에 실패했습니다.'
        try {
          const data = (await response.json()) as { detail?: string }
          if (data?.detail) {
            message = data.detail
          }
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      const created = (await response.json()) as MLModelItem
      setModels((prev) => [created, ...prev])
    },
    [apiFetch],
  )

  const handleDeleteModel = useCallback(
    async (id: string) => {
      const response = await apiFetch(`/models/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('모델 삭제에 실패했습니다.')
      }
      setModels((prev) => prev.filter((item) => item.id !== id))
    },
    [apiFetch],
  )

  const handleForkCommunity = useCallback(
    async (postId: string) => {
      const response = await apiFetch(`/community/posts/${postId}/fork`, { method: 'POST' })
      if (!response.ok) {
        throw new Error('전략 복사에 실패했습니다.')
      }
      const created = (await response.json()) as Strategy
      setStrategies((prev) => [created, ...prev])
    },
    [apiFetch],
  )

  const handleLogout = useCallback(() => {
    setTokens(null)
    setPage('builder')
  }, [setTokens])

  const handleLoginSubmit = useCallback(
    async (email: string, password: string) => {
      setAuthError(null)
      setAuthLoading(true)
      try {
        await login(email, password)
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : '로그인 중 오류가 발생했습니다.')
        throw error
      } finally {
        setAuthLoading(false)
      }
    },
    [login],
  )

  const handleRegisterSubmit = useCallback(
    async (email: string, username: string, password: string) => {
      setAuthError(null)
      setAuthLoading(true)
      try {
        await register(email, username, password)
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : '회원가입 중 오류가 발생했습니다.')
        throw error
      } finally {
        setAuthLoading(false)
      }
    },
    [register],
  )

  if (!authorized) {
    return (
      <div className="auth-shell">
        <AuthForm onLogin={handleLoginSubmit} onRegister={handleRegisterSubmit} error={authError} loading={authLoading} />
      </div>
    )
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
        {page === 'dashboard' && <Dashboard strategies={strategies} backtests={backtests} models={models} onOpenBacktest={setSelectedBacktest} />}
        {page === 'builder' && (
          <StrategyBuilder
            strategies={strategies}
            models={models}
            onRunBacktest={handleRunBacktest}
            onSaveStrategy={handleSaveStrategy}
          />
        )}
        {page === 'backtests' && <BacktestsPage backtests={backtests} strategies={strategies} onSelect={setSelectedBacktest} />}
        {page === 'strategies' && (
          <MyStrategies
            strategies={strategies}
            backtests={backtests}
            onRename={handleRenameStrategy}
            onClone={handleCloneStrategy}
            onDelete={handleDeleteStrategy}
          />
        )}
        {page === 'models' && <ModelsPage models={models} onUpload={handleUploadModel} onDelete={handleDeleteModel} />}
        {page === 'community' && <CommunityPage items={communityItems} onFork={handleForkCommunity} />}
        {page === 'settings' && <SettingsPage />}
      </main>

      <Modal open={Boolean(selectedBacktest)} onClose={() => setSelectedBacktest(null)} title={`백테스트 상세: ${selectedBacktest?.id ?? ''}`}>
        {selectedBacktest && <PerformanceReport result={selectedBacktest} />}
      </Modal>
    </div>
  )
}

export default App
