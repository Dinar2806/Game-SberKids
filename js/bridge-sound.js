// 1. МОСТ СБЕРKIDS WEBVIEW, ФОНОВАЯ МУЗЫКА И СИНТЕЗАТОР ЗВУКА (WebAudio API)
window.sendEvent = function sendEvent(type, extra) {
  if (type === 'CLOSE_EVENT' && window.Sound) {
    window.Sound.stopBgm();
  }
  const msg = Object.assign({ type: type }, extra || {});
  try { window.postMessage(msg, '*'); } catch (_) {}
  try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch (_) {}
};

window.Sound = {
  enabled: false,
  ctx: null,
  bgm: null,
  ensureBgm() {
    if (!this.bgm) {
      const domAudio = document.getElementById('bgmAudio');
      if (domAudio) {
        domAudio.loop = true;
        domAudio.volume = 0.02;
        this.bgm = domAudio;
      } else {
        try {
          const audio = new Audio('./assets/audio.mp3');
          audio.loop = true;
          audio.preload = 'none';
          audio.volume = 0.1;
          this.bgm = audio;
        } catch (_) {}
      }
    }
    return this.bgm;
  },
  syncBgm() {
    const audio = this.ensureBgm();
    if (!audio) return;
    if (this.enabled && !document.hidden) {
      audio.volume = 0.02; // music master volume
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      try { audio.pause(); } catch (_) {}
    }
  },
  stopBgm() {
    const audio = this.bgm || document.getElementById('bgmAudio');
    if (!audio) return;
    try { audio.pause(); } catch (_) {}
  },
  tone(freq, type, dur, endFreq) {
    if (!this.enabled) return;
    if (this.bgm && this.bgm.paused && !document.hidden) {
      const p = this.bgm.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
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

let soundButtonsInitialized = false;
window.initSoundButton = function initSoundButton() {
  if (soundButtonsInitialized) return;
  const btns = [
    document.getElementById('soundBtn'),
    document.getElementById('welcomeSoundBtn')
  ].filter(Boolean);
  if (!btns.length) return;
  soundButtonsInitialized = true;

  function syncSoundButtons() {
    btns.forEach(btn => {
      btn.textContent = Sound.enabled ? '🔊' : '🔇';
      btn.classList.toggle('sound-on', Sound.enabled);
      btn.setAttribute('aria-pressed', String(Sound.enabled));
      btn.setAttribute('aria-label', Sound.enabled ? 'Выключить звук и музыку' : 'Включить звук и музыку');
    });
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      Sound.enabled = !Sound.enabled;
      syncSoundButtons();
      Sound.syncBgm();
      if (Sound.enabled) Sound.coin();
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Sound.stopBgm();
    } else if (Sound.enabled) {
      Sound.syncBgm();
    }
  });
  window.addEventListener('pagehide', () => Sound.stopBgm());
};

