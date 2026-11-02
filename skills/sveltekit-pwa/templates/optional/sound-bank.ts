// Short sound effects on the Web Audio clock. Sounds decode once into
// `AudioBuffer`s; each play creates a new source node scheduled with
// `start(when)`, which is sample-accurate where `setTimeout` skews by tens of
// milliseconds and is throttled in a hidden page.
//
// Create the bank inside a user gesture (a tap) so the `AudioContext` may start.
export class SoundBank {
  readonly #ctx: AudioContext;
  readonly #buffers = new Map<string, AudioBuffer>();

  constructor(ctx: AudioContext = new AudioContext()) {
    this.#ctx = ctx;
  }

  get state(): AudioContextState {
    return this.#ctx.state;
  }

  /** Calls `listener` when the context changes state (`suspended`, `interrupted`, `running`). */
  onStateChange(listener: () => void): () => void {
    this.#ctx.addEventListener('statechange', listener);
    return () => this.#ctx.removeEventListener('statechange', listener);
  }

  /** Starts or resumes the context. Needs a user gesture on iOS. */
  async resume(): Promise<void> {
    try {
      await this.#ctx.resume();
    } catch {
      // Stays suspended; the UI offers a tap to resume.
    }
  }

  /** Fetches and decodes the sounds. Returns the URLs that failed; those stay silent. */
  async load(urls: Iterable<string>): Promise<string[]> {
    const failed: string[] = [];
    await Promise.all(
      [...new Set(urls)].map(async (url) => {
        if (this.#buffers.has(url)) return;
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(String(response.status));
          this.#buffers.set(url, await this.#ctx.decodeAudioData(await response.arrayBuffer()));
        } catch {
          failed.push(url);
        }
      })
    );
    return failed;
  }

  currentTime(): number {
    return this.#ctx.currentTime;
  }

  /** Plays at context time `when`; a time in the past starts at once. */
  play(url: string, when: number): { cancel(): void } {
    const buffer = this.#buffers.get(url);
    if (!buffer) return { cancel() {} };
    const source = this.#ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.#ctx.destination);
    source.start(when);
    source.addEventListener('ended', () => source.disconnect());
    return {
      cancel() {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      }
    };
  }

  async close(): Promise<void> {
    try {
      await this.#ctx.close();
    } catch {
      // Already closed.
    }
  }
}
