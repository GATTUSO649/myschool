const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.html?$/.test(entry.name)) processFile(full);
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace common inline onclick handlers with data- attributes
  content = content.replace(/onclick\s*=\s*"([^"]*)"/g, (m, code) => {
    const c = code.trim();
    // exact matches
    if (c === 'logout()') return 'data-admin-logout';
    const cm = c.match(/^closeModal\('([^']+)'\)$/);
    if (cm) return `data-close-modal="${cm[1]}"`;
    if (c.includes("student-sidebar") && c.includes('toggle')) return 'data-toggle-sidebar';
    const sd = c.match(/^selectDate\('([^']+)'\)$/);
    if (sd) return `data-select-date="${sd[1]}"`;
    const ve = c.match(/viewEvent\((\d+)\)/);
    if (ve) return `data-view-event="${ve[1]}"`;
    const ot = c.match(/^openTopic\('([^']+)'\)$/);
    if (ot) return `data-open-topic="${ot[1]}"`;
    if (c.includes('this.parentElement.remove()')) return 'data-remove-parent';

    // No mapping — keep original to avoid breaking unknown handlers
    return m;
  });

  // Ensure shared bindings script is included before </body>
  if (!/shared-bindings\.js/.test(content)) {
    content = content.replace(/<\/body>/i, '  <script src="shared-bindings.js"></script>\n</body>');
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched: ${path.relative(process.cwd(), filePath)}`);
  }
}

if (require.main === module) {
  console.log('Scanning frontend HTML files for inline onclick handlers...');
  walk(FRONTEND_DIR);
  console.log('Done. Review changes and run git diff to inspect edits.');
}

module.exports = { processFile, walk };
