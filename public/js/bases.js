const state = {
    meta: {},
    values: {},
    canManage: false
};

const alertHost = document.getElementById('alertHost');
const masterForm = document.getElementById('masterForm');
const masterType = document.getElementById('masterType');
const masterName = document.getElementById('masterName');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const searchInput = document.getElementById('searchInput');
const catalogGrid = document.getElementById('catalogGrid');
const emptyState = document.getElementById('emptyState');
const masterCount = document.getElementById('masterCount');
const authNotice = document.getElementById('authNotice');
const auditBtn = document.getElementById('auditBtn');

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

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Erro na comunicação com o servidor');
    return data;
}

function openAuditModule() {
    const moduleUrl = '/auditoria';
    const auditWindow = window.open(moduleUrl, '_blank', 'noopener');
    if (auditWindow) {
        showAlert('Auditoria aberta em outra aba.', 'info');
        return;
    }
    window.location.href = moduleUrl;
}

function getFilteredValues(values) {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) return values;
    return values.filter(value => String(value || '').toLowerCase().includes(term));
}

function updatePermissionsUi() {
    masterForm.hidden = !state.canManage;
    authNotice.hidden = state.canManage;
    authNotice.textContent = 'Somente administradores podem manter os cadastros mestres e a auditoria.';
    submitBtn.disabled = !state.canManage;
    resetBtn.disabled = !state.canManage;
    auditBtn.hidden = !state.canManage;
}

function renderMasterTypeOptions() {
    masterType.innerHTML = Object.entries(state.meta).map(([key, info]) => `
        <option value="${escapeHtml(key)}">${escapeHtml(info.label)}</option>
    `).join('');
}

function renderCatalogs() {
    const entries = Object.entries(state.values);
    const totalItems = entries.reduce((sum, [, values]) => sum + values.length, 0);
    masterCount.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;

    const cards = entries.map(([key, values]) => {
        const filtered = getFilteredValues(values);
        if (!filtered.length && searchInput.value.trim()) return '';

        return `
            <section class="catalog-card">
                <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
                    <div>
                        <h3 class="h5 mb-1">${escapeHtml(state.meta[key]?.label || key)}</h3>
                        <div class="text-secondary small">${values.length} item${values.length === 1 ? '' : 's'}</div>
                    </div>
                    <span class="catalog-badge">${filtered.length}</span>
                </div>
                <div class="d-flex flex-wrap gap-2">
                    ${filtered.length
                        ? filtered.map(value => `<span class="catalog-chip">${escapeHtml(value)}</span>`).join('')
                        : '<div class="catalog-empty">Nenhum item para este filtro.</div>'}
                </div>
            </section>
        `;
    }).filter(Boolean);

    catalogGrid.innerHTML = cards.join('');
    emptyState.hidden = cards.length > 0;
}

async function loadAuth() {
    try {
        const auth = await apiFetch('/api/auth/me');
        state.canManage = Boolean(auth.authenticated && auth.permissions?.canManage);
    } catch (error) {
        state.canManage = false;
    }

    updatePermissionsUi();
}

async function loadMasterData() {
    const data = await apiFetch('/api/master-data');
    state.meta = data.meta || {};
    state.values = data.values || {};
    renderMasterTypeOptions();
    renderCatalogs();
}

function resetForm() {
    masterForm.reset();
    masterName.focus();
}

masterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.canManage) return;

    try {
        await apiFetch(`/api/master-data/${encodeURIComponent(masterType.value)}`, {
            method: 'POST',
            body: JSON.stringify({ name: masterName.value })
        });
        showAlert('Item cadastrado com sucesso.');
        resetForm();
        await loadMasterData();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
});

resetBtn.addEventListener('click', resetForm);
searchInput.addEventListener('input', renderCatalogs);
auditBtn.addEventListener('click', openAuditModule);

async function init() {
    try {
        await loadAuth();
        if (!state.canManage) {
            showAlert('Acesso disponível apenas para administradores.', 'warning');
            return;
        }
        await loadMasterData();
    } catch (error) {
        showAlert(error.message, 'danger');
        emptyState.hidden = false;
        emptyState.textContent = 'Falha ao carregar os cadastros mestres.';
    }
}

init();
