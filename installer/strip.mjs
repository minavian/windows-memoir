// What ships is only what runs: copies a folder of Memoir's web files with every developer comment taken out and the
// code written compactly (JavaScript through terser, its code unchanged; CSS and HTML by a careful pass of our own).
// node strip.mjs <from> <to>
import { minify } from 'terser';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('node strip.mjs <from> <to>'); process.exit(1); }

// CSS: comments out (never inside a string), each line's indent and the blank lines gone
export function stripCss(text) {
  let out = '', i = 0, quote = null;
  while (i < text.length) {
    const c = text[i];
    if (quote) { out += c; if (c === '\\') { out += text[i + 1] ?? ''; i += 2; continue; } if (c === quote) quote = null; i++; continue; }
    if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    out += c; i++;
  }
  return out.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n') + '\n';
}

// HTML: comments out, indents gone (a line break stays where there was one, so words keep their spaces)
function stripHtml(text) {
  const keep = [];
  // a <style> block's CSS gets the CSS pass; <script>, <pre> and <textarea> are left exactly as they are
  text = text.replace(/<(script|pre|textarea)\b[\s\S]*?<\/\1>/gi, m => `\u0000${keep.push(m) - 1}\u0000`);
  text = text.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, b) => `\u0000${keep.push(a + '\n' + stripCss(css) + b) - 1}\u0000`);
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n') + '\n';
  return text.replace(/\u0000(\d+)\u0000/g, (m, n) => keep[+n]);
}

async function stripJs(text, file) {
  const module = /^\s*(import|export)\b/m.test(text) || /\bimport\s*\(/.test(text);
  const result = await minify(text, { module, compress: false, mangle: false, ecma: 2022, format: { comments: false } });
  if (!result.code) throw new Error(`terser gave nothing for ${file}`);
  return result.code + '\n';
}

let count = 0, before = 0, after = 0;
async function copy(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const a = path.join(src, entry.name), b = path.join(dst, entry.name);
    if (entry.isDirectory()) { await copy(a, b); continue; }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.js' || ext === '.mjs' || ext === '.css' || ext === '.html') {
      const text = await fs.readFile(a, 'utf8');
      const out = ext === '.css' ? stripCss(text) : ext === '.html' ? stripHtml(text) : await stripJs(text, a);
      await fs.writeFile(b, out, 'utf8');
      before += Buffer.byteLength(text); after += Buffer.byteLength(out); count++;
    } else await fs.copyFile(a, b);
  }
}
await copy(path.resolve(from), path.resolve(to));
console.log(`stripped ${count} files: ${(before / 1024).toFixed(0)} KB to ${(after / 1024).toFixed(0)} KB`);
