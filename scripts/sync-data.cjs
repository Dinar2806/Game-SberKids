// Refresh the offline snapshot without changing the source JSON configuration.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const snapshot = {};

function collect(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = directory + '/' + entry.name;
    if (entry.isDirectory()) collect(relative);
    else if (entry.isFile() && entry.name.endsWith('.json')) {
      snapshot['./' + relative] = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    }
  }
}
collect('data');

const file = path.join(root, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const marker = /\/\/ BEGIN BUILTIN_JSON_DATA\n[\s\S]*?\n\/\/ END BUILTIN_JSON_DATA/g;
if ((html.match(marker) || []).length !== 1) throw new Error('Expected one built-in JSON snapshot in index.html');
const json = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const replacement = '// BEGIN BUILTIN_JSON_DATA\nwindow.BUILTIN_JSON_DATA = ' + json + ';\n// END BUILTIN_JSON_DATA';
fs.writeFileSync(file, html.replace(marker, () => replacement));
console.log('Updated index.html with ' + Object.keys(snapshot).length + ' JSON configurations.');
