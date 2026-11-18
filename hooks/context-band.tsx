import { atom, read, update } from 'claude-code'
import type {
  Color,
  EngineInterface,
  On,
  SessionContextUsage,
  SessionRateLimit,
  Timer,
  TurnUsage,
} from 'claude-code'

import type { ContextFill, PromptCache, UsageLimits } from '../types'

// The last context fill the engine reported. Kept in `$.state`, so a reload
// of the module keeps the figure on screen.
const fill = atom({ plugin: 'clauding', key: 'context' } as const, null)

// The account's rate-limit windows, by the same rule. Off a subscription the
// engine reports none, and the band then shows no figure on the right.
const limits = atom({ plugin: 'clauding', key: 'limits' } as const, null)

// The main thread's prompt cache, by the same rule. Null until a request reads
// or writes the cache, and again once the conversation is swapped or compacted.
const cache = atom({ plugin: 'clauding', key: 'cache' } as const, null)

const BAR_CELLS = 10
const WARN_AT = 50
const ALARM_AT = 80

// 84_000 -> "84k", 1_000_000 -> "1M", 912_500 -> "913k".
const compact = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return String(tokens)
}

const bar = (percent: number): string => {
  const cells = Math.round((percent / 100) * BAR_CELLS)
  const filled = Math.min(BAR_CELLS, Math.max(0, cells))
  return '█'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

const bandText = (context: ContextFill): string => {
  if (context?.tokens === undefined || context.percent === undefined) {
    return 'Context: no reading yet'
  }
  const { tokens, window, percent } = context
  return `Context ${bar(percent)} ${percent}% · ${compact(tokens)} / ${compact(window)} tokens`
}

// Autocompact starts near the top of the window: warn well before it.
const colorFor = (percent: number | undefined): Color => {
  if (percent === undefined) return 'subtle'
  if (percent >= ALARM_AT) return 'error'
  if (percent >= WARN_AT) return 'warning'
  return 'success'
}

// The windows the right side shows, in this order. A gateway's `spend_limit`
// is not an account budget and stays out.
const WINDOWS = [
  { kind: 'five_hour', label: '5h' },
  { kind: 'seven_day', label: 'week' },
] as const

const toLimits = (rateLimits: SessionRateLimit[]): UsageLimits => {
  const shown = WINDOWS.flatMap(({ kind, label }) => {
    const window = rateLimits.find(limit => limit.kind === kind)
    return window === undefined ? [] : [{ label, percent: window.percentUsed }]
  })
  return shown.length === 0 ? null : shown
}

// "5% (5h) / 12% (week)".
const limitsText = (windows: NonNullable<UsageLimits>): string =>
  windows.map(({ label, percent }) => `${Math.round(percent)}% (${label})`).join(' / ')

// Drops `breakdown`, which a stored figure has no use for.
const toFill = ({ tokens, window, percent }: SessionContextUsage): ContextFill =>
  tokens === undefined ? null : { tokens, window, percent }

const TTL_MS = { '5m': 300_000, '1h': 3_600_000 } as const
const CACHE_WARN_MS = 15 * 60_000
const CACHE_ALARM_MS = 60_000
const TICK_MS = 1_000

// The lifetime a response gave the cache, or undefined when it did not touch
// it. A write of both lifetimes counts as the shorter, as the engine counts it.
// A write with no lifetime named is five minutes, as /cost prices it. A read
// renews the entry at the lifetime of the last write.
const cacheTtl = (
  usage: TurnUsage,
  previous: '5m' | '1h' | undefined,
): '5m' | '1h' | undefined => {
  if (usage.cache_creation_input_tokens > 0) {
    if ((usage.ephemeral_5m_input_tokens ?? 0) > 0) return '5m'
    if ((usage.ephemeral_1h_input_tokens ?? 0) > 0) return '1h'
    return '5m'
  }
  if (usage.cache_read_input_tokens > 0) return previous ?? '5m'
  return undefined
}

const cacheLeftMs = (entry: NonNullable<PromptCache>, now: number): number =>
  entry.at + TTL_MS[entry.ttl] - now

// 272_400 -> "cache 4:32"; 0 or less -> "cache cold".
const cacheText = (leftMs: number): string => {
  if (leftMs <= 0) return 'cache cold'
  const seconds = Math.ceil(leftMs / 1_000)
  const rest = String(seconds % 60).padStart(2, '0')
  return `cache ${Math.floor(seconds / 60)}:${rest}`
}

// Fixed thresholds for both lifetimes: a five-minute entry is yellow from
// its start.
const cacheColor = (leftMs: number): Color => {
  if (leftMs <= 0) return 'subtle'
  if (leftMs <= CACHE_ALARM_MS) return 'error'
  if (leftMs <= CACHE_WARN_MS) return 'warning'
  return 'success'
}

// Reads the live figure. After /clear or /compact the engine has no fill
// until the next response, and the band then says so.
const refresh = async ($: EngineInterface) => {
  const { context, rateLimits } = await $.session.usage()
  await update($, fill, () => toFill(context))
  await update($, limits, () => toLimits(rateLimits))
}

// The countdown's redraw. Module state, so a reload starts one afresh; the
// engine stops the old copy's `every` at the reload.
let tick: Timer | undefined

// Redraws the band each second while the cache lives, and once more as it
// lapses, so the countdown keeps to the wall clock.
const startTick = ($: EngineInterface) => {
  tick?.cancel()
  tick = $.clock.every(TICK_MS, async () => {
    const entry = await read($, cache)
    if (entry === null) return
    if (cacheLeftMs(entry, await $.clock.now()) > -2 * TICK_MS) {
      $.ui.invalidate('ui.render')
    }
  })
}

export const registerContextBand = (on: On) => {
  // Seeds the band on launch, on enable and on a reload of this module.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    startTick($)
    return result
  })

  // Each main-thread request: the cache lifetime counts from its start, and
  // its usage says whether it read or wrote the cache, and for how long.
  // A subagent's requests use a cache of their own.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const at = await $.clock.now()
    const result = yield* next(e)
    if (result.usage !== null) {
      const previous = await read($, cache)
      const ttl = cacheTtl(result.usage, previous?.ttl)
      if (ttl !== undefined) await update($, cache, () => ({ at, ttl }))
    }
    return result
  })

  // The engine pushes this after each main-thread turn, and when a rate-limit
  // window moves a whole point. Each unit updates only when it moved.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, fill, () => toFill(e.context))
    }
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }
    return next(e)
  })

  // A manual /compact is not a turn, so no measurement follows it.
  // `precompute` keeps nothing, and a subagent's compact is not this window.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && !('skip' in result)) {
      await refresh($)
      await update($, cache, () => null)
    }
    return result
  })

  // /clear and /resume swap the conversation; no session.start follows.
  // The new conversation's cache is unknown until its first request.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    await update($, cache, () => null)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const context = await read($, fill)
    const windows = await read($, limits)
    const entry = await read($, cache)
    const cacheLeft = entry && cacheLeftMs(entry, await $.clock.now())
    const { Box, Text } = $.ui.resolve(e)
    const fullest = windows && Math.max(...windows.map(window => window.percent))

    return (
      <Box flexDirection="row" justifyContent="space-between" gap={2}>
        <Box flexDirection="row" flexShrink={1} gap={2}>
          <Box flexShrink={1}>
            <Text color={colorFor(context?.percent)} wrap="truncate">
              {bandText(context)}
            </Text>
          </Box>
          {cacheLeft !== null && (
            <Box flexShrink={0}>
              <Text color={cacheColor(cacheLeft)} wrap="truncate">
                {cacheText(cacheLeft)}
              </Text>
            </Box>
          )}
        </Box>
        {windows && (
          <Box flexShrink={0}>
            <Text color={colorFor(fullest ?? undefined)} wrap="truncate">
              {limitsText(windows)}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
