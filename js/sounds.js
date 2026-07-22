/* ========== UPDATE SOUNDS (Web Audio) ========== */
let audioCtx = null;
let lastSoundAt = 0;
const SOUND_MIN_MS = 40;

const SOUND_FREQ = {
  var: 784,
  array: 587,
  field: 880,
  decl: 698,
};

function initSounds() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
}

function playUpdateSound(kind) {
  if (!audioCtx) return;
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
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}
