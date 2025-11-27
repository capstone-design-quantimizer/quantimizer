import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly'
import 'blockly/blocks'
import 'blockly/msg/ko'

export type FactorName = 'PER' | 'PBR' | 'EPS' | 'BPS' | 'DividendYield' | 'RSI_14' | 'MA_20D' | 'Momentum_3M' | 'Momentum_12M' | 'Volatility_20D' | 'MarketCap' | 'PctChange' | 'ROE' | 'ROA' | 'OPM' | 'GPM' | 'DebtToEquity' | 'CurrentRatio' | 'AssetTurnover' | 'InterestCoverage'
export type FactorDirection = 'asc' | 'desc'
export type PortfolioWeighting = 'equal' | 'market_cap'
export type RebalancingFrequency = 'monthly' | 'quarterly'

export interface FactorConfig {
  name: FactorName
  direction: FactorDirection
  weight: number
  model_id?: string
}

export interface PortfolioConfig {
  top_n: number
  weight_method: PortfolioWeighting;
}

export interface RebalancingConfig {
  frequency: RebalancingFrequency
}

export interface StrategyConfig {
  factors: FactorConfig[]
  portfolio: PortfolioConfig
  rebalancing: RebalancingConfig
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  factors: [],
  portfolio: { top_n: 20, weight_method: 'equal' },
  rebalancing: { frequency: 'monthly' },
}

const FACTOR_OPTIONS: Array<[string, FactorName]> = [
  ['일간 수익률', 'PctChange'], ['RSI 14일', 'RSI_14'], ['20일 이평', 'MA_20D'], ['모멘텀 3M', 'Momentum_3M'],
  ['PER', 'PER'], ['PBR', 'PBR'], ['ROE', 'ROE'], ['부채비율', 'DebtToEquity'], ['시가총액', 'MarketCap']
]
const DIRECTION_OPTIONS: Array<[string, FactorDirection]> = [['오름차순', 'asc'], ['내림차순', 'desc']]
const WEIGHTING_OPTIONS: Array<[string, PortfolioWeighting]> = [['동일가중', 'equal'], ['시가총액가중', 'market_cap']]
const REBALANCING_OPTIONS: Array<[string, RebalancingFrequency]> = [['월말', 'monthly'], ['분기말', 'quarterly']]

const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [{ kind: 'category', name: '팩터', colour: '#3B82F6', contents: FACTOR_OPTIONS.map(f => ({ kind: 'block', type: 'factor_item', fields: { 'FACTOR': f[1] } })) }]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const normalizeStrategyConfig = (input: unknown): StrategyConfig => {
  const base = { factors: [], portfolio: { ...DEFAULT_STRATEGY_CONFIG.portfolio }, rebalancing: { ...DEFAULT_STRATEGY_CONFIG.rebalancing } }
  if (!isRecord(input)) return base
  const src = isRecord(input.definition) ? (input.definition as any) : input
  if (Array.isArray(src.factors)) {
    base.factors = src.factors.map((r: any) => ({
      name: r.name || r.type,
      direction: r.direction || r.order || 'desc',
      weight: Number(r.weight) || 0
    }))
  }
  if (isRecord(src.portfolio)) {
    base.portfolio.top_n = Number(src.portfolio.top_n) || 20
    base.portfolio.weight_method = (src.portfolio.weight_method as PortfolioWeighting) || 'equal'
  }
  if (isRecord(src.rebalancing)) base.rebalancing.frequency = (src.rebalancing.frequency as RebalancingFrequency) || 'monthly'
  return base
}

let initialized = false
const initBlocks = () => {
  if (initialized) return
  initialized = true
  Blockly.defineBlocksWithJsonArray([
    { type: 'strategy_root', message0: '전략 설정 %1 %2 %3', args0: [{ type: 'input_statement', name: 'FACTORS' }, { type: 'input_statement', name: 'PORTFOLIO' }, { type: 'input_statement', name: 'REBALANCING' }], colour: 210 },
    { type: 'factors_section', message0: '팩터 목록 %1', args0: [{ type: 'input_statement', name: 'ITEMS' }], previousStatement: 'factors_section', colour: 220 },
    { type: 'factor_item', message0: '%1 %2 (가중치: %3)', args0: [{ type: 'field_dropdown', name: 'FACTOR', options: FACTOR_OPTIONS }, { type: 'field_dropdown', name: 'DIRECTION', options: DIRECTION_OPTIONS }, { type: 'field_number', name: 'WEIGHT', value: 1 }], previousStatement: 'factor_item', nextStatement: 'factor_item', colour: 245 },
    { type: 'portfolio_settings', message0: '포트폴리오: 상위 %1개, %2', args0: [{ type: 'field_number', name: 'TOP_N', value: 20 }, { type: 'field_dropdown', name: 'WEIGHT_METHOD', options: WEIGHTING_OPTIONS }], previousStatement: 'portfolio_section', colour: 165 },
    { type: 'rebalancing_settings', message0: '리밸런싱: %1', args0: [{ type: 'field_dropdown', name: 'FREQUENCY', options: REBALANCING_OPTIONS }], previousStatement: 'rebalancing_section', colour: 140 }
  ])
}
initBlocks()

const extract = (ws: any): StrategyConfig => {
  const conf: StrategyConfig = { factors: [], portfolio: { ...DEFAULT_STRATEGY_CONFIG.portfolio }, rebalancing: { ...DEFAULT_STRATEGY_CONFIG.rebalancing } }
  const root = ws.getBlocksByType('strategy_root', false)[0]
  if (!root) return conf

  const facSec = root.getInputTargetBlock('FACTORS')
  if (facSec) {
    let curr = facSec.getInputTargetBlock('ITEMS')
    while (curr) {
      conf.factors.push({ name: curr.getFieldValue('FACTOR'), direction: curr.getFieldValue('DIRECTION'), weight: Number(curr.getFieldValue('WEIGHT')) })
      curr = curr.getNextBlock()
    }
  }
  const port = root.getInputTargetBlock('PORTFOLIO')
  if (port) {
    conf.portfolio.top_n = Number(port.getFieldValue('TOP_N'))
    conf.portfolio.weight_method = port.getFieldValue('WEIGHT_METHOD')
  }
  const reb = root.getInputTargetBlock('REBALANCING')
  if (reb) conf.rebalancing.frequency = reb.getFieldValue('FREQUENCY')
  return conf
}

const apply = (ws: any, conf: StrategyConfig) => {
  Blockly.Events.disable()
  ws.clear()
  const root = ws.newBlock('strategy_root')
  root.initSvg(); root.render(); root.moveBy(20, 20)

  const facSec = ws.newBlock('factors_section')
  root.getInput('FACTORS').connection.connect(facSec.previousConnection)
  let prev: any = null
  conf.factors.forEach(f => {
    const b = ws.newBlock('factor_item')
    b.setFieldValue(f.name, 'FACTOR')
    b.setFieldValue(f.direction, 'DIRECTION')
    b.setFieldValue(String(f.weight), 'WEIGHT')
    if (prev) prev.nextConnection.connect(b.previousConnection)
    else facSec.getInput('ITEMS').connection.connect(b.previousConnection)
    prev = b
  })

  const port = ws.newBlock('portfolio_settings')
  port.setFieldValue(String(conf.portfolio.top_n), 'TOP_N')
  port.setFieldValue(conf.portfolio.weight_method, 'WEIGHT_METHOD')
  root.getInput('PORTFOLIO').connection.connect(port.previousConnection)

  const reb = ws.newBlock('rebalancing_settings')
  reb.setFieldValue(conf.rebalancing.frequency, 'FREQUENCY')
  root.getInput('REBALANCING').connection.connect(reb.previousConnection)
  Blockly.Events.enable()
}

export default function StrategyBlocklyEditor({ value, onChange }: { value: StrategyConfig, onChange: (v: StrategyConfig) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const ws = useRef<any>(null)
  useEffect(() => {
    if (!ref.current) return
    ws.current = Blockly.inject(ref.current, { toolbox: TOOLBOX, scrollbars: true, zoom: { controls: true, wheel: true } })
    ws.current.addChangeListener(() => onChange(extract(ws.current)))
    apply(ws.current, value)
    return () => ws.current.dispose()
  }, [])
  useEffect(() => { if (ws.current && JSON.stringify(extract(ws.current)) !== JSON.stringify(value)) apply(ws.current, value) }, [value])
  return <div ref={ref} className="blockly__workspace" />
}