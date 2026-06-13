const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'App.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

// Add --primary-fg to root variables
cssContent = cssContent.replace(/--primary: #000000;/, '--primary: #000000;\n  --primary-fg: #ffffff;');
cssContent = cssContent.replace(/--primary: #ffffff;/, '--primary: #ffffff;\n  --primary-fg: #000000;');

// Replace color: white; with color: var(--primary-fg); in App.css
cssContent = cssContent.replace(/color:\s*white;/g, 'color: var(--primary-fg);');

fs.writeFileSync(cssPath, cssContent, 'utf8');

// Now loop through all tsx files and replace color: 'white' with color: 'var(--primary-fg)'
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  content = content.replace(/color:\s*['"]white['"]/g, "color: 'var(--primary-fg)'");

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));

console.log('Primary foreground colors updated successfully.');