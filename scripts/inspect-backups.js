const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const backupsDir = path.join(workspaceRoot, 'backups');

function listJsonBackups(targetDir) {
    if (!fs.existsSync(targetDir)) return [];
    return fs.readdirSync(targetDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => path.join(targetDir, entry.name))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function getArrayLength(value) {
    return Array.isArray(value) ? value.length : 0;
}

function resolveSwaps(payload) {
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.swaps)) return payload.swaps;

    const merged = [];
    if (Array.isArray(payload.trocas)) merged.push(...payload.trocas);
    if (Array.isArray(payload.emprestimos)) merged.push(...payload.emprestimos);
    if (Array.isArray(payload.trocasEEmprestimos)) merged.push(...payload.trocasEEmprestimos);
    return merged;
}

function resolveConjuntos(payload) {
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.conjuntos)) return payload.conjuntos;

    const merged = [];
    if (Array.isArray(payload.conjuntosMontados)) merged.push(...payload.conjuntosMontados);
    if (Array.isArray(payload.mountedSets)) merged.push(...payload.mountedSets);
    return merged;
}

function resolveSeminovos(payload) {
    if (!payload || typeof payload !== 'object') {
        return { vehicles: [], serviceOrders: [] };
    }

    if (payload.seminovos && typeof payload.seminovos === 'object') {
        return {
            vehicles: Array.isArray(payload.seminovos.vehicles) ? payload.seminovos.vehicles : [],
            serviceOrders: Array.isArray(payload.seminovos.serviceOrders) ? payload.seminovos.serviceOrders : []
        };
    }

    return {
        vehicles: Array.isArray(payload.seminovosVehicles) ? payload.seminovosVehicles : [],
        serviceOrders: Array.isArray(payload.seminovosServiceOrders)
            ? payload.seminovosServiceOrders
            : (Array.isArray(payload.seminovosOrders) ? payload.seminovosOrders : [])
    };
}

function sumNestedArrayLength(records, fieldNames) {
    if (!Array.isArray(records)) return 0;

    return records.reduce((total, record) => {
        if (!record || typeof record !== 'object') return total;

        for (const fieldName of fieldNames) {
            if (Array.isArray(record[fieldName])) {
                return total + record[fieldName].length;
            }
        }

        return total;
    }, 0);
}

function inspectBackupFile(filePath) {
    const stat = fs.statSync(filePath);
    const base = {
        file: path.basename(filePath),
        path: filePath,
        sizeBytes: stat.size,
        lastModified: stat.mtime.toISOString()
    };

    try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
        const swaps = resolveSwaps(payload);
        const conjuntos = resolveConjuntos(payload);
        const seminovos = resolveSeminovos(payload);

        return {
            ...base,
            status: 'ok',
            exportedAt: payload.exportedAt || payload.seminovos?.exportedAt || null,
            version: payload.version || payload.seminovos?.version || null,
            vehicles: getArrayLength(vehicles),
            swaps: getArrayLength(swaps),
            conjuntos: getArrayLength(conjuntos),
            accidentPhotos: sumNestedArrayLength(vehicles, ['accidentPhotos', 'accidentphotos', 'sinistroPhotos', 'sinistrophotos', 'fotosSinistro']),
            seminovosVehicles: getArrayLength(seminovos.vehicles),
            seminovosOrders: getArrayLength(seminovos.serviceOrders),
            seminovosPhotos: sumNestedArrayLength(seminovos.vehicles, ['photos']),
            seminovosParts: sumNestedArrayLength(seminovos.serviceOrders, ['parts'])
        };
    } catch (error) {
        return {
            ...base,
            status: 'error',
            error: error.message || String(error)
        };
    }
}

function buildSummary(files) {
    const successful = files.filter((file) => file.status === 'ok');

    return {
        scannedAt: new Date().toISOString(),
        backupsFound: files.length,
        validBackups: successful.length,
        invalidBackups: files.length - successful.length,
        totals: successful.reduce((accumulator, file) => {
            accumulator.vehicles += file.vehicles;
            accumulator.swaps += file.swaps;
            accumulator.conjuntos += file.conjuntos;
            accumulator.accidentPhotos += file.accidentPhotos;
            accumulator.seminovosVehicles += file.seminovosVehicles;
            accumulator.seminovosOrders += file.seminovosOrders;
            accumulator.seminovosPhotos += file.seminovosPhotos;
            accumulator.seminovosParts += file.seminovosParts;
            return accumulator;
        }, {
            vehicles: 0,
            swaps: 0,
            conjuntos: 0,
            accidentPhotos: 0,
            seminovosVehicles: 0,
            seminovosOrders: 0,
            seminovosPhotos: 0,
            seminovosParts: 0
        }),
        files
    };
}

function main() {
    const files = listJsonBackups(backupsDir).map(inspectBackupFile);
    console.log(JSON.stringify(buildSummary(files), null, 2));
}

main();
