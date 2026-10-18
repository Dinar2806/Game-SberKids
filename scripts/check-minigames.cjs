// Runs the actual mini-game runner and card transitions without browser dependencies.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const read = require('./read-game-code.cjs');
const runnerSource = read('js/minigames.js');
const gameSource = read('js/game.js');
const GameData = vm.runInNewContext(read('js/campaign-data.js') + '; GameData');
const StoryDirector = vm.runInNewContext(read('js/story-director.js') + '; StoryDirector');
const campaigns = GameData.validateCatalog(JSON.parse(read('data/campaigns.json')));
const campaign = campaigns.find(item => item.id === 'scooter');
const events = GameData.validateEvents(JSON.parse(read(campaign.eventsFile)), campaign.id);
const story = StoryDirector.validate(JSON.parse(read(campaign.storyFile)), events);

class Element {
  constructor() {
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.textContent = '';
    this.hidden = true;
    this.handlers = {};
    this.attributes = {};
    this.className = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.contains(name) : force;
        this.classList[enabled ? 'add' : 'remove'](name);
        return enabled;
      }
    };
  }
  set innerHTML(markup) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    this.markup = markup;
    // Only the mini-game's named controls need to exist in this DOM substitute.
    for (const [, id] of markup.matchAll(/id="([^"]+)"/g)) {
      const child = new Element();
      child.id = id;
      this.appendChild(child);
    }
  }
  get innerHTML() { return this.markup || ''; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.innerHTML = ''; children.forEach(child => this.appendChild(child)); }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === '#' + child.id) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  getBoundingClientRect() { return { left: 10, top: 10, width: 100, height: 100 }; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
}

function timers() {
  let now = 0;
  let sequence = 0;
  const tasks = new Map();
  const schedule = (callback, delay, interval) => {
    const id = ++sequence;
    tasks.set(id, { callback, due: now + delay, interval });
    return id;
  };
  return {
    tasks,
    setTimeout: (callback, delay) => schedule(callback, delay, 0),
    setInterval: (callback, delay) => schedule(callback, delay, delay),
    clearTimeout: id => tasks.delete(id),
    clearInterval: id => tasks.delete(id),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...tasks.entries()].filter(([, task]) => task.due <= until).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, task] = next;
        now = task.due;
        if (task.interval) task.due += task.interval;
        else tasks.delete(id);
        task.callback();
      }
      now = until;
    }
  };
}

function environment() {
  const clock = timers();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const state = {
    ...clock,
    campaignRun: 1,
    idleHintTimer: null,
    currentDream: campaign,
    stats: { money: 50, tech: 50, trust: 50, team: 50 },
    dreamPct: 20,
    syncs: 0,
    banners: [],
    Sound: { coin() {}, bad() {}, unlock() {}, swipe() {} },
    clamp: value => Math.max(0, Math.min(100, Math.round(value))),
    clampDreamProgress: value => Math.max(0, Math.min(100, Math.round(value))),
    syncUI: () => { state.syncs++; },
    flashBanner: text => state.banners.push(text),
    spawnBurst() {},
    Math: Object.assign(Object.create(Math), { random: () => 0.8 }),
    document: {
      getElementById: element,
      createElement: () => new Element(),
      querySelector: () => element('minigameOverlay').classList.contains('active') ? element('minigameOverlay') : null
    }
  };
  vm.createContext(state);
  vm.runInContext(runnerSource, state, { filename: 'minigames.js' });
  state.games = vm.runInContext('MINI_GAMES', state);
  return { state, clock, element };
}

const metadata = environment().state.games;
assert.equal(metadata.length, 8);
assert.equal(new Set(metadata.map(game => game.title)).size, 8);
for (const game of metadata) {
  assert.equal(game.duration, 15);
  for (const key of ['title', 'emoji', 'desc', 'tip']) assert.equal(typeof game[key], 'string');
}

// Each mechanic initializes and expires through the real timer cleanup path.
for (let gameType = 0; gameType < metadata.length; gameType++) {
  const { state, clock, element } = environment();
  let callbacks = 0;
  assert.equal(state.startMiniGame(gameType, () => { callbacks++; }), true);
  assert(element('minigameOverlay').classList.contains('active'));
  assert(element('mgTitle').textContent.includes(metadata[gameType].title));
  const finish = element('mgSkipBtn').onclick;
  const taskCount = clock.tasks.size;
  assert.equal(state.startMiniGame(gameType, () => { throw new Error('Duplicate callback'); }), false);
  assert.equal(clock.tasks.size, taskCount, 'duplicate launch must not reset timers');
  clock.advance(14999);
  assert.equal(callbacks, 0);
  clock.advance(1);
  assert.equal(callbacks, 1);
  assert.equal(state.syncs, 1);
  assert.equal(clock.tasks.size, 0, 'all spawn/expiration timers must be cleared');
  assert(!element('minigameOverlay').classList.contains('active'));
  assert.equal(element('mgArena').children.length, 0);
  finish();
  clock.advance(30000);
  assert.equal(callbacks, 1, 'stale finish must not reward twice');
  assert.equal(state.syncs, 1);
}

{
  const { state, clock, element } = environment();
  for (const invalid of [-1, 8, 0.5, '0', NaN, undefined]) assert.equal(state.startMiniGame(invalid, () => {}), false);
  assert.equal(clock.tasks.size, 0);
  let callbacks = 0;
  state.startMiniGame(2, () => { callbacks++; });
  const wrap = element('mgArena').children[0];
  const trash = wrap.querySelector('#sortTrashBtn');
  const bank = wrap.querySelector('#sortBankBtn');
  for (let index = 0; index < 20; index++) (index % 2 ? bank : trash).onclick();
  const finish = element('mgSkipBtn').onclick;
  finish();
  assert.equal(state.dreamPct, 20 + campaign.balance.miniGameMaxBonus, 'reward must respect the campaign cap');
  assert.equal(state.stats.money, 50 + Math.round(campaign.balance.miniGameMaxBonus / 2));
  assert.equal(state.stats.tech, 50);
  const awarded = state.dreamPct;
  bank.onclick();
  finish();
  assert.equal(state.dreamPct, awarded, 'detached controls must not award late bonuses');
  assert.equal(callbacks, 1);
}

for (const changeRun of [false, true]) {
  const { state, clock, element } = environment();
  let callbacks = 0;
  state.startMiniGame(0, () => { callbacks++; });
  clock.advance(430);
  const item = element('mgArena').children[0];
  item.handlers.pointerdown({ stopPropagation() {} });
  const finish = element('mgSkipBtn').onclick;
  const oldTimers = [...clock.tasks.values()].map(task => task.callback);
  if (changeRun) {
    state.campaignRun++;
    clock.advance(1000);
  } else state.cancelMiniGame();
  assert.equal(clock.tasks.size, 0);
  assert.equal(element('mgSkipBtn').onclick, null);
  assert.equal(state.dreamPct, 20);
  assert.equal(state.stats.money, 50);
  finish();
  item.handlers.pointerdown({ stopPropagation() {} });
  oldTimers.forEach(callback => callback());
  assert.equal(callbacks, 0);
  assert.equal(state.syncs, 0);
  assert.equal(state.banners.length, 0);
  assert.equal(state.startMiniGame(1, () => { callbacks++; }), true, 'cleanup must release the active session');
  finish();
  assert(element('minigameOverlay').classList.contains('active'), 'old finish must not close the new game');
  element('mgSkipBtn').onclick();
  assert.equal(callbacks, 1);
}

// Extract full function declarations at stable neighboring declarations.
function section(start, end) {
  const from = gameSource.indexOf(start);
  const to = gameSource.indexOf(end, from);
  assert(from >= 0 && to > from, 'Missing game section: ' + start);
  return gameSource.slice(from, to);
}

function cardEnvironment(director = null) {
  const env = environment();
  const { state, element } = env;
  Object.assign(state, {
    GameData,
    MINI_GAMES: state.games,
    storyDirector: director,
    activeDeck: events,
    sideFlipMap: events.map(() => false),
    BG_PAL: {},
    idx: 4,
    miniGamesPending: 1,
    miniGameOfferCount: 0,
    streak: 3,
    scamMistakes: 0,
    busy: false,
    hasSwipedOnce: true,
    cardEl: element('activeCard'),
    spriteWrap: element('spriteContainer'),
    mascotHint: element('mascotHint'),
    mascotAvatar: element('mascotAvatar'),
    tutorialHand: element('tutorialHand'),
    window: { innerWidth: 400, innerHeight: 800 },
    emphasizeChoice() {}, closeMascotHint() {}, followCardWithMascot() {},
    shiftBackground() {}, showDots() {}, renderMascot() {}, resetIdleHintTimer() {},
    buildCardSVG: () => '<svg></svg>',
    finishGame: () => { throw new Error('Unexpected campaign ending'); }
  });
  vm.runInContext(section('function resolveCard(', 'function showCard(') +
    section('function showCard(', '// 11. ГЕНЕРАТОР') +
    section('function applyDecision(', 'let completedSent'), state, { filename: 'game-card-transitions.js' });
  return env;
}

for (const direction of ['left', 'right']) {
  const { state, clock } = cardEnvironment();
  state.showCard();
  assert.equal(state.activeCardData.type, 'minigame');
  assert.equal(state.miniGamesPending, 0);
  assert.equal(state.miniGameOfferCount, 1);
  const before = JSON.stringify({ stats: state.stats, dream: state.dreamPct, idx: state.idx, streak: state.streak });
  state.applyDecision(direction);
  clock.advance(360);
  assert.equal(JSON.stringify({ stats: state.stats, dream: state.dreamPct, idx: state.idx, streak: state.streak }), before);
  assert.equal(state.activeCardData.id, events[4].id, 'skip must preserve the next regular card');
  assert.equal(state.busy, false);
}

{
  const { state, element } = cardEnvironment();
  state.showCard();
  const index = state.idx;
  state.openMiniGameCard();
  assert.equal(state.busy, true);
  assert(element('minigameOverlay').classList.contains('active'));
  element('mgSkipBtn').onclick();
  assert.equal(state.idx, index);
  assert.equal(state.activeCardData.id, events[index].id);
  assert.equal(state.busy, false);
  state.miniGamesPending = 2;
  state.showCard(false);
  assert.equal(state.miniGamesPending, 2, 'forced regular card must not consume queued offers');
  assert.equal(state.activeCardData.id, events[index].id);
}

{
  const director = StoryDirector.create(story, events, { seed: 1 });
  const { state, clock } = cardEnvironment(director);
  state.idx = 0;
  state.showCard();
  assert.equal(state.activeCardData.id, story.opening, 'opening must precede mini-game offers');
  assert.equal(state.miniGamesPending, 1);
  director.commit('optA');
  state.showCard();
  assert.equal(state.activeCardData.id, 'scooter-002', 'follow-up must precede mini-game offers');
  director.commit('optA');
  state.showCard();
  assert.equal(state.activeCardData.id, 'scooter-017');
  director.commit('optA');
  state.showCard();
  assert.equal(state.activeCardData.id, story.chapters[0].milestone, 'ready milestone must precede mini-game offers');
  director.commit('optA');
  state.showCard();
  assert.equal(state.activeCardData.type, 'minigame');
  const before = JSON.stringify(director.getStatus());
  state.applyDecision('left');
  clock.advance(360);
  const after = director.getStatus();
  const previous = JSON.parse(before);
  assert.equal(after.turnsCompleted, previous.turnsCompleted, 'skip must not commit a story decision');
  assert.deepEqual(Array.from(after.history), previous.history);
  assert.deepEqual(Array.from(after.facts), previous.facts);
  assert.equal(after.milestonesCompleted, previous.milestonesCompleted);
  assert.notEqual(state.activeCardData.type, 'minigame');
}

console.log('Mini-game metadata, runner lifecycle, rewards and optional card transitions passed');
