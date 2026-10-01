// Every address the chat talks to lives here and only here. scripts/verificar.mjs allows
// exactly these and nothing else, so adding a third party is a visible, reviewed change.
// To publish: set the real backend URL and the real Turnstile site key, and update the
// Content-Security-Policy of index.html to match (connect-src).
export const CHAT_CONFIG = {
  backendUrl: 'http://localhost:8787',
  turnstileScript: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  // Cloudflare's public test key (always passes, visible). Never a real key.
  turnstileSiteKey: '1x00000000000000000000AA',
  contactEmail: 'chatbot.info@jordipatuel.com',
};
