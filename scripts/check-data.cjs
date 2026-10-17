// Проверка использует те же правила, что и загрузчик игры. Зависимости не нужны.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const GameData = vm.runInNewContext(fs.readFileSync(path.join(root, 'js/campaign-data.js'), 'utf8') + '; GameData');
try {
  const campaigns = GameData.validateCatalog(JSON.parse(fs.readFileSync(path.join(root, 'data/campaigns.json'), 'utf8')));
  let total = 0;
  for (const campaign of campaigns) {
    const events = GameData.validateEvents(JSON.parse(fs.readFileSync(path.join(root, campaign.eventsFile), 'utf8')), campaign.id);
    console.log(`${campaign.id}: ${events.length} событий, ${events.filter(e => e.condition).length} условных`);
    total += events.length;
  }
  console.log(`OK: ${campaigns.length} кампаний, ${total} событий`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
