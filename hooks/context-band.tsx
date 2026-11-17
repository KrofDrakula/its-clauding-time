import { atom, read, update } from 'claude-code'
import type {
  Color,
  EngineInterface,
  On,
  SessionContextUsage,
  SessionRateLimit,
} from 'claude-code'

import type { ContextFill, UsageLimits } from '../types'

// The last context fill the engine reported. Kept in `$.state`, so a reload
// of the module keeps the figure on screen.
const fill = atom({ plugin: 'clauding', key: 'context' } as const, null)

// The account's rate-limit windows, by the same rule. Off a subscription the
// engine reports none, and the band then shows no figure on the right.
const limits = atom({ plugin: 'clauding', key: 'limits' } as const, null)

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

// Reads the live figure. After /clear or /compact the engine has no fill
// until the next response, and the band then says so.
const refresh = async ($: EngineInterface) => {
  const { context, rateLimits } = await $.session.usage()
  await update($, fill, () => toFill(context))
  await update($, limits, () => toLimits(rateLimits))
}

export const registerContextBand = (on: On) => {
  // Seeds the band on launch, on enable and on a reload of this module.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
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
    }
    return result
  })

  // /clear and /resume swap the conversation; no session.start follows.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const context = await read($, fill)
    const windows = await read($, limits)
    const { Box, Text } = $.ui.resolve(e)
    const fullest = windows && Math.max(...windows.map(window => window.percent))

    return (
      <Box flexDirection="row" justifyContent="space-between" gap={2}>
        <Box flexShrink={1}>
          <Text color={colorFor(context?.percent)} wrap="truncate">
            {bandText(context)}
          </Text>
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
