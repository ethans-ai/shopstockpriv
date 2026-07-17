// Dev-only: populate the database with realistic sample data.
// Usage: node scripts/seed-demo.js
const config = require('../src/config');
const db = require('../src/db');

const cfg = config.load();
db.open(cfg.dataDir);

const locations = require('../src/services/locations');
const items = require('../src/services/items');
const checkouts = require('../src/services/checkouts');

const existing = db.get().prepare('SELECT COUNT(*) AS n FROM items').get().n;
if (existing > 0) {
  console.log(`Database already has ${existing} items — refusing to seed on top. Delete data/shopstock.db first if you want a fresh demo.`);
  process.exit(1);
}

// Locations
const mainStock = locations.create({ name: 'Main Stockroom', kind: 'room' });
const cellWall = locations.create({ name: 'Dyno Cell 2 Wall', kind: 'room' });
const harnessBench = locations.create({ name: 'Harness Bench', kind: 'room' });

const cabA = locations.create({ name: 'Cabinet A', kind: 'cabinet', parent_id: mainStock });
const shelfA1 = locations.create({ name: 'Shelf A1', kind: 'shelf', parent_id: cabA });
const shelfA2 = locations.create({ name: 'Shelf A2', kind: 'shelf', parent_id: cabA });
const binA1_1 = locations.create({ name: 'Bin 1', kind: 'bin', parent_id: shelfA1 });
const binA1_2 = locations.create({ name: 'Bin 2', kind: 'bin', parent_id: shelfA1 });

const drawerCab = locations.create({ name: 'Connector Drawer Cabinet', kind: 'cabinet', parent_id: harnessBench });
const drawerDT = locations.create({ name: 'Drawer 1 — DT series', kind: 'drawer', parent_id: drawerCab });
const drawerDTM = locations.create({ name: 'Drawer 2 — DTM series', kind: 'drawer', parent_id: drawerCab });

const toolCrib = locations.create({ name: 'Tool Crib', kind: 'room' });
const calShelf = locations.create({ name: 'Calibrated Equipment Shelf', kind: 'shelf', parent_id: toolCrib });

const catId = name => db.get().prepare('SELECT id FROM categories WHERE name = ?').get(name).id;

// Stock items
const stock = [
  { name: 'AN-6 straight swivel hose end', category_id: catId('Plumbing & Fittings'), location_id: binA1_1, quantity: 14, unit: 'ea', low_stock_threshold: 5, manufacturer: 'Fragola', part_number: '496106-BL', vendor_links_text: 'Summit Racing: https://www.summitracing.com/parts/fra-496106-bl', attrs_text: 'Thread: 9/16-18\nAngle: straight' },
  { name: 'AN-6 90° swivel hose end', category_id: catId('Plumbing & Fittings'), location_id: binA1_1, quantity: 3, unit: 'ea', low_stock_threshold: 4, manufacturer: 'Fragola', part_number: '496206-BL', vendor_links_text: 'Summit Racing: https://www.summitracing.com/parts/fra-496206-bl' },
  { name: '1/4 NPT to AN-6 adapter', category_id: catId('Plumbing & Fittings'), location_id: binA1_2, quantity: 9, unit: 'ea', low_stock_threshold: 4, part_number: 'FBM2101' },
  { name: 'Deutsch DT 2-pin receptacle', category_id: catId('Wiring / Harness'), location_id: drawerDT, quantity: 42, unit: 'ea', low_stock_threshold: 15, manufacturer: 'TE / Deutsch', part_number: 'DT04-2P', vendor_links_text: 'Mouser: https://www.mouser.com/ProductDetail/DT04-2P\nDigi-Key: https://www.digikey.com/en/products/detail/DT04-2P', attrs_text: 'Series: DT\nPins: 2' },
  { name: 'Deutsch DT 2-pin plug', category_id: catId('Wiring / Harness'), location_id: drawerDT, quantity: 11, unit: 'ea', low_stock_threshold: 15, manufacturer: 'TE / Deutsch', part_number: 'DT06-2S', vendor_links_text: 'Mouser: https://www.mouser.com/ProductDetail/DT06-2S', attrs_text: 'Series: DT\nPins: 2' },
  { name: 'DTM solid contact, size 20, 16-18 AWG', category_id: catId('Wiring / Harness'), location_id: drawerDTM, quantity: 180, unit: 'ea', low_stock_threshold: 50, manufacturer: 'TE / Deutsch', part_number: '0462-201-20141', attrs_text: 'Gauge: 16-18 AWG' },
  { name: '3:1 adhesive shrink tube, 1/2", black', category_id: catId('Wiring / Harness'), location_id: harnessBench, quantity: 2.5, unit: 'm', low_stock_threshold: 3, part_number: 'SHRK-12-BLK' },
  { name: 'V-band clamp 3" (exhaust)', category_id: catId('Exhaust'), location_id: shelfA2, quantity: 6, unit: 'ea', low_stock_threshold: 2, manufacturer: 'Vibrant', part_number: '1491C' },
  { name: 'Exhaust gasket, 3-bolt 2.5"', category_id: catId('Exhaust'), location_id: shelfA2, quantity: 1, unit: 'ea', low_stock_threshold: 3, part_number: 'REM-GSK-25' },
  { name: 'Nitrile gloves, L', category_id: catId('Consumable Tools'), location_id: mainStock, quantity: 4, unit: 'box', low_stock_threshold: 2 },
  { name: 'M8x1.25 flange nuts', category_id: catId('Fasteners'), location_id: binA1_2, quantity: 65, unit: 'ea', low_stock_threshold: 20 }
];
for (const s of stock) items.create({ ...s, item_type: 'stock' }, 'seed');

// Assets
const assets = [
  { name: 'Fluke 87V multimeter', category_id: catId('Test Equipment'), location_id: calShelf, manufacturer: 'Fluke', part_number: '87V', attrs_text: 'Cal interval: 12 mo\nAsset tag: TE-0042' },
  { name: 'DTM crimper (HDT-48-00)', category_id: catId('Test Equipment'), location_id: harnessBench, manufacturer: 'Deutsch', part_number: 'HDT-48-00' },
  { name: 'Torque wrench 3/8" 5-75 ft-lb', category_id: catId('Test Equipment'), location_id: toolCrib, manufacturer: 'CDI', part_number: '752MFRMH', attrs_text: 'Cal interval: 12 mo\nAsset tag: TE-0017' },
  { name: 'Thermocouple calibrator', category_id: catId('Test Equipment'), location_id: calShelf, manufacturer: 'Omega', part_number: 'CL3515R', attrs_text: 'Asset tag: TE-0063' }
];
const assetIds = assets.map(a => items.create({ ...a, item_type: 'asset', quantity: 1 }, 'seed'));

// One open checkout for demo
checkouts.checkout(assetIds[0], 'Alex', 'Cell 2 wiring debug');

console.log('Seeded demo data:');
console.log(`  ${db.get().prepare('SELECT COUNT(*) AS n FROM locations').get().n} locations`);
console.log(`  ${db.get().prepare('SELECT COUNT(*) AS n FROM items').get().n} items`);
console.log('  1 open checkout (Fluke 87V → Alex)');
