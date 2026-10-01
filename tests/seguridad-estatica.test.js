import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SCRIPTS = ['js/chat.js', 'js/chat-core.js', 'js/chat-config.js'];

describe('the widget never turns text into markup', () => {
  for (const file of ['js/chat.js', 'js/chat-core.js']) {
    it(`${file} uses no HTML-injecting API`, () => {
      const source = read(file);
      for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'DOMParser']) {
        assert.ok(!source.includes(forbidden), `${file} contains ${forbidden}`);
      }
    });
  }

  it('js/chat.js writes visitor and model text with textContent', () => {
    assert.ok(read('js/chat.js').includes('textContent'));
  });
});

describe('the widget stores nothing in the browser', () => {
  for (const file of SCRIPTS) {
    it(`${file} uses no cookies or web storage`, () => {
      const source = read(file);
      for (const forbidden of ['document.cookie', 'localStorage', 'sessionStorage', 'indexedDB']) {
        assert.ok(!source.includes(forbidden), `${file} contains ${forbidden}`);
      }
    });
  }
});

describe('third-party addresses live in one file', () => {
  it('only chat-config.js names addresses', () => {
    for (const file of ['js/chat.js', 'js/chat-core.js']) {
      assert.ok(!/https?:\/\//.test(read(file)), `${file} contains an address`);
    }
  });
});

describe('the Content-Security-Policy of the home page allows the chat and nothing more', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? '';
  const directive = (name) => csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '';

  it('lets scripts come from this site and Turnstile', () => {
    assert.ok(directive('script-src').includes("'self'"));
    assert.ok(directive('script-src').includes('https://challenges.cloudflare.com'));
  });

  it('lets Turnstile draw its frame', () => {
    assert.equal(directive('frame-src'), 'frame-src https://challenges.cloudflare.com');
  });

  it('lets the page talk to this site and the backend only', () => {
    const connect = directive('connect-src');
    assert.ok(connect.startsWith("connect-src 'self'"));
    assert.ok(!connect.includes('*'));
  });

  it('keeps the rest strict', () => {
    assert.ok(directive('default-src').includes("'self'"));
    assert.equal(directive('style-src'), "style-src 'self'");
    assert.equal(directive('object-src'), "object-src 'none'");
    assert.ok(!csp.includes("'unsafe-inline'"));
    assert.ok(!csp.includes("'unsafe-eval'"));
  });
});
