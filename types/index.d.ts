export type ContextFill = { tokens: number; window: number; percent?: number } | null

// The account's usage windows the band shows, in display order: 5h, then week.
export type UsageLimits = { label: '5h' | 'week'; percent: number }[] | null

declare module 'claude-code' {
  interface PluginState {
    clauding: { context: ContextFill; limits: UsageLimits }
  }
}
