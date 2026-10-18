// Read runtime code from the single-file game, or other files from the project.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

module.exports = function read(file) {
  const match = /^js\/([a-z0-9-]+)\.js$/.exec(file);
  if (!match) return fs.readFileSync(path.join(root, file), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const pattern = new RegExp(`<script\\b(?=[^>]*\\bid\\s*=\\s*["']game-${match[1]}["'])[^>]*>([\\s\\S]*?)<\\/script\\s*>`, 'i');
  const section = pattern.exec(html);
  if (!section) throw new Error(`Missing inline runtime section game-${match[1]}`);
  return section[1];
};
