// Chooses story events independently from presentation, effects, and VFX randomness.
const StoryDirector = (() => {
  const statNames = ['money', 'tech', 'trust', 'team', 'dream'];
  const operators = {
    '>=': (a, b) => a >= b, '<=': (a, b) => a <= b,
    '>': (a, b) => a > b, '<': (a, b) => a < b,
    '==': (a, b) => a === b, '!=': (a, b) => a !== b
  };
  const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const has = (obj, key) => Object.hasOwn(obj, key);
  const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
  const ensure = (ok, path, message) => { if (!ok) fail(path, message); };

  function object(value, path, keys) {
    ensure(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'нужен объект');
    for (const key of Object.keys(value)) ensure(keys.includes(key), `${path}.${key}`, 'неизвестное поле');
  }
  function stringId(value, path) {
    ensure(typeof value === 'string' && idPattern.test(value), path, 'нужен id из строчных латинских букв, цифр и дефисов');
  }
  function list(value, path, check) {
    ensure(Array.isArray(value), path, 'нужен список');
    const seen = new Set();
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      check(item, itemPath);
      ensure(!seen.has(item), itemPath, `повтор ${item}`);
      seen.add(item);
    });
  }
  function positive(value, path) {
    ensure(Number.isFinite(value) && value > 0, path, 'нужно положительное конечное число');
  }

  function validate(config, events, source = 'story') {
    object(config, source, ['version', 'opening', 'facts', 'chapters', 'events', 'maxTurns']);
    ensure(config.version === 2, `${source}.version`, 'поддерживается версия 2');
    ensure(Number.isSafeInteger(config.maxTurns) && config.maxTurns > 0, `${source}.maxTurns`, 'нужно положительное целое число');
    ensure(Array.isArray(events) && events.length > 0, `${source}.events`, 'нужен непустой список карточек');
    const eventIds = new Set();
    events.forEach((event, i) => {
      const path = `${source}.cards[${i}].id`;
      ensure(event && typeof event === 'object', path, 'нужна карточка');
      stringId(event.id, path);
      ensure(!eventIds.has(event.id), path, `повторный id ${event.id}`);
      eventIds.add(event.id);
    });
    const eventRef = (value, path) => {
      stringId(value, path);
      ensure(eventIds.has(value), path, `неизвестная карточка ${value}`);
    };
    list(config.facts, `${source}.facts`, stringId);
    const facts = new Set(config.facts);
    const factRef = (value, path) => {
      stringId(value, path);
      ensure(facts.has(value), path, `неизвестный факт ${value}`);
    };
    function condition(value, path) {
      object(value, path, ['all', 'none', 'stats']);
      if (has(value, 'all')) list(value.all, `${path}.all`, factRef);
      if (has(value, 'none')) list(value.none, `${path}.none`, factRef);
      for (const fact of value.all || []) ensure(!(value.none || []).includes(fact), path, `факт ${fact} одновременно требуется и запрещён`);
      if (has(value, 'stats')) {
        ensure(Array.isArray(value.stats), `${path}.stats`, 'нужен список');
        value.stats.forEach((rule, i) => {
          const p = `${path}.stats[${i}]`;
          object(rule, p, ['stat', 'operator', 'value']);
          ensure(statNames.includes(rule.stat), `${p}.stat`, 'неизвестный показатель');
          ensure(has(operators, rule.operator), `${p}.operator`, 'неизвестный оператор');
          ensure(Number.isFinite(rule.value) && rule.value >= 0 && rule.value <= 100, `${p}.value`, 'нужно число от 0 до 100');
        });
      }
    }
    eventRef(config.opening, `${source}.opening`);
    ensure(Array.isArray(config.chapters) && config.chapters.length > 0, `${source}.chapters`, 'нужен непустой список');
    const chapterIds = new Set();
    const required = new Set([config.opening]);
    const repeatable = new Set();
    const unique = new Set();
    config.chapters.forEach((chapter, i) => {
      const p = `${source}.chapters[${i}]`;
      object(chapter, p, ['id', 'title', 'completeWhen', 'pool', 'repeatable', 'milestone']);
      stringId(chapter.id, `${p}.id`);
      ensure(!chapterIds.has(chapter.id), `${p}.id`, `повторный id ${chapter.id}`);
      chapterIds.add(chapter.id);
      ensure(typeof chapter.title === 'string' && chapter.title.trim(), `${p}.title`, 'нужен непустой текст');
      condition(chapter.completeWhen, `${p}.completeWhen`);
      ensure(['all', 'none', 'stats'].some(k => (chapter.completeWhen[k] || []).length), `${p}.completeWhen`, 'нужно непустое условие');
      list(chapter.pool, `${p}.pool`, eventRef);
      list(chapter.repeatable, `${p}.repeatable`, eventRef);
      chapter.pool.forEach(id => unique.add(id));
      chapter.repeatable.forEach(id => repeatable.add(id));
      eventRef(chapter.milestone, `${p}.milestone`);
      ensure(!required.has(chapter.milestone), `${p}.milestone`, 'веха или начало повторяются');
      required.add(chapter.milestone);
    });
    for (const id of repeatable) ensure(!unique.has(id), `${source}.events.${id}`, 'карточка не может быть одновременно уникальной и повторяемой');

    object(config.events, `${source}.events`, Object.keys(config.events || {}));
    const incoming = new Map();
    for (const [eventId, meta] of Object.entries(config.events)) {
      const p = `${source}.events.${eventId}`;
      eventRef(eventId, p);
      object(meta, p, ['weight', 'requires', 'boosts', 'choices', 'cooldown', 'urgentWhen']);
      if (has(meta, 'weight')) positive(meta.weight, `${p}.weight`);
      if (has(meta, 'cooldown')) {
        ensure(repeatable.has(eventId), `${p}.cooldown`, 'только для повторяемых карточек');
        ensure(Number.isSafeInteger(meta.cooldown) && meta.cooldown >= 0, `${p}.cooldown`, 'нужно неотрицательное целое число');
      }
      if (has(meta, 'urgentWhen')) {
        ensure(repeatable.has(eventId), `${p}.urgentWhen`, 'только для повторяемых карточек');
        condition(meta.urgentWhen, `${p}.urgentWhen`);
      }
      if (has(meta, 'requires')) condition(meta.requires, `${p}.requires`);
      if (has(meta, 'boosts')) {
        ensure(Array.isArray(meta.boosts), `${p}.boosts`, 'нужен список');
        meta.boosts.forEach((boost, i) => {
          const bp = `${p}.boosts[${i}]`;
          object(boost, bp, ['when', 'factor']);
          condition(boost.when, `${bp}.when`);
          positive(boost.factor, `${bp}.factor`);
        });
      }
      if (has(meta, 'choices')) {
        object(meta.choices, `${p}.choices`, ['optA', 'optB']);
        for (const [key, effect] of Object.entries(meta.choices)) {
          const ep = `${p}.choices.${key}`;
          object(effect, ep, ['set', 'clear', 'followUp']);
          if (has(effect, 'set')) list(effect.set, `${ep}.set`, factRef);
          if (has(effect, 'clear')) list(effect.clear, `${ep}.clear`, factRef);
          for (const fact of effect.set || []) ensure(!(effect.clear || []).includes(fact), ep, `факт ${fact} одновременно устанавливается и удаляется`);
          if (has(effect, 'followUp')) {
            ensure(!repeatable.has(eventId), `${ep}.followUp`, 'у повторяемой карточки не может быть продолжения');
            eventRef(effect.followUp, `${ep}.followUp`);
            const parent = incoming.get(effect.followUp);
            ensure(!parent || parent.id === eventId, `${ep}.followUp`, 'у продолжения должен быть один родитель');
            if (!parent) incoming.set(effect.followUp, { id: eventId, effects: [] });
            incoming.get(effect.followUp).effects.push(effect);
          }
        }
      }
    }

    for (const eventId of required) {
      ensure(!has(config.events[eventId] || {}, 'requires'), `${source}.events.${eventId}.requires`, 'начало и вехи не должны иметь условий');
      ensure(!incoming.has(eventId), `${source}.events.${eventId}`, 'продолжение не может быть началом или вехой');
    }
    config.chapters.forEach((chapter, i) => {
      for (const name of ['pool', 'repeatable']) chapter[name].forEach((eventId, j) => {
        const p = `${source}.chapters[${i}].${name}[${j}]`;
        ensure(!required.has(eventId), p, 'начало и вехи зарезервированы');
        ensure(!incoming.has(eventId), p, 'продолжение зарезервировано');
      });
    });
    for (const [eventId, parent] of incoming) {
      const requirements = (config.events[eventId] || {}).requires || {};
      const trigger = (config.events[parent.id] || {}).requires || {};
      const p = `${source}.events.${eventId}.requires`;
      ensure(!has(requirements, 'stats'), p, 'условие продолжения не может зависеть от показателей');
      for (const effect of parent.effects) {
        for (const fact of requirements.all || []) {
          ensure(!(effect.clear || []).includes(fact) && ((effect.set || []).includes(fact) || (trigger.all || []).includes(fact)), p, `родитель не гарантирует факт ${fact}`);
        }
        for (const fact of requirements.none || []) {
          ensure(!(effect.set || []).includes(fact) && ((effect.clear || []).includes(fact) || (trigger.none || []).includes(fact)), p, `родитель не гарантирует отсутствие факта ${fact}`);
        }
      }
    }
    // A continuation can itself lead to another continuation, but not form a cycle.
    const visiting = new Set();
    const visited = new Set();
    function visit(eventId) {
      ensure(!visiting.has(eventId), `${source}.events.${eventId}`, 'цикл продолжений');
      if (visited.has(eventId)) return;
      visiting.add(eventId);
      const choices = (config.events[eventId] || {}).choices || {};
      for (const effect of Object.values(choices)) if (effect.followUp) visit(effect.followUp);
      visiting.delete(eventId);
      visited.add(eventId);
    }
    for (const eventId of Object.keys(config.events)) visit(eventId);
    return config;
  }

  function makeRandom(seed) {
    if (seed === undefined) {
      try {
        const value = new Uint32Array(1);
        globalThis.crypto.getRandomValues(value);
        seed = value[0];
      } catch (_) {
        seed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
      }
    }
    ensure((typeof seed === 'number' && Number.isFinite(seed)) || typeof seed === 'string', 'seed', 'нужны конечное число или строка');
    let state = typeof seed === 'number' ? Math.trunc(seed) >>> 0 : 2166136261;
    if (typeof seed === 'string') for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function create(input, events, { seed } = {}) {
    validate(input, events);
    const config = JSON.parse(JSON.stringify(input));
    const cards = new Map(events.map(event => [event.id, event]));
    const random = makeRandom(seed);
    const facts = new Set();
    const used = new Set();
    const lastSeen = new Map();
    const history = [];
    let openingDone = false;
    let chapterIndex = 0;
    let checkpoint = 0;
    let pendingId = null;
    let current = null;
    let exhausted = false;

    function matches(rule, state) {
      if (!rule) return true;
      if ((rule.all || []).some(fact => !facts.has(fact))) return false;
      if ((rule.none || []).some(fact => facts.has(fact))) return false;
      return (rule.stats || []).every(({ stat, operator, value }) =>
        operators[operator](stat === 'dream' ? state.dreamPct : state.stats[stat], value));
    }
    function completed() { return openingDone && chapterIndex >= config.chapters.length && !pendingId && !current; }
    function isComplete() { return exhausted || completed(); }
    function isMilestoneReady(state) {
      if (current) return current.kind === 'milestone';
      return !isComplete() && openingDone && !pendingId && matches(config.chapters[chapterIndex].completeWhen, state);
    }
    function isPriorityCardReady(state) {
      return !isComplete() && !current && (!openingDone || !!pendingId || isMilestoneReady(state));
    }
    function weighted(candidates, state) {
      const weights = candidates.map(id => {
        const meta = config.events[id] || {};
        return Math.log(meta.weight || 1) + (meta.boosts || []).reduce((sum, boost) => sum + (matches(boost.when, state) ? Math.log(boost.factor) : 0), 0);
      });
      const max = Math.max(...weights);
      const scaled = weights.map(weight => Math.exp(weight - max));
      let pick = random() * scaled.reduce((sum, weight) => sum + weight, 0);
      let index = 0;
      while (index < scaled.length - 1 && pick >= scaled[index]) pick -= scaled[index++];
      return candidates[index];
    }
    function next(state) {
      if (current) return cards.get(current.id);
      if (isComplete()) return null;
      if (history.length >= config.maxTurns) { exhausted = true; return null; }
      ensure(state && state.stats && Number.isFinite(state.dreamPct), 'state', 'нужны stats и dreamPct');
      for (const stat of statNames.slice(0, 4)) ensure(Number.isFinite(state.stats[stat]), `state.stats.${stat}`, 'нужно конечное число');
      if (!openingDone) current = { id: config.opening, kind: 'opening' };
      else if (pendingId) current = { id: pendingId, kind: 'followUp' };
      else if (isMilestoneReady(state)) current = { id: config.chapters[chapterIndex].milestone, kind: 'milestone' };
      else {
        const chapter = config.chapters[chapterIndex];
        const eligible = id => matches((config.events[id] || {}).requires, state);
        const repeats = chapter.repeatable.filter(eligible);
        const urgent = repeats.filter(id => {
          const meta = config.events[id] || {};
          return meta.urgentWhen && matches(meta.urgentWhen, state);
        });
        const uniques = chapter.pool.filter(id => !used.has(id) && eligible(id));
        const ready = repeats.filter(id => !lastSeen.has(id) || history.length - lastSeen.get(id) - 1 >= ((config.events[id] || {}).cooldown ?? 3));
        let candidates = urgent.length ? urgent : uniques.length ? uniques : ready;
        if (!candidates.length && repeats.length) {
          const earliest = Math.min(...repeats.map(id => lastSeen.get(id)));
          candidates = repeats.filter(id => lastSeen.get(id) === earliest);
        }
        if (candidates.length) current = { id: weighted(candidates, state), kind: 'scene' };
        else { exhausted = true; return null; }
      }
      return cards.get(current.id);
    }
    function commit(option) {
      ensure(current, 'commit', 'сначала нужна текущая карточка');
      ensure(option === 'optA' || option === 'optB', 'commit', 'нужен optA или optB');
      const { id, kind } = current;
      const effect = (((config.events[id] || {}).choices || {})[option]) || {};
      for (const fact of effect.clear || []) facts.delete(fact);
      for (const fact of effect.set || []) facts.add(fact);
      used.add(id);
      lastSeen.set(id, history.length);
      history.push(id);
      if (kind === 'opening') openingDone = true;
      if (kind === 'milestone') {
        checkpoint = Math.max(checkpoint, dreamThreshold(config.chapters[chapterIndex]) ?? 0);
        chapterIndex++;
      }
      pendingId = effect.followUp || null;
      current = null;
      if (history.length >= config.maxTurns && !completed()) exhausted = true;
    }
    function dreamThreshold(chapter) {
      const rules = (chapter.completeWhen.stats || []).filter(rule => rule.stat === 'dream');
      return rules.length === 1 && rules[0].operator === '>=' ? rules[0].value : null;
    }
    function getStatus() {
      const chapter = config.chapters[chapterIndex];
      const from = chapterIndex === 0 ? 0 : dreamThreshold(config.chapters[chapterIndex - 1]);
      const to = chapter ? dreamThreshold(chapter) : null;
      const progressRange = from !== null && to !== null && to > from ? { from, to } : null;
      return {
        chapterId: !openingDone ? null : chapter ? chapter.id : null,
        chapterTitle: !openingDone ? 'Начало' : chapter ? chapter.title : 'Финал',
        turnsCompleted: history.length, maxTurns: config.maxTurns, milestonesCompleted: chapterIndex, checkpoint,
        facts: [...facts], history: [...history], pendingId, completed: completed(), exhausted, progressRange
      };
    }
    return { next, commit, isComplete, isMilestoneReady, isPriorityCardReady, getStatus };
  }

  return { validate, create };
})();
