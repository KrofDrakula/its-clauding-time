// Keeps the screen on while wanted (Screen Wake Lock API). The browser drops
// the lock when the page is hidden and a sentinel is single-use, so the lock
// is requested again on `visibilitychange`. Failures are ignored: a denied or
// unsupported lock must not stop the app.

/** The browser pieces the adapter needs; fake them in tests. */
export interface WakeLockEnv {
  /** Absent where the Screen Wake Lock API is unsupported. */
  request?: () => Promise<{ release(): Promise<void> }>;
  isVisible(): boolean;
  /** Calls `listener` on every visibility change; returns the unsubscribe function. */
  onVisibilityChange(listener: () => void): () => void;
}

export interface WakeLock {
  /** Wanted from now on: requested now and again whenever the page becomes visible. */
  acquire(): void;
  release(): void;
  dispose(): void;
}

export function createWakeLock(env: WakeLockEnv): WakeLock {
  let wanted = false;
  let held: { release(): Promise<void> } | undefined;
  let requesting = false;

  async function request() {
    if (!wanted || held || requesting || !env.request || !env.isVisible()) return;
    requesting = true;
    try {
      const sentinel = await env.request();
      if (wanted) held = sentinel;
      else await sentinel.release();
    } catch {
      // Denied (for example low battery) or unsupported.
    } finally {
      requesting = false;
    }
  }

  const off = env.onVisibilityChange(() => {
    if (!env.isVisible()) held = undefined; // released by the browser
    else void request();
  });

  return {
    acquire() {
      wanted = true;
      void request();
    },
    release() {
      wanted = false;
      const sentinel = held;
      held = undefined;
      sentinel?.release().catch(() => {});
    },
    dispose() {
      this.release();
      off();
    }
  };
}

export function browserWakeLockEnv(): WakeLockEnv {
  return {
    request: 'wakeLock' in navigator ? () => navigator.wakeLock.request('screen') : undefined,
    isVisible: () => document.visibilityState === 'visible',
    onVisibilityChange(listener) {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    }
  };
}
