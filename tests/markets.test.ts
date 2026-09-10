import test from 'node:test';
import assert from 'node:assert/strict';
import {
  positions,
  qualifies,
  parseForecasts,
  price,
  horizonMatches,
  comparePositions,
  modelForecasts,
  type Market,
  type Forecast,
} from '../lib/markets.ts';
const now = Date.now();
const market: Market = {
  id: 'example',
  platform: 'kalshi',
  title: 'Example',
  category: 'Sports',
  categoryInferred: false,
  end: new Date(now + 86400000).toISOString(),
  yesAsk: 0.55,
  noAsk: 0.47,
  volume: 100,
  volumeUnit: 'contracts',
  fetchedAt: now,
  url: 'https://kalshi.com',
  rules: '',
};
const forecast: Forecast = {
  platform: 'kalshi',
  marketId: 'example',
  probabilityYes: 0.65,
  source: 'Test model',
  sourceUrl: 'https://example.com/model',
  rationale: 'Test evidence',
  updatedAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 60000).toISOString(),
  ai: { yes: 7.8, no: 2.2, model: 'Test' },
};
test('expected value and NO complement use independent forecasts and actual asks', () => {
  const [yes, no] = positions([market], [forecast], 2, now);
  assert.ok(Math.abs(yes.net! - 8) < 1e-8);
  assert.ok(Math.abs(no.net! - -14) < 1e-8);
  assert.equal(yes.score, 7.8);
  assert.equal(no.score, 2.2);
  assert.equal(qualifies(yes, 1.5), true);
  assert.equal(qualifies(no, 1.5), false);
});
test('strict 1.5 pp cutoff rejects equality and missing asks', () => {
  const p = positions([{ ...market, yesAsk: 0.615 }], [forecast], 2, now)[0];
  assert.equal(qualifies(p, 1.5), false);
  assert.equal(qualifies({ ...p, net: 1.5001 }, 1.5), true);
  const absent = positions(
    [{ ...market, yesAsk: null }],
    [forecast],
    2,
    now,
  )[0];
  assert.equal(absent.net, null);
  assert.equal(qualifies(absent, 1.5), false);
});
test('unforecasted, expired, stale and ended markets cannot qualify', () => {
  for (const p of [
    positions([market], [], 2, now)[0],
    positions(
      [market],
      [{ ...forecast, expiresAt: new Date(now - 1).toISOString() }],
      2,
      now,
    )[0],
    positions([{ ...market, fetchedAt: now - 120001 }], [forecast], 2, now)[0],
    positions(
      [{ ...market, end: new Date(now - 1).toISOString() }],
      [forecast],
      2,
      now,
    )[0],
  ])
    assert.equal(qualifies(p, 1.5), false);
});
test('raw versus net filtering includes costs exactly once', () => {
  const p = positions([{ ...market, yesAsk: 0.62 }], [forecast], 2, now)[0];
  assert.equal(qualifies(p, 1.5, 'raw'), true);
  assert.equal(qualifies(p, 1.5, 'net'), false);
});
test('forecast validator rejects invalid probabilities, duplicate IDs and AI scores', () => {
  assert.equal(parseForecasts({ forecasts: [forecast] }).length, 1);
  for (const value of [
    [{ ...forecast, probabilityYes: 1.1 }],
    [{ ...forecast, probabilityYes: '0.65' }],
    [forecast, forecast],
    [{ ...forecast, ai: { yes: 11, no: 3, model: 'x' } }],
    [{ ...forecast, sourceUrl: 'javascript:alert(1)' }],
  ])
    assert.throws(() => parseForecasts(value));
  assert.equal(
    parseForecasts([{ ...forecast, ai: undefined }])[0].ai,
    undefined,
  );
});
test('missing prices are not zero and no probabilities are inferred', () => {
  assert.equal(price(null), null);
  assert.equal(price(''), null);
  assert.equal(price('0'), null);
  assert.equal(price('1'), null);
  assert.equal(price('0.55'), 0.55);
  assert.equal(positions([market], [], 2, now)[0].p, null);
});
test('horizon boundaries are non-overlapping', () => {
  const at = (d: number) => new Date(now + d * 86400000).toISOString();
  assert.equal(horizonMatches(at(1), 'day', now), true);
  assert.equal(horizonMatches(at(1), 'week', now), false);
  assert.equal(horizonMatches(at(7), 'week', now), true);
  assert.equal(horizonMatches(at(7), 'month', now), false);
  assert.equal(horizonMatches(null, 'unknown', now), true);
});
test('sorting keeps unrated positions last, including ascending gap sort', () => {
  const p = positions([market], [forecast], 2, now)[0];
  assert.ok(comparePositions({ ...p, net: null }, p, 'gap-asc') > 0);
  assert.ok(comparePositions({ ...p, score: 8.1 }, p, 'ai') < 0);
});
test('built-in model supplies bounded estimates and decimal AI ratings for quoted markets', () => {
  const modeled = modelForecasts([market]);
  assert.equal(modeled.length, 1);
  assert.ok(modeled[0].probabilityYes >= 0 && modeled[0].probabilityYes <= 1);
  assert.ok(modeled[0].ai!.yes >= 1 && modeled[0].ai!.yes <= 10);
  const [yes, no] = positions([market], modeled, 2, now);
  assert.equal(typeof yes.net, 'number');
  assert.equal(typeof no.net, 'number');
  assert.equal(typeof yes.score, 'number');
  assert.equal(typeof no.score, 'number');
  assert.deepEqual(
    modelForecasts([{ ...market, yesAsk: null, noAsk: null }]),
    [],
  );
});
