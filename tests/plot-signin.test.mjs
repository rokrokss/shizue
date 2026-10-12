import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PLOT_ORIGINS, PLOT_SIGNIN_FEATURE, plotSignInPing } from '../src/lib/plotSignIn.ts';

const rules = JSON.parse(await readFile(new URL('../src/public/plot-signin-rules.json', import.meta.url), 'utf8'));
const config = await readFile(new URL('../wxt.config.ts', import.meta.url), 'utf8');

// The site's API sends OpenAI this loopback port; the rule and the site must agree on it.
const PORTS = { 'https://plot.shizue.net': 47811, 'http://localhost:13000': 47801 };

const targetOf = ({ redirect: { transform: t } }) =>
  `${t.scheme}://${t.host}${t.port ? `:${t.port}` : ''}`;

test('each Shizue Plot origin gets exactly one rule, on its own port', () => {
  assert.deepEqual(rules.map((rule) => targetOf(rule.action)).sort(), [...PLOT_ORIGINS].sort());
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  for (const rule of rules) {
    const origin = targetOf(rule.action);
    assert.equal(rule.condition.urlFilter, `|http://127.0.0.1:${PORTS[origin]}/auth/callback?`);
    assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
    assert.equal(rule.action.type, 'redirect');
    // Only the scheme, host, port and path change: the query (code, state) goes along untouched.
    assert.equal(rule.action.redirect.transform.path, '/api/chatgpt/callback');
    assert.equal(rule.action.redirect.transform.query, undefined);
    assert.equal(rule.action.redirect.transform.queryTransform, undefined);
  }
});

test('the ports stay clear of the ones Shizue picks for its own sign-in', () => {
  // services/background/chatgpt.ts draws its loopback port from 49152 and up.
  for (const port of Object.values(PORTS)) assert.ok(port < 49152);
});

test('the manifest loads the rules and lets the same origins ask', () => {
  assert.match(config, /rule_resources: \[\{ id: 'plot_signin', enabled: true, path: 'plot-signin-rules\.json' \}\]/);
  assert.match(config, /matches: \['https:\/\/plot\.shizue\.net\/\*', 'http:\/\/localhost\/\*'\]/);
});

test('the presence check answers the site and nobody else', () => {
  const ping = { type: 'ping' };
  for (const origin of PLOT_ORIGINS) {
    assert.deepEqual(plotSignInPing(ping, `${origin}/ko/login?next=%2F`, '9.9.9'), {
      ok: true,
      version: '9.9.9',
      features: [PLOT_SIGNIN_FEATURE],
    });
  }
  assert.equal(plotSignInPing(ping, 'https://evil.example/plot.shizue.net', '1'), undefined);
  assert.equal(plotSignInPing(ping, 'http://localhost:3000/', '1'), undefined);
  assert.equal(plotSignInPing(ping, 'https://plot.shizue.net.evil.example/', '1'), undefined);
  assert.equal(plotSignInPing(ping, 'not a url', '1'), undefined);
  assert.equal(plotSignInPing(ping, undefined, '1'), undefined);
  assert.equal(plotSignInPing({ type: 'sign-in' }, 'https://plot.shizue.net/', '1'), undefined);
  assert.equal(plotSignInPing(null, 'https://plot.shizue.net/', '1'), undefined);
});
