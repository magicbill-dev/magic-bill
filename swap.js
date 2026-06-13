const fs = require('fs');
const content = fs.readFileSync('src/components/Billing.tsx', 'utf8');
const lines = content.split('\n');

const pSidebarStart = 1381;
const pSidebarEnd = 1466;

const bMainStart = 1467;
const bMainEnd = 1502;

const processingSidebar = lines.slice(pSidebarStart, pSidebarEnd).join('\n').replace('borderRight: \'1px solid var(--border-color)\'', 'borderLeft: \'1px solid var(--border-color)\'');
const billingMain = lines.slice(bMainStart, bMainEnd).join('\n');

const oldBlock = lines.slice(pSidebarStart, bMainEnd).join('\n');
const newBlock = billingMain + '\n\n' + processingSidebar;

fs.writeFileSync('src/components/Billing.tsx', content.replace(oldBlock, newBlock));
console.log('Swapped successfully');

