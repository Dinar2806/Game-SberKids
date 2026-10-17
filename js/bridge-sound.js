// 1. МОСТ СБЕРKIDS WEBVIEW И СИНТЕЗАТОР ЗВУКА (WebAudio API)
window.sendEvent = function sendEvent(type, extra) {
  const msg = Object.assign({ type: type }, extra || {});
  try { window.postMessage(msg, '*'); } catch (_) {}
  try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch (_) {}
};

window.Sound = {
  enabled: false,
  ctx: null,
  tone(freq, type, dur, endFreq) {
    if (!this.enabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + dur);
      gain.gain.setValueAtTime(0.09, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    } catch (_) {}
  },
  swipe()  { this.tone(330, 'triangle', 0.1, 510); },
  coin()   { this.tone(587, 'sine', 0.08, 880); setTimeout(() => this.tone(880, 'sine', 0.13, 1174), 60); },
  bad()    { this.tone(210, 'sawtooth', 0.16, 120); },
  boing()  { this.tone(420, 'sine', 0.11, 760); },
  unlock() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 'triangle', 0.13), i * 70)); }
};

window.initSoundButton = function initSoundButton() {
  const soundBtn = document.getElementById('soundBtn');
  if (!soundBtn) return;
  soundBtn.addEventListener('click', () => {
    Sound.enabled = !Sound.enabled;
    soundBtn.textContent = Sound.enabled ? '🔊' : '🔇';
    soundBtn.classList.toggle('sound-on', Sound.enabled);
    if (Sound.enabled) Sound.coin();
  });
};
