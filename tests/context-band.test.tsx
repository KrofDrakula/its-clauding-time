import type { On, SessionMessage } from 'claude-code'
import { expect, test } from 'claude-code/testing'
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
