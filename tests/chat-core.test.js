import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ChatError,
  MAX_HISTORY_ENTRIES,
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
