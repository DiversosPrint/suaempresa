const state = {
    options: null,
    occurrences: [],
    filtered: [],
    editingId: null,
    canManage: false
};

const form = document.getElementById('occurrenceForm');
const alertHost = document.getElementById('alertHost');
const tableBody = document.getElementById('occurrencesBody');
const searchInput = document.getElementById('searchInput');
const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const resetBtn = document.getElementById('resetBtn');
const basesBtn = document.getElementById('basesBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const filterDateFrom = document.getElementById('filterDateFrom');
const filterDateTo = document.getElementById('filterDateTo');
const filterBranch = document.getElementById('filterBranch');
const filterReason = document.getElementById('filterReason');
const statsCount = document.getElementById('statsCount');

const fields = {
    id: document.getElementById('occurrenceId'),
    tripNumber: document.getElementById('tripNumber'),
    tripDate: document.getElementById('tripDate'),
    branch: document.getElementById('branch'),
    tripType: document.getElementById('tripType'),
    line: document.getElementById('line'),
    plate: document.getElementById('plate'),
    vehicleType: document.getElementById('vehicleType'),
    reason: document.getElementById('reason'),
    subcategory: document.getElementById('subcategory'),
    detail: document.getElementById('detail'),
    serviceOrder: document.getElementById('serviceOrder'),
    observation: document.getElementById('observation')
};

function showAlert(message, type = 'success') {
    alertHost.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
        </div>
    `;
}

function fillSelect(select, values) {
    const currentValue = select.value;
    const options = ['<option value="">Selecione</option>']
        .concat(values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`));
    select.innerHTML = options.join('');
    if (currentValue && values.includes(currentValue)) {
        select.value = currentValue;
    }
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

async function loadOptions() {
    state.options = await apiFetch('/api/occurrences/options');
    fillSelect(fields.branch, state.options.branches);
    fillSelect(fields.tripType, state.options.tripTypes);
    fillSelect(fields.line, state.options.lines);
    fillSelect(fields.plate, state.options.plates);
    fillSelect(fields.vehicleType, state.options.vehicleTypes);
    fillSelect(fields.reason, state.options.reasons);
    fillSelect(fields.subcategory, state.options.subcategories);
    fillSelect(fields.detail, state.options.details);
    fillSelect(filterBranch, state.options.branches);
    fillSelect(filterReason, state.options.reasons);
}

async function loadOccurrences() {
    state.occurrences = await apiFetch('/api/occurrences');
    applyFilter();
}

async function loadPermissions() {
    try {
        const auth = await apiFetch('/api/auth/me');
        state.canManage = Boolean(auth.authenticated && auth.permissions?.canManage);
    } catch (error) {
        state.canManage = false;
    }

    if (basesBtn) {
        basesBtn.hidden = !state.canManage;
    }
}

function openBasesModule() {
    const moduleUrl = '/cadastros';
    const basesWindow = window.open(moduleUrl, '_blank', 'noopener');
    if (basesWindow) {
        showAlert('Cadastros mestres abertos em outra aba.', 'info');
        return;
    }
    window.location.href = moduleUrl;
}

function applyFilter() {
    const term = searchInput.value.trim().toLowerCase();
    const dateFrom = filterDateFrom.value;
    const dateTo = filterDateTo.value;
    const branch = filterBranch.value;
    const reason = filterReason.value;
    state.filtered = state.occurrences.filter(item => {
        if (dateFrom && String(item.tripDate || '') < dateFrom) return false;
        if (dateTo && String(item.tripDate || '') > dateTo) return false;
        if (branch && item.branch !== branch) return false;
        if (reason && item.reason !== reason) return false;
        if (!term) return true;
        return [
            item.tripNumber,
            item.tripDate,
            item.branch,
            item.tripType,
            item.line,
            item.plate,
            item.vehicleType,
            item.reason,
            item.subcategory,
            item.detail,
            item.serviceOrder,
            item.observation
        ].some(value => String(value || '').toLowerCase().includes(term));
    });
    renderTable();
}

function exportOccurrencesCsv() {
    const rows = state.filtered.length ? state.filtered : state.occurrences;
    if (!rows.length) {
        showAlert('Não há ocorrências para exportar.', 'warning');
        return;
    }

    const header = ['Viagem', 'Data', 'Base', 'Tipo', 'Linha', 'Placa', 'Veículo', 'Motivo', 'Subcategoria', 'Detalhamento', 'OS', 'Observação'];
    const csvRows = [
        header.join(';'),
        ...rows.map(item => [
            item.tripNumber,
            item.tripDate,
            item.branch,
            item.tripType,
            item.line,
            item.plate,
            item.vehicleType,
            item.reason,
            item.subcategory,
            item.detail,
            item.serviceOrder,
            item.observation
        ].map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';'))
    ];

    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function renderTable() {
    if (statsCount) {
        statsCount.textContent = `${state.occurrences.length} ocorrência${state.occurrences.length === 1 ? '' : 's'}`;
    }

    if (!state.filtered.length) {
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center py-4 text-secondary">Nenhuma ocorrência encontrada.</td></tr>';
        return;
    }

    tableBody.innerHTML = state.filtered.map(item => `
        <tr>
            <td><span class="badge badge-soft">${escapeHtml(item.tripNumber)}</span></td>
            <td>${escapeHtml(item.tripDate)}</td>
            <td>${escapeHtml(item.branch)}</td>
            <td>${escapeHtml(item.tripType)}</td>
            <td>${escapeHtml(item.line)}</td>
            <td>${escapeHtml(item.plate)}</td>
            <td>${escapeHtml(item.vehicleType)}</td>
            <td>${escapeHtml(item.reason)}</td>
            <td>${escapeHtml(item.subcategory)}</td>
            <td>${escapeHtml(item.detail)}</td>
            <td>${escapeHtml(item.serviceOrder)}</td>
            <td>${escapeHtml(item.observation)}</td>
            <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-id="${item.id}">Editar</button>
                <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${item.id}">Excluir</button>
            </td>
        </tr>
    `).join('');
}

function resetForm() {
    form.reset();
    fields.id.value = '';
    state.editingId = null;
    formTitle.textContent = 'Nova ocorrência';
    submitBtn.textContent = 'Salvar ocorrência';
    cancelEditBtn.hidden = true;
}

function startEdit(id) {
    const item = state.occurrences.find(entry => entry.id === id);
    if (!item) return;

    state.editingId = id;
    fields.id.value = String(item.id);
    fields.tripNumber.value = item.tripNumber;
    fields.tripDate.value = item.tripDate;
    fields.branch.value = item.branch || '';
    fields.tripType.value = item.tripType || '';
    fields.line.value = item.line || '';
    fields.plate.value = item.plate || '';
    fields.vehicleType.value = item.vehicleType || '';
    fields.reason.value = item.reason || '';
    fields.subcategory.value = item.subcategory || '';
    fields.detail.value = item.detail || '';
    fields.serviceOrder.value = item.serviceOrder || '';
    fields.observation.value = item.observation || '';
    formTitle.textContent = `Editando viagem ${item.tripNumber}`;
    submitBtn.textContent = 'Salvar alterações';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function removeOccurrence(id) {
    if (!window.confirm('Deseja excluir esta ocorrência?')) return;
    await apiFetch(`/api/occurrences/${id}`, { method: 'DELETE' });
    showAlert('Ocorrência excluída com sucesso.');
    if (state.editingId === id) resetForm();
    await loadOccurrences();
}

function buildPayload() {
    return {
        tripNumber: fields.tripNumber.value,
        tripDate: fields.tripDate.value,
        branch: fields.branch.value,
        tripType: fields.tripType.value,
        line: fields.line.value,
        plate: fields.plate.value,
        vehicleType: fields.vehicleType.value,
        reason: fields.reason.value,
        subcategory: fields.subcategory.value,
        detail: fields.detail.value,
        serviceOrder: fields.serviceOrder.value,
        observation: fields.observation.value
    };
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = buildPayload();

    try {
        if (state.editingId) {
            await apiFetch(`/api/occurrences/${state.editingId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showAlert('Ocorrência atualizada com sucesso.');
        } else {
            await apiFetch('/api/occurrences', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showAlert('Ocorrência cadastrada com sucesso.');
        }

        resetForm();
        await loadOccurrences();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
});

searchInput.addEventListener('input', applyFilter);
resetBtn.addEventListener('click', resetForm);
cancelEditBtn.addEventListener('click', resetForm);
basesBtn?.addEventListener('click', openBasesModule);
exportCsvBtn?.addEventListener('click', exportOccurrencesCsv);
[filterDateFrom, filterDateTo, filterBranch, filterReason].forEach(field => field?.addEventListener('input', applyFilter));
[filterDateFrom, filterDateTo, filterBranch, filterReason].forEach(field => field?.addEventListener('change', applyFilter));

tableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const id = Number.parseInt(button.dataset.id, 10);
    if (!Number.isInteger(id)) return;

    if (button.dataset.action === 'edit') startEdit(id);
    if (button.dataset.action === 'delete') {
        try {
            await removeOccurrence(id);
        } catch (error) {
            showAlert(error.message, 'danger');
        }
    }
});

async function init() {
    try {
        await loadPermissions();
        await loadOptions();
        await loadOccurrences();
    } catch (error) {
        showAlert(error.message, 'danger');
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center py-4 text-danger">Falha ao carregar o módulo de ocorrências.</td></tr>';
    }
}

window.addEventListener('focus', () => {
    loadOptions().catch(() => {});
});

init();
