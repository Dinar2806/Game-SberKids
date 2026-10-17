const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/campaign-data.js'), 'utf8');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const makeAPI = (globals = {}) => vm.runInNewContext(source + '; GameData', { URL, ...globals });
const api = makeAPI();
const catalog = () => read('data/campaigns.json');
const events = () => read('data/events/scooter.json');

test('весь каталог и все файлы событий проходят общие правила проверки', () => {
  for (const c of api.validateCatalog(catalog())) {
    assert.ok(api.validateEvents(read(c.eventsFile), c.id).length > 0);
  }
});

test('новая кампания добавляется в каталог без изменения движка', () => {
  const data = catalog();
  const copy = structuredClone(data.campaigns[0]);
  copy.id = 'new-adventure';
  copy.difficulty = 'hard';
  copy.eventsFile = './data/events/new-adventure.json';
  data.campaigns.push(copy);
  assert.equal(api.validateCatalog(data).at(-1).id, copy.id);
});

test('опечатки, повторные id и некорректные настройки отклоняются', () => {
  const invalid = [
    d => d.campaigns.push(structuredClone(d.campaigns[0])),
    d => { d.campaigns[0].difficulty = 'extreme'; },
    d => { d.campaigns[0].balance.multipliers.resourceLoss = -1; },
    d => { d.campaigns[0].balance.multipliers.resourceLos = 1; },
    d => { delete d.campaigns[0].balance.initialStats.money; },
    d => { d.campaigns[0].eventsFile = '/data/events/scooter.json'; },
    d => { d.campaigns[0].progressIcons = []; }
  ];
  for (const mutate of invalid) {
    const data = catalog(); mutate(data);
    assert.throws(() => api.validateCatalog(data));
  }
  for (const mutate of [
    d => d.events.push(structuredClone(d.events[0])),
    d => { d.events[0].optA.effects.monye = 10; },
    d => { d.events[3].condition.operator = 'eval'; },
    d => { delete d.events[3].else; },
    d => { d.events[0].optA.mascot = 'unknown'; }
  ]) {
    const data = events(); mutate(data);
    assert.throws(() => api.validateEvents(data));
  }
});

test('условные события правильно разрешаются на границе каждого оператора', () => {
  const expected = {
    '>=': [false, true, true], '<=': [true, true, false],
    '>': [false, false, true], '<': [true, false, false],
    '==': [false, true, false], '!=': [true, false, true]
  };
  const event = events().events.find(e => e.condition);
  for (const [operator, results] of Object.entries(expected)) {
    const sample = structuredClone(event);
    sample.condition = { stat: 'money', operator, value: 50 };
    for (const [i, value] of [49, 50, 51].entries()) {
      const resolved = api.resolveEvent(sample, { money: value });
      assert.equal(resolved.title, (results[i] ? sample.then : sample.else).title);
      assert.equal(resolved.id, sample.id);
      assert.equal(resolved.isCond, true);
    }
  }
});

test('знаки, коэффициенты и округление эффектов независимы от категории сложности', () => {
  const mult = {resourceLoss: 1.22, resourceGain: 2, dreamLoss: 0.5, dreamGain: 3};
  assert.equal(api.scaleEffect(-10, mult, 'resource'), -12);
  assert.equal(api.scaleEffect(10, mult, 'resource'), 20);
  assert.equal(api.scaleEffect(-6, mult, 'dream'), -3);
  assert.equal(api.scaleEffect(6, mult, 'dream'), 18);
  assert.equal(api.scaleEffect(0, mult, 'dream'), 0);
});

test('загрузка использует вложенный URL, кэширует успех и позволяет повтор после ошибки', async () => {
  const base = 'https://example.test/Game-SberKids/versions/v1.0.0/';
  const requests = [];
  let fail = true;
  const loader = makeAPI({fetch: async url => {
    requests.push(String(url));
    if (String(url).endsWith('/campaigns.json')) return {ok: true, json: async () => catalog()};
    if (fail) return {ok: false, status: 503};
    return {ok: true, json: async () => events()};
  }});
  const campaigns = await loader.loadCatalog(base);
  assert.equal(requests[0], base + 'data/campaigns.json');
  await assert.rejects(loader.loadEvents(campaigns[0], base), /HTTP 503/);
  fail = false;
  await loader.loadEvents(campaigns[0], base);
  await loader.loadEvents(campaigns[0], base);
  assert.equal(requests.length, 3);
  assert.equal(requests[2], base + 'data/events/scooter.json');
});
