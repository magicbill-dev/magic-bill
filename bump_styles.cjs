const fs = require('fs');

// 1. Update App.css
let css = fs.readFileSync('src/App.css', 'utf8');

// Bump all rem font sizes by 0.15rem
css = css.replace(/font-size:\s*([\d.]+)rem/g, (match, p1) => {
  let val = parseFloat(p1);
  val = val + 0.15;
  return 'font-size: ' + Number(val.toFixed(2)) + 'rem';
});

// Make light theme background even brighter
css = css.replace(/--bg-light:\s*#f3f4f6;/g, '--bg-light: #f8fafc;');
css = css.replace(/--active-bg:\s*#e5e7eb;/g, '--active-bg: #f1f5f9;');

// Change buttons and some controls to use pure white instead of light gray
css = css.replace(/\.pay-btn \{[\s\S]*?background:\s*var\(--bg-light\);/g, match => match.replace('var(--bg-light)', 'var(--bg-white)'));
css = css.replace(/\.qty-controls \{[\s\S]*?background:\s*var\(--bg-light\);/g, match => match.replace('var(--bg-light)', 'var(--bg-white)'));

fs.writeFileSync('src/App.css', css);

// 2. Update Billing.tsx
let tsx = fs.readFileSync('src/components/Billing.tsx', 'utf8');

// Bump inline style font sizes
tsx = tsx.replace(/fontSize:\s*'0\.75rem'/g, "fontSize: '0.9rem'");
tsx = tsx.replace(/fontSize:\s*'0\.85rem'/g, "fontSize: '1rem'");
tsx = tsx.replace(/fontSize:\s*'0\.7rem'/g, "fontSize: '0.85rem'");
tsx = tsx.replace(/fontSize:\s*'0\.8rem'/g, "fontSize: '0.95rem'");
tsx = tsx.replace(/fontSize:\s*'0\.85rem'/g, "fontSize: '1rem'");

// Lighten button inline backgrounds
tsx = tsx.replace(/background:\s*'var\(--bg-light\)'/g, "background: 'var(--bg-white)'");
tsx = tsx.replace(/'var\(--bg-light\)'/g, "'var(--bg-white)'");

fs.writeFileSync('src/components/Billing.tsx', tsx);
console.log('Styles bumped successfully.');
