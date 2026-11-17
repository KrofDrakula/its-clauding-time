import type { Register } from 'claude-code'

import { registerContextBand } from './context-band'

// The plugin's one hooks module. Each mod lives in its own file beside it.
export const register: Register = on => {
  registerContextBand(on)
}
