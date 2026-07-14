const fs = require('fs');
const path = require('path');

function ensureDirectoryExists(targetPath) {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
}

function formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function sanitizeLabel(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');
}

function toRelative(workspaceRoot, targetPath) {
    return path.relative(workspaceRoot, targetPath).replace(/\\/g, '/');
}

function summarizeTree(targetPath) {
    if (!fs.existsSync(targetPath)) {
        return { exists: false, fileCount: 0, directoryCount: 0, totalBytes: 0 };
    }

    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
        return { exists: true, fileCount: 1, directoryCount: 0, totalBytes: stat.size };
    }

    let fileCount = 0;
    let directoryCount = 0;
    let totalBytes = 0;

    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
        const entryPath = path.join(targetPath, entry.name);
        if (entry.isDirectory()) {
            directoryCount += 1;
            const nested = summarizeTree(entryPath);
            fileCount += nested.fileCount;
            directoryCount += nested.directoryCount;
            totalBytes += nested.totalBytes;
            continue;
        }

        if (entry.isFile()) {
            fileCount += 1;
            totalBytes += fs.statSync(entryPath).size;
        }
    }

    return { exists: true, fileCount, directoryCount, totalBytes };
}

function copyFileIfPresent(sourcePath, targetDir, workspaceRoot) {
    if (!fs.existsSync(sourcePath)) return null;

    ensureDirectoryExists(targetDir);
    const targetPath = path.join(targetDir, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, targetPath);
    const stat = fs.statSync(targetPath);

    return {
        file: path.basename(targetPath),
        source: toRelative(workspaceRoot, sourcePath),
        copiedTo: toRelative(workspaceRoot, targetPath),
        sizeBytes: stat.size
    };
}

function copyJsonBackups(backupsDir, targetDir, workspaceRoot) {
    if (!fs.existsSync(backupsDir)) {
        return [];
    }

    ensureDirectoryExists(targetDir);

    return fs.readdirSync(backupsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const sourcePath = path.join(backupsDir, entry.name);
            const targetPath = path.join(targetDir, entry.name);
            fs.copyFileSync(sourcePath, targetPath);
            const stat = fs.statSync(targetPath);
            return {
                file: entry.name,
                source: toRelative(workspaceRoot, sourcePath),
                copiedTo: toRelative(workspaceRoot, targetPath),
                sizeBytes: stat.size
            };
        })
        .sort((left, right) => right.file.localeCompare(left.file));
}

function createSafetySnapshot({ workspaceRoot, label = '' }) {
    if (!workspaceRoot) {
        throw new Error('workspaceRoot é obrigatório para gerar snapshot');
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const backupsDir = path.join(resolvedWorkspaceRoot, 'backups');
    const snapshotsDir = path.join(backupsDir, 'snapshots');
    const databaseDir = path.join(resolvedWorkspaceRoot, 'database');
    const uploadsDir = path.join(resolvedWorkspaceRoot, 'public', 'uploads');

    const safeLabel = sanitizeLabel(label);
    const timestamp = formatTimestamp(new Date());
    const snapshotName = safeLabel ? `${timestamp}-${safeLabel}` : timestamp;
    const snapshotRoot = path.join(snapshotsDir, snapshotName);

    ensureDirectoryExists(snapshotRoot);

    const databaseTargetDir = path.join(snapshotRoot, 'database');
    const backupJsonTargetDir = path.join(snapshotRoot, 'backup-json');
    const uploadsTargetDir = path.join(snapshotRoot, 'public', 'uploads');

    const copiedDatabaseFiles = [
        copyFileIfPresent(path.join(databaseDir, 'patio.db'), databaseTargetDir, resolvedWorkspaceRoot),
        copyFileIfPresent(path.join(databaseDir, 'patio.db-wal'), databaseTargetDir, resolvedWorkspaceRoot),
        copyFileIfPresent(path.join(databaseDir, 'patio.db-shm'), databaseTargetDir, resolvedWorkspaceRoot)
    ].filter(Boolean);

    let uploadsSummary = { exists: false, fileCount: 0, directoryCount: 0, totalBytes: 0, copiedTo: null };
    if (fs.existsSync(uploadsDir)) {
        fs.cpSync(uploadsDir, uploadsTargetDir, { recursive: true });
        uploadsSummary = {
            ...summarizeTree(uploadsTargetDir),
            copiedTo: toRelative(resolvedWorkspaceRoot, uploadsTargetDir)
        };
    }

    const copiedBackupJsons = copyJsonBackups(backupsDir, backupJsonTargetDir, resolvedWorkspaceRoot);

    const manifest = {
        createdAt: new Date().toISOString(),
        snapshotName,
        snapshotPath: snapshotRoot,
        workspaceRoot: resolvedWorkspaceRoot,
        sqlite: {
            copiedFiles: copiedDatabaseFiles,
            totalFiles: copiedDatabaseFiles.length
        },
        uploads: uploadsSummary,
        backupJsons: {
            copiedFiles: copiedBackupJsons,
            totalFiles: copiedBackupJsons.length
        }
    };

    const manifestPath = path.join(snapshotRoot, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return {
        success: true,
        createdAt: manifest.createdAt,
        snapshotName,
        snapshotPath: snapshotRoot,
        manifestPath,
        sqliteFiles: copiedDatabaseFiles.length,
        uploadFiles: uploadsSummary.fileCount,
        uploadDirectories: uploadsSummary.directoryCount,
        uploadBytes: uploadsSummary.totalBytes,
        backupJsonFiles: copiedBackupJsons.length
    };
}

module.exports = {
    createSafetySnapshot,
    sanitizeLabel
};
