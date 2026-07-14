const fs = require('fs');
const path = require('path');
const { createSafetySnapshot } = require('../lib/safety-snapshot');

const workspaceRoot = path.resolve(__dirname, '..');
const snapshotsRoot = path.join(workspaceRoot, 'backups', 'snapshots');
const databaseDir = path.join(workspaceRoot, 'database');
const uploadsDir = path.join(workspaceRoot, 'public', 'uploads');

function parseArgs(argv) {
    const result = {
        snapshot: '',
        apply: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--apply') {
            result.apply = true;
            continue;
        }

        if (value === '--snapshot' && argv[index + 1]) {
            result.snapshot = argv[index + 1];
            index += 1;
            continue;
        }

        if (value.startsWith('--snapshot=')) {
            result.snapshot = value.slice('--snapshot='.length);
        }
    }

    return result;
}

function ensureDirectoryExists(targetPath) {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
}

function resolveSnapshotPath(snapshotArg) {
    if (!snapshotArg) {
        throw new Error('Informe o snapshot com --snapshot <nome-ou-caminho>');
    }

    const candidatePath = path.isAbsolute(snapshotArg)
        ? path.resolve(snapshotArg)
        : path.resolve(snapshotsRoot, snapshotArg);

    const normalizedRoot = path.resolve(snapshotsRoot);
    const normalizedCandidate = path.resolve(candidatePath);
    const relativePath = path.relative(normalizedRoot, normalizedCandidate);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('O snapshot informado precisa estar dentro de backups/snapshots');
    }

    if (!fs.existsSync(normalizedCandidate) || !fs.statSync(normalizedCandidate).isDirectory()) {
        throw new Error(`Snapshot não encontrado: ${normalizedCandidate}`);
    }

    return normalizedCandidate;
}

function readManifest(snapshotPath) {
    const manifestPath = path.join(snapshotPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifesto não encontrado em ${manifestPath}`);
    }

    return {
        manifestPath,
        manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    };
}

function pathExists(targetPath) {
    return fs.existsSync(targetPath);
}

function buildPlan(snapshotPath, manifestPath, manifest) {
    const snapshotDatabaseDir = path.join(snapshotPath, 'database');
    const snapshotUploadsDir = path.join(snapshotPath, 'public', 'uploads');
    const snapshotBackupJsonDir = path.join(snapshotPath, 'backup-json');

    return {
        snapshotPath,
        manifestPath,
        manifestCreatedAt: manifest.createdAt || null,
        database: {
            sourceDir: snapshotDatabaseDir,
            targetDir: databaseDir,
            available: pathExists(snapshotDatabaseDir),
            files: pathExists(snapshotDatabaseDir) ? fs.readdirSync(snapshotDatabaseDir) : []
        },
        uploads: {
            sourceDir: snapshotUploadsDir,
            targetDir: uploadsDir,
            available: pathExists(snapshotUploadsDir),
            existsNow: pathExists(uploadsDir)
        },
        backupJson: {
            sourceDir: snapshotBackupJsonDir,
            available: pathExists(snapshotBackupJsonDir),
            files: pathExists(snapshotBackupJsonDir) ? fs.readdirSync(snapshotBackupJsonDir) : []
        }
    };
}

function replaceDirectory(sourceDir, targetDir) {
    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function replaceDatabaseFiles(sourceDir, targetDir) {
    ensureDirectoryExists(targetDir);

    for (const fileName of ['patio.db', 'patio.db-wal', 'patio.db-shm']) {
        const targetFile = path.join(targetDir, fileName);
        if (fs.existsSync(targetFile)) {
            fs.rmSync(targetFile, { force: true });
        }
    }

    for (const fileName of fs.readdirSync(sourceDir)) {
        const sourceFile = path.join(sourceDir, fileName);
        const targetFile = path.join(targetDir, fileName);
        if (fs.statSync(sourceFile).isFile()) {
            fs.copyFileSync(sourceFile, targetFile);
        }
    }
}

function applyRestore(plan) {
    const preRestoreSnapshot = createSafetySnapshot({
        workspaceRoot,
        label: 'pre-restore'
    });

    if (plan.database.available) {
        replaceDatabaseFiles(plan.database.sourceDir, plan.database.targetDir);
    }

    if (plan.uploads.available) {
        replaceDirectory(plan.uploads.sourceDir, plan.uploads.targetDir);
    }

    return {
        restored: true,
        preRestoreSnapshot
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const snapshotPath = resolveSnapshotPath(args.snapshot);
    const { manifestPath, manifest } = readManifest(snapshotPath);
    const plan = buildPlan(snapshotPath, manifestPath, manifest);

    if (!args.apply) {
        console.log(JSON.stringify({
            mode: 'dry-run',
            requiresApplyFlag: true,
            warning: 'Pare o servidor antes de restaurar, depois execute novamente com --apply para confirmar.',
            plan
        }, null, 2));
        return;
    }

    console.log(JSON.stringify({
        mode: 'applied',
        warning: 'Restauração executada. Se o servidor estava em execução, reinicie-o antes de validar os dados.',
        plan,
        result: applyRestore(plan)
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
}
