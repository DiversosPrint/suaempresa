const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const snapshotsRoot = path.join(workspaceRoot, 'backups', 'snapshots');

function listSnapshotDirectories(targetDir) {
    if (!fs.existsSync(targetDir)) return [];

    return fs.readdirSync(targetDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(targetDir, entry.name))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function inspectSnapshot(snapshotPath) {
    const manifestPath = path.join(snapshotPath, 'manifest.json');
    const stat = fs.statSync(snapshotPath);
    const base = {
        snapshotName: path.basename(snapshotPath),
        snapshotPath,
        lastModified: stat.mtime.toISOString(),
        hasManifest: fs.existsSync(manifestPath)
    };

    if (!fs.existsSync(manifestPath)) {
        return {
            ...base,
            status: 'missing-manifest'
        };
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return {
            ...base,
            status: 'ok',
            createdAt: manifest.createdAt || null,
            sqliteFiles: manifest.sqlite?.totalFiles || 0,
            backupJsonFiles: manifest.backupJsons?.totalFiles || 0,
            uploadFiles: manifest.uploads?.fileCount || 0,
            uploadDirectories: manifest.uploads?.directoryCount || 0,
            uploadBytes: manifest.uploads?.totalBytes || 0
        };
    } catch (error) {
        return {
            ...base,
            status: 'error',
            error: error.message || String(error)
        };
    }
}

function main() {
    const snapshots = listSnapshotDirectories(snapshotsRoot).map(inspectSnapshot);

    console.log(JSON.stringify({
        scannedAt: new Date().toISOString(),
        snapshotsRoot,
        totalSnapshots: snapshots.length,
        snapshots
    }, null, 2));
}

main();
