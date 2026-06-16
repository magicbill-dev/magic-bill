const cp = require('child_process');
const fs = require('fs');
const key = fs.readFileSync('tauri.key', 'utf8').trim();
cp.execFileSync('gh', ['secret', 'set', 'TAURI_SIGNING_PRIVATE_KEY', '-b', key]);
