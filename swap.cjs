const fs = require('fs');
const content = fs.readFileSync('src/components/Billing.tsx', 'utf8');

const pSidebarStartStr = '      {/* Processing Orders Sidebar */}';
const bMainStartStr = '      <div className="billing-main">';
const bMainEndStr = '      {isQtyPopupOpen && selectedItemForQty && (';

const pStartIdx = content.indexOf(pSidebarStartStr);
const bStartIdx = content.indexOf(bMainStartStr);
const bEndIdx = content.indexOf(bMainEndStr);

if (pStartIdx !== -1 && bStartIdx !== -1 && bEndIdx !== -1) {
    const processingSidebar = content.substring(pStartIdx, bStartIdx);
    const billingMain = content.substring(bStartIdx, bEndIdx);
    
    // Change borderRight to borderLeft for processingSidebar
    const updatedProcessingSidebar = processingSidebar.replace('borderRight:', 'borderLeft:');

    const newContent = content.substring(0, pStartIdx) + billingMain + updatedProcessingSidebar + content.substring(bEndIdx);
    fs.writeFileSync('src/components/Billing.tsx', newContent, 'utf8');
    console.log('Swapped using string indexOf');
} else {
    console.log('Could not find boundaries');
}
