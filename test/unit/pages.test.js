// Every page of the site: it counts visits with Google Analytics, and its security policy lets nothing else in from
// outside, apart from the friends server for the games that have friends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const pages = ['index.html', ...readdirSync(new URL('games/', root)).map((game) => `games/${game}/index.html`)];
const read = (page) => readFileSync(new URL(page, root), 'utf8');
const policyOf = (html) => Object.fromEntries(/content="(default-src[^"]*)"/.exec(html)[1].split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));

const GOOGLE = new Set(['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com']);
const FRIENDS = new Set(['wss://hemi-race.infoicy.com', 'ws://localhost:*']);

test('every page loads Google Analytics before anything else of its own', () => {
  assert.ok(pages.length >= 15);
  for (const page of pages) {
    const html = read(page);
    const analytics = html.indexOf(page === 'index.html' ? '<script src="core/analytics.js"></script>' : '<script src="../../core/analytics.js"></script>');
    assert.ok(analytics > 0, `${page} loads core/analytics.js`);
    assert.ok(analytics < html.indexOf('<script type="module"'), `${page} loads it before its own script`);
  }
});

test('every page\'s policy lets in only Google\'s tag and analytics from outside, and the friends server where there are friends', () => {
  for (const page of pages) {
    const policy = policyOf(read(page));
    assert.ok(policy['script-src'].includes('https://www.googletagmanager.com'), `${page}: Google's tag can load`);
    assert.ok(!policy['script-src'].includes("'unsafe-inline'"), `${page}: still no inline scripts`);
    for (const [name, sources] of Object.entries(policy)) {
      for (const source of sources) {
        const outside = /^(https?|wss?):/.test(source);
        if (!outside) continue;
        assert.ok(GOOGLE.has(source) || FRIENDS.has(source), `${page}: ${name} lets in ${source}`);
        if (FRIENDS.has(source)) assert.equal(name, 'connect-src', `${page}: the friends server is only for connecting`);
      }
    }
  }
});

test('Google Analytics never loads on this computer, as in the tests, and is set up without ad signals', () => {
  const code = readFileSync(new URL('core/analytics.js', root), 'utf8');
  assert.match(code, /'G-BPC62S5T34'/);
  assert.match(code, /\['localhost', '127\.0\.0\.1'\]\.includes\(location\.hostname\)/);
  assert.match(code, /allow_google_signals: false/);
  assert.match(code, /allow_ad_personalization_signals: false/);
});
