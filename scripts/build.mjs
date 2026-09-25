#!/usr/bin/env node
// Inline riso.js into a scene so it becomes one self-contained .html file
// (the format these pieces are usually shared in).
//
//   node scripts/build.mjs scenes/train-journey.html      → dist/train-journey.html
//   node scripts/build.mjs                               → every scene in scenes/
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync('scenes').filter((f) => f.endsWith('.html') && !f.startsWith('_')).map((f) => join('scenes', f));

mkdirSync('dist', { recursive: true });
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const out = html.replace(/<script src="([^"]+)"><\/script>/g, (tag, src) => {
    if (/^https?:/.test(src)) return tag;
    const code = readFileSync(resolve(dirname(file), src), 'utf8');
    return `<script>\n${code}\n</script>`;
  });
  const dest = join('dist', basename(file));
  writeFileSync(dest, out);
  console.log(`${file} → ${dest} (${(out.length / 1024).toFixed(1)} KB)`);
}
