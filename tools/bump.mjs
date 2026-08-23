#!/usr/bin/env node
/* מקור אמת אחד לגרסה.
   version.json הוא המקור; הסקריפט כותב ממנו את sw.js ואת index.html.

   שלוש הנקודות נחוצות — הן ממלאות שלושה תפקידים שונים:
     CACHE_VERSION   מפרק את הקאש הישן ב-activate
     version.json    מה שהשרת מכריז, נטען network-first
     _BUNDLE_VERSION מה שרץ עכשיו בדפדפן, להשוואה מול השרת
   מה ששבור הוא לכתוב את המספר ידנית בשלושה קבצים. זו בעיית סנכרון,
   לא בעיית ארכיטקטורה — וסנכרון ידני נשכח.

   שימוש:  node tools/bump.mjs [patch|minor|major|<גרסה>] */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const write = (f, s) => writeFileSync(join(root, f), s);

const arg = process.argv[2] || 'patch';
const current = JSON.parse(read('version.json')).version;

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [a, b, c] = current.split('.').map(Number);
  next = arg === 'major' ? `${a + 1}.0.0`
       : arg === 'minor' ? `${a}.${b + 1}.0`
       : `${a}.${b}.${c + 1}`;
}

const date = new Date().toISOString().slice(0, 10);
write('version.json', JSON.stringify({ version: next, date }, null, 2) + '\n');

const sw = read('sw.js').replace(
  /const CACHE_VERSION = '[^']*';/,
  `const CACHE_VERSION = '${next}';`);
write('sw.js', sw);

const html = read('index.html').replace(
  /window\._BUNDLE_VERSION = '[^']*';/,
  `window._BUNDLE_VERSION = '${next}';`);
write('index.html', html);

console.log(`${current} → ${next}`);
for (const [f, re] of [['version.json', /"version":\s*"([^"]+)"/],
                       ['sw.js', /CACHE_VERSION = '([^']+)'/],
                       ['index.html', /_BUNDLE_VERSION = '([^']+)'/]]) {
  const got = (read(f).match(re) || [])[1];
  console.log(`  ${got === next ? '✓' : '✗'} ${f} → ${got}`);
  if (got !== next) process.exitCode = 1;
}
