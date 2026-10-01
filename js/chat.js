// DOM of the floating chat. The logic lives in chat-core.js; this file only builds elements.
// Every piece of text from the visitor or the model goes in through textContent, never as markup.
import { CHAT_CONFIG } from './chat-config.js';
import { ChatError, MAX_MESSAGE_CHARS, createChatClient, uiStateFor } from './chat-core.js';

const GREETING =
  '¡Hola! Soy Patu, el robot de este portfolio. Puedo contarte lo que Jordi ha publicado sobre su perfil: tecnologías, proyectos y formación. ¿Qué quieres saber?';
const SUGGESTIONS = ['¿Qué tecnologías usa Jordi?', '¿Qué proyectos tiene?', '¿Dónde ha estudiado?'];
const NOTICE =
  'Asistente de IA: puede equivocarse. Las conversaciones se guardan 30 días para revisar la seguridad; no escribas datos personales. ';
const MESSAGES = {
  error: 'Algo ha fallado. Inténtalo de nuevo en un momento.',
  captcha: 'No he podido comprobar que eres una persona. Recarga la página e inténtalo de nuevo.',
  limit_visitor: 'Has llegado al límite de mensajes de hoy. Vuelve mañana o escribe a ',
  limit_global: 'El asistente ha llegado a su límite de hoy. Vuelve mañana o escribe a ',
};
const CAPTCHA_TIMEOUT_MS = 30000;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function contactLink() {
  const link = element('a', 'chat-enlace', CHAT_CONFIG.contactEmail);
  link.href = `mailto:${CHAT_CONFIG.contactEmail}`;
  return link;
}

// Turnstile is loaded the first time the chat opens, not with the page.
let turnstileReady = null;
function loadTurnstile() {
  if (turnstileReady) return turnstileReady;
  turnstileReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHAT_CONFIG.turnstileScript;
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => {
      turnstileReady = null;
      reject(new Error('turnstile script failed'));
    };
    document.head.append(script);
  });
  return turnstileReady;
}

// A Turnstile token is single use, so every pass needs a fresh one: render the widget the first
// time and reset it afterwards.
function createCaptcha(container) {
  let widgetId = null;
  let pending = null;
  let timer = null;

  function settle(method, value) {
    clearTimeout(timer);
    const current = pending;
    pending = null;
    if (current) current[method](value);
  }

  return async function getCaptchaToken() {
    // A second call while one is waiting shares the same wait instead of overwriting it.
    if (pending) return pending.promise;
    const turnstile = await loadTurnstile();
    if (pending) return pending.promise;
    const promise = new Promise((resolve, reject) => {
      pending = { resolve, reject };
    });
    pending.promise = promise;
    // A stale timer must never reject a newer wait.
    clearTimeout(timer);
    timer = setTimeout(() => settle('reject', new Error('captcha timeout')), CAPTCHA_TIMEOUT_MS);
    if (widgetId === null) {
      widgetId = turnstile.render(container, {
        sitekey: CHAT_CONFIG.turnstileSiteKey,
        callback: (token) => settle('resolve', token),
        'error-callback': () => settle('reject', new Error('captcha error')),
      });
    } else {
      turnstile.reset(widgetId);
    }
    return promise;
  };
}

function init() {
  const launcher = element('button', 'chat-lanzador');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Abrir el chat con Patu');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'chat-panel');
  const launcherIcon = element('img');
  launcherIcon.src = 'img/patu.svg';
  launcherIcon.alt = '';
  launcher.append(launcherIcon);

  const panel = element('section', 'chat-panel');
  panel.id = 'chat-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat con Patu');

  const header = element('div', 'chat-cabecera');
  const headerIcon = element('img', 'chat-cabecera-icono');
  headerIcon.src = 'img/patu.svg';
  headerIcon.alt = '';
  const title = element('p', 'chat-titulo', 'Patu');
  const closeButton = element('button', 'chat-cerrar', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Cerrar el chat');
  header.append(headerIcon, title, closeButton);

  const log = element('div', 'chat-registro');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');

  const suggestions = element('div', 'chat-sugerencias');
  const status = element('p', 'chat-estado');
  status.setAttribute('role', 'status');
  const captchaBox = element('div', 'chat-captcha');

  const form = element('form', 'chat-formulario');
  const input = element('input', 'chat-campo');
  input.type = 'text';
  input.maxLength = MAX_MESSAGE_CHARS;
  input.autocomplete = 'off';
  input.required = true;
  input.placeholder = 'Escribe tu pregunta';
  input.setAttribute('aria-label', 'Tu pregunta');
  const sendButton = element('button', 'chat-enviar', 'Enviar');
  sendButton.type = 'submit';
  form.append(input, sendButton);

  const notice = element('p', 'chat-aviso', NOTICE);
  const privacyLink = element('a', 'chat-enlace', 'Más información');
  privacyLink.href = 'privacidad.html';
  notice.append(privacyLink);

  panel.append(header, log, suggestions, status, captchaBox, form, notice);
  document.body.append(launcher, panel);

  const client = createChatClient({
    backendUrl: CHAT_CONFIG.backendUrl,
    fetchFn: (url, init) => fetch(url, init),
    getCaptchaToken: createCaptcha(captchaBox),
  });

  const turns = [];
  let conversationId = null;
  let busy = false;
  let blocked = false;
  let opened = false;

  function addLine(who, text) {
    const line = element('p', `chat-linea chat-linea-${who}`, text);
    log.append(line);
    log.scrollTop = log.scrollHeight;
    return line;
  }

  function showFailure(kind) {
    const state = uiStateFor(kind);
    if (state === 'limit_visitor' || state === 'limit_global') {
      const line = addLine('aviso', MESSAGES[state]);
      line.append(contactLink(), '.');
      blocked = true;
      input.disabled = true;
      sendButton.disabled = true;
      status.textContent = '';
      return;
    }
    addLine('aviso', MESSAGES[state]);
    status.textContent = '';
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value || blocked;
    sendButton.disabled = value || blocked;
  }

  async function submit(text) {
    const message = text.trim();
    if (!message || busy || blocked) return;
    setBusy(true);
    suggestions.hidden = true;
    addLine('usuario', message);
    status.textContent = 'Patu está escribiendo…';
    try {
      const { reply, remaining } = await client.send(conversationId, message, turns);
      turns.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
      addLine('patu', reply);
      status.textContent = remaining === 1 ? 'Te queda 1 mensaje hoy.' : `Te quedan ${remaining} mensajes hoy.`;
    } catch (error) {
      showFailure(error instanceof ChatError ? error.kind : 'unknown');
    } finally {
      setBusy(false);
      if (!blocked) input.focus();
    }
  }

  for (const text of SUGGESTIONS) {
    const button = element('button', 'chat-sugerencia', text);
    button.type = 'button';
    button.addEventListener('click', () => submit(text));
    suggestions.append(button);
  }

  function open() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    if (!opened) {
      opened = true;
      conversationId = crypto.randomUUID();
      addLine('patu', GREETING);
      // Warm up: the script, the captcha and the pass start now, so the first answer is not slower.
      client.prepare();
    }
    input.focus();
  }

  function close() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }

  launcher.addEventListener('click', () => (panel.hidden ? open() : close()));
  closeButton.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    submit(text);
  });
}

init();
