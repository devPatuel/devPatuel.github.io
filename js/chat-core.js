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
  if (kind === 'captcha_failed' || kind === 'captcha_unavailable') return 'captcha';
  return 'error';
}
