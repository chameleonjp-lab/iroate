// Original synthesis inspired by Sainome; no recorded or third-party audio.
export const SOUND_PREFERENCE_KEY = 'iroate:sound-enabled:v1';
// [offset seconds, frequency Hz, duration seconds, waveform]
export const SOUND_EVENTS = Object.freeze({
  select: [[0, 660, 0.045, 'sine']],
  cancel: [[0, 260, 0.075, 'triangle']],
  countdown: [[0, 520, 0.08, 'sine']],
  start: [[0, 660, 0.07, 'triangle'], [0.07, 990, 0.12, 'triangle']],
  correct: [[0, 880, 0.055, 'triangle'], [0.045, 1175, 0.065, 'triangle']],
  wrong: [[0, 150, 0.12, 'sawtooth']],
  clear: [[0, 523, 0.1, 'triangle'], [0.07, 659, 0.1, 'triangle'], [0.14, 784, 0.12, 'triangle']],
  result: [[0, 784, 0.075, 'sine']],
  best: [[0, 784, 0.08, 'triangle'], [0.07, 988, 0.08, 'triangle'], [0.14, 1175, 0.08, 'triangle'], [0.21, 1568, 0.13, 'triangle']],
  retire: [[0, 330, 0.08, 'triangle'], [0.08, 220, 0.1, 'triangle']]
});

function defaultStorage() { try { return globalThis.localStorage; } catch { return null; } }
function defaultContext() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return Context ? new Context() : null;
}

export class SoundEffects {
  constructor({storage = defaultStorage(), contextFactory = defaultContext} = {}) {
    this.storage = storage;
    this.contextFactory = contextFactory;
    this.enabled = true;
    try { this.enabled = storage?.getItem(SOUND_PREFERENCE_KEY) !== 'false'; } catch { /* Default ON; preserve saved OFF when readable. */ }
    this.context = null;
    this.masterGain = null;
    this.hidden = false;
    this.activeSounds = new Set();
    this.unlockPromise = null;
  }

  async setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try { this.storage?.setItem(SOUND_PREFERENCE_KEY, String(this.enabled)); } catch { /* Session only. */ }
    if (!this.enabled) await this.suspend();
    else await this.unlock();
  }

  async unlock() {
    if (!this.enabled || this.hidden) return false;
    if (this.unlockPromise) return this.unlockPromise;
    // Called directly from a trusted input handler, before its first await (iOS).
    this.unlockPromise = this.resumeContext();
    try { return await this.unlockPromise; }
    finally { this.unlockPromise = null; }
  }

  async resumeContext() {
    try {
      if (this.context?.state === 'closed') {
        this.stopActiveSounds();
        this.context = null;
      }
      if (!this.context) {
        const context = this.contextFactory();
        if (!context) return false;
        this.context = context;
        this.masterGain = context.createGain();
        this.masterGain.gain.setValueAtTime(0.24, context.currentTime);
        this.masterGain.connect(context.destination);
        context.onstatechange = () => {
          if (context.state !== 'running') this.stopActiveSounds();
        };
      }
      if (['suspended', 'interrupted'].includes(this.context.state)) await this.context.resume();
      if (!this.enabled || this.hidden) { await this.suspend(); return false; }
      return this.context.state === 'running';
    } catch { return false; }
  }

  async suspend() {
    this.stopActiveSounds();
    try { if (this.context?.state === 'running') await this.context.suspend(); } catch { /* Never interrupt play. */ }
  }

  handleVisibility(hidden) {
    this.hidden = Boolean(hidden);
    if (this.hidden) void this.suspend();
    // On return, resume only in the next trusted input handler.
  }

  stopActiveSounds() {
    for (const sound of [...this.activeSounds]) {
      try { sound.node.stop(); } catch { /* Already stopped. */ }
      sound.cleanup();
    }
  }

  play(event, {delay = 0, append = false} = {}) {
    const context = this.context;
    if (!this.enabled || this.hidden || context?.state !== 'running' || !Object.hasOwn(SOUND_EVENTS, event)) return false;
    const recipe = SOUND_EVENTS[event];
    if (!append || this.activeSounds.size + recipe.length > 12) this.stopActiveSounds();
    try {
      for (const [offset, frequency, duration, type] of recipe) {
        const when = context.currentTime + delay + offset;
        const node = context.createOscillator();
        const gain = context.createGain();
        node.type = type;
        node.frequency.setValueAtTime(frequency, when);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(event === 'wrong' ? 0.09 : 0.2, when + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        node.connect(gain);
        gain.connect(this.masterGain);
        const sound = {node, cleanup: () => {
          if (!this.activeSounds.delete(sound)) return;
          try { node.disconnect(); gain.disconnect(); } catch { /* Audio context lost. */ }
        }};
        this.activeSounds.add(sound);
        node.addEventListener('ended', sound.cleanup, {once:true});
        node.start(when);
        node.stop(when + duration + 0.01);
      }
      return true;
    } catch {
      this.stopActiveSounds();
      return false;
    }
  }
}
