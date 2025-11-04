import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import 'blockly/msg/ko'

export type MarketCode = 'KOSPI' | 'KOSDAQ' | 'ALL'
export type FactorName =
  | 'PER'
  | 'PBR'
  | 'ROE'
  | 'OperatingMargin'
  | 'Momentum_3M'
  | 'Momentum_12M'
  | 'ML_MODEL'
export type FactorDirection = 'asc' | 'desc'
export type PortfolioWeighting = 'equal' | 'market_cap'
export type RebalancingFrequency = 'monthly' | 'quarterly'

export interface UniverseConfig {
  market: MarketCode
  min_market_cap: number
  exclude: string[]
}

export interface FactorConfig {
  name: FactorName
  direction: FactorDirection
  weight: number
  model_id?: string
}

export interface PortfolioConfig {
  top_n: number
  weighting: PortfolioWeighting
}

export interface RebalancingConfig {
  frequency: RebalancingFrequency
}

export interface StrategyConfig {
  universe: UniverseConfig
  factors: FactorConfig[]
  portfolio: PortfolioConfig
  rebalancing: RebalancingConfig
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  universe: {
    market: 'ALL',
    min_market_cap: 0,
    exclude: [],
  },
  factors: [],
  portfolio: {
    top_n: 20,
    weighting: 'equal',
  },
  rebalancing: {
    frequency: 'monthly',
  },
}

type FactorBlock = Blockly.Block & {
  updateModelVisibility?: () => void
}

type ToolboxDefinition = Blockly.utils.toolbox.ToolboxDefinition

const FACTOR_OPTIONS: Array<[string, FactorName]> = [
  ['PER (주가수익비율)', 'PER'],
  ['PBR (주가순자산비율)', 'PBR'],
  ['ROE (자기자본이익률)', 'ROE'],
  ['영업이익률 (OperatingMargin)', 'OperatingMargin'],
  ['모멘텀 3M', 'Momentum_3M'],
  ['모멘텀 12M', 'Momentum_12M'],
  ['외부 ML 모델', 'ML_MODEL'],
]

const MARKET_OPTIONS: Array<[string, MarketCode]> = [
  ['KOSPI', 'KOSPI'],
  ['KOSDAQ', 'KOSDAQ'],
  ['전체 (KOSPI + KOSDAQ)', 'ALL'],
]

const DIRECTION_OPTIONS: Array<[string, FactorDirection]> = [
  ['오름차순 (낮을수록 좋음)', 'asc'],
  ['내림차순 (높을수록 좋음)', 'desc'],
]

const WEIGHTING_OPTIONS: Array<[string, PortfolioWeighting]> = [
  ['동일 가중', 'equal'],
  ['시가총액 가중', 'market_cap'],
]

const REBALANCING_OPTIONS: Array<[string, RebalancingFrequency]> = [
  ['월말', 'monthly'],
  ['분기말', 'quarterly'],
]

const TOOLBOX: ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '팩터',
      colour: '#2563EB',
      contents: [
        {
          kind: 'block',
          type: 'factor_item',
        },
      ],
    },
  ],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const normalizeStrategyConfig = (input: unknown): StrategyConfig => {
  const base: StrategyConfig = {
    universe: { ...DEFAULT_STRATEGY_CONFIG.universe },
    factors: [],
    portfolio: { ...DEFAULT_STRATEGY_CONFIG.portfolio },
    rebalancing: { ...DEFAULT_STRATEGY_CONFIG.rebalancing },
  }

  if (!isRecord(input)) {
    return base
  }

  if (isRecord(input.universe)) {
    const market = String(input.universe.market ?? base.universe.market)
    if (MARKET_OPTIONS.some(([, value]) => value === market)) {
      base.universe.market = market as MarketCode
    }
    const minCap = Number(input.universe.min_market_cap)
    base.universe.min_market_cap = Number.isFinite(minCap) && minCap >= 0 ? Math.floor(minCap) : base.universe.min_market_cap
    if (Array.isArray(input.universe.exclude)) {
      const set = new Set<string>()
      for (const item of input.universe.exclude) {
        if (typeof item !== 'string') continue
        const normalized = item.trim().toLowerCase()
        if (normalized === 'managed' || normalized === 'suspended') {
          set.add(normalized)
        }
      }
      base.universe.exclude = Array.from(set)
    }
  }

  if (Array.isArray(input.factors)) {
    const factors: FactorConfig[] = []
    for (const raw of input.factors) {
      if (!isRecord(raw)) continue
      const name = String(raw.name ?? '').trim() as FactorName
      if (!FACTOR_OPTIONS.some(([, value]) => value === name)) continue
      const direction = String(raw.direction ?? 'desc').trim() as FactorDirection
      const validDirection = DIRECTION_OPTIONS.some(([, value]) => value === direction) ? direction : 'desc'
      const weightValue = Number(raw.weight)
      const weight = Number.isFinite(weightValue) ? weightValue : 0
      if (name === 'ML_MODEL') {
        const modelId = typeof raw.model_id === 'string' ? raw.model_id.trim() : ''
        factors.push({ name, direction: validDirection, weight, model_id: modelId })
      } else {
        factors.push({ name, direction: validDirection, weight })
      }
    }
    base.factors = factors
  }

  if (isRecord(input.portfolio)) {
    const topN = Number(input.portfolio.top_n)
    base.portfolio.top_n = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : base.portfolio.top_n
    const weighting = String(input.portfolio.weighting ?? base.portfolio.weighting) as PortfolioWeighting
    if (WEIGHTING_OPTIONS.some(([, value]) => value === weighting)) {
      base.portfolio.weighting = weighting
    }
  }

  if (isRecord(input.rebalancing)) {
    const frequency = String(input.rebalancing.frequency ?? base.rebalancing.frequency) as RebalancingFrequency
    if (REBALANCING_OPTIONS.some(([, value]) => value === frequency)) {
      base.rebalancing.frequency = frequency
    }
  }

  return base
}

let blocksInitialized = false

const initializeBlocks = () => {
  if (blocksInitialized) {
    return
  }
  blocksInitialized = true

  Blockly.Blocks['strategy_root'] = {
    init() {
      this.appendDummyInput().appendField('투자 전략')
      this.appendStatementInput('UNIVERSE').setCheck('universe_section').appendField('Universe 설정')
      this.appendStatementInput('FACTORS').setCheck('factors_section').appendField('Factors 설정')
      this.appendStatementInput('PORTFOLIO').setCheck('portfolio_section').appendField('포트폴리오 구성')
      this.appendStatementInput('REBALANCING').setCheck('rebalancing_section').appendField('리밸런싱')
      this.setColour(210)
      this.setDeletable(false)
    },
  }

  Blockly.Blocks['universe_settings'] = {
    init() {
      this.appendDummyInput()
        .appendField('시장')
        .appendField(new Blockly.FieldDropdown(MARKET_OPTIONS), 'MARKET')
      this.appendDummyInput()
        .appendField('최소 시가총액')
        .appendField(new Blockly.FieldNumber(0, 0, Number.POSITIVE_INFINITY, 1), 'MIN_CAP')
        .appendField('억원')
      this.appendDummyInput()
        .appendField('제외 - 관리종목')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'EXCLUDE_MANAGED')
      this.appendDummyInput()
        .appendField('제외 - 거래정지')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'EXCLUDE_SUSPENDED')
      this.setPreviousStatement(true, 'universe_section')
      this.setColour(195)
      this.setTooltip('투자 Universe를 정의합니다.')
    },
  }

  Blockly.Blocks['factors_section'] = {
    init() {
      this.appendDummyInput().appendField('팩터 조합')
      this.appendStatementInput('ITEMS').setCheck('factor_item').appendField('팩터 목록')
      this.setPreviousStatement(true, 'factors_section')
      this.setColour(220)
      this.setDeletable(false)
    },
  }

  Blockly.Blocks['factor_item'] = {
    init(this: FactorBlock) {
      this.appendDummyInput('FACTOR_HEADER')
        .appendField('팩터')
        .appendField(new Blockly.FieldDropdown(FACTOR_OPTIONS), 'FACTOR')
        .appendField('방향')
        .appendField(new Blockly.FieldDropdown(DIRECTION_OPTIONS), 'DIRECTION')
      this.appendDummyInput('FACTOR_WEIGHT')
        .appendField('가중치')
        .appendField(new Blockly.FieldNumber(0.5, 0, 1, 0.01), 'WEIGHT')
      this.appendDummyInput('MODEL')
        .appendField('모델 ID')
        .appendField(new Blockly.FieldTextInput(''), 'MODEL_ID')
      this.setPreviousStatement(true, 'factor_item')
      this.setNextStatement(true, 'factor_item')
      this.setColour(245)
      this.setTooltip('하나의 팩터를 정의합니다.')

      const updateModelVisibility = () => {
        if (!this.workspace || this.isInFlyout) return
        const shouldShow = this.getFieldValue('FACTOR') === 'ML_MODEL'
        const input = this.getInput('MODEL')
        if (input) {
          input.setVisible(shouldShow)
        }
        this.render()
      }

      this.updateModelVisibility = updateModelVisibility
      this.setOnChange(() => {
        updateModelVisibility()
      })
      updateModelVisibility()
    },
  }

  Blockly.Blocks['portfolio_settings'] = {
    init() {
      this.appendDummyInput()
        .appendField('종목 개수')
        .appendField(new Blockly.FieldNumber(20, 1, Number.POSITIVE_INFINITY, 1), 'TOP_N')
        .appendField('개')
      this.appendDummyInput()
        .appendField('가중 방식')
        .appendField(new Blockly.FieldDropdown(WEIGHTING_OPTIONS), 'WEIGHTING')
      this.setPreviousStatement(true, 'portfolio_section')
      this.setColour(165)
      this.setTooltip('포트폴리오 구성 방식')
    },
  }

  Blockly.Blocks['rebalancing_settings'] = {
    init() {
      this.appendDummyInput()
        .appendField('리밸런싱 주기')
        .appendField(new Blockly.FieldDropdown(REBALANCING_OPTIONS), 'FREQUENCY')
      this.setPreviousStatement(true, 'rebalancing_section')
      this.setColour(140)
      this.setTooltip('리밸런싱 일정')
    },
  }
}

initializeBlocks()

const extractStrategyFromWorkspace = (workspace: Blockly.WorkspaceSvg): StrategyConfig => {
  const config: StrategyConfig = {
    universe: { ...DEFAULT_STRATEGY_CONFIG.universe },
    factors: [],
    portfolio: { ...DEFAULT_STRATEGY_CONFIG.portfolio },
    rebalancing: { ...DEFAULT_STRATEGY_CONFIG.rebalancing },
  }

  const root = workspace.getBlocksByType('strategy_root', false)[0]
  if (!root) {
    return config
  }

  const universeBlock = root.getInputTargetBlock('UNIVERSE')
  if (universeBlock) {
    const market = universeBlock.getFieldValue('MARKET') as MarketCode
    if (MARKET_OPTIONS.some(([, value]) => value === market)) {
      config.universe.market = market
    }
    const minCap = Number(universeBlock.getFieldValue('MIN_CAP'))
    config.universe.min_market_cap = Number.isFinite(minCap) && minCap >= 0 ? Math.floor(minCap) : config.universe.min_market_cap
    const exclude: string[] = []
    if (universeBlock.getFieldValue('EXCLUDE_MANAGED') === 'TRUE') {
      exclude.push('managed')
    }
    if (universeBlock.getFieldValue('EXCLUDE_SUSPENDED') === 'TRUE') {
      exclude.push('suspended')
    }
    config.universe.exclude = exclude
  }

  const factorsSection = root.getInputTargetBlock('FACTORS')
  if (factorsSection) {
    const items: FactorConfig[] = []
    let current = factorsSection.getInputTargetBlock('ITEMS')
    while (current) {
      const name = current.getFieldValue('FACTOR') as FactorName
      if (FACTOR_OPTIONS.some(([, value]) => value === name)) {
        const direction = current.getFieldValue('DIRECTION') as FactorDirection
        const weight = Number(current.getFieldValue('WEIGHT'))
        const normalizedWeight = Number.isFinite(weight) ? weight : 0
        const factor: FactorConfig = {
          name,
          direction: DIRECTION_OPTIONS.some(([, value]) => value === direction) ? direction : 'desc',
          weight: normalizedWeight,
        }
        if (name === 'ML_MODEL') {
          const modelId = current.getFieldValue('MODEL_ID')
          factor.model_id = typeof modelId === 'string' ? modelId.trim() : ''
        }
        items.push(factor)
      }
      current = current.getNextBlock()
    }
    config.factors = items
  }

  const portfolioBlock = root.getInputTargetBlock('PORTFOLIO')
  if (portfolioBlock) {
    const topN = Number(portfolioBlock.getFieldValue('TOP_N'))
    config.portfolio.top_n = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : config.portfolio.top_n
    const weighting = portfolioBlock.getFieldValue('WEIGHTING') as PortfolioWeighting
    if (WEIGHTING_OPTIONS.some(([, value]) => value === weighting)) {
      config.portfolio.weighting = weighting
    }
  }

  const rebalancingBlock = root.getInputTargetBlock('REBALANCING')
  if (rebalancingBlock) {
    const frequency = rebalancingBlock.getFieldValue('FREQUENCY') as RebalancingFrequency
    if (REBALANCING_OPTIONS.some(([, value]) => value === frequency)) {
      config.rebalancing.frequency = frequency
    }
  }

  return config
}

const applyStrategyToWorkspace = (workspace: Blockly.WorkspaceSvg, config: StrategyConfig) => {
  Blockly.Events.disable()
  try {
    workspace.clear()
    const root = workspace.newBlock('strategy_root') as Blockly.BlockSvg
    root.initSvg()
    root.render()
    root.moveBy(32, 32)

    const universeBlock = workspace.newBlock('universe_settings') as Blockly.BlockSvg
    universeBlock.setFieldValue(config.universe.market, 'MARKET')
    universeBlock.setFieldValue(String(config.universe.min_market_cap ?? 0), 'MIN_CAP')
    universeBlock.setFieldValue(config.universe.exclude.includes('managed') ? 'TRUE' : 'FALSE', 'EXCLUDE_MANAGED')
    universeBlock.setFieldValue(config.universe.exclude.includes('suspended') ? 'TRUE' : 'FALSE', 'EXCLUDE_SUSPENDED')
    universeBlock.initSvg()
    universeBlock.render()
    root.getInput('UNIVERSE')?.connection?.connect(universeBlock.previousConnection)

    const factorsSection = workspace.newBlock('factors_section') as Blockly.BlockSvg
    factorsSection.initSvg()
    factorsSection.render()
    root.getInput('FACTORS')?.connection?.connect(factorsSection.previousConnection)

    let previousFactor: Blockly.Block | null = null
    for (const factor of config.factors) {
      const factorBlock = workspace.newBlock('factor_item') as Blockly.BlockSvg & FactorBlock
      factorBlock.setFieldValue(factor.name, 'FACTOR')
      factorBlock.setFieldValue(factor.direction, 'DIRECTION')
      factorBlock.setFieldValue(String(factor.weight ?? 0), 'WEIGHT')
      if (factor.name === 'ML_MODEL') {
        factorBlock.setFieldValue(factor.model_id?.trim() ?? '', 'MODEL_ID')
      }
      factorBlock.initSvg()
      factorBlock.render()
      factorBlock.updateModelVisibility?.()
      if (previousFactor) {
        previousFactor.nextConnection?.connect(factorBlock.previousConnection)
      } else {
        factorsSection.getInput('ITEMS')?.connection?.connect(factorBlock.previousConnection)
      }
      previousFactor = factorBlock
    }

    const portfolioBlock = workspace.newBlock('portfolio_settings') as Blockly.BlockSvg
    portfolioBlock.setFieldValue(String(config.portfolio.top_n ?? 20), 'TOP_N')
    portfolioBlock.setFieldValue(config.portfolio.weighting, 'WEIGHTING')
    portfolioBlock.initSvg()
    portfolioBlock.render()
    root.getInput('PORTFOLIO')?.connection?.connect(portfolioBlock.previousConnection)

    const rebalancingBlock = workspace.newBlock('rebalancing_settings') as Blockly.BlockSvg
    rebalancingBlock.setFieldValue(config.rebalancing.frequency, 'FREQUENCY')
    rebalancingBlock.initSvg()
    rebalancingBlock.render()
    root.getInput('REBALANCING')?.connection?.connect(rebalancingBlock.previousConnection)

    workspace.centerOnBlock(root.id)
  } finally {
    Blockly.Events.enable()
  }
  Blockly.svgResize(workspace)
}

export const StrategyBlocklyEditor = ({
  value,
  onChange,
}: {
  value: StrategyConfig
  onChange: (value: StrategyConfig) => void
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const lastSerializedRef = useRef<string>('')

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const workspace = Blockly.inject(element, {
      toolbox: TOOLBOX,
      trashcan: true,
      renderer: 'zelos',
      theme: Blockly.Theme.defineTheme('strategyTheme', {
        base: Blockly.Themes.Classic,
        name: 'strategyTheme',
      }),
      grid: {
        spacing: 24,
        length: 3,
        colour: '#e2e8f0',
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1,
        maxScale: 2,
        minScale: 0.5,
      },
    })

    workspaceRef.current = workspace

    const handleResize = () => {
      Blockly.svgResize(workspace)
    }

    const handleChange = () => {
      const nextConfig = extractStrategyFromWorkspace(workspace)
      const serialized = JSON.stringify(nextConfig)
      if (serialized !== lastSerializedRef.current) {
        lastSerializedRef.current = serialized
        onChange(nextConfig)
      }
    }

    workspace.addChangeListener(handleChange)
    window.addEventListener('resize', handleResize)

    applyStrategyToWorkspace(workspace, value)
    const initialConfig = extractStrategyFromWorkspace(workspace)
    lastSerializedRef.current = JSON.stringify(initialConfig)
    onChange(initialConfig)

    setTimeout(() => {
      Blockly.svgResize(workspace)
    }, 0)

    return () => {
      workspace.removeChangeListener(handleChange)
      window.removeEventListener('resize', handleResize)
      workspace.dispose()
      workspaceRef.current = null
    }
  }, [])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const serialized = JSON.stringify(value)
    if (serialized === lastSerializedRef.current) {
      return
    }
    applyStrategyToWorkspace(workspace, value)
    const normalized = extractStrategyFromWorkspace(workspace)
    lastSerializedRef.current = JSON.stringify(normalized)
    onChange(normalized)
  }, [value, onChange])

  return <div ref={containerRef} className="blockly__workspace" />
}

export default StrategyBlocklyEditor
