// Estado global
let currentView = 'dashboard';
let clients = [];
let stats = {};
let currentClientFilters = {};

const PLAN_BASE_PRICES = {
    basico: 39,
    profesional: 79,
    empresarial: 149,
    personalizado: 249
};

const DEFAULT_ADDON_PRICES = {
    seoPro: 19,
    premiumDesigns: 29,
    reviewsReputation: 15
};

// SISTEMA GLOBAL DE MODALES
let _confirmCallback = null;

function showAlertModal(message, title = 'Aviso') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.innerHTML = `<div style="background:white;border-radius:12px;padding:2rem;max-width:400px;width:90%"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem"><h3 style="font-size:1.5rem;font-weight:700;margin:0">${title}</h3><button data-role="alert-close" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#999">✕</button></div><div style="margin-bottom:2rem"><p style="color:#666">${message}</p></div><div style="display:flex;gap:0.75rem;justify-content:flex-end"><button data-role="alert-accept" style="padding:0.5rem 1rem;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Aceptar</button></div></div>`;
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center';
        document.body.appendChild(modal);
        const closeBtn = modal.querySelector('[data-role="alert-close"]');
        const acceptBtn = modal.querySelector('[data-role="alert-accept"]');
        const close = () => { modal.remove(); resolve(); };
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (acceptBtn) acceptBtn.addEventListener('click', close);
    });
}

function showConfirmModal(message, title = 'Confirmación') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.innerHTML = `<div style="background:white;border-radius:12px;padding:2rem;max-width:400px;width:90%"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem"><h3 style="font-size:1.5rem;font-weight:700;margin:0">${title}</h3><button data-role="confirm-close" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#999">✕</button></div><div style="margin-bottom:2rem"><p style="color:#666">${message}</p></div><div style="display:flex;gap:0.75rem;justify-content:flex-end"><button data-role="confirm-cancel" style="padding:0.5rem 1rem;background:transparent;color:#333;border:1px solid #ccc;border-radius:6px;cursor:pointer;font-weight:600">Cancelar</button><button data-role="confirm-accept" style="padding:0.5rem 1rem;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Aceptar</button></div></div>`;
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center';
        document.body.appendChild(modal);
        const closeBtn = modal.querySelector('[data-role="confirm-close"]');
        const cancelBtn = modal.querySelector('[data-role="confirm-cancel"]');
        const acceptBtn = modal.querySelector('[data-role="confirm-accept"]');
        if (closeBtn) closeBtn.addEventListener('click', () => { modal.remove(); resolve(false); });
        if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.remove(); resolve(false); });
        if (acceptBtn) acceptBtn.addEventListener('click', () => { modal.remove(); resolve(true); });
    });
}

// Verificar autenticación
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (!data.success || !data.user || data.user.role !== 'admin') {
            // No autenticado o no es admin, redirigir a login
            window.location.href = '/superadmin-login.html';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/superadmin-login.html';
        return false;
    }
}

// Wrapper para fetch con manejo de autenticación
async function authenticatedFetch(url, options = {}) {
    const response = await fetch(url, options);
    
    // Si es 401, redirigir a login
    if (response.status === 401) {
        window.location.href = '/superadmin-login.html';
        throw new Error('No autenticado');
    }
    
    return response;
}

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticación primero
    const isAuthenticated = await checkAuth();
    
    if (!isAuthenticated) {
        return;
    }
    
    setupNavigation();
    loadDashboard();
    setupFormHandlers();
    setupFilters();
});

// Navegación entre vistas
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            showView(view);
        });
    });
}

function showView(viewName) {
    // Actualizar navegación
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
    
    // Actualizar vista
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');
    
    currentView = viewName;
    
    // Cargar datos según la vista
    if (viewName === 'dashboard') {
        loadDashboard();
    } else if (viewName === 'clients') {
        loadClients();
    } else if (viewName === 'billing') {
        loadBillingView();
    } else if (viewName === 'databases') {
        loadClientSelectForDatabase();
    }
}

// Cargar Dashboard
async function loadDashboard() {
    try {
        const response = await authenticatedFetch('/api/superadmin/stats');
        const result = await response.json();
        
        if (result.success) {
            stats = result.data;
            updateStatsCards();
            updateRecentClients();
            updatePlansChart();
        }
    } catch (error) {
        console.error('Error al cargar dashboard:', error);
        showNotification('Error al cargar el dashboard', 'error');
    }
}

function updateStatsCards() {
    document.getElementById('stat-total').textContent = stats.total || 0;
    document.getElementById('stat-active').textContent = stats.active || 0;
    document.getElementById('stat-trial').textContent = stats.trial || 0;
    document.getElementById('stat-suspended').textContent = stats.suspended || 0;
    const mrrEl = document.getElementById('stat-mrr');
    if (mrrEl) {
        mrrEl.textContent = formatCurrency(stats.mrr || 0);
    }
}

function updateRecentClients() {
    const container = document.getElementById('recent-clients');
    
    if (!stats.recent || stats.recent.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No hay clientes recientes</p>';
        return;
    }
    
    container.innerHTML = stats.recent.map(client => `
        <div class="recent-client-item">
            <div class="recent-client-info">
                <h4>${client.businessName}</h4>
                <p>${client.domain} • ${formatDate(client.createdAt)}</p>
            </div>
            <span class="status-badge ${client.status}">${client.status}</span>
        </div>
    `).join('');
}

function updatePlansChart() {
    const container = document.getElementById('plans-chart');
    
    if (!stats.byPlan || stats.byPlan.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No hay datos de planes</p>';
        return;
    }
    
    const planNames = {
        basico: 'Básico',
        profesional: 'Profesional',
        empresarial: 'Empresarial',
        personalizado: 'Personalizado'
    };
    
    container.innerHTML = stats.byPlan.map(plan => `
        <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 600;">${planNames[plan._id] || plan._id}</span>
                <span style="color: #666;">${plan.count}</span>
            </div>
            <div style="background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #4f46e5, #6366f1); height: 100%; width: ${(plan.count / stats.total) * 100}%;"></div>
            </div>
        </div>
    `).join('');
}

// Cargar Clientes
async function loadClients(filters = null) {
    try {
        const selectedFilters = (filters && typeof filters === 'object') ? filters : currentClientFilters;
        currentClientFilters = { ...selectedFilters };
        const queryParams = new URLSearchParams(currentClientFilters).toString();
        const url = queryParams ? `/api/superadmin/clients?${queryParams}` : '/api/superadmin/clients';
        const response = await authenticatedFetch(url);
        const result = await response.json();
        
        if (result.success) {
            clients = result.data;
            displayClientsTable(clients);
        }
    } catch (error) {
        console.error('Error al cargar clientes:', error);
        showNotification('Error al cargar clientes', 'error');
    }
}

function displayClientsTable(clientsList) {
    const container = document.getElementById('clients-table');
    
    if (!clientsList || clientsList.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No se encontraron clientes</p>';
        return;
    }
    
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Negocio</th>
                    <th>Dominio</th>
                    <th>Plan</th>
                    <th>Estado</th>
                    <th>Próximo cobro</th>
                    <th>Estado cobro</th>
                    <th>Creado</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${clientsList.map(client => {
                    const control = getBillingControl(client);
                    const meta = getBillingStatusMeta(control.effectiveStatus);
                    const isTrial = client.status === 'prueba';
                    const trialEnd = isTrial && client.trialEndsAt ? new Date(client.trialEndsAt) : null;
                    const trialExpired = trialEnd && trialEnd < new Date();
                    let nextDue;
                    if (isTrial) {
                        nextDue = trialEnd
                            ? (trialExpired ? `⚠️ Expirado ${formatDate(trialEnd)}` : `🔬 Prueba hasta ${formatDate(trialEnd)}`)
                            : '🔬 Prueba 30 días';
                    } else {
                        nextDue = control.nextDueDate ? formatDate(control.nextDueDate) : '—';
                    }
                    const statusBadge = `<span style="background:${meta.bg};color:${meta.color};padding:2px 9px;border-radius:100px;font-size:0.72rem;font-weight:600;white-space:nowrap">${meta.label}</span>`;
                    return `
                    <tr>
                        <td>
                            <strong>${client.businessName}</strong><br>
                            <small style="color: #666;">${client.owner.email}</small>
                        </td>
                        <td>
                            <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
                                ${client.domain}
                            </code>
                        </td>
                        <td>${getPlanDisplay(client.plan)}</td>
                        <td><span class="status-badge ${client.status}">${client.status}</span></td>
                        <td style="white-space:nowrap">${nextDue}</td>
                        <td>${statusBadge}</td>
                        <td>${formatDate(client.createdAt)}</td>
                        <td>
                            <button class="btn-secondary btn-sm" onclick="editClient('${client._id}')" title="Editar cliente">
                                ✏️ Editar
                            </button>
                            <button class="btn-sm ${client.status === 'suspendido' ? 'btn-success' : 'btn-danger'}" onclick="toggleClientActive('${client._id}')" title="${client.status === 'suspendido' ? 'Activar cliente' : 'Desactivar cliente'}">
                                ${client.status === 'suspendido' ? '✅ Activar' : '⛔ Desactivar'}
                            </button>
                            <button class="btn-primary btn-sm" onclick="resendWelcomeEmail('${client._id}')" title="Reenviar email de bienvenida">
                                📧
                            </button>
                            <button class="btn-danger btn-sm" onclick="deleteClient('${client._id}')" title="Eliminar cliente">
                                🗑️
                            </button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Configurar Formularios
function setupFormHandlers() {
    const createForm = document.getElementById('create-client-form');
    
    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            businessName: document.getElementById('businessName').value,
            domain: document.getElementById('domain').value,
            storeType: document.getElementById('storeType').value,
            ownerFullName: document.getElementById('ownerFullName').value,
            ownerEmail: document.getElementById('ownerEmail').value,
            ownerUsername: document.getElementById('ownerUsername').value,
            ownerPhone: document.getElementById('ownerPhone').value || '',
            billingInfo: {
                legalName: document.getElementById('billingLegalName').value || '',
                taxId: document.getElementById('billingTaxId').value || '',
                billingEmail: document.getElementById('billingEmail').value || '',
                fiscalAddress: document.getElementById('billingAddress').value || '',
                postalCode: document.getElementById('billingPostalCode').value || '',
                city: document.getElementById('billingCity').value || '',
                province: document.getElementById('billingProvince').value || '',
                country: document.getElementById('billingCountry').value || 'España'
            },
            plan: document.getElementById('plan').value,
            limits: {
                maxDailyTickets: parseInt(document.getElementById('maxDailyTickets').value),
                maxCameras: parseInt(document.getElementById('maxCameras').value)
            }
        };
        
        try {
            const response = await authenticatedFetch('/api/superadmin/clients', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('✅ Cliente creado exitosamente', 'success');
                createForm.reset();
                showView('clients');
            } else {
                showNotification('❌ ' + (result.message || 'Error al crear cliente'), 'error');
            }
        } catch (error) {
            console.error('Error al crear cliente:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    });
}

// Filtros
function setupFilters() {
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyFilters();
        }, 500);
    });

    const billingSearchInput = document.getElementById('billing-search-input');
    let billingSearchTimeout;
    if (billingSearchInput) {
        billingSearchInput.addEventListener('input', () => {
            clearTimeout(billingSearchTimeout);
            billingSearchTimeout = setTimeout(() => {
                applyBillingFilters();
            }, 500);
        });
    }
}

function applyFilters() {
    const filters = {
        search: document.getElementById('search-input').value,
        status: document.getElementById('filter-status').value,
        plan: document.getElementById('filter-plan').value
    };
    
    // Filtrar valores vacíos
    Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
    });
    
    loadClients(filters);
}

async function markClientAsPaid(clientId) {
    const targetClient = clients.find(c => String(c._id) === String(clientId));
    const businessName = targetClient?.businessName || 'este cliente';

    if (!(await showConfirmModal(`¿Registrar pago de "${businessName}" hoy?`, '💶 Marcar como Pagado'))) {
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}/mark-paid`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            const nextDueLabel = result?.data?.nextDueDate ? formatDate(result.data.nextDueDate) : 'sin fecha';
            showNotification(`✅ Pago registrado. Próximo cobro: ${nextDueLabel}`, 'success');
            loadClients();
        } else {
            showNotification('❌ ' + (result.message || 'No se pudo registrar el pago'), 'error');
        }
    } catch (error) {
        console.error('Error al marcar pago:', error);
        showNotification('❌ Error de conexión al registrar pago', 'error');
    }
}

async function toggleClientActive(clientId) {
    const targetClient = clients.find(c => String(c._id) === String(clientId));
    if (!targetClient) return;

    const willDeactivate = targetClient.status !== 'suspendido';
    const action = willDeactivate ? 'deactivate' : 'activate';
    const actionLabel = willDeactivate ? 'desactivar' : 'activar';
    const message = willDeactivate
        ? `¿Quieres desactivar a "${targetClient.businessName}"?\n\nAl desactivarlo, su tienda dejará de funcionar hasta reactivarlo.`
        : `¿Quieres activar de nuevo a "${targetClient.businessName}"?`;

    if (!(await showConfirmModal(message, `${willDeactivate ? '⛔' : '✅'} ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} cliente`))) {
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}/toggle-active`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action })
        });

        const result = await response.json();

        if (result.success) {
            showNotification(`✅ Cliente ${willDeactivate ? 'desactivado' : 'activado'} correctamente`, 'success');
            loadClients();
        } else {
            showNotification('❌ ' + (result.message || 'No se pudo actualizar el estado del cliente'), 'error');
        }
    } catch (error) {
        console.error('Error al actualizar estado del cliente:', error);
        showNotification('❌ Error de conexión al actualizar estado', 'error');
    }
}

// ══════════════════════════════════════════════
// VISTA DE FACTURACIÓN
// ══════════════════════════════════════════════

let billingClients = [];

async function loadBillingView(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.search) params.set('search', filters.search);
        if (filters.plan) params.set('plan', filters.plan);
        const qs = params.toString() ? '?' + params.toString() : '';

        const [clientsRes, statsRes] = await Promise.all([
            authenticatedFetch('/api/superadmin/clients' + qs),
            authenticatedFetch('/api/superadmin/stats')
        ]);
        const clientsResult = await clientsRes.json();
        const statsResult = await statsRes.json();

        if (!clientsResult.success) return;

        billingClients = clientsResult.data || [];

        // Aplicar filtro billingStatus en frontend
        let filtered = billingClients;
        if (filters.billingStatus) {
            filtered = billingClients.filter(c => {
                const control = getBillingControl(c);
                return control.effectiveStatus === filters.billingStatus;
            });
        }

        // Resumen
        const allControls = billingClients.map(c => getBillingControl(c));
        const vencidos = allControls.filter(c => c.effectiveStatus === 'vencido').length;
        const pendientes = allControls.filter(c => c.effectiveStatus === 'pendiente').length;
        const aldia = allControls.filter(c => c.effectiveStatus === 'al_dia').length;

        const mrrEl = document.getElementById('billing-stat-mrr');
        if (mrrEl && statsResult.success) {
            mrrEl.textContent = formatCurrency(statsResult.data.mrr || 0);
        }
        const vEl = document.getElementById('billing-stat-vencidos');
        const pEl = document.getElementById('billing-stat-pendientes');
        const aEl = document.getElementById('billing-stat-aldia');
        if (vEl) vEl.textContent = vencidos;
        if (pEl) pEl.textContent = pendientes;
        if (aEl) aEl.textContent = aldia;

        displayBillingTable(filtered);
    } catch (error) {
        console.error('Error al cargar facturación:', error);
        showNotification('Error al cargar la facturación', 'error');
    }
}

function displayBillingTable(list) {
    const container = document.getElementById('billing-table');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">No hay clientes que coincidan con los filtros</div>';
        return;
    }

    const rows = list.map(client => {
        const billingSummary = calculateMonthlyBilling(client);
        const control = getBillingControl(client);
        const meta = getBillingStatusMeta(control.effectiveStatus);

        const nextDue = control.nextDueDate ? formatDate(control.nextDueDate) : '—';
        const lastPaid = control.lastPaidAt ? formatDate(control.lastPaidAt) : '—';
        const statusBadge = `<span style="background:${meta.bg};color:${meta.color};padding:3px 10px;border-radius:100px;font-size:0.75rem;font-weight:600">${meta.label}</span>`;

        const canMarkPaid = control.effectiveStatus !== 'al_dia' && control.effectiveStatus !== 'pausado';

        return `<tr>
            <td><strong>${client.businessName}</strong><br><small style="color:#888">${client.domain}</small></td>
            <td>${getPlanDisplay(client.plan)}</td>
            <td><strong>${formatCurrency(billingSummary.total)}</strong></td>
            <td>${nextDue}</td>
            <td>${statusBadge}</td>
            <td>${lastPaid}</td>
            <td>
                <button class="btn-primary btn-sm" onclick="sendInvoiceFromBilling('${client._id}')">📧 Enviar factura</button>
                <button class="btn-secondary btn-sm" onclick="showBillingHistory('${client._id}')">📜 Historial</button>
                ${canMarkPaid ? `<button class="btn-success btn-sm" onclick="markClientAsPaidFromBilling('${client._id}')">💶 Marcar pagado</button>` : ''}
                <button class="btn-secondary btn-sm" onclick="editClient('${client._id}')">✏️ Editar</button>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<table class="data-table">
        <thead>
            <tr>
                <th>Cliente</th>
                <th>Plan</th>
                <th>Total mensual</th>
                <th>Próximo cobro</th>
                <th>Estado cobro</th>
                <th>Último pago</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

async function markClientAsPaidFromBilling(clientId) {
    const targetClient = billingClients.find(c => String(c._id) === String(clientId));
    const businessName = targetClient?.businessName || 'este cliente';

    if (!(await showConfirmModal(`¿Registrar pago de "${businessName}" hoy?`, '💶 Marcar como Pagado'))) {
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}/mark-paid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            const nextDueLabel = result?.data?.nextDueDate ? formatDate(result.data.nextDueDate) : 'sin fecha';
            showNotification(`✅ Pago registrado. Próximo cobro: ${nextDueLabel}`, 'success');
            applyBillingFilters();
        } else {
            showNotification('❌ ' + (result.message || 'No se pudo registrar el pago'), 'error');
        }
    } catch (error) {
        console.error('Error al marcar pago:', error);
        showNotification('❌ Error de conexión al registrar pago', 'error');
    }
}

async function sendInvoiceFromBilling(clientId) {
    const targetClient = billingClients.find(c => String(c._id) === String(clientId));
    const businessName = targetClient?.businessName || 'este cliente';

    if (!(await showConfirmModal(`¿Enviar factura ahora a "${businessName}"?\n\nSe generará el PDF y se enviará por email, quedando disponible en su panel admin.`, '📧 Enviar Factura'))) {
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/invoices/generate-and-send/${clientId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                period: new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const invoiceLabel = result.invoiceNumber ? ` (${result.invoiceNumber})` : '';
            showNotification(`✅ Factura enviada${invoiceLabel} a ${businessName}`, 'success');
            applyBillingFilters();
        } else {
            showNotification('❌ ' + (result.error || result.message || 'No se pudo enviar la factura'), 'error');
        }
    } catch (error) {
        console.error('Error enviando factura:', error);
        showNotification('❌ Error de conexión al enviar factura', 'error');
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function showBillingHistory(clientId) {
    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}/invoices`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            showNotification('❌ ' + (result.message || 'No se pudo cargar el historial de facturas'), 'error');
            return;
        }

        const data = result.data || {};
        const invoices = Array.isArray(data.invoices) ? data.invoices : [];

        const rows = invoices.length > 0
            ? invoices.map((inv) => {
                const date = inv.date ? formatDate(inv.date) : '—';
                const amount = formatCurrency(inv.amount || 0);
                const status = String(inv.status || 'sent').toLowerCase();
                const dueDate = inv.dueDate ? formatDate(inv.dueDate) : '—';
                const paidDate = inv.paidDate ? formatDate(inv.paidDate) : '—';
                const statusMap = {
                    sent: { label: 'Enviada', bg: '#dbeafe', color: '#1e40af' },
                    paid: { label: 'Pagada', bg: '#dcfce7', color: '#166534' },
                    unpaid: { label: 'No pagada', bg: '#fef3c7', color: '#92400e' },
                    overdue: { label: 'Vencida', bg: '#fee2e2', color: '#991b1b' },
                    cancelled: { label: 'Cancelada', bg: '#e5e7eb', color: '#374151' }
                };
                const badge = statusMap[status] || statusMap.sent;

                return `
                    <tr>
                        <td>${escapeHtml(inv.invoiceNumber || '-')}</td>
                        <td>${date}</td>
                        <td>${amount}</td>
                        <td><span style="background:${badge.bg};color:${badge.color};padding:3px 10px;border-radius:100px;font-size:0.75rem;font-weight:600">${badge.label}</span></td>
                        <td>${dueDate}</td>
                        <td>${paidDate}</td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="6" style="text-align:center;color:#666;padding:1rem;">Este cliente aún no tiene facturas emitidas.</td></tr>';

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        modal.innerHTML = `
            <div style="background:white;border-radius:12px;max-width:980px;width:100%;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;">
                    <div>
                        <h3 style="margin:0;font-size:1.2rem;">Historial de facturas</h3>
                        <p style="margin:0.2rem 0 0;color:#666;font-size:0.88rem;">${escapeHtml(data.businessName || 'Cliente')} · ${escapeHtml(data.email || data.domain || '')}</p>
                    </div>
                    <button data-role="close-history" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#666;">&times;</button>
                </div>
                <div style="padding:1rem 1.25rem;overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;min-width:760px;">
                        <thead>
                            <tr>
                                <th style="text-align:left;padding:0.65rem;border-bottom:1px solid #e5e7eb;font-size:0.78rem;color:#64748b;text-transform:uppercase;">Factura</th>
                                <th style="text-align:left;padding:0.65rem;border-bottom:1px solid #e5e7eb;font-size:0.78rem;color:#64748b;text-transform:uppercase;">Fecha</th>
                                <th style="text-align:left;padding:0.65rem;border-bottom:1px solid #e5e7eb;font-size:0.78rem;color:#64748b;text-transform:uppercase;">Importe</th>
                                <th style="text-align:left;padding:0.65rem;border-bottom:1px solid #e5e7eb;font-size:0.78rem;color:#64748b;text-transform:uppercase;">Estado</th>
                                <th style="text-align:left;padding:0.65rem;border-bottom:1px solid #e5e7eb;font-size:0.78rem;color:#64748b;text-transform:uppercase;">Vencimiento</th>
                                <th style="text-align:left;padding:0.65rem;border-bottom:1px solid #e5e7eb;font-size:0.78rem;color:#64748b;text-transform:uppercase;">Pago</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => modal.remove();
        const closeBtn = modal.querySelector('[data-role="close-history"]');
        if (closeBtn) closeBtn.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });
    } catch (error) {
        console.error('Error cargando historial de facturas:', error);
        showNotification('❌ Error de conexión al cargar historial', 'error');
    }
}

function applyBillingFilters() {
    const filters = {
        search: (document.getElementById('billing-search-input')?.value || '').trim(),
        plan: document.getElementById('billing-filter-plan')?.value || '',
        billingStatus: document.getElementById('billing-filter-status')?.value || ''
    };
    Object.keys(filters).forEach(k => { if (!filters[k]) delete filters[k]; });
    loadBillingView(filters);
}

// Editar Cliente
function editClient(clientId) {
    const client = clients.find(c => c._id === clientId);
    if (!client) return;
    const billing = getNormalizedBilling(client);
    const billingControl = getBillingControl(client);
    const billingSummary = calculateMonthlyBilling(client);
    const billingInfo = client.billingInfo || {};
    
    // Llenar el modal con los datos del cliente
    const modal = document.getElementById('edit-modal');
    const modalBody = modal.querySelector('.modal-body');
    
    modalBody.innerHTML = `
        <form id="edit-client-form-dynamic" class="client-form">
            <input type="hidden" id="edit-client-id" value="${client._id}">
            
            <div class="form-section">
                <h3 class="section-title">📋 Información del Negocio</h3>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-businessName">Nombre del Negocio *</label>
                        <input type="text" id="edit-businessName" name="businessName" value="${client.businessName}" required>
                    </div>

                    <div class="form-group">
                        <label for="edit-domain">Dominio *</label>
                        <input type="text" id="edit-domain" name="domain" value="${client.domain}" required>
                        <small>El dominio que usará el cliente para acceder</small>
                    </div>

                    <div class="form-group">
                        <label for="edit-storeType">Tipo de Tienda *</label>
                        <select id="edit-storeType" name="storeType" required>
                            <option value="pescaderia" ${(client.storeType || 'pescaderia') === 'pescaderia' ? 'selected' : ''}>Pescadería</option>
                            <option value="marisqueria" ${client.storeType === 'marisqueria' ? 'selected' : ''}>Marisquería</option>
                            <option value="carniceria" ${client.storeType === 'carniceria' ? 'selected' : ''}>Carnicería</option>
                            <option value="charcuteria" ${client.storeType === 'charcuteria' ? 'selected' : ''}>Charcutería</option>
                            <option value="polleria" ${client.storeType === 'polleria' ? 'selected' : ''}>Pollería</option>
                            <option value="fruteria" ${client.storeType === 'fruteria' ? 'selected' : ''}>Frutería</option>
                            <option value="panaderia" ${client.storeType === 'panaderia' ? 'selected' : ''}>Panadería</option>
                            <option value="otra" ${client.storeType === 'otra' ? 'selected' : ''}>Otra</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3 class="section-title">👤 Información del Propietario</h3>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-ownerFullName">Nombre Completo *</label>
                        <input type="text" id="edit-ownerFullName" name="ownerFullName" value="${client.owner.fullName}" required>
                    </div>

                    <div class="form-group">
                        <label for="edit-ownerEmail">Email *</label>
                        <input type="email" id="edit-ownerEmail" name="ownerEmail" value="${client.owner.email}" required>
                    </div>

                    <div class="form-group">
                        <label for="edit-ownerPhone">Teléfono</label>
                        <input type="tel" id="edit-ownerPhone" name="ownerPhone" value="${client.owner.phone || ''}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-ownerUsername">Usuario de Acceso *</label>
                        <input type="text" id="edit-ownerUsername" name="ownerUsername" value="${client.owner.username}" required>
                        <small>Usuario para iniciar sesión en el panel del vendedor</small>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3 class="section-title">💎 Plan y Estado</h3>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-plan">Plan</label>
                        <select id="edit-plan" name="plan">
                            <option value="basico" ${client.plan === 'basico' ? 'selected' : ''}>Básico</option>
                            <option value="profesional" ${client.plan === 'profesional' ? 'selected' : ''}>Profesional</option>
                            <option value="empresarial" ${client.plan === 'empresarial' ? 'selected' : ''}>Empresarial</option>
                            <option value="personalizado" ${client.plan === 'personalizado' ? 'selected' : ''}>Personalizado</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="edit-status">Estado</label>
                        <select id="edit-status" name="status">
                            <option value="activo" ${client.status === 'activo' ? 'selected' : ''}>Activo</option>
                            <option value="prueba" ${client.status === 'prueba' ? 'selected' : ''}>En Prueba</option>
                            <option value="suspendido" ${client.status === 'suspendido' ? 'selected' : ''}>Suspendido</option>
                            <option value="expirado" ${client.status === 'expirado' ? 'selected' : ''}>Expirado</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-maxDailyTickets">Tickets Diarios Máx.</label>
                        <input type="number" id="edit-maxDailyTickets" name="maxDailyTickets" value="${client.limits.maxDailyTickets}" min="1">
                    </div>

                    <div class="form-group">
                        <label for="edit-maxCameras">Cámaras Máx.</label>
                        <input type="number" id="edit-maxCameras" name="maxCameras" value="${client.limits.maxCameras}" min="1" max="10">
                    </div>

                    <div class="form-group">
                        <label for="edit-maxKiosks">Kioscos Máx.</label>
                        <input type="number" id="edit-maxKiosks" name="maxKiosks" value="${client.limits.maxKiosks || 2}" min="1">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-maxVendors">Vendedores Máx.</label>
                        <input type="number" id="edit-maxVendors" name="maxVendors" value="${client.limits.maxVendors}" min="1">
                    </div>

                    <div class="form-group">
                        <label for="edit-storageQuotaMB">Almacenamiento (MB)</label>
                        <input type="number" id="edit-storageQuotaMB" name="storageQuotaMB" value="${client.limits.storageQuotaMB || 1000}" min="100" step="100">
                    </div>

                    <div class="form-group">
                        <!-- Espacio vacío para alinear -->
                    </div>
                </div>

                <div class="form-row" style="margin-top: 0.5rem;">
                    <div class="form-group" style="border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
                        <label style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
                            <input type="checkbox" id="edit-addon-seo-pro" ${(client.features?.seoPro ? 'checked' : '')}>
                            🔍 SEO PRO
                        </label>
                        <small>Habilita edición avanzada de SEO en el panel del cliente.</small>
                    </div>

                    <div class="form-group" style="border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
                        <label style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
                            <input type="checkbox" id="edit-addon-premium-designs" ${(client.features?.premiumDesigns ? 'checked' : '')}>
                            🎨 Diseños Premium
                        </label>
                        <small>Permite variantes premium de diseño y personalización visual.</small>
                    </div>

                    <div class="form-group" style="border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
                        <label style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
                            <input type="checkbox" id="edit-addon-reviews" ${(client.features?.reviewsReputation ? 'checked' : '')}>
                            ⭐ Reputación y Reseñas
                        </label>
                        <small>Activa la configuración y visualización de reputación.</small>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3 class="section-title">💶 Facturación</h3>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-basePlanPrice">Cuota base mensual (€)</label>
                        <input type="number" id="edit-basePlanPrice" min="0" step="0.01" value="${billing.basePlanPrice}">
                    </div>
                    <div class="form-group">
                        <label for="edit-discount">Descuento mensual (€)</label>
                        <input type="number" id="edit-discount" min="0" step="0.01" value="${billing.discount}">
                    </div>
                    <div class="form-group">
                        <label for="edit-currency">Moneda</label>
                        <select id="edit-currency">
                            <option value="EUR" ${billing.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                            <option value="USD" ${billing.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                        </select>
                    </div>
                </div>

                <div class="form-row" style="margin-top: 0.5rem;">
                    <div class="form-group" style="border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
                        <label for="edit-price-seo-pro">Precio addon SEO PRO (€)</label>
                        <input type="number" id="edit-price-seo-pro" min="0" step="0.01" value="${billing.addonPrices.seoPro}">
                    </div>
                    <div class="form-group" style="border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
                        <label for="edit-price-premium-designs">Precio addon Diseños Premium (€)</label>
                        <input type="number" id="edit-price-premium-designs" min="0" step="0.01" value="${billing.addonPrices.premiumDesigns}">
                    </div>
                    <div class="form-group" style="border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
                        <label for="edit-price-reviews">Precio addon Reputación y Reseñas (€)</label>
                        <input type="number" id="edit-price-reviews" min="0" step="0.01" value="${billing.addonPrices.reviewsReputation}">
                    </div>
                </div>

                <div class="form-row" style="margin-top: 0.5rem;">
                    <div class="form-group">
                        <label for="edit-billing-day">Día de cobro mensual</label>
                        <input type="number" id="edit-billing-day" min="1" max="28" step="1" value="${billingControl.billingDayOfMonth}">
                    </div>
                    <div class="form-group">
                        <label for="edit-next-due-date">Próximo cobro</label>
                        <input type="date" id="edit-next-due-date" value="${formatDateInputValue(billingControl.nextDueDate)}">
                    </div>
                    <div class="form-group">
                        <label for="edit-payment-status">Estado de cobro</label>
                        <select id="edit-payment-status">
                            <option value="al_dia" ${billingControl.paymentStatus === 'al_dia' ? 'selected' : ''}>Al día</option>
                            <option value="pendiente" ${billingControl.paymentStatus === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                            <option value="vencido" ${billingControl.paymentStatus === 'vencido' ? 'selected' : ''}>Vencido</option>
                            <option value="pausado" ${billingControl.paymentStatus === 'pausado' ? 'selected' : ''}>Pausado</option>
                        </select>
                    </div>
                </div>

                <div class="form-row" style="margin-top: 0.5rem;">
                    <div class="form-group">
                        <label for="edit-last-paid-at">Último pago registrado</label>
                        <input type="date" id="edit-last-paid-at" value="${formatDateInputValue(billingControl.lastPaidAt)}">
                    </div>
                </div>

                <div style="margin-top:1rem;padding:0.85rem 1rem;border-radius:10px;background:#f8fafc;border:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
                        <small id="billing-summary-breakdown" style="color:#475569;">Base ${formatCurrency(billingSummary.basePlanPrice)} + Addons ${formatCurrency(billingSummary.addonsTotal)}${billingSummary.discount > 0 ? ` - Desc. ${formatCurrency(billingSummary.discount)}` : ''}</small>
                        <strong id="billing-summary-total" style="font-size:1.1rem;">Total mensual: ${formatCurrency(billingSummary.total)}</strong>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3 class="section-title">🧾 Datos Fiscales</h3>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-billing-legal-name">Razón social</label>
                        <input type="text" id="edit-billing-legal-name" value="${billingInfo.legalName || ''}">
                    </div>
                    <div class="form-group">
                        <label for="edit-billing-tax-id">NIF/CIF</label>
                        <input type="text" id="edit-billing-tax-id" value="${billingInfo.taxId || ''}">
                    </div>
                    <div class="form-group">
                        <label for="edit-billing-email">Email facturación</label>
                        <input type="email" id="edit-billing-email" value="${billingInfo.billingEmail || client.owner.email || ''}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-billing-address">Dirección fiscal</label>
                        <input type="text" id="edit-billing-address" value="${billingInfo.fiscalAddress || ''}">
                    </div>
                    <div class="form-group">
                        <label for="edit-billing-postal">Código postal</label>
                        <input type="text" id="edit-billing-postal" value="${billingInfo.postalCode || ''}">
                    </div>
                    <div class="form-group">
                        <label for="edit-billing-city">Ciudad</label>
                        <input type="text" id="edit-billing-city" value="${billingInfo.city || ''}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-billing-province">Provincia</label>
                        <input type="text" id="edit-billing-province" value="${billingInfo.province || ''}">
                    </div>
                    <div class="form-group">
                        <label for="edit-billing-country">País</label>
                        <input type="text" id="edit-billing-country" value="${billingInfo.country || 'España'}">
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3 class="section-title">📝 Notas</h3>
                
                <div class="form-group">
                    <label for="edit-notes">Notas Internas</label>
                    <textarea id="edit-notes" name="notes" rows="4" style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit;">${client.notes || ''}</textarea>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeEditModal()">Cancelar</button>
                <button type="submit" class="btn-primary">💾 Guardar Cambios</button>
            </div>
        </form>
    `;
    
    // Mostrar el modal
    modal.classList.add('active');

    setupEditBillingPreview();
    
    // Agregar event listener al formulario
    const form = document.getElementById('edit-client-form-dynamic');
    form.addEventListener('submit', handleEditSubmit);
}

// Manejar el envío del formulario de edición
async function handleEditSubmit(e) {
    e.preventDefault();
    
    const clientId = document.getElementById('edit-client-id').value;
    
    const formData = {
        businessName: document.getElementById('edit-businessName').value,
        domain: document.getElementById('edit-domain').value,
        storeType: document.getElementById('edit-storeType').value,
        ownerUsername: document.getElementById('edit-ownerUsername').value,
        ownerFullName: document.getElementById('edit-ownerFullName').value,
        ownerEmail: document.getElementById('edit-ownerEmail').value,
        ownerPhone: document.getElementById('edit-ownerPhone').value,
        plan: document.getElementById('edit-plan').value,
        status: document.getElementById('edit-status').value,
        features: {
            seoPro: Boolean(document.getElementById('edit-addon-seo-pro')?.checked),
            premiumDesigns: Boolean(document.getElementById('edit-addon-premium-designs')?.checked),
            reviewsReputation: Boolean(document.getElementById('edit-addon-reviews')?.checked)
        },
        billing: {
            currency: (document.getElementById('edit-currency')?.value || 'EUR').toUpperCase(),
            basePlanPrice: parseFloat(document.getElementById('edit-basePlanPrice')?.value) || 0,
            addonPrices: {
                seoPro: parseFloat(document.getElementById('edit-price-seo-pro')?.value) || 0,
                premiumDesigns: parseFloat(document.getElementById('edit-price-premium-designs')?.value) || 0,
                reviewsReputation: parseFloat(document.getElementById('edit-price-reviews')?.value) || 0
            },
            discount: parseFloat(document.getElementById('edit-discount')?.value) || 0,
            billingDayOfMonth: parseInt(document.getElementById('edit-billing-day')?.value) || 5,
            nextDueDate: document.getElementById('edit-next-due-date')?.value || null,
            lastPaidAt: document.getElementById('edit-last-paid-at')?.value || null,
            paymentStatus: document.getElementById('edit-payment-status')?.value || 'pendiente'
        },
        billingInfo: {
            legalName: document.getElementById('edit-billing-legal-name')?.value || '',
            taxId: document.getElementById('edit-billing-tax-id')?.value || '',
            billingEmail: document.getElementById('edit-billing-email')?.value || '',
            fiscalAddress: document.getElementById('edit-billing-address')?.value || '',
            postalCode: document.getElementById('edit-billing-postal')?.value || '',
            city: document.getElementById('edit-billing-city')?.value || '',
            province: document.getElementById('edit-billing-province')?.value || '',
            country: document.getElementById('edit-billing-country')?.value || 'España'
        },
        limits: {
            maxDailyTickets: parseInt(document.getElementById('edit-maxDailyTickets').value) || 200,
            maxCameras: parseInt(document.getElementById('edit-maxCameras').value) || 4,
            maxKiosks: parseInt(document.getElementById('edit-maxKiosks')?.value) || 2,
            maxVendors: parseInt(document.getElementById('edit-maxVendors').value) || 3,
            storageQuotaMB: parseInt(document.getElementById('edit-storageQuotaMB')?.value) || 1000
        },
        notes: document.getElementById('edit-notes').value
    };
    
    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('✅ Cliente actualizado exitosamente', 'success');
            closeEditModal();
            loadClients(); // Recargar la lista
        } else {
            showNotification('❌ ' + (result.message || 'Error al actualizar cliente'), 'error');
        }
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        showNotification('❌ Error de conexión', 'error');
    }
}

// Cerrar modal de edición
function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('active');
}

// Eliminar Cliente
async function deleteClient(clientId, businessName) {
    if (!businessName) {
        const targetClient = clients.find(c => String(c._id) === String(clientId));
        businessName = targetClient?.businessName || 'este cliente';
    }

    if (!(await showConfirmModal(`¿Estás seguro de eliminar a "${businessName}"?\n\nEsta acción lo marcará como eliminado y bloqueará su acceso.`, '⚠️ Eliminar Cliente'))) {
        return;
    }
    
    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('✅ Cliente eliminado correctamente', 'success');
            loadClients();
        } else {
            showNotification('❌ ' + (result.message || 'Error al eliminar cliente'), 'error');
        }
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        showNotification('❌ Error de conexión', 'error');
    }
}

// Reenviar email de bienvenida
async function resendWelcomeEmail(clientId, businessName) {
    if (!businessName) {
        const targetClient = clients.find(c => String(c._id) === String(clientId));
        businessName = targetClient?.businessName || 'este cliente';
    }

    if (!(await showConfirmModal(`¿Reenviar email de bienvenida a "${businessName}"?\n\nSe enviará un nuevo enlace de activación por email.`, '📧 Reenviar Email'))) {
        return;
    }
    
    try {
        const response = await authenticatedFetch(`/api/superadmin/resend-welcome/${clientId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`✅ Email enviado a ${businessName}`, 'success');
            
            // Crear modal de confirmación
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;
            
            let messageHtml = `
                <div style="background: white; padding: 30px; border-radius: 12px; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                    <h2 style="color: #667eea; margin-bottom: 20px;">✅ Email reenviado</h2>
                    <p style="margin-bottom: 15px;">El email de bienvenida ha sido enviado a <strong>${businessName}</strong>.</p>
                    
                    <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #1e40af;">
                            <strong>📧 El cliente recibirá:</strong><br>
                            • Nuevo enlace de activación<br>
                            • Token válido por 72 horas<br>
                            • Instrucciones para establecer contraseña
                        </p>
                    </div>`;
            
            // Si está en modo testing (Ethereal), mostrar URL de preview
            if (result.previewUrl) {
                messageHtml += `
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 5px 0; color: #92400e;">
                            <strong>🧪 Modo Testing (Ethereal):</strong><br>
                            <small>Abre este enlace para ver el email pre-procesado:</small>
                        </p>
                        <a href="${result.previewUrl}" target="_blank" style="display: inline-block; margin-top: 8px; padding: 8px 12px; background: #f59e0b; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: bold;">
                            📬 Ver email en Ethereal
                        </a>
                    </div>`;
            }
            
            messageHtml += `
                    <button onclick="this.parentElement.parentElement.remove()" 
                            style="width: 100%; padding: 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; margin-top: 20px;">
                        Entendido
                    </button>
                </div>
            `;
            
            modal.innerHTML = messageHtml;
            document.body.appendChild(modal);
            
            // Cerrar al hacer clic fuera del modal
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
        } else {
            showNotification(`❌ ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error reenviando email:', error);
        showNotification('❌ Error al reenviar email', 'error');
    }
}

// Cerrar sesión
async function logout() {
    if (await showConfirmModal('¿Cerrar sesión?', '🚪 Cerrar Sesión')) {
        window.location.href = '/logout';
    }
}

// Utilidades
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function getPlanDisplay(plan) {
    const plans = {
        basico: '🥉 Básico',
        profesional: '🥈 Profesional',
        empresarial: '🥇 Empresarial',
        personalizado: '💎 Personalizado'
    };
    return plans[plan] || plan;
}

function toAmount(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return Math.round(num * 100) / 100;
}

function toBillingDay(value, fallback = 5) {
    const day = Number(value);
    if (!Number.isInteger(day)) return fallback;
    return Math.min(28, Math.max(1, day));
}

function parseDateOrNull(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateInputValue(value) {
    const date = parseDateOrNull(value);
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getEffectivePaymentStatus(control) {
    const status = control?.paymentStatus || 'pendiente';
    if (status === 'pausado' || status === 'al_dia') return status;
    const dueDate = parseDateOrNull(control?.nextDueDate);
    if (!dueDate) return status;
    const today = new Date();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    if (dueDate < endOfToday) return 'vencido';
    return status;
}

function getBillingStatusMeta(status) {
    const map = {
        al_dia: { label: 'Al día', bg: '#dcfce7', color: '#166534' },
        pendiente: { label: 'Pendiente', bg: '#fef3c7', color: '#92400e' },
        vencido: { label: 'Vencido', bg: '#fee2e2', color: '#991b1b' },
        pausado: { label: 'Pausado', bg: '#e5e7eb', color: '#374151' }
    };
    return map[status] || map.pendiente;
}

function getNormalizedBilling(client) {
    const defaultBase = PLAN_BASE_PRICES[client?.plan] || PLAN_BASE_PRICES.basico;
    const billing = client?.billing || {};
    const addonPrices = billing.addonPrices || {};

    return {
        currency: String(billing.currency || 'EUR').toUpperCase(),
        basePlanPrice: toAmount(billing.basePlanPrice, defaultBase),
        addonPrices: {
            seoPro: toAmount(addonPrices.seoPro, DEFAULT_ADDON_PRICES.seoPro),
            premiumDesigns: toAmount(addonPrices.premiumDesigns, DEFAULT_ADDON_PRICES.premiumDesigns),
            reviewsReputation: toAmount(addonPrices.reviewsReputation, DEFAULT_ADDON_PRICES.reviewsReputation)
        },
        discount: toAmount(billing.discount, 0)
    };
}

function getBillingControl(client) {
    const billing = client?.billing || {};
    const billingDayOfMonth = toBillingDay(billing.billingDayOfMonth, 5);
    const nextDueDate = parseDateOrNull(billing.nextDueDate);
    const lastPaidAt = parseDateOrNull(billing.lastPaidAt);
    const paymentStatus = ['al_dia', 'pendiente', 'vencido', 'pausado'].includes(billing.paymentStatus)
        ? billing.paymentStatus
        : 'pendiente';
    const effectiveStatus = getEffectivePaymentStatus({ paymentStatus, nextDueDate });

    return {
        billingDayOfMonth,
        nextDueDate,
        lastPaidAt,
        paymentStatus,
        effectiveStatus
    };
}

function calculateMonthlyBilling(clientLike) {
    const features = clientLike?.features || {};
    const billing = getNormalizedBilling(clientLike);
    const addonsTotal =
        (features.seoPro ? billing.addonPrices.seoPro : 0) +
        (features.premiumDesigns ? billing.addonPrices.premiumDesigns : 0) +
        (features.reviewsReputation ? billing.addonPrices.reviewsReputation : 0);
    const total = Math.max(0, billing.basePlanPrice + addonsTotal - billing.discount);
    return {
        ...billing,
        addonsTotal,
        total: Math.round(total * 100) / 100
    };
}

function formatCurrency(amount) {
    return `${toAmount(amount, 0).toFixed(2)} EUR`;
}

function setupEditBillingPreview() {
    const watchedIds = [
        'edit-addon-seo-pro',
        'edit-addon-premium-designs',
        'edit-addon-reviews',
        'edit-basePlanPrice',
        'edit-price-seo-pro',
        'edit-price-premium-designs',
        'edit-price-reviews',
        'edit-discount'
    ];

    const recalc = () => {
        const state = {
            plan: document.getElementById('edit-plan')?.value || 'basico',
            features: {
                seoPro: Boolean(document.getElementById('edit-addon-seo-pro')?.checked),
                premiumDesigns: Boolean(document.getElementById('edit-addon-premium-designs')?.checked),
                reviewsReputation: Boolean(document.getElementById('edit-addon-reviews')?.checked)
            },
            billing: {
                basePlanPrice: parseFloat(document.getElementById('edit-basePlanPrice')?.value) || 0,
                addonPrices: {
                    seoPro: parseFloat(document.getElementById('edit-price-seo-pro')?.value) || 0,
                    premiumDesigns: parseFloat(document.getElementById('edit-price-premium-designs')?.value) || 0,
                    reviewsReputation: parseFloat(document.getElementById('edit-price-reviews')?.value) || 0
                },
                discount: parseFloat(document.getElementById('edit-discount')?.value) || 0
            }
        };

        const summary = calculateMonthlyBilling(state);
        const totalEl = document.getElementById('billing-summary-total');
        const breakdownEl = document.getElementById('billing-summary-breakdown');

        if (totalEl) totalEl.textContent = `Total mensual: ${formatCurrency(summary.total)}`;
        if (breakdownEl) {
            breakdownEl.textContent = `Base ${formatCurrency(summary.basePlanPrice)} + Addons ${formatCurrency(summary.addonsTotal)}${summary.discount > 0 ? ` - Desc. ${formatCurrency(summary.discount)}` : ''}`;
        }
    };

    watchedIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventName = el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(eventName, recalc);
    });

    recalc();
}

function showNotification(message, type = 'info') {
    // Crear notificación
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        z-index: 9999;
        animation: slideIn 0.3s;
        max-width: 400px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Añadir animaciones al CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Función de logout
async function logout() {
    if (!(await showConfirmModal('¿Estás seguro de que quieres cerrar sesión?', '🚪 Cerrar Sesión'))) {
        return;
    }
    
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.location.href = '/superadmin-login.html';
        } else {
            showNotification('Error al cerrar sesión', 'error');
        }
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        // Redirigir de todos modos
        window.location.href = '/superadmin-login.html';
    }
}

// ============ FUNCIONES PARA INSPECCIÓN DE BASES DE DATOS ============

// Cargar lista de clientes en el selector de BD
async function loadClientSelectForDatabase() {
    try {
        const response = await authenticatedFetch('/api/superadmin/clients?limit=1000');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('client-select');
            if (select) {
                select.innerHTML = '<option value="">-- Selecciona un cliente --</option>';
                data.data.forEach(client => {
                    const option = document.createElement('option');
                    option.value = client._id;
                    option.textContent = `${client.businessName} (${client.domain})`;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error cargando clientes para selector:', error);
    }
}

// Cargar información de la BD del cliente
async function loadDatabaseInfo() {
    const clientId = document.getElementById('client-select').value;
    
    if (!clientId) {
        const container = document.getElementById('database-info-container');
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Selecciona un cliente para ver la información de su base de datos</div>';
        return;
    }
    
    try {
        const container = document.getElementById('database-info-container');
        container.innerHTML = '<div class="loading">Cargando información de la base de datos...</div>';
        
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}/database-info`);
        const data = await response.json();
        
        if (data.success) {
            displayDatabaseInfo(data.data);
        } else {
            container.innerHTML = `<div style="color: #ef4444; padding: 20px;">Error: ${data.message}</div>`;
        }
    } catch (error) {
        console.error('Error cargando información de BD:', error);
        const container = document.getElementById('database-info-container');
        container.innerHTML = '<div style="color: #ef4444; padding: 20px;">Error al cargar información de la base de datos</div>';
    }
}

// Mostrar información de la BD
function displayDatabaseInfo(dbData) {
    const container = document.getElementById('database-info-container');
    const client = dbData.client;
    const database = dbData.database;
    
    let html = `
        <div style="margin-bottom: 30px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px;">Cliente</div>
                    <div style="font-size: 18px; font-weight: 600;"><strong>${escapeHtml(client.businessName)}</strong></div>
                </div>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px;">Nombre de BD</div>
                    <div style="font-size: 16px; font-family: monospace; word-break: break-all;"><code>${escapeHtml(client.databaseName)}</code></div>
                </div>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px;">Usuario Propietario</div>
                    <div style="font-size: 16px;"><strong>${escapeHtml(client.owner.username)}</strong></div>
                    <div style="font-size: 12px; color: #6b7280;">${escapeHtml(client.owner.email)}</div>
                </div>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px;">Total Colecciones</div>
                    <div style="font-size: 24px; font-weight: 700; color: #667eea;">${database.collectionCount}</div>
                </div>
            </div>
        </div>
        
        <div style="margin-top: 30px;">
            <h3 style="margin-bottom: 15px; color: #1f2937;">📚 Colecciones</h3>
            <div style="display: grid; gap: 10px;">
    `;
    
    // Mostrar cada colección
    database.collections.forEach(col => {
        const iconMap = {
            'users': '👥',
            'tickets': '🎫',
            'settings': '⚙️',
            'orders': '📦',
            'products': '🛍️',
            'clients': '🏢'
        };
        
        const icon = iconMap[col.name] || '📋';
        
        html += `
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 16px; font-weight: 600;">
                            <span style="font-size: 20px; margin-right: 10px;">${icon}</span>
                            ${escapeHtml(col.name)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 24px; font-weight: 700; color: #667eea;">${col.documentCount}</div>
                        <div style="font-size: 12px; color: #6b7280;">documento${col.documentCount !== 1 ? 's' : ''}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    // Mostrar información de usuarios si existe
    if (database.usersInfo) {
        const users = database.usersInfo;
        html += `
            <div style="margin-top: 30px;">
                <h3 style="margin-bottom: 15px; color: #1f2937;">👥 Usuarios (${users.total})</h3>
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f3f4f6; border-bottom: 1px solid #e5e7eb;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 14px;">Usuario</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 14px;">Email</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 14px;">Rol</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 14px;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        users.list.forEach(user => {
            const statusColor = user.status === 'activo' ? '#10b981' : '#ef4444';
            const statusIcon = user.status === 'activo' ? '✅' : '⏸️';
            
            html += `
                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                <td style="padding: 12px; font-weight: 500;">${escapeHtml(user.username || 'N/A')}</td>
                                <td style="padding: 12px; font-size: 14px;"><code>${escapeHtml(user.email || 'N/A')}</code></td>
                                <td style="padding: 12px; font-size: 14px; text-transform: capitalize;">${escapeHtml(user.role || 'N/A')}</td>
                                <td style="padding: 12px;">
                                    <span style="display: inline-block; background: ${statusColor}20; color: ${statusColor}; padding: 4px 12px; border-radius: 4px; font-size: 13px;">
                                        ${statusIcon} ${escapeHtml(user.status || 'N/A')}
                                    </span>
                                </td>
                            </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 10px;">
                    Mostrando primeros 20 usuarios • Activos: <strong>${users.active}</strong>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ============ GESTIÓN DEL LOGO GLOBAL DE FRESCOSENVIVO ============

async function loadLogoSettings() {
    try {
        const savedLogo = localStorage.getItem('frescosenvivo_logo');
        const preview = document.getElementById('current-logo-preview');
        const placeholder = document.getElementById('logo-placeholder');
        const logoUrl = document.getElementById('logo-url');
        
        if (savedLogo && savedLogo.trim()) {
            preview.src = savedLogo;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
            logoUrl.value = savedLogo;
        } else {
            preview.style.display = 'none';
            placeholder.style.display = 'flex';
            logoUrl.value = '';
        }
    } catch (error) {
        console.error('Error cargando configuración de logo:', error);
    }
}

function saveLogo() {
    const logoUrl = document.getElementById('logo-url').value.trim();
    const preview = document.getElementById('current-logo-preview');
    const placeholder = document.getElementById('logo-placeholder');
    
    if (!logoUrl) {
        showNotification('❌ Por favor, proporciona una URL del logo', 'error');
        return;
    }
    
    // Validar que sea una URL válida
    try {
        new URL(logoUrl);
    } catch (error) {
        showNotification('❌ URL del logo inválida', 'error');
        return;
    }
    
    // Guardar en localStorage
    localStorage.setItem('frescosenvivo_logo', logoUrl);
    
    // Actualizar vista previa
    preview.src = logoUrl;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    
    showNotification('✅ Logo guardado correctamente. Se actualizará en todas las tiendas.', 'success');
}

function resetLogo() {
    localStorage.removeItem('frescosenvivo_logo');
    
    const preview = document.getElementById('current-logo-preview');
    const placeholder = document.getElementById('logo-placeholder');
    const logoUrl = document.getElementById('logo-url');
    
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    logoUrl.value = '';
    
    showNotification('✅ Logo restaurado a emoji por defecto (🐟)', 'success');
}

// Cargar configuración de logo cuando se abre la vista de configuración
window.addEventListener('load', () => {
    setTimeout(loadLogoSettings, 500);
});

// Función para escapar HTML
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
