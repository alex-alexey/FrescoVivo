// Estado global
let currentView = 'dashboard';
let clients = [];
let stats = {};
let currentClientFilters = {};
let currentClientsPage = 1;
let clientsPageSize = 20;
let clientsPagination = { total: 0, page: 1, pages: 1, limit: 20 };
const CLIENT_FILTERS_STORAGE_KEY = 'superadmin_clients_filters_v1';
let selectedClientIds = new Set();
let currentClientSegment = 'all';
let billingClients = [];
let currentBillingFilters = {};
let currentBillingPage = 1;
let billingPageSize = 20;
let billingPagination = { total: 0, page: 1, pages: 1, limit: 20 };
let activityEvents = [];
let currentActivityFilters = {};
let currentActivityPage = 1;
let activityPageSize = 20;
let activityPagination = { total: 0, page: 1, pages: 1, limit: 20 };

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

let pricingCatalog = {
    plans: { ...PLAN_BASE_PRICES },
    addons: { ...DEFAULT_ADDON_PRICES },
    currency: 'EUR'
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
    setupMobileNavigation();
    loadClientFiltersState();
    loadDashboard();
    setupFormHandlers();
    setupFilters();
    syncClientFiltersUI();
    loadPricingSettings();
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

    if (window.innerWidth <= 768) {
        closeMobileSidebar();
    }
    
    currentView = viewName;
    
    // Cargar datos según la vista
    if (viewName === 'dashboard') {
        loadDashboard();
    } else if (viewName === 'clients') {
        syncClientFiltersUI();
        loadClients();
    } else if (viewName === 'billing') {
        loadBillingView();
    } else if (viewName === 'activity') {
        loadActivityView();
    } else if (viewName === 'pricing') {
        loadPricingSettings();
    } else if (viewName === 'databases') {
        loadClientSelectForDatabase();
    }
}

function setupMobileNavigation() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeMobileSidebar();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMobileSidebar();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeMobileSidebar();
        }
    });
}

function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
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
            updateRevenueTrendChart();
            updateRevenueByPlanChart();
            updateUpcomingDueDatesAlert();
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

function updateRevenueTrendChart() {
    const container = document.getElementById('revenue-trend-chart');
    
    if (!stats.revenueTrend || stats.revenueTrend.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No hay datos de tendencia</p>';
        return;
    }
    
    const points = stats.revenueTrend;
    const maxRevenue = Math.max(...points.map(d => d.revenue), 1);
    const totalRevenue = points.reduce((sum, d) => sum + d.revenue, 0);
    const avgRevenue = totalRevenue / points.length;
    const labelStep = Math.max(1, Math.ceil(points.length / 6));

    const labelIndexes = new Set([0, points.length - 1]);
    for (let i = labelStep; i < points.length - 1; i += labelStep) {
        labelIndexes.add(i);
    }

    container.innerHTML = `
        <div class="trend-summary-row">
            <div><strong>Total 30 días:</strong> ${formatCurrency(totalRevenue)}</div>
            <div><strong>Promedio diario:</strong> ${formatCurrency(avgRevenue)}</div>
        </div>

        <div class="revenue-trend-wrapper">
            <div class="revenue-trend-bars">
                ${points.map((point, idx) => {
                    const heightPercent = (point.revenue / maxRevenue) * 100;
                    const date = new Date(point.date);
                    const dayLabel = date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
                    const showLabel = labelIndexes.has(idx);
                    const safeHeight = Math.max(4, heightPercent);

                    return `
                        <div class="trend-bar-col" title="${dayLabel}: ${formatCurrency(point.revenue)}">
                            <div class="trend-bar-track">
                                <div class="trend-bar" style="height: ${safeHeight}%;"></div>
                            </div>
                            <small class="trend-x-label ${showLabel ? '' : 'hidden'}">${showLabel ? dayLabel : ''}</small>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>

        <div class="trend-range-note">
            <strong>Rango:</strong> ${formatCurrency(0)} - ${formatCurrency(maxRevenue)}
        </div>
    `;
}

function updateRevenueByPlanChart() {
    const container = document.getElementById('revenue-by-plan-chart');
    
    if (!stats.revenueByPlan || stats.revenueByPlan.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No hay datos de ingresos por plan</p>';
        return;
    }
    
    const maxRevenue = Math.max(...stats.revenueByPlan.map(p => p.revenue), 1);
    const totalRevenue = stats.revenueByPlan.reduce((sum, p) => sum + p.revenue, 0);
    const colors = ['#4f46e5', '#7c3aed', '#ec4899', '#f59e0b'];
    
    container.innerHTML = stats.revenueByPlan.map((plan, idx) => {
        const widthPercent = (plan.revenue / maxRevenue) * 100;
        const revenuePercent = totalRevenue > 0 ? Math.round((plan.revenue / totalRevenue) * 100) : 0;
        const color = colors[idx % colors.length];
        
        return `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div>
                        <span style="font-weight: 600;">${plan.planName}</span>
                        <span style="color: #999; font-size: 0.85rem; margin-left: 8px;">(${plan.count} cliente${plan.count !== 1 ? 's' : ''})</span>
                    </div>
                    <strong style="color: ${color};">${formatCurrency(plan.revenue)}</strong>
                </div>
                <div style="background: #e5e7eb; height: 12px; border-radius: 6px; overflow: hidden;">
                    <div style="background: ${color}; height: 100%; width: ${widthPercent}%; border-radius: 6px; transition: width 0.3s ease;"></div>
                </div>
                <small style="color: #999; margin-top: 4px; display: block;">${revenuePercent}% del total</small>
            </div>
        `;
    }).join('');
}

function updateUpcomingDueDatesAlert() {
    const container = document.getElementById('upcoming-due-dates-alert');
    
    if (!stats.upcomingDueDates || stats.upcomingDueDates.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    const statusColors = {
        'al_dia': '#10b981',
        'pendiente': '#f59e0b',
        'vencido': '#ef4444',
        'pausado': '#6b7280'
    };
    
    container.innerHTML = `
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <span style="font-size: 1.5rem;">⏰</span>
                <div>
                    <h4 style="margin: 0; font-size: 1rem; color: #92400e;">Próximos vencimientos (7 días)</h4>
                    <p style="margin: 4px 0 0 0; font-size: 0.9rem; color: #b45309;">${stats.upcomingDueDates.length} cliente${stats.upcomingDueDates.length !== 1 ? 's' : ''} con pago próximo</p>
                </div>
            </div>
            <div style="max-height: 200px; overflow-y: auto;">
                ${stats.upcomingDueDates.map(client => {
                    const daysUntilDue = Math.ceil((new Date(client.billing.nextDueDate) - new Date()) / (1000 * 60 * 60 * 24));
                    const statusColor = statusColors[client.billing.paymentStatus] || '#6b7280';
                    return `
                        <div style="padding: 8px 0; border-bottom: 1px solid #fcd34d; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: #78350f;">${client.businessName}</strong>
                                <small style="display: block; color: #92400e; margin-top: 2px;">Vence en ${daysUntilDue} día${daysUntilDue !== 1 ? 's' : ''}</small>
                            </div>
                            <span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${client.billing.paymentStatus}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Cargar Clientes
async function loadClients(filters = null) {
    try {
        const selectedFilters = (filters && typeof filters === 'object') ? filters : currentClientFilters;
        currentClientFilters = { ...selectedFilters };
        saveClientFiltersState();
        const queryPayload = {
            ...currentClientFilters,
            page: String(currentClientsPage),
            limit: String(clientsPageSize)
        };
        if (currentClientSegment && currentClientSegment !== 'all') {
            queryPayload.segment = currentClientSegment;
        }
        const queryParams = new URLSearchParams(queryPayload).toString();
        const url = queryParams ? `/api/superadmin/clients?${queryParams}` : '/api/superadmin/clients';
        const response = await authenticatedFetch(url);
        const result = await response.json();
        
        if (result.success) {
            clients = result.data;
            clientsPagination = result.pagination || { total: clients.length, page: 1, pages: 1, limit: clientsPageSize };
            currentClientsPage = clientsPagination.page || 1;
            selectedClientIds = new Set([...selectedClientIds].filter((id) => clients.some((c) => String(c._id) === String(id))));
            displayClientsTable(clients);
            renderClientsPagination();
            updateBulkActionsBar();
        }
    } catch (error) {
        console.error('Error al cargar clientes:', error);
        showNotification('Error al cargar clientes', 'error');
    }
}

function displayClientsTable(clientsList) {
    const container = document.getElementById('clients-table');
    
    if (!clientsList || clientsList.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:34px 16px;border:1px dashed #d1d5db;border-radius:10px;background:#fafafa;">
                <p style="color:#6b7280;margin-bottom:12px;">No se encontraron clientes con los filtros actuales.</p>
                <button class="btn-secondary" onclick="resetClientFilters()">Limpiar filtros</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width:40px;"><input type="checkbox" id="select-all-clients" onchange="toggleSelectAllClientsOnPage(this.checked)"></th>
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
                    const isChecked = selectedClientIds.has(String(client._id));
                    const canActivate = client.status !== 'activo';
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
                            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleClientSelection('${client._id}', this.checked)">
                        </td>
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
                            <button class="btn-sm ${canActivate ? 'btn-success' : 'btn-danger'}" onclick="toggleClientActive('${client._id}')" title="${canActivate ? 'Activar cliente' : 'Desactivar cliente'}">
                                ${canActivate ? '✅ Activar' : '⛔ Desactivar'}
                            </button>
                            ${client.status === 'propuesta' ? `<button class="btn-primary btn-sm" onclick="sendProposalEmail('${client._id}')" title="Enviar propuesta por email">📨 Propuesta</button>` : `<button class="btn-primary btn-sm" onclick="resendWelcomeEmail('${client._id}')" title="Reenviar email de bienvenida">📧</button>`}
                            <button class="btn-secondary btn-sm" onclick="openClientDrawer('${client._id}')" title="Ver ficha">
                                👁️ Ver
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

    const selectAllEl = document.getElementById('select-all-clients');
    if (selectAllEl) {
        const allSelected = clientsList.length > 0 && clientsList.every((client) => selectedClientIds.has(String(client._id)));
        selectAllEl.checked = allSelected;
    }
}

function renderClientsPagination() {
    const container = document.getElementById('clients-pagination');
    if (!container) return;

    const totalPages = Math.max(1, Number(clientsPagination.pages || 1));
    const page = Math.min(totalPages, Math.max(1, Number(currentClientsPage || 1)));
    const total = Number(clientsPagination.total || 0);

    if (totalPages <= 1) {
        container.innerHTML = total > 0
            ? `<div class="pagination-summary">${total} cliente${total !== 1 ? 's' : ''}</div>`
            : '';
        return;
    }

    const pageButtons = [];
    const maxButtons = 5;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
        start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
        pageButtons.push(`
            <button type="button" class="pagination-btn ${i === page ? 'active' : ''}" onclick="goToClientsPage(${i})">${i}</button>
        `);
    }

    container.innerHTML = `
        <div class="pagination-wrap">
            <div class="pagination-summary">
                ${total} cliente${total !== 1 ? 's' : ''} · Página ${page} de ${totalPages}
            </div>
            <div class="pagination-controls">
                <button type="button" class="pagination-btn" onclick="goToClientsPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
                ${pageButtons.join('')}
                <button type="button" class="pagination-btn" onclick="goToClientsPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
            </div>
        </div>
    `;
}

function goToClientsPage(nextPage) {
    const totalPages = Math.max(1, Number(clientsPagination.pages || 1));
    const target = Math.min(totalPages, Math.max(1, Number(nextPage || 1)));
    if (target === currentClientsPage) return;
    currentClientsPage = target;
    loadClients();
}

function parseClientSort(sortValue) {
    const safeSort = String(sortValue || 'createdAt_desc').trim();
    const [sortBy, sortDir] = safeSort.split('_');
    const validSortBy = ['createdAt', 'businessName', 'plan', 'status'];
    const validSortDir = ['asc', 'desc'];

    return {
        sortBy: validSortBy.includes(sortBy) ? sortBy : 'createdAt',
        sortDir: validSortDir.includes(sortDir) ? sortDir : 'desc'
    };
}

function getClientSortValueFromFilters(filters = {}) {
    const sortBy = filters.sortBy || 'createdAt';
    const sortDir = filters.sortDir || 'desc';
    return `${sortBy}_${sortDir}`;
}

function loadClientFiltersState() {
    try {
        const raw = localStorage.getItem(CLIENT_FILTERS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;

        const restored = {
            search: String(parsed.search || '').trim(),
            status: String(parsed.status || '').trim(),
            plan: String(parsed.plan || '').trim(),
            sortBy: String(parsed.sortBy || 'createdAt').trim(),
            sortDir: String(parsed.sortDir || 'desc').trim()
        };

        currentClientSegment = String(parsed.segment || 'all').trim() || 'all';

        Object.keys(restored).forEach((key) => {
            if (!restored[key]) delete restored[key];
        });

        currentClientFilters = restored;
        const parsedPage = Number(parsed.page || 1);
        currentClientsPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    } catch (error) {
        console.error('Error restaurando filtros de clientes:', error);
    }
}

function saveClientFiltersState() {
    try {
        const payload = {
            ...currentClientFilters,
            page: currentClientsPage,
            segment: currentClientSegment
        };
        localStorage.setItem(CLIENT_FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error('Error guardando filtros de clientes:', error);
    }
}

function syncClientFiltersUI() {
    const searchInput = document.getElementById('search-input');
    const statusSelect = document.getElementById('filter-status');
    const planSelect = document.getElementById('filter-plan');
    const sortSelect = document.getElementById('filter-sort');

    if (searchInput) searchInput.value = currentClientFilters.search || '';
    if (statusSelect) {
        // Si el status guardado es "prueba,propuesta", mostrar como "posibles-clientes"
        let statusValue = currentClientFilters.status || '';
        if (statusValue === 'prueba,propuesta' || statusValue === 'propuesta,prueba') {
            statusValue = 'posibles-clientes';
        }
        statusSelect.value = statusValue;
    }
    if (planSelect) planSelect.value = currentClientFilters.plan || '';
    if (sortSelect) sortSelect.value = getClientSortValueFromFilters(currentClientFilters);
    updateActiveClientSegmentUI();
}

function resetClientFilters() {
    currentClientFilters = {};
    currentClientsPage = 1;
    currentClientSegment = 'all';
    selectedClientIds.clear();
    syncClientFiltersUI();
    saveClientFiltersState();
    loadClients();
}

function updateActiveClientSegmentUI() {
    document.querySelectorAll('#clients-segments .segment-btn').forEach((btn) => {
        const segment = btn.getAttribute('data-segment') || 'all';
        btn.classList.toggle('active', segment === currentClientSegment);
    });
}

function applyClientSegment(segment) {
    const safeSegment = segment || 'all';
    currentClientSegment = safeSegment;
    selectedClientIds.clear();

    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) {
        if (safeSegment === 'active') statusSelect.value = 'activo';
        else if (safeSegment === 'trial') statusSelect.value = 'prueba';
        else if (safeSegment === 'suspended') statusSelect.value = 'suspendido';
        else statusSelect.value = '';
    }

    currentClientsPage = 1;
    updateActiveClientSegmentUI();
    applyFilters();
}

function toggleSelectAllClientsOnPage(checked) {
    clients.forEach((client) => {
        const id = String(client._id);
        if (checked) selectedClientIds.add(id);
        else selectedClientIds.delete(id);
    });
    displayClientsTable(clients);
    updateBulkActionsBar();
}

function toggleClientSelection(clientId, checked) {
    const id = String(clientId);
    if (checked) selectedClientIds.add(id);
    else selectedClientIds.delete(id);
    updateBulkActionsBar();

    const selectAllEl = document.getElementById('select-all-clients');
    if (selectAllEl) {
        const allSelected = clients.length > 0 && clients.every((client) => selectedClientIds.has(String(client._id)));
        selectAllEl.checked = allSelected;
    }
}

function clearClientSelection() {
    selectedClientIds.clear();
    displayClientsTable(clients);
    updateBulkActionsBar();
}

function updateBulkActionsBar() {
    const bar = document.getElementById('bulk-actions-bar');
    const info = document.getElementById('bulk-actions-info');
    if (!bar || !info) return;

    const count = selectedClientIds.size;
    if (count === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    info.textContent = `${count} cliente${count !== 1 ? 's' : ''} seleccionado${count !== 1 ? 's' : ''}`;
}

async function runBulkClientAction(action) {
    const selected = clients.filter((client) => selectedClientIds.has(String(client._id)));
    if (selected.length === 0) {
        showNotification('Selecciona al menos un cliente', 'info');
        return;
    }

    const labels = {
        activate: 'activar',
        deactivate: 'desactivar',
        resend_welcome: 'reenviar acceso'
    };
    const actionLabel = labels[action] || 'aplicar acción';

    const confirmed = await showConfirmModal(
        `¿Quieres ${actionLabel} para ${selected.length} cliente${selected.length !== 1 ? 's' : ''}?`,
        'Acción masiva'
    );
    if (!confirmed) return;

    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (const client of selected) {
        try {
            if (action === 'activate' || action === 'deactivate') {
                const shouldSkip = (action === 'activate' && client.status === 'activo') || (action === 'deactivate' && client.status !== 'activo');
                if (shouldSkip) {
                    skipped++;
                    continue;
                }

                const response = await authenticatedFetch(`/api/superadmin/clients/${client._id}/toggle-active`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: action === 'activate' ? 'activate' : 'deactivate' })
                });
                const result = await response.json();
                if (result.success) ok++;
                else failed++;
            } else if (action === 'resend_welcome') {
                const response = await authenticatedFetch(`/api/superadmin/resend-welcome/${client._id}`, { method: 'POST' });
                const result = await response.json();
                if (result.success) ok++;
                else failed++;
            }
        } catch (error) {
            failed++;
        }
    }

    showNotification(`✅ Completado: ${ok} ok${skipped ? ` · ${skipped} omitidos` : ''}${failed ? ` · ${failed} con error` : ''}`, failed ? 'info' : 'success');
    clearClientSelection();
    loadClients();
}

function openClientDrawer(clientId) {
    const client = clients.find((item) => String(item._id) === String(clientId));
    if (!client) return;

    const drawer = document.getElementById('client-drawer');
    const backdrop = document.getElementById('client-drawer-backdrop');
    const body = document.getElementById('client-drawer-body');
    if (!drawer || !backdrop || !body) return;

    const billing = calculateMonthlyBilling(client);
    const control = getBillingControl(client);
    const statusMeta = getBillingStatusMeta(control.effectiveStatus);

    body.innerHTML = `
        <div class="client-drawer-section">
            <h4>${client.businessName}</h4>
            <p>${client.domain}</p>
        </div>
        <div class="client-drawer-grid">
            <div><span>Plan</span><strong>${getPlanDisplay(client.plan)}</strong></div>
            <div><span>Estado</span><strong>${client.status}</strong></div>
            <div><span>Email</span><strong>${client.owner?.email || '—'}</strong></div>
            <div><span>Usuario</span><strong>${client.owner?.username || '—'}</strong></div>
            <div><span>Cobro mensual</span><strong>${formatCurrency(billing.total)}</strong></div>
            <div><span>Próximo cobro</span><strong>${control.nextDueDate ? formatDate(control.nextDueDate) : '—'}</strong></div>
        </div>
        <div class="client-drawer-section">
            <span class="drawer-billing-status" style="background:${statusMeta.bg};color:${statusMeta.color};">${statusMeta.label}</span>
        </div>
        <div class="client-drawer-actions">
            <button class="btn-secondary" onclick="editClient('${client._id}')">✏️ Editar</button>
            ${client.status === 'propuesta'
                ? `<button class="btn-primary" onclick="sendProposalEmail('${client._id}')">📨 Enviar propuesta</button>`
                : `<button class="btn-secondary" onclick="resendWelcomeEmail('${client._id}')">📧 Reenviar acceso</button>`}
            <button class="btn-secondary" onclick="toggleClientActive('${client._id}')">${client.status !== 'activo' ? '✅ Activar' : '⛔ Desactivar'}</button>
        </div>
    `;

    drawer.classList.add('open');
    backdrop.classList.add('open');
}

function closeClientDrawer() {
    const drawer = document.getElementById('client-drawer');
    const backdrop = document.getElementById('client-drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
}

function normalizeTextValue(value) {
    return String(value || '').trim();
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

function getPlanPrice(plan) {
    return toAmount(pricingCatalog?.plans?.[plan], PLAN_BASE_PRICES[plan] || PLAN_BASE_PRICES.basico);
}

function getAddonPrice(addonKey) {
    return toAmount(pricingCatalog?.addons?.[addonKey], DEFAULT_ADDON_PRICES[addonKey] || 0);
}

async function loadPricingSettings() {
    try {
        const response = await authenticatedFetch('/api/superadmin/pricing-settings');
        const result = await response.json();
        if (!result.success) {
            showNotification('❌ No se pudo cargar la configuración de precios', 'error');
            return;
        }

        pricingCatalog = {
            plans: {
                basico: toAmount(result?.data?.plans?.basico, PLAN_BASE_PRICES.basico),
                profesional: toAmount(result?.data?.plans?.profesional, PLAN_BASE_PRICES.profesional),
                empresarial: toAmount(result?.data?.plans?.empresarial, PLAN_BASE_PRICES.empresarial),
                personalizado: toAmount(result?.data?.plans?.personalizado, PLAN_BASE_PRICES.personalizado)
            },
            addons: {
                seoPro: toAmount(result?.data?.addons?.seoPro, DEFAULT_ADDON_PRICES.seoPro),
                premiumDesigns: toAmount(result?.data?.addons?.premiumDesigns, DEFAULT_ADDON_PRICES.premiumDesigns),
                reviewsReputation: toAmount(result?.data?.addons?.reviewsReputation, DEFAULT_ADDON_PRICES.reviewsReputation)
            },
            currency: String(result?.data?.currency || 'EUR').toUpperCase()
        };

        const planBasico = document.getElementById('price-plan-basico');
        const planProfesional = document.getElementById('price-plan-profesional');
        const planEmpresarial = document.getElementById('price-plan-empresarial');
        const planPersonalizado = document.getElementById('price-plan-personalizado');
        const addonSeo = document.getElementById('price-addon-seo-pro');
        const addonDesigns = document.getElementById('price-addon-premium-designs');
        const addonReviews = document.getElementById('price-addon-reviews');
        const currency = document.getElementById('price-currency');

        if (planBasico) planBasico.value = pricingCatalog.plans.basico;
        if (planProfesional) planProfesional.value = pricingCatalog.plans.profesional;
        if (planEmpresarial) planEmpresarial.value = pricingCatalog.plans.empresarial;
        if (planPersonalizado) planPersonalizado.value = pricingCatalog.plans.personalizado;
        if (addonSeo) addonSeo.value = pricingCatalog.addons.seoPro;
        if (addonDesigns) addonDesigns.value = pricingCatalog.addons.premiumDesigns;
        if (addonReviews) addonReviews.value = pricingCatalog.addons.reviewsReputation;
        if (currency) currency.value = pricingCatalog.currency;
    } catch (error) {
        console.error('Error al cargar pricing settings:', error);
        showNotification('❌ Error de conexión al cargar precios', 'error');
    }
}

async function savePricingSettings() {
    const payload = {
        plans: {
            basico: toAmount(document.getElementById('price-plan-basico')?.value, PLAN_BASE_PRICES.basico),
            profesional: toAmount(document.getElementById('price-plan-profesional')?.value, PLAN_BASE_PRICES.profesional),
            empresarial: toAmount(document.getElementById('price-plan-empresarial')?.value, PLAN_BASE_PRICES.empresarial),
            personalizado: toAmount(document.getElementById('price-plan-personalizado')?.value, PLAN_BASE_PRICES.personalizado)
        },
        addons: {
            seoPro: toAmount(document.getElementById('price-addon-seo-pro')?.value, DEFAULT_ADDON_PRICES.seoPro),
            premiumDesigns: toAmount(document.getElementById('price-addon-premium-designs')?.value, DEFAULT_ADDON_PRICES.premiumDesigns),
            reviewsReputation: toAmount(document.getElementById('price-addon-reviews')?.value, DEFAULT_ADDON_PRICES.reviewsReputation)
        },
        currency: (document.getElementById('price-currency')?.value || 'EUR').toUpperCase()
    };

    try {
        const response = await authenticatedFetch('/api/superadmin/pricing-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!result.success) {
            showNotification('❌ ' + (result.message || 'No se pudo guardar la configuración'), 'error');
            return;
        }

        await loadPricingSettings();
        showNotification('✅ Precios globales guardados correctamente', 'success');
    } catch (error) {
        console.error('Error guardando pricing settings:', error);
        showNotification('❌ Error de conexión al guardar precios', 'error');
    }
}

function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDomain(domain) {
    if (!domain) return false;
    return /^(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain.toLowerCase());
}

function toggleProposalRequiredFields(isProposal) {
    const conditionallyRequired = ['businessName', 'domain', 'ownerFullName', 'ownerEmail', 'ownerUsername'];
    conditionallyRequired.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (isProposal) {
            el.removeAttribute('required');
            el.placeholder = el.placeholder ? el.placeholder + ' (opcional en propuesta)' : 'Opcional en propuesta';
        } else {
            el.setAttribute('required', '');
            el.placeholder = (el.placeholder || '').replace(' (opcional en propuesta)', '').replace('Opcional en propuesta', '');
        }
    });
}

function validateClientPayload(payload, options = {}) {
    const { isEdit = false, isProposal = false } = options;
    const businessName = normalizeTextValue(payload.businessName);
    const domain = normalizeTextValue(payload.domain).toLowerCase();
    const ownerFullName = normalizeTextValue(payload.ownerFullName);
    const ownerEmail = normalizeTextValue(payload.ownerEmail).toLowerCase();
    const ownerUsername = normalizeTextValue(payload.ownerUsername).toLowerCase();

    if (businessName.length < 2) {
        if (!isProposal) return 'El nombre del negocio debe tener al menos 2 caracteres';
        return 'Introduce al menos la Razón social para guardar la propuesta';
    }

    if (!isProposal) {
        if (!isValidDomain(domain)) return 'Introduce un dominio válido (ej: negocio.com)';
        if (ownerFullName.length < 2) return 'El nombre del propietario es obligatorio';
        if (!isValidEmail(ownerEmail)) return 'Introduce un email válido para el propietario';
        if (!/^[a-z0-9._-]{3,30}$/.test(ownerUsername)) return 'El usuario debe tener 3-30 caracteres y solo usar letras, números, punto, guion o guion bajo';
    } else {
        if (ownerEmail && !isValidEmail(ownerEmail)) return 'El email introducido no es válido';
        if (domain && !isValidDomain(domain)) return 'El dominio introducido no es válido (ej: negocio.com)';
    }

    const billingEmail = normalizeTextValue(payload?.billingInfo?.billingEmail || '').toLowerCase();
    if (billingEmail && !isValidEmail(billingEmail)) return 'El email de facturación no es válido';

    const maxDailyTickets = Number(payload?.limits?.maxDailyTickets);
    if (!Number.isInteger(maxDailyTickets) || maxDailyTickets < 1 || maxDailyTickets > 100000) {
        return 'Tickets diarios debe estar entre 1 y 100000';
    }

    const maxCameras = Number(payload?.limits?.maxCameras);
    if (!Number.isInteger(maxCameras) || maxCameras < 1 || maxCameras > 100) {
        return 'Cámaras debe estar entre 1 y 100';
    }

    const basePlanPrice = Number(payload?.billing?.basePlanPrice ?? 0);
    if (!Number.isFinite(basePlanPrice) || basePlanPrice < 0) {
        return 'La cuota base debe ser un número mayor o igual a 0';
    }

    const discount = Number(payload?.billing?.discount ?? 0);
    if (!Number.isFinite(discount) || discount < 0) {
        return 'El descuento debe ser un número mayor o igual a 0';
    }

    const addonPrices = payload?.billing?.addonPrices || {};
    const addonValues = [addonPrices.seoPro, addonPrices.premiumDesigns, addonPrices.reviewsReputation];
    if (addonValues.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
        return 'Los precios de addons deben ser números mayores o iguales a 0';
    }

    const billingDay = Number(payload?.billing?.billingDayOfMonth);
    if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) {
        return 'El día de facturación debe estar entre 1 y 28';
    }

    if (isEdit) {
        const maxVendors = Number(payload?.limits?.maxVendors);
        const maxKiosks = Number(payload?.limits?.maxKiosks);
        const storageQuotaMB = Number(payload?.limits?.storageQuotaMB);

        if (!Number.isInteger(maxVendors) || maxVendors < 1 || maxVendors > 1000) {
            return 'Vendedores debe estar entre 1 y 1000';
        }
        if (!Number.isInteger(maxKiosks) || maxKiosks < 0 || maxKiosks > 1000) {
            return 'Kioskos debe estar entre 0 y 1000';
        }
        if (!Number.isInteger(storageQuotaMB) || storageQuotaMB < 100 || storageQuotaMB > 1000000) {
            return 'Almacenamiento debe estar entre 100MB y 1000000MB';
        }
    }

    return null;
}

// Configurar Formularios
function setupFormHandlers() {
    const createForm = document.getElementById('create-client-form');

    if (!createForm) {
        return;
    }
    
    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const isProposal = Boolean(document.getElementById('create-proposal-only')?.checked);
        const rawBusinessName = normalizeTextValue(document.getElementById('businessName').value);
        const rawLegalName = normalizeTextValue(document.getElementById('billingLegalName')?.value);
        // En modo propuesta, si no pusieron nombre de negocio, usar razón social
        const resolvedBusinessName = rawBusinessName || (isProposal ? rawLegalName : '');

        const formData = {
            businessName: resolvedBusinessName,
            domain: normalizeTextValue(document.getElementById('domain').value).toLowerCase(),
            storeType: document.getElementById('storeType').value,
            ownerFullName: normalizeTextValue(document.getElementById('ownerFullName').value),
            ownerEmail: normalizeTextValue(document.getElementById('ownerEmail').value).toLowerCase(),
            ownerUsername: normalizeTextValue(document.getElementById('ownerUsername').value).toLowerCase(),
            ownerPhone: normalizeTextValue(document.getElementById('ownerPhone').value),
            proposalOnly: isProposal,
            status: isProposal
                ? 'propuesta'
                : (document.getElementById('initialStatus')?.value || 'prueba'),
            subscriptionEndDate: document.getElementById('subscriptionEndDate')?.value || null,
            tags: normalizeTextValue(document.getElementById('createTags')?.value)
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            notes: normalizeTextValue(document.getElementById('createNotes')?.value),
            features: {
                seoPro: Boolean(document.getElementById('create-addon-seo-pro')?.checked),
                premiumDesigns: Boolean(document.getElementById('create-addon-premium-designs')?.checked),
                reviewsReputation: Boolean(document.getElementById('create-addon-reviews')?.checked)
            },
            billingInfo: {
                legalName: normalizeTextValue(document.getElementById('billingLegalName').value),
                taxId: normalizeTextValue(document.getElementById('billingTaxId').value).toUpperCase(),
                billingEmail: normalizeTextValue(document.getElementById('billingEmail').value).toLowerCase(),
                fiscalAddress: normalizeTextValue(document.getElementById('billingAddress').value),
                postalCode: normalizeTextValue(document.getElementById('billingPostalCode').value),
                city: normalizeTextValue(document.getElementById('billingCity').value),
                province: normalizeTextValue(document.getElementById('billingProvince').value),
                country: normalizeTextValue(document.getElementById('billingCountry').value) || 'España'
            },
            plan: document.getElementById('plan').value,
            billing: {
                currency: String(pricingCatalog?.currency || 'EUR').toUpperCase(),
                basePlanPrice: getPlanPrice(document.getElementById('plan').value),
                addonPrices: {
                    seoPro: getAddonPrice('seoPro'),
                    premiumDesigns: getAddonPrice('premiumDesigns'),
                    reviewsReputation: getAddonPrice('reviewsReputation')
                },
                discount: toAmount(document.getElementById('createDiscount')?.value, 0),
                billingDayOfMonth: toBillingDay(document.getElementById('createBillingDay')?.value, 5)
            },
            limits: {
                maxDailyTickets: parseInt(document.getElementById('maxDailyTickets').value),
                maxCameras: parseInt(document.getElementById('maxCameras').value)
            }
        };

        const validationError = validateClientPayload(formData, { isProposal });
        if (validationError) {
            showNotification(`❌ ${validationError}`, 'error');
            return;
        }
        
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

        const activitySearchInput = document.getElementById('activity-search-input');
        let activitySearchTimeout;
        if (activitySearchInput) {
            activitySearchInput.addEventListener('input', () => {
                clearTimeout(activitySearchTimeout);
                activitySearchTimeout = setTimeout(() => {
                    applyActivityFilters();
                }, 500);
            });
        }
}

function applyFilters() {
    const sortSelect = document.getElementById('filter-sort');
    const sortMeta = parseClientSort(sortSelect?.value);

    let statusValue = document.getElementById('filter-status').value;
    
    // Si selecciona "Posibles clientes", enviar ambos estados
    if (statusValue === 'posibles-clientes') {
        statusValue = 'prueba,propuesta';
    }

    const filters = {
        search: document.getElementById('search-input').value,
        status: statusValue,
        plan: document.getElementById('filter-plan').value,
        sortBy: sortMeta.sortBy,
        sortDir: sortMeta.sortDir
    };
    
    // Filtrar valores vacíos
    Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
    });

    currentClientsPage = 1;
    
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

    const willDeactivate = targetClient.status === 'activo';
    const action = willDeactivate ? 'deactivate' : 'activate';
    const actionLabel = willDeactivate ? 'desactivar' : 'activar';
    const message = willDeactivate
        ? `¿Quieres desactivar a "${targetClient.businessName}"?\n\nAl desactivarlo, su tienda dejará de funcionar hasta reactivarlo.`
        : `¿Quieres activar a "${targetClient.businessName}"?`;

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

async function loadBillingView(filters = {}) {
    try {
        const selectedFilters = (filters && typeof filters === 'object') ? filters : currentBillingFilters;
        currentBillingFilters = { ...selectedFilters };

        const params = new URLSearchParams();
        if (currentBillingFilters.search) params.set('search', currentBillingFilters.search);
        if (currentBillingFilters.plan) params.set('plan', currentBillingFilters.plan);
        if (currentBillingFilters.billingStatus) params.set('billingStatus', currentBillingFilters.billingStatus);
        params.set('page', String(currentBillingPage));
        params.set('limit', String(billingPageSize));
        const qs = params.toString() ? '?' + params.toString() : '';

        const [clientsRes, statsRes] = await Promise.all([
            authenticatedFetch('/api/superadmin/clients' + qs),
            authenticatedFetch('/api/superadmin/stats')
        ]);
        const clientsResult = await clientsRes.json();
        const statsResult = await statsRes.json();

        if (!clientsResult.success) return;

        billingClients = clientsResult.data || [];
        billingPagination = clientsResult.pagination || { total: billingClients.length, page: 1, pages: 1, limit: billingPageSize };
        currentBillingPage = billingPagination.page || 1;

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
        const vAmount = document.getElementById('billing-stat-vencidos-amount');
        const pAmount = document.getElementById('billing-stat-pendientes-amount');
        const aAmount = document.getElementById('billing-stat-aldia-amount');
        if (vEl) vEl.textContent = vencidos;
        if (pEl) pEl.textContent = pendientes;
        if (aEl) aEl.textContent = aldia;
        if (vAmount) vAmount.textContent = `En página (${billingClients.length}/${billingPagination.total || billingClients.length})`;
        if (pAmount) pAmount.textContent = `En página (${billingClients.length}/${billingPagination.total || billingClients.length})`;
        if (aAmount) aAmount.textContent = `En página (${billingClients.length}/${billingPagination.total || billingClients.length})`;

        displayBillingTable(billingClients);
        renderBillingPagination();
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
    currentBillingPage = 1;
    loadBillingView(filters);
}

function renderBillingPagination() {
    const container = document.getElementById('billing-pagination');
    if (!container) return;

    const totalPages = Math.max(1, Number(billingPagination.pages || 1));
    const page = Math.min(totalPages, Math.max(1, Number(currentBillingPage || 1)));
    const total = Number(billingPagination.total || 0);

    if (totalPages <= 1) {
        container.innerHTML = total > 0
            ? `<div class="pagination-summary">${total} cliente${total !== 1 ? 's' : ''}</div>`
            : '';
        return;
    }

    const pageButtons = [];
    const maxButtons = 5;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
        start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
        pageButtons.push(`<button type="button" class="pagination-btn ${i === page ? 'active' : ''}" onclick="goToBillingPage(${i})">${i}</button>`);
    }

    container.innerHTML = `
        <div class="pagination-wrap">
            <div class="pagination-summary">${total} cliente${total !== 1 ? 's' : ''} · Página ${page} de ${totalPages}</div>
            <div class="pagination-controls">
                <button type="button" class="pagination-btn" onclick="goToBillingPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
                ${pageButtons.join('')}
                <button type="button" class="pagination-btn" onclick="goToBillingPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
            </div>
        </div>
    `;
}

function goToBillingPage(nextPage) {
    const totalPages = Math.max(1, Number(billingPagination.pages || 1));
    const target = Math.min(totalPages, Math.max(1, Number(nextPage || 1)));
    if (target === currentBillingPage) return;
    currentBillingPage = target;
    loadBillingView();
}

// ══════════════════════════════════════════════
// VISTA DE ACTIVIDAD
// ══════════════════════════════════════════════

async function loadActivityView(filters = {}) {
    try {
        const selectedFilters = (filters && typeof filters === 'object') ? filters : currentActivityFilters;
        currentActivityFilters = { ...selectedFilters };

        const params = new URLSearchParams();
        if (currentActivityFilters.search) params.set('search', currentActivityFilters.search);
        if (currentActivityFilters.action) params.set('action', currentActivityFilters.action);
        params.set('page', String(currentActivityPage));
        params.set('limit', String(activityPageSize));

        const response = await authenticatedFetch(`/api/superadmin/audits?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            showNotification('❌ No se pudo cargar la actividad', 'error');
            return;
        }

        activityEvents = result.data || [];
        activityPagination = result.pagination || { total: activityEvents.length, page: 1, pages: 1, limit: activityPageSize };
        currentActivityPage = activityPagination.page || 1;

        const totalEl = document.getElementById('activity-total');
        if (totalEl) {
            const total = Number(activityPagination.total || 0);
            totalEl.textContent = `${total} evento${total !== 1 ? 's' : ''}`;
        }

        displayActivityTable(activityEvents);
        renderActivityPagination();
    } catch (error) {
        console.error('Error al cargar actividad:', error);
        showNotification('❌ Error de conexión al cargar actividad', 'error');
    }
}

function getActivityActionMeta(action) {
    const map = {
        'client.created': { label: 'Alta cliente', bg: '#dcfce7', color: '#166534' },
        'client.updated': { label: 'Edición cliente', bg: '#dbeafe', color: '#1e40af' },
        'client.activated': { label: 'Activación cliente', bg: '#dcfce7', color: '#166534' },
        'client.deactivated': { label: 'Desactivación cliente', bg: '#fee2e2', color: '#991b1b' },
        'billing.mark_paid': { label: 'Marcar cobro pagado', bg: '#fef3c7', color: '#92400e' },
        'client.activation_email_resent': { label: 'Reenvío activación', bg: '#ede9fe', color: '#5b21b6' },
        'client.deleted_logical': { label: 'Baja lógica cliente', bg: '#e5e7eb', color: '#374151' }
    };
    return map[action] || { label: action || 'Evento', bg: '#e5e7eb', color: '#374151' };
}

function displayActivityTable(events) {
    const container = document.getElementById('activity-table');
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">No hay eventos para los filtros seleccionados</div>';
        return;
    }

    const rows = events.map((event) => {
        const actionMeta = getActivityActionMeta(event.action);
        const actor = event?.actor?.username || 'superadmin';
        const targetName = event?.target?.businessName || '—';
        const targetDomain = event?.target?.domain || '';
        const details = event?.details?.message || '—';
        const ip = event?.requestMeta?.ip ? ` · IP ${event.requestMeta.ip}` : '';

        return `
            <tr>
                <td style="white-space:nowrap">${formatDate(event.createdAt)}</td>
                <td><strong>${escapeHtml(actor)}</strong>${ip ? `<br><small style="color:#6b7280">${escapeHtml(ip)}</small>` : ''}</td>
                <td><span style="background:${actionMeta.bg};color:${actionMeta.color};padding:3px 10px;border-radius:100px;font-size:0.75rem;font-weight:600">${escapeHtml(actionMeta.label)}</span></td>
                <td>${escapeHtml(targetName)}${targetDomain ? `<br><small style="color:#6b7280">${escapeHtml(targetDomain)}</small>` : ''}</td>
                <td>${escapeHtml(details)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Actor</th>
                    <th>Acción</th>
                    <th>Cliente</th>
                    <th>Detalle</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function applyActivityFilters() {
    const filters = {
        search: (document.getElementById('activity-search-input')?.value || '').trim(),
        action: document.getElementById('activity-filter-action')?.value || ''
    };
    Object.keys(filters).forEach((key) => {
        if (!filters[key]) delete filters[key];
    });
    currentActivityPage = 1;
    loadActivityView(filters);
}

function renderActivityPagination() {
    const container = document.getElementById('activity-pagination');
    if (!container) return;

    const totalPages = Math.max(1, Number(activityPagination.pages || 1));
    const page = Math.min(totalPages, Math.max(1, Number(currentActivityPage || 1)));
    const total = Number(activityPagination.total || 0);

    if (totalPages <= 1) {
        container.innerHTML = total > 0
            ? `<div class="pagination-summary">${total} evento${total !== 1 ? 's' : ''}</div>`
            : '';
        return;
    }

    const pageButtons = [];
    const maxButtons = 5;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
        start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
        pageButtons.push(`<button type="button" class="pagination-btn ${i === page ? 'active' : ''}" onclick="goToActivityPage(${i})">${i}</button>`);
    }

    container.innerHTML = `
        <div class="pagination-wrap">
            <div class="pagination-summary">${total} evento${total !== 1 ? 's' : ''} · Página ${page} de ${totalPages}</div>
            <div class="pagination-controls">
                <button type="button" class="pagination-btn" onclick="goToActivityPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
                ${pageButtons.join('')}
                <button type="button" class="pagination-btn" onclick="goToActivityPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
            </div>
        </div>
    `;
}

function goToActivityPage(nextPage) {
    const totalPages = Math.max(1, Number(activityPagination.pages || 1));
    const target = Math.min(totalPages, Math.max(1, Number(nextPage || 1)));
    if (target === currentActivityPage) return;
    currentActivityPage = target;
    loadActivityView();
}

// Editar Cliente
function editClient(clientId) {
    const client = clients.find(c => c._id === clientId);
    if (!client) return;
    const billingSummary = calculateMonthlyBilling(client);
    const billingControl = getBillingControl(client);
    const billingInfo = client.billingInfo || {};
    const tagsCsv = Array.isArray(client.tags) ? client.tags.join(', ') : '';
    
    // Llenar el modal con los datos del cliente
    const modal = document.getElementById('edit-modal');
    const modalBody = modal.querySelector('.modal-body');
    
    modalBody.innerHTML = `
        <form id="edit-client-form-dynamic" class="client-form">
            <input type="hidden" id="edit-client-id" value="${client._id}">

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
                            <option value="propuesta" ${client.status === 'propuesta' ? 'selected' : ''}>Propuesta</option>
                            <option value="suspendido" ${client.status === 'suspendido' ? 'selected' : ''}>Suspendido</option>
                            <option value="expirado" ${client.status === 'expirado' ? 'selected' : ''}>Expirado</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="edit-subscriptionEndDate">Fin de suscripción</label>
                        <input type="date" id="edit-subscriptionEndDate" value="${formatDateInputValue(client.subscriptionEndDate)}">
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

            </div>

            <div class="form-section">
                <h3 class="section-title">💶 Plan, Addons y Descuento</h3>

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

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-discount">Descuento mensual (€)</label>
                        <input type="number" id="edit-discount" min="0" step="0.01" value="${billingSummary.discount}">
                        <small>El precio base y addons se calculan desde el catálogo global.</small>
                    </div>
                    <div class="form-group">
                        <label for="edit-billing-day">Día cobro mensual</label>
                        <input type="number" id="edit-billing-day" min="1" max="28" step="1" value="${billingControl.billingDayOfMonth}">
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
                <h3 class="section-title">📝 Notas</h3>

                <div class="form-group" style="margin-bottom: 0.75rem;">
                    <label for="edit-tags">Etiquetas internas</label>
                    <input type="text" id="edit-tags" value="${tagsCsv}" placeholder="Ej: vip, seguimiento, potencial-upgrade">
                    <small>Separadas por coma.</small>
                </div>
                
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
    const existingClient = clients.find(c => String(c._id) === String(clientId));
    const currentBilling = getNormalizedBilling(existingClient);
    const currentBillingControl = getBillingControl(existingClient);
    const selectedPlan = document.getElementById('edit-plan').value;
    
    const formData = {
        businessName: normalizeTextValue(document.getElementById('edit-businessName').value),
        domain: normalizeTextValue(document.getElementById('edit-domain').value).toLowerCase(),
        storeType: document.getElementById('edit-storeType').value,
        ownerUsername: normalizeTextValue(document.getElementById('edit-ownerUsername').value).toLowerCase(),
        ownerFullName: normalizeTextValue(document.getElementById('edit-ownerFullName').value),
        ownerEmail: normalizeTextValue(document.getElementById('edit-ownerEmail').value).toLowerCase(),
        ownerPhone: normalizeTextValue(document.getElementById('edit-ownerPhone').value),
        plan: selectedPlan,
        status: document.getElementById('edit-status').value,
        subscriptionEndDate: document.getElementById('edit-subscriptionEndDate')?.value || null,
        tags: normalizeTextValue(document.getElementById('edit-tags')?.value)
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        features: {
            seoPro: Boolean(document.getElementById('edit-addon-seo-pro')?.checked),
            premiumDesigns: Boolean(document.getElementById('edit-addon-premium-designs')?.checked),
            reviewsReputation: Boolean(document.getElementById('edit-addon-reviews')?.checked)
        },
        billing: {
            currency: String(pricingCatalog?.currency || currentBilling.currency || 'EUR').toUpperCase(),
            basePlanPrice: getPlanPrice(selectedPlan),
            addonPrices: {
                seoPro: getAddonPrice('seoPro'),
                premiumDesigns: getAddonPrice('premiumDesigns'),
                reviewsReputation: getAddonPrice('reviewsReputation')
            },
            discount: toAmount(document.getElementById('edit-discount')?.value, 0),
            billingDayOfMonth: toBillingDay(document.getElementById('edit-billing-day')?.value, currentBillingControl.billingDayOfMonth),
            nextDueDate: existingClient?.billing?.nextDueDate || null,
            lastPaidAt: existingClient?.billing?.lastPaidAt || null,
            paymentStatus: existingClient?.billing?.paymentStatus || 'pendiente'
        },
        billingInfo: {
            legalName: normalizeTextValue(document.getElementById('edit-billing-legal-name')?.value),
            taxId: normalizeTextValue(document.getElementById('edit-billing-tax-id')?.value).toUpperCase(),
            billingEmail: normalizeTextValue(document.getElementById('edit-billing-email')?.value).toLowerCase(),
            fiscalAddress: normalizeTextValue(document.getElementById('edit-billing-address')?.value),
            postalCode: normalizeTextValue(document.getElementById('edit-billing-postal')?.value),
            city: normalizeTextValue(document.getElementById('edit-billing-city')?.value),
            province: normalizeTextValue(document.getElementById('edit-billing-province')?.value),
            country: normalizeTextValue(document.getElementById('edit-billing-country')?.value) || 'España'
        },
        limits: {
            maxDailyTickets: parseInt(document.getElementById('edit-maxDailyTickets').value) || 200,
            maxCameras: parseInt(document.getElementById('edit-maxCameras').value) || 4,
            maxKiosks: parseInt(document.getElementById('edit-maxKiosks')?.value) || 2,
            maxVendors: parseInt(document.getElementById('edit-maxVendors').value) || 3,
            storageQuotaMB: parseInt(document.getElementById('edit-storageQuotaMB')?.value) || 1000
        },
        notes: normalizeTextValue(document.getElementById('edit-notes').value)
    };

    const validationError = validateClientPayload(formData, { isEdit: true });
    if (validationError) {
        showNotification(`❌ ${validationError}`, 'error');
        return;
    }
    
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

async function sendProposalEmail(clientId) {
    const targetClient = clients.find(c => String(c._id) === String(clientId));
    const businessName = targetClient?.businessName || 'este cliente';

    if (!(await showConfirmModal(`¿Enviar la propuesta comercial a "${businessName}"?\n\nSe enviará un email con el plan, precio y notas indicados.`, '📨 Enviar Propuesta'))) {
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}/send-proposal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            showNotification(`✅ ${result.message}`, 'success');
            if (result.previewUrl) {
                const modal = document.createElement('div');
                modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
                modal.innerHTML = `
                    <div style="background:white;padding:30px;border-radius:12px;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                        <h2 style="color:#1A6B3C;margin-bottom:16px;">📨 Propuesta enviada</h2>
                        <p style="color:#374151;">La propuesta ha sido enviada a <strong>${businessName}</strong>.</p>
                        <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px;border-radius:4px;margin:16px 0;">
                            <strong>🧪 Modo Testing (Ethereal):</strong><br>
                            <a href="${result.previewUrl}" target="_blank" style="display:inline-block;margin-top:8px;padding:8px 12px;background:#f59e0b;color:white;text-decoration:none;border-radius:4px;font-size:13px;font-weight:bold;">📬 Ver email en Ethereal</a>
                        </div>
                        <button onclick="this.closest('div[style]').remove()" style="width:100%;padding:12px;background:#1A6B3C;color:white;border:none;border-radius:6px;cursor:pointer;font-size:15px;margin-top:8px;">Cerrar</button>
                    </div>`;
                document.body.appendChild(modal);
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
            }
        } else {
            showNotification(`❌ ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error enviando propuesta:', error);
        showNotification('❌ Error al enviar la propuesta', 'error');
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
        'edit-plan',
        'edit-addon-seo-pro',
        'edit-addon-premium-designs',
        'edit-addon-reviews',
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
                basePlanPrice: getPlanPrice(document.getElementById('edit-plan')?.value || 'basico'),
                addonPrices: {
                    seoPro: getAddonPrice('seoPro'),
                    premiumDesigns: getAddonPrice('premiumDesigns'),
                    reviewsReputation: getAddonPrice('reviewsReputation')
                },
                discount: toAmount(document.getElementById('edit-discount')?.value, 0)
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

    window.__editBillingRecalc = recalc;

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
    
    // Validar que sea una URL vÁlida
    try {
        new URL(logoUrl);
    } catch (error) {
        showNotification('❌ URL del logo invÁlida', 'error');
        return;
    }
    
    // Guardar en localStorage
    localStorage.setItem('frescosenvivo_logo', logoUrl);
    
    // Actualizar vista previa
    preview.src = logoUrl;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    
    showNotification('✅ Logo guardado correctamente. Se actualizarÁ en todas las tiendas.', 'success');
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
