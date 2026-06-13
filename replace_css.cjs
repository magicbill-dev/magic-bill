const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'App.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

// Replace Root Variables
cssContent = cssContent.replace(/:root\s*{[^}]*}/, `:root {
  --primary: #000000;
  --primary-hover: #333333;
  --bg-light: #f5f5f5;
  --bg-white: #ffffff;
  --text-primary: #000000;
  --text-secondary: #555555;
  --border-color: #dddddd;
  --danger: #000000;
  --sidebar-width: 250px;
}`);

cssContent = cssContent.replace(/\[data-theme="dark"\]\s*{[^}]*}/, `[data-theme="dark"] {
  --primary: #ffffff;
  --primary-hover: #cccccc;
  --bg-light: #000000;
  --bg-white: #111111;
  --text-primary: #ffffff;
  --text-secondary: #aaaaaa;
  --border-color: #333333;
  --danger: #ffffff;
}`);

// Replace specific classes for stats
cssContent = cssContent.replace(/\.text-green\s*{[^}]*}/, '.text-green { color: var(--text-primary); }');
cssContent = cssContent.replace(/\.text-blue\s*{[^}]*}/, '.text-blue { color: var(--text-primary); }');
cssContent = cssContent.replace(/\.text-orange\s*{[^}]*}/, '.text-orange { color: var(--text-primary); }');
cssContent = cssContent.replace(/\.text-purple\s*{[^}]*}/, '.text-purple { color: var(--text-primary); }');

// Replace random other hex colors with CSS variables
cssContent = cssContent.replace(/#eff6ff/g, 'var(--bg-light)');
cssContent = cssContent.replace(/#fee2e2/g, 'var(--bg-light)');
cssContent = cssContent.replace(/#e5e7eb/g, 'var(--border-color)');

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('App.css updated successfully.');
