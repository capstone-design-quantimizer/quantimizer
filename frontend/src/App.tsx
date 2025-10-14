import { useMemo, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type ReactNode } from 'react'
import './App.css'

type PageKey = 'dashboard' | 'builder' | 'backtests' | 'strategies' | 'models' | 'community' | 'settings'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'

interface BacktestStats {
  [key: string]: number
}

interface EquityPoint {
  date: string
  equity: number
  drawdown: number
}

interface BacktestResult {
  stats: BacktestStats
  equityCurve: EquityPoint[]
}

interface BacktestSummary {
  id: string
  strategy: string
  start: string
  end: string
  cagr: number
  mdd: number
  sharpe: number
}

interface StrategyItem {
  id: string
  name: string
  updated: string
  tags: string[]
  ytd: number
}

interface ModelItem {
  id: string
  name: string
  version: string
  framework: string
  created: string
  input: string
}

interface CommunityItem {
  id: string
  name: string
  author: string
  ytd: number
  stars: number
  forks: number
  tags: string[]
  code: string
  json: Record<string, unknown>
}

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

const sampleBacktestResult: BacktestResult = (() => {
  const stats: BacktestStats = {
    'Return (Ann.) [%]': 11.0,
    'Volatility (Ann.) [%]': 15.2,
    'Sharpe Ratio': 0.72,
    'Max. Drawdown [%]': -22.8,
    'Calmar Ratio': 0.48,
    'Win Rate [%]': 54.2,
    'Return [%]': 184.5,
    'Buy & Hold Return [%]': 121.3,
    '# Trades': 120,
  }

  const equityCurve: EquityPoint[] = Array.from({ length: 120 }, (_, index) => {
    const equity = 10_000_000 * (1 + index * 0.006 + Math.sin(index / 10) * 0.05)
    const drawdown = -Math.abs(Math.sin(index / 6) * 10)
    const start = new Date('2020-01-01T00:00:00Z')
    const date = new Date(start.getTime() + index * 7 * 24 * 60 * 60 * 1000)
    return {
      date: date.toISOString().slice(0, 10),
      equity: Number(equity.toFixed(2)),
      drawdown: Number(drawdown.toFixed(2)),
    }
  })

  return { stats, equityCurve }
})()

const sampleEquitySeries = sampleBacktestResult.equityCurve.slice(0, 60).map((_, index) => ({
  label: `W${index + 1}`,
  market: 100 + index * 1.1 + Math.sin(index / 7) * 1.2,
  kosdaq: 98 + index * 0.9 + Math.cos(index / 5) * 1.1,
  strategy: 100 + index * 1.5 + Math.sin(index / 3) * 1.4,
}))

const sampleBacktests: BacktestSummary[] = [
  { id: 'BT-2025-09-01-001', strategy: 'K-Value+Mom_30', start: '2015-01-01', end: '2025-09-01', cagr: 14.2, mdd: -23.4, sharpe: 0.92 },
  { id: 'BT-2025-08-15-002', strategy: 'ONNX-Alpha-v1', start: '2018-01-01', end: '2025-08-15', cagr: 11.8, mdd: -21.1, sharpe: 0.81 },
  { id: 'BT-2025-08-02-003', strategy: 'Momentum_12_6_Top50', start: '2010-01-01', end: '2025-08-02', cagr: 13.0, mdd: -28.9, sharpe: 0.77 },
]

const sampleStrategies: StrategyItem[] = [
  { id: 'STR-001', name: 'K-Value+Mom_30', updated: '2025-09-20', tags: ['가치', '모멘텀', '월말'], ytd: 7.8 },
  { id: 'STR-002', name: 'Momentum_12_6_Top50', updated: '2025-08-02', tags: ['모멘텀'], ytd: 5.1 },
  { id: 'STR-003', name: 'LowVol_Top40', updated: '2025-07-11', tags: ['저변동성'], ytd: 3.2 },
]

const sampleModels: ModelItem[] = [
  { id: 'MDL-ONNX-001', name: 'ONNX-Alpha-v1', version: '1.0.0', framework: 'ONNX', created: '2025-08-10', input: '{f1..f32}→score' },
  { id: 'MDL-ONNX-002', name: 'ONNX-Beta-v1', version: '0.3.2', framework: 'ONNX', created: '2025-07-30', input: '{value,mom,vol}→score' },
]

const communityItems: CommunityItem[] = [
  {
    id: 'PUB-001',
    name: 'K-가치+모멘텀(Top30)',
    author: 'quant_hg',
    ytd: 8.4,
    stars: 21,
    forks: 5,
    tags: ['가치', '모멘텀'],
    code: 'rank = 0.5*z(per.asc()) + 0.5*z(mom(252).desc());\nselect_top(30, equal_weight)',
    json: { strategy: 'K-가치+모멘텀(Top30)', factors: ['PER', 'MOM_12M'], topN: 30, weight: 'equal' },
  },
  {
    id: 'PUB-002',
    name: '저변동성 Top40',
    author: 'kim_ml',
    ytd: 4.3,
    stars: 13,
    forks: 2,
    tags: ['저변동성'],
    code: 'rank = -z(vol(63));\nselect_top(40)',
    json: { strategy: '저변동성 Top40', factors: ['VOL_3M'], topN: 40, weight: 'equal' },
  },
]

const formatNumber = (value: number) => value.toLocaleString('ko-KR')

const KPI = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="kpi">
    <span className="kpi__label">{label}</span>
    <span className="kpi__value">{value}</span>
    {sub && <span className="kpi__sub">{sub}</span>}
  </div>
)

interface SimpleLineChartProps {
  data: Array<{ label: string; [key: string]: number | string }>
  series: Array<{ key: string; color: string; label: string }>
}

const SimpleLineChart = ({ data, series }: SimpleLineChartProps) => {
  const { points, min, max } = useMemo(() => {
    if (data.length === 0) {
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
        범위: {min.toFixed(1)} ~ {max.toFixed(1)}
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
    const drawdownValues = data.map((item) => item.drawdown)
    const minEquity = Math.min(...equityValues)
    const maxEquity = Math.max(...equityValues)
    const minDrawdown = Math.min(...drawdownValues)
    const equityDenominator = maxEquity - minEquity || 1
    const drawdownDenominator = 0 - minDrawdown || 1

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
        const normalized = (item.drawdown - minDrawdown) / drawdownDenominator
        const y = 100 - normalized * 100
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })

    const drawdownPath = `0,100 ${areaPoints.join(' ')} 100,100`

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
        <span className="equity-chart__value">{latest ? `${latest.date} · ₩${formatNumber(latest.equity)}` : '-'}</span>
      </div>
    </div>
  )
}

const PerformanceReport = ({ result }: { result: BacktestResult }) => {
  const entries = useMemo(() => Object.entries(result.stats) as Array<[string, number]>, [result.stats])

  return (
    <div className="performance">
      <EquityChart data={result.equityCurve} />
      <div className="performance__stats">
        {entries.map(([label, value]) => (
          <div key={label} className="performance__stat">
            <span className="performance__stat-label">{label}</span>
            <span className="performance__stat-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const Dashboard = ({ onOpenBacktest }: { onOpenBacktest: (item: BacktestSummary) => void }) => (
  <div className="page-section">
    <div className="kpi-grid">
      <KPI label="내 전략" value={sampleStrategies.length} sub="최근 업데이트 기준" />
      <KPI label="최근 백테스트" value={sampleBacktests[0].id} sub={sampleBacktests[0].strategy} />
      <KPI label="대표 전략 YTD" value="+7.8%" />
      <KPI label="등록 모델" value={sampleModels.length} sub="ONNX 권장" />
    </div>

    <Card title="대표 전략 에쿼티 커브" icon={ICONS.chart}>
      <SimpleLineChart
        data={sampleEquitySeries}
        series={[
          { key: 'strategy', color: '#2563eb', label: 'Strategy' },
          { key: 'market', color: '#1d4ed8', label: 'KOSPI' },
          { key: 'kosdaq', color: '#4b5563', label: 'KOSDAQ' },
        ]}
      />
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
            {sampleBacktests.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.id}</td>
                <td>{item.strategy}</td>
                <td>
                  {item.start} ~ {item.end}
                </td>
                <td>{item.cagr}%</td>
                <td>{item.mdd}%</td>
                <td>{item.sharpe}</td>
                <td>
                  <Btn variant="ghost" onClick={() => onOpenBacktest(item)}>
                    상세
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  </div>
)

const BlocklyPlaceholder = () => (
  <div className="blockly">
    <div className="blockly__title">Blockly 전략 구성 캔버스</div>
    <p className="blockly__description">
      브라우저에서 직접 블록을 조립해 전략을 설계할 수 있는 캔버스 영역입니다.
      <br />
      데스크톱 환경에서 실제 Blockly 위젯을 연결하도록 확장할 수 있습니다.
    </p>
    <div className="blockly__grid">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="blockly__block">
          <span className="blockly__block-title">Block {index + 1}</span>
          <span className="blockly__block-text">설정 요소</span>
        </div>
      ))}
    </div>
  </div>
)

const StrategyBuilder = () => {
  const [start, setStart] = useState('2015-01-01')
  const [end, setEnd] = useState('2025-09-01')
  const [capital, setCapital] = useState(10_000_000)
  const [market, setMarket] = useState('KOSPI')
  const [model, setModel] = useState('')
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onnxModels = useMemo(() => sampleModels.filter((item) => item.framework === 'ONNX'), [])

  const handleCapitalChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value)
    setCapital(Number.isFinite(next) ? next : 0)
  }

  const runBacktest = async () => {
    setIsRunning(true)
    setError(null)

    try {
      const response = await fetch('/api/backtest/mock')
      if (!response.ok) {
        throw new Error(`요청이 실패했습니다. (${response.status})`)
      }

      const data = (await response.json()) as BacktestResult
      setBacktestResult(data)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Card
      title="전략 빌더"
      icon={ICONS.sliders}
      right={
        <div className="builder-controls">
          <div className="builder-fields">
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
              <span>시장</span>
              <Select
                value={market}
                onChange={setMarket}
                options={[
                  { label: 'KOSPI', value: 'KOSPI' },
                  { label: 'KOSDAQ', value: 'KOSDAQ' },
                  { label: 'KOSPI+KOSDAQ', value: 'ALL' },
                ]}
              />
            </label>
            <label className="builder-field">
              <span>모델</span>
              <Select
                value={model}
                onChange={setModel}
                options={[{ label: '모델 사용 안함', value: '' }, ...onnxModels.map((item) => ({ label: item.name, value: item.id }))]}
              />
            </label>
          </div>

          <div className="builder-buttons">
            <Btn variant="ghost">
              {ICONS.save}
              JSON 내보내기
            </Btn>
            <Btn variant="primary" onClick={runBacktest} disabled={isRunning}>
              {isRunning ? '실행 중...' : `${ICONS.play} 백테스트 실행`}
            </Btn>
          </div>
        </div>
      }
    >
      <div className="builder-layout">
        <div className="builder-canvas">
          <BlocklyPlaceholder />
        </div>
        <div className="builder-report">
          {error && (
            <div className="alert alert--error">
              {ICONS.info} {error}
            </div>
          )}
          {backtestResult ? (
            <PerformanceReport result={backtestResult} />
          ) : (
            <div className="placeholder">
              <div className="placeholder__icon">{ICONS.chart}</div>
              <p className="placeholder__text">
                상단의 <strong>백테스트 실행</strong> 버튼을 눌러 성과를 확인하세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

const BacktestsPage = () => {
  const [detail, setDetail] = useState<BacktestSummary | null>(null)

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
                <th>CAGR</th>
                <th>MDD</th>
                <th>Sharpe</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {sampleBacktests.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.id}</td>
                  <td>{item.strategy}</td>
                  <td>
                    {item.start} ~ {item.end}
                  </td>
                  <td>{item.cagr}%</td>
                  <td>{item.mdd}%</td>
                  <td>{item.sharpe}</td>
                  <td>
                    <Btn variant="ghost" onClick={() => setDetail(item)}>
                      자세히
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`백테스트 상세: ${detail?.id ?? ''}`}>
        {detail && <PerformanceReport result={sampleBacktestResult} />}
      </Modal>
    </div>
  )
}

const MyStrategies = () => {
  const [items, setItems] = useState<StrategyItem[]>(sampleStrategies)

  const rename = (id: string) => {
    const current = items.find((item) => item.id === id)
    if (!current) return
    const name = window.prompt('전략 이름 변경', current.name)
    if (!name) return
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)))
  }

  const clone = (id: string) => {
    const source = items.find((item) => item.id === id)
    if (!source) return
    const copy: StrategyItem = {
      ...source,
      id: `STR-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      name: `${source.name}_copy`,
      updated: new Date().toISOString().slice(0, 10),
    }
    setItems((prev) => [copy, ...prev])
  }

  const remove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <div className="strategy-grid">
      {items.map((item) => (
        <Card
          key={item.id}
          title={item.name}
          icon={ICONS.layers}
          right={<span className="card__meta">업데이트 {item.updated}</span>}
        >
          <div className="strategy-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </div>
          <div className="strategy-ytd">YTD {item.ytd}%</div>
          <div className="card__actions">
            <Btn variant="ghost" onClick={() => rename(item.id)}>
              {ICONS.edit} 이름 변경
            </Btn>
            <Btn variant="secondary" onClick={() => clone(item.id)}>
              {ICONS.fork} 복제
            </Btn>
            <Btn variant="danger" onClick={() => remove(item.id)}>
              {ICONS.trash} 삭제
            </Btn>
          </div>
        </Card>
      ))}
    </div>
  )
}

const ModelsPage = () => {
  const [items, setItems] = useState<ModelItem[]>(sampleModels)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const upload = () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.onnx')) {
      window.alert('ONNX 모델만 업로드 가능합니다.')
      return
    }

    const next: ModelItem = {
      id: `MDL-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      version: '1.0.0',
      framework: 'ONNX',
      created: new Date().toISOString().slice(0, 10),
      input: '{f1..fn}→score',
    }

    setItems((prev) => [next, ...prev])
    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  const remove = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id))

  return (
    <div className="page-section">
      <Card title="모델 업로드" icon={ICONS.upload}>
        <div className="model-upload">
          <input ref={fileRef} type="file" className="model-upload__input" />
          <Btn variant="primary" onClick={upload}>
            {ICONS.upload} 업로드
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
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="bold">{item.name}</td>
                  <td>{item.version}</td>
                  <td>{item.framework}</td>
                  <td>{item.input}</td>
                  <td>{item.created}</td>
                  <td>
                    <div className="table-actions">
                      <Btn variant="ghost">테스트</Btn>
                      <Btn variant="secondary">버전업</Btn>
                      <Btn variant="danger" onClick={() => remove(item.id)}>
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

const CommunityPage = () => {
  const [detail, setDetail] = useState<CommunityItem | null>(null)

  return (
    <div className="community-grid">
      {communityItems.map((item) => (
        <Card
          key={item.id}
          title={item.name}
          icon={ICONS.share}
          right={<span className="card__meta">YTD {item.ytd}%</span>}
        >
          <div className="community-meta">by {item.author} · ⭐ {item.stars} · 🍴 {item.forks}</div>
          <pre className="community-code">{item.code}</pre>
          <div className="strategy-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </div>
          <div className="card__actions">
            <Btn variant="ghost" onClick={() => setDetail(item)}>
              JSON 보기
            </Btn>
            <Btn variant="secondary">{ICONS.edit} 복사</Btn>
          </div>
        </Card>
      ))}

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`전략 JSON: ${detail?.name ?? ''}`}>
        {detail && <pre className="modal-json">{JSON.stringify(detail.json, null, 2)}</pre>}
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

const TopHeader = ({ page, onChange }: { page: PageKey; onChange: (value: PageKey) => void }) => (
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
      <button type="button" className="logout-button" title="로그아웃">
        {ICONS.logout}
      </button>
    </div>
  </header>
)

const App = () => {
  const [page, setPage] = useState<PageKey>('builder')
  const [preview, setPreview] = useState<BacktestSummary | null>(null)

  return (
    <div className="app-shell">
      <TopHeader page={page} onChange={setPage} />
      <main className="main-content">
        {page === 'dashboard' && <Dashboard onOpenBacktest={setPreview} />}
        {page === 'builder' && <StrategyBuilder />}
        {page === 'backtests' && <BacktestsPage />}
        {page === 'strategies' && <MyStrategies />}
        {page === 'models' && <ModelsPage />}
        {page === 'community' && <CommunityPage />}
        {page === 'settings' && <SettingsPage />}
      </main>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={`백테스트 상세: ${preview?.id ?? ''}`}>
        {preview && <PerformanceReport result={sampleBacktestResult} />}
      </Modal>
    </div>
  )
}

export default App
