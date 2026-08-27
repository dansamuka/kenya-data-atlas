#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'index.html');
let html = await readFile(file, 'utf8');

if (!html.includes('assets/worldbank-integration.css')) {
  const marker = '  <link rel="stylesheet" href="assets/unit-system.css">';
  if (!html.includes(marker)) throw new Error('CSS insertion marker not found in index.html');
  html = html.replace(marker, `${marker}\n  <link rel="stylesheet" href="assets/worldbank-integration.css">`);
}
if (!html.includes('assets/worldbank-integration.js')) {
  const marker = '  <script src="assets/unit-system.js"></script>';
  if (!html.includes(marker)) throw new Error('JS insertion marker not found in index.html');
  html = html.replace(marker, `${marker}\n  <script src="assets/worldbank-integration.js"></script>`);
}
await writeFile(file, html);
console.log('World Bank UI assets wired into index.html.');
