// Turns a built index.html into page content for the claude.ai review preview,
// which supplies its own document skeleton (doctype, html, head, body).
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'dist-review';
const html = readFileSync(`${dir}/index.html`, 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
const keep = head
  .split('\n')
  .filter((l) => /<title>|<script|<link rel="stylesheet"|<link rel="modulepreload"|<link rel="icon"/.test(l))
  .join('\n');
writeFileSync(`${dir}/index.html`, `${keep}\n<style>html,body{background:#090D13;color:#F4F1E8}</style>\n${body.trim()}\n`);
console.log(`review page written: ${dir}/index.html`);

// The preview host doesn't serve .glb files, so each model becomes a glTF JSON
// file (same data, buffer embedded) and the scripts point at it instead.
const assets = `${dir}/assets`;
const glbs = readdirSync(assets).filter((f) => f.endsWith('.glb'));
for (const name of glbs) {
  const glb = readFileSync(`${assets}/${name}`);
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const binLen = glb.readUInt32LE(binStart);
  json.buffers[0].uri = `data:application/octet-stream;base64,${glb.subarray(binStart + 8, binStart + 8 + binLen).toString('base64')}`;
  const out = name.replace(/\.glb$/, '.gltf.json');
  writeFileSync(`${assets}/${out}`, JSON.stringify(json));
  rmSync(`${assets}/${name}`);
  for (const js of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
    const code = readFileSync(`${assets}/${js}`, 'utf8');
    if (code.includes(name)) writeFileSync(`${assets}/${js}`, code.replaceAll(name, out));
  }
  console.log(`model for the preview: ${out}`);
}
