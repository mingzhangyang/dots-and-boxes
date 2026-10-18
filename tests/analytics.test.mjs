import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const js = ts.transpileModule(
  readFileSync(new URL('../src/client/analytics.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function browser(origin) {
  const scripts = [], sent = [], bindings = [], win = { location: { origin } };
  const doc = {
    createElement() {
      return {
        dataset: {}, handlers: new Map(),
        addEventListener(name, callback) { this.handlers.set(name, callback); },
        fire(name) { this.handlers.get(name)?.(); },
      };
    },
    head: { append(s) { scripts.push(s); } },
  };
  const exports = {};
  runInNewContext(js, { exports, window: win, document: doc, Map });
  return { api: exports, scripts, sent, bindings, win,
    ready() {
      win.hubTrack = (game, event) => sent.push({ game, event });
      win.hubAnalytics = { bindPlaying: (game, read) => bindings.push({ game, read }) };
      scripts[0].fire('load');
    },
  };
}
test('canonical origin loads once; buffer and live playing are registered', () => {
  const b = browser('https://dots-and-boxes.orangely.xyz');
  let active = false;
  b.api.initAnalytics(() => active);
  b.api.initAnalytics(() => active);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, 'https://games.orangely.xyz/analytics.js');
  assert.equal(b.scripts[0].dataset.analyticsGame, 'dots');
  assert.equal(b.scripts[0].dataset.analyticsExternal, 'true');
  b.api.track('play');
  b.api.track('finish');
  assert.deepEqual(b.sent, []);
  active = true;
  assert.equal(b.win.__gamesAnalyticsPlaying.get('dots')(), true);
  b.ready();
  assert.deepEqual(b.sent, [{ game: 'dots', event: 'play' }, { game: 'dots', event: 'finish' }]);
  assert.equal(b.bindings.at(-1).read(), true);
  b.api.initAnalytics(() => false);
  assert.equal(b.win.__gamesAnalyticsPlaying.get('dots')(), false);
  assert.equal(b.scripts.length, 1);
});
test('localhost, preview, and unrelated origins do not send production events', () => {
  for (const origin of ['http://localhost:3000', 'http://127.0.0.1:4173',
    'https://preview.example.workers.dev', 'https://other.orangely.xyz']) {
    const b = browser(origin);
    b.api.initAnalytics(() => true);
    b.api.track('play');
    assert.equal(b.scripts.length, 0, origin);
    assert.deepEqual(b.sent, []);
  }
});
test('failed loading and exceptions do not affect the game', () => {
  const b = browser('https://dots-and-boxes.orangely.xyz');
  b.api.initAnalytics(() => { throw new Error('read error'); });
  assert.equal(b.win.__gamesAnalyticsPlaying.get('dots')(), false);
  b.api.track('play');
  b.scripts[0].fire('error');
  b.api.track('finish');
  assert.deepEqual(b.sent, []);
});
test('the bounded pre-load queue retains at most sixteen events', () => {
  const b = browser('https://dots-and-boxes.orangely.xyz');
  b.api.initAnalytics(() => true);
  for (let i = 0; i < 24; i++) b.api.track('play');
  b.ready();
  assert.equal(b.sent.length, 16);
});
