const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/viewport.js'), 'utf8');

function createEnvironment(visualHeight, innerHeight, includeVisualViewport = true) {
  const windowEvents = new Map();
  const viewportEvents = new Map();
  const writes = [];
  const visualViewport = includeVisualViewport ? {
    height: visualHeight,
    addEventListener: (type, callback) => viewportEvents.set(type, callback)
  } : null;
  const window = {
    visualViewport,
    innerHeight,
    addEventListener: (type, callback) => windowEvents.set(type, callback)
  };
  const document = {
    documentElement: { style: { setProperty: (name, value) => writes.push([name, value]) } }
  };
  vm.runInNewContext(source, { window, document });
  return { window, visualViewport, windowEvents, viewportEvents, writes };
}

{
  const env = createEnvironment(800, 900);
  assert.deepEqual(env.writes, [['--viewport-height', '800px']]);
  assert(env.windowEvents.has('load'));
  assert(env.windowEvents.has('pageshow'));
  assert(env.windowEvents.has('resize'));
  assert(env.viewportEvents.has('resize'));
}

{
  const env = createEnvironment(0, 0);
  assert.equal(env.writes.length, 0);
  env.visualViewport.height = 640;
  env.viewportEvents.get('resize')();
  assert.deepEqual(env.writes, [['--viewport-height', '640px']]);
  env.visualViewport.height = 0;
  env.windowEvents.get('resize')();
  assert.deepEqual(env.writes, [['--viewport-height', '640px']]);
  env.visualViewport.height = 710;
  env.viewportEvents.get('resize')();
  assert.deepEqual(env.writes.at(-1), ['--viewport-height', '710px']);
}

{
  const env = createEnvironment(0, 750);
  assert.deepEqual(env.writes, [['--viewport-height', '750px']]);
  env.visualViewport.height = NaN;
  env.window.innerHeight = 680;
  env.windowEvents.get('pageshow')();
  assert.deepEqual(env.writes.at(-1), ['--viewport-height', '680px']);
  env.visualViewport.height = Infinity;
  env.window.innerHeight = 720;
  env.windowEvents.get('load')();
  assert.deepEqual(env.writes.at(-1), ['--viewport-height', '720px']);
}

{
  const env = createEnvironment(null, 600, false);
  assert.deepEqual(env.writes, [['--viewport-height', '600px']]);
  env.window.innerHeight = 500;
  env.windowEvents.get('resize')();
  assert.deepEqual(env.writes.at(-1), ['--viewport-height', '500px']);
}

console.log('Viewport height checks passed');
