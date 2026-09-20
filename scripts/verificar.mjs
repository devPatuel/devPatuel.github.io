// Site checks: nothing loaded from third parties, local links and anchors resolve, no cookies.
// Usage: node scripts/verificar.mjs  (exit code 1 when something fails)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORADOS = new Set(['.git', '.superpowers', '.worktrees', '.claude', 'docs', 'scripts', 'node_modules']);
const EXTERNO = /^(https?:)?\/\//i;
const SIN_FICHERO = /^(mailto:|tel:|data:|javascript:)/i;
const errores = [];

function recorrer(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    if (IGNORADOS.has(nombre)) return [];
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
  });
}

function fallo(fichero, mensaje) {
  errores.push(`${relative(raiz, fichero)}: ${mensaje}`);
}

function atributo(etiqueta, nombre) {
  const m = etiqueta.match(new RegExp(`\\b${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

// existsSync alone is case-insensitive on the default macOS filesystem, so a link with the
// wrong case for a real file passes here but 404s on a case-sensitive host (Linux, GitHub Pages)
function existeConMayusculasExactas(dir, segmentos) {
  let actual = dir;
  for (const segmento of segmentos) {
    if (segmento === '' || segmento === '.') continue;
    if (segmento === '..') { actual = dirname(actual); continue; }
    if (!readdirSync(actual).includes(segmento)) return false;
    actual = join(actual, segmento);
  }
  return true;
}

function comprobarReferenciaLocal(origen, valor) {
  const [rutaYQuery, fragmento] = valor.split('#');
  const ruta = rutaYQuery.split('?')[0];
  if (!ruta) {
    if (fragmento && !readFileSync(origen, 'utf8').includes(`id="${fragmento}"`)) {
      fallo(origen, `ancla inexistente: ${valor}`);
    }
    return;
  }
  const rutaDecodificada = decodeURIComponent(ruta);
  const destino = resolve(dirname(origen), rutaDecodificada);
  if (!existsSync(destino) || !existeConMayusculasExactas(dirname(origen), rutaDecodificada.split('/'))) {
    fallo(origen, `referencia rota: ${valor}`);
    return;
  }
  if (fragmento && destino.endsWith('.html')) {
    if (!readFileSync(destino, 'utf8').includes(`id="${fragmento}"`)) {
      fallo(origen, `ancla inexistente: ${valor}`);
    }
  }
}

function comprobarScript(fichero, texto) {
  if (/document\.cookie|sessionStorage|indexedDB/.test(texto)) {
    fallo(fichero, 'usa cookies, sessionStorage o indexedDB');
  }
  for (const m of texto.matchAll(/localStorage\.(\w+)\(\s*(['"]([^'"]*)['"])?/g)) {
    if (m[3] !== 'tema') fallo(fichero, `almacenamiento no permitido: ${m[0]}`);
  }
  // String literals pointing to a third party (fetch, injected <script src>, Image().src, etc.).
  // Only applies to actual .js files: this function also runs over full HTML text to catch
  // cookie/storage misuse in inline <script> blocks, and HTML legitimately contains outbound
  // https:// links in href attributes (allowed by the constraints).
  if (fichero.endsWith('.js')) {
    for (const m of texto.matchAll(/(['"`])((?:https?:)?\/\/[^'"`]*)\1/gi)) {
      fallo(fichero, `carga externa en script: ${m[2]}`);
    }
  }
}

function comprobarCss(fichero, texto) {
  for (const m of texto.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const valor = m[1].trim();
    if (valor.startsWith('#') || SIN_FICHERO.test(valor)) continue;
    if (EXTERNO.test(valor)) fallo(fichero, `carga externa en CSS: ${valor}`);
    else comprobarReferenciaLocal(fichero, valor);
  }
  for (const m of texto.matchAll(/@import\s+(?:url\()?\s*['"]?([^'");\s]+)/g)) {
    if (EXTERNO.test(m[1])) fallo(fichero, `@import externo: ${m[1]}`);
  }
}

function comprobarHtml(fichero, html) {
  for (const etiqueta of html.match(/<[a-z][^>]*>/gi) || []) {
    const nombre = etiqueta.match(/^<([a-z0-9]+)/i)[1].toLowerCase();
    const href = atributo(etiqueta, 'href');
    const src = atributo(etiqueta, 'src');
    const srcset = atributo(etiqueta, 'srcset');

    // Whatever the browser fetches by itself must come from this site
    if (src && EXTERNO.test(src)) fallo(fichero, `carga externa en <${nombre}>: ${src}`);
    if (nombre === 'link' && href && EXTERNO.test(href)) fallo(fichero, `carga externa en <link>: ${href}`);

    // Check each URL in srcset (split by comma, take first whitespace-separated token)
    if (srcset) {
      for (const candidato of srcset.split(',')) {
        const url = candidato.trim().split(/\s+/)[0];
        if (url) {
          if (EXTERNO.test(url)) fallo(fichero, `carga externa en <${nombre}>: ${url}`);
          else if (!SIN_FICHERO.test(url)) comprobarReferenciaLocal(fichero, url);
        }
      }
    }

    for (const valor of [href, src]) {
      if (valor && !EXTERNO.test(valor) && !SIN_FICHERO.test(valor)) comprobarReferenciaLocal(fichero, valor);
    }

    if (nombre === 'a' && atributo(etiqueta, 'target') === '_blank') {
      const rel = atributo(etiqueta, 'rel') || '';
      if (!/\bnoopener\b/.test(rel) || !/\bnoreferrer\b/.test(rel)) {
        fallo(fichero, `target="_blank" sin rel="noopener noreferrer": ${href}`);
      }
    }
  }
  comprobarScript(fichero, html);
  comprobarCss(fichero, html);
}

const ficheros = recorrer(raiz);
const paginas = ficheros.filter((f) => f.endsWith('.html'));
paginas.forEach((f) => comprobarHtml(f, readFileSync(f, 'utf8')));
ficheros.filter((f) => f.endsWith('.css')).forEach((f) => comprobarCss(f, readFileSync(f, 'utf8')));
ficheros.filter((f) => f.endsWith('.js')).forEach((f) => comprobarScript(f, readFileSync(f, 'utf8')));

if (errores.length) {
  console.log(`✗ ${errores.length} problema(s):`);
  errores.forEach((e) => console.log(`  - ${e}`));
  process.exit(1);
}
console.log(`✓ ${paginas.length} página(s): sin terceros, sin cookies, enlaces y anclas correctos`);
