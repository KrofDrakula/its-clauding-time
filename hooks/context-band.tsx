import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, On, SessionContextUsage } from 'claude-code'

import type { ContextFill } from '../types'

// The last context fill the engine reported. Kept in `$.state`, so a reload
// of the module keeps the figure on screen.
const fill = atom({ plugin: 'clauding', key: 'context' } as const, null)

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

// Drops `breakdown`, which a stored figure has no use for.
const toFill = ({ tokens, window, percent }: SessionContextUsage): ContextFill =>
  tokens === undefined ? null : { tokens, window, percent }

// Reads the live figure. After /clear or /compact the engine has no fill
// until the next response, and the band then says so.
const refresh = async ($: EngineInterface) => {
  const { context } = await $.session.usage()
  await update($, fill, () => toFill(context))
}

export const registerContextBand = (on: On) => {
  // Seeds the band on launch, on enable and on a reload of this module.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  // The engine pushes this after each main-thread turn. Only a move of the
  // context fill is news here; a rate-limit or cost move keeps the last fill.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, fill, () => toFill(e.context))
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
    const { Text } = $.ui.resolve(e)

    return (
      <Text color={colorFor(context?.percent)} wrap="truncate">
        {bandText(context)}
      </Text>
    )
  })
}
