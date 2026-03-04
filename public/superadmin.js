// Estado global
let currentView = 'dashboard';
let clients = [];
let stats = {};

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
async function loadClients(filters = {}) {
    try {
        const queryParams = new URLSearchParams(filters).toString();
        const response = await authenticatedFetch(`/api/superadmin/clients?${queryParams}`);
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
                    <th>Creado</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${clientsList.map(client => `
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
                        <td>${formatDate(client.createdAt)}</td>
                        <td>
                            <button class="btn-secondary btn-sm" onclick="editClient('${client._id}')" title="Editar cliente">
                                ✏️ Editar
                            </button>
                            <button class="btn-primary btn-sm" onclick="resendWelcomeEmail('${client._id}', '${client.businessName}')" title="Reenviar email de bienvenida">
                                📧
                            </button>
                            <button class="btn-danger btn-sm" onclick="deleteClient('${client._id}', '${client.businessName}')" title="Eliminar cliente">
                                🗑️
                            </button>
                        </td>
                    </tr>
                `).join('')}
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
            ownerFullName: document.getElementById('ownerFullName').value,
            ownerEmail: document.getElementById('ownerEmail').value,
            ownerUsername: document.getElementById('ownerUsername').value,
            ownerPassword: document.getElementById('ownerPassword').value,
            ownerPhone: document.getElementById('ownerPhone').value || '',
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

// Editar Cliente
function editClient(clientId) {
    const client = clients.find(c => c._id === clientId);
    if (!client) return;
    
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

                    <div class="form-group">
                        <label for="edit-ownerPassword">Nueva Contraseña</label>
                        <input type="password" id="edit-ownerPassword" name="ownerPassword" placeholder="Dejar vacío para no cambiar">
                        <small>Solo completar si deseas cambiar la contraseña</small>
                    </div>

                    <div class="form-group">
                        <label for="edit-ownerPasswordConfirm">Confirmar Contraseña</label>
                        <input type="password" id="edit-ownerPasswordConfirm" name="ownerPasswordConfirm" placeholder="Confirmar nueva contraseña">
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
    
    // Agregar event listener al formulario
    const form = document.getElementById('edit-client-form-dynamic');
    form.addEventListener('submit', handleEditSubmit);
}

// Manejar el envío del formulario de edición
async function handleEditSubmit(e) {
    e.preventDefault();
    
    const clientId = document.getElementById('edit-client-id').value;
    
    // Validar contraseñas si se están cambiando
    const password = document.getElementById('edit-ownerPassword').value;
    const passwordConfirm = document.getElementById('edit-ownerPasswordConfirm').value;
    
    if (password || passwordConfirm) {
        if (password !== passwordConfirm) {
            showNotification('❌ Las contraseñas no coinciden', 'error');
            return;
        }
        if (password.length < 6) {
            showNotification('❌ La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
    }
    
    const formData = {
        businessName: document.getElementById('edit-businessName').value,
        domain: document.getElementById('edit-domain').value,
        ownerUsername: document.getElementById('edit-ownerUsername').value,
        ownerFullName: document.getElementById('edit-ownerFullName').value,
        ownerEmail: document.getElementById('edit-ownerEmail').value,
        ownerPhone: document.getElementById('edit-ownerPhone').value,
        plan: document.getElementById('edit-plan').value,
        status: document.getElementById('edit-status').value,
        limits: {
            maxDailyTickets: parseInt(document.getElementById('edit-maxDailyTickets').value) || 200,
            maxCameras: parseInt(document.getElementById('edit-maxCameras').value) || 4,
            maxKiosks: parseInt(document.getElementById('edit-maxKiosks')?.value) || 2,
            maxVendors: parseInt(document.getElementById('edit-maxVendors').value) || 3,
            storageQuotaMB: parseInt(document.getElementById('edit-storageQuotaMB')?.value) || 1000
        },
        notes: document.getElementById('edit-notes').value
    };
    
    // Solo incluir contraseña si se está cambiando
    if (password) {
        formData.ownerPassword = password;
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
    if (!confirm(`¿Estás seguro de eliminar a "${businessName}"?\n\nEsta acción marcará el cliente como eliminado.`)) {
        return;
    }
    
    try {
        const response = await authenticatedFetch(`/api/superadmin/clients/${clientId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('✅ Cliente eliminado exitosamente', 'success');
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
    if (!confirm(`¿Reenviar email de bienvenida a "${businessName}"?\n\nSe generará una nueva contraseña temporal y se enviará por email.`)) {
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
            
            // Mostrar la contraseña temporal si está disponible
            if (result.note) {
                const tempPassword = result.note.split(': ')[1];
                
                // Crear un modal con la información
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
                
                modal.innerHTML = `
                    <div style="background: white; padding: 30px; border-radius: 12px; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <h2 style="color: #667eea; margin-bottom: 20px;">📧 Email enviado</h2>
                        <p style="margin-bottom: 15px;">El email de bienvenida ha sido enviado exitosamente.</p>
                        
                        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0; color: #92400e;">
                                <strong>⚠️ Contraseña temporal generada:</strong><br>
                                <code style="background: white; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 8px; font-size: 16px; font-weight: bold; color: #667eea;">
                                    ${tempPassword}
                                </code>
                            </p>
                        </div>
                        
                        <p style="font-size: 14px; color: #6b7280;">
                            Esta contraseña también fue enviada al email del cliente.
                        </p>
                        
                        <button onclick="this.parentElement.parentElement.remove()" 
                                style="width: 100%; padding: 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; margin-top: 20px;">
                            Entendido
                        </button>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // Cerrar al hacer clic fuera del modal
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.remove();
                    }
                });
            }
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
    if (confirm('¿Cerrar sesión?')) {
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
    if (!confirm('¿Estás seguro de que quieres cerrar sesión?')) {
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
