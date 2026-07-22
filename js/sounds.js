/* ========== UPDATE SOUNDS (Web Audio) ========== */
let audioCtx = null;
let masterGain = null;
let lastSoundAt = 0;
const SOUND_MIN_MS = 40;
const SOUND_VOLUME_KEY = "pv-sound-volume";

const SOUND_FREQ = {
  var: 784,
  array: 587,
  field: 880,
  decl: 698,
};

/** 0–1 linear gain multiplier; default 0.7 */
let soundVolume = 0.7;

function clampVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1, Math.max(0, n));
}

function loadSoundVolume() {
  try {
    const raw = localStorage.getItem(SOUND_VOLUME_KEY);
    if (raw != null) soundVolume = clampVolume(parseFloat(raw));
  } catch (_) {
    /* ignore */
  }
  return soundVolume;
}

function getSoundVolume() {
  return soundVolume;
}

function setSoundVolume(v) {
  soundVolume = clampVolume(v);
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(soundVolume, audioCtx.currentTime, 0.02);
  }
  try {
    localStorage.setItem(SOUND_VOLUME_KEY, String(soundVolume));
  } catch (_) {
    /* ignore */
  }
  return soundVolume;
}

function initSounds() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = soundVolume;
  masterGain.connect(audioCtx.destination);
}

function playUpdateSound(kind) {
  if (!audioCtx || soundVolume <= 0.001) return;
  const nowMs = performance.now();
  if (nowMs - lastSoundAt < SOUND_MIN_MS) return;
  lastSoundAt = nowMs;

  if (audioCtx.state === "suspended") audioCtx.resume();

  const freq = SOUND_FREQ[kind] || SOUND_FREQ.var;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.07, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);

  osc.connect(gain);
  gain.connect(masterGain || audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

/** Soft rising whoosh — distinct from the short update beep */
function playPointerSlideSound() {
  if (!audioCtx || soundVolume <= 0.001) return;
  if (audioCtx.state === "suspended") audioCtx.resume();

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(720, t + 0.14);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + 0.12);
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.055, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain || audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

loadSoundVolume();
