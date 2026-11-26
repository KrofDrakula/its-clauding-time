# Changelog

## 1.6.0 — 2026-11-26

- The context band no longer draws a progress bar. The context figure reads
  `Context 42% · 84k / 200k tokens`; the colours are the same.
- The 5h usage window now shows the time left until it resets, as H:mm:
  `5% (5h, 2:15 left) / 12% (week)`. The figure redraws each second with the
  other countdowns and drops back to `5% (5h)` when the engine gives no reset
  time.

## 1.5.1 — 2026-11-18

- The prompt cache countdown changes colour at fixed times for both cache
  lifetimes: yellow from 15 minutes left, red in the last minute. A 5-minute
  cache is yellow from its start.

## 1.5.0 — 2026-11-18

- The context band now shows when the conversation's prompt cache expires,
  beside the context figure: `cache 4:32`. The countdown starts at each main
  request that reads or writes the cache, uses the lifetime the API reports
  (5 minutes or 1 hour), and redraws each second on the wall clock. It turns
  yellow in the last minute and shows `cache cold` once the entry lapses.
  `/clear`, `/resume` and `/compact` remove it until the next response.
  Subagent requests do not move it.

## 1.4.0 — 2026-11-17

- The context band now shows the account's usage windows at the right end of
  its row: `5% (5h) / 12% (week)`. The figures come from the last response and
  update when a window moves a whole point. The text turns yellow at 50% and red
  at 80% of the fuller window. Off a subscription the engine reports no windows,
  and the right end stays empty.

## 1.3.0 — 2026-11-17

- Adds the context band, the plugin's first mod. A row above the prompt shows
  how full the context window is: a bar, the percentage, and the tokens used
  against the window size. The row turns yellow at 50% and red at 80%. It updates
  after each turn, `/compact`, `/clear` and `/resume`. While the engine has no
  figure (a new session, or just after a compact or clear) it shows
  `Context: no reading yet` until the next response.

## 1.2.0 — 2026-11-02

- Adds the `clauding:sveltekit-pwa` skill. It scaffolds a SvelteKit app as an
  offline-capable PWA with a Docker image in a new local git repository, then
  verifies the build, the offline reload and the container health.

## 1.1.0 — 2026-08-24

- Adds the `clauding:grug` output style. Claude talks to you in the voice of
  the grug brained developer. Code, comments, commit messages, and documents
  written for other people stay in clear English.

## 1.0.1 — 2026-08-24

- Documents the namespaced style name `clauding:STE100`. The bare name `STE100`
  does not resolve to a plugin-provided style.

## 1.0.0 — 2026-08-24

First release.

- Adds the `STE100` output style.
- Serves the repo as its own plugin marketplace (`krofdrakula`).
