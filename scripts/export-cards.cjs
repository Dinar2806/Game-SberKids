// Снимок карточек и сценариев для ручной вычитки. Без зависимостей и запуска игры.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const stats = { money: '🪙 Копилка', tech: '⚡ Бодрость', trust: '❤️ Дружба', team: '🧠 Смекалка', dream: '🌟 Мечта, п.п.' };
const types = { shop: 'Покупки', friend: 'Друзья', scam: 'Ловушки', tech: 'Дела и отдых', quiz: 'Задачи' };
const moods = { happy: 'Радуется: комбо +1; при серии от 3 — ещё +1 п.п. к мечте', think: 'Размышляет: комбо сохраняется', scared: 'Тревожится: комбо сбрасывается' };
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const code = value => `<code>${escape(value)}</code>`;
const signed = value => value > 0 ? `+${value}` : value < 0 ? String(value) : '0';
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

function options(args) {
  const result = { campaigns: [], out: path.join(root, 'dev/cards-review.html') };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg !== '--campaign' && arg !== '--out') throw new Error(`Неизвестный аргумент: ${arg}. Справка: --help`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`После ${arg} нужно значение.`);
    if (arg === '--campaign') result.campaigns.push(...value.split(',').filter(Boolean));
    else result.out = path.resolve(value);
  }
  if (path.extname(result.out).toLowerCase() !== '.html') throw new Error('--out должен указывать на файл .html.');
  if ([path.join(root, 'index.html'), path.join(root, 'dev/mobile-preview.html')].includes(result.out)) {
    throw new Error('Для отчёта нужен отдельный HTML-файл, а не страница игры.');
  }
  return result;
}

function runtime(name) {
  const file = path.join(root, 'js', name + '.js');
  return vm.runInNewContext(fs.readFileSync(file, 'utf8') + `; ${name === 'campaign-data' ? 'GameData' : 'StoryDirector'}`, {}, { filename: file });
}

function variants(event) {
  return event.condition
    ? [{ card: event.then, label: 'Если условие выполнено', condition: event.condition }, { card: event.else, label: 'Иначе', condition: event.condition, inverse: true }]
    : [{ card: event }];
}

function choiceNames(event, key) {
  return [...new Set(variants(event).map(v => v.card[key].text))].join(' / ');
}

function buildCampaign(campaign, GameData, StoryDirector) {
  const events = GameData.validateEvents(readJSON(campaign.eventsFile), campaign.id);
  const story = campaign.storyFile ? StoryDirector.validate(readJSON(campaign.storyFile), events, campaign.id + '.story') : null;
  const cards = new Map(events.map(event => [event.id, event]));
  const meta = story ? story.events : {};
  const stages = story ? [
    { id: 'intro', title: 'Вступление', events: [] },
    ...story.chapters.map((chapter, i) => ({ id: String(i), title: `${i + 1}. ${chapter.title}`, chapter, events: [] })),
    { id: 'final', title: 'После последнего этапа', events: [] },
    { id: 'unused', title: 'Вне сценария', events: [] }
  ] : [{ id: 'linear', title: 'Линейная колода', events: [] }];
  const memberships = new Map(events.map(event => [event.id, new Set()]));
  const incoming = new Map();
  const milestones = new Map(story ? story.chapters.map((chapter, i) => [chapter.milestone, i]) : []);
  const unique = new Set(story ? story.chapters.flatMap(chapter => chapter.pool) : []);
  const repeats = new Set(story ? story.chapters.flatMap(chapter => chapter.repeatable) : []);
  const branches = new Map();
  const factBranches = new Map();
  const producers = new Map();

  function addFactBranch(fact, positive, branch) {
    const key = `${positive ? '+' : '-'}${fact}`;
    if (!factBranches.has(key)) factBranches.set(key, []);
    factBranches.get(key).push(branch);
  }

  for (const [id, info] of Object.entries(meta)) {
    const choices = info.choices || {};
    for (const [key, effect] of Object.entries(choices)) {
      if (effect.followUp) {
        if (!incoming.has(effect.followUp)) incoming.set(effect.followUp, []);
        incoming.get(effect.followUp).push({ id, key });
      }
      for (const action of ['set', 'clear']) for (const fact of effect[action] || []) {
        if (!producers.has(fact)) producers.set(fact, []);
        producers.get(fact).push({ id, key, action });
      }
      const other = choices[key === 'optA' ? 'optB' : 'optA'] || {};
      const exclusiveSet = (effect.set || []).filter(fact => !(other.set || []).includes(fact));
      const exclusiveClear = (effect.clear || []).filter(fact => !(other.clear || []).includes(fact));
      const differentNext = effect.followUp && effect.followUp !== other.followUp;
      if (differentNext || exclusiveSet.length || exclusiveClear.length) {
        const branch = { id: `${id}-${key}`, parent: id, key, label: choiceNames(cards.get(id), key) };
        branches.set(branch.id, branch);
        exclusiveSet.forEach(fact => addFactBranch(fact, true, branch));
        exclusiveClear.forEach(fact => addFactBranch(fact, false, branch));
      }
    }
  }

  if (story) {
    memberships.get(story.opening).add('intro');
    story.chapters.forEach((chapter, i) => {
      for (const id of [...chapter.pool, ...chapter.repeatable, chapter.milestone]) memberships.get(id).add(String(i));
    });
    // Продолжение наследует место родителя; выбор на вехе уже переводит в следующую главу.
    let changed;
    do {
      changed = false;
      for (const [id, parents] of incoming) for (const parent of parents) {
        const parentStages = milestones.has(parent.id)
          ? [milestones.get(parent.id) + 1 < story.chapters.length ? String(milestones.get(parent.id) + 1) : 'final']
          : memberships.get(parent.id);
        for (const stage of parentStages) if (!memberships.get(id).has(stage)) {
          memberships.get(id).add(stage);
          changed = true;
        }
      }
    } while (changed);
    for (const places of memberships.values()) if (!places.size) places.add('unused');
  } else {
    for (const places of memberships.values()) places.add('linear');
  }

  const routeCache = new Map();
  function routes(id) {
    if (routeCache.has(id)) return routeCache.get(id);
    const found = new Map();
    const requirements = (meta[id] || {}).requires || {};
    for (const fact of requirements.all || []) for (const branch of factBranches.get('+' + fact) || []) found.set(branch.id, branch);
    for (const fact of requirements.none || []) for (const branch of factBranches.get('-' + fact) || []) found.set(branch.id, branch);
    for (const parent of incoming.get(id) || []) {
      for (const branch of routes(parent.id)) found.set(branch.id, branch);
      const choices = (meta[parent.id] || {}).choices || {};
      if (choices.optA?.followUp !== choices.optB?.followUp) {
        const branch = branches.get(`${parent.id}-${parent.key}`);
        if (branch) found.set(branch.id, branch);
      }
    }
    const result = [...found.values()];
    routeCache.set(id, result);
    return result;
  }

  function role(id) {
    if (!story) return 'linear';
    if (id === story.opening) return 'opening';
    if (milestones.has(id)) return 'milestone';
    if (incoming.has(id)) return 'followUp';
    if (repeats.has(id)) return 'repeat';
    if (unique.has(id)) return 'unique';
    return 'unused';
  }

  for (const stage of stages) stage.events = events.filter(event => memberships.get(event.id).has(stage.id));
  const firstStage = id => stages.find(stage => memberships.get(id).has(stage.id));
  const anchor = (id, stage = firstStage(id)) => `card-${campaign.id}-${stage.id}-${id}`;
  return { ...campaign, events, story, cards, meta, stages: stages.filter(stage => stage.events.length), memberships, incoming, milestones, branches, producers, routes, role, anchor };
}

function ruleText(rule) {
  const name = rule.stat === 'dream' ? '🌟 Прогресс мечты' : stats[rule.stat];
  return `${name} ${rule.operator} ${rule.value}${rule.stat === 'dream' ? '%' : ''}`;
}

function factLink(campaign, fact) {
  return `<a href="#fact-${escape(campaign.id)}-${escape(fact)}">${code(fact)}</a>`;
}

function conditionHTML(condition, campaign) {
  if (!condition) return 'Нет дополнительных условий.';
  const rules = [
    ...(condition.all || []).map(fact => `есть факт ${factLink(campaign, fact)}`),
    ...(condition.none || []).map(fact => `нет факта ${factLink(campaign, fact)}`),
    ...(condition.stats || []).map(rule => escape(ruleText(rule)))
  ];
  return rules.length ? rules.join(' <b>И</b> ') : 'Нет дополнительных условий.';
}

function cardLink(campaign, id, label = id) {
  return `<a href="#${escape(campaign.anchor(id))}">${escape(label)}</a>`;
}

function threshold(chapter) {
  const rules = (chapter.completeWhen.stats || []).filter(rule => rule.stat === 'dream');
  return rules.length === 1 && rules[0].operator === '>=' ? rules[0].value : null;
}

function placementHTML(campaign, event, stage) {
  const role = campaign.role(event.id);
  const info = campaign.meta[event.id] || {};
  const parents = campaign.incoming.get(event.id) || [];
  const required = ['opening', 'milestone', 'followUp'].includes(role);
  const labels = { opening: 'Обязательное начало', milestone: 'Обязательная веха', followUp: 'Обязательное продолжение', unique: 'Случайная · один раз', repeat: 'Случайная · повторяемая', linear: 'По порядку колоды', unused: 'Не вызывается' };
  const lines = [];
  if (role === 'opening') lines.push('Первая карточка нового прохождения.');
  if (role === 'milestone') {
    const chapter = campaign.story.chapters[campaign.milestones.get(event.id)];
    const floor = threshold(chapter);
    lines.push(`В текущей главе «${escape(chapter.title)}» выполнено: ${conditionHTML(chapter.completeWhen, campaign)}.`);
    lines.push('Показывается после уже назначенного продолжения, перед случайными событиями и мини-играми. Выбор переводит на следующий этап.');
    if (floor !== null) lines.push(`После любого варианта закрепляет прогресс мечты не ниже <strong>${floor}%</strong>.`);
  }
  if (role === 'followUp') {
    for (const parent of parents) lines.push(`После ${cardLink(campaign, parent.id)} → ${parent.key === 'optA' ? 'A' : 'B'}: «${escape(choiceNames(campaign.cards.get(parent.id), parent.key))}».`);
    lines.push('Уже назначенное продолжение идёт раньше готовой вехи, случайных событий и мини-игр.');
  }
  if (role === 'unique' || role === 'repeat') {
    lines.push('Только в перечисленных главах, когда нет назначенного продолжения и готовой обязательной вехи.');
    if (role === 'unique') lines.push('Кандидат случайного выбора, если ещё не показывалась; срочные восстанавливающие события имеют приоритет.');
    else {
      lines.push(`Обычный интервал повтора: ${info.cooldown ?? 3} промежуточных решений. Без срочности выбирается после исчерпания подходящих уникальных событий.`);
      lines.push('Если все допустимые повторы ещё ожидают интервала, движок берёт самый давно показанный.');
    }
  }
  if (role === 'linear') lines.push(`Позиция в колоде: ${campaign.events.indexOf(event) + 1}.`);
  if (role === 'unused') lines.push('Нет связей из начала, глав или продолжений. Карточка остаётся в данных, но текущий сценарий её не вызывает.');
  if (info.requires) lines.push(`Допуск карточки: ${conditionHTML(info.requires, campaign)}.`);
  if (info.urgentWhen) lines.push(`<strong>Срочный кандидат:</strong> ${conditionHTML(info.urgentWhen, campaign)}. Обходит интервал повторения и обычный пул, но не обязательные карточки.`);
  if (role === 'unique' || role === 'repeat') lines.push(`Базовый вес: <strong>${info.weight ?? 1}</strong>. Это относительный вес среди текущих кандидатов, а не процент вероятности.`);
  for (const boost of info.boosts || []) lines.push(`Вес ×${boost.factor}, если ${conditionHTML(boost.when, campaign)}. Все подходящие множители перемножаются.`);
  const places = [...campaign.memberships.get(event.id)].map(id => campaign.stages.find(s => s.id === id)?.title || id);
  return `<div class="badges"><span class="badge ${required ? 'required' : ''}">${escape(labels[role])}</span><span class="badge">Блокирующая: ${required ? 'да' : 'нет'}</span></div>
    <dl class="rules"><dt>Когда вызывается</dt><dd>${lines.map(line => `<p>${line}</p>`).join('')}</dd><dt>Доступные стадии</dt><dd>${escape(places.join(' · '))}</dd></dl>`;
}

function effectsHTML(choice, campaign, GameData) {
  const rows = Object.entries(stats).map(([stat, name]) => {
    const raw = stat === 'dream' ? choice.dream : choice.effects[stat];
    const scaled = GameData.scaleEffect(raw, campaign.balance.multipliers, stat === 'dream' ? 'dream' : 'resource');
    const color = scaled > 0 ? 'gain' : scaled < 0 ? 'loss' : 'zero';
    return `<tr><th scope="row">${name}</th><td>${signed(raw)}</td><td class="${color}">${signed(scaled)}</td></tr>`;
  }).join('');
  return `<table class="effects"><thead><tr><th>Метрика</th><th>В JSON</th><th>С балансом</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function choiceHTML(card, key, campaign, event, GameData) {
  const choice = card[key];
  const effect = (campaign.meta[event.id]?.choices || {})[key] || {};
  const consequences = [];
  if (effect.set?.length) consequences.push(`Добавляет факты: ${effect.set.map(fact => factLink(campaign, fact)).join(', ')}.`);
  if (effect.clear?.length) consequences.push(`Удаляет факты: ${effect.clear.map(fact => factLink(campaign, fact)).join(', ')}.`);
  if (effect.followUp) consequences.push(`Следующая обязательная карточка: ${cardLink(campaign, effect.followUp, `${effect.followUp} · ${variants(campaign.cards.get(effect.followUp))[0].card.title}`)}.`);
  return `<section class="choice"><h5>${key === 'optA' ? 'A' : 'B'} · ${escape(choice.text)}</h5>
    ${effectsHTML(choice, campaign, GameData)}<p class="outcome">${escape(choice.msg)}</p>
    <p class="muted">Вольтик: ${escape(moods[choice.mascot])}${card.type === 'scam' && choice.mascot === 'scared' ? '; засчитывается ошибка мошенничества' : ''}.</p>
    ${consequences.length ? `<div class="consequences">${consequences.map(line => `<p>${line}</p>`).join('')}</div>` : '<p class="muted">Не меняет сюжетные факты и не назначает продолжение.</p>'}</section>`;
}

function eventHTML(campaign, event, stage, GameData) {
  const role = campaign.role(event.id);
  const blocking = ['opening', 'followUp', 'milestone'].includes(role);
  const title = [...new Set(variants(event).map(v => v.card.title))].join(' / ');
  const search = JSON.stringify({ event, meta: campaign.meta[event.id], role, campaign: campaign.name,
    stage: stage.title, routes: campaign.routes(event.id).map(route => route.label),
    completeWhen: role === 'milestone' ? stage.chapter?.completeWhen : undefined }).toLowerCase();
  const body = variants(event).map(variant => {
    const card = variant.card;
    const version = variant.condition ? `<p class="variant-condition"><strong>${variant.label}:</strong> ${variant.inverse ? 'НЕ (' : ''}${escape(ruleText(variant.condition))}${variant.inverse ? ')' : ''}. Это выбор версии текста и решений, а не условие допуска карточки.</p>` : '';
    return `<section class="variant">${version}<h4>${escape(card.emoji)} ${escape(card.title)}</h4><p class="description">${escape(card.desc)}</p>
      <p class="tip"><strong>Подсказка:</strong> ${escape(card.tip)}</p><span class="category">${escape(types[card.type])} · ${code(card.type)}</span>
      <div class="choices">${choiceHTML(card, 'optA', campaign, event, GameData)}${choiceHTML(card, 'optB', campaign, event, GameData)}</div></section>`;
  }).join('');
  return `<details class="event-card" id="${escape(campaign.anchor(event.id, stage))}" data-event="${escape(event.id)}" data-blocking="${blocking}" data-search="${escape(search)}" open>
    <summary><span>${code(event.id)} <strong>${escape(title)}</strong></span><span class="badge ${blocking ? 'required' : ''}">${blocking ? 'Обязательная' : role === 'repeat' ? 'Повторяемая' : 'Обычная'}</span></summary>
    <div class="event-body">${placementHTML(campaign, event, stage)}${body}<p class="source">Источник: ${code(campaign.eventsFile)} · ${code(event.id)}</p></div></details>`;
}

function factsHTML(campaign) {
  if (!campaign.story) return '';
  return `<details class="facts"><summary>Факты сценария и решения, которые их меняют (${campaign.story.facts.length})</summary>
    ${campaign.story.facts.map(fact => `<div id="fact-${escape(campaign.id)}-${escape(fact)}"><h4>${code(fact)}</h4><ul>${(campaign.producers.get(fact) || []).map(producer => `<li>${producer.action === 'set' ? 'Добавляет' : 'Удаляет'}: ${cardLink(campaign, producer.id)} → ${producer.key === 'optA' ? 'A' : 'B'} «${escape(choiceNames(campaign.cards.get(producer.id), producer.key))}».</li>`).join('') || '<li>Ни одно решение не устанавливает этот факт.</li>'}</ul></div>`).join('')}</details>`;
}

function campaignHTML(campaign, GameData) {
  const b = campaign.balance;
  const conditional = campaign.events.filter(event => event.condition).length;
  const placements = campaign.stages.reduce((sum, stage) => sum + stage.events.length, 0);
  const stages = campaign.stages.map(stage => {
    const groups = new Map();
    for (const event of stage.events) {
      const routes = campaign.routes(event.id);
      const key = routes.map(route => route.id).sort().join('|');
      if (!groups.has(key)) groups.set(key, { routes, events: [] });
      groups.get(key).events.push(event);
    }
    const ordered = [...groups.values()].sort((a, b) => Number(!!a.routes.length) - Number(!!b.routes.length));
    const groupHTML = ordered.map(group => {
      const title = group.routes.length ? `Ветка: ${group.routes.map(route => `«${escape(route.label)}»`).join(' + ')}` : 'Общие карточки';
      const source = group.routes.length ? `<p class="muted">Связи с выбором: ${group.routes.map(route => `${cardLink(campaign, route.parent)} → ${route.key === 'optA' ? 'A' : 'B'}`).join(', ')}. Точные условия каждой карточки указаны ниже.</p>` : '';
      const rank = { opening: 0, followUp: 1, milestone: 2, unique: 3, repeat: 4, unused: 5, linear: 6 };
      const sorted = group.events.slice().sort((a, b) => rank[campaign.role(a.id)] - rank[campaign.role(b.id)] || campaign.events.indexOf(a) - campaign.events.indexOf(b));
      return `<section class="route-group"><h3>${title}</h3>${source}${sorted.map(event => eventHTML(campaign, event, stage, GameData)).join('')}</section>`;
    }).join('');
    return `<section class="stage" data-stage="${escape(stage.id)}"><h2>${escape(stage.title)}</h2>
      ${stage.chapter ? `<p class="stage-rule">Условие готовности вехи: ${conditionHTML(stage.chapter.completeWhen, campaign)}.<br>Обязательная карточка: ${cardLink(campaign, stage.chapter.milestone)}.</p>` : ''}
      ${groupHTML}</section>`;
  }).join('');
  return `<article class="campaign" data-campaign="${escape(campaign.id)}"><header class="campaign-header"><p class="eyebrow">Сценарий · ${code(campaign.id)}</p><h1>${escape(campaign.icon)} ${escape(campaign.name)}</h1>
    <p>Уникальных ID: ${campaign.events.length} · условных карточек: ${conditional} · размещений по стадиям: ${placements}</p>
    <p>Старт: ${Object.entries(b.initialStats).map(([stat, value]) => `${stats[stat]} ${value}`).join(' · ')} · мечта ${b.initialDream}% · цель ${b.winDream}%.</p>
    <p class="muted">Множители ресурсов: прирост ×${b.multipliers.resourceGain}, потери ×${b.multipliers.resourceLoss}; мечты: прирост ×${b.multipliers.dreamGain}, потери ×${b.multipliers.dreamLoss}. ${campaign.story ? `Предел: ${campaign.story.maxTurns} решений.` : 'Без сюжетного директора.'}</p></header>
    ${factsHTML(campaign)}${stages}</article>`;
}

const css = `
:root { color-scheme:light; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#182a32; background:#f1f5f6; line-height:1.5; }
* { box-sizing:border-box; } body { margin:0; } main,.top-inner { max-width:1180px; margin:auto; padding:24px; } h1,h2,h3,h4,h5,p { margin:0 0 12px; } h1 { font-size:28px; } h2 { font-size:24px; } h3 { font-size:19px; } h4 { font-size:19px; } h5 { font-size:16px; } a { color:#075e7a; text-underline-offset:3px; } code { font-size:12px; overflow-wrap:anywhere; } button,input,select { font:inherit; } button,select,input { border:1px solid #b6c6cd; background:#fff; color:inherit; border-radius:8px; padding:9px 12px; } button,select,summary { cursor:pointer; } button:hover { background:#edf8f5; } button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,a:focus-visible { outline:3px solid #d38a1b; outline-offset:3px; } .top { background:#142c34; color:white; } .top a { color:#c7f1e7; } .top h1 { font-size:30px; } .top p { max-width:850px; } .toolbar { position:sticky; top:0; z-index:2; background:#fff; box-shadow:0 2px 8px #112b3220; } .filters { max-width:1180px; padding:14px 24px; margin:auto; display:flex; flex-wrap:wrap; gap:12px; align-items:end; } label { display:flex; flex-direction:column; font-size:13px; gap:4px; } label select { max-width:320px; } label.search { flex:1; min-width:180px; } label.check { flex-direction:row; align-items:center; padding:10px 0; } .tools { display:flex; flex-wrap:wrap; gap:8px; max-width:1180px; margin:auto; padding:0 24px 12px; align-items:center; } .result-count { margin-left:auto; color:#52656e; font-size:13px; } .legend { background:#fff; padding:20px; border:1px solid #d2dfe4; border-radius:12px; margin-bottom:24px; } .legend summary,.facts summary { font-weight:650; } .legend ul { margin-bottom:0; } .campaign-header { margin:26px 0 20px; border-bottom:3px solid #71bba5; padding-bottom:16px; } .eyebrow { color:#52656e; font-size:12px; text-transform:uppercase; letter-spacing:1px; } .muted,.source { color:#52656e; font-size:13px; } .stage { margin:28px 0; } .stage-rule { padding:14px 18px; background:#e0efeb; border-radius:10px; } .route-group { margin:20px 0; } .event-card { border:1px solid #c9d7dd; border-radius:12px; background:#fff; margin-bottom:16px; overflow:hidden; scroll-margin-top:200px; } .event-card>summary { padding:15px 18px; display:flex; justify-content:space-between; gap:12px; align-items:center; background:#f9fbfc; } .event-card>summary:before { content:'▸'; flex-shrink:0; } .event-card[open]>summary:before { content:'▾'; } .event-card>summary>span:first-child { flex:1; } .event-card>summary code { display:block; color:#52656e; margin-bottom:3px; } .event-body { padding:18px; } .badges { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; } .badge { font-size:12px; font-weight:650; background:#eaf0f3; padding:4px 8px; border-radius:6px; white-space:nowrap; } .badge.required { color:#74450a; background:#fff0d6; } .rules { margin:0 0 16px; padding-bottom:10px; border-bottom:1px solid #e0e8ec; } dt { font-size:12px; font-weight:700; color:#52656e; margin:12px 0 4px; } dd { margin:0; font-size:14px; } dd p { margin-bottom:6px; } .variant { margin-top:18px; } .variant+.variant { border-top:3px dashed #b6c6cd; padding-top:20px; } .variant-condition { background:#e9f1fb; padding:12px; border-radius:8px; font-size:14px; } .description,.tip,.outcome { white-space:pre-wrap; } .tip { font-size:14px; } .category { color:#52656e; font-size:12px; } .choices { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:14px 0; } .choice { padding:16px; border:1px solid #d2dfe4; border-radius:10px; min-width:0; } table { border-collapse:collapse; width:100%; font-size:13px; margin-bottom:14px; } th,td { padding:6px; border-bottom:1px solid #e1e9ed; text-align:right; } th:first-child { text-align:left; } .effects tbody th { font-weight:500; } .gain { color:#076c48; font-weight:700; } .loss { color:#a32a32; font-weight:700; } .zero { color:#52656e; } .consequences { background:#edf6f2; padding:10px; font-size:13px; border-radius:8px; } .consequences p:last-child,.choice p:last-child { margin-bottom:0; } .source { font-size:11px; margin:12px 0 0; } .facts { border:1px solid #c9d7dd; background:#fff; padding:16px 20px; border-radius:10px; } .facts>div { border-top:1px solid #e1e9ed; padding-top:14px; margin-top:14px; scroll-margin-top:200px; } .facts h4 { margin:0; } .facts ul { font-size:13px; } #empty { padding:40px 0; } [hidden] { display:none!important; }
@media(max-width:700px) { main,.top-inner { padding:18px 12px; } .filters { padding:12px; gap:8px; } .filters>label { flex:1; min-width:130px; } label select { width:100%; } .filters>label.check { min-width:100%; padding:0; } .tools { padding:0 12px 10px; } .toolbar { position:static; } .choices { grid-template-columns:1fr; } .event-body { padding:12px; } .event-card>summary { padding:12px; align-items:start; } .event-card>summary>.badge { white-space:normal; } .result-count { flex-basis:100%; margin-left:0; } }
@media print { .toolbar,.legend { display:none; } body { background:white; } main { max-width:none; padding:0; } .event-card { break-inside:avoid; } .choice { break-inside:avoid; } a { color:inherit; } }
`;

const controller = `
const campaignSelect = document.getElementById('campaignFilter');
const stageSelect = document.getElementById('stageFilter');
const searchInput = document.getElementById('search');
const requiredOnly = document.getElementById('requiredOnly');
const articles = [...document.querySelectorAll('.campaign')];
function stages() {
  const previous = stageSelect.value;
  const available = new Map();
  for (const article of articles) {
    if (campaignSelect.value && article.dataset.campaign !== campaignSelect.value) continue;
    for (const stage of article.querySelectorAll('.stage')) {
      const label = campaignSelect.value ? stage.querySelector('h2').textContent : ({intro:'Вступление',final:'После последнего этапа',unused:'Вне сценария',linear:'Линейная колода'}[stage.dataset.stage] || 'Этап ' + (Number(stage.dataset.stage) + 1));
      available.set(stage.dataset.stage, label);
    }
  }
  stageSelect.replaceChildren(new Option('Все стадии', ''), ...[...available].map(([value,label]) => new Option(label,value)));
  if (available.has(previous)) stageSelect.value = previous;
}
function filter() {
  const query = searchInput.value.trim().toLowerCase();
  const unique = new Set();
  let placements = 0;
  for (const article of articles) {
    const selected = !campaignSelect.value || article.dataset.campaign === campaignSelect.value;
    for (const stage of article.querySelectorAll('.stage')) {
      const selectedStage = selected && (!stageSelect.value || stage.dataset.stage === stageSelect.value);
      for (const group of stage.querySelectorAll('.route-group')) {
        let groupVisible = false;
        for (const card of group.querySelectorAll('.event-card')) {
          const visible = selectedStage && (!requiredOnly.checked || card.dataset.blocking === 'true') && (!query || card.dataset.search.includes(query));
          card.hidden = !visible;
          if (visible) { groupVisible = true; placements++; unique.add(article.dataset.campaign + '/' + card.dataset.event); }
        }
        group.hidden = !groupVisible;
      }
      stage.hidden = ![...stage.querySelectorAll('.route-group')].some(group => !group.hidden);
    }
    article.hidden = !selected || ![...article.querySelectorAll('.stage')].some(stage => !stage.hidden);
  }
  document.getElementById('count').textContent = 'Уникальных карточек: ' + unique.size + ' · размещений: ' + placements;
  document.getElementById('empty').hidden = placements > 0;
}
campaignSelect.addEventListener('change', () => { stageSelect.value = ''; stages(); filter(); });
stageSelect.addEventListener('change', filter);
searchInput.addEventListener('input', filter);
requiredOnly.addEventListener('change', filter);
document.getElementById('expand').addEventListener('click', () => { for (const card of document.querySelectorAll('.event-card:not([hidden])')) card.open = true; });
document.getElementById('collapse').addEventListener('click', () => { for (const card of document.querySelectorAll('.event-card:not([hidden])')) card.open = false; });
document.getElementById('reset').addEventListener('click', () => { campaignSelect.value=''; stages(); searchInput.value=''; stageSelect.value=''; requiredOnly.checked=false; filter(); });
function reveal(id) {
  const target = document.getElementById(id);
  const article = target && target.closest('.campaign');
  if (!article) return;
  campaignSelect.value = article.dataset.campaign;
  stages();
  stageSelect.value = target.closest('.stage')?.dataset.stage || '';
  searchInput.value = ''; requiredOnly.checked = false; filter();
  for (let parent = target; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  target.scrollIntoView({block:'start'});
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  event.preventDefault();
  const id = link.getAttribute('href').slice(1);
  history.replaceState(null,'','#'+id);
  reveal(id);
});
stages(); filter();
if (location.hash) reveal(location.hash.slice(1));
`;

function documentHTML(campaigns, GameData) {
  const total = campaigns.reduce((sum, campaign) => sum + campaign.events.length, 0);
  const generated = new Date().toISOString();
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Карточки приключений · отчёт для проверки</title><style>${css}</style></head><body>
    <header class="top"><div class="top-inner"><h1>Карточки приключений</h1><p>Кампаний: ${campaigns.length} · уникальных карточек: ${total}. Группировка: сценарий → стадия → общие карточки и ветки решений.</p><p>Снимок JSON: <time>${escape(generated)}</time>. После правок данных запусти генератор снова. Этот отчёт не генерирует случайное прохождение и не меняет игру.</p></div></header>
    <div class="toolbar"><div class="filters"><label for="campaignFilter">Кампания<select id="campaignFilter"><option value="">Все кампании</option>${campaigns.map((campaign, i) => `<option value="${escape(campaign.id)}"${i === 0 ? ' selected' : ''}>${escape(campaign.name)}</option>`).join('')}</select></label>
      <label for="stageFilter">Стадия<select id="stageFilter"><option value="">Все стадии</option></select></label><label class="search" for="search">Поиск по ID, тексту или факту<input id="search" type="search" placeholder="Например: дека или route-friends"></label>
      <label class="check" for="requiredOnly"><input id="requiredOnly" type="checkbox">Только блокирующие</label></div><div class="tools"><button id="expand">Развернуть карточки</button><button id="collapse">Свернуть карточки</button><button id="reset">Сбросить фильтры</button><span class="result-count" id="count" role="status"></span></div></div>
    <main><details class="legend" open><summary>Как читать отчёт</summary><ul>
      <li><strong>Блокирующие:</strong> начало, назначенное продолжение и готовая веха. Когда наступили их условия, случайные события и мини-игры их не заменяют. Только выбор на вехе завершает стадию. При поражении или исчерпании лимита следующие карточки уже не показываются.</li>
      <li><strong>Стадия означает доступность, а не порядок:</strong> обычная карточка может входить в несколько глав. Она показана в каждой такой группе, но в сумме уникальных ID считается один раз. Уникальные события после выбора не повторяются.</li>
      <li><strong>Ветки:</strong> метки взяты из реальных решений и связей фактов/продолжений. Это группировка, а не перечень всех возможных партий. Точный допуск определяется условиями карточки; условие <code>then/else</code> выбирает её версию.</li>
      <li><strong>Метрики:</strong> «В JSON» — базовый эффект; «С балансом» — после коэффициентов кампании и <code>Math.round</code>. Комбо может добавить +1 п.п. к мечте; фактическую разницу ограничивают 0–100 и закреплённый этап. Мини-игры в эти числа не включены.</li>
      <li><strong>A/B — логические варианты:</strong> игра случайно меняет их местами. Факты и ссылки позволяют проверить, какое решение открывает следующую карточку. По ссылке можно перейти к её полному описанию.</li>
    </ul></details><noscript><p>Фильтры требуют JavaScript. Без него все карточки ниже доступны для чтения.</p></noscript><p id="empty" hidden>По этим фильтрам карточек нет.</p>
    ${campaigns.map(campaign => campaignHTML(campaign, GameData)).join('')}</main><script>${controller}</script></body></html>`;
}

try {
  const args = options(process.argv.slice(2));
  if (args.help) {
    console.log('Отчёт по карточкам для ручной проверки. Node.js 20+, без зависимостей.\n\nnode scripts/export-cards.cjs [--campaign scooter,console] [--out файл.html]\n\nПо умолчанию: все кампании → dev/cards-review.html.\n--campaign можно повторять. Относительный --out считается от текущей папки.');
  } else {
    const GameData = runtime('campaign-data');
    const StoryDirector = runtime('story-director');
    const catalog = GameData.validateCatalog(readJSON('data/campaigns.json'));
    const requested = new Set(args.campaigns);
    for (const id of requested) if (!catalog.some(campaign => campaign.id === id)) throw new Error(`Неизвестная кампания: ${id}. Доступны: ${catalog.map(campaign => campaign.id).join(', ')}`);
    const campaigns = catalog.filter(campaign => !requested.size || requested.has(campaign.id)).map(campaign => buildCampaign(campaign, GameData, StoryDirector));
    const html = documentHTML(campaigns, GameData);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, html, 'utf8');
    console.log(`Готово: ${args.out}\nКампаний: ${campaigns.length}; уникальных карточек: ${campaigns.reduce((sum, campaign) => sum + campaign.events.length, 0)}.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
