const state = {
    logs: [],
    filtered: []
};

const DETAIL_LABELS = {
    id: 'ID',
    plate: 'Placa',
    chassis: 'Chassi',
    status: 'Status',
    base: 'Base',
    baseDestino: 'Base de destino',
    yard: 'Pátio',
    manager: 'Gestor',
    type: 'Tipo',
    name: 'Nome',
    entityId: 'Registro',
    reason: 'Motivo',
    subcategory: 'Subcategoria',
    detail: 'Detalhe',
    deliveredTo: 'Entrega',
    entreguePara: 'Entregue para',
    username: 'Usuário',
    sascarStatus: 'Status do Rastreador',
    maintenanceCategory: 'Categoria de manutenção',
    maintenance: 'Em manutenção',
    hasAccident: 'Sinistro',
    documentIssue: 'Problema de documentação',
    keys: 'Chave',
    notes: 'Observações',
    entryTime: 'Entrada',
    exitTime: 'Saída',
    readyTime: 'Pronto para embarque',
    isNewVehicle: 'Veículo novo',
    newVehiclePlotagem: 'Plotagem',
    newVehicleTesteDrive: 'Teste drive',
    newVehicleAdesivoCorreios: 'Adesivo Correios',
    newVehicleAdesivoPrint: 'Adesivo Print',
    newVehicleMarcacaoPneus: 'Marcação de pneus',
    newVehicleForracaoInterna: 'Forração interna',
    newVehicleNotes: 'Observações do veículo novo',
    hasNewLine: 'Nova linha',
    newLineName: 'Nome da linha',
    newLineState: 'UF da linha',
    entregarDiversos: 'Entregar diversos',
    entregarCorreios: 'Entregar Correios'
};

const ENTITY_LABELS = {
    vehicle: 'Veículo',
    occurrence: 'Ocorrência',
    swap: 'Troca / Empréstimo',
    conjunto: 'Conjunto',
    base: 'Base'
};

const MASTER_DATA_LABELS = {
    bases: 'Bases',
    tripTypes: 'Tipos de viagem',
    lines: 'Linhas',
    plates: 'Placas',
    vehicleTypes: 'Tipos de veículo',
    reasons: 'Motivos',
    subcategories: 'Subcategorias',
    details: 'Detalhamentos'
};

const ACTION_LABELS = {
    create: 'Cadastro',
    update: 'Atualização',
    delete: 'Exclusão',
    deliver: 'Entrega',
    'undo-liberado': 'Desfazer liberação',
    status: 'Mudança de status',
    exit: 'Saída'
};

const DETAIL_ALIASES = {
    basedestino: 'baseDestino',
    entregar_diversos: 'entregarDiversos',
    entregar_correios: 'entregarCorreios',
    entrytime: 'entryTime',
    exittime: 'exitTime',
    readytime: 'readyTime',
    createdat: 'createdAt',
    updatedat: 'updatedAt',
    updatedby: 'updatedBy',
    documentissue: 'documentIssue',
    hasaccident: 'hasAccident',
    sascarstatus: 'sascarStatus',
    maintenancecategory: 'maintenanceCategory',
    isnewvehicle: 'isNewVehicle',
    newvehicleplotagem: 'newVehiclePlotagem',
    newvehiculetestedrive: 'newVehicleTesteDrive',
    newvehicleadesivocorreios: 'newVehicleAdesivoCorreios',
    newvehicleadesivoprint: 'newVehicleAdesivoPrint',
    newvehiclemarcacaopneus: 'newVehicleMarcacaoPneus',
    newvehicleforracaointerna: 'newVehicleForracaoInterna',
    newvehiclenotes: 'newVehicleNotes',
    hasnewline: 'hasNewLine',
    newlinename: 'newLineName',
    newlinestate: 'newLineState'
};

const HIDDEN_DETAIL_KEYS = new Set([
    'createdAt',
    'updatedAt',
    'updatedBy'
]);

const DETAIL_PRIORITY = [
    'id',
    'plate',
    'chassis',
    'status',
    'base',
    'baseDestino',
    'yard',
    'manager',
    'entryTime',
    'exitTime',
    'readyTime',
    'name',
    'type',
    'reason',
    'subcategory',
    'detail',
    'entreguePara',
    'keys',
    'notes',
    'maintenance',
    'maintenanceCategory',
    'hasAccident',
    'documentIssue',
    'sascarStatus',
    'isNewVehicle',
    'newVehiclePlotagem',
    'newVehicleTesteDrive',
    'newVehicleAdesivoCorreios',
    'newVehicleAdesivoPrint',
    'newVehicleMarcacaoPneus',
    'newVehicleForracaoInterna',
    'newVehicleNotes',
    'hasNewLine',
    'newLineName',
    'newLineState',
    'entregarCorreios',
    'entregarDiversos'
];

const alertHost = document.getElementById('alertHost');
const auditCount = document.getElementById('auditCount');
const searchInput = document.getElementById('searchInput');
const entityFilter = document.getElementById('entityFilter');
const actionFilter = document.getElementById('actionFilter');
const refreshBtn = document.getElementById('refreshBtn');
const auditTableBody = document.getElementById('auditTableBody');
const detailsModal = document.getElementById('detailsModal');
const detailsMeta = document.getElementById('detailsMeta');
const detailsFields = document.getElementById('detailsFields');
const detailsJson = document.getElementById('detailsJson');
const detailsRaw = document.getElementById('detailsRaw');
const detailsModalSubtitle = document.getElementById('detailsModalSubtitle');
const detailsModalActor = document.getElementById('detailsModalActor');
const closeDetailsBtn = document.getElementById('closeDetailsBtn');

function showAlert(message, type = 'success') {
    alertHost.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" onclick="this.parentElement.remove()" aria-label="Fechar"></button>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function parseSystemDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const sqliteUtcMatch = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
    );
    if (sqliteUtcMatch && !/[zZ]|[+\-]\d{2}:\d{2}$/.test(raw)) {
        const [, year, month, day, hour, minute, second, millisecond = '0'] = sqliteUtcMatch;
        const date = new Date(Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
            Number(millisecond.padEnd(3, '0'))
        ));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = parseSystemDate(value);
    return date ? date.toLocaleString('pt-BR') : String(value);
}

function normalizeDetailKey(key) {
    return DETAIL_ALIASES[String(key || '').toLowerCase()] || String(key || '');
}

function isDateLikeKey(key) {
    return /(?:Time|At|Date)$/i.test(String(key || ''));
}

function formatScalar(value, key = '') {
    if (value === null || value === undefined) return '';
    if (isDateLikeKey(key)) return formatDateTime(value);
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    return String(value).trim();
}

function humanizeKey(key) {
    if (DETAIL_LABELS[key]) return DETAIL_LABELS[key];
    return String(key || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatEntityType(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (ENTITY_LABELS[raw]) return ENTITY_LABELS[raw];

    if (raw.startsWith('master-data:')) {
        const masterDataType = raw.split(':')[1] || '';
        const label = MASTER_DATA_LABELS[masterDataType] || masterDataType;
        return `Cadastro mestre: ${label}`;
    }

    return humanizeKey(raw);
}

function formatAction(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    return ACTION_LABELS[raw] || humanizeKey(raw);
}

function getDetailsObject(details) {
    if (!details || typeof details !== 'object') return null;
    const normalizedEntries = Object.entries(details)
        .sort(([leftKey], [rightKey]) => {
            const leftCanonical = normalizeDetailKey(leftKey);
            const rightCanonical = normalizeDetailKey(rightKey);
            const leftPenalty = Number(leftCanonical !== leftKey) + Number(leftKey.includes('_'));
            const rightPenalty = Number(rightCanonical !== rightKey) + Number(rightKey.includes('_'));
            return leftPenalty - rightPenalty || leftKey.localeCompare(rightKey);
        });

    return normalizedEntries.reduce((accumulator, [rawKey, value]) => {
        const key = normalizeDetailKey(rawKey);
        if (!key || HIDDEN_DETAIL_KEYS.has(key)) return accumulator;
        if (accumulator[key] !== undefined) return accumulator;
        accumulator[key] = value;
        return accumulator;
    }, {});
}

function getDetailEntries(details, options = {}) {
    const {
        includeFalseBooleans = false,
        includeEmptyStrings = false,
        includeZeroNumbers = true
    } = options;
    const detailObject = getDetailsObject(details);
    if (!detailObject) return [];

    return Object.entries(detailObject)
        .map(([key, value]) => ({ key, value, formatted: formatScalar(value, key) }))
        .filter(item => {
            if (item.key === 'entreguePara' && !detailObject.entregue && !detailObject.entregarCorreios && !detailObject.entregarDiversos) {
                return false;
            }
            if (Array.isArray(item.value)) return item.formatted;
            if (typeof item.value === 'object' && item.value !== null) return false;
            if (typeof item.value === 'boolean') return includeFalseBooleans ? true : item.value;
            if (typeof item.value === 'number') return includeZeroNumbers ? true : item.value !== 0;
            if (typeof item.value === 'string') return includeEmptyStrings ? true : item.formatted !== '';
            return item.formatted !== '';
        })
        .sort((left, right) => {
            const leftIndex = DETAIL_PRIORITY.indexOf(left.key);
            const rightIndex = DETAIL_PRIORITY.indexOf(right.key);
            const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
            const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
            return normalizedLeft - normalizedRight || left.key.localeCompare(right.key);
        });
}

function buildDetailPreview(details) {
    const entries = getDetailEntries(details).slice(0, 3);
    if (!entries.length) return '<div class="detail-empty">Sem detalhes resumidos.</div>';

    return `
        <div class="detail-preview">
            ${entries.map(item => `<span class="detail-chip" title="${escapeHtml(`${humanizeKey(item.key)}: ${item.formatted}`)}">${escapeHtml(`${humanizeKey(item.key)}: ${item.formatted}`)}</span>`).join('')}
        </div>
    `;
}

function hasDetails(details) {
    if (details === null || details === undefined) return false;
    if (typeof details !== 'object') return String(details).trim() !== '';
    return Object.keys(details).length > 0;
}

function buildFieldsGrid(details, excludedKeys = []) {
    const excluded = new Set(excludedKeys);
    const entries = getDetailEntries(details).filter(item => !excluded.has(item.key));
    if (!entries.length) {
        return '<div class="detail-empty">Sem campos adicionais registrados.</div>';
    }

    return entries.map(item => `
        <div class="audit-fields__item">
            <span class="audit-meta__label">${escapeHtml(humanizeKey(item.key))}</span>
            <span class="audit-meta__value">${escapeHtml(item.formatted || '-')}</span>
        </div>
    `).join('');
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Erro na comunicação com o servidor');
    return data;
}

function populateFilters() {
    const entityValues = [...new Set(state.logs.map(item => item.entityType).filter(Boolean))];
    const actionValues = [...new Set(state.logs.map(item => item.action).filter(Boolean))];

    entityFilter.innerHTML = '<option value="">Todas</option>' + entityValues
        .sort((left, right) => formatEntityType(left).localeCompare(formatEntityType(right), 'pt-BR'))
        .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(formatEntityType(value))}</option>`)
        .join('');
    actionFilter.innerHTML = '<option value="">Todas</option>' + actionValues
        .sort((left, right) => formatAction(left).localeCompare(formatAction(right), 'pt-BR'))
        .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(formatAction(value))}</option>`)
        .join('');
}

function applyFilters() {
    const term = searchInput.value.trim().toLowerCase();
    const entity = entityFilter.value;
    const action = actionFilter.value;

    state.filtered = state.logs.filter(item => {
        if (entity && item.entityType !== entity) return false;
        if (action && item.action !== action) return false;
        if (!term) return true;
        return [
            item.username,
            item.summary,
            item.entityType,
            item.action,
            formatEntityType(item.entityType),
            formatAction(item.action),
            JSON.stringify(item.details || {})
        ].some(value => String(value || '').toLowerCase().includes(term));
    });

    renderLogs();
}

function renderLogs() {
    auditCount.textContent = `${state.logs.length} evento${state.logs.length === 1 ? '' : 's'}`;

    if (!state.filtered.length) {
        auditTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary">Nenhum evento encontrado.</td></tr>';
        return;
    }

    auditTableBody.innerHTML = state.filtered.map((item, index) => `
        <tr>
            <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
            <td>${escapeHtml(item.username || 'system')}</td>
            <td>${escapeHtml(formatEntityType(item.entityType))}</td>
            <td>${escapeHtml(formatAction(item.action))}</td>
            <td>${escapeHtml(item.summary || '-')}</td>
            <td>
                ${buildDetailPreview(item.details)}
                <button
                    class="btn btn-sm btn-outline-secondary"
                    type="button"
                    data-audit-index="${index}"
                    ${hasDetails(item.details) ? '' : 'disabled'}
                >
                    ${hasDetails(item.details) ? 'Ver detalhes' : 'Sem detalhes'}
                </button>
            </td>
        </tr>
    `).join('');
}

function openDetailsModal(log) {
    const detailEntries = getDetailEntries(log.details);
    const primaryDetailKeys = detailEntries.slice(0, 4).map(item => item.key);
    const actor = log.username || 'system';
    const when = formatDateTime(log.createdAt);
    const entries = [
        { label: 'Quando', value: formatDateTime(log.createdAt) },
        { label: 'Alterado por', value: actor },
        { label: 'Tipo de registro', value: formatEntityType(log.entityType) },
        { label: 'Ação', value: formatAction(log.action) },
        { label: 'Resumo', value: log.summary || '-' }
    ];

    detailEntries.slice(0, 4).forEach(item => {
        entries.push({ label: humanizeKey(item.key), value: item.formatted });
    });

    detailsMeta.innerHTML = entries.map(item => `
        <div class="audit-meta__item">
            <span class="audit-meta__label">${escapeHtml(item.label)}</span>
            <span class="audit-meta__value">${escapeHtml(item.value)}</span>
        </div>
    `).join('');

    detailsModalSubtitle.textContent = log.summary || 'Consulta completa do registro selecionado.';
    detailsModalActor.textContent = `Alterado por ${actor} em ${when}`;
    detailsFields.innerHTML = buildFieldsGrid(log.details, primaryDetailKeys);
    detailsJson.textContent = hasDetails(log.details)
        ? JSON.stringify(log.details, null, 2)
        : 'Sem detalhes registrados para este evento.';
    detailsRaw.open = false;

    detailsModal.classList.add('is-open');
    detailsModal.setAttribute('aria-hidden', 'false');
    closeDetailsBtn.focus();
}

function closeDetailsModal() {
    detailsModal.classList.remove('is-open');
    detailsModal.setAttribute('aria-hidden', 'true');
    detailsRaw.open = false;
    detailsModalActor.textContent = '';
}

async function loadAuditLogs() {
    state.logs = await apiFetch('/api/audit-logs?limit=250');
    populateFilters();
    applyFilters();
}

searchInput.addEventListener('input', applyFilters);
entityFilter.addEventListener('change', applyFilters);
actionFilter.addEventListener('change', applyFilters);
refreshBtn.addEventListener('click', async () => {
    try {
        await loadAuditLogs();
        showAlert('Auditoria atualizada.', 'info');
    } catch (error) {
        showAlert(error.message, 'danger');
    }
});

auditTableBody.addEventListener('click', event => {
    const button = event.target.closest('[data-audit-index]');
    if (!button) return;

    const index = Number(button.dataset.auditIndex);
    const log = state.filtered[index];
    if (!log) return;

    openDetailsModal(log);
});

closeDetailsBtn.addEventListener('click', closeDetailsModal);
detailsModal.addEventListener('click', event => {
    if (event.target === detailsModal) closeDetailsModal();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && detailsModal.classList.contains('is-open')) {
        closeDetailsModal();
    }
});

async function init() {
    try {
        await loadAuditLogs();
    } catch (error) {
        showAlert(error.message, 'danger');
        auditTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Falha ao carregar a auditoria.</td></tr>';
    }
}

init();
