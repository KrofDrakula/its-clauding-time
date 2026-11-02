# Audio, wake lock, haptics and touch

Ready-made modules are in `templates/optional/`: `sound-bank.ts`, `wakelock.ts`, `haptics.ts`. Copy the ones the app needs into `src/lib/`.

## Choose the audio path

- Long media (speech, music, podcasts): one plain `<audio>` element, not routed through Web Audio. It streams, it seeks with range requests, and the lock screen can control it.
- Short effects with exact timing (beeps, cues): Web Audio with decoded `AudioBuffer`s (`SoundBank`).
- Seamless loops (ambient sound): `AudioBufferSourceNode` with `loop = true`, fed through a fade `GainNode`, then a volume `GainNode`, then the destination.
- Keep both paths in the app behind small interfaces (a `MediaOutput` and an `EffectsOutput` interface) so tests can fake the browser.

## Autoplay and unlock

- Create the `AudioContext` and call `resume()` inside the tap handler. Browsers start it only after a user gesture.
- Call `element.play()` synchronously in the handler, with no `await` before it. Safari rejects a `play()` that leaves the gesture.
- Treat `AudioContext.state` `suspended` and `interrupted` (iOS: phone call, Siri, another app) as "needs a tap". Listen to `statechange`, show a resume prompt, and call `resume()` from that tap. `resume()` can reject; catch it.
- A new `src` aborts a pending `play()` with `AbortError`. Ignore that one error; report others.
- Track `wantPlaying` yourself. A `pause` event while `wantPlaying` is true and the element is not `ended` is an interruption the app did not ask for. The end of a file also fires `pause` before `ended`; do not count it.

## iOS audio session

Set `navigator.audioSession.type = 'playback'` before the first sound when the property exists. Without it the Silent switch mutes Web Audio and iOS suspends it in the background. Chrome has no such API; feature-detect it.

## Timing

- Schedule with `source.start(when)` on the `AudioContext` clock. A `when` in the past starts at once.
- Use a look-ahead scheduler: a timer of about 25 ms schedules events inside a 100 ms window. A short window lets pause and skip cancel pending sounds. Keep each `source.stop()` handle for that.
- Derive elapsed and remaining time from wall-clock timestamps (`performance.now()`), never from tick counts. Timers are throttled in hidden pages.
- On `visibilitychange` to visible, run the scheduler tick at once to catch up, then `resume()` the context.
- Decode each sound once and keep the `AudioBuffer`. Create a new source node per play. A source node plays once.
- A sound that fails to fetch or decode stays silent. Return the failed list and show a notice. Do not block the run.
- When files come from the Cache API: `cache.match`, `arrayBuffer`, `decodeAudioData`.

## Loops, fades and sleep timers

- Run every fade on the audio clock: `gain.setValueAtTime(gain.value, now)` after `cancelScheduledValues(now)`, then `linearRampToValueAtTime`. Timers cannot do this without audible steps.
- A crossfade releases the old voice (ramp to 0, then `stop(now + length)`) while a new voice ramps in.
- A scheduled `source.stop(t)` cannot be taken back. To cancel a scheduled stop, start a new source at the right loop offset (`offset % buffer.duration`) on the same gain node and stop the old one now.
- Give every `play()` and `stop()` a token. A slow decode must not start a voice that is no longer wanted.
- Cut loop files so the loop is sample-exact: crossfade the end into the start inside the file, and play it with no fade at the loop point. Compressed formats add encoder padding; use a lossless or gapless format for loops.
- Move volume with `setTargetAtTime(value, now, 0.05)` to avoid clicks.
- Use `onended` of the stopping source as a signal to re-check the clock; the audio thread stops it, not the main thread.

## Lock screen and background

- No specification guarantees audio with the screen locked. Pre-scheduled Web Audio cues kept playing with the screen locked in a browser tab on one tested Android device, with no keep-alive trick. Treat locked-screen audio as best effort and test on real devices, in the installed app and in a long run.
- For long media, add the Media Session: `navigator.mediaSession.metadata = new MediaMetadata({ title, artist, artwork })`, `playbackState`, and `setActionHandler` for `play`, `pause` and `nexttrack`. Wrap each `setActionHandler` in `try/catch`; browsers throw on actions they do not know. Update the metadata only when the item changes.
- Do not set `element.volume` when the app must play at full volume;

## Wake lock

- `navigator.wakeLock.request('screen')` keeps the screen on. The browser releases it when the page is hidden, and a sentinel works once. Request again on `visibilitychange` to visible (`wakelock.ts` does).
- Support: absent in some browsers, and in iOS Home Screen apps only from iOS 18.4. Feature-detect, and ignore a denied request (low battery).
- Acquire when a run starts or resumes. Release on pause and at the end.

## Haptics

`navigator.vibrate` works in Android Chrome and does nothing in iOS Safari. Call it through a helper that checks for it (`haptics.ts`).

## Serving media: range requests

The browser seeks by asking for byte ranges. The file route must:

- Answer `Range` with `206`, `Content-Range: bytes start-end/size` and `Content-Length`; answer an unsatisfiable range with `416` and `Content-Range: bytes */size`.
- Send `Accept-Ranges: bytes` and the right `Content-Type` from an extension map. Reject unknown extensions.
- Cap an open-ended range (`bytes=N-`) at a chunk (4 MiB). Without the cap, a seek streams to the end of the file, and the next seek waits for that transfer to end.
- Stream with `Readable.toWeb(createReadStream(path, { start, end }))`.
- Turn a request path into a file path in one function that rejects `..`, hidden files and absolute paths. Allow non-ASCII letters in file names.
- Send `Last-Modified` and a modest `Cache-Control: public, max-age=86400` when files can change on disk.
- Keep user content outside the image. Mount a volume and set its path in `src/env.ts` with `defineEnvVars`, read at start, not at build time.

The service worker repeats the same rules for stored files (`range.ts`), with no cap, because the bytes come from a local blob. Parse leniently: iOS once sent `bytes=0-*`.

## Touch and layout quirks

- iOS Safari ignores `touch-action` for pinch on fixed elements. Call `preventDefault()` on `gesturestart` (window level) to stop page zoom. For a custom pinch-zoom image, handle `gesturestart` and `gesturechange` (Safari only; not in the DOM types) next to touch events.
- A touch or pen drag also fires `pointermove`. Wake the idle UI only for `pointerType === 'mouse'`.
- `<dialog closedby="any">` does not exist in Safari. Close the dialog on a click on its backdrop.
- Use `<meta name="text-scale" content="scale">` so text follows the user's system text size.
- Pad fixed UI with `env(safe-area-inset-*)`; the installed iOS app draws under the notch and the home indicator.
- Set `background: #000` on `<html>` in `app.html`, so system bars never flash white before CSS loads.
- Self-host fonts in `static/fonts/` (a `@font-face` CSS file plus the `woff2` subsets) and preload the main file. The worker then caches them as part of the shell, and no third-party origin is needed offline.
