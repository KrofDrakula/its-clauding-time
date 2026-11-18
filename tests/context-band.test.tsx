import type { On, SessionMessage, TurnUsage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'clauding',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// Nothing sits beneath the plugin in a test: this hook stands for the engine.
const engine = (on: On) =>
  on('session.measure', (_, e) => ({ changed: e.changed }))

test('the band says there is no reading before the first response', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toBe(
      'Context: no reading yet',
    )
    await ui.unmount()
  }
})

test('the band shows the fill after a measurement', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toBe(
      'Context ████░░░░░░ 42% · 84k / 200k tokens',
    )
    await ui.unmount()
  }
})

test('the band follows the window of a 1M model', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { tokens: 912_500, window: 1_000_000, percent: 91 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toBe(
    'Context █████████░ 91% · 913k / 1M tokens',
  )
  await ui.unmount()
})

test('a measurement without a context move keeps the last fill', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [],
    changed: ['context'],
  })
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [],
    changed: ['rateLimits'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toContain('25%')
  await ui.unmount()
})

test('the band yields to a survey', async $ => {
  const ui = await $.ui.mount({
    ...BAND,
    surface: 'terminal',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
  await ui.unmount()
})

const TRANSCRIPT: SessionMessage[] = [{ role: 'user', text: 'hello', toolUses: [] }]

// Stands for the engine's `$.session.usage()`, answering the given fill.
const usage = (on: On, context: { tokens?: number; window: number; percent?: number }) =>
  on('session.usage', () => ({
    value: { startedAt: 0, context, rateLimits: [] },
  }))

const bandText = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = (await ui.find({ type: 'Text', text: /Context/ }))?.text
  await ui.unmount()
  return text
}

test('the band reads the fill at session start', async ($, on) => {
  usage(on, { tokens: 30_000, window: 200_000, percent: 15 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(await bandText($)).toContain('15%')
})

test('a manual compact drops the old fill', async ($, on) => {
  engine(on)
  usage(on, { window: 200_000 })
  on('session.compact', () => ({
    messages: [{ role: 'user', text: 'summary', toolUses: [] }],
  }))

  await $.session.measure({
    context: { tokens: 170_000, window: 200_000, percent: 85 },
    rateLimits: [],
    changed: ['context'],
  })
  await $.session.compact({ trigger: 'manual', messages: TRANSCRIPT })

  expect(await bandText($)).toBe('Context: no reading yet')
})

test('a skipped compact keeps the fill', async ($, on) => {
  engine(on)
  usage(on, { window: 200_000 })
  on('session.compact', () => ({ skip: 'blocked' }))

  await $.session.measure({
    context: { tokens: 170_000, window: 200_000, percent: 85 },
    rateLimits: [],
    changed: ['context'],
  })
  await $.session.compact({ trigger: 'manual', messages: TRANSCRIPT })

  expect(await bandText($)).toContain('85%')
})

for (const reason of ['clear', 'resume'] as const) {
  test(`a ${reason} reads the new conversation's fill`, async ($, on) => {
    engine(on)
    usage(on, reason === 'clear' ? { window: 200_000 } : { tokens: 60_000, window: 200_000, percent: 30 })
    on('session.end', (_, e) => ({ sessionId: e.sessionId }))

    await $.session.measure({
      context: { tokens: 170_000, window: 200_000, percent: 85 },
      rateLimits: [],
      changed: ['context'],
    })
    await $.session.end({ reason, sessionId: 's1', resume: { id: 's1' } })

    expect(await bandText($)).toBe(
      reason === 'clear'
        ? 'Context: no reading yet'
        : 'Context ███░░░░░░░ 30% · 60k / 200k tokens',
    )
  })
}

// The right side of the band: the usage windows.
const LIMITS = { type: 'Text', text: /\((5h|week)\)/ }

const limitsText = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = (await ui.find(LIMITS))?.text
  await ui.unmount()
  return text
}

test('the band shows the usage windows on the right', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 12.4 },
      { kind: 'five_hour', percentUsed: 5 },
      { kind: 'spend_limit', percentUsed: 70 },
    ],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find(LIMITS))?.text).toBe('5% (5h) / 12% (week)')
    expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toContain('42%')
    await ui.unmount()
  }
})

test('the band shows no usage figure off a subscription', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })

  expect(await limitsText($)).toBeUndefined()
})

test('a context move keeps the last usage figures', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 30 }],
    changed: ['rateLimits'],
  })
  await $.session.measure({
    context: { tokens: 10_000, window: 200_000, percent: 5 },
    rateLimits: [],
    changed: ['context'],
  })

  expect(await limitsText($)).toBe('30% (5h)')
})

test('the band reads the usage windows at session start', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 81 },
        { kind: 'seven_day', percentUsed: 40 },
      ],
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(await limitsText($)).toBe('81% (5h) / 40% (week)')
})

// The cache countdown, beside the context figure on the left.
const CACHE = { type: 'Text', text: /^cache / }

const cacheText = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = (await ui.find(CACHE))?.text
  await ui.unmount()
  return text
}

const NO_CACHE = {
  input_tokens: 10,
  output_tokens: 20,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  model: 'claude-opus-5-5',
} as const

// Stands for the engine's request: each step answers the next usage given.
const responses = (on: On, usages: TurnUsage[]) => {
  let index = 0
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: usages[index++] ?? null,
    }
  })
}

const step = async ($: Engine, agentId?: string) => {
  const stream = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-opus-5-5',
    messageCount: 1,
    ...(agentId === undefined ? {} : { agentId }),
  })
  for await (const _ of stream);
  return stream.result
}

test('the band shows no cache figure before the first request', async $ => {
  expect(await cacheText($)).toBeUndefined()
})

test('a five-minute write counts down from the request start', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  responses(on, [
    { ...NO_CACHE, cache_creation_input_tokens: 5_000, ephemeral_5m_input_tokens: 5_000, ephemeral_1h_input_tokens: 0 },
  ])

  await step($)
  expect(await cacheText($)).toBe('cache 5:00')

  await clock.advance(87_600)
  expect(await cacheText($)).toBe('cache 3:33')

  await clock.advance(200_000)
  expect(await cacheText($)).toBe('cache 0:13')
})

test('a one-hour write counts down from an hour', async ($, on) => {
  mock.clock(on)
  responses(on, [
    { ...NO_CACHE, cache_creation_input_tokens: 5_000, ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 5_000 },
  ])

  await step($)
  expect(await cacheText($)).toBe('cache 60:00')
})

test('a write with no lifetime named counts as five minutes', async ($, on) => {
  mock.clock(on)
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])

  await step($)
  expect(await cacheText($)).toBe('cache 5:00')
})

test('a read renews the entry at the last write\'s lifetime', async ($, on) => {
  const clock = mock.clock(on)
  responses(on, [
    { ...NO_CACHE, cache_creation_input_tokens: 5_000, ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 5_000 },
    { ...NO_CACHE, cache_read_input_tokens: 5_000 },
  ])

  await step($)
  await clock.advance(1_800_000)
  expect(await cacheText($)).toBe('cache 30:00')

  await step($)
  expect(await cacheText($)).toBe('cache 60:00')
})

test('a request that does not touch the cache keeps the countdown', async ($, on) => {
  const clock = mock.clock(on)
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }, NO_CACHE])

  await step($)
  await clock.advance(60_000)
  await step($)
  expect(await cacheText($)).toBe('cache 4:00')
})

test('a subagent\'s request leaves the main cache alone', async ($, on) => {
  mock.clock(on)
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])

  await step($, 'agent-1')
  expect(await cacheText($)).toBeUndefined()
})

test('the band says the cache is cold once it lapses', async ($, on) => {
  const clock = mock.clock(on)
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])

  await step($)
  await clock.advance(300_000)
  expect(await cacheText($)).toBe('cache cold')
})

test('the cache figure sits beside the context figure', async ($, on) => {
  engine(on)
  mock.clock(on)
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])

  await step($)
  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 5 }],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  expect(texts).toEqual([
    'Context ████░░░░░░ 42% · 84k / 200k tokens',
    'cache 5:00',
    '5% (5h)',
  ])
  await ui.unmount()
})

for (const reason of ['clear', 'resume'] as const) {
  test(`a ${reason} drops the cache figure`, async ($, on) => {
    mock.clock(on)
    usage(on, { window: 200_000 })
    responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])
    on('session.end', (_, e) => ({ sessionId: e.sessionId }))

    await step($)
    await $.session.end({ reason, sessionId: 's1', resume: { id: 's1' } })

    expect(await cacheText($)).toBeUndefined()
  })
}

test('a manual compact drops the cache figure', async ($, on) => {
  mock.clock(on)
  usage(on, { window: 200_000 })
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])
  on('session.compact', () => ({
    messages: [{ role: 'user', text: 'summary', toolUses: [] }],
  }))

  await step($)
  await $.session.compact({ trigger: 'manual', messages: TRANSCRIPT })

  expect(await cacheText($)).toBeUndefined()
})

test('the shown band redraws each second to keep the countdown live', async ($, on) => {
  const clock = mock.clock(on)
  usage(on, { window: 200_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find(CACHE))?.text).toBe('cache 5:00')

  await clock.advance(3_000)
  expect((await ui.find(CACHE))?.text).toBe('cache 4:57')
  await ui.unmount()
})

const cacheColor = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const color = (await ui.find(CACHE))?.props.color
  await ui.unmount()
  return color
}

test('a one-hour countdown turns yellow at 15 minutes and red in the last', async ($, on) => {
  const clock = mock.clock(on)
  responses(on, [
    { ...NO_CACHE, cache_creation_input_tokens: 5_000, ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 5_000 },
  ])

  await step($)
  expect(await cacheColor($)).toBe('success')

  await clock.advance(45 * 60_000 - 1_000)
  expect(await cacheColor($)).toBe('success')

  await clock.advance(1_000)
  expect(await cacheColor($)).toBe('warning')

  await clock.advance(14 * 60_000)
  expect(await cacheColor($)).toBe('error')

  await clock.advance(60_000)
  expect(await cacheColor($)).toBe('subtle')
})

test('a five-minute countdown starts yellow and turns red in the last minute', async ($, on) => {
  const clock = mock.clock(on)
  responses(on, [{ ...NO_CACHE, cache_creation_input_tokens: 5_000 }])

  await step($)
  expect(await cacheColor($)).toBe('warning')

  await clock.advance(4 * 60_000 - 1_000)
  expect(await cacheColor($)).toBe('warning')

  await clock.advance(1_000)
  expect(await cacheColor($)).toBe('error')
})
