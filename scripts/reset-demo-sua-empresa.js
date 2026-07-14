const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const projectRoot = path.resolve(__dirname, '..');
const databasePath = path.join(projectRoot, 'database', 'patio.db');
const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

const categories = [
  { type: 'Carreta', prefix: 'CRT', brand: 'Facchini', model: 'Sider 3 Eixos' },
  { type: 'Cavalo', prefix: 'CVL', brand: 'Mercedes-Benz', model: 'Actros 2651' },
  { type: 'Van', prefix: 'VAN', brand: 'Mercedes-Benz', model: 'Sprinter 417' },
  { type: 'VUC / 3/4', prefix: 'VUC', brand: 'Mercedes-Benz', model: 'Accelo 1016' },
  { type: 'Caminhão Truck', prefix: 'TRK', brand: 'Mercedes-Benz', model: 'Atego 2429' }
];

const statuses = [
  'Aguardando linha',
  'Aguardando abastecimento',
  'Aguardando manutenção',
  'Em manutenção',
  'Funilaria',
  'Borracharia',
  'Aguardando linha',
  'Aguardando abastecimento',
  'Aguardando linha',
  'Aguardando linha'
];

const tablesToClear = [
  'seminovos_service_parts',
  'seminovos_vehicle_photos',
  'seminovos_service_orders',
  'seminovos_vehicles',
  'fleet_preparation_logs',
  'fleet_preparation_vehicle_items',
  'fleet_preparation_vehicles',
  'vehicle_accident_photos',
  'occurrences',
  'swaps',
  'conjuntos',
  'audit_logs',
  'vehicle_catalog',
  'vehicles'
];

function tableExists(table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

const resetDatabase = db.transaction(() => {
  for (const table of tablesToClear) {
    if (tableExists(table)) db.prepare(`DELETE FROM "${table}"`).run();
  }

  db.prepare('UPDATE users SET lastLogin = NULL').run();
  db.prepare('UPDATE users SET passwordHash = ? WHERE username = ?')
    .run(bcrypt.hashSync('SuaEmpresa@2026', 10), 'admin');

  const sequencedTables = tablesToClear.filter(tableExists);
  if (sequencedTables.length && tableExists('sqlite_sequence')) {
    const placeholders = sequencedTables.map(() => '?').join(', ');
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...sequencedTables);
  }

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (
      plate, type, yard, base, baseDestino, manager, chassis, status,
      maintenance, maintenanceCategory, maintenanceProblem, sascarStatus,
      keys, notes, entryTime, updatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCatalog = db.prepare(`
    INSERT INTO vehicle_catalog (
      sourceId, plate, normalizedPlate, chassis, normalizedChassis,
      brand, model, manufactureYear, modelYear, color, type,
      operationalStatus, primaryStatus, unit, operation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPreparation = db.prepare(`
    INSERT INTO fleet_preparation_vehicles (
      patioVehicleId, plate, fleetNumber, vehicleType, model, chassis,
      renavam, invoiceNumber, purchaseDate, purpose, status, notes, updatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparacao', ?, 'system')
  `);

  const insertPreparationItem = db.prepare(`
    INSERT OR IGNORE INTO fleet_preparation_vehicle_items (vehicleId, templateItemId)
    VALUES (?, ?)
  `);

  const activeTemplateIds = db.prepare(
    'SELECT id FROM fleet_preparation_item_templates WHERE active = 1 ORDER BY areaId, sortOrder, id'
  ).all().map(row => row.id);

  categories.forEach((category, categoryIndex) => {
    for (let position = 1; position <= 1; position += 1) {
      const serial = categoryIndex * 10 + position;
      const digit = position % 10;
      const letter = String.fromCharCode(65 + categoryIndex);
      const plate = `${category.prefix}${digit}${letter}${String(position).padStart(2, '0')}`;
      const chassis = `9SU${category.prefix}${String(serial).padStart(11, '0')}`;
      const status = statuses[position - 1];
      const maintenance = ['Aguardando manutenção', 'Em manutenção', 'Funilaria', 'Borracharia'].includes(status) ? 1 : 0;
      const maintenanceCategory = status === 'Funilaria'
        ? 'funilaria'
        : status === 'Borracharia'
          ? 'borracharia'
          : maintenance
            ? 'mecanica'
            : '';
      const yard = position % 2 === 0 ? 'Pátio Bandeirantes' : 'Pátio Jaraguá';
      const entryTime = isoMinutesAgo(serial * 7);
      const notes = `Veículo demonstrativo da categoria ${category.type}.`;

      const result = insertVehicle.run(
        plate,
        category.type,
        yard,
        'Jaraguá-SP (Nacional)',
        position % 3 === 0 ? 'Osasco-SP' : '',
        'Equipe Demonstração',
        chassis,
        status,
        maintenance,
        maintenanceCategory,
        maintenance ? 'Atendimento demonstrativo programado' : '',
        position % 3 === 0 ? 'instalado' : 'pendente',
        position % 2 === 0 ? 'Com chave' : 'Chave na portaria',
        notes,
        entryTime,
        'system'
      );

      insertCatalog.run(
        `DEMO-${String(serial).padStart(3, '0')}`,
        plate,
        plate,
        chassis,
        chassis,
        category.brand,
        category.model,
        '2025',
        '2026',
        position % 2 === 0 ? 'Branco' : 'Prata',
        category.type,
        'Ativo',
        'Disponível',
        'Sua Empresa',
        position % 2 === 0 ? 'Correios' : 'Diversos'
      );

      if (position === 1) {
        const preparation = insertPreparation.run(
          result.lastInsertRowid,
          plate,
          `F${String(categoryIndex + 1).padStart(3, '0')}`,
          category.type,
          `${category.brand} ${category.model}`,
          chassis,
          String(90000000000 + serial),
          `NF-DEMO-${String(categoryIndex + 1).padStart(3, '0')}`,
          '2026-07-01',
          categoryIndex % 2 === 0 ? 'diversos' : 'correios',
          `Modelo demonstrativo único da categoria ${category.type}.`
        );
        for (const templateId of activeTemplateIds) {
          insertPreparationItem.run(preparation.lastInsertRowid, templateId);
        }
      }
    }
  });
});

resetDatabase();

for (const relativePath of [
  path.join('public', 'uploads', 'sinistros'),
  path.join('public', 'uploads', 'seminovos')
]) {
  const uploadPath = path.join(projectRoot, relativePath);
  fs.rmSync(uploadPath, { recursive: true, force: true });
  fs.mkdirSync(uploadPath, { recursive: true });
}

const vehicleCounts = db.prepare(
  "SELECT type, COUNT(*) AS total FROM vehicles WHERE COALESCE(status, '') <> 'Liberado' GROUP BY type ORDER BY type"
).all();
const preparationCount = db.prepare('SELECT COUNT(*) AS total FROM fleet_preparation_vehicles').get().total;
const catalogCount = db.prepare('SELECT COUNT(*) AS total FROM vehicle_catalog').get().total;

console.log('Base demonstrativa Sua Empresa criada com sucesso.');
console.table(vehicleCounts);
console.log(`Catálogo: ${catalogCount} veículos`);
console.log(`Preparação: ${preparationCount} veículos (um por categoria)`);

db.close();
