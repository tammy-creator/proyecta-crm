
import fs from 'fs';
const data = JSON.parse(fs.readFileSync('current_unlinked.json', 'utf8'));
const list = Object.entries(data)
  .sort((a,b) => b[1].count - a[1].count)
  .map(([name, info]) => ({
    name,
    count: info.count,
    firstDate: info.date
  }));

console.log(JSON.stringify(list, null, 2));
