const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

function decodeHtml(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
        .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCharCode(parseInt(value, 16)));
}

function stripTags(text) {
    return decodeHtml(String(text || '').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function canonicalText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeHeader(value) {
    return canonicalText(value).replace(/\s+/g, '_');
}

function normalizePlateValue(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizePlateForComparison(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

function normalizeChassis(value) {
    return String(value || '').trim().toUpperCase();
}

function cleanValue(value) {
    const text = String(value || '').trim();
    if (!text || text === '.' || text === '-' || text === '0000-00-00') return '';
    return text;
}

function parseHtmlTable(filePath) {
    const html = fs.readFileSync(filePath, 'latin1');
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(match => match[1]);
    if (rows.length < 3) {
        throw new Error('Tabela HTML inválida: cabeçalho não encontrado.');
    }

    const parseCells = (rowHtml) => Array.from(rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(match => stripTags(match[1]));
    const headers = parseCells(rows[1]).map(normalizeHeader);
    const records = [];

    for (const rowHtml of rows.slice(2)) {
        const cells = parseCells(rowHtml);
        if (cells.length === 0) continue;
        const row = {};
        headers.forEach((header, index) => {
            row[header] = cells[index] || '';
        });
        records.push(row);
    }

    return records;
}

function resolveHtmlTableSource(filePath) {
    const html = fs.readFileSync(filePath, 'latin1');
    const sheetRefMatch = html.match(/(?:WorksheetSource\s+HRef|frame\s+src)\s*=\s*"([^"]+sheet\d+\.htm)"/i);
    if (!sheetRefMatch) {
        return { filePath, html };
    }

    const resolvedSheetPath = path.resolve(path.dirname(filePath), sheetRefMatch[1].replace(/\//g, path.sep));
    if (!fs.existsSync(resolvedSheetPath)) {
        throw new Error(`Arquivo da planilha referenciado nao encontrado: ${resolvedSheetPath}`);
    }

    return {
        filePath: resolvedSheetPath,
        html: fs.readFileSync(resolvedSheetPath, 'latin1')
    };
}

function isCompoundBinaryExcel(filePath) {
    const header = fs.readFileSync(filePath).subarray(0, 8);
    return header.length === 8
        && header[0] === 0xD0
        && header[1] === 0xCF
        && header[2] === 0x11
        && header[3] === 0xE0
        && header[4] === 0xA1
        && header[5] === 0xB1
        && header[6] === 0x1A
        && header[7] === 0xE1;
}

function escapePowerShellString(value) {
    return String(value || '').replace(/'/g, "''");
}

function getOleDbExtendedProperties(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return extension === '.xlsx' || extension === '.xlsm'
        ? 'Excel 12.0 Xml;HDR=Yes;IMEX=1'
        : 'Excel 8.0;HDR=Yes;IMEX=1';
}

function runPowerShellJson(script) {
    const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        {
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024
        }
    );

    if (result.status !== 0) {
        throw new Error(
            (result.stderr || result.stdout || 'Falha ao ler planilha via PowerShell/OLEDB.').trim()
        );
    }

    const output = String(result.stdout || '').trim();
    if (!output) {
        throw new Error('PowerShell/OLEDB retornou resposta vazia.');
    }

    return JSON.parse(output);
}

function isLogicalHeaderRow(row) {
    const values = Object.values(row || {}).map(value => canonicalText(value));
    return values.includes('placa') && values.includes('chassi') && values.includes('modelo');
}

function buildLogicalHeaders(headerRow) {
    const seen = new Set();
    return Object.keys(headerRow).map((sourceKey, index) => {
        const candidate = normalizeHeader(cleanValue(headerRow[sourceKey]) || sourceKey) || `column_${index + 1}`;
        let unique = candidate;
        let suffix = 2;
        while (seen.has(unique)) {
            unique = `${candidate}_${suffix}`;
            suffix += 1;
        }
        seen.add(unique);
        return { sourceKey, header: unique };
    });
}

function normalizeOleDbRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];

    if (isLogicalHeaderRow(rows[0])) {
        const logicalHeaders = buildLogicalHeaders(rows[0]);
        return rows.slice(1).map((row) => {
            const normalizedRow = {};
            logicalHeaders.forEach(({ sourceKey, header }) => {
                normalizedRow[header] = row?.[sourceKey] ?? '';
            });
            return normalizedRow;
        });
    }

    return rows.map((row) => {
        const normalizedRow = {};
        Object.keys(row || {}).forEach((key) => {
            normalizedRow[normalizeHeader(key) || key] = row[key];
        });
        return normalizedRow;
    });
}

function parseBinaryExcelTable(filePath) {
    const workbookPath = escapePowerShellString(filePath);
    const extendedProperties = escapePowerShellString(getOleDbExtendedProperties(filePath));
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$workbookPath = '${workbookPath}'
$extendedProperties = '${extendedProperties}'
$connection = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$workbookPath;Extended Properties='$extendedProperties'")
$connection.Open()
$schema = $connection.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, $null)
$sheetName = $schema | Where-Object { $_.TABLE_NAME -like '*$' } | Select-Object -ExpandProperty TABLE_NAME -First 1
if (-not $sheetName) { throw 'Nenhuma aba de planilha encontrada no arquivo Excel.' }
$command = $connection.CreateCommand()
$command.CommandText = "SELECT * FROM [$sheetName]"
$adapter = New-Object System.Data.OleDb.OleDbDataAdapter($command)
$table = New-Object System.Data.DataTable
[void]$adapter.Fill($table)
$connection.Close()
$rows = foreach ($row in $table.Rows) {
    $object = [ordered]@{}
    foreach ($column in $table.Columns) {
        $value = $row[$column.ColumnName]
        if ($value -is [System.DBNull]) {
            $object[$column.ColumnName] = $null
        } else {
            $object[$column.ColumnName] = [string]$value
        }
    }
    [pscustomobject]$object
}
[pscustomobject]@{
    sheetName = $sheetName
    rows = @($rows)
} | ConvertTo-Json -Depth 4 -Compress
`;

    const payload = runPowerShellJson(script);
    return {
        mode: 'oledb',
        sheetName: payload.sheetName || '',
        records: normalizeOleDbRows(Array.isArray(payload.rows) ? payload.rows : [])
    };
}

function loadCatalogRows(filePath) {
    if (isCompoundBinaryExcel(filePath)) {
        return parseBinaryExcelTable(filePath);
    }

    const htmlSource = resolveHtmlTableSource(filePath);
    return {
        mode: 'html',
        sheetName: path.basename(htmlSource.filePath),
        records: parseHtmlTable(htmlSource.filePath)
    };
}

function normalizeCatalogRow(row) {
    const plate = normalizePlateValue(cleanValue(row.placa));
    if (!plate) return null;

    const auxPlate = normalizePlateValue(cleanValue(row.placa_auxiliar));
    const linkedPlate = normalizePlateValue(cleanValue(row.placa_vinculada));
    const chassis = normalizeChassis(cleanValue(row.chassi));

    return {
        sourceId: cleanValue(row.id),
        plate,
        normalizedPlate: normalizePlateForComparison(plate),
        auxPlate,
        normalizedAuxPlate: normalizePlateForComparison(auxPlate),
        linkedPlate,
        normalizedLinkedPlate: normalizePlateForComparison(linkedPlate),
        renavam: cleanValue(row.renavam),
        chassis,
        normalizedChassis: normalizeChassis(chassis),
        brand: cleanValue(row.marca),
        model: cleanValue(row.modelo),
        manufactureYear: cleanValue(row.ano_fabricacao),
        modelYear: cleanValue(row.ano_modelo),
        color: cleanValue(row.cor),
        axleConfig: cleanValue(row.eixos),
        type: cleanValue(row.tipo),
        operationalStatus: cleanValue(row.status_operacional),
        primaryStatus: cleanValue(row.status_principal),
        insurance: cleanValue(row.seguro),
        supportPoint: cleanValue(row.ponto_de_apoio),
        unit: cleanValue(row.unidade),
        operation: cleanValue(row.operacao),
        odometer: cleanValue(row.odometro)
    };
}

function ensureCatalogTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS vehicle_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sourceId TEXT DEFAULT '',
            plate TEXT NOT NULL,
            normalizedPlate TEXT UNIQUE NOT NULL,
            auxPlate TEXT DEFAULT '',
            normalizedAuxPlate TEXT DEFAULT '',
            linkedPlate TEXT DEFAULT '',
            normalizedLinkedPlate TEXT DEFAULT '',
            renavam TEXT DEFAULT '',
            chassis TEXT DEFAULT '',
            normalizedChassis TEXT DEFAULT '',
            brand TEXT DEFAULT '',
            model TEXT DEFAULT '',
            manufactureYear TEXT DEFAULT '',
            modelYear TEXT DEFAULT '',
            color TEXT DEFAULT '',
            axleConfig TEXT DEFAULT '',
            type TEXT DEFAULT '',
            operationalStatus TEXT DEFAULT '',
            primaryStatus TEXT DEFAULT '',
            insurance TEXT DEFAULT '',
            supportPoint TEXT DEFAULT '',
            unit TEXT DEFAULT '',
            operation TEXT DEFAULT '',
            odometer TEXT DEFAULT '',
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        throw new Error('Uso: node scripts/import-vehicle-catalog-xls.js <arquivo.xls>');
    }

    const resolvedFile = path.resolve(filePath);
    if (!fs.existsSync(resolvedFile)) {
        throw new Error(`Arquivo não encontrado: ${resolvedFile}`);
    }

    const dbPath = path.resolve(__dirname, '..', 'database', 'patio.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    ensureCatalogTable(db);

    const parsedCatalog = loadCatalogRows(resolvedFile);
    const rawRows = parsedCatalog.records;
    const catalogRows = rawRows.map(normalizeCatalogRow).filter(Boolean);
    const uniqueRows = Array.from(new Map(catalogRows.map(row => [row.normalizedPlate, row])).values());
    const now = new Date().toISOString();

    const replaceCatalog = db.transaction(() => {
        db.prepare('DELETE FROM vehicle_catalog').run();
        const insert = db.prepare(`
            INSERT INTO vehicle_catalog (
                sourceId, plate, normalizedPlate, auxPlate, normalizedAuxPlate, linkedPlate, normalizedLinkedPlate,
                renavam, chassis, normalizedChassis, brand, model, manufactureYear, modelYear, color, axleConfig,
                type, operationalStatus, primaryStatus, insurance, supportPoint, unit, operation, odometer, updatedAt
            ) VALUES (
                @sourceId, @plate, @normalizedPlate, @auxPlate, @normalizedAuxPlate, @linkedPlate, @normalizedLinkedPlate,
                @renavam, @chassis, @normalizedChassis, @brand, @model, @manufactureYear, @modelYear, @color, @axleConfig,
                @type, @operationalStatus, @primaryStatus, @insurance, @supportPoint, @unit, @operation, @odometer, @updatedAt
            )
        `);
        for (const row of uniqueRows) {
            insert.run({ ...row, updatedAt: now });
        }
    });

    replaceCatalog();
    const total = db.prepare('SELECT COUNT(*) AS count FROM vehicle_catalog').get().count;
    db.close();

    console.log(JSON.stringify({
        sourceFile: resolvedFile,
        sourceMode: parsedCatalog.mode,
        sourceSheet: parsedCatalog.sheetName || null,
        rawRows: rawRows.length,
        importedRows: catalogRows.length,
        uniqueRows: uniqueRows.length,
        totalInCatalog: total,
        dbPath
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
}
