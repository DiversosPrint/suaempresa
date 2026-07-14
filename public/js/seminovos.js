const SEMINOVOS_API = '/api/seminovos';
const SEMINOVOS_VEHICLE_TYPES = ['Toco', 'Truck', 'Carreta', 'Cavalo'];
const SEMINOVOS_YARDS = ['Pátio Jaraguá', 'Pátio Bandeirantes', 'Pátio Superior', 'Pátio Cajamar', 'Oficina'];
const SEMINOVOS_OPERATIONAL_STATUSES = [
  'Disponível',
  'Em manutenção',
  'Em borracharia',
  'Em funilaria',
  'Pendente de documentação',
  'Problema mecânico',
  'Aguardando peça',
  'Liberado'
];
const SEMINOVOS_COMMERCIAL_STATUSES = ['Nenhum', 'Pós-venda', 'Garantia', 'Pós-venda e garantia', 'Finalizado'];
const SEMINOVOS_SERVICE_CATEGORIES = ['Manutenção', 'Borracharia', 'Funilaria', 'Documentação'];
const SEMINOVOS_SERVICE_STATUSES = ['Aberta', 'Em andamento', 'Aguardando peça', 'Concluída', 'Cancelada'];
const SEMINOVOS_PHOTO_CATEGORIES = ['Frente', 'Traseira', 'Lado esquerdo', 'Lado direito', 'Painel / odômetro', 'Avaria / observação'];

let seminovosCurrentUser = null;
let seminovosVehicles = [];
let seminovosServiceOrders = [];
let seminovosCurrentView = 'painel';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function canAccessSeminovos(user) {
  return ['admin', 'seminovos'].includes(user?.role);
}

function getLocalDateTimeInputValue(date = new Date()) {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function serializeDateTimeInputValue(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function formatDateTimeBR(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatNumberBR(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function getPlateType(plate) {
  if (!plate) return 'mercosul';
  const cleanPlate = String(plate).replace(/[-\s]/g, '').toUpperCase();
  if (/^[A-Z]{3}\d{4}$/.test(cleanPlate)) return 'vermelha';
  return 'mercosul';
}

function renderPlate(plate) {
  const safePlate = escapeHtml(plate || '—');
  const cssClass = getPlateType(plate) === 'vermelha' ? 'placa-vermelha' : 'placa-mercosul';
  return `<span class="placa-container ${cssClass}"><span class="placa-texto">${safePlate}</span></span>`;
}

function formatSeminovosYardLabel(yard) {
  const value = String(yard || '').trim();
  if (!value) return 'Não informado';
  return value.replace(/^Pátio\s+/i, '') || value;
}

function renderYardBadge(yard) {
  return `<span class="yard-pill"><i class="bi bi-geo-alt"></i>${escapeHtml(formatSeminovosYardLabel(yard))}</span>`;
}

function renderClickablePlate(plate, vehicleId) {
  if (!vehicleId) return renderPlate(plate);
  return `<button type="button" class="plate-trigger-btn" onclick="viewSeminovosVehicleDetails('${String(vehicleId)}')" title="Abrir ficha do veículo" aria-label="Abrir ficha do veículo ${escapeHtml(String(plate || ''))}">${renderPlate(plate)}</button>`;
}

function buildSeminovosImageTriggerAttributes({ src = '', title = 'Foto do veículo', meta = 'Toque para ampliar.' } = {}) {
  if (!src) return '';
  const safeTitle = String(title || 'Foto do veículo');
  return `data-seminovos-image-trigger="true" data-image-src="${escapeHtml(src)}" data-image-title="${escapeHtml(safeTitle)}" data-image-meta="${escapeHtml(meta)}" role="button" tabindex="0" aria-label="${escapeHtml(`Abrir ${safeTitle} em tela cheia`)}"`;
}

function getSeminovosImageViewerElements() {
  return {
    modal: document.getElementById('seminovosImageViewerModal'),
    image: document.getElementById('seminovosImageViewerImage'),
    title: document.getElementById('seminovosImageViewerTitle'),
    meta: document.getElementById('seminovosImageViewerMeta')
  };
}

function clearSeminovosImageTrigger(element) {
  if (!element) return;
  delete element.dataset.seminovosImageTrigger;
  delete element.dataset.imageSrc;
  delete element.dataset.imageTitle;
  delete element.dataset.imageMeta;
  element.removeAttribute('role');
  element.removeAttribute('tabindex');
  element.removeAttribute('aria-label');
  element.classList.remove('can-view-fullscreen');
}

function setSeminovosImageTrigger(element, { src = '', title = 'Foto do veículo', meta = 'Toque para ampliar.' } = {}) {
  if (!element || !src) {
    clearSeminovosImageTrigger(element);
    return;
  }

  element.dataset.seminovosImageTrigger = 'true';
  element.dataset.imageSrc = src;
  element.dataset.imageTitle = title || 'Foto do veículo';
  element.dataset.imageMeta = meta || 'Toque para ampliar.';
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', `Abrir ${title || 'foto do veículo'} em tela cheia`);
  element.classList.add('can-view-fullscreen');
}

function openSeminovosImageViewer({ src = '', title = 'Foto do veículo', meta = 'Toque fora da imagem para fechar.' } = {}) {
  if (!src) return;
  const viewer = getSeminovosImageViewerElements();
  if (!viewer.modal || !viewer.image) return;

  viewer.image.src = src;
  viewer.image.alt = title || 'Foto do veículo';
  if (viewer.title) viewer.title.textContent = title || 'Foto do veículo';
  if (viewer.meta) viewer.meta.textContent = meta || 'Toque fora da imagem para fechar.';

  bootstrap.Modal.getOrCreateInstance(viewer.modal).show();
}

function handleSeminovosImageTriggerClick(event) {
  const trigger = event.target.closest('[data-seminovos-image-trigger="true"]');
  if (!trigger) return;
  event.preventDefault();
  openSeminovosImageViewer({
    src: trigger.dataset.imageSrc,
    title: trigger.dataset.imageTitle,
    meta: trigger.dataset.imageMeta
  });
}

function handleSeminovosImageTriggerKeydown(event) {
  const trigger = event.target.closest('[data-seminovos-image-trigger="true"]');
  if (!trigger || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  openSeminovosImageViewer({
    src: trigger.dataset.imageSrc,
    title: trigger.dataset.imageTitle,
    meta: trigger.dataset.imageMeta
  });
}

function releaseVehiclePhotoObjectUrl(slot) {
  if (!slot?.dataset.previewObjectUrl) return;
  URL.revokeObjectURL(slot.dataset.previewObjectUrl);
  delete slot.dataset.previewObjectUrl;
}

function getVehicleStatusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('document')) return 'doc';
  if (normalized.includes('mec')) return 'mec';
  if (normalized.includes('funilar')) return 'funilaria';
  if (normalized.includes('borrachar')) return 'borracharia';
  if (normalized.includes('peça')) return 'peca';
  if (normalized.includes('liber')) return 'liberado';
  if (normalized.includes('dispon')) return 'disponivel';
  return '';
}

function getCommercialStatusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('garantia') && normalized.includes('pós')) return 'posvenda garantia';
  if (normalized.includes('garantia')) return 'garantia';
  if (normalized.includes('pós')) return 'posvenda';
  if (normalized.includes('final')) return 'finalizado';
  return '';
}

function renderVehicleStatus(status) {
  return `<span class="status-pill ${getVehicleStatusClass(status)}">${escapeHtml(status || '—')}</span>`;
}

function renderCommercialStatus(status) {
  return `<span class="commercial-pill ${getCommercialStatusClass(status)}">${escapeHtml(status || '—')}</span>`;
}

function renderSoldBadge(sold) {
  return `<span class="sold-pill ${sold ? 'sold' : 'available'}"><i class="bi ${sold ? 'bi-cash-coin' : 'bi-tag'}"></i>${sold ? 'Vendido' : 'Não vendido'}</span>`;
}

function renderVehicleType(type) {
  return `<span class="type-pill"><i class="bi bi-truck-front"></i>${escapeHtml(type || '—')}</span>`;
}

function showToast(message, variant = 'success') {
  const tone = {
    success: 'alert-success',
    danger: 'alert-danger',
    warning: 'alert-warning',
    info: 'alert-info'
  }[variant] || 'alert-secondary';
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `alert ${tone} shadow-sm border-0`;
  toast.innerHTML = `<div class="d-flex align-items-start gap-2"><i class="bi bi-info-circle mt-1"></i><div>${escapeHtml(message)}</div></div>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function populateSelect(selectId, values, { includeAll = false, allLabel = 'Todos', placeholder = '' } = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const options = [];
  if (placeholder) {
    options.push(`<option value="">${escapeHtml(placeholder)}</option>`);
  } else if (includeAll) {
    options.push(`<option value="">${escapeHtml(allLabel)}</option>`);
  }
  values.forEach(value => {
    options.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  });
  select.innerHTML = options.join('');
}

function getVehicleById(id) {
  return seminovosVehicles.find(vehicle => String(vehicle.id) === String(id)) || null;
}

function getServiceOrderById(id) {
  return seminovosServiceOrders.find(order => String(order.id) === String(id)) || null;
}

function openView(viewName) {
  seminovosCurrentView = viewName;
  document.querySelectorAll('.module-view').forEach(section => section.classList.add('hidden'));
  document.querySelectorAll('.module-nav .nav-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });
  document.getElementById(`${viewName}View`)?.classList.remove('hidden');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const responseType = response.headers.get('content-type') || '';
  const data = responseType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('As fotos ficaram grandes demais para o envio. Tente menos fotos ou use imagens menores.');
    }
    if (typeof data === 'string' && data.trim()) {
      throw new Error(data.trim());
    }
    throw new Error(data.error || 'Falha na requisição');
  }
  return data;
}

async function checkSeminovosAuth() {
  try {
    const data = await fetchJson('/api/auth/me');
    if (data.authenticated && canAccessSeminovos(data.user)) {
      seminovosCurrentUser = data.user;
      await showSeminovosApp();
      return;
    }
    if (data.authenticated && !canAccessSeminovos(data.user)) {
      window.location.href = '/';
      return;
    }
  } catch (error) {
    // Mantém a tela de login.
  }
  showSeminovosLogin();
}

function showSeminovosLogin() {
  document.getElementById('seminovosLoginScreen').classList.remove('hidden');
  document.getElementById('seminovosApp').classList.add('hidden');
}

async function showSeminovosApp() {
  document.getElementById('seminovosLoginScreen').classList.add('hidden');
  document.getElementById('seminovosApp').classList.remove('hidden');
  document.getElementById('seminovosUserName').textContent = seminovosCurrentUser.username;
  document.getElementById('seminovosUserAvatar').textContent = seminovosCurrentUser.username.charAt(0).toUpperCase();
  document.getElementById('seminovosUserRole').textContent = seminovosCurrentUser.role === 'admin' ? 'ADMIN' : 'SEMINOVOS';
  document.getElementById('btnBackToPatio').classList.toggle('hidden', seminovosCurrentUser.role !== 'admin');
  await loadSeminovosData();
}

async function loadSeminovosData() {
  try {
    const [vehicles, orders] = await Promise.all([
      fetchJson(`${SEMINOVOS_API}/vehicles`),
      fetchJson(`${SEMINOVOS_API}/service-orders`)
    ]);
    seminovosVehicles = Array.isArray(vehicles) ? vehicles : [];
    seminovosServiceOrders = Array.isArray(orders) ? orders : [];
    renderSeminovosModule();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível carregar os dados de seminovos', 'danger');
  }
}

function getSeminovosDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openPrintWindow(title, html) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Permita pop-ups para gerar o PDF.', 'warning');
    return false;
  }
  printWindow.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
  return true;
}

function getVehicleOrdersContext(vehicleId) {
  const vehicle = getVehicleById(vehicleId);
  const orders = seminovosServiceOrders
    .filter(order => String(order.vehicleId) === String(vehicleId))
    .sort((a, b) => new Date(b.openedAt || 0) - new Date(a.openedAt || 0));
  const parts = orders.flatMap(order => (order.parts || []).map(part => ({
    ...part,
    serviceOrderNumber: order.serviceOrderNumber,
    category: order.category
  })));
  return { vehicle, orders, parts };
}

function exportSeminovosFullPDF() {
  const parts = getFlattenedParts();
  const generatedAt = new Date().toLocaleString('pt-BR');
  const html = `
    <style>
      body{font-family:Arial,sans-serif;margin:20px;color:#10233d;}
      h1{color:#1a3a5c;border-bottom:3px solid #1a3a5c;padding-bottom:10px;}
      h2{color:#2c5282;margin-top:28px;}
      .header{background:#f8fbff;border:1px solid #d8e3f1;border-radius:12px;padding:18px;margin-bottom:20px;}
      .meta{margin:4px 0;}
      table{width:100%;border-collapse:collapse;margin:18px 0;font-size:12px;}
      th{background:#1a3a5c;color:#fff;padding:10px;text-align:left;}
      td{padding:8px;border-bottom:1px solid #dbe4ef;vertical-align:top;}
      tr:nth-child(even){background:#f8fbff;}
      .pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#e8f1fb;color:#1a3a5c;font-weight:700;font-size:11px;}
      @media print{body{margin:10px;}table{font-size:10px;}}
    </style>
    <div class="header">
      <h1>SEMINOVOS - SUA EMPRESA</h1>
      <p class="meta"><strong>Relatório:</strong> Completo</p>
      <p class="meta"><strong>Gerado em:</strong> ${escapeHtml(generatedAt)}</p>
      <p class="meta"><strong>Total de veículos:</strong> ${seminovosVehicles.length}</p>
      <p class="meta"><strong>Total de OS:</strong> ${seminovosServiceOrders.length}</p>
      <p class="meta"><strong>Total de peças lançadas:</strong> ${parts.length}</p>
    </div>
    <h2>Veículos</h2>
    <table>
      <thead>
        <tr>
          <th>Placa</th>
          <th>Pátio</th>
          <th>Tipo</th>
          <th>Odômetro</th>
          <th>Situação</th>
          <th>Pós-venda / Garantia</th>
          <th>Vendido</th>
          <th>Última OS</th>
          <th>Observações</th>
        </tr>
      </thead>
      <tbody>
        ${seminovosVehicles.map(vehicle => `
          <tr>
            <td><strong>${escapeHtml(vehicle.plate)}</strong></td>
            <td>${escapeHtml(vehicle.yard || 'Não informado')}</td>
            <td>${escapeHtml(vehicle.type)}</td>
            <td>${formatNumberBR(vehicle.odometer)} km</td>
            <td>${escapeHtml(vehicle.operationalStatus)}</td>
            <td>${escapeHtml(vehicle.commercialStatus)}</td>
            <td>${vehicle.sold ? 'Sim' : 'Não'}</td>
            <td>${escapeHtml(vehicle.latestServiceOrderNumber || 'Sem OS')}</td>
            <td>${escapeHtml(vehicle.notes || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h2>Ordens de serviço</h2>
    <table>
      <thead>
        <tr>
          <th>Nº da OS</th>
          <th>Veículo</th>
          <th>Categoria</th>
          <th>Situação</th>
          <th>Odômetro</th>
          <th>Abertura</th>
          <th>Fechamento</th>
        </tr>
      </thead>
      <tbody>
        ${seminovosServiceOrders.length ? seminovosServiceOrders.map(order => `
          <tr>
            <td><strong>${escapeHtml(order.serviceOrderNumber)}</strong></td>
            <td>${escapeHtml(order.vehiclePlate)}</td>
            <td>${escapeHtml(order.category)}</td>
            <td>${escapeHtml(order.status)}</td>
            <td>${formatNumberBR(order.odometer)} km</td>
            <td>${escapeHtml(formatDateTimeBR(order.openedAt))}</td>
            <td>${escapeHtml(formatDateTimeBR(order.closedAt))}</td>
          </tr>
        `).join('') : '<tr><td colspan="7">Nenhuma ordem de serviço cadastrada.</td></tr>'}
      </tbody>
    </table>
    <h2>Peças utilizadas</h2>
    <table>
      <thead>
        <tr>
          <th>Veículo</th>
          <th>Nº da OS</th>
          <th>Categoria</th>
          <th>Peça</th>
          <th>Quantidade</th>
          <th>Observação</th>
        </tr>
      </thead>
      <tbody>
        ${parts.length ? parts.map(part => `
          <tr>
            <td>${escapeHtml(part.vehiclePlate)}</td>
            <td>${escapeHtml(part.serviceOrderNumber)}</td>
            <td>${escapeHtml(part.category)}</td>
            <td>${escapeHtml(part.partName)}</td>
            <td>${formatNumberBR(part.quantity)}</td>
            <td>${escapeHtml(part.notes || '—')}</td>
          </tr>
        `).join('') : '<tr><td colspan="6">Nenhuma peça lançada no módulo.</td></tr>'}
      </tbody>
    </table>
  `;

  if (openPrintWindow('Seminovos - Sua Empresa - PDF Completo', html)) {
    showToast('PDF completo do Seminovos gerado com sucesso', 'success');
  }
}

function exportSeminovosVehiclePDF(vehicleId) {
  const { vehicle, orders, parts } = getVehicleOrdersContext(vehicleId);
  if (!vehicle) {
    showToast('Veículo não encontrado para exportação', 'warning');
    return;
  }

  const photosHtml = (vehicle.photos || []).length
    ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
        ${(vehicle.photos || []).map(photo => `
          <div style="border:1px solid #dbe4ef;border-radius:12px;padding:10px;background:#fff;">
            <div style="font-weight:700;color:#1a3a5c;margin-bottom:8px;">${escapeHtml(photo.category)}</div>
            <img src="${escapeHtml(photo.filePath)}" alt="${escapeHtml(photo.category)}" style="width:100%;height:150px;object-fit:cover;border-radius:10px;border:1px solid #dbe4ef;">
          </div>
        `).join('')}
      </div>
    `
    : '<p>Nenhuma foto cadastrada.</p>';

  const html = `
    <style>
      body{font-family:Arial,sans-serif;margin:20px;color:#10233d;}
      h1{color:#1a3a5c;border-bottom:3px solid #1a3a5c;padding-bottom:10px;}
      h2{color:#2c5282;margin-top:28px;}
      .header{background:#f8fbff;border:1px solid #d8e3f1;border-radius:12px;padding:18px;margin-bottom:20px;}
      .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px;}
      .meta-card{background:#fff;border:1px solid #dbe4ef;border-radius:12px;padding:12px;}
      .meta-card small{display:block;color:#5b6b82;text-transform:uppercase;font-weight:700;margin-bottom:6px;}
      table{width:100%;border-collapse:collapse;margin:18px 0;font-size:12px;}
      th{background:#1a3a5c;color:#fff;padding:10px;text-align:left;}
      td{padding:8px;border-bottom:1px solid #dbe4ef;vertical-align:top;}
      tr:nth-child(even){background:#f8fbff;}
      .note-box{background:#fff;border:1px solid #dbe4ef;border-radius:12px;padding:14px;}
      @media print{body{margin:10px;}table{font-size:10px;}}
    </style>
    <div class="header">
      <h1>SEMINOVOS - SUA EMPRESA</h1>
      <p><strong>Ficha do veículo:</strong> ${escapeHtml(vehicle.plate)}</p>
      <p><strong>Gerado em:</strong> ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>
      <div class="meta-grid">
        <div class="meta-card"><small>Pátio</small>${escapeHtml(vehicle.yard || 'Não informado')}</div>
        <div class="meta-card"><small>Tipo</small>${escapeHtml(vehicle.type)}</div>
        <div class="meta-card"><small>Odômetro</small>${formatNumberBR(vehicle.odometer)} km</div>
        <div class="meta-card"><small>Situação</small>${escapeHtml(vehicle.operationalStatus)}</div>
        <div class="meta-card"><small>Pós-venda / Garantia</small>${escapeHtml(vehicle.commercialStatus)}</div>
        <div class="meta-card"><small>Vendido</small>${vehicle.sold ? 'Sim' : 'Não'}</div>
        <div class="meta-card"><small>Chassi</small>${escapeHtml(vehicle.chassis || 'Não informado')}</div>
        <div class="meta-card"><small>Última OS</small>${escapeHtml(vehicle.latestServiceOrderNumber || 'Sem OS')}</div>
      </div>
    </div>
    <h2>Observações gerais</h2>
    <div class="note-box">${escapeHtml(vehicle.notes || 'Sem observações registradas.')}</div>
    <h2>Fotos do veículo</h2>
    ${photosHtml}
    <h2>Ordens de serviço</h2>
    <table>
      <thead>
        <tr>
          <th>Nº da OS</th>
          <th>Categoria</th>
          <th>Situação</th>
          <th>Odômetro</th>
          <th>Abertura</th>
          <th>Fechamento</th>
        </tr>
      </thead>
      <tbody>
        ${orders.length ? orders.map(order => `
          <tr>
            <td><strong>${escapeHtml(order.serviceOrderNumber)}</strong></td>
            <td>${escapeHtml(order.category)}</td>
            <td>${escapeHtml(order.status)}</td>
            <td>${formatNumberBR(order.odometer)} km</td>
            <td>${escapeHtml(formatDateTimeBR(order.openedAt))}</td>
            <td>${escapeHtml(formatDateTimeBR(order.closedAt))}</td>
          </tr>
        `).join('') : '<tr><td colspan="6">Nenhuma ordem de serviço cadastrada para este veículo.</td></tr>'}
      </tbody>
    </table>
    <h2>Peças utilizadas</h2>
    <table>
      <thead>
        <tr>
          <th>Nº da OS</th>
          <th>Categoria</th>
          <th>Peça</th>
          <th>Quantidade</th>
          <th>Observação</th>
        </tr>
      </thead>
      <tbody>
        ${parts.length ? parts.map(part => `
          <tr>
            <td>${escapeHtml(part.serviceOrderNumber)}</td>
            <td>${escapeHtml(part.category)}</td>
            <td>${escapeHtml(part.partName)}</td>
            <td>${formatNumberBR(part.quantity)}</td>
            <td>${escapeHtml(part.notes || '—')}</td>
          </tr>
        `).join('') : '<tr><td colspan="5">Nenhuma peça lançada para este veículo.</td></tr>'}
      </tbody>
    </table>
  `;

  if (openPrintWindow(`Seminovos - Sua Empresa - ${vehicle.plate}`, html)) {
    showToast(`PDF do veículo ${vehicle.plate} gerado com sucesso`, 'success');
  }
}

async function exportSeminovosJson() {
  try {
    const payload = await fetchJson(`${SEMINOVOS_API}/export`);
    downloadJsonFile(`seminovos-sua-empresa-${getSeminovosDateStamp()}.json`, payload);
    showToast('JSON do módulo Seminovos exportado com sucesso', 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível exportar o JSON de Seminovos', 'danger');
  }
}

function triggerSeminovosJsonImport() {
  document.getElementById('seminovosImportJsonFile')?.click();
}

async function processSeminovosJsonImport(event) {
  const fileInput = event.currentTarget;
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const seminovosPayload = parsed?.seminovos && typeof parsed.seminovos === 'object' ? parsed.seminovos : parsed;
    const vehiclesCount = Array.isArray(seminovosPayload?.vehicles) ? seminovosPayload.vehicles.length : 0;
    const ordersCount = Array.isArray(seminovosPayload?.serviceOrders) ? seminovosPayload.serviceOrders.length : 0;

    if (!window.confirm(`Substituir os dados do módulo Seminovos por ${vehiclesCount} veículo(s) e ${ordersCount} ordem(ns) de serviço?`)) {
      return;
    }

    const result = await fetchJson(`${SEMINOVOS_API}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(seminovosPayload)
    });

    await loadSeminovosData();
    const backupInfo = result?.backupFile ? ` Backup automático: ${result.backupFile}.` : '';
    showToast(`Importação do Seminovos concluída.${backupInfo}`, 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível importar o JSON de Seminovos', 'danger');
  } finally {
    fileInput.value = '';
  }
}

function renderSeminovosModule() {
  renderDashboard();
  renderVehiclesTable();
  renderOrdersTable();
  renderPartsView();
  populateOrderVehicleOptions();
  openView(seminovosCurrentView || 'painel');
}
function getDashboardCards() {
  return [
    { label: 'Total de veículos', value: seminovosVehicles.length, helper: 'Base cadastrada no módulo', action: () => { clearVehicleFilters(); openView('veiculos'); } },
    { label: 'Disponíveis', value: seminovosVehicles.filter(v => v.operationalStatus === 'Disponível').length, helper: 'Prontos para movimentação', action: () => applyVehicleStatusFilter('Disponível') },
    { label: 'Em manutenção', value: seminovosVehicles.filter(v => v.operationalStatus === 'Em manutenção').length, helper: 'Atendimento mecânico em curso', action: () => applyVehicleStatusFilter('Em manutenção') },
    { label: 'Em borracharia', value: seminovosVehicles.filter(v => v.operationalStatus === 'Em borracharia').length, helper: 'Serviço de pneus e rodas', action: () => applyVehicleStatusFilter('Em borracharia') },
    { label: 'Em funilaria', value: seminovosVehicles.filter(v => v.operationalStatus === 'Em funilaria').length, helper: 'Reparo estrutural ou estético', action: () => applyVehicleStatusFilter('Em funilaria') },
    { label: 'Pendente documentação', value: seminovosVehicles.filter(v => v.operationalStatus === 'Pendente de documentação').length, helper: 'Impedimento documental', action: () => applyVehicleStatusFilter('Pendente de documentação') },
    { label: 'Problema mecânico', value: seminovosVehicles.filter(v => v.operationalStatus === 'Problema mecânico').length, helper: 'Parados por falha mecânica', action: () => applyVehicleStatusFilter('Problema mecânico') },
    { label: 'Aguardando peça', value: seminovosVehicles.filter(v => v.operationalStatus === 'Aguardando peça').length, helper: 'Dependem de componente', action: () => applyVehicleStatusFilter('Aguardando peça') },
    { label: 'Pós-venda', value: seminovosVehicles.filter(v => v.commercialStatus === 'Pós-venda' || v.commercialStatus === 'Pós-venda e garantia').length, helper: 'Acompanhamento comercial ativo', action: () => applyCommercialStatusFilter('Pós-venda') },
    { label: 'Garantia', value: seminovosVehicles.filter(v => v.commercialStatus === 'Garantia' || v.commercialStatus === 'Pós-venda e garantia').length, helper: 'Atendimento coberto por garantia', action: () => applyCommercialStatusFilter('Garantia') },
    { label: 'Vendidos', value: seminovosVehicles.filter(v => v.sold).length, helper: 'Veículos marcados como vendidos', action: () => applySoldFilter('true') }
  ];
}

function renderDashboard() {
  const cards = getDashboardCards();
  const cardsContainer = document.getElementById('seminovosDashboardCards');
  cardsContainer.innerHTML = cards.map((card, index) => `
    <button type="button" class="panel-card text-start border-0" data-dashboard-index="${index}">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${escapeHtml(String(card.value))}</div>
      <div class="helper">${escapeHtml(card.helper)}</div>
    </button>
  `).join('');
  cardsContainer.querySelectorAll('[data-dashboard-index]').forEach(button => {
    button.addEventListener('click', () => cards[Number(button.dataset.dashboardIndex)]?.action?.());
  });

  const attentionVehicles = seminovosVehicles
    .filter(vehicle => !['Disponível', 'Liberado'].includes(vehicle.operationalStatus) || vehicle.commercialStatus !== 'Nenhum')
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 8);
  const attentionList = document.getElementById('seminovosAttentionList');
  if (!attentionVehicles.length) {
    attentionList.innerHTML = '<div class="empty-state"><i class="bi bi-check2-circle fs-2 d-block mb-2"></i>Nenhum veículo exige atenção imediata neste momento.</div>';
  } else {
    attentionList.innerHTML = attentionVehicles.map(vehicle => `
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 py-2 border-bottom">
        <div>
          <div class="mb-2">${renderClickablePlate(vehicle.plate, vehicle.id)}</div>
          <div class="d-flex flex-wrap gap-2 mb-2">${renderYardBadge(vehicle.yard)} ${renderVehicleType(vehicle.type)} ${renderVehicleStatus(vehicle.operationalStatus)} ${renderCommercialStatus(vehicle.commercialStatus)} ${renderSoldBadge(vehicle.sold)}</div>
          <small class="text-muted">Odômetro: ${formatNumberBR(vehicle.odometer)} km • Atualizado em ${formatDateTimeBR(vehicle.updatedAt)}</small>
        </div>
        <div class="d-flex gap-2 flex-wrap attention-actions">
          <button type="button" class="btn btn-outline-warning btn-sm" onclick="openSeminovosVehicleModal('${vehicle.id}')" title="Editar veículo ${escapeHtml(vehicle.plate)}"><i class="bi bi-pencil me-1"></i>Editar</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="viewSeminovosVehicleDetails('${vehicle.id}')" title="Ver ficha do veículo ${escapeHtml(vehicle.plate)}"><i class="bi bi-eye me-1"></i>Ficha</button>
        </div>
      </div>
    `).join('');
  }

  const openOrders = seminovosServiceOrders.filter(order => !['Concluída', 'Cancelada'].includes(order.status)).slice(0, 8);
  const openOrdersList = document.getElementById('seminovosOpenOrdersList');
  if (!openOrders.length) {
    openOrdersList.innerHTML = '<div class="empty-state"><i class="bi bi-clipboard2-check fs-2 d-block mb-2"></i>Nenhuma ordem de serviço em aberto.</div>';
  } else {
    openOrdersList.innerHTML = openOrders.map(order => `
      <div class="py-2 border-bottom">
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div>
            <strong>OS ${escapeHtml(order.serviceOrderNumber)}</strong>
            <div class="mt-2 d-flex flex-wrap gap-2">${renderVehicleStatus(order.status)} ${renderVehicleType(order.vehicleType)}</div>
            <small class="text-muted d-block mt-2">${escapeHtml(order.vehiclePlate)} • ${escapeHtml(order.category)} • ${formatDateTimeBR(order.openedAt)}</small>
          </div>
          <button type="button" class="btn btn-outline-warning btn-sm" onclick="openSeminovosOrderModal('${order.id}')"><i class="bi bi-pencil"></i></button>
        </div>
      </div>
    `).join('');
  }
}

function getFilteredVehicles() {
  const search = document.getElementById('seminovosVehicleSearch').value.trim().toLowerCase();
  const yard = document.getElementById('seminovosVehicleYardFilter').value;
  const type = document.getElementById('seminovosVehicleTypeFilter').value;
  const status = document.getElementById('seminovosVehicleStatusFilter').value;
  const commercial = document.getElementById('seminovosVehicleCommercialFilter').value;
  const sold = document.getElementById('seminovosVehicleSoldFilter')?.value || '';
  return seminovosVehicles.filter(vehicle => {
    const haystack = `${vehicle.plate} ${vehicle.yard} ${vehicle.chassis} ${vehicle.notes} ${vehicle.latestServiceOrderNumber} ${vehicle.sold ? 'vendido' : 'nao vendido não vendido'}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (yard && vehicle.yard !== yard) return false;
    if (type && vehicle.type !== type) return false;
    if (status && vehicle.operationalStatus !== status) return false;
    if (commercial) {
      if (commercial === 'Pós-venda') {
        if (!['Pós-venda', 'Pós-venda e garantia'].includes(vehicle.commercialStatus)) return false;
      } else if (commercial === 'Garantia') {
        if (!['Garantia', 'Pós-venda e garantia'].includes(vehicle.commercialStatus)) return false;
      } else if (vehicle.commercialStatus !== commercial) {
        return false;
      }
    }
    if (sold && String(Boolean(vehicle.sold)) !== sold) return false;
    return true;
  });
}

function renderVehiclesTable() {
  const tbody = document.getElementById('seminovosVehiclesTableBody');
  const emptyState = document.getElementById('seminovosVehiclesEmptyState');
  const filtered = getFilteredVehicles();
  emptyState.classList.toggle('hidden', filtered.length > 0);
  if (!filtered.length) {
    tbody.innerHTML = '';
    return;
  }
  tbody.innerHTML = filtered.map(vehicle => `
    <tr>
      <td>${renderClickablePlate(vehicle.plate, vehicle.id)}</td>
      <td>${renderYardBadge(vehicle.yard)}</td>
      <td>${renderVehicleType(vehicle.type)}</td>
      <td><strong>${formatNumberBR(vehicle.odometer)}</strong> km</td>
      <td>${renderVehicleStatus(vehicle.operationalStatus)}</td>
      <td>${renderCommercialStatus(vehicle.commercialStatus)}</td>
      <td>${renderSoldBadge(vehicle.sold)}</td>
      <td>${vehicle.latestServiceOrderNumber ? `<span class="fw-semibold">${escapeHtml(vehicle.latestServiceOrderNumber)}</span>` : '<span class="text-muted">Sem OS</span>'}</td>
      <td><span class="badge text-bg-light border"><i class="bi bi-images me-1"></i>${vehicle.photoCount || 0}</span></td>
      <td><small>${formatDateTimeBR(vehicle.updatedAt)}</small></td>
      <td>
        <div class="d-flex gap-2 flex-wrap">
          <button type="button" class="btn btn-outline-primary btn-sm" onclick="exportSeminovosVehiclePDF('${vehicle.id}')" title="Exportar PDF do veículo"><i class="bi bi-file-earmark-pdf"></i></button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="viewSeminovosVehicleDetails('${vehicle.id}')"><i class="bi bi-eye"></i></button>
          <button type="button" class="btn btn-outline-warning btn-sm" onclick="openSeminovosVehicleModal('${vehicle.id}')"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-outline-dark btn-sm" onclick="openSeminovosOrderModal('', '${vehicle.id}')"><i class="bi bi-tools"></i></button>
          <button type="button" class="btn btn-outline-danger btn-sm" onclick="deleteSeminovosVehicle('${vehicle.id}')"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}
function getFilteredOrders() {
  const search = document.getElementById('seminovosOrderSearch').value.trim().toLowerCase();
  const category = document.getElementById('seminovosOrderCategoryFilter').value;
  const status = document.getElementById('seminovosOrderStatusFilter').value;
  return seminovosServiceOrders.filter(order => {
    const haystack = `${order.serviceOrderNumber} ${order.vehiclePlate} ${order.description} ${order.notes}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (category && order.category !== category) return false;
    if (status && order.status !== status) return false;
    return true;
  });
}

function renderOrdersTable() {
  const tbody = document.getElementById('seminovosOrdersTableBody');
  const emptyState = document.getElementById('seminovosOrdersEmptyState');
  const filtered = getFilteredOrders();
  emptyState.classList.toggle('hidden', filtered.length > 0);
  if (!filtered.length) {
    tbody.innerHTML = '';
    return;
  }
  tbody.innerHTML = filtered.map(order => `
    <tr>
      <td><strong>${escapeHtml(order.serviceOrderNumber)}</strong></td>
      <td>
        <div class="mb-1">${renderClickablePlate(order.vehiclePlate, order.vehicleId)}</div>
        <small>${renderVehicleType(order.vehicleType)}</small>
      </td>
      <td>${escapeHtml(order.category)}</td>
      <td>${renderVehicleStatus(order.status)}</td>
      <td>${formatNumberBR(order.odometer)} km</td>
      <td><small>${formatDateTimeBR(order.openedAt)}</small></td>
      <td><small>${formatDateTimeBR(order.closedAt)}</small></td>
      <td><span class="badge text-bg-light border">${order.parts?.length || 0}</span></td>
      <td>
        <div class="d-flex gap-2 flex-wrap">
          <button type="button" class="btn btn-outline-warning btn-sm" onclick="openSeminovosOrderModal('${order.id}')"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-outline-danger btn-sm" onclick="deleteSeminovosOrder('${order.id}')"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function getFlattenedParts() {
  return seminovosServiceOrders.flatMap(order => (order.parts || []).map(part => ({
    ...part,
    vehicleId: order.vehicleId,
    vehiclePlate: order.vehiclePlate,
    serviceOrderNumber: order.serviceOrderNumber,
    category: order.category,
    openedAt: order.openedAt
  })));
}

function renderPartsView() {
  const search = document.getElementById('seminovosPartsSearch').value.trim().toLowerCase();
  const parts = getFlattenedParts();
  const filtered = parts.filter(part => {
    const haystack = `${part.vehiclePlate} ${part.serviceOrderNumber} ${part.partName} ${part.notes}`.toLowerCase();
    return !search || haystack.includes(search);
  });

  const uniqueVehicles = new Set(filtered.map(part => part.vehiclePlate)).size;
  const totalQuantity = filtered.reduce((acc, part) => acc + Number(part.quantity || 0), 0);
  const summary = [
    { label: 'Itens registrados', value: filtered.length, helper: 'Lançamentos de peças' },
    { label: 'Quantidade total', value: totalQuantity, helper: 'Soma das quantidades usadas' },
    { label: 'Veículos impactados', value: uniqueVehicles, helper: 'Veículos com peças registradas' }
  ];
  document.getElementById('seminovosPartsSummary').innerHTML = summary.map(item => `
    <div class="panel-card text-start border-0">
      <div class="label">${escapeHtml(item.label)}</div>
      <div class="value">${escapeHtml(String(item.value))}</div>
      <div class="helper">${escapeHtml(item.helper)}</div>
    </div>
  `).join('');

  const tbody = document.getElementById('seminovosPartsTableBody');
  const emptyState = document.getElementById('seminovosPartsEmptyState');
  emptyState.classList.toggle('hidden', filtered.length > 0);
  if (!filtered.length) {
    tbody.innerHTML = '';
    return;
  }
  tbody.innerHTML = filtered.map(part => `
    <tr>
      <td>${renderClickablePlate(part.vehiclePlate, part.vehicleId)}</td>
      <td><strong>${escapeHtml(part.serviceOrderNumber)}</strong></td>
      <td>${escapeHtml(part.category)}</td>
      <td>${escapeHtml(part.partName)}</td>
      <td>${formatNumberBR(part.quantity)}</td>
      <td><small>${escapeHtml(part.notes || '—')}</small></td>
      <td><small>${formatDateTimeBR(part.createdAt || part.openedAt)}</small></td>
    </tr>
  `).join('');
}

function clearVehicleFilters() {
  document.getElementById('seminovosVehicleSearch').value = '';
  document.getElementById('seminovosVehicleYardFilter').value = '';
  document.getElementById('seminovosVehicleTypeFilter').value = '';
  document.getElementById('seminovosVehicleStatusFilter').value = '';
  document.getElementById('seminovosVehicleCommercialFilter').value = '';
  const soldFilter = document.getElementById('seminovosVehicleSoldFilter');
  if (soldFilter) soldFilter.value = '';
  renderVehiclesTable();
}

function applyVehicleStatusFilter(status) {
  openView('veiculos');
  document.getElementById('seminovosVehicleStatusFilter').value = status;
  renderVehiclesTable();
}

function applyCommercialStatusFilter(status) {
  openView('veiculos');
  document.getElementById('seminovosVehicleCommercialFilter').value = status;
  renderVehiclesTable();
}

function applySoldFilter(value) {
  openView('veiculos');
  const soldFilter = document.getElementById('seminovosVehicleSoldFilter');
  if (soldFilter) soldFilter.value = value;
  renderVehiclesTable();
}

function renderVehiclePhotoFields(existingPhotos = []) {
  const photosByCategory = new Map(existingPhotos.map(photo => [photo.category, photo]));
  const container = document.getElementById('seminovosVehiclePhotoFields');
  if (!container) return;

  container.querySelectorAll('.photo-slot').forEach(releaseVehiclePhotoObjectUrl);
  container.innerHTML = SEMINOVOS_PHOTO_CATEGORIES.map(category => {
    const photo = photosByCategory.get(category);
    const safeId = category.replace(/[^a-zA-Z0-9]/g, '');
    const inputId = `seminovosPhotoInput${safeId}`;
    const previewAttributes = photo?.filePath
      ? buildSeminovosImageTriggerAttributes({
          src: photo.filePath,
          title: `${category} - ${photo.fileName || 'Foto do veículo'}`,
          meta: 'Foto cadastrada. Toque para ampliar.'
        })
      : '';
    return `
      <div class="photo-slot ${photo ? 'has-current-photo' : ''}" data-category="${escapeHtml(category)}">
        <div class="photo-slot-title">${escapeHtml(category)}</div>
        <div class="photo-preview ${photo ? 'can-view-fullscreen' : 'empty'}" data-preview="${escapeHtml(category)}" ${previewAttributes}>
          ${photo ? `<img src="${escapeHtml(photo.filePath)}" alt="${escapeHtml(category)}"><span class="photo-preview-zoom-hint"><i class="bi bi-arrows-fullscreen"></i>Toque para ampliar</span>` : '<span>Sem foto nesta categoria</span>'}
        </div>
        <div class="photo-actions">
          <input type="file" class="seminovos-photo-input" id="${inputId}" accept="image/*">
          <label class="photo-action-btn" for="${inputId}">
            <i class="bi bi-camera-fill"></i>${photo ? 'Trocar foto' : 'Adicionar foto'}
          </label>
          <div class="photo-file-name" data-file-name>${photo ? 'Foto atual cadastrada. Escolha outra para substituir.' : 'Nenhum arquivo selecionado.'}</div>
        </div>
        <div class="form-check mt-2">
          <input class="form-check-input seminovos-photo-remove" type="checkbox" id="removePhoto${safeId}">
          <label class="form-check-label small" for="removePhoto${safeId}">Remover foto atual</label>
        </div>
        <div class="form-text">Imagem comprimida automaticamente antes do envio.</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.seminovos-photo-input').forEach(input => {
    input.addEventListener('change', handlePhotoInputChange);
  });
}

function handlePhotoInputChange(event) {
  const input = event.currentTarget;
  const slot = input.closest('.photo-slot');
  if (!slot) return;
  const preview = slot.querySelector('.photo-preview');
  const removeToggle = slot.querySelector('.seminovos-photo-remove');
  const fileName = slot.querySelector('[data-file-name]');
  const file = input.files?.[0];
  if (!file) return;
  removeToggle.checked = false;
  slot.classList.add('has-current-photo');
  releaseVehiclePhotoObjectUrl(slot);
  const objectUrl = URL.createObjectURL(file);
  slot.dataset.previewObjectUrl = objectUrl;
  preview.classList.remove('empty');
  preview.classList.add('can-view-fullscreen');
  preview.innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="Pré-visualização de ${escapeHtml(slot.dataset.category || 'foto do veículo')}"><span class="photo-preview-zoom-hint"><i class="bi bi-arrows-fullscreen"></i>Toque para ampliar</span>`;
  setSeminovosImageTrigger(preview, {
    src: objectUrl,
    title: `${slot.dataset.category || 'Foto do veículo'} - pré-visualização`,
    meta: 'Imagem local selecionada. Toque para ampliar antes de salvar.'
  });
  if (fileName) {
    fileName.textContent = `Nova foto selecionada: ${file.name}`;
  }
}

async function compressImage(file) {
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const presets = [
    { maxDimension: 1400, quality: 0.68 },
    { maxDimension: 1280, quality: 0.6 },
    { maxDimension: 1080, quality: 0.52 },
    { maxDimension: 960, quality: 0.46 }
  ];
  const maxBytes = 350 * 1024;
  let bestResult = '';

  for (const preset of presets) {
    let { width, height } = image;
    if (width > preset.maxDimension || height > preset.maxDimension) {
      const ratio = Math.min(preset.maxDimension / width, preset.maxDimension / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/webp', preset.quality);
    bestResult = dataUrl;
    const base64Length = dataUrl.split(',')[1]?.length || 0;
    const approxBytes = Math.ceil((base64Length * 3) / 4);
    if (approxBytes <= maxBytes) {
      return dataUrl;
    }
  }

  return bestResult;
}

async function collectVehiclePhotoPayloads() {
  const slots = Array.from(document.querySelectorAll('#seminovosVehiclePhotoFields .photo-slot'));
  const payloads = [];
  for (const slot of slots) {
    const category = slot.dataset.category;
    const file = slot.querySelector('.seminovos-photo-input').files?.[0];
    const remove = slot.querySelector('.seminovos-photo-remove').checked;
    if (file) {
      payloads.push({ category, dataUrl: await compressImage(file) });
    } else if (remove) {
      payloads.push({ category, remove: true });
    }
  }
  return payloads;
}

function getVehicleFormElements() {
  const requiredIds = [
    'seminovosVehicleForm',
    'seminovosVehicleId',
    'seminovosVehicleModalTitle',
    'seminovosVehiclePlate',
    'seminovosVehicleType',
    'seminovosVehicleYard',
    'seminovosVehicleChassis',
    'seminovosVehicleOdometer',
    'seminovosVehicleOperationalStatus',
    'seminovosVehicleCommercialStatus',
    'seminovosVehicleSold',
    'seminovosVehicleNotes'
  ];
  const elements = Object.fromEntries(requiredIds.map(id => [id, document.getElementById(id)]));
  const missing = requiredIds.filter(id => !elements[id]);
  if (missing.length) {
    throw new Error('Tela do Seminovos desatualizada. Atualize public/seminovos.html e public/js/seminovos.js no servidor.');
  }
  return elements;
}

function resetVehicleForm() {
  const fields = getVehicleFormElements();
  fields.seminovosVehicleForm.reset();
  fields.seminovosVehicleId.value = '';
  fields.seminovosVehicleModalTitle.textContent = 'Novo veículo seminovo';
  fields.seminovosVehicleYard.value = SEMINOVOS_YARDS[0];
  fields.seminovosVehicleOperationalStatus.value = 'Disponível';
  fields.seminovosVehicleCommercialStatus.value = 'Nenhum';
  fields.seminovosVehicleSold.checked = false;
  renderVehiclePhotoFields([]);
}

function openSeminovosVehicleModal(id = '') {
  try {
    const modalElement = document.getElementById('seminovosVehicleModal');
    if (!modalElement) {
      throw new Error('Modal do Seminovos não encontrado. Atualize public/seminovos.html no servidor.');
    }
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    resetVehicleForm();
    if (id) {
      const vehicle = getVehicleById(id);
      if (!vehicle) return;
      const fields = getVehicleFormElements();
      fields.seminovosVehicleModalTitle.textContent = `Editar veículo ${vehicle.plate}`;
      fields.seminovosVehicleId.value = vehicle.id;
      fields.seminovosVehiclePlate.value = vehicle.plate;
      fields.seminovosVehicleType.value = vehicle.type;
      fields.seminovosVehicleYard.value = vehicle.yard || '';
      fields.seminovosVehicleChassis.value = vehicle.chassis || '';
      fields.seminovosVehicleOdometer.value = vehicle.odometer || 0;
      fields.seminovosVehicleOperationalStatus.value = vehicle.operationalStatus;
      fields.seminovosVehicleCommercialStatus.value = vehicle.commercialStatus;
      fields.seminovosVehicleSold.checked = Boolean(vehicle.sold);
      fields.seminovosVehicleNotes.value = vehicle.notes || '';
      renderVehiclePhotoFields(vehicle.photos || []);
    }
    modal.show();
  } catch (error) {
    showToast(error.message || 'Não foi possível abrir o formulário do veículo', 'danger');
  }
}

async function saveSeminovosVehicle(event) {
  event.preventDefault();
  try {
    const fields = getVehicleFormElements();
    const id = fields.seminovosVehicleId.value;
    const payload = {
      plate: fields.seminovosVehiclePlate.value.trim().toUpperCase(),
      type: fields.seminovosVehicleType.value,
      yard: fields.seminovosVehicleYard.value,
      chassis: fields.seminovosVehicleChassis.value.trim(),
      odometer: fields.seminovosVehicleOdometer.value,
      operationalStatus: fields.seminovosVehicleOperationalStatus.value,
      commercialStatus: fields.seminovosVehicleCommercialStatus.value,
      sold: fields.seminovosVehicleSold.checked,
      notes: fields.seminovosVehicleNotes.value,
      photos: await collectVehiclePhotoPayloads()
    };
    const result = await fetchJson(id ? `${SEMINOVOS_API}/vehicles/${id}` : `${SEMINOVOS_API}/vehicles`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    bootstrap.Modal.getInstance(document.getElementById('seminovosVehicleModal')).hide();
    await loadSeminovosData();
    if (!id && result?.linkedPatioVehicle) {
      showToast(`Veículo cadastrado no Seminovos, baixado e sinalizado no sistema principal (${result.linkedPatioVehicle.plate})`, 'success');
      return;
    }
    showToast(id ? 'Veículo atualizado com sucesso' : 'Veículo cadastrado com sucesso', 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar o veículo', 'danger');
  }
}

async function deleteSeminovosVehicle(id) {
  const vehicle = getVehicleById(id);
  if (!vehicle) return;
  if (!window.confirm(`Excluir o veículo ${vehicle.plate} do módulo Seminovos?`)) return;
  try {
    await fetchJson(`${SEMINOVOS_API}/vehicles/${id}`, { method: 'DELETE' });
    await loadSeminovosData();
    showToast('Veículo excluído com sucesso', 'warning');
  } catch (error) {
    showToast(error.message || 'Não foi possível excluir o veículo', 'danger');
  }
}

function renderPartRow(part = {}) {
  return `
    <div class="part-row" data-part-row>
      <input type="text" class="form-control part-name" placeholder="Peça utilizada" value="${escapeHtml(part.partName || '')}">
      <input type="number" class="form-control part-quantity" min="1" step="1" placeholder="Qtd" value="${escapeHtml(String(part.quantity || 1))}">
      <input type="text" class="form-control part-notes" placeholder="Observação" value="${escapeHtml(part.notes || '')}">
      <button type="button" class="btn btn-outline-danger" data-remove-part><i class="bi bi-trash"></i></button>
    </div>
  `;
}

function bindPartRowButtons() {
  document.querySelectorAll('[data-remove-part]').forEach(button => {
    button.onclick = () => {
      button.closest('[data-part-row]')?.remove();
      if (!document.querySelector('#seminovosOrderPartsContainer [data-part-row]')) {
        addSeminovosPartRow();
      }
    };
  });
}

function addSeminovosPartRow(part = {}) {
  const container = document.getElementById('seminovosOrderPartsContainer');
  container.insertAdjacentHTML('beforeend', renderPartRow(part));
  bindPartRowButtons();
}

function collectOrderParts() {
  return Array.from(document.querySelectorAll('#seminovosOrderPartsContainer [data-part-row]')).map(row => ({
    partName: row.querySelector('.part-name').value.trim(),
    quantity: row.querySelector('.part-quantity').value,
    notes: row.querySelector('.part-notes').value.trim()
  })).filter(part => part.partName);
}

function populateOrderVehicleOptions() {
  const select = document.getElementById('seminovosOrderVehicleId');
  const options = ['<option value="">Selecione um veículo</option>']
    .concat([...seminovosVehicles]
      .sort((a, b) => a.plate.localeCompare(b.plate))
      .map(vehicle => `<option value="${vehicle.id}">${escapeHtml(vehicle.plate)} • ${escapeHtml(vehicle.type)} • ${escapeHtml(formatSeminovosYardLabel(vehicle.yard))}</option>`));
  select.innerHTML = options.join('');
}

function openSeminovosVehicleEditFromDetails(id = '') {
  if (!id) return;
  const detailsModalEl = document.getElementById('seminovosVehicleDetailsModal');
  const detailsModal = bootstrap.Modal.getInstance(detailsModalEl);
  if (!detailsModal) {
    openSeminovosVehicleModal(id);
    return;
  }

  const handleHidden = () => {
    detailsModalEl.removeEventListener('hidden.bs.modal', handleHidden);
    openSeminovosVehicleModal(id);
  };

  detailsModalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });
  detailsModal.hide();
}

function ensureSeminovosDetailsEditButton() {
  const modal = document.getElementById('seminovosVehicleDetailsModal');
  if (!modal) return null;
  const footer = modal.querySelector('.modal-footer');
  if (!footer) return null;

  let editButton = document.getElementById('btnEditSeminovosVehicleDetails');
  if (!editButton) {
    editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-warning';
    editButton.id = 'btnEditSeminovosVehicleDetails';
    editButton.innerHTML = '<i class="bi bi-pencil me-1"></i>Editar veículo';

    const closeButton = footer.querySelector('[data-bs-dismiss="modal"]');
    if (closeButton) {
      footer.insertBefore(editButton, closeButton);
    } else {
      footer.appendChild(editButton);
    }
  }

  if (editButton.dataset.editBound !== 'true') {
    editButton.addEventListener('click', (event) => {
      openSeminovosVehicleEditFromDetails(event.currentTarget.dataset.vehicleId || '');
    });
    editButton.dataset.editBound = 'true';
  }

  return editButton;
}

function resetOrderForm() {
  document.getElementById('seminovosOrderForm').reset();
  document.getElementById('seminovosOrderId').value = '';
  document.getElementById('seminovosOrderModalTitle').textContent = 'Nova ordem de serviço';
  document.getElementById('seminovosOrderOpenedAt').value = getLocalDateTimeInputValue();
  document.getElementById('seminovosOrderStatus').value = 'Aberta';
  document.getElementById('seminovosOrderCategory').value = 'Manutenção';
  document.getElementById('seminovosOrderPartsContainer').innerHTML = '';
  addSeminovosPartRow();
}

function openSeminovosOrderModal(id = '', vehicleId = '') {
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('seminovosOrderModal'));
  resetOrderForm();
  if (vehicleId) {
    document.getElementById('seminovosOrderVehicleId').value = vehicleId;
    const vehicle = getVehicleById(vehicleId);
    if (vehicle) document.getElementById('seminovosOrderOdometer').value = vehicle.odometer || 0;
  }
  if (id) {
    const order = getServiceOrderById(id);
    if (!order) return;
    document.getElementById('seminovosOrderModalTitle').textContent = `Editar OS ${order.serviceOrderNumber}`;
    document.getElementById('seminovosOrderId').value = order.id;
    document.getElementById('seminovosOrderVehicleId').value = order.vehicleId;
    document.getElementById('seminovosOrderNumber').value = order.serviceOrderNumber;
    document.getElementById('seminovosOrderCategory').value = order.category;
    document.getElementById('seminovosOrderStatus').value = order.status;
    document.getElementById('seminovosOrderOdometer').value = order.odometer || 0;
    document.getElementById('seminovosOrderOpenedAt').value = order.openedAt ? getLocalDateTimeInputValue(new Date(order.openedAt)) : getLocalDateTimeInputValue();
    document.getElementById('seminovosOrderClosedAt').value = order.closedAt ? getLocalDateTimeInputValue(new Date(order.closedAt)) : '';
    document.getElementById('seminovosOrderDescription').value = order.description || '';
    document.getElementById('seminovosOrderNotes').value = order.notes || '';
    document.getElementById('seminovosOrderPartsContainer').innerHTML = '';
    if ((order.parts || []).length) {
      order.parts.forEach(part => addSeminovosPartRow(part));
    } else {
      addSeminovosPartRow();
    }
  }
  modal.show();
}

async function saveSeminovosOrder(event) {
  event.preventDefault();
  const id = document.getElementById('seminovosOrderId').value;
  const payload = {
    vehicleId: document.getElementById('seminovosOrderVehicleId').value,
    serviceOrderNumber: document.getElementById('seminovosOrderNumber').value.trim(),
    category: document.getElementById('seminovosOrderCategory').value,
    status: document.getElementById('seminovosOrderStatus').value,
    odometer: document.getElementById('seminovosOrderOdometer').value,
    openedAt: serializeDateTimeInputValue(document.getElementById('seminovosOrderOpenedAt').value),
    closedAt: serializeDateTimeInputValue(document.getElementById('seminovosOrderClosedAt').value),
    description: document.getElementById('seminovosOrderDescription').value,
    notes: document.getElementById('seminovosOrderNotes').value,
    parts: collectOrderParts()
  };

  try {
    await fetchJson(id ? `${SEMINOVOS_API}/service-orders/${id}` : `${SEMINOVOS_API}/service-orders`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    bootstrap.Modal.getInstance(document.getElementById('seminovosOrderModal')).hide();
    await loadSeminovosData();
    showToast(id ? 'Ordem de serviço atualizada com sucesso' : 'Ordem de serviço registrada com sucesso', 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar a ordem de serviço', 'danger');
  }
}

async function deleteSeminovosOrder(id) {
  const order = getServiceOrderById(id);
  if (!order) return;
  if (!window.confirm(`Excluir a OS ${order.serviceOrderNumber}?`)) return;
  try {
    await fetchJson(`${SEMINOVOS_API}/service-orders/${id}`, { method: 'DELETE' });
    await loadSeminovosData();
    showToast('Ordem de serviço excluída com sucesso', 'warning');
  } catch (error) {
    showToast(error.message || 'Não foi possível excluir a ordem de serviço', 'danger');
  }
}

function viewSeminovosVehicleDetails(id) {
  const vehicle = getVehicleById(id);
  if (!vehicle) return;

  const relatedOrders = seminovosServiceOrders
    .filter(order => String(order.vehicleId) === String(vehicle.id))
    .sort((a, b) => new Date(b.openedAt || 0) - new Date(a.openedAt || 0));

  const relatedParts = relatedOrders.flatMap(order => (order.parts || []).map(part => ({
    ...part,
    serviceOrderNumber: order.serviceOrderNumber,
    category: order.category
  })));

  const photosHtml = (vehicle.photos || []).length
    ? `
      <div class="row g-3">
        ${(vehicle.photos || []).map(photo => `
          <div class="col-md-4">
            <div class="surface-card h-100">
              <div class="mb-2 fw-semibold">${escapeHtml(photo.category)}</div>
              <button type="button" class="seminovos-photo-trigger" ${buildSeminovosImageTriggerAttributes({
                src: photo.filePath,
                title: `${photo.category} - ${vehicle.plate}`,
                meta: `${formatDateTimeBR(photo.createdAt || photo.updatedAt)} • Toque para ampliar`
              })}>
                <img src="${escapeHtml(photo.filePath)}" alt="${escapeHtml(photo.category)}" class="img-fluid rounded border seminovos-detail-photo">
                <span class="seminovos-photo-trigger-label"><i class="bi bi-arrows-fullscreen"></i>Ver em tela cheia</span>
              </button>
              <small class="text-muted d-block mt-2">${formatDateTimeBR(photo.createdAt || photo.updatedAt)}</small>
            </div>
          </div>
        `).join('')}
      </div>
    `
    : '<div class="empty-state"><i class="bi bi-image fs-2 d-block mb-2"></i>Nenhuma foto cadastrada para este veículo.</div>';

  const ordersHtml = relatedOrders.length
    ? `
      <div class="table-responsive">
        <table class="table align-middle">
          <thead>
            <tr>
              <th>Nº da OS</th>
              <th>Categoria</th>
              <th>Situação</th>
              <th>Odômetro</th>
              <th>Abertura</th>
              <th>Fechamento</th>
            </tr>
          </thead>
          <tbody>
            ${relatedOrders.map(order => `
              <tr>
                <td><strong>${escapeHtml(order.serviceOrderNumber)}</strong></td>
                <td>${escapeHtml(order.category)}</td>
                <td>${renderVehicleStatus(order.status)}</td>
                <td>${formatNumberBR(order.odometer)} km</td>
                <td>${formatDateTimeBR(order.openedAt)}</td>
                <td>${formatDateTimeBR(order.closedAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '<div class="empty-state"><i class="bi bi-tools fs-2 d-block mb-2"></i>Nenhuma ordem de serviço registrada para este veículo.</div>';

  const partsHtml = relatedParts.length
    ? `
      <div class="table-responsive">
        <table class="table align-middle">
          <thead>
            <tr>
              <th>Nº da OS</th>
              <th>Categoria</th>
              <th>Peça</th>
              <th>Quantidade</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            ${relatedParts.map(part => `
              <tr>
                <td><strong>${escapeHtml(part.serviceOrderNumber)}</strong></td>
                <td>${escapeHtml(part.category)}</td>
                <td>${escapeHtml(part.partName)}</td>
                <td>${formatNumberBR(part.quantity)}</td>
                <td>${escapeHtml(part.notes || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '<div class="empty-state"><i class="bi bi-box-seam fs-2 d-block mb-2"></i>Nenhuma peça registrada para este veículo.</div>';

  document.getElementById('seminovosVehicleDetailsContent').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-lg-8">
        <div class="surface-card h-100">
          <div class="d-flex flex-column flex-md-row justify-content-between gap-3">
            <div>
              <div class="mb-3">${renderPlate(vehicle.plate)}</div>
              <div class="d-flex flex-wrap gap-2 mb-3">
                ${renderYardBadge(vehicle.yard)}
                ${renderVehicleType(vehicle.type)}
                ${renderVehicleStatus(vehicle.operationalStatus)}
                ${renderCommercialStatus(vehicle.commercialStatus)}
                ${renderSoldBadge(vehicle.sold)}
              </div>
            </div>
            <div class="text-md-end">
              <div class="fw-semibold">Última atualização</div>
              <small class="text-muted">${formatDateTimeBR(vehicle.updatedAt)}</small>
            </div>
          </div>
          <div class="row g-3 mt-1">
            <div class="col-md-3">
              <div class="small text-muted text-uppercase">Pátio</div>
              <div class="fw-semibold">${escapeHtml(vehicle.yard || 'Não informado')}</div>
            </div>
            <div class="col-md-3">
              <div class="small text-muted text-uppercase">Odômetro</div>
              <div class="fw-semibold">${formatNumberBR(vehicle.odometer)} km</div>
            </div>
            <div class="col-md-3">
              <div class="small text-muted text-uppercase">Chassi</div>
              <div class="fw-semibold">${escapeHtml(vehicle.chassis || 'Não informado')}</div>
            </div>
            <div class="col-md-3">
              <div class="small text-muted text-uppercase">Última OS</div>
              <div class="fw-semibold">${escapeHtml(vehicle.latestServiceOrderNumber || 'Sem OS')}</div>
            </div>
          </div>
          <hr>
          <div class="small text-muted text-uppercase mb-1">Observações gerais</div>
          <div>${escapeHtml(vehicle.notes || 'Sem observações registradas.')}</div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="surface-card h-100">
          <h6 class="mb-3">Resumo rápido</h6>
          <div class="d-flex justify-content-between border-bottom py-2">
            <span>Fotos cadastradas</span>
            <strong>${formatNumberBR(vehicle.photoCount || 0)}</strong>
          </div>
          <div class="d-flex justify-content-between border-bottom py-2">
            <span>Ordens registradas</span>
            <strong>${formatNumberBR(relatedOrders.length)}</strong>
          </div>
          <div class="d-flex justify-content-between border-bottom py-2">
            <span>Veículo vendido</span>
            <strong>${vehicle.sold ? 'Sim' : 'Não'}</strong>
          </div>
          <div class="d-flex justify-content-between py-2">
            <span>Peças lançadas</span>
            <strong>${formatNumberBR(relatedParts.length)}</strong>
          </div>
        </div>
      </div>
    </div>
    <div class="surface-card mb-3">
      <div class="section-title">
        <h6 class="mb-0"><i class="bi bi-images me-2"></i>Fotos do veículo</h6>
      </div>
      ${photosHtml}
    </div>
    <div class="surface-card mb-3">
      <div class="section-title">
        <h6 class="mb-0"><i class="bi bi-tools me-2"></i>Histórico de ordens de serviço</h6>
      </div>
      ${ordersHtml}
    </div>
    <div class="surface-card">
      <div class="section-title">
        <h6 class="mb-0"><i class="bi bi-box-seam me-2"></i>Peças utilizadas</h6>
      </div>
      ${partsHtml}
    </div>
  `;

  const editButton = ensureSeminovosDetailsEditButton();
  if (editButton) {
    editButton.dataset.vehicleId = String(vehicle.id);
    editButton.disabled = false;
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('seminovosVehicleDetailsModal')).show();
}

async function logoutSeminovos() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error(error);
  }
  seminovosCurrentUser = null;
  seminovosVehicles = [];
  seminovosServiceOrders = [];
  showSeminovosLogin();
}

function bindSeminovosEvents() {
  populateSelect('seminovosVehicleYard', SEMINOVOS_YARDS, { placeholder: 'Selecione o pátio' });
  populateSelect('seminovosVehicleType', SEMINOVOS_VEHICLE_TYPES, { placeholder: 'Selecione o tipo' });
  populateSelect('seminovosVehicleOperationalStatus', SEMINOVOS_OPERATIONAL_STATUSES);
  populateSelect('seminovosVehicleCommercialStatus', SEMINOVOS_COMMERCIAL_STATUSES);
  populateSelect('seminovosVehicleYardFilter', SEMINOVOS_YARDS, { includeAll: true, allLabel: 'Todos os pátios' });
  populateSelect('seminovosVehicleTypeFilter', SEMINOVOS_VEHICLE_TYPES, { includeAll: true, allLabel: 'Todos os tipos' });
  populateSelect('seminovosVehicleStatusFilter', SEMINOVOS_OPERATIONAL_STATUSES, { includeAll: true, allLabel: 'Todas as situações' });
  populateSelect('seminovosVehicleCommercialFilter', SEMINOVOS_COMMERCIAL_STATUSES, { includeAll: true, allLabel: 'Toda situação comercial' });
  populateSelect('seminovosOrderCategory', SEMINOVOS_SERVICE_CATEGORIES);
  populateSelect('seminovosOrderStatus', SEMINOVOS_SERVICE_STATUSES);
  populateSelect('seminovosOrderCategoryFilter', SEMINOVOS_SERVICE_CATEGORIES, { includeAll: true, allLabel: 'Todas as categorias' });
  populateSelect('seminovosOrderStatusFilter', SEMINOVOS_SERVICE_STATUSES, { includeAll: true, allLabel: 'Todas as situações' });

  document.querySelectorAll('.module-nav .nav-btn').forEach(button => {
    button.addEventListener('click', () => openView(button.dataset.view));
  });

  ['seminovosVehicleSearch', 'seminovosVehicleYardFilter', 'seminovosVehicleTypeFilter', 'seminovosVehicleStatusFilter', 'seminovosVehicleCommercialFilter', 'seminovosVehicleSoldFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener(id.includes('Search') ? 'input' : 'change', renderVehiclesTable);
  });

  ['seminovosOrderSearch', 'seminovosOrderCategoryFilter', 'seminovosOrderStatusFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener(id.includes('Search') ? 'input' : 'change', renderOrdersTable);
  });

  document.getElementById('seminovosPartsSearch')?.addEventListener('input', renderPartsView);
  document.getElementById('btnNovoVeiculoSeminovos')?.addEventListener('click', () => openSeminovosVehicleModal());
  document.getElementById('btnSeminovosExportPdfAll')?.addEventListener('click', exportSeminovosFullPDF);
  document.getElementById('btnSeminovosExportJson')?.addEventListener('click', exportSeminovosJson);
  document.getElementById('btnSeminovosImportJson')?.addEventListener('click', triggerSeminovosJsonImport);
  document.getElementById('seminovosImportJsonFile')?.addEventListener('change', processSeminovosJsonImport);
  document.getElementById('btnNovaOSSeminovos')?.addEventListener('click', () => openSeminovosOrderModal());
  document.getElementById('btnAddSeminovosPart')?.addEventListener('click', () => addSeminovosPartRow());
  document.getElementById('btnBackToPatio')?.addEventListener('click', () => { window.location.href = '/'; });
  document.getElementById('btnSeminovosLogout')?.addEventListener('click', logoutSeminovos);
  document.getElementById('seminovosVehicleForm')?.addEventListener('submit', saveSeminovosVehicle);
  document.getElementById('seminovosOrderForm')?.addEventListener('submit', saveSeminovosOrder);
  document.addEventListener('click', handleSeminovosImageTriggerClick);
  document.addEventListener('keydown', handleSeminovosImageTriggerKeydown);
  document.getElementById('seminovosOrderVehicleId')?.addEventListener('change', (event) => {
    const vehicle = getVehicleById(event.target.value);
    if (vehicle) {
      document.getElementById('seminovosOrderOdometer').value = vehicle.odometer || 0;
    }
  });
  document.getElementById('seminovosImageViewerModal')?.addEventListener('hidden.bs.modal', () => {
    const viewer = getSeminovosImageViewerElements();
    if (viewer.image) {
      viewer.image.removeAttribute('src');
      viewer.image.alt = 'Foto ampliada do veículo';
    }
    if (viewer.title) viewer.title.textContent = 'Foto do veículo';
    if (viewer.meta) viewer.meta.textContent = 'Toque fora da imagem para fechar.';
  });
  ensureSeminovosDetailsEditButton();

  document.getElementById('seminovosLoginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = document.getElementById('seminovosLoginError');
    errorBox.classList.add('hidden');
    errorBox.textContent = '';

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('seminovosLoginUsername').value.trim(),
          password: document.getElementById('seminovosLoginPassword').value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível fazer login');
      }
      if (!canAccessSeminovos(data.user)) {
        await fetch('/api/auth/logout', { method: 'POST' });
        throw new Error('Este usuário não tem acesso ao módulo Seminovos');
      }
      seminovosCurrentUser = data.user;
      await showSeminovosApp();
      showToast('Acesso ao módulo Seminovos liberado', 'success');
    } catch (error) {
      errorBox.textContent = error.message || 'Não foi possível fazer login';
      errorBox.classList.remove('hidden');
    }
  });
}

window.openSeminovosVehicleModal = openSeminovosVehicleModal;
window.deleteSeminovosVehicle = deleteSeminovosVehicle;
window.openSeminovosOrderModal = openSeminovosOrderModal;
window.deleteSeminovosOrder = deleteSeminovosOrder;
window.viewSeminovosVehicleDetails = viewSeminovosVehicleDetails;
window.exportSeminovosVehiclePDF = exportSeminovosVehiclePDF;
window.openSeminovosVehicleEditFromDetails = openSeminovosVehicleEditFromDetails;

document.addEventListener('DOMContentLoaded', async () => {
  bindSeminovosEvents();
  await checkSeminovosAuth();
});
