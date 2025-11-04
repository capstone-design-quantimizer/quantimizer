import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly'
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
  weight_method: PortfolioWeighting;
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
    weight_method: 'equal',
  },
  rebalancing: {
    frequency: 'monthly',
  },
}

type FactorBlock = Blockly.BlockSvg & {
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
    const weight_method = String(input.portfolio.weight_method ?? base.portfolio.weight_method) as PortfolioWeighting
    if (WEIGHTING_OPTIONS.some(([, value]) => value === weight_method)) {
      base.portfolio.weight_method = weight_method
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

  Blockly.Extensions.register('factor_item_extension', function (this: FactorBlock) {
  const self = this as FactorBlock

  const updateModelVisibility = () => {
    const input = self.getInput('MODEL')
    if (!input) return
    const shouldShow = self.getFieldValue('FACTOR') === 'ML_MODEL'
    if (input.isVisible() === shouldShow) return
    Blockly.Events.disable()
    try {
      input.setVisible(shouldShow)
      if (self.rendered) self.render()
    } finally {
      Blockly.Events.enable()
    }
  }

  self.updateModelVisibility = updateModelVisibility
  updateModelVisibility()

  self.setOnChange((e: any) => {
    if (!e) return
    if (e.type !== Blockly.Events.BLOCK_CHANGE) return
    if (e.blockId !== self.id) return
    if (e.element !== 'field') return
    if (e.name !== 'FACTOR') return
    updateModelVisibility()
  })
})


  Blockly.defineBlocksWithJsonArray([
    {
      type: 'strategy_root',
      message0: '투자 전략',
      message1: 'Universe 설정 %1',
      args1: [{ type: 'input_statement', name: 'UNIVERSE', check: 'universe_section' }],
      message2: 'Factors 설정 %1',
      args2: [{ type: 'input_statement', name: 'FACTORS', check: 'factors_section' }],
      message3: '포트폴리오 구성 %1',
      args3: [{ type: 'input_statement', name: 'PORTFOLIO', check: 'portfolio_section' }],
      message4: '리밸런싱 %1',
      args4: [{ type: 'input_statement', name: 'REBALANCING', check: 'rebalancing_section' }],
      colour: 210,
      deletable: false
    },
    {
      type: 'universe_settings',
      message0: '시장 %1',
      args0: [
        { type: 'field_dropdown', name: 'MARKET', options: MARKET_OPTIONS }
      ],
      message1: '최소 시가총액 %1 억원',
      args1: [
        { type: 'field_number', name: 'MIN_CAP', value: 0, min: 0, precision: 1 }
      ],
      message2: '제외 - 관리종목 %1',
      args2: [
        { type: 'field_checkbox', name: 'EXCLUDE_MANAGED', checked: false }
      ],
      message3: '제외 - 거래정지 %1',
      args3: [
        { type: 'field_checkbox', name: 'EXCLUDE_SUSPENDED', checked: false }
      ],
      previousStatement: 'universe_section',
      colour: 195,
      tooltip: '투자 Universe를 정의합니다.'
    },
    {
      type: 'factors_section',
      message0: '팩터 조합',
      message1: '팩터 목록 %1',
      args1: [{ type: 'input_statement', name: 'ITEMS', check: 'factor_item' }],
      previousStatement: 'factors_section',
      colour: 220,
      deletable: false
    },
    {
      type: 'factor_item',
      message0: '팩터 %1 방향 %2',
      args0: [
        { type: 'field_dropdown', name: 'FACTOR', options: FACTOR_OPTIONS },
        { type: 'field_dropdown', name: 'DIRECTION', options: DIRECTION_OPTIONS }
      ],
      message1: '가중치 %1',
      args1: [
        { type: 'field_number', name: 'WEIGHT', value: 0.5, min: 0, max: 1, precision: 0.01 }
      ],
      message2: '모델 ID %1',
      args2: [
        { type: 'field_input', name: 'MODEL_ID', text: '' }
      ],
      previousStatement: 'factor_item',
      nextStatement: 'factor_item',
      colour: 245,
      tooltip: '하나의 팩터를 정의합니다.',
      extensions: ['factor_item_extension']
    },
    {
      type: 'portfolio_settings',
      message0: '종목 개수 %1 개',
      args0: [
        { type: 'field_number', name: 'TOP_N', value: 20, min: 1, precision: 1 }
      ],
      message1: '가중 방식 %1',
      args1: [
        { type: 'field_dropdown', name: 'WEIGHTING', options: WEIGHTING_OPTIONS }
      ],
      previousStatement: 'portfolio_section',
      colour: 165,
      tooltip: '포트폴리오 구성 방식'
    },
    {
      type: 'rebalancing_settings',
      message0: '리밸런싱 주기 %1',
      args0: [
        { type: 'field_dropdown', name: 'FREQUENCY', options: REBALANCING_OPTIONS }
      ],
      previousStatement: 'rebalancing_section',
      colour: 140,
      tooltip: '리밸런싱 일정'
    }
  ])
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
    const weight_method = portfolioBlock.getFieldValue('WEIGHT_METHOD') as PortfolioWeighting
    if (WEIGHTING_OPTIONS.some(([, value]) => value === weight_method)) {
      config.portfolio.weight_method = weight_method 
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
    portfolioBlock.setFieldValue(config.portfolio.weight_method, 'WEIGHT_METHOD')
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
