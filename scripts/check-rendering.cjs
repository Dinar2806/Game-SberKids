const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/graphics-vfx.js'), 'utf8');
let svg = null;
let htmlWrites = 0;
const mascotAvatar = {
  style: {},
  set innerHTML(markup) {
    htmlWrites++;
    svg = { markup };
  },
  querySelector: selector => selector === 'svg' ? svg : null
};
const canvas = { getContext: () => ({}) };
const context = {
  mascotAvatar,
  document: { getElementById: id => id === 'vfxCanvas' ? canvas : {} },
  window: { innerWidth: 320, innerHeight: 640, addEventListener() {} }
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'graphics-vfx.js' });
let gazeUpdates = 0;
context.updateMascotGaze = () => { gazeUpdates++; };

context.renderMascot('normal', '', 0);
const normalSvg = svg;
assert.match(normalSvg.markup, /<svg\b/);
assert.equal(htmlWrites, 1);
assert.equal(gazeUpdates, 1);

// Repeated input must preserve the existing SVG, but still track the card.
context.renderMascot('normal', '', 0);
assert.equal(htmlWrites, 1);
assert.equal(svg, normalSvg);
assert.equal(gazeUpdates, 2);

// Changing direction rotates the same SVG and updates the gaze.
context.renderMascot('normal', '', 1);
assert.equal(htmlWrites, 1);
assert.equal(svg, normalSvg);
assert.equal(mascotAvatar.style.transform, 'rotate(6deg) scale(1)');
assert.equal(gazeUpdates, 3);

// Changing mood needs a new SVG, including the original happy scale.
context.renderMascot('happy', '', -1);
assert.notEqual(svg, normalSvg);
assert.notEqual(svg.markup, normalSvg.markup);
assert.equal(htmlWrites, 2);
assert.equal(mascotAvatar.style.transform, 'rotate(-6deg) scale(1.08)');
assert.equal(gazeUpdates, 4);

const happySvg = svg;
context.renderMascot('happy', '', 0);
assert.equal(htmlWrites, 2);
assert.equal(svg, happySvg);
assert.equal(mascotAvatar.style.transform, 'rotate(0deg) scale(1.08)');
assert.equal(gazeUpdates, 5);

// Returning to a previous mood restores its original appearance.
context.renderMascot('normal', '', -1);
assert.equal(htmlWrites, 3);
assert.notEqual(svg, happySvg);
assert.equal(svg.markup, normalSvg.markup);
assert.equal(mascotAvatar.style.transform, 'rotate(-6deg) scale(1)');
assert.equal(gazeUpdates, 6);



// Exercise the real preview function with real campaign multipliers.
const gameSource = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const gameDataSource = fs.readFileSync(path.join(__dirname, '../js/campaign-data.js'), 'utf8');
const start = gameSource.indexOf('function showDots(');
const end = gameSource.indexOf('function resolveCard(', start);
assert(start >= 0 && end > start, 'Could not find showDots in game.js');
const GameData = vm.runInNewContext(gameDataSource + '\nGameData');
let writes = 0;
class MockElement {
  constructor() {
    this._className = '';
    this._textContent = '';
    const classes = new Set();
    this.classList = {
      contains: name => classes.has(name),
      toggle: (name, enabled) => { writes++; enabled ? classes.add(name) : classes.delete(name); }
    };
  }
  get className() { return this._className; }
  set className(value) { writes++; this._className = value; }
  get textContent() { return this._textContent; }
  set textContent(value) { writes++; this._textContent = value; }
}
const elements = {};
for (const stat of ['money', 'tech', 'trust', 'team']) {
  elements['dot-' + stat] = new MockElement();
  elements['pill-' + stat] = new MockElement();
}
const preview = {
  GameData,
  document: { getElementById: id => elements[id] },
  activeCardData: { type: 'tech' },
  currentDream: { balance: { multipliers: { resourceGain: 2, resourceLoss: 4 } } }
};
vm.createContext(preview);
vm.runInContext(gameSource.slice(start, end), preview, { filename: 'showDots' });
const check = (stat, classes, text, up, down) => {
  assert.equal(elements['dot-' + stat].className, classes, stat + ' classes');
  assert.equal(elements['dot-' + stat].textContent, text, stat + ' text');
  assert.equal(elements['pill-' + stat].classList.contains('preview-up'), up, stat + ' preview up');
  assert.equal(elements['pill-' + stat].classList.contains('preview-down'), down, stat + ' preview down');
};
const choice = { effects: { money: 6, tech: -3, trust: 1, team: -2 } };
preview.showDots(choice);
check('money', 'stat-dot active big up', '▲▲', true, false);
check('tech', 'stat-dot active big down', '▼▼', false, true);
check('trust', 'stat-dot active up', '▲', true, false);
check('team', 'stat-dot active down', '▼', false, true);
let previousWrites = writes;
preview.showDots(choice);
assert.equal(writes, previousWrites, 'same preview should not write to the DOM');

// Mutating the same effect object and multipliers must refresh the preview.
choice.effects.money = 5;
choice.effects.tech = 0;
choice.effects.trust = -4;
preview.currentDream.balance.multipliers.resourceGain = 1.5;
preview.showDots(choice);
check('money', 'stat-dot active up', '▲', true, false);
check('tech', 'stat-dot', '', false, false);
check('trust', 'stat-dot active big down', '▼▼', false, true);
check('team', 'stat-dot active down', '▼', false, true);

// Even when the card object stays the same, scam hides signs and clears pill previews.
preview.activeCardData.type = 'scam';
preview.showDots(choice);
check('money', 'stat-dot active mystery', '?', false, false);
check('tech', 'stat-dot', '', false, false);
check('trust', 'stat-dot active big mystery', '?', false, false);
check('team', 'stat-dot active mystery', '?', false, false);
previousWrites = writes;
preview.showDots(choice);
assert.equal(writes, previousWrites, 'same scam preview should not write to the DOM');

preview.showDots(null);
for (const stat of ['money', 'tech', 'trust', 'team']) check(stat, 'stat-dot', '', false, false);
previousWrites = writes;
preview.showDots(null);
assert.equal(writes, previousWrites, 'repeated reset should not write to the DOM');
preview.activeCardData.type = 'tech';
preview.showDots(choice);
check('money', 'stat-dot active up', '▲', true, false);
check('trust', 'stat-dot active big down', '▼▼', false, true);

console.log('Mascot and preview rendering checks passed');
