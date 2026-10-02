// Every address the chat talks to lives here and only here. scripts/verificar.mjs allows
// exactly these and nothing else, so adding a third party is a visible, reviewed change.
// Changing the backend URL means updating the Content-Security-Policy of every page (connect-src)
// and scripts/verificar.mjs to match; tests/seguridad-estatica.test.js checks the exact value.
export const CHAT_CONFIG = {
  backendUrl: 'https://portfolio-chatbot.devpatuel.workers.dev',
  turnstileScript: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  // Real site key of the jordipatuel.com widget. It is public by design: the secret lives only in the Worker.
  turnstileSiteKey: '0x4AAAAAAFMAgD30DZ-vSqqv',
  contactEmail: 'chatbot.info@jordipatuel.com',
};
