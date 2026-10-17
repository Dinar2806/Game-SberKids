// Основной игровой цикл, состояние, свайпы, подсказки Вольтика и диплом СберKids
let currentDream = null;
let campaigns = [];
let campaignLoading = false;
let retryCampaignId = null;
const mascotAvatar = document.getElementById("mascotAvatar");
let idleHintTimer = null;

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
const tutorialHand = document.getElementById('tutorialHand');
const edgeGlow = document.getElementById('edgeGlow');
const btnLeftEl = document.getElementById('btnLeft');
const btnRightEl = document.getElementById('btnRight');

// Плавный счётчик чисел (60 FPS, без лишних аллокаций)
const displayedValues = { money: 55, tech: 55, trust: 55, team: 55, dream: 15 };
let counterRafId = 0;

function animateCounters(instant) {
  if (instant) {
    if (counterRafId) { cancelAnimationFrame(counterRafId); counterRafId = 0; }
    ['money', 'tech', 'trust', 'team'].forEach(k => {
      displayedValues[k] = stats[k];
      document.getElementById('val-' + k).textContent = stats[k];
    });
    displayedValues.dream = dreamPct;
    document.getElementById('dreamScoreText').textContent = `🌟 ${dreamPct}%`;
    return;
  }

  const startVals = {
    money: displayedValues.money,
    tech: displayedValues.tech,
    trust: displayedValues.trust,
    team: displayedValues.team,
    dream: displayedValues.dream
  };
  const targetVals = {
    money: stats.money,
    tech: stats.tech,
    trust: stats.trust,
    team: stats.team,
    dream: dreamPct
  };
  const startTime = performance.now();
  const duration = 320;

  if (counterRafId) cancelAnimationFrame(counterRafId);

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    ['money', 'tech', 'trust', 'team'].forEach(k => {
      const v = Math.round(startVals[k] + (targetVals[k] - startVals[k]) * ease);
      if (v !== displayedValues[k]) {
        displayedValues[k] = v;
        document.getElementById('val-' + k).textContent = v;
      }
    });
    const dv = Math.round(startVals.dream + (targetVals.dream - startVals.dream) * ease);
    if (dv !== displayedValues.dream) {
      displayedValues.dream = dv;
      document.getElementById('dreamScoreText').textContent = `🌟 ${dv}%`;
    }
    if (t < 1) {
      counterRafId = requestAnimationFrame(step);
    } else {
      counterRafId = 0;
    }
  }
  counterRafId = requestAnimationFrame(step);
}

function clearDragPostFX() {
  if (edgeGlow) {
    edgeGlow.style.opacity = '0';
    edgeGlow.classList.remove('left', 'right');
  }
  if (btnLeftEl) btnLeftEl.classList.remove('drag-preview');
  if (btnRightEl) btnRightEl.classList.remove('drag-preview');
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

function flashBanner(text, dur = 2500) {
  const b = document.getElementById('rewardBanner');
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), dur);
}

// При нажатии на Вольтика даём осмысленную подсказку по текущей карточке и ресурсам!
mascotAvatar.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
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
  if (stats[lowestKey] <= 32) {
    renderMascot('happy');
    flashBanner(`🦊 Вольтик: «Береги ${names[lowestKey]} (${stats[lowestKey]})! ${c ? c.tip : ''}»`, 3400);
  } else {
    renderMascot('happy');
    flashBanner(`🦊 Вольтик: «${c ? c.tip : 'Держи баланс всех 4 показателей!'}»`, 3200);
  }

  const r = mascotAvatar.getBoundingClientRect();
  spawnBurst(r.left + r.width / 2, r.top + 35, ['💡', '✨'], 3);
});

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

document.getElementById('dreamCapsule').addEventListener('pointerdown', function(e) {
  e.stopPropagation();
  if (!currentDream) return;
  Sound.boing();
  const r = document.getElementById('dreamMainIcon').getBoundingClientRect();
  spawnBurst(r.left + 22, r.top + 22, [currentDream.icon, '🌟'], 3);
  flashBanner(`${currentDream.icon} ${currentDream.name}: собрано ${dreamPct}% (нужно ${currentDream.balance.winDream}% для победы)!`);
});

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

function applyDreamTheme(campaign) {
  currentDream = campaign;
  document.getElementById('dreamMainIcon').replaceChildren(createCampaignArt(campaign, '', 64, 58));
  document.getElementById('dreamName').textContent = currentDream.name;
  currentDream.progressIcons.forEach((p, i) => {
    document.getElementById('part-' + i).textContent = p;
  });
}

function syncUI(instant = false) {
  ['money', 'tech', 'trust', 'team'].forEach(k => {
    document.getElementById('fill-' + k).style.height = stats[k] + '%';
    document.getElementById('pill-' + k).classList.toggle('low-warn', stats[k] <= 22);
  });

  dreamPct = clamp(dreamPct);
  document.getElementById('dreamBarFill').style.width = dreamPct + '%';
  animateCounters(instant || idx === 0 && !hasSwipedOnce);

  cardEl.classList.toggle('combo-glow', streak >= 2);

  const thresholds = [15, 35, 55, 75, currentDream.balance.winDream];
  thresholds.forEach((t, i) => {
    const node = document.getElementById('part-' + i);
    const wasUnlocked = node.classList.contains('unlocked');
    const isNow = dreamPct >= t;
    node.classList.toggle('unlocked', isNow);
    if (isNow && !wasUnlocked && idx > 0) {
      Sound.unlock();
      const r = node.getBoundingClientRect();
      spawnBurst(r.left + 12, r.top + 12, ['🌟', '✨'], 4);
    }
  });
}

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
  activeCardData = resolveCard(idx);
  const c = activeCardData;

  shiftBackground(idx);

  document.getElementById('stepBadge').textContent = `Ход ${idx + 1} / ${activeDeck.length}`;
  document.getElementById('condBadge').classList.toggle('show', !!c.isCond);
  document.getElementById('cardTitle').textContent = c.title;
  document.getElementById('cardDesc').textContent = c.desc;
  document.querySelector('.card-text-zone').scrollTop = 0;
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
  renderMascot('normal');

  tutorialHand.classList.toggle('visible', idx === 0 && !hasSwipedOnce);

  cardEl.className = 'game-card enter' + (streak >= 2 ? ' combo-glow' : '');
  cardEl.style.transform = 'translate3d(0,0,0) rotate(0deg)';
  cardEl.style.opacity = '1';

  // Запускаем 15-секундный таймер подсказки на Вольтике
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
  if (busy || !activeCardData || document.querySelector('.overlay-screen.active')) return;
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
    renderMascot('happy');
    Sound.coin();
    spawnBurst(cx, cy, ['🪙', '🌟', '✨', '🔥'], 6);
  } else if (choice.mascot === 'scared') {
    streak = 0;
    renderMascot('scared');
    Sound.bad();
    spawnBurst(cx, cy, ['💥', '⚠️', '💸'], 5);
  } else {
    renderMascot('think');
    Sound.swipe();
    spawnBurst(cx, cy, ['⚖️', '✨', '⭐'], 5);
  }

  if (dreamGain !== 0) {
    dreamPct = clamp(dreamPct + dreamGain);
    const scoreEl = document.getElementById('dreamScoreText');
    spawnStatFloat(scoreEl, dreamGain, null);
  }

  triggerComicJuice(choice.mascot);
  clearDragPostFX();
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
      skillBox.innerHTML = `💡 <b>Принцип баланса:</b> перед выбором нажми на Вольтика, если нужен совет, и следи за четырьмя показателями!`;
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
let gestureAxis = null;
let startX = 0, startY = 0, dx = 0;

cardEl.addEventListener('pointerdown', (e) => {
  if (busy || e.isPrimary === false || e.button > 0) return;
  dragging = true;
  gestureAxis = null;
  startX = e.clientX;
  startY = e.clientY;
  dx = 0;
  tutorialHand.classList.remove('visible');
  cardEl.className = 'game-card';
});

window.addEventListener('pointermove', (e) => {
  if (!dragging || busy) return;
  const moveX = e.clientX - startX;
  const moveY = e.clientY - startY;
  if (!gestureAxis) {
    if (Math.max(Math.abs(moveX), Math.abs(moveY)) < 8) return;
    if (Math.abs(moveY) > Math.abs(moveX) * 1.2) {
      endDrag(true);
      return;
    }
    if (Math.abs(moveX) < Math.abs(moveY) * 1.2) return;
    gestureAxis = 'horizontal';
  }
  dx = moveX;
  const dy = moveY * 0.25;
  const rot = dx * 0.055;
  cardEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg)`;
  cardShine.style.transform = `translateX(${220 + dx * 1.6}px)`;
  spriteWrap.style.transform = `translate3d(${dx * 0.08}px, ${dy * 0.08}px, 0) rotate(${dx * 0.03}deg)`;

  const c = activeCardData;
  const ratio = Math.min(1, Math.abs(dx) / 75);
  if (dx < -14) {
    badgeL.style.opacity = ratio;
    badgeR.style.opacity = 0;
    if (edgeGlow) {
      edgeGlow.classList.add('left');
      edgeGlow.classList.remove('right');
      edgeGlow.style.opacity = (ratio * 0.9).toFixed(2);
    }
    if (btnLeftEl) btnLeftEl.classList.add('drag-preview');
    if (btnRightEl) btnRightEl.classList.remove('drag-preview');
    showDots(c.left);
    renderMascot('normal', -1);
  } else if (dx > 14) {
    badgeR.style.opacity = ratio;
    badgeL.style.opacity = 0;
    if (edgeGlow) {
      edgeGlow.classList.add('right');
      edgeGlow.classList.remove('left');
      edgeGlow.style.opacity = (ratio * 0.9).toFixed(2);
    }
    if (btnRightEl) btnRightEl.classList.add('drag-preview');
    if (btnLeftEl) btnLeftEl.classList.remove('drag-preview');
    showDots(c.right);
    renderMascot('normal', 1);
  } else {
    badgeL.style.opacity = 0;
    badgeR.style.opacity = 0;
    clearDragPostFX();
    showDots(null);
    renderMascot('normal');
  }
});

function endDrag(cancelled = false) {
  if (!dragging) return;
  dragging = false;
  if (busy) return;

  if (!cancelled && dx < -65) {
    Sound.swipe();
    applyDecision('left');
  } else if (!cancelled && dx > 65) {
    Sound.swipe();
    applyDecision('right');
  } else {
    cardEl.className = 'game-card smooth-return' + (streak >= 2 ? ' combo-glow' : '');
    cardEl.style.transform = 'translate3d(0,0,0) rotate(0deg)';
    cardShine.style.transform = 'translateX(0px)';
    spriteWrap.style.transform = '';
    badgeL.style.opacity = 0;
    badgeR.style.opacity = 0;
    clearDragPostFX();
    showDots(null);
    renderMascot('normal');
    if (idx === 0 && !hasSwipedOnce) tutorialHand.classList.add('visible');
  }
}

window.addEventListener('pointerup', () => endDrag());
window.addEventListener('pointercancel', () => endDrag(true));

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
