const fs = require('fs');
const d = JSON.parse(fs.readFileSync('lint-results.json', 'utf-8'));
d.filter(f => f.errorCount > 0).forEach(f => {
  console.log('\n' + f.filePath);
  f.messages.filter(m => m.severity === 2).forEach(m => console.log(`  Line ${m.line}: ${m.message}`));
});
