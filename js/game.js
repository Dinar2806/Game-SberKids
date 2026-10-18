// Основной игровой цикл, состояние, свайпы, советы Вольтика и диплом СберKids
let currentDream = null;
let campaigns = [];
let campaignLoading = false;
let retryCampaignId = null;
const mascotAvatar = document.getElementById("mascotAvatar");
let idleHintTimer = null;
let idleHintActive = false;

// 9. СОСТОЯНИЕ ИГРЫ
let activeDeck = [];
let stats = { money: 55, tech: 55, trust: 55, team: 55 };
let dreamPct = 15;
let streak = 0;
let scamMistakes = 0;
let hasSwipedOnce = false;
let idx = 0;
let activeCardData = null;
let busy = true;
let bannerTimer = null;
let sideFlipMap = [];

const cardEl = document.getElementById('activeCard');
const cardShine = document.getElementById('cardShine');
const badgeL = document.getElementById('badgeLeft');
const badgeR = document.getElementById('badgeRight');
const spriteWrap = document.getElementById('spriteContainer');
const streakPill = document.getElementById('streakPill');
const tutorialHand = document.getElementById('tutorialHand');

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

function flashBanner(text, dur = 2500, anchor = null) {
  const b = document.getElementById('rewardBanner');
  const parent = anchor || document.body;
  if (b.parentElement !== parent) parent.appendChild(b);
  b.classList.toggle('is-anchored', Boolean(anchor));
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), dur);
}

const mascotHint = document.getElementById('mascotHint');
const gameApp = document.querySelector('.app');
document.getElementById('mascotOffer').addEventListener('click', event => {
  event.stopPropagation();
  openMascotHint();
});
// Считаем бездействие от последнего ввода, а не только от смены карточки.
['pointerdown', 'pointerup', 'keydown', 'wheel', 'scroll'].forEach(type => {
  document.addEventListener(type, event => {
    // Не перерисовываем SVG под пальцем между pointerdown и click.
    if (!event.target.closest?.('#mascotOffer, #mascotAvatar')) resetIdleHintTimer();
  }, { capture: true, passive: true });
});
document.addEventListener('visibilitychange', resetIdleHintTimer);
function closeMascotHint(restoreFocus = false) {
  const wasOpen = !mascotHint.hidden;
  mascotHint.hidden = true;
  gameApp.classList.remove('mascot-speaking');
  mascotAvatar.setAttribute('aria-expanded', 'false');
  if (wasOpen) {
    mascotAvatar.classList.remove('boing', 'idle-nudge');
    if (!busy) renderMascot('normal', null, 0);
  }
  resetIdleHintTimer();
  if (restoreFocus) {
    mascotAvatar.focus({ preventScroll: true });
  }
}
document.getElementById('mascotHintDone').addEventListener('click', () => closeMascotHint(true));
document.addEventListener('pointerdown', event => {
  if (!mascotHint.hidden && !mascotHint.contains(event.target) && !mascotAvatar.contains(event.target)) closeMascotHint();
});
mascotHint.addEventListener('keydown', event => {
  event.stopPropagation();
  if (event.key === 'Escape') { event.preventDefault(); closeMascotHint(true); }
  if (event.key === 'Tab') {
    event.preventDefault();
    document.getElementById('mascotHintDone').focus({ preventScroll: true });
  }
});

// Подсказка остаётся открытой, пока игрок читает её.
mascotAvatar.addEventListener('click', (e) => {
  e.stopPropagation();
  openMascotHint();
});

function openMascotHint() {
  if (!mascotHint.hidden || busy || !activeCardData) return;
  resetIdleHintTimer();
  if (dragging) endDrag({ type: 'pointercancel' });
  Sound.boing();
  mascotAvatar.classList.remove('boing', 'idle-nudge');
  void mascotAvatar.offsetWidth;
  mascotAvatar.classList.add('boing');

  // Ищем самый просевший показатель, чтобы Вольтик подсказал, что беречь
  const names = { money: '🪙 Копилку', tech: '⚡ Бодрость', trust: '❤️ Дружбу', team: '🧠 Смекалку' };
  let lowestKey = 'money';
  ['money', 'tech', 'trust', 'team'].forEach(k => {
    if (stats[k] < stats[lowestKey]) lowestKey = k;
  });

  const c = activeCardData;
  const warning = document.getElementById('mascotHintWarning');
  warning.hidden = stats[lowestKey] > 32;
  warning.textContent = `Береги ${names[lowestKey]} — осталось ${stats[lowestKey]} из 100`;
  document.getElementById('mascotHintText').textContent = c.tip.replace(/^💡\s*/, '');
  clearTimeout(idleHintTimer);
  renderMascot('happy', null, 0, true);
  mascotHint.hidden = false;
  gameApp.classList.add('mascot-speaking');
  mascotAvatar.setAttribute('aria-expanded', 'true');
  document.getElementById('mascotHintDone').focus({ preventScroll: true });

  const r = mascotAvatar.getBoundingClientRect();
  spawnBurst(r.left + r.width / 2, r.top + 35, ['💡', '✨'], 3);
}

const STAT_TOOLTIPS = {
  money: '🪙 Копилка: твои сбережения на Мечту и важные покупки!',
  tech:  '⚡ Бодрость: тратится на труд и учёбу, растёт от сна и отдыха!',
  trust: '❤️ Дружба: растёт, когда выручаешь и проводишь время с друзьями!',
  team:  '🧠 Смекалка: помогает считать выгоду и раскусить мошенников!'
};

['money', 'tech', 'trust', 'team'].forEach(key => {
  const pill = document.getElementById('pill-' + key);
  pill.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    Sound.boing();
    pill.classList.remove('hit-good');
    void pill.offsetWidth;
    pill.classList.add('hit-good');
    flashBanner(STAT_TOOLTIPS[key]);
  });
});


// Holding the panel switches CSS animation modes; no repeating JS timers.
(() => {
  const panel = document.getElementById('dreamCapsule');
  let pointer = null;
  let keyboardHeld = false;
  const syncHeld = () => panel.classList.toggle('is-held', pointer !== null || keyboardHeld);
  const stop = () => {
    pointer = null;
    keyboardHeld = false;
    syncHeld();
  };
  panel.addEventListener('pointerdown', event => {
    if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = event.pointerId;
    panel.setPointerCapture(pointer);
    syncHeld();
  });
  const release = event => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    syncHeld();
  };
  panel.addEventListener('pointerup', release);
  panel.addEventListener('pointercancel', release);
  panel.addEventListener('lostpointercapture', release);
  panel.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    keyboardHeld = true;
    syncHeld();
  });
  panel.addEventListener('keyup', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    keyboardHeld = false;
    syncHeld();
  });
  panel.addEventListener('blur', stop);
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();

function buildFlipMap() {
  sideFlipMap = activeDeck.map((_, i) => (i % 2 === 0 ? Math.random() < 0.6 : Math.random() < 0.4));
}

function createCampaignArt(campaign, className, width, height) {
  const fallback = document.createElement('span');
  fallback.className = `${className} campaign-emoji`.trim();
  fallback.textContent = campaign.icon;
  fallback.setAttribute('aria-hidden', 'true');
  if (!campaign.image) return fallback;
  const image = document.createElement('img');
  image.className = className;
  image.src = campaign.image;
  image.alt = '';
  image.width = width;
  image.height = height;
  image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
  return image;
}

// Center the visible glyph itself, rather than its font advance or baseline.
function createCenteredEmojiMask(icon) {
  const source = document.createElement('canvas');
  source.width = source.height = 96;
  const ctx = source.getContext('2d');
  ctx.font = '64px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 48, 48);
  const pixels = ctx.getImageData(0, 0, 96, 96).data;
  let left = 96, top = 96, right = -1, bottom = -1;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    if (pixels[(y * 96 + x) * 4 + 3] > 0) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  const mask = document.createElement('canvas');
  mask.width = mask.height = 64;
  if (right >= left && bottom >= top) {
    const width = right - left + 1, height = bottom - top + 1;
    const scale = 60 / Math.max(width, height);
    mask.getContext('2d').drawImage(source, left, top, width, height,
      (64 - width * scale) / 2, (64 - height * scale) / 2, width * scale, height * scale);
  }
  return mask.toDataURL();
}

function applyDreamTheme(campaign) {
  currentDream = campaign;
  document.getElementById('dreamMainIcon').replaceChildren(createCampaignArt(campaign, '', 64, 58));
  document.getElementById('dreamName').textContent = currentDream.name;
  currentDream.progressIcons.forEach((p, i) => {
    const node = document.getElementById('part-' + i);
    if (node.partFlight) node.partFlight.cancel();
    node.classList.remove('part-arriving', 'is-current');
    const emoji = document.createElement('span');
    emoji.className = 'part-emoji';
    emoji.textContent = p;
    emoji.setAttribute('aria-hidden', 'true');
    node.replaceChildren(emoji);
    node.style.setProperty('--part-mask', `url("${createCenteredEmojiMask(p)}")`);
  });
}

function getDreamStage() {
  const complete = dreamPct >= currentDream.balance.winDream;
  const track = document.querySelector('.dream-bar-track');
  const edge = track.clientWidth * getDreamPathPercent() / 100;
  const nodes = [...track.querySelectorAll('.part-node')];
  const next = nodes.findIndex(node => node.offsetLeft + node.offsetWidth > edge);
  const index = complete ? 5 : Math.max(0, next);
  const steps = currentDream.progressSteps || currentDream.progressIcons.map((icon, i) => ({
    name: `Этап ${i + 1}`, text: `${icon} Собираем мечту: этап ${i + 1} из 5`
  }));
  return { steps, index, complete };
}

function syncUI() {
  ['money', 'tech', 'trust', 'team'].forEach(k => {
    document.getElementById('val-' + k).textContent = stats[k];
    document.getElementById('fill-' + k).style.height = stats[k] + '%';
    document.getElementById('pill-' + k).classList.toggle('low-warn', stats[k] <= 22);
  });

  dreamPct = clamp(dreamPct);

  if (streak >= 2) {
    streakPill.textContent = streak >= 4 ? `💎 МЕГА x${streak}` : `🔥 КОМБО x${streak}`;
    streakPill.classList.add('show');
  } else {
    streakPill.classList.remove('show');
  }

  const flightOrigin = document.getElementById('dreamCurrentEmoji').getBoundingClientRect();
  const stage = getDreamStage();
  document.getElementById('dreamPartName').textContent = stage.complete ? 'Мечта достигнута!' : stage.steps[stage.index].text;
  document.getElementById('dreamAssemblyColor').textContent = stage.complete ? '✓' : currentDream.progressIcons[stage.index];
  document.getElementById('dreamCurrentPart').setAttribute('aria-label', stage.complete ? 'Мечта собрана' : stage.steps[stage.index].name);
  currentDream.progressIcons.forEach((icon, i) => {
    const node = document.getElementById('part-' + i);
    const wasUnlocked = node.classList.contains('unlocked');
    const isNow = stage.complete || i < stage.index;
    node.classList.toggle('unlocked', isNow);
    const isCurrent = !stage.complete && i === stage.index;
    node.classList.toggle('is-current', isCurrent);
    node.setAttribute('aria-label', `${stage.steps[i].name}: ${isNow ? 'собрано' : isCurrent ? 'собираем сейчас' : 'впереди'}`);
    if (isNow && !wasUnlocked && idx > 0) {
      Sound.unlock();
      animateDreamPartArrival(node, icon, flightOrigin);
    }
  });
  syncDreamPathFill();
}

function animateDreamPartArrival(node, icon, origin) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (node.partFlight) node.partFlight.cancel();
  const destination = node.getBoundingClientRect();
  const flight = document.createElement('div');
  flight.className = 'dream-part-flight';
  flight.textContent = icon;
  flight.setAttribute('aria-hidden', 'true');
  flight.style.left = origin.left + origin.width / 2 - 24 + 'px';
  flight.style.top = origin.top + origin.height / 2 - 24 + 'px';
  document.body.appendChild(flight);
  const x = destination.left + destination.width / 2 - origin.left - origin.width / 2;
  const y = destination.top + destination.height / 2 - origin.top - origin.height / 2;
  node.classList.add('part-arriving');
  const animation = flight.animate([
    { transform: 'translate(0, 0) scale(1) rotate(-10deg)' },
    { transform: `translate(${x * .5}px, ${Math.min(0, y) - 22}px) scale(1.12) rotate(5deg)`, offset: .45 },
    { transform: `translate(${x}px, ${y}px) scale(.62) rotate(0)` }
  ], { duration: 560, easing: 'cubic-bezier(.3,0,.3,1)', fill: 'forwards' });
  node.partFlight = animation;
  const cleanup = () => {
    flight.remove();
    if (node.partFlight === animation) {
      node.partFlight = null;
      node.classList.remove('part-arriving');
    }
  };
  animation.finished.then(() => {
    cleanup();
    if (!node.classList.contains('unlocked')) return;
    node.animate([{ transform: 'scale(.88)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 260 });
    const r = node.getBoundingClientRect();
    spawnBurst(r.left + r.width / 2, r.top + r.height / 2, ['✨'], 3);
  }, cleanup);
}

function getDreamPathPercent() {
  return currentDream ? Math.min(100, dreamPct / currentDream.balance.winDream * 100) : 0;
}

// Keep one continuous horizontal fill edge through the connecting line and circles.
function syncDreamPathFill() {
  const track = document.querySelector('.dream-bar-track');
  track.style.setProperty('--path-position', getDreamPathPercent());
  track.style.setProperty('--track-width', track.clientWidth + 'px');
  track.querySelectorAll('.part-node').forEach(node => {
    node.style.setProperty('--circle-start', (node.offsetLeft + node.clientLeft) + 'px');
  });
  const assembling = track.querySelector('.part-node.is-current');
  const preview = document.getElementById('dreamCurrentPart');
  preview.classList.toggle('is-complete', !assembling);

}
new ResizeObserver(syncDreamPathFill).observe(document.querySelector('.dream-bar-track'));

function showDots(choice) {
  const isScamCard = activeCardData && activeCardData.type === 'scam';
  ['money', 'tech', 'trust', 'team'].forEach(k => {
    const dot = document.getElementById('dot-' + k);
    const pill = document.getElementById('pill-' + k);
    const v = choice && choice.effects
      ? GameData.scaleEffect(choice.effects[k] || 0, currentDream.balance.multipliers, 'resource')
      : 0;
    dot.className = 'stat-dot';
    pill.classList.remove('preview-up', 'preview-down');
    if (v !== 0) {
      dot.classList.add('active');
      if (Math.abs(v) >= 12) dot.classList.add('big');
      if (isScamCard) {
        dot.classList.add('mystery');
        dot.textContent = '?';
      } else if (v > 0) {
        dot.classList.add('up');
        dot.textContent = Math.abs(v) >= 12 ? '▲▲' : '▲';
        pill.classList.add('preview-up');
      } else {
        dot.classList.add('down');
        dot.textContent = Math.abs(v) >= 12 ? '▼▼' : '▼';
        pill.classList.add('preview-down');
      }
    } else {
      dot.textContent = '';
    }
  });
}

function resolveCard(i) {
  const raw = activeDeck[i];
  const resolved = GameData.resolveEvent(raw, stats);
  const base = { ...resolved, bg: BG_PAL[resolved.type] };
  const flip = sideFlipMap[i];
  return {
    ...base,
    left: flip ? base.optA : base.optB,
    right: flip ? base.optB : base.optA
  };
}

function showCard() {
  closeMascotHint();
  followCardWithMascot();
  activeCardData = resolveCard(idx);
  const c = activeCardData;

  shiftBackground(idx);

  document.getElementById('stepBadge').textContent = `Ход ${idx + 1} / ${activeDeck.length}`;
  document.getElementById('condBadge').classList.toggle('show', !!c.isCond);
  document.getElementById('cardTitle').textContent = c.title;
  document.getElementById('cardDesc').textContent = c.desc;
  const artThemes = { shop: '#f8e8bb', friend: '#dcefc4', scam: '#f5d4dd', tech: '#d6e7f7', quiz: '#e5d4f5' };
  document.getElementById('cardArtZone').style.background = `radial-gradient(ellipse at 35% 15%, #fffcf6, ${artThemes[c.type] || artThemes.quiz})`;
  spriteWrap.innerHTML = buildCardSVG(c.type, c.emoji);
  spriteWrap.style.transform = '';

  badgeL.textContent = c.left.text;
  badgeR.textContent = c.right.text;
  document.getElementById('btnLeftLabel').textContent = c.left.text;
  document.getElementById('btnRightLabel').textContent = c.right.text;

  badgeL.style.opacity = 0;
  badgeR.style.opacity = 0;
  cardShine.style.transform = 'translateX(0px)';
  showDots(null);
  renderMascot('normal', null, 0);

  tutorialHand.classList.toggle('visible', idx === 0 && !hasSwipedOnce);

  cardEl.className = 'game-card enter';
  cardEl.style.transform = 'translate3d(0,0,0) rotate(0deg)';
  cardEl.style.opacity = '1';

  // Предлагаем помощь после 20 секунд бездействия.
  resetIdleHintTimer();
}


// 11. ГЕНЕРАТОР АЧИВОК И ПЕРСОНАЛЬНОГО ТИТУЛА
function renderFinalAchievements(isExitOnly) {
  const listEl = document.getElementById('achievementsList');
  const rankEl = document.getElementById('modalRank');
  listEl.innerHTML = '';

  if (isExitOnly) {
    rankEl.style.display = 'none';
    return;
  }
  rankEl.style.display = 'inline-block';

  const earnedArmor = scamMistakes === 0 && idx >= 2;
  const earnedPiggy = stats.money >= 50;
  const earnedHeart = stats.trust >= 50;

  const badges = [
    {
      icon: '🛡️',
      title: 'Кибер-Броня',
      desc: earnedArmor ? 'Ни разу не попался на уловки мошенников!' : 'Не сообщай коды из СМС и пароли',
      earned: earnedArmor
    },
    {
      icon: '🐷',
      title: 'Мастер Копилки',
      desc: earnedPiggy ? `Сохранил крепкий бюджет (${stats.money} 🪙)!` : 'Откладывай запас монет на Мечту',
      earned: earnedPiggy
    },
    {
      icon: '❤️',
      title: 'Душа Компании',
      desc: earnedHeart ? `Сохранил верных друзей (${stats.trust} ❤️)!` : 'Не забывай помогать друзьям',
      earned: earnedHeart
    }
  ];

  const earnedCount = badges.filter(b => b.earned).length;
  if (earnedCount === 3 && dreamPct >= currentDream.balance.winDream) {
    rankEl.textContent = '👑 Титул: Легенда Финансов';
  } else if (earnedArmor && dreamPct >= 70) {
    rankEl.textContent = '🛡️ Титул: Гроза Мошенников';
  } else if (earnedPiggy) {
    rankEl.textContent = '🚀 Титул: Архитектор Мечты';
  } else {
    rankEl.textContent = '🦊 Титул: Юный Изобретатель';
  }

  badges.forEach(b => {
    const card = document.createElement('div');
    card.className = 'ach-card' + (b.earned ? ' earned' : '');
    card.innerHTML = `
      <div class="ach-icon">${b.icon}</div>
      <div class="ach-info">
        <div class="ach-title">${b.title}</div>
        <div class="ach-desc">${b.desc}</div>
      </div>
      <span class="ach-status">${b.earned ? '✨ Получено!' : 'Закрыто'}</span>
    `;
    listEl.appendChild(card);
  });
}

// 12. ПРИМЕНЕНИЕ ВЫБОРА С УЧЁТОМ КОЭФФИЦИЕНТА СЛОЖНОСТИ
function applyDecision(dir) {
  if (busy || !activeCardData || !mascotHint.hidden || document.querySelector('.overlay-screen.active')) return;
  closeMascotHint();
  followCardWithMascot();
  busy = true;
  hasSwipedOnce = true;
  clearTimeout(idleHintTimer);
  mascotAvatar.classList.remove('idle-nudge');
  tutorialHand.classList.remove('visible');

  const c = activeCardData;
  const choice = dir === 'left' ? c.left : c.right;
  const rect = cardEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2.4;

  if (c.type === 'scam' && choice.mascot === 'scared') {
    scamMistakes++;
  }

  const flyX = dir === 'left' ? -window.innerWidth : window.innerWidth;
  const flyRot = dir === 'left' ? -24 : 24;
  cardEl.className = 'game-card fly-away';
  cardEl.style.transform = `translate3d(${flyX}px, 20px, 0) rotate(${flyRot}deg)`;
  cardEl.style.opacity = '0';

  // Применяем индивидуальные множители кампании к базовым эффектам события
  Object.keys(choice.effects).forEach(k => {
    const d = GameData.scaleEffect(choice.effects[k], currentDream.balance.multipliers, 'resource');
    if (d !== 0) {
      stats[k] = clamp(stats[k] + d);
      const jar = document.getElementById('jar-' + k);
      const pill = document.getElementById('pill-' + k);
      spawnStatFloat(jar, d, pill);
    }
  });

  let dreamGain = GameData.scaleEffect(choice.dream, currentDream.balance.multipliers, 'dream');
  if (choice.mascot === 'happy') {
    streak++;
    if (streak >= 3) dreamGain += 1;
    renderMascot('happy', '🤩', 0);
    Sound.coin();
    spawnBurst(cx, cy, ['🪙', '🌟', '✨', '🔥'], 6);
  } else if (choice.mascot === 'scared') {
    streak = 0;
    renderMascot('scared', '😱', 0);
    Sound.bad();
    spawnBurst(cx, cy, ['💥', '⚠️', '💸'], 5);
  } else {
    renderMascot('think', '🤔', 0);
    Sound.swipe();
    spawnBurst(cx, cy, ['⚖️', '✨', '⭐'], 5);
  }

  if (dreamGain !== 0) {
    dreamPct = clamp(dreamPct + dreamGain);
  }

  triggerComicJuice(choice.mascot);
  syncUI();
  showDots(null);
  flashBanner(choice.msg);
  sendEvent('VIBRATION_EVENT');

  setTimeout(() => {
    // Проверяем, какой именно показатель упал до нуля
    const failReasons = {
      money: '🪙 Копилка опустела до нуля! Не забывай пополнять бюджет и беречь монеты.',
      tech:  '⚡ Бодрость на нуле — ты совсем выбился из сил! Чередуй труд с отдыхом и сном.',
      trust: '❤️ Дружба упала до нуля — все друзья обиделись! Деньги важны, но о друзьях забывать нельзя.',
      team:  '🧠 Смекалка упала до нуля из-за ловушек и поспешных решений! Проверяй чеки, схемы и ссылки.'
    };
    for (const k of ['money', 'tech', 'trust', 'team']) {
      if (stats[k] <= 0) {
        finishGame(false, '🔧', 'Баланс нарушен!', failReasons[k], false);
        busy = false;
        return;
      }
    }

    if (idx >= activeDeck.length - 1) {
      Sound.unlock();
      spawnBurst(window.innerWidth / 2, window.innerHeight / 2, [currentDream.icon, '🏆', '🎉', '🌟'], 10);
      const won = dreamPct >= currentDream.balance.winDream;
      finishGame(
        won,
        won ? currentDream.icon : '🌟',
        won ? `${currentDream.name} у тебя!` : 'Почти у цели!',
        won
          ? `Ура! Ты прошёл все ${activeDeck.length} карточек кампании и собрал Мечту на ${dreamPct}%!`
          : `Ты выдержал все ${activeDeck.length} карточек и собрал Мечту на ${dreamPct}% (нужно ${currentDream.balance.winDream}%). Попробуй ещё раз!`,
        false
      );
      busy = false;
      return;
    }

    triggerMiniGameIfNeeded(() => {
      idx++;
      showCard();
      busy = false;
    });
  }, 360);
}

let completedSent = false;

function finishGame(won, icon, title, text, isExitOnly) {
  clearTimeout(idleHintTimer);
  document.getElementById('modalArt').textContent = icon;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalText').textContent = text;
  const skillBox = document.getElementById('skillSummaryBox');
  if (skillBox) {
    skillBox.style.display = isExitOnly ? 'none' : 'block';
    if (won) {
      skillBox.innerHTML = '🎓 <b>Навык освоен:</b> ';
      skillBox.append(document.createTextNode(`ты умеешь распознавать уловки мошенников, проверять выгоду покупок и держать баланс ресурсов (${currentDream.name} — ${dreamPct}%)!`));
    } else {
      skillBox.innerHTML = `💡 <b>Принцип баланса:</b> перед выбором проверяй подсказку Вольтика 🔍 и следи, чтобы ни одна из 4 колб не опускалась до нуля!`;
    }
  }
  renderFinalAchievements(isExitOnly);
  document.getElementById('endModal').classList.add('active');
  if (!isExitOnly) {
    if (won && !completedSent) {
      completedSent = true;
      sendEvent('COMPLETED_EVENT');
    } else {
      sendEvent('FINISH_EVENT');
    }
  }
}

// 13. ФИЗИКА ПЕРЕТАСКИВАНИЯ + ПАРАЛЛАКС ИЛЛЮСТРАЦИИ
let dragging = false;
let startX = 0, startY = 0, dx = 0;

cardEl.addEventListener('pointerdown', (e) => {
  if (busy) return;
  const textArea = e.target.closest('.card-text-zone');
  if (textArea && textArea.scrollHeight > textArea.clientHeight) return;
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  dx = 0;
  tutorialHand.classList.remove('visible');
  cardEl.className = 'game-card';
});

window.addEventListener('pointermove', (e) => {
  if (!dragging || busy) return;
  dx = e.clientX - startX;
  const dy = (e.clientY - startY) * 0.25;
  const rot = dx * 0.055;
  followCardWithMascot(dx, dy);
  cardEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg)`;
  cardShine.style.transform = `translateX(${220 + dx * 1.6}px)`;
  spriteWrap.style.transform = `translate3d(${dx * 0.08}px, ${dy * 0.08}px, 0) rotate(${dx * 0.03}deg)`;

  const c = activeCardData;
  const ratio = Math.min(1, Math.abs(dx) / 75);
  if (dx < -14) {
    badgeL.style.opacity = ratio;
    badgeR.style.opacity = 0;
    showDots(c.left);
    renderMascot('normal', '👀', -1);
  } else if (dx > 14) {
    badgeR.style.opacity = ratio;
    badgeL.style.opacity = 0;
    showDots(c.right);
    renderMascot('normal', '👀', 1);
  } else {
    badgeL.style.opacity = 0;
    badgeR.style.opacity = 0;
    showDots(null);
    renderMascot('normal', idleHintActive ? '💡 Нажми на меня!' : null, 0, idleHintActive);
  }
});

function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  followCardWithMascot();
  if (busy) return;

  if (event.type !== 'pointercancel' && dx < -65) {
    Sound.swipe();
    applyDecision('left');
  } else if (event.type !== 'pointercancel' && dx > 65) {
    Sound.swipe();
    applyDecision('right');
  } else {
    cardEl.className = 'game-card smooth-return';
    cardEl.style.transform = 'translate3d(0,0,0) rotate(0deg)';
    cardShine.style.transform = 'translateX(0px)';
    spriteWrap.style.transform = '';
    badgeL.style.opacity = 0;
    badgeR.style.opacity = 0;
    showDots(null);
    renderMascot('normal', idleHintActive ? '💡 Нажми на меня!' : null, 0, idleHintActive);
    if (idx === 0 && !hasSwipedOnce) tutorialHand.classList.add('visible');
  }
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

document.getElementById('btnLeft').addEventListener('click', () => { Sound.swipe(); applyDecision('left'); });
document.getElementById('btnRight').addEventListener('click', () => { Sound.swipe(); applyDecision('right'); });

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { Sound.swipe(); applyDecision('left'); }
  if (e.key === 'ArrowRight') { Sound.swipe(); applyDecision('right'); }
});

// От лёгких кампаний к сложным; внутри сложности сохраняем порядок из JSON.
const campaignList = document.getElementById('campaignList');
const campaignStatus = document.getElementById('campaignLoadStatus');
const campaignRetryBtn = document.getElementById('campaignRetryBtn');

function setCampaignLoading(loading) {
  campaignLoading = loading;
  campaignList.setAttribute('aria-busy', String(loading));
  campaignList.querySelectorAll('button').forEach(btn => { btn.disabled = loading; });
  if (loading) campaignRetryBtn.hidden = true;
}

function showCampaignError(error) {
  console.error('Не удалось загрузить кампании:', error);
  campaignStatus.textContent = error.name === 'TimeoutError'
    ? 'Загрузка затянулась. Проверьте соединение и попробуйте ещё раз.'
    : 'Не удалось загрузить приключение. Проверьте соединение и попробуйте ещё раз.';
  campaignStatus.hidden = false;
  campaignRetryBtn.hidden = false;
}

function renderCampaignList() {
  campaignList.replaceChildren();
  const orderedCampaigns = ['easy', 'medium', 'hard'].flatMap(difficulty =>
    campaigns.filter(campaign => campaign.difficulty === difficulty)
  );
  const groupTitles = { easy: 'Лёгкий старт', medium: 'Держим баланс', hard: 'Большие планы' };
  orderedCampaigns.forEach((campaign, index) => {
    if (index === 0 || campaign.difficulty !== orderedCampaigns[index - 1].difficulty) {
      const heading = document.createElement('h3');
      heading.className = 'campaign-group-title';
      heading.dataset.difficulty = campaign.difficulty;
      heading.textContent = groupTitles[campaign.difficulty];
      campaignList.append(heading);
    }
    const difficulty = GameData.difficulties[campaign.difficulty];
    const btn = document.createElement('button');
    btn.type = 'button';
    // Светлые оттенки проходят от мяты через фиолетовый к розово-красному.
    const progress = index / Math.max(1, orderedCampaigns.length - 1);
    const hue = progress <= 0.5 ? 150 + progress * 240 : 270 + (progress - 0.5) * 168;
    btn.className = 'dream-option' + (index === 0 ? ' dream-featured' : '');
    btn.style.setProperty('--campaign-hue', Math.round(hue));
    btn.dataset.dream = campaign.id;
    // Сохраняем оформление visual, все значения из JSON вставляются как текст.
    btn.innerHTML = '<div class="dream-option-copy"><span class="dream-opt-title"></span><span class="dream-meta"></span></div><span class="dream-opt-sub"></span><span class="dream-go" aria-hidden="true">↗</span>';
    btn.prepend(createCampaignArt(campaign, 'dream-toy', 240, 220));
    if (index === 0) {
      const kicker = document.createElement('span');
      kicker.className = 'dream-kicker';
      kicker.textContent = '✦ НАЧНИ ЗДЕСЬ';
      btn.querySelector('.dream-option-copy').prepend(kicker);
    }
    btn.querySelector('.dream-opt-title').textContent = campaign.name;
    btn.querySelector('.dream-opt-sub').textContent = campaign.description;
    const badge = btn.querySelector('.dream-meta');
    badge.textContent = difficulty.label;
    btn.addEventListener('click', () => startCampaign(campaign.id));
    campaignList.appendChild(btn);
  });
}

async function loadCampaignCatalog() {
  setCampaignLoading(true);
  retryCampaignId = null;
  campaignStatus.hidden = false;
  campaignStatus.textContent = 'Загружаем приключения…';
  try {
    campaigns = await GameData.loadCatalog();
    renderCampaignList();
    campaignStatus.hidden = true;
    initSoundButton();
  } catch (error) {
    showCampaignError(error);
  } finally {
    setCampaignLoading(false);
  }
}

async function startCampaign(id) {
  if (campaignLoading) return;
  const campaign = campaigns.find(item => item.id === id);
  if (!campaign) return;
  setCampaignLoading(true);
  retryCampaignId = id;
  campaignStatus.hidden = false;
  campaignStatus.textContent = 'Загружаем приключение…';
  try {
    const events = await GameData.loadEvents(campaign);
    activeDeck = events;
    applyDreamTheme(campaign);
    stats = { ...campaign.balance.initialStats };
    dreamPct = campaign.balance.initialDream;
    streak = 0;
    scamMistakes = 0;
    hasSwipedOnce = false;
    idx = 0;
    busy = false;
    buildFlipMap();
    const badge = Array.from(campaignList.children).find(btn => btn.dataset.dream === id).querySelector('.dream-meta');
    badge.textContent = GameData.difficulties[campaign.difficulty].label + ' · ' + events.length + ' карт';
    document.getElementById('dreamSelectScreen').classList.remove('active');
    campaignStatus.hidden = true;
    syncUI();
    showCard();
    Sound.coin();
  } catch (error) {
    showCampaignError(error);
  } finally {
    setCampaignLoading(false);
  }
}

campaignRetryBtn.addEventListener('click', () => {
  if (retryCampaignId) startCampaign(retryCampaignId);
  else loadCampaignCatalog();
});

document.getElementById('restartBtn').addEventListener('click', () => {
  busy = true;
  clearTimeout(idleHintTimer);
  document.getElementById('endModal').classList.remove('active');
  document.getElementById('dreamSelectScreen').classList.add('active');
});

const shareBtn = document.getElementById('shareBtn');
if (shareBtn) {
  shareBtn.addEventListener('click', () => {
    Sound.coin();
    const rankText = document.getElementById('modalRank').textContent;
    sendEvent('SHARING_EVENT', {
      text: `Я прошёл игру «Твоя Мечта» с лисёнком Вольтиком и собрал ${currentDream.name} на ${dreamPct}%! (${rankText})`
    });
    flashBanner('📤 Диплом отправлен в меню «Поделиться»!');
  });
}

function closeApp() {
  sendEvent('CLOSE_EVENT');
  if (!currentDream) return;
  finishGame(false, '👋', 'До новой встречи!', 'Сигнал о выходе отправлен в приложение.', true);
}
document.getElementById('closeBtn').addEventListener('click', closeApp);
document.getElementById('exitBtn').addEventListener('click', closeApp);

loadCampaignCatalog();
