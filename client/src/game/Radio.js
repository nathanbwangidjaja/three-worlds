// The car radio. One playlist — theirs ("499 miles") — nothing else.
// Spotify 30s previews play out of the box; full mp3s dropped into
// /public/music/<slug>.mp3 take over automatically. Playback is shared:
// whoever presses play/skip broadcasts it, and the driver's client is the
// metronome that advances tracks so both cars hear the same song.
import { Net } from "../net.js";

export class Radio {
  constructor() {
    this.tracks = [];
    this.playlistName = "the radio";
    this.idx = 0;
    this.playing = false;
    this.audio = new Audio();
    this.audio.volume = 0.0;
    this.targetVol = 0.55;
    this.full = {};            // slug → true/false, did /music/<slug>.mp3 exist
    this.visible = false;
    this.isMaster = false;     // drivers advance tracks; passengers follow
    this.onChanged = null;     // UI refresh hook
    this._endTimer = null;

    this.audio.addEventListener("ended", () => {
      if (this.isMaster && this.playing) this.next(true);
    });
    // fallback: if the master's "next" never arrives (they hopped out mid-song),
    // a follower nudges itself after a grace period
    this.audio.addEventListener("ended", () => {
      if (!this.isMaster && this.playing) {
        clearTimeout(this._endTimer);
        this._endTimer = setTimeout(() => {
          if (this.playing && this.audio.ended) this.next(true);
        }, 4000);
      }
    });
  }

  async load() {
    if (this.tracks.length) return;
    try {
      const res = await fetch("/data/radio.json", { cache: "no-cache" });
      const data = await res.json();
      this.tracks = data.tracks;
      this.playlistName = data.name;
    } catch (err) {
      console.warn("[radio] playlist failed to load:", err);
    }
  }

  track() { return this.tracks[this.idx] ?? null; }

  // full-song override if the mp3 exists, else the spotify preview
  async _srcFor(t) {
    if (!(t.slug in this.full)) {
      try {
        const head = await fetch(`/music/${t.slug}.mp3`, { method: "HEAD" });
        const type = head.headers.get("content-type") || "";
        // vite's dev server returns index.html for missing files — require audio
        this.full[t.slug] = head.ok && !type.includes("html");
      } catch { this.full[t.slug] = false; }
    }
    return this.full[t.slug] ? `/music/${t.slug}.mp3` : t.preview;
  }

  async _start(i, at = 0) {
    const t = this.tracks[i];
    if (!t) return;
    this.idx = i;
    const src = await this._srcFor(t);
    if (this.audio.src !== new URL(src, location.href).href) this.audio.src = src;
    try {
      if (at > 0) this._applySeek(at);
      await this.audio.play();
      this.playing = true;
    } catch (err) {
      // autoplay block — flips to playing on the next user gesture
      console.warn("[radio] play blocked:", err?.name);
      this.playing = false;
    }
    this.onChanged?.();
  }

  // seek that works whether or not the audio metadata has loaded yet
  _applySeek(at) {
    const a = this.audio;
    if (Number.isFinite(a.duration) && a.duration > 0) {
      try { a.currentTime = Math.max(0, Math.min(at, a.duration - 0.15)); } catch { /* not seekable yet */ }
    } else {
      const h = () => { try { a.currentTime = at; } catch { /* ignore */ } a.removeEventListener("loadedmetadata", h); };
      a.addEventListener("loadedmetadata", h);
    }
  }

  // ----- local controls (each broadcasts so the passenger hears the same)
  play(broadcast = true) {
    if (!this.tracks.length) return;
    this._start(this.idx, this.audio.currentTime || 0);
    if (broadcast) Net.sendEvent("radio", { a: "play", i: this.idx, t: this.audio.currentTime || 0, w: this.worldKey });
  }
  pause(broadcast = true) {
    this.audio.pause();
    this.playing = false;
    this.onChanged?.();
    if (broadcast) Net.sendEvent("radio", { a: "pause", w: this.worldKey });
  }
  toggle() { this.playing ? this.pause() : this.play(); }
  next(broadcast = true) {
    const i = (this.idx + 1) % this.tracks.length;
    this._start(i, 0);
    if (broadcast) Net.sendEvent("radio", { a: "play", i, t: 0, w: this.worldKey });
  }
  prev(broadcast = true) {
    const i = (this.idx - 1 + this.tracks.length) % this.tracks.length;
    this._start(i, 0);
    if (broadcast) Net.sendEvent("radio", { a: "play", i, t: 0, w: this.worldKey });
  }
  // jump straight to a specific track (from the playlist menu)
  pick(i, broadcast = true) {
    if (i < 0 || i >= this.tracks.length) return;
    this._start(i, 0);
    if (broadcast) Net.sendEvent("radio", { a: "play", i, t: 0, w: this.worldKey });
  }
  // scrub to a point in the current song (seconds)
  seek(t, broadcast = true) {
    this._applySeek(t);
    if (broadcast) Net.sendEvent("radio", { a: "seek", i: this.idx, t, w: this.worldKey });
  }
  restart(broadcast = true) { this.seek(0, broadcast); }

  // ----- partner's controls arriving over the wire
  onRemote(data) {
    if (!this.tracks.length) return;
    if (data.a === "play") this._start(data.i ?? 0, data.t ?? 0);
    else if (data.a === "pause") this.pause(false);
    else if (data.a === "seek") {
      if ((data.i ?? this.idx) !== this.idx) this._start(data.i, data.t ?? 0);
      else this._applySeek(data.t ?? 0);
    }
  }

  // ----- in/out of the car
  show(isMaster) {
    this.visible = true;
    this.isMaster = isMaster;
    this.onChanged?.();
  }
  hide() {
    this.visible = false;
    if (this.playing) this.pause(false);
    this.onChanged?.();
  }

  // gentle fade so getting in/out of the car isn't a hard audio cut
  tick(dt) {
    const want = this.visible && this.playing ? this.targetVol : 0;
    const v = this.audio.volume + (want - this.audio.volume) * Math.min(1, dt * 3);
    this.audio.volume = Math.max(0, Math.min(1, v));
  }
}
