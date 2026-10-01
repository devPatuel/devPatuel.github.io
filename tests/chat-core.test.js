import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ChatError,
  MAX_HISTORY_ENTRIES,
  createChatClient,
  kindFromResponse,
  trimHistory,
  uiStateFor,
} from '../js/chat-core.js';

function turns(count) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `mensaje ${i}`,
  }));
}

describe('trimHistory', () => {
  it('keeps a short history untouched', () => {
    assert.deepEqual(trimHistory(turns(0)), []);
    assert.deepEqual(trimHistory(turns(2)), turns(2));
    assert.deepEqual(trimHistory(turns(20)), turns(20));
  });

  it('keeps only the last 20 entries of a longer history', () => {
    const result = trimHistory(turns(22));
    assert.equal(result.length, MAX_HISTORY_ENTRIES);
    assert.deepEqual(result, turns(22).slice(2));
  });

  it('always starts with the visitor and alternates roles', () => {
    for (const size of [20, 22, 24, 40, 100]) {
      const result = trimHistory(turns(size));
      assert.equal(result.length, 20);
      assert.equal(result[0].role, 'user');
      result.forEach((entry, i) => assert.equal(entry.role, i % 2 === 0 ? 'user' : 'assistant'));
    }
  });

  it('drops an unpaired trailing entry, because the backend wants whole pairs', () => {
    const result = trimHistory(turns(21));
    assert.equal(result.length, 20);
    assert.equal(result[0].role, 'user');
    assert.equal(result.at(-1).role, 'assistant');
  });

  it('does not modify the array it receives', () => {
    const original = turns(30);
    const copy = structuredClone(original);
    trimHistory(original);
    assert.deepEqual(original, copy);
  });
});

describe('kindFromResponse', () => {
  it('reads the error code of the backend', () => {
    assert.equal(kindFromResponse(429, { error: 'visitor_limit' }), 'visitor_limit');
    assert.equal(kindFromResponse(503, { error: 'daily_limit' }), 'daily_limit');
    assert.equal(kindFromResponse(401, { error: 'invalid_pass' }), 'invalid_pass');
    assert.equal(kindFromResponse(403, { error: 'captcha_failed' }), 'captcha_failed');
    assert.equal(kindFromResponse(503, { error: 'captcha_unavailable' }), 'captcha_unavailable');
    assert.equal(kindFromResponse(502, { error: 'model_error' }), 'model_error');
    assert.equal(kindFromResponse(400, { error: 'invalid_request' }), 'invalid_request');
  });

  it('falls back to a generic kind for anything it does not know', () => {
    assert.equal(kindFromResponse(500, null), 'unknown');
    assert.equal(kindFromResponse(500, {}), 'unknown');
    assert.equal(kindFromResponse(418, { error: 'teapot' }), 'unknown');
    assert.equal(kindFromResponse(500, { error: 42 }), 'unknown');
  });
});

describe('uiStateFor', () => {
  it('maps the limits to their own states, with the contact link', () => {
    assert.equal(uiStateFor('visitor_limit'), 'limit_visitor');
    assert.equal(uiStateFor('daily_limit'), 'limit_global');
  });

  it('maps the captcha failures to one state', () => {
    assert.equal(uiStateFor('captcha_failed'), 'captcha');
    assert.equal(uiStateFor('captcha_unavailable'), 'captcha');
  });

  it('shows a generic error for everything else', () => {
    for (const kind of ['model_error', 'invalid_request', 'invalid_pass', 'network', 'unknown']) {
      assert.equal(uiStateFor(kind), 'error');
    }
  });
});

describe('ChatError', () => {
  it('carries its kind', () => {
    const error = new ChatError('daily_limit');
    assert.equal(error.kind, 'daily_limit');
    assert.ok(error instanceof Error);
  });
});

function fakeFetch(steps) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    const step = steps.shift();
    if (!step) throw new Error(`unexpected request to ${url}`);
    const { status = 200, body } = typeof step === 'function' ? step(url, init) : step;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

function tokens() {
  let n = 0;
  const getCaptchaToken = async () => `token-${++n}`;
  getCaptchaToken.count = () => n;
  return getCaptchaToken;
}

const BACKEND = 'http://backend.test';
const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const OK = { status: 200, body: { reply: 'Hola, soy Patu.', remaining: 19 } };
const SESSION_OK = (pass) => ({ status: 200, body: { pass, expiresIn: 1800 } });

describe('createChatClient', () => {
  it('gets a pass with a captcha token and then sends the message with it', async () => {
    const fetchFn = fakeFetch([SESSION_OK('pass-1'), OK]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });

    const result = await client.send(ID, 'hola', []);

    assert.deepEqual(result, { reply: 'Hola, soy Patu.', remaining: 19 });
    assert.equal(fetchFn.calls[0].url, `${BACKEND}/session`);
    assert.deepEqual(fetchFn.calls[0].body, { turnstileToken: 'token-1' });
    assert.equal(fetchFn.calls[1].url, `${BACKEND}/chat`);
    assert.equal(fetchFn.calls[1].init.headers.Authorization, 'Bearer pass-1');
    assert.deepEqual(fetchFn.calls[1].body, { conversationId: ID, message: 'hola', history: [] });
  });

  it('reuses the pass for the next messages', async () => {
    const fetchFn = fakeFetch([SESSION_OK('pass-1'), OK, OK]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });

    await client.send(ID, 'uno', []);
    await client.send(ID, 'dos', []);

    assert.equal(fetchFn.calls.filter((c) => c.url.endsWith('/session')).length, 1);
    assert.equal(fetchFn.calls.length, 3);
  });

  it('shares one in-flight pass request between prepare and send', async () => {
    const fetchFn = fakeFetch([SESSION_OK('pass-1'), OK]);
    let calls = 0;
    const getCaptchaToken = () => {
      calls++;
      return new Promise((resolve) => setTimeout(() => resolve(`token-${calls}`), 20));
    };
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken });

    const preparing = client.prepare();
    const sending = client.send(ID, 'hola', []);
    await Promise.all([preparing, sending]);

    assert.equal(calls, 1);
    assert.equal(fetchFn.calls.filter((c) => c.url.endsWith('/session')).length, 1);
  });

  it('sends at most the last 20 history entries', async () => {
    const fetchFn = fakeFetch([SESSION_OK('p'), OK]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });
    const history = Array.from({ length: 24 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));

    await client.send(ID, 'hola', history);

    assert.equal(fetchFn.calls[1].body.history.length, 20);
    assert.equal(fetchFn.calls[1].body.history[0].content, 'm4');
  });

  it('renews an invalid pass once, with a fresh captcha token, and retries', async () => {
    const getCaptchaToken = tokens();
    const fetchFn = fakeFetch([
      SESSION_OK('old'),
      { status: 401, body: { error: 'invalid_pass' } },
      SESSION_OK('new'),
      OK,
    ]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken });

    const result = await client.send(ID, 'hola', []);

    assert.equal(result.reply, 'Hola, soy Patu.');
    assert.equal(getCaptchaToken.count(), 2);
    assert.equal(fetchFn.calls[3].init.headers.Authorization, 'Bearer new');
  });

  it('gives up after one renewal instead of looping', async () => {
    const fetchFn = fakeFetch([
      SESSION_OK('a'),
      { status: 401, body: { error: 'invalid_pass' } },
      SESSION_OK('b'),
      { status: 401, body: { error: 'invalid_pass' } },
    ]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });

    await assert.rejects(client.send(ID, 'hola', []), (error) => error instanceof ChatError && error.kind === 'invalid_pass');
    assert.equal(fetchFn.calls.length, 4);
  });

  it('never calls /chat when the captcha is rejected', async () => {
    const fetchFn = fakeFetch([{ status: 403, body: { error: 'captcha_failed' } }]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });

    await assert.rejects(client.send(ID, 'hola', []), (error) => error.kind === 'captcha_failed');
    assert.equal(fetchFn.calls.length, 1);
  });

  it('reports a captcha failure when no token can be obtained', async () => {
    const fetchFn = fakeFetch([]);
    const client = createChatClient({
      backendUrl: BACKEND,
      fetchFn,
      getCaptchaToken: async () => {
        throw new Error('widget failed');
      },
    });

    await assert.rejects(client.send(ID, 'hola', []), (error) => error.kind === 'captcha_failed');
    assert.equal(fetchFn.calls.length, 0);
  });

  it('reports a network failure', async () => {
    const fetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });

    await assert.rejects(client.send(ID, 'hola', []), (error) => error.kind === 'network');
  });

  it('maps the limits and unknown answers to their kinds', async () => {
    for (const [status, body, kind] of [
      [429, { error: 'visitor_limit' }, 'visitor_limit'],
      [503, { error: 'daily_limit' }, 'daily_limit'],
      [502, { error: 'model_error' }, 'model_error'],
      [500, null, 'unknown'],
    ]) {
      const fetchFn = fakeFetch([SESSION_OK('p'), { status, body }]);
      const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });
      await assert.rejects(client.send(ID, 'hola', []), (error) => error.kind === kind);
    }
  });

  it('rejects a 200 answer that is not a reply', async () => {
    const fetchFn = fakeFetch([SESSION_OK('p'), { status: 200, body: { reply: 7 } }]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });

    await assert.rejects(client.send(ID, 'hola', []), (error) => error.kind === 'unknown');
  });

  it('prepare() gets a pass ahead of time and swallows its failure', async () => {
    const fetchFn = fakeFetch([SESSION_OK('early'), OK]);
    const client = createChatClient({ backendUrl: BACKEND, fetchFn, getCaptchaToken: tokens() });

    await client.prepare();
    await client.send(ID, 'hola', []);

    assert.equal(fetchFn.calls.filter((c) => c.url.endsWith('/session')).length, 1);

    const failing = createChatClient({
      backendUrl: BACKEND,
      fetchFn: fakeFetch([]),
      getCaptchaToken: async () => {
        throw new Error('nope');
      },
    });
    await assert.doesNotReject(failing.prepare());
  });
});
