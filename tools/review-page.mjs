// Turns a built index.html into page content for the claude.ai review preview,
// which supplies its own document skeleton (doctype, html, head, body).
import { readFileSync, writeFileSync } from 'node:fs';

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
