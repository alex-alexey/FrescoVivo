// Estado global
let storeConfig = null;
let currentSection = 'dashboard';

// Propagar ?tenant= en todas las llamadas API
const _urlParams = new URLSearchParams(window.location.search);
const _tenant = _urlParams.get('tenant');
function apiUrl(path) {
    return _tenant ? `${path}${path.includes('?') ? '&' : '?'}tenant=${_tenant}` : path;
}
function tenantHref(path) {
    return _tenant ? `${path}${path.includes('?') ? '&' : '?'}tenant=${_tenant}` : path;
}

// Verificar autenticación
async function checkAuth() {
    try {
        const response = await fetch(apiUrl('/api/auth/me'));
        const data = await response.json();
        
        if (!data.success || !data.user) {
            window.location.href = tenantHref('/login.html');
            return false;
        }

        // Si hay tenant en URL, la sesión debe ser del propietario de ese tenant
        // Si hay sesión de superadmin u otro tenant → cerrar sesión y redirigir
        if (_tenant && !data.user.isOwner) {
            showClosingSessions();
            await fetch('/api/auth/logout', { method: 'POST' });
            setTimeout(() => { window.location.href = tenantHref('/login.html'); }, 1500);
            return false;
        }
        
        // Mostrar nombre del negocio
        document.getElementById('business-name').textContent = 
            data.user.businessName || data.user.fullName || data.user.username;
        
        return true;
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = tenantHref('/login.html');
        return false;
    }
}

// Mostrar pantalla de cierre de sesiones pendientes
function showClosingSessions() {
    const loadingEl = document.getElementById('loading');
    loadingEl.innerHTML = `
        <div style="text-align:center; padding: 3rem;">
            <div style="font-size:3rem; margin-bottom:1rem;">🔒</div>
            <h2 style="font-size:1.4rem; margin-bottom:0.75rem; color:#1f2937;">Cerrando sesiones pendientes...</h2>
            <p style="color:#6b7280; margin-bottom:1.5rem;">Hay una sesión activa de otro usuario. Cerrándola automáticamente.</p>
            <div style="width:200px; height:4px; background:#e5e7eb; border-radius:2px; margin:0 auto; overflow:hidden;">
                <div style="height:100%; background:#2563eb; border-radius:2px; animation: progress 1.5s linear forwards;"></div>
            </div>
        </div>
        <style>
            @keyframes progress { from { width: 0% } to { width: 100% } }
        </style>
    `;
}

// Cerrar sesión
async function logout() {
    try {
        await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
        window.location.href = tenantHref('/login.html');
    } catch (error) {
        console.error('Error cerrando sesión:', error);
        window.location.href = tenantHref('/login.html');
    }
}

// Navegación entre secciones
function navigateTo(section) {
    // Ocultar todas las secciones
    document.querySelectorAll('.content-section').forEach(s => {
        s.classList.remove('active');
    });
    
    // Mostrar la sección seleccionada
    document.getElementById(section).classList.add('active');
    
    // Actualizar navegación activa
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
    
    // Actualizar título
    const titles = {
        'dashboard': 'Dashboard',
        'billing': 'Facturacion',
        'store-config': 'Configuración de Tienda',
        'products': 'Productos',
        'schedule': 'Horarios',
        'contact': 'Contacto',
        'cameras': 'Cámaras',
        'users': 'Usuarios'
    };
    document.getElementById('page-title').textContent = titles[section] || section;
    
    currentSection = section;
    
    // Cargar datos de la sección
    loadSectionData(section);
}

// Cargar datos de la sección
async function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'billing':
            loadBillingSection();
            break;
        case 'store-config':
            loadStoreConfig();
            break;
        case 'products':
            loadProducts();
            break;
        case 'schedule':
            loadSchedule();
            break;
        case 'contact':
            loadContact();
            break;
        case 'cameras':
            loadCameras();
            break;
    }
}

// Cargar dashboard
async function loadDashboard() {
    try {
        const config = await fetch(apiUrl('/api/store/config/admin')).then(r => r.json());
        
        // Actualizar stats
        document.getElementById('stat-products').textContent = config.products ? config.products.length : 0;
        document.getElementById('stat-cameras').textContent = '4'; // Por ahora fijo
        document.getElementById('stat-visitors').textContent = '—';
        document.getElementById('stat-tickets').textContent = '—';
    } catch (error) {
        console.error('Error cargando dashboard:', error);
    }
}

// Cargar configuración de tienda
async function loadStoreConfig() {
    try {
        const response = await fetch(apiUrl('/api/store/config/admin'));
        const config = await response.json();
        storeConfig = config;
        
        // Llenar el formulario
        document.getElementById('store-name').value = config.storeName || '';
        document.getElementById('store-tagline').value = config.tagline || '';
        document.getElementById('store-description').value = config.description || '';
        
        // Colores
        if (config.colors) {
            document.getElementById('color-primary').value = config.colors.primary || '#2563eb';
            document.getElementById('color-secondary').value = config.colors.secondary || '#059669';
            document.getElementById('color-accent').value = config.colors.accent || '#f59e0b';
            
            // Actualizar previews
            document.getElementById('preview-primary').style.background = config.colors.primary;
            document.getElementById('preview-secondary').style.background = config.colors.secondary;
            document.getElementById('preview-accent').style.background = config.colors.accent;
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

// Guardar configuración de tienda
async function saveStoreConfig(e) {
    e.preventDefault();
    
    const data = {
        storeName: document.getElementById('store-name').value,
        tagline: document.getElementById('store-tagline').value,
        description: document.getElementById('store-description').value
    };
    
    try {
        const response = await fetch(apiUrl('/api/store/config/basic'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Configuración guardada correctamente');
            
            // Guardar también los colores
            await saveColors();
        } else {
            alert('❌ Error guardando configuración');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error de conexión');
    }
}

// Guardar colores
async function saveColors() {
    const data = {
        primary: document.getElementById('color-primary').value,
        secondary: document.getElementById('color-secondary').value,
        accent: document.getElementById('color-accent').value
    };
    
    try {
        await fetch(apiUrl('/api/store/config/colors'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error('Error guardando colores:', error);
    }
}

// Cargar productos
async function loadProducts() {
    try {
        const response = await fetch(apiUrl('/api/store/config/admin'));
        const config = await response.json();
        
        const list = document.getElementById('products-list');
        
        if (!config.products || config.products.length === 0) {
            list.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No hay productos. Añade tu primer producto.</p>';
            return;
        }
        
        list.innerHTML = config.products.map(product => `
            <div class="card" style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">${product.name}</h3>
                        <p style="color: var(--text-light); font-size: 0.875rem;">${product.description || 'Sin descripción'}</p>
                        ${product.price ? `<p style="font-size: 1.25rem; font-weight: 600; color: var(--primary); margin-top: 0.5rem;">${product.price.toFixed(2)}€</p>` : ''}
                    </div>
                    <button class="btn btn-outline" onclick="deleteProduct('${product._id}')">🗑️ Eliminar</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

// Abrir modal de producto
function openProductModal() {
    const name = prompt('Nombre del producto:');
    if (!name) return;
    
    const description = prompt('Descripción:');
    const price = prompt('Precio (€):');
    const category = prompt('Categoría:');
    
    addProduct({ name, description, price: parseFloat(price), category });
}

// Añadir producto
async function addProduct(product) {
    try {
        const response = await fetch(apiUrl('/api/store/products'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(product)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Producto añadido');
            loadProducts();
        } else {
            alert('❌ Error añadiendo producto');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error de conexión');
    }
}

// Eliminar producto
async function deleteProduct(productId) {
    if (!confirm('¿Eliminar este producto?')) return;
    
    try {
        const response = await fetch(apiUrl(`/api/store/products/${productId}`), {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Producto eliminado');
            loadProducts();
        } else {
            alert('❌ Error eliminando producto');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error de conexión');
    }
}

// Cargar horarios
async function loadSchedule() {
    try {
        const response = await fetch(apiUrl('/api/store/config/admin'));
        const config = await response.json();
        
        const form = document.getElementById('schedule-form');
        const days = {
            monday: 'Lunes',
            tuesday: 'Martes',
            wednesday: 'Miércoles',
            thursday: 'Jueves',
            friday: 'Viernes',
            saturday: 'Sábado',
            sunday: 'Domingo'
        };
        
        form.innerHTML = `
            <form id="schedule-save-form">
                ${Object.entries(days).map(([key, name]) => {
                    const day = config.schedule?.[key] || { open: '09:00', close: '20:00', closed: false };
                    return `
                        <div class="card" style="margin-bottom: 1rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong>${name}</strong>
                                <label class="toggle">
                                    <input type="checkbox" id="closed-${key}" ${day.closed ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <div class="form-row" style="margin-top: 1rem;" id="hours-${key}">
                                <div class="form-group">
                                    <label class="form-label">Apertura</label>
                                    <input type="time" class="form-input" id="open-${key}" value="${day.open || '09:00'}">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Cierre</label>
                                    <input type="time" class="form-input" id="close-${key}" value="${day.close || '20:00'}">
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
                <button type="submit" class="btn btn-primary">💾 Guardar horarios</button>
            </form>
        `;
        
        // Añadir event listeners para los toggles
        Object.keys(days).forEach(key => {
            const toggle = document.getElementById(`closed-${key}`);
            const hoursDiv = document.getElementById(`hours-${key}`);
            toggle.addEventListener('change', () => {
                hoursDiv.style.display = toggle.checked ? 'none' : 'grid';
            });
            // Aplicar estado inicial
            hoursDiv.style.display = toggle.checked ? 'none' : 'grid';
        });
        
        // Handler del formulario
        document.getElementById('schedule-save-form').addEventListener('submit', saveSchedule);
    } catch (error) {
        console.error('Error cargando horarios:', error);
    }
}

// Guardar horarios
async function saveSchedule(e) {
    e.preventDefault();
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const schedule = {};
    
    days.forEach(day => {
        schedule[day] = {
            open: document.getElementById(`open-${day}`).value,
            close: document.getElementById(`close-${day}`).value,
            closed: document.getElementById(`closed-${day}`).checked
        };
    });
    
    try {
        const response = await fetch(apiUrl('/api/store/config/schedule'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Horarios guardados correctamente');
        } else {
            alert('❌ Error guardando horarios');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error de conexión');
    }
}

// Cargar contacto
async function loadContact() {
    try {
        const response = await fetch(apiUrl('/api/store/config/admin'));
        const config = await response.json();
        
        if (config.contact) {
            document.getElementById('contact-phone').value = config.contact.phone || '';
            document.getElementById('contact-email').value = config.contact.email || '';
            document.getElementById('contact-address').value = config.contact.address || '';
            document.getElementById('contact-city').value = config.contact.city || '';
            document.getElementById('contact-postal').value = config.contact.postalCode || '';
        }
    } catch (error) {
        console.error('Error cargando contacto:', error);
    }
}

function formatCurrencyEUR(amount) {
    const value = Number(amount || 0);
    return value.toLocaleString('es-ES', {
        style: 'currency',
        currency: 'EUR'
    });
}

function getInvoiceStatus(status) {
    const normalized = String(status || 'pending').toLowerCase();
    if (normalized === 'paid') {
        return { label: 'Pagada', className: 'paid' };
    }
    if (normalized === 'sent') {
        return { label: 'Enviada', className: 'sent' };
    }
    return { label: 'Pendiente', className: 'pending' };
}

function setBillingInfoMessage(message, isError = false) {
    const messageEl = document.getElementById('billing-info-message');
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.style.color = isError ? 'var(--danger)' : 'var(--text-light)';
}

function fillBillingInfoForm(info = {}) {
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };

    setValue('billing-legal-name', info.legalName);
    setValue('billing-tax-id', info.taxId);
    setValue('billing-email', info.billingEmail);
    setValue('billing-address', info.fiscalAddress);
    setValue('billing-postal-code', info.postalCode);
    setValue('billing-city', info.city);
    setValue('billing-province', info.province);
    setValue('billing-country', info.country || 'Espana');
}

async function saveBillingInfo(e) {
    e.preventDefault();

    const payload = {
        legalName: document.getElementById('billing-legal-name')?.value || '',
        taxId: document.getElementById('billing-tax-id')?.value || '',
        billingEmail: document.getElementById('billing-email')?.value || '',
        fiscalAddress: document.getElementById('billing-address')?.value || '',
        postalCode: document.getElementById('billing-postal-code')?.value || '',
        city: document.getElementById('billing-city')?.value || '',
        province: document.getElementById('billing-province')?.value || '',
        country: document.getElementById('billing-country')?.value || 'Espana'
    };

    try {
        const response = await fetch('/api/invoices/billing-info', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            setBillingInfoMessage(result.error || 'No se pudieron guardar los datos de facturacion.', true);
            return;
        }

        setBillingInfoMessage('Datos de facturacion guardados correctamente.');
    } catch (error) {
        console.error('Error guardando datos de facturacion:', error);
        setBillingInfoMessage('Error de conexion al guardar datos de facturacion.', true);
    }
}

async function loadBillingSection() {
    const planEl = document.getElementById('billing-plan');
    const nextEl = document.getElementById('billing-next');
    const totalEl = document.getElementById('billing-total');
    const stateEl = document.getElementById('billing-state');
    const historyEl = document.getElementById('billing-history');

    if (!planEl || !historyEl) return;

    try {
        const [currentRes, historyRes, billingInfoRes] = await Promise.all([
            fetch('/api/invoices/current', { cache: 'no-store' }),
            fetch('/api/invoices/history', { cache: 'no-store' }),
            fetch('/api/invoices/billing-info', { cache: 'no-store' })
        ]);

        if (!currentRes.ok || !historyRes.ok) {
            planEl.textContent = '-';
            nextEl.textContent = '-';
            totalEl.textContent = '-';
            stateEl.textContent = currentRes.status === 401 ? 'No autenticado' : 'No disponible';
            historyEl.innerHTML = '<div style="padding: 1rem; color: var(--text-light);">No se pudo cargar el historial de facturas.</div>';
            return;
        }

        const current = await currentRes.json();
        const history = await historyRes.json();
        if (billingInfoRes.ok) {
            const billingInfoData = await billingInfoRes.json();
            fillBillingInfoForm(billingInfoData?.billingInfo || {});
        } else {
            setBillingInfoMessage('No se pudieron cargar los datos de facturacion.', true);
        }

        const nextDue = current?.billingCycle?.nextDueDate
            ? new Date(current.billingCycle.nextDueDate).toLocaleDateString('es-ES')
            : 'Sin fecha';

        planEl.textContent = formatCurrencyEUR(current?.plan?.base || 0);
        nextEl.textContent = nextDue;
        totalEl.textContent = formatCurrencyEUR(current?.totalToCharge || 0);
        stateEl.textContent = 'Activo';

        const invoices = Array.isArray(history?.invoices) ? history.invoices : [];
        if (invoices.length === 0) {
            historyEl.innerHTML = '<div style="padding: 1rem; color: var(--text-light);">Todavia no hay facturas emitidas.</div>';
            return;
        }

        historyEl.innerHTML = `
            <table class="invoice-table">
                <thead>
                    <tr>
                        <th>Factura</th>
                        <th>Fecha</th>
                        <th>Importe</th>
                        <th>Estado</th>
                        <th>Accion</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoices.map((invoice) => {
                        const status = getInvoiceStatus(invoice.status);
                        const invoiceDate = invoice.date ? new Date(invoice.date).toLocaleDateString('es-ES') : '-';
                        return `
                            <tr>
                                <td>${invoice.invoiceNumber || '-'}</td>
                                <td>${invoiceDate}</td>
                                <td>${formatCurrencyEUR(invoice.amount || 0)}</td>
                                <td><span class="invoice-status ${status.className}">${status.label}</span></td>
                                <td><button class="btn btn-outline billing-download-btn" data-id="${invoice.invoiceId}">Descargar</button></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        historyEl.querySelectorAll('.billing-download-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const invoiceId = button.getAttribute('data-id');
                await downloadInvoice(invoiceId);
            });
        });
    } catch (error) {
        console.error('Error cargando facturas:', error);
        historyEl.innerHTML = '<div style="padding: 1rem; color: var(--danger);">Error cargando facturas.</div>';
    }
}

async function downloadInvoice(invoiceId) {
    if (!invoiceId) return;

    try {
        const response = await fetch(`/api/invoices/download/${encodeURIComponent(invoiceId)}`);
        if (!response.ok) {
            alert('No se pudo descargar la factura.');
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `factura_${invoiceId}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error descargando factura:', error);
        alert('Error al descargar la factura.');
    }
}

// Guardar contacto
async function saveContact(e) {
    e.preventDefault();
    
    const data = {
        phone: document.getElementById('contact-phone').value,
        email: document.getElementById('contact-email').value,
        address: document.getElementById('contact-address').value,
        city: document.getElementById('contact-city').value,
        postalCode: document.getElementById('contact-postal').value
    };
    
    try {
        const response = await fetch(apiUrl('/api/store/config/contact'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Contacto guardado correctamente');
        } else {
            alert('❌ Error guardando contacto');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error de conexión');
    }
}

// Event listeners para colores
function setupColorPickers() {
    ['primary', 'secondary', 'accent'].forEach(color => {
        const input = document.getElementById(`color-${color}`);
        const preview = document.getElementById(`preview-${color}`);
        
        input.addEventListener('input', (e) => {
            preview.style.background = e.target.value;
        });
    });
}

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticación
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    // Ocultar loading y mostrar app
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    // Configurar navegación
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            navigateTo(section);
        });
    });
    
    // Configurar formularios
    document.getElementById('store-form').addEventListener('submit', saveStoreConfig);
    document.getElementById('contact-form').addEventListener('submit', saveContact);
    document.getElementById('billing-info-form')?.addEventListener('submit', saveBillingInfo);
    
    // Configurar color pickers
    setupColorPickers();
    
    // Configurar camera modal
    const cameraModal = document.getElementById('camera-modal');
    document.querySelector('.close-modal')?.addEventListener('click', closeCameraModal);
    document.getElementById('camera-form')?.addEventListener('submit', saveCameraModal);
    document.getElementById('cancel-camera')?.addEventListener('click', closeCameraModal);
    
    // Cerrar modal al hacer click fuera
    window.addEventListener('click', (e) => {
        if (e.target === cameraModal) {
            closeCameraModal();
        }
    });
    
    // Cargar dashboard inicial
    loadDashboard();
});

// ==================== CAMERA MANAGEMENT ====================

/**
 * Cargar lista de cámaras del cliente
 */
async function loadCameras() {
    try {
        const grid = document.getElementById('camera-grid');
        if (!grid) return;

        // Mostrar loading
        grid.innerHTML = '<div class="loading">Cargando cámaras...</div>';

        const response = await authenticatedFetch(apiUrl('/api/cameras'));
        const cameras = await response.json();

        if (cameras.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>No hay cámaras configuradas</p>
                    <p>Haz click en "Añadir Cámara" para comenzar</p>
                </div>
            `;
            return;
        }

        // Renderizar cámaras
        grid.innerHTML = cameras.map(camera => `
            <div class="camera-card" data-camera-id="${camera._id}">
                <div class="camera-header">
                    <div class="camera-status-badge ${camera.isActive ? 'active' : 'inactive'}">
                        ${camera.isActive ? '● Activa' : '○ Inactiva'}
                    </div>
                    <span class="camera-position">${getPositionLabel(camera.position)}</span>
                </div>
                <div class="camera-info">
                    <h4>${camera.name}</h4>
                    ${camera.description ? `<p>${camera.description}</p>` : ''}
                    ${camera.deviceId ? `<small>Device ID: ${camera.deviceId}</small>` : ''}
                </div>
                <div class="camera-actions">
                    <button class="btn-icon" onclick="toggleCamera('${camera._id}')" title="Activar/Desactivar">
                        <i class="icon-power"></i> ${camera.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <button class="btn-icon" onclick="openCameraModal('${camera._id}')" title="Editar">
                        <i class="icon-edit"></i> Editar
                    </button>
                    <button class="btn-icon btn-danger" onclick="deleteCamera('${camera._id}')" title="Eliminar">
                        <i class="icon-delete"></i> Eliminar
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading cameras:', error);
        document.getElementById('camera-grid').innerHTML = `
            <div class="error-state">
                <p>Error al cargar las cámaras</p>
                <button onclick="loadCameras()" class="btn-secondary">Reintentar</button>
            </div>
        `;
    }
}

/**
 * Obtener etiqueta legible de posición
 */
function getPositionLabel(position) {
    const labels = {
        'vendor': 'Vendedor',
        'product1': 'Producto 1',
        'product2': 'Producto 2',
        'product3': 'Producto 3'
    };
    return labels[position] || position;
}

/**
 * Abrir modal para añadir o editar cámara
 */
async function openCameraModal(cameraId = null) {
    const modal = document.getElementById('camera-modal');
    const title = document.getElementById('camera-modal-title');
    const form = document.getElementById('camera-form');
    
    if (!modal || !form) return;

    // Reset form
    form.reset();
    document.getElementById('camera-id').value = '';

    if (cameraId) {
        // Modo edición - cargar datos de la cámara
        title.textContent = 'Editar Cámara';
        
        try {
            const response = await authenticatedFetch(`/api/cameras`);
            const cameras = await response.json();
            const camera = cameras.find(c => c._id === cameraId);

            if (camera) {
                document.getElementById('camera-id').value = camera._id;
                document.getElementById('camera-name').value = camera.name;
                document.getElementById('camera-description').value = camera.description || '';
                document.getElementById('camera-position').value = camera.position;
                document.getElementById('camera-device-id').value = camera.deviceId || '';
                document.getElementById('camera-stream-url').value = camera.streamUrl || '';
            }
        } catch (error) {
            console.error('Error loading camera:', error);
            alert('Error al cargar los datos de la cámara');
            return;
        }
    } else {
        // Modo creación
        title.textContent = 'Añadir Cámara';
    }

    modal.style.display = 'block';
}

/**
 * Cerrar modal de cámara
 */
function closeCameraModal() {
    const modal = document.getElementById('camera-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Guardar cámara (crear o actualizar)
 */
async function saveCameraModal(e) {
    e.preventDefault();

    const cameraId = document.getElementById('camera-id').value;
    const data = {
        name: document.getElementById('camera-name').value,
        description: document.getElementById('camera-description').value,
        position: document.getElementById('camera-position').value,
        deviceId: document.getElementById('camera-device-id').value,
        streamUrl: document.getElementById('camera-stream-url').value
    };

    try {
        const url = cameraId ? `/api/cameras/${cameraId}` : '/api/cameras';
        const method = cameraId ? 'PUT' : 'POST';

        const response = await authenticatedFetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeCameraModal();
            await loadCameras();
            alert(cameraId ? 'Cámara actualizada correctamente' : 'Cámara añadida correctamente');
        } else {
            const error = await response.json();
            alert(error.error || 'Error al guardar la cámara');
        }
    } catch (error) {
        console.error('Error saving camera:', error);
        alert('Error al guardar la cámara');
    }
}

/**
 * Eliminar cámara
 */
async function deleteCamera(cameraId) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta cámara?')) {
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/cameras/${cameraId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadCameras();
            alert('Cámara eliminada correctamente');
        } else {
            const error = await response.json();
            alert(error.error || 'Error al eliminar la cámara');
        }
    } catch (error) {
        console.error('Error deleting camera:', error);
        alert('Error al eliminar la cámara');
    }
}

/**
 * Activar/desactivar cámara
 */
async function toggleCamera(cameraId) {
    try {
        const response = await authenticatedFetch(`/api/cameras/${cameraId}/toggle`, {
            method: 'PATCH'
        });

        if (response.ok) {
            await loadCameras();
        } else {
            const error = await response.json();
            alert(error.error || 'Error al cambiar el estado de la cámara');
        }
    } catch (error) {
        console.error('Error toggling camera:', error);
        alert('Error al cambiar el estado de la cámara');
    }
}
