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
    // common single-call patterns
    if (c === 'logout()') return 'data-admin-logout';
    if (c === "openRequestForm()") return 'data-open-request';
    if (c === "closeRequestForm()") return 'data-close-request';
    if (c === 'goApply()') return 'data-go-apply';
    if (c === 'markAllRead()') return 'data-mark-all-read';
    if (c === 'clearAllNotifications()') return 'data-clear-notifications';
    if (c === 'openSettings()') return 'data-open-settings';
    if (c === 'loadNotifications()') return 'data-load-notifications';
    if (c === 'uploadProfilePicture()') return 'data-upload-profile-pic';
    if (c === 'removeProfilePicture()') return 'data-remove-profile-pic';
    if (c === 'enable2FA()') return 'data-enable-2fa';
    if (c === 'downloadTranscript()') return 'data-download-transcript';
    if (c === 'testHealth()') return 'data-test-health';
    if (c === 'testSignup()') return 'data-test-signup';
    if (c === 'clearResults()') return 'data-clear-results';

    // patterns with a single function call that may be prefixed by event.preventDefault();
    const prefVe = c.match(/(?:event\.preventDefault\(\);\s*)?viewEvent\((\d+)\)/);
    if (prefVe) return `data-view-event="${prefVe[1]}"`;
    const prefSd = c.match(/(?:event\.preventDefault\(\);\s*)?selectDate\('([^']+)'\)/);
    if (prefSd) return `data-select-date="${prefSd[1]}"`;
    const prefVr = c.match(/(?:event\.preventDefault\(\);\s*)?viewNotification\((\d+)\)/);
    if (prefVr) return `data-view-notification="${prefVr[1]}"`;
    const prefTr = c.match(/(?:event\.preventDefault\(\);\s*)?toggleRead\((\d+)\)/);
    if (prefTr) return `data-toggle-read="${prefTr[1]}"`;
    const prefDel = c.match(/(?:event\.preventDefault\(\);\s*)?deleteNotification\((\d+)\)/);
    if (prefDel) return `data-delete-notification="${prefDel[1]}"`;
    const switchTab = c.match(/^switchTab\('([^']+)',\s*event\)$/);
    if (switchTab) return `data-switch-tab="${switchTab[1]}"`;
    const navMatch = c.match(/^window\.location\.href\s*=\s*'([^']+)'$/);
    if (navMatch) return `data-navigate="${navMatch[1]}"`;

    // simple remove-parent
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
