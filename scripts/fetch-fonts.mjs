// Descarga UNA vez las fuentes de Google Fonts que usa el juego y deja vendor-src/fonts/{fonts.css,*.woff2}.
// El resultado se versiona; build:content solo copia. Uso: node scripts/fetch-fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(import.meta.dirname, '../vendor-src/fonts');
const href = 'https://fonts.googleapis.com/css2?family=Lilita+One&family=MedievalSharp&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
let css = await (await fetch(href, { headers: { 'user-agent': UA } })).text();
for (const m of [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)]) {
  const name = m[1].split('/').slice(-3).join('_');   // familia_version_archivo
  fs.writeFileSync(path.join(out, name), Buffer.from(await (await fetch(m[1])).arrayBuffer()));
  css = css.replace(m[1], name);
}
fs.writeFileSync(path.join(out, 'fonts.css'), css);
fs.rmSync(path.join(out, 'google.css'), { force: true });
console.log(fs.readdirSync(out));
