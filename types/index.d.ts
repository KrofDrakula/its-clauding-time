export type ContextFill = { tokens: number; window: number; percent?: number } | null

declare module 'claude-code' {
  interface PluginState {
    clauding: { context: ContextFill }
  }
}
