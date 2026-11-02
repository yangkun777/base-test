const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { askModel } = require('../lib/engine');

test('canceling a model call aborts the upstream HTTP request', async () => {
  let sawRequest = false;
  let closedUpstream = false;
  const upstream = http.createServer((req, res) => {
    sawRequest = true;
    res.on('close', () => { closedUpstream = true; });
    // Keep the request open until the test cancels it.
    res.setHeader('Content-Type', 'application/json');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const oldBase = process.env.OPENAI_BASE_URL;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${upstream.address().port}/v1`;
  process.env.OPENAI_API_KEY = 'local-test-key';
  const controller = new AbortController();
  try {
    const pending = askModel('gpt', 'Test question?', 'eu', controller.signal);
    const deadline = Date.now() + 2000;
    while (!sawRequest && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(sawRequest, true);
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(closedUpstream, true);
  } finally {
    if (oldBase === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    await new Promise(resolve => upstream.close(resolve));
  }
});
