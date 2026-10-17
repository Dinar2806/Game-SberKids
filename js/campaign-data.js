// JSON-контент отделён от отображения и игрового состояния.
const GameData = (() => {
  const stats = ['money', 'tech', 'trust', 'team'];
  const types = ['shop', 'friend', 'scam', 'tech', 'quiz'];
  const operators = {
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
    '>': (a, b) => a > b,
    '<': (a, b) => a < b,
    '==': (a, b) => a === b,
    '!=': (a, b) => a !== b
  };
  const difficulties = {
    easy: { label: 'Лёгкая', className: 'diff-easy' },
    medium: { label: 'Средняя', className: 'diff-med' },
    hard: { label: 'Сложная', className: 'diff-hard' }
  };
  const eventCache = new Map();

  function requireValue(ok, path, message) {
    if (!ok) throw new Error(`${path}: ${message}`);
  }
  function object(value, path) {
    requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'нужен объект');
  }
  function text(value, path) {
    requireValue(typeof value === 'string' && value.trim().length > 0, path, 'нужна непустая строка');
  }
  function number(value, path, min = -Infinity, max = Infinity) {
    requireValue(Number.isFinite(value) && value >= min && value <= max, path, `нужно число от ${min} до ${max}`);
  }
  function knownKeys(value, keys, path) {
    for (const key of Object.keys(value)) {
      requireValue(keys.includes(key), `${path}.${key}`, 'неизвестное поле');
    }
  }
  function id(value, path, seen) {
    requireValue(typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), path, 'нужен id из строчных латинских букв, цифр и дефисов');
    requireValue(!seen.has(value), path, `повторный id ${value}`);
    seen.add(value);
  }

  function validateCatalog(data) {
    object(data, 'catalog');
    knownKeys(data, ['campaigns'], 'catalog');
    requireValue(Array.isArray(data.campaigns) && data.campaigns.length > 0, 'campaigns', 'нужен непустой список');
    const seen = new Set();
    data.campaigns.forEach((c, i) => {
      const p = `campaigns[${i}]`;
      object(c, p);
      knownKeys(c, ['id', 'name', 'icon', 'description', 'difficulty', 'progressIcons', 'eventsFile', 'balance', 'endings'], p);
      id(c.id, `${p}.id`, seen);
      for (const key of ['name', 'icon', 'description']) text(c[key], `${p}.${key}`);
      requireValue(Object.hasOwn(difficulties, c.difficulty), `${p}.difficulty`, 'допустимы easy, medium, hard');
      requireValue(Array.isArray(c.progressIcons) && c.progressIcons.length === 5, `${p}.progressIcons`, 'нужны пять иконок прогресса');
      c.progressIcons.forEach((v, j) => text(v, `${p}.progressIcons[${j}]`));
      requireValue(typeof c.eventsFile === 'string' && /^\.\/data\/events\/[a-z0-9-]+\.json$/.test(c.eventsFile), `${p}.eventsFile`, 'нужен относительный путь ./data/events/<имя>.json');
      const b = c.balance;
      object(b, `${p}.balance`);
      knownKeys(b, ['initialStats', 'initialDream', 'winDream', 'miniGameMaxBonus', 'multipliers'], `${p}.balance`);
      object(b.initialStats, `${p}.balance.initialStats`);
      knownKeys(b.initialStats, stats, `${p}.balance.initialStats`);
      stats.forEach(key => number(b.initialStats[key], `${p}.balance.initialStats.${key}`, 1, 100));
      number(b.initialDream, `${p}.balance.initialDream`, 0, 100);
      number(b.winDream, `${p}.balance.winDream`, 1, 100);
      number(b.miniGameMaxBonus, `${p}.balance.miniGameMaxBonus`, 0, 100);
      object(b.multipliers, `${p}.balance.multipliers`);
      const keys = ['resourceLoss', 'resourceGain', 'dreamLoss', 'dreamGain'];
      knownKeys(b.multipliers, keys, `${p}.balance.multipliers`);
      keys.forEach(key => number(b.multipliers[key], `${p}.balance.multipliers.${key}`, 0));
      // Заготовки сюжетных концовок; игровой цикл пока их не использует.
      if (Object.hasOwn(c, 'endings')) {
        object(c.endings, `${p}.endings`);
        const outcomes = [...stats, 'victory', 'incomplete'];
        knownKeys(c.endings, outcomes, `${p}.endings`);
        outcomes.forEach(outcome => {
          const ep = `${p}.endings.${outcome}`;
          const ending = c.endings[outcome];
          object(ending, ep);
          knownKeys(ending, ['title', 'text', 'tip'], ep);
          for (const field of ['title', 'text', 'tip']) text(ending[field], `${ep}.${field}`);
        });
      }
    });
    return data.campaigns;
  }

  function validateCard(card, p) {
    object(card, p);
    knownKeys(card, ['id', 'type', 'emoji', 'title', 'desc', 'tip', 'optA', 'optB'], p);
    requireValue(types.includes(card.type), `${p}.type`, `допустимы ${types.join(', ')}`);
    for (const key of ['emoji', 'title', 'desc', 'tip']) text(card[key], `${p}.${key}`);
    for (const key of ['optA', 'optB']) {
      const option = card[key];
      const op = `${p}.${key}`;
      object(option, op);
      knownKeys(option, ['text', 'effects', 'dream', 'mascot', 'msg'], op);
      text(option.text, `${op}.text`);
      text(option.msg, `${op}.msg`);
      number(option.dream, `${op}.dream`, -100, 100);
      requireValue(['happy', 'think', 'scared'].includes(option.mascot), `${op}.mascot`, 'допустимы happy, think, scared');
      object(option.effects, `${op}.effects`);
      knownKeys(option.effects, stats, `${op}.effects`);
      stats.forEach(stat => number(option.effects[stat], `${op}.effects.${stat}`, -100, 100));
    }
  }

  function validateEvents(data, source = 'events') {
    object(data, source);
    knownKeys(data, ['events'], source);
    requireValue(Array.isArray(data.events) && data.events.length > 0, source, 'нужен непустой список events');
    const seen = new Set();
    data.events.forEach((event, i) => {
      const p = `${source}.events[${i}]`;
      object(event, p);
      id(event.id, `${p}.id`, seen);
      if (Object.hasOwn(event, 'condition')) {
        knownKeys(event, ['id', 'condition', 'then', 'else'], p);
        const condition = event.condition;
        object(condition, `${p}.condition`);
        knownKeys(condition, ['stat', 'operator', 'value'], `${p}.condition`);
        requireValue(stats.includes(condition.stat), `${p}.condition.stat`, 'неизвестный ресурс');
        requireValue(Object.hasOwn(operators, condition.operator), `${p}.condition.operator`, 'неизвестный оператор сравнения');
        number(condition.value, `${p}.condition.value`, 0, 100);
        validateCard(event.then, `${p}.then`);
        validateCard(event.else, `${p}.else`);
      } else {
        validateCard(event, p);
      }
    });
    return data.events;
  }

  async function readJSON(path, baseURL) {
    const response = await fetch(new URL(path, baseURL));
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }
  async function loadCatalog(baseURL = document.baseURI) {
    return validateCatalog(await readJSON('./data/campaigns.json', baseURL));
  }
  async function loadEvents(campaign, baseURL = document.baseURI) {
    const url = new URL(campaign.eventsFile, baseURL).href;
    if (!eventCache.has(url)) {
      const pending = readJSON(url, baseURL).then(data => validateEvents(data, campaign.id));
      eventCache.set(url, pending);
      pending.catch(() => eventCache.delete(url));
    }
    return eventCache.get(url);
  }

  function resolveEvent(event, state) {
    if (!event.condition) return { ...event, isCond: false };
    const { stat, operator, value } = event.condition;
    return { ...(operators[operator](state[stat], value) ? event.then : event.else), id: event.id, isCond: true };
  }

  function scaleEffect(value, multipliers, target) {
    const key = target + (value < 0 ? 'Loss' : 'Gain');
    return Math.round(value * multipliers[key]);
  }

  return { difficulties, validateCatalog, validateEvents, loadCatalog, loadEvents, resolveEvent, scaleEffect };
})();
