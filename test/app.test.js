const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const { mapMetric, normalizeCyberEntity, summarizeByStatus } = require('../src/connectors');

test('mapMetric builds fallback values for empty arrays', () => {
  const result = mapMetric([], 'durationMinutes');
  assert.equal(result.length, 10);
  assert.equal(result[0].value, 0);
});

test('normalizeCyberEntity and summary handle mixed status payload', () => {
  const entities = [
    normalizeCyberEntity({ id: '1', taskName: 'Daily Backup', status: 'Success', startedAt: '2026-01-01T10:00:00Z', finishedAt: '2026-01-01T10:20:00Z' }),
    normalizeCyberEntity({ id: '2', actionName: 'Instant Recovery', state: 'running', startTime: '2026-01-01T12:00:00Z' }),
  ];

  const summary = summarizeByStatus(entities);
  assert.equal(summary.success, 1);
  assert.equal(summary.running, 1);
  assert.equal(entities[0].durationMinutes, 20);
});

test('GET /api/providers returns supported systems', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/providers`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const ids = body.map((provider) => provider.id);
    assert.deepEqual(ids.sort(), ['cyber-backup', 'ru-backup', 'veeam'].sort());
  } finally {
    server.close();
  }
});
