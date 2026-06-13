const { execSync } = require('child_process');

try {
  const password = "MagicBill2026!+Secure";
  const output = execSync('npx @tauri-apps/cli signer generate', {
    env: { ...process.env, TAURI_PRIVATE_KEY_PASSWORD: password },
    encoding: 'utf-8'
  });
  console.log(output);
} catch (error) {
  console.error('Error generating keys:', error.message);
  if (error.stdout) console.error('stdout:', error.stdout);
  if (error.stderr) console.error('stderr:', error.stderr);
}
