const path = require('path');
const { createSafetySnapshot, sanitizeLabel } = require('../lib/safety-snapshot');

const workspaceRoot = path.resolve(__dirname, '..');

function parseLabelArg(argv) {
    const labelFlagIndex = argv.indexOf('--label');
    if (labelFlagIndex >= 0 && argv[labelFlagIndex + 1]) {
        return sanitizeLabel(argv[labelFlagIndex + 1]);
    }

    const inlineLabel = argv.find((entry) => entry.startsWith('--label='));
    if (inlineLabel) {
        return sanitizeLabel(inlineLabel.slice('--label='.length));
    }

    return '';
}

function main() {
    const label = parseLabelArg(process.argv.slice(2));
    console.log(JSON.stringify(createSafetySnapshot({
        workspaceRoot,
        label
    }), null, 2));
}

main();
