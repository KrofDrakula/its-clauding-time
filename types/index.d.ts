export type ContextFill = { tokens: number; window: number; percent?: number } | null

// The account's usage windows the band shows, in display order: 5h, then week.
// `resetsAt` is when the window resets, in epoch milliseconds, when the engine
// says.
export type UsageLimits =
  | { label: '5h' | 'week'; percent: number; resetsAt?: number }[]
  | null

// The main thread's prompt cache: when its last request that read or wrote
// the cache started, in `$.clock.now()` milliseconds, and the lifetime the
// cache gave it. The entry lapses at `at` plus that lifetime.
export type PromptCache = { at: number; ttl: '5m' | '1h' } | null

declare module 'claude-code' {
  interface PluginState {
    clauding: { context: ContextFill; limits: UsageLimits; cache: PromptCache }
  }
}
