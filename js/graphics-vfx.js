// Графика: фоны, комикс-штампы, SVG-маскот Вольтик 2.0, SVG-сцены карточек и движок частиц VFX
function shiftBackground(stepIdx) {
  const theme = BG_THEMES[stepIdx % BG_THEMES.length];
  document.body.style.setProperty('--scene-accent', theme.s2);
  const s1 = document.getElementById('bgShape1');
  const s2 = document.getElementById('bgShape2');
  const s3 = document.getElementById('bgShape3');
  s1.style.backgroundColor = theme.s1;
  s2.style.backgroundColor = theme.s2;
  s3.style.backgroundColor = theme.s3;

  const ox = ((stepIdx * 47) % 90) - 45;
  const oy = ((stepIdx * 31) % 80) - 40;
  s1.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${1 + (stepIdx % 3) * 0.1})`;
  s2.style.transform = `translate3d(${-ox}px, ${-oy}px, 0) scale(${1.1 - (stepIdx % 2) * 0.1})`;
  s3.style.transform = `translate3d(${oy * 1.3}px, ${-ox}px, 0)`;
}

// 5. КОМИКС-ШТАМПЫ
const comicPop = document.getElementById('comicPop');
const screenFlash = document.getElementById('screenFlash');
let popTimer = null;

const GOOD_WORDS = ['ЗДОРОВО! ✦', 'ОТЛИЧНЫЙ ХОД! ⚡', 'ТАК ДЕРЖАТЬ! 🌟', 'ПОЛУЧИЛОСЬ! 🎯'];
const BAD_WORDS  = ['ПОПРОБУЕМ ЕЩЁ! ✦', 'УЧИМСЯ ВМЕСТЕ! 💡'];
const THINK_WORDS = ['ЕСТЬ НАД ЧЕМ ПОДУМАТЬ! 💡', 'ИНТЕРЕСНЫЙ ВЫБОР! ✦'];

function triggerComicJuice(type) {
  let word = THINK_WORDS[Math.floor(Math.random() * THINK_WORDS.length)];
  let bg = '#6366f1';
  let flashColor = 'rgba(99, 102, 241, 0.18)';

  if (type === 'happy') {
    word = GOOD_WORDS[Math.floor(Math.random() * GOOD_WORDS.length)];
    bg = '#10b981';
    flashColor = 'rgba(16, 185, 129, 0.22)';
  } else if (type === 'scared') {
    word = BAD_WORDS[Math.floor(Math.random() * BAD_WORDS.length)];
    bg = '#f43f5e';
    flashColor = 'rgba(244, 63, 94, 0.25)';
  }

  screenFlash.style.backgroundColor = flashColor;
  screenFlash.style.opacity = '0.18';
  setTimeout(() => { screenFlash.style.opacity = '0'; }, 160);

  const angle = (Math.random() * 14 - 7).toFixed(1);
  comicPop.textContent = word;
  comicPop.style.backgroundColor = bg;
  comicPop.style.transform = `translate(-50%, -50%) scale(1.08) rotate(${angle}deg)`;
  comicPop.classList.add('show');
  clearTimeout(popTimer);
  popTimer = setTimeout(() => {
    comicPop.classList.remove('show');
    comicPop.style.transform = 'translate(-50%, -50%) scale(0)';
  }, 650);
}

function renderMascot(mood, bubbleText, lookDir = 0, isHintBubble = false) {
  let visorColor = '#38bdf8';
  let visorStroke = '#0284c7';
  let badgeAddon = '';
  let ears = `
    <polygon points="19,43 7,9 39,27" fill="url(#vFur)" stroke="#9a3412" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="21,38 13,16 34,28" fill="#fde047"/>
    <polygon points="81,43 93,9 61,27" fill="url(#vFur)" stroke="#9a3412" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="79,38 87,16 66,28" fill="#fde047"/>`;
  let eyes = `
    <circle cx="36" cy="52" r="6.2" fill="#ffffff" stroke="#0f172a" stroke-width="1.8"/>
    <g class="mascot-pupil" data-eye-x="36"><circle cx="36" cy="52" r="3.6" fill="#0f172a"/>
    <circle cx="34.8" cy="50.4" r="1.4" fill="#ffffff"/></g>
    <circle cx="64" cy="52" r="6.2" fill="#ffffff" stroke="#0f172a" stroke-width="1.8"/>
    <g class="mascot-pupil" data-eye-x="64"><circle cx="64" cy="52" r="3.6" fill="#0f172a"/>
    <circle cx="62.8" cy="50.4" r="1.4" fill="#ffffff"/></g>`;
  let mouth = `<path d="M43 64 Q50 70 57 64" stroke="#0f172a" stroke-width="3" fill="none" stroke-linecap="round"/>`;

  if (mood === 'happy') {
    visorColor = '#34d399';
    visorStroke = '#059669';
    eyes = `
      <path d="M30 52 Q36 44 42 52" stroke="#0f172a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M58 52 Q64 44 70 52" stroke="#0f172a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M41 61 Q50 73 59 61 Z" fill="#f43f5e" stroke="#0f172a" stroke-width="2.5"/>`;
    badgeAddon = `<text x="82" y="22" font-size="14">✨</text>`;
  } else if (mood === 'scared') {
    visorColor = '#fb7185';
    visorStroke = '#e11d48';
    ears = `
      <polygon points="20,45 4,28 36,33" fill="url(#vFur)" stroke="#9a3412" stroke-width="3" stroke-linejoin="round"/>
      <polygon points="80,45 96,28 64,33" fill="url(#vFur)" stroke="#9a3412" stroke-width="3" stroke-linejoin="round"/>`;
    eyes = `
      <circle cx="36" cy="52" r="7" fill="#fff" stroke="#0f172a" stroke-width="2.5"/><circle cx="36" cy="52" r="2.6" fill="#0f172a"/>
      <circle cx="64" cy="52" r="7" fill="#fff" stroke="#0f172a" stroke-width="2.5"/><circle cx="64" cy="52" r="2.6" fill="#0f172a"/>`;
    mouth = `<ellipse cx="50" cy="65" rx="5.5" ry="4.5" fill="#0f172a"/>`;
  } else if (mood === 'think' || mood === 'detective') {
    visorColor = '#fbbf24';
    visorStroke = '#d97706';
    eyes = `
      <circle cx="36" cy="52" r="4.8" fill="#0f172a"/>
      <circle cx="34.8" cy="50.5" r="1.4" fill="#ffffff"/>
      <rect x="57" y="49" width="13" height="4.2" rx="2" fill="#0f172a"/>`;
    mouth = `<line x1="44" y1="64" x2="56" y2="63" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>`;
    badgeAddon = `<g transform="translate(68, 44)"><circle cx="10" cy="10" r="8" fill="rgba(56,189,248,0.35)" stroke="#0284c7" stroke-width="2.6"/><line x1="16" y1="16" x2="22" y2="22" stroke="#0f172a" stroke-width="3.2" stroke-linecap="round"/></g>`;
  }

  mascotAvatar.style.transform = `rotate(${lookDir * 6}deg) scale(${mood === 'happy' ? 1.08 : 1})`;
  mascotAvatar.innerHTML = `<svg viewBox="0 0 100 90">
    <defs>
      <linearGradient id="vFur" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fb923c"/>
        <stop offset="100%" stop-color="#ea580c"/>
      </linearGradient>
    </defs>
    ${ears}
    <path d="M14 55 Q8 62 19 72 Q34 83 50 83 Q66 83 81 72 Q92 62 86 55 Q86 28 50 28 Q14 28 14 55 Z" fill="url(#vFur)" stroke="#9a3412" stroke-width="3"/>
    <path d="M20 57 Q33 48 50 56 Q67 48 80 57 Q72 78 50 78 Q28 78 20 57 Z" fill="#fff7ed"/>
    <ellipse cx="27" cy="61" rx="4.8" ry="2.8" fill="#fb7185" opacity="0.6"/>
    <ellipse cx="73" cy="61" rx="4.8" ry="2.8" fill="#fb7185" opacity="0.6"/>
    <rect x="23" y="26" width="54" height="13" rx="6.5" fill="${visorColor}" stroke="${visorStroke}" stroke-width="2.5"/>
    <line x1="30" y1="30" x2="46" y2="30" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
    <circle cx="67" cy="32.5" r="3" fill="#ffffff" opacity="0.85"/>
    ${eyes}
    <polygon points="46,56 54,56 50,61" fill="#0f172a"/>
    ${mouth}
    <ellipse cx="26" cy="81" rx="9" ry="5.5" fill="#f97316" stroke="#9a3412" stroke-width="2.5"/>
    <ellipse cx="74" cy="81" rx="9" ry="5.5" fill="#f97316" stroke="#9a3412" stroke-width="2.5"/>
    ${badgeAddon}
  </svg>`;
  updateMascotGaze();

}

// Цель в координатах SVG учитывает смещение и наклон самого Вольтика.
function updateMascotGaze() {
  const svg = mascotAvatar.querySelector('svg');
  const matrix = svg?.getScreenCTM();
  if (!matrix || !cardEl.getClientRects().length) return;
  const card = cardEl.getBoundingClientRect();
  const point = svg.createSVGPoint();
  point.x = card.left + card.width / 2;
  point.y = card.top + card.height * 0.42;
  const target = point.matrixTransform(matrix.inverse());
  svg.querySelectorAll('.mascot-pupil').forEach(pupil => {
    const x = target.x - Number(pupil.dataset.eyeX);
    const y = target.y - 52;
    const distance = Math.hypot(x, y) || 1;
    pupil.setAttribute('transform', `translate(${x / distance * 2.1} ${y / distance * 2.1})`);
  });
}

// Отдельное смещение не мешает поворотам, прыжку и эмоциям Вольтика.
const mascotFollow = { x: 0, y: 0, targetX: 0, targetY: 0, frame: null, time: 0 };

function animateMascotFollow(time) {
  const elapsed = Math.min(64, time - mascotFollow.time);
  mascotFollow.time = time;
  // Инерция сохраняет отставание даже при непрерывном движении пальца.
  const blend = 1 - Math.exp(-elapsed / 240);
  mascotFollow.x += (mascotFollow.targetX - mascotFollow.x) * blend;
  mascotFollow.y += (mascotFollow.targetY - mascotFollow.y) * blend;
  const settled = Math.abs(mascotFollow.targetX - mascotFollow.x) < 0.1
    && Math.abs(mascotFollow.targetY - mascotFollow.y) < 0.1;
  if (settled) {
    mascotFollow.x = mascotFollow.targetX;
    mascotFollow.y = mascotFollow.targetY;
  }
  mascotAvatar.style.setProperty('--mascot-follow-x', `${mascotFollow.x}px`);
  mascotAvatar.style.setProperty('--mascot-follow-y', `${mascotFollow.y}px`);
  updateMascotGaze();
  mascotFollow.frame = settled ? null : requestAnimationFrame(animateMascotFollow);
}

function followCardWithMascot(x = 0, y = 0) {
  mascotFollow.targetX = Math.max(-48, Math.min(48, x * 0.36));
  mascotFollow.targetY = Math.max(-10, Math.min(10, y * 0.18));
  if (mascotFollow.frame === null) {
    mascotFollow.time = performance.now();
    mascotFollow.frame = requestAnimationFrame(animateMascotFollow);
  }
}

function resetIdleHintTimer() {
  clearTimeout(idleHintTimer);
  const wasActive = idleHintActive;
  idleHintActive = false;
  document.getElementById('mascotOffer').hidden = true;
  mascotAvatar.classList.remove('idle-nudge');
  if (wasActive) renderMascot('normal', null, 0);
  if (document.hidden || !mascotHint.hidden || document.querySelector('.overlay-screen.active')) return;

  idleHintTimer = setTimeout(() => {
    if (busy || dragging || document.hidden || !mascotHint.hidden || document.querySelector('.overlay-screen.active')) return;
    idleHintActive = true;
    document.getElementById('mascotOffer').hidden = false;
    renderMascot('normal', null, 0);
  }, 20000);
}

function buildCardSVG(type, mainEmoji) {
  const colors = { shop: ['#fff5b5', '#ffc45a'], friend: ['#e7ffb5', '#92d787'], scam: ['#ffdbd9', '#f49ba7'], tech: ['#d8f8ff', '#8fc8f7'], quiz: ['#efdcff', '#be9aef'] };
  const [light, deep] = colors[type] || colors.quiz;
  return `<svg viewBox="0 0 220 180" aria-hidden="true">
    <defs>
      <radialGradient id="orb-${type}" cx=".32" cy=".18" r=".9"><stop stop-color="#fff"/><stop offset=".3" stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
      <linearGradient id="rim-${type}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".6" stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    </defs>
    <ellipse cx="111" cy="159" rx="66" ry="9" fill="#392550" opacity=".13"/>
    <ellipse cx="110" cy="90" rx="74" ry="70" fill="url(#rim-${type})" transform="rotate(-13 110 90)"/>
    <circle cx="110" cy="85" r="63" fill="url(#orb-${type})" stroke="#fff" stroke-opacity=".65" stroke-width="2"/>
    <path d="M65 59 Q76 34 104 33" stroke="white" stroke-opacity=".8" stroke-width="6" stroke-linecap="round" fill="none"/>
    <text x="110" y="112" font-size="68" text-anchor="middle">${mainEmoji}</text>
    <g transform="rotate(-18 33 117)"><rect x="16" y="100" width="35" height="35" rx="12" fill="url(#rim-${type})" stroke="white" stroke-width="2"/><path d="M25 117 L31 123 L42 110" stroke="#665183" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
    <path d="M181 31 L185 43 L198 47 L185 51 L181 64 L177 51 L164 47 L177 43 Z" fill="${deep}" stroke="white" stroke-width="1.5"/>
    <circle cx="183" cy="129" r="8" fill="url(#rim-${type})" stroke="white" stroke-width="2"/>
  </svg>`;
}

// 7. ОПТИМИЗИРОВАННЫЙ ДВИЖОК ЧАСТИЦ И МЕДЛЕННЫХ ЦИФР
const canvas = document.getElementById('vfxCanvas');
const ctx = canvas.getContext('2d');
let particles = [];
let confetti = [];
let statFloats = [];
let vfxRunning = false;

const CONFETTI_COLORS = ['#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#fde047'];

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function startVFXLoop() {
  if (!vfxRunning) {
    vfxRunning = true;
    requestAnimationFrame(loopVFX);
  }
}

function spawnBurst(x, y, symbols, count) {
  if (particles.length > 16) return;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.65;
    const speed = 2.2 + Math.random() * 5.2;
    particles.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 18,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (1.8 + Math.random() * 2.2),
      gravity: 0.11 + Math.random() * 0.05,
      size: Math.round(28 + Math.random() * 11),
      text: symbols[Math.floor(Math.random() * symbols.length)],
      alpha: 1,
      decay: 0.011 + Math.random() * 0.005
    });
  }

  const confCount = Math.min(8, count + 2);
  for (let j = 0; j < confCount; j++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 6;
    confetti.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.2,
      w: 11 + Math.random() * 6,
      h: 7 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      alpha: 1,
      decay: 0.013 + Math.random() * 0.005
    });
  }

  startVFXLoop();
}

function spawnStatFloat(targetEl, delta, pillEl) {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const rawX = rect.left + rect.width / 2;
  const screenMid = window.innerWidth / 2;
  const x = rawX + (screenMid - rawX) * 0.16;
  const y = rect.bottom + 8;

  if (pillEl) {
    pillEl.classList.remove('hit-good', 'hit-bad');
    void pillEl.offsetWidth;
    pillEl.classList.add(delta > 0 ? 'hit-good' : 'hit-bad');
  }

  statFloats.push({
    x, y,
    vy: -0.42,
    text: (delta > 0 ? '+' : '') + delta,
    color: delta > 0 ? '#059669' : '#e11d48',
    alpha: 1,
    decay: 0.012
  });

  startVFXLoop();
}

function loopVFX() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.12;
    c.vx *= 0.98;
    c.alpha -= c.decay;
    if (c.alpha <= 0) { confetti.splice(i, 1); continue; }
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.985;
    p.alpha -= p.decay;
    if (p.alpha <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.alpha;
    ctx.font = `bold ${p.size}px sans-serif`;
    ctx.fillText(p.text, p.x, p.y);
  }

  ctx.font = '900 15px -apple-system, BlinkMacSystemFont, sans-serif';
  for (let i = statFloats.length - 1; i >= 0; i--) {
    const sf = statFloats[i];
    sf.y += sf.vy;
    sf.alpha -= sf.decay;
    if (sf.alpha <= 0) { statFloats.splice(i, 1); continue; }
    ctx.globalAlpha = sf.alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.strokeText(sf.text, sf.x, sf.y);
    ctx.fillStyle = sf.color;
    ctx.fillText(sf.text, sf.x, sf.y);
  }

  ctx.globalAlpha = 1;

  if (particles.length > 0 || confetti.length > 0 || statFloats.length > 0) {
    requestAnimationFrame(loopVFX);
  } else {
    vfxRunning = false;
  }
}
