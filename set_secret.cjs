const cp = require('child_process');
const fs = require('fs');
const key = fs.readFileSync('temp_priv_no_bom.txt', 'utf8').trim();
cp.execSync('gh secret set TAURI_SIGNING_PRIVATE_KEY -b "' + key + '"');
