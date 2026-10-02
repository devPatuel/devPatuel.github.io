// Pure logic of the chat widget: no DOM, no globals, so it can be tested with `node --test`.
export const MAX_HISTORY_ENTRIES = 20;
export const MAX_MESSAGE_CHARS = 500;

// The backend rejects more than 20 entries and wants whole user/assistant pairs, so the widget
// sends only the most recent ones. Without this, from the 11th message of a conversation every
// request would fail even with daily quota left.
export function trimHistory(turns) {
  const paired = turns.slice(0, turns.length - (turns.length % 2));
  return paired.slice(Math.max(0, paired.length - MAX_HISTORY_ENTRIES));
}

// Focus trap for the full-screen panel: returns where Tab should land, or null to let the
// browser move focus normally. `current` is -1 when focus is outside the panel.
export function trappedFocusIndex(current, count, backwards) {
  if (backwards) return current <= 0 ? count - 1 : null;
  return current === -1 || current === count - 1 ? 0 : null;
}

export class ChatError extends Error {
  constructor(kind) {
    super(kind);
    this.name = 'ChatError';
    this.kind = kind;
  }
}

const KNOWN_KINDS = new Set([
  'visitor_limit',
  'daily_limit',
  'too_many_requests',
  'invalid_pass',
  'captcha_failed',
  'captcha_unavailable',
  'model_error',
  'invalid_request',
  'forbidden_origin',
  'server_misconfigured',
  'internal_error',
]);

export function kindFromResponse(status, body) {
  const code = body !== null && typeof body === 'object' ? body.error : undefined;
  return typeof code === 'string' && KNOWN_KINDS.has(code) ? code : 'unknown';
}

export function uiStateFor(kind) {
  if (kind === 'visitor_limit') return 'limit_visitor';
  if (kind === 'daily_limit') return 'limit_global';
  if (kind === 'too_many_requests') return 'slow_down';
  if (kind === 'captcha_failed' || kind === 'captcha_unavailable') return 'captcha';
  // The bot cannot answer at all: most often its free daily quota (model or database) ran out.
  if (['model_error', 'internal_error', 'server_misconfigured', 'unknown'].includes(kind)) return 'unavailable';
  return 'error';
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// Talks to the backend. The pass lives only in this closure (memory): the site forbids storing
// anything in the browser besides the theme, and a pass is cheap to get again.
export function createChatClient({ backendUrl, fetchFn, getCaptchaToken }) {
  let pass = null;
  let passRequest = null;

  async function fetchPass() {
    let token;
    try {
      token = await getCaptchaToken();
    } catch {
      throw new ChatError('captcha_failed');
    }
    let response;
    try {
      response = await fetchFn(`${backendUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken: token }),
      });
    } catch {
      throw new ChatError('network');
    }
    const body = await readJson(response);
    if (!response.ok) throw new ChatError(kindFromResponse(response.status, body));
    if (body === null || typeof body.pass !== 'string') throw new ChatError('unknown');
    pass = body.pass;
  }

  // prepare() and send() can overlap while the captcha is pending: share one request so the
  // visitor never triggers two captcha tokens and two /session calls.
  function requestPass() {
    if (passRequest === null) {
      passRequest = fetchPass().finally(() => {
        passRequest = null;
      });
    }
    return passRequest;
  }

  async function prepare() {
    if (pass !== null) return;
    try {
      await requestPass();
    } catch {
      // The pass will be requested again, with the visitor waiting, when they send a message.
    }
  }

  async function send(conversationId, message, turns) {
    const history = trimHistory(turns);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (pass === null) await requestPass();

      let response;
      try {
        response = await fetchFn(`${backendUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pass}` },
          body: JSON.stringify({ conversationId, message, history }),
        });
      } catch {
        throw new ChatError('network');
      }
      const body = await readJson(response);

      if (response.ok) {
        if (body === null || typeof body.reply !== 'string' || typeof body.remaining !== 'number') {
          throw new ChatError('unknown');
        }
        return { reply: body.reply, remaining: body.remaining };
      }

      const kind = kindFromResponse(response.status, body);
      // A pass can expire or stop matching (new day, new address): renew it once, silently.
      if (kind === 'invalid_pass' && attempt === 0) {
        pass = null;
        continue;
      }
      throw new ChatError(kind);
    }
    throw new ChatError('invalid_pass');
  }

  return { prepare, send };
}
