// Порядок совпадает с gameType в колоде и механиками ниже.
const MINI_GAMES = [
  {
    title: 'Монетный звездопад', emoji: '🪙',
    desc: 'Лови монетки и звёзды, обходи бомбочки.',
    tip: 'Нажимай на 🪙 и 🌟, не трогай 💣.', duration: 15
  },
  {
    title: 'Кибер-щит 3×3', emoji: '🛡️',
    desc: 'Поймай мошенников, не задевая друзей.',
    tip: 'Нажимай на 🥷 и 🎣, пропускай 🦊.', duration: 15
  },
  {
    title: 'Умная сортировка', emoji: '⚡',
    desc: 'Полезное — в копилку, ловушки — в корзину.',
    tip: 'Выбирай, куда отправить каждое действие.', duration: 15
  },
  {
    title: 'Выгодный ценник', emoji: '🛒',
    desc: 'Сравни предложения и выбери покупку дешевле.',
    tip: 'Учти скидки, доставку и количество товаров.', duration: 15
  },
  {
    title: 'Сейф памяти', emoji: '🧠',
    desc: 'Открывай карточки и находи одинаковые пары.',
    tip: 'Запоминай символы и найди все четыре пары.', duration: 15
  },
  {
    title: 'Турбо-реактор', emoji: '🔋',
    desc: 'Лови заряды и батарейки, избегай красных искр.',
    tip: 'Нажимай на ⚡ и 🔋, не трогай 💢.', duration: 15
  },
  {
    title: 'Детектор подвоха', emoji: '🔍',
    desc: 'Найди обман в сообщениях и лишние траты в чеке.',
    tip: 'Нажимай только на подозрительные строки.', duration: 15
  },
  {
    title: 'Кибер-сейф пароля', emoji: '🔐',
    desc: 'Выбирай надёжный пароль и безопасные настройки.',
    tip: 'Нажимай на вариант, который лучше защитит аккаунт.', duration: 15
  }
];

let activeMiniGame = null;

// Смена кампании закрывает игру без награды и перехода по старой колоде.
function cancelMiniGame() {
  if (activeMiniGame) activeMiniGame.cancel();
}

function startMiniGame(gameType, nextCallback) {
  const game = Number.isInteger(gameType) ? MINI_GAMES[gameType] : null;
  if (!game) return false;
  if (activeMiniGame) {
    if (activeMiniGame.run === campaignRun) return false;
    cancelMiniGame();
  }

  clearTimeout(idleHintTimer);
  const run = campaignRun;
  const overlay = document.getElementById('minigameOverlay');
  const arena = document.getElementById('mgArena');
  const titleEl = document.getElementById('mgTitle');
  const subEl = document.getElementById('mgSub');
  const timerEl = document.getElementById('mgTimer');
  const scoreEl = document.getElementById('mgScore');
  const skipBtn = document.getElementById('mgSkipBtn');

  arena.innerHTML = '';
  overlay.classList.add('active');
  let bonus = 0;
  let timeLeft = game.duration;
  let finished = false;
  const timeouts = new Set();
  const intervals = new Set();
  const session = { run, cancel: () => endMiniGame(false) };
  activeMiniGame = session;

  function isCurrent() {
    if (finished) return false;
    if (run === campaignRun) return true;
    endMiniGame(false);
    return false;
  }

  function later(callback, delay) {
    const timer = setTimeout(() => {
      timeouts.delete(timer);
      if (isCurrent()) callback();
    }, delay);
    timeouts.add(timer);
    return timer;
  }

  function repeat(callback, delay) {
    const timer = setInterval(() => {
      if (isCurrent()) callback();
    }, delay);
    intervals.add(timer);
    return timer;
  }

  // Бонус задаётся кампанией независимо от количества событий.
  const maxCap = currentDream.balance.miniGameMaxBonus;

  const timerFillEl = document.getElementById('mgTimerFill');
  titleEl.textContent = `${game.emoji} ${game.title}`;
  subEl.textContent = game.tip;
  if (timerFillEl) timerFillEl.style.width = '100%';
  timerEl.textContent = `⏱️ ${timeLeft} сек`;
  scoreEl.textContent = `Бонус: +0 🌟`;

  function addBonus(delta, x, y, symbol) {
    if (!isCurrent()) return;
    bonus = Math.max(0, Math.min(maxCap, bonus + delta));
    scoreEl.textContent = `Бонус: +${bonus} 🌟`;
    if (delta > 0) Sound.coin(); else Sound.bad();
    if (x && y) spawnBurst(x, y, [symbol], 3);
  }

  function endMiniGame(award = true) {
    if (finished) return;
    finished = true;
    timeouts.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    timeouts.clear();
    intervals.clear();
    if (activeMiniGame === session) activeMiniGame = null;
    overlay.classList.remove('active');
    arena.innerHTML = '';
    skipBtn.onclick = null;
    if (!award || run !== campaignRun) return;
    dreamPct = clampDreamProgress(dreamPct + bonus);
    stats.money = clamp(stats.money + Math.round(bonus / 2));
    syncUI();
    Sound.unlock();
    flashBanner(`🎉 Мини-игра: +${bonus}% к Мечте и +${Math.round(bonus / 2)} 🪙!`);
    if (typeof nextCallback === 'function') nextCallback();
  }

  skipBtn.onclick = () => endMiniGame();

  if (gameType === 0) {
    // ИГРА 1: Монетный звездопад
    repeat(() => {
      const item = document.createElement('div');
      item.className = 'mg-item';
      const isBomb = Math.random() < 0.3;
      item.textContent = isBomb ? '💣' : (Math.random() < 0.5 ? '🪙' : '🌟');
      item.style.background = isBomb ? '#ffe4e6' : '#fef9c3';
      item.style.left = (8 + Math.random() * 76) + '%';
      item.style.top = (8 + Math.random() * 74) + '%';
      item.addEventListener('pointerdown', (e) => {
        if (!isCurrent()) return;
        e.stopPropagation();
        const r = item.getBoundingClientRect();
        addBonus(isBomb ? -1 : 1, r.left + 25, r.top + 25, isBomb ? '💥' : '🌟');
        item.remove();
      });
      arena.appendChild(item);
      later(() => { if (item.parentNode) item.remove(); }, 1000);
    }, 430);

  } else if (gameType === 1) {
    // ИГРА 2: Кибер-Щит 3x3
    const grid = document.createElement('div');
    grid.className = 'mg-grid3x3';
    const holes = [];
    for (let i = 0; i < 9; i++) {
      const h = document.createElement('div');
      h.className = 'mg-hole';
      grid.appendChild(h);
      holes.push(h);
    }
    arena.appendChild(grid);

    repeat(() => {
      const hole = holes[Math.floor(Math.random() * holes.length)];
      if (hole.textContent) return;
      const isFriend = Math.random() < 0.28;
      hole.textContent = isFriend ? '🦊' : (Math.random() < 0.5 ? '🥷' : '🎣');
      hole.style.background = isFriend ? '#dcfce7' : '#ffe4e6';
      hole.onpointerdown = (e) => {
        if (!isCurrent()) return;
        e.stopPropagation();
        if (!hole.textContent) return;
        const r = hole.getBoundingClientRect();
        addBonus(isFriend ? -1 : 1, r.left + 30, r.top + 30, isFriend ? '🙈' : '🛡️');
        hole.textContent = '';
        hole.style.background = '#e2e8f0';
      };
      later(() => {
        hole.textContent = '';
        hole.style.background = '#e2e8f0';
      }, 880);
    }, 460);

  } else if (gameType === 2) {
    // ИГРА 3: Умная сортировка
    const items = [
      { t: '🥷 Назвать код из СМС', good: false },
      { t: '🐷 Отложить сдачу в копилку', good: true },
      { t: '🎣 Ввести CVV-код для «приза»', good: false },
      { t: '🧾 Проверить чек у кассы', good: true },
      { t: '🎰 Автомат-рулетка на удачу', good: false },
      { t: '🏷️ Сравнить цены в 3 магазинах', good: true },
      { t: '🕵️ Перевести чужие деньги', good: false },
      { t: '📱 Отключить старую подписку', good: true }
    ];
    let sIdx = 0;
    const wrap = document.createElement('div');
    wrap.className = 'sorter-stage';
    wrap.innerHTML = `
      <div style="font-size:38px;">📦</div>
      <div class="sorter-card" id="sortCardText"></div>
      <div class="sorter-btns">
        <button type="button" class="choice-btn left" id="sortTrashBtn" style="justify-content:center;">🗑️ В корзину</button>
        <button type="button" class="choice-btn right" id="sortBankBtn" style="justify-content:center;">🏦 В копилку</button>
      </div>`;
    arena.appendChild(wrap);

    const cardTxt = wrap.querySelector('#sortCardText');
    function nextSortItem() { cardTxt.textContent = items[sIdx % items.length].t; }
    function handleSort(toBank, btnEl) {
      if (!isCurrent()) return;
      const cur = items[sIdx % items.length];
      const ok = (toBank && cur.good) || (!toBank && !cur.good);
      const r = btnEl.getBoundingClientRect();
      addBonus(ok ? 1 : -1, r.left + 40, r.top, ok ? '✅' : '❌');
      sIdx++;
      nextSortItem();
    }
    wrap.querySelector('#sortTrashBtn').onclick = function() { handleSort(false, this); };
    wrap.querySelector('#sortBankBtn').onclick = function() { handleSort(true, this); };
    nextSortItem();

  } else if (gameType === 3) {
    // ИГРА 4: Честный Ценник (выбери где покупка выгоднее!)
    const deals = [
      { a: '🏷️ 100 🪙 (скидка 30 🪙)', b: '🏷️ 80 🪙 (без скидки)', aWin: true },
      { a: '📦 60 🪙 + доставка 25 🪙', b: '📦 75 🪙 + доставка 0 🪙', aWin: false },
      { a: '🔋 2 шт. за 90 🪙', b: '🔋 1 шт. за 40 🪙 (нужно 2)', aWin: false },
      { a: '🎧 120 🪙 − купон 40 🪙', b: '🎧 85 🪙 по акции', aWin: true },
      { a: '🛞 50 🪙 + сборка 20 🪙', b: '🛞 65 🪙 всё включено', aWin: false },
      { a: '🎮 150 🪙 − кэшбэк 35 🪙', b: '🎮 125 🪙 без бонусов', aWin: true }
    ];
    let dIdx = 0;
    const wrap = document.createElement('div');
    wrap.className = 'sorter-stage';
    wrap.innerHTML = `
      <div style="font-size:36px;">🧮</div>
      <div style="font-size:13px; font-weight:800; color:#475569;">Какое предложение выгоднее?</div>
      <div style="display:grid; gap:10px; width:100%;">
        <button type="button" class="choice-btn left" id="dealBtnA" style="justify-content:center; padding:14px;"></button>
        <button type="button" class="choice-btn right" id="dealBtnB" style="justify-content:center; padding:14px;"></button>
      </div>`;
    arena.appendChild(wrap);
    const btnA = wrap.querySelector('#dealBtnA');
    const btnB = wrap.querySelector('#dealBtnB');
    function renderDeal() {
      const d = deals[dIdx % deals.length];
      btnA.textContent = d.a;
      btnB.textContent = d.b;
    }
    function pickDeal(choseA, btnEl) {
      if (!isCurrent()) return;
      const d = deals[dIdx % deals.length];
      const ok = (choseA && d.aWin) || (!choseA && !d.aWin);
      const r = btnEl.getBoundingClientRect();
      addBonus(ok ? 2 : -1, r.left + 60, r.top, ok ? '🎯' : '❌');
      dIdx++;
      renderDeal();
    }
    btnA.onclick = function() { pickDeal(true, this); };
    btnB.onclick = function() { pickDeal(false, this); };
    renderDeal();

  } else if (gameType === 4) {
    // ИГРА 5: Сейф Памяти (найди 4 пары символов)
    const syms = ['🪙', '🪙', '🛡️', '🛡️', '🔋', '🔋', '🌟', '🌟'].sort(() => Math.random() - 0.5);
    const grid = document.createElement('div');
    grid.className = 'mem-grid';
    let firstCard = null;
    let lockBoard = false;

    syms.forEach((sym) => {
      const cell = document.createElement('div');
      cell.className = 'mem-card';
      cell.textContent = '❓';
      cell.dataset.sym = sym;
      cell.onpointerdown = (e) => {
        if (!isCurrent()) return;
        e.stopPropagation();
        if (lockBoard || cell === firstCard || cell.classList.contains('matched')) return;
        cell.textContent = sym;
        if (!firstCard) {
          firstCard = cell;
          Sound.swipe();
        } else {
          if (firstCard.dataset.sym === cell.dataset.sym) {
            firstCard.classList.add('matched');
            cell.classList.add('matched');
            const r = cell.getBoundingClientRect();
            addBonus(2, r.left + 25, r.top + 25, '✨');
            firstCard = null;
          } else {
            lockBoard = true;
            Sound.bad();
            const prev = firstCard;
            firstCard = null;
            later(() => {
              prev.textContent = '❓';
              cell.textContent = '❓';
              lockBoard = false;
            }, 480);
          }
        }
      };
      grid.appendChild(cell);
    });
    arena.appendChild(grid);

  } else if (gameType === 5) {
    // ИГРА 6: Турбо-Реактор с защитой от короткого замыкания
    repeat(() => {
      const orb = document.createElement('div');
      orb.className = 'mg-item';
      const isBad = Math.random() < 0.25;
      orb.style.background = isBad ? '#ffe4e6' : '#dbeafe';
      orb.style.border = isBad ? '2px solid #f43f5e' : '2px solid #3b82f6';
      orb.textContent = isBad ? '💢' : (Math.random() < 0.5 ? '⚡' : '🔋');
      orb.style.left = (10 + Math.random() * 72) + '%';
      orb.style.top = (10 + Math.random() * 72) + '%';
      orb.addEventListener('pointerdown', (e) => {
        if (!isCurrent()) return;
        e.stopPropagation();
        const r = orb.getBoundingClientRect();
        addBonus(isBad ? -1 : 1, r.left + 25, r.top + 25, isBad ? '💥' : '⚡');
        orb.remove();
      });
      arena.appendChild(orb);
      later(() => { if (orb.parentNode) orb.remove(); }, 860);
    }, 410);

  } else if (gameType === 6) {
    // ИГРА 7: Детектор Подвоха в чеке и СМС
    const rounds = [
      [
        { t: '🧾 Самокат городской — 100 🪙', bad: false },
        { t: '⚠️ «Скрытая страховка воздуха» — 45 🪙', bad: true },
        { t: '🧾 Зарядное устройство — 20 🪙', bad: false }
      ],
      [
        { t: '📩 «Назови код из СМС для приза!»', bad: true },
        { t: '📩 «Мама: Купи хлеба по дороге домой»', bad: false },
        { t: '📩 «Друг: Пойдём кататься в парк в 16:00»', bad: false }
      ],
      [
        { t: '🌐 Сайт: sberkids-official-prize99.xyz', bad: true },
        { t: '🧾 Полезный перекус (яблоки) — 15 🪙', bad: false },
        { t: '🧾 Тетрадь в клетку — 10 🪙', bad: false }
      ],
      [
        { t: '🧾 Ремонт тормозов — 30 🪙', bad: false },
        { t: '🧾 Светодиодный фонарик — 20 🪙', bad: false },
        { t: '⚠️ «Плата за вход в бесплатный парк» — 50 🪙', bad: true }
      ]
    ];
    let rIdx = 0;
    const list = document.createElement('div');
    list.className = 'detective-list';
    arena.appendChild(list);

    function renderRound() {
      list.innerHTML = '';
      const set = rounds[rIdx % rounds.length];
      set.forEach(item => {
        const row = document.createElement('div');
        row.className = 'detective-row';
        row.innerHTML = `<span>${item.t}</span><span>🔍</span>`;
        row.onclick = () => {
          if (!isCurrent()) return;
          const r = row.getBoundingClientRect();
          if (item.bad) {
            addBonus(2, r.left + 80, r.top, '🛡️');
            rIdx++;
            renderRound();
          } else {
            addBonus(-1, r.left + 80, r.top, '❌');
            row.style.background = '#ffe4e6';
          }
        };
        list.appendChild(row);
      });
    }
    renderRound();

  } else {
    // ИГРА 8: Кибер-Сейф Пароля
    const pairs = [
      { a: '🔓 Пароль: 123456', b: '🔐 Пароль: Fox#92!Voltik', aGood: false },
      { a: '🔐 Двухфакторная защита ВКЛ', b: '🔓 Одинаковый пароль везде', aGood: true },
      { a: '🔓 Пароль: qwerty', b: '🔐 Пароль: Sber*Kids#2026', aGood: false },
      { a: '🔐 Вход по отпечатку и коду', b: '🔓 Написать ПИН-код на карте', aGood: true }
    ];
    let pIdx = 0;
    const wrap = document.createElement('div');
    wrap.className = 'sorter-stage';
    wrap.innerHTML = `
      <div style="font-size:38px;">🛡️</div>
      <div style="font-size:13px; font-weight:800; color:#475569;">Что защитит твой аккаунт?</div>
      <div style="display:grid; gap:10px; width:100%;">
        <button type="button" class="choice-btn left" id="pwBtnA" style="justify-content:center; padding:14px;"></button>
        <button type="button" class="choice-btn right" id="pwBtnB" style="justify-content:center; padding:14px;"></button>
      </div>`;
    arena.appendChild(wrap);
    const btnA = wrap.querySelector('#pwBtnA');
    const btnB = wrap.querySelector('#pwBtnB');
    function renderPw() {
      const p = pairs[pIdx % pairs.length];
      btnA.textContent = p.a;
      btnB.textContent = p.b;
    }
    function pickPw(isA, el) {
      if (!isCurrent()) return;
      const p = pairs[pIdx % pairs.length];
      const ok = (isA && p.aGood) || (!isA && !p.aGood);
      const r = el.getBoundingClientRect();
      addBonus(ok ? 2 : -1, r.left + 60, r.top, ok ? '🔐' : '💥');
      pIdx++;
      renderPw();
    }
    btnA.onclick = function() { pickPw(true, this); };
    btnB.onclick = function() { pickPw(false, this); };
    renderPw();
  }

  repeat(() => {
    timeLeft--;
    timerEl.textContent = `⏱️ ${timeLeft} сек`;
    if (timerFillEl) timerFillEl.style.width = `${Math.max(0, (timeLeft / game.duration) * 100)}%`;
    if (timeLeft <= 0) endMiniGame();
  }, 1000);
  return true;
}
