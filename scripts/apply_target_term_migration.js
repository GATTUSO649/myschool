const { query } = require('../config/db');

(async () => {
  try {
    const rows = await query("SHOW COLUMNS FROM finance_documents LIKE 'target_term'");
    console.log('target_term exists:', rows.length > 0);
    if (rows.length === 0) {
      console.log('Adding target_term column...');
      await query("ALTER TABLE finance_documents ADD COLUMN target_term VARCHAR(40) NULL AFTER target_class");
      try {
        await query("CREATE INDEX idx_finance_documents_target_term ON finance_documents(target_term)");
      } catch (e) {
        if (!/Duplicate/.test(e.message)) throw e;
      }
      console.log('Migration complete');
    }
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e.message || e);
    process.exit(1);
  }
})();
