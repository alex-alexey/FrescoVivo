// @ts-nocheck
const socket = io();

function escHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
let vendorStream = null;
let productStreams = [null, null, null];
let peerConnection = null;
let activeClientId = null;
let clientAudioElement = null; // Audio del cliente
let currentUser = null; // Usuario actual logueado
let isLive = false; // Estado del live

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Elementos del DOM - Sistema de Doble Cola
const connectionStatus = document.getElementById('connection-status');
const userNameSpan = document.getElementById('user-name');
const userIconSpan = document.getElementById('user-icon');
const logoutBtn = document.getElementById('logout-btn');
const startCamerasBtn = document.getElementById('start-cameras');
const stopCamerasBtn = document.getElementById('stop-cameras');

const vendorCamera = document.getElementById('vendor-camera');
const productCamera1 = document.getElementById('product-camera-1');
const productCamera2 = document.getElementById('product-camera-2');
const productCamera3 = document.getElementById('product-camera-3');

const vendorCameraSelect = document.getElementById('vendor-camera-select');
const productCamera1Select = document.getElementById('product-camera-1-select');
const productCamera2Select = document.getElementById('product-camera-2-select');
const productCamera3Select = document.getElementById('product-camera-3-select');

const clientVideoSection = document.getElementById('client-video-section');
const clientNameLabel = document.getElementById('client-name-label');

const callStatusText = document.getElementById('call-status-text');
const activeClientInfo = document.getElementById('active-client-info');
const clientTypeIcon = document.getElementById('client-type-icon');
const activeClientName = document.getElementById('active-client-name');
const activeClientDetails = document.getElementById('active-client-details');

// Controles de cola
const generateStoreNumberBtn = document.getElementById('generate-store-number');
const acceptNextClientBtn = document.getElementById('accept-next-client');
const endCurrentCallBtn = document.getElementById('end-current-call');
const toggleVendorAudioBtn = document.getElementById('toggle-vendor-audio');
const nextTicketBtn = document.getElementById('next-ticket-btn');
const resetCounterBtn = document.getElementById('reset-counter-btn');

// Colas
const storeQueueCount = document.getElementById('store-queue-count');
const storeQueueList = document.getElementById('store-queue-list');
const onlineQueueCount = document.getElementById('online-queue-count');
const onlineQueueList = document.getElementById('online-queue-list');

// Contador de turnos
const lastTicketNumber = document.getElementById('last-ticket-number');
const currentServingNumber = document.getElementById('current-serving-number');
const ticketsWaiting = document.getElementById('tickets-waiting');

const goLiveBtn = document.getElementById('go-live-btn');
const stopLiveBtn = document.getElementById('stop-live-btn');
const liveStatus = document.getElementById('live-status');
const liveStatusText = document.getElementById('live-status-text');

const ordersCount = document.getElementById('orders-count');
const ordersList = document.getElementById('orders-list');

// Estado de las colas
let inStoreQueue = [];
let onlineQueue = [];
let currentActiveClient = null;
let lastIssuedTicket = 0;  // Último turno emitido
let currentServingTicket = null;  // Turno que se está atendiendo ahora

// Event Listeners
if (startCamerasBtn) startCamerasBtn.addEventListener('click', startAllCameras);
if (stopCamerasBtn) stopCamerasBtn.addEventListener('click', stopAllCameras);
if (goLiveBtn) {
    console.log('✅ goLiveBtn encontrado, agregando listener');
    goLiveBtn.addEventListener('click', () => {
        console.log('🔴 BOTÓN GO LIVE CLICKEADO');
        goLive();
    });
} else {
    console.error('❌ goLiveBtn NO encontrado en el DOM');
}
if (stopLiveBtn) {
    console.log('✅ stopLiveBtn encontrado, agregando listener');
    stopLiveBtn.addEventListener('click', stopLive);
} else {
    console.error('❌ stopLiveBtn NO encontrado en el DOM');
}
if (generateStoreNumberBtn) generateStoreNumberBtn.addEventListener('click', generateStoreNumber);
if (acceptNextClientBtn) acceptNextClientBtn.addEventListener('click', acceptNextClient);
if (endCurrentCallBtn) endCurrentCallBtn.addEventListener('click', endCurrentCall);
if (toggleVendorAudioBtn) toggleVendorAudioBtn.addEventListener('click', toggleVendorAudio);
if (nextTicketBtn) nextTicketBtn.addEventListener('click', advanceToNextTicket);
if (resetCounterBtn) resetCounterBtn.addEventListener('click', resetTicketCounter);
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// Cargar usuario actual
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
            // No hay sesión, redirigir al login
            window.location.href = '/login';
            return;
        }
        const data = await response.json();
        currentUser = data.user;
        
        // Actualizar UI
        if (userNameSpan) {
            userNameSpan.textContent = currentUser.fullName;
        }
        if (userIconSpan) {
            userIconSpan.textContent = currentUser.role === 'admin' ? '👑' : '👤';
        }
        
        console.log('👤 Usuario cargado:', currentUser.fullName, `(${currentUser.role})`);
    } catch (error) {
        console.error('Error cargando usuario:', error);
        window.location.href = '/login';
    }
}

// Función de logout
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (error) {
        console.error('Error en logout:', error);
        window.location.href = '/login';
    }
}

// Función para actualizar el badge de estado
function updateConnectionStatus() {
    if (connectionStatus) {
        if (isLive) {
            connectionStatus.textContent = 'En Vivo';
            connectionStatus.className = 'status-badge online';
        } else {
            connectionStatus.textContent = 'Desconectado';
            connectionStatus.className = 'status-badge offline';
        }
    }
}

// Función para cargar el estado del live desde el servidor
async function loadLiveStatus() {
    try {
        const response = await fetch('/api/live-status');
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.isLive) {
                console.log('🔴 Estado LIVE detectado desde API, esperando confirmación de Socket.IO...');
                // El estado se actualizará cuando vendor-connected responda
            }
        }
    } catch (error) {
        console.error('Error cargando estado del live:', error);
    }
}

// Cargar usuario y estado del live al iniciar
loadCurrentUser();
loadLiveStatus();

// Conectar como vendedor
console.log('🔌 Conectando como vendedor...');
console.log('🔌 Socket conectado inicial?:', socket.connected);
console.log('🔌 Socket ID inicial:', socket.id);

// Emitir vendor-connect inmediatamente si ya está conectado
if (socket.connected) {
    console.log('📤 Socket YA conectado, emitiendo vendor-connect inmediatamente...');
    socket.emit('vendor-connect');
}

socket.on('connect', () => {
    console.log('✅ Socket conectado! ID:', socket.id);
    console.log('📤 Emitiendo vendor-connect...');
    socket.emit('vendor-connect');
    
    // Verificar que se emitió
    setTimeout(() => {
        console.log('🔍 Verificación post-emit - Socket ID:', socket.id);
    }, 100);
});

socket.on('vendor-connected', (data) => {
    console.log('✅ Vendedor confirmado por el servidor');
    console.log('📊 Datos recibidos:', data);
    connectionStatus.textContent = 'Conectado';
    connectionStatus.className = 'status-badge online';
    
    // Habilitar el botón de iniciar cámaras una vez conectado
    if (startCamerasBtn) {
        startCamerasBtn.disabled = false;
    }
    
    // Actualizar último turno emitido
    if (data.lastTicketNumber !== undefined) {
        lastIssuedTicket = data.lastTicketNumber;
        updateTicketCounter();
    }
    
    // Actualizar ambas colas
    updateQueues(data.inStoreQueue || [], data.onlineQueue || []);
    
    // Restaurar estado del live
    if (data.isLive) {
        console.log('🔴 Restaurando estado LIVE desde el servidor');
        isLive = true;
        updateLiveStatus(true);
        updateConnectionStatus();
    } else {
        console.log('⚪ El servidor indica que NO estás en vivo');
        isLive = false;
        updateLiveStatus(false);
        updateConnectionStatus();
    }
    
    console.log('🎬 vendorSocket está listo en el servidor');
});

// Actualización de ambas colas
socket.on('queues-updated', (data) => {
    console.log('📊 Colas actualizadas:', data);
    updateQueues(data.inStoreQueue || [], data.onlineQueue || []);
});

// Notificación de nuevo cliente online
socket.on('new-online-client', (data) => {
    console.log('🔔 Nuevo cliente ONLINE en espera:', data.name);
    const ticketInfo = data.ticketNumber ? ` - Turno #${data.ticketNumber}` : '';
    showNotification(`🌐 Nuevo cliente online: ${data.name}${ticketInfo}`, 'info');
    
    // Actualizar último turno emitido
    if (data.ticketNumber) {
        lastIssuedTicket = data.ticketNumber;
        updateTicketCounter();
    }
});

// Número de tienda generado
socket.on('store-number-generated', (client) => {
    console.log('🏪 Número generado:', client.number);
    showNotification(`🏪 Número #${client.number} generado`, 'success');
    
    // Actualizar último turno emitido (también se usa para tienda)
    if (client.number) {
        lastIssuedTicket = client.number;
        updateTicketCounter();
    }
    // Opcional: Imprimir ticket o mostrar en pantalla grande
});

// Confirmación de reseteo de contador
socket.on('counter-reset', (data) => {
    console.log('🔄 Contador reseteado:', data);
    showNotification(data.message, 'success');
    
    // Resetear variables locales
    lastIssuedTicket = 0;
    currentServingTicket = null;
    updateTicketCounter();
});

socket.on('client-accepted', async (client) => {
    console.log('✅ Cliente aceptado:', client);
    currentActiveClient = client;
    
    // Actualizar turno que se está atendiendo
    const ticketNum = client.ticketNumber || client.number;
    if (ticketNum) {
        currentServingTicket = ticketNum;
        updateTicketCounter();
    }
    
    // Mostrar información del cliente activo
    activeClientInfo.style.display = 'block';
    
    // Determinar qué número mostrar
    let displayName = '';
    let displayDetails = '';
    
    if (client.queueType === 'in-store') {
        clientTypeIcon.textContent = '🏪';
        displayName = `Cliente Presencial #${client.number}`;
        displayDetails = `Turno #${client.number} · Tienda física`;
        callStatusText.textContent = `Atendiendo cliente presencial #${client.number}`;
    } else {
        clientTypeIcon.textContent = '🌐';
        displayName = client.name;
        const ticketInfo = client.ticketNumber ? `Turno #${client.ticketNumber}` : '';
        displayDetails = `${ticketInfo} · ${client.phone || 'Sin teléfono'}`;
        callStatusText.textContent = `En videollamada con: ${client.name}`;
        
        // Solo para clientes online: iniciar WebRTC
        activeClientId = client.id;
        clientVideoSection.style.display = 'block';
        clientNameLabel.textContent = client.name;
        
        console.log('🔗 Iniciando conexión WebRTC con el cliente online...');
        await startPeerConnection(client.id);
    }
    
    // Actualizar textos en la UI
    activeClientName.textContent = displayName;
    activeClientDetails.textContent = displayDetails;
    
    callStatusText.style.background = '#c6f6d5';
    endCurrentCallBtn.disabled = false;
    acceptNextClientBtn.disabled = true;
});

socket.on('no-clients', () => {
    showAlertModal('No hay clientes en la cola', '💯 Información');
});

socket.on('call-ended-confirm', () => {
    resetCallState();
});

socket.on('client-disconnected', () => {
    showAlertModal('El cliente se ha desconectado', '🚫 Desconectado');
    resetCallState();
});

socket.on('order-created', (order) => {
    addOrderToList(order);
});

// WebRTC signaling - Recibir respuesta del cliente
socket.on('webrtc-answer', async (data) => {
    console.log('📨 Respuesta WebRTC recibida del cliente');
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('✅ Respuesta establecida. Conexión WebRTC completada.');
    } else {
        console.error('❌ No hay peerConnection al recibir la respuesta');
    }
});

socket.on('webrtc-ice-candidate', async (data) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// ========== PUBLIC STREAM HANDLERS ==========
// Map para guardar conexiones públicas con espectadores
const publicViewers = new Map();

// Nuevo espectador quiere ver el stream público
socket.on('new-public-viewer', async (data) => {
    console.log('📹 Nuevo espectador público:', data.viewerId);
    
    if (!vendorStream || !productStreams[0] || !productStreams[1] || !productStreams[2]) {
        console.error('❌ Cámaras no están activas');
        return;
    }
    
    // Crear nueva conexión peer para este espectador
    const viewerPeerConnection = new RTCPeerConnection(configuration);
    publicViewers.set(data.viewerId, viewerPeerConnection);
    
    // Crear 4 MediaStreams separados (uno para cada cámara)
    // Stream 1: Vendedor (video + audio)
    const stream1 = new MediaStream();
    vendorStream.getTracks().forEach(track => {
        stream1.addTrack(track);
        viewerPeerConnection.addTrack(track, stream1);
    });
    
    // Stream 2: Producto 1 (video)
    const stream2 = new MediaStream();
    productStreams[0].getTracks().forEach(track => {
        stream2.addTrack(track);
        viewerPeerConnection.addTrack(track, stream2);
    });
    
    // Stream 3: Producto 2 (video)
    const stream3 = new MediaStream();
    productStreams[1].getTracks().forEach(track => {
        stream3.addTrack(track);
        viewerPeerConnection.addTrack(track, stream3);
    });
    
    // Stream 4: Producto 3 (video)
    const stream4 = new MediaStream();
    productStreams[2].getTracks().forEach(track => {
        stream4.addTrack(track);
        viewerPeerConnection.addTrack(track, stream4);
    });
    
    // Manejar ICE candidates
    viewerPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('public-stream-ice-candidate', {
                to: data.viewerId,
                candidate: event.candidate
            });
        }
    };
    
    // Crear y enviar offer
    const offer = await viewerPeerConnection.createOffer();
    await viewerPeerConnection.setLocalDescription(offer);
    
    socket.emit('public-stream-offer', {
        to: data.viewerId,
        offer: offer
    });
    
    console.log('✅ Offer público enviado a:', data.viewerId);
});

// Respuesta del espectador público
socket.on('public-stream-answer', async (data) => {
    console.log('📨 Respuesta de espectador público:', data.from);
    
    const viewerPeerConnection = publicViewers.get(data.from);
    if (viewerPeerConnection) {
        await viewerPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('✅ Stream público establecido con:', data.from);
    }
});

// ICE candidate de espectador público
socket.on('public-stream-ice-candidate', async (data) => {
    const viewerPeerConnection = publicViewers.get(data.from);
    if (viewerPeerConnection && data.candidate) {
        await viewerPeerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Funciones
async function getCameraDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
        console.error('Error al obtener dispositivos:', error);
        return [];
    }
}

async function populateCameraSelects() {
    const cameras = await getCameraDevices();
    
    const selects = [
        vendorCameraSelect,
        productCamera1Select,
        productCamera2Select,
        productCamera3Select
    ];
    
    selects.forEach(select => {
        select.innerHTML = '';
        cameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Cámara ${index + 1}`;
            select.appendChild(option);
        });
    });
    
    // Asignar diferentes cámaras por defecto si hay suficientes
    if (cameras.length >= 4) {
        productCamera1Select.selectedIndex = 1;
        productCamera2Select.selectedIndex = 2;
        productCamera3Select.selectedIndex = 3;
    }
    
    // Event listeners para cambio de cámara
    vendorCameraSelect.addEventListener('change', () => switchCamera(0, vendorCameraSelect.value));
    productCamera1Select.addEventListener('change', () => switchCamera(1, productCamera1Select.value));
    productCamera2Select.addEventListener('change', () => switchCamera(2, productCamera2Select.value));
    productCamera3Select.addEventListener('change', () => switchCamera(3, productCamera3Select.value));
}

async function startCamera(deviceId, videoElement, withAudio = false) {
    try {
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : undefined },
            audio: withAudio  // Solo audio para la cámara principal del vendedor
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        return stream;
    } catch (error) {
        console.error('Error al iniciar cámara:', error);
        showAlertModal('No se pudo acceder a la cámara. Verifica los permisos.', '💷 Error');
        return null;
    }
}

async function startAllCameras() {
    // Expandir la sección de cámaras si está colapsada
    const cameraSection = document.querySelector('.camera-section-collapsible');
    if (cameraSection && !cameraSection.open) {
        cameraSection.open = true;
    }
    
    await populateCameraSelects();
    
    // Cámara principal con audio
    vendorStream = await startCamera(vendorCameraSelect.value, vendorCamera, true);
    
    // Cámaras de productos sin audio (solo video)
    productStreams[0] = await startCamera(productCamera1Select.value, productCamera1, false);
    productStreams[1] = await startCamera(productCamera2Select.value, productCamera2, false);
    productStreams[2] = await startCamera(productCamera3Select.value, productCamera3, false);
    
    if (vendorStream && productStreams.every(s => s !== null)) {
        startCamerasBtn.disabled = true;
        stopCamerasBtn.disabled = false;
        goLiveBtn.disabled = false;
        
        // Mostrar los videos de las cámaras
        vendorCamera.style.display = 'block';
        productCamera1.style.display = 'block';
        productCamera2.style.display = 'block';
        productCamera3.style.display = 'block';
        
        // Agregar indicador visual de cámaras activas
        if (cameraSection) {
            const summary = cameraSection.querySelector('summary');
            if (summary && !summary.textContent.includes('🟢')) {
                summary.textContent = '🟢 📹 Cámaras Activas';
            }
        }
        
        showNotification('✅ Todas las cámaras iniciadas correctamente', 'success');
    }
}

function goLive() {
    console.log('goLive: Intentando iniciar transmisión...');
    console.log('goLive: Socket conectado?:', socket.connected);
    console.log('goLive: Socket ID:', socket.id);
    console.log('goLive: Streams disponibles:', {
        vendor: !!vendorStream,
        product1: !!productStreams[0],
        product2: !!productStreams[1],
        product3: !!productStreams[2]
    });
    
    if (!socket.connected) {
        console.error('❌ Socket NO está conectado!');
        showNotification('Error: No hay conexión con el servidor. Recarga la página.', 'error');
        return;
    }
    
    if (!vendorStream || !productStreams[0] || !productStreams[1] || !productStreams[2]) {
        console.error('❌ No todas las cámaras están activas');
        showNotification('Error: Debes iniciar todas las cámaras primero', 'error');
        return;
    }
    
    // Timeout para respuesta del servidor (5 segundos)
    const responseTimeout = setTimeout(() => {
        console.error('⏱️ Timeout: El servidor no respondió');
        isLive = false;
        updateLiveStatus(false);
        updateConnectionStatus();
        showNotification('Error: Timeout del servidor. Intenta de nuevo.', 'error');
    }, 5000);
    
    // Listener para respuesta del servidor
    socket.once('vendor-go-live-response', (response) => {
        clearTimeout(responseTimeout);
        console.log('📡 Respuesta del servidor:', response);
        if (response.success) {
            console.log('✅ Transmisión iniciada exitosamente');
            isLive = true;
            updateLiveStatus(true);
            updateConnectionStatus();
            
            // Mostrar los videos de las cámaras
            vendorCamera.style.display = 'block';
            productCamera1.style.display = 'block';
            productCamera2.style.display = 'block';
            productCamera3.style.display = 'block';
            
            showNotification('¡Transmisión iniciada! Los clientes pueden ver las cámaras.', 'success');
        } else {
            console.error('❌ Error al iniciar transmisión:', response.error);
            isLive = false;
            updateLiveStatus(false);
            updateConnectionStatus();
            showNotification(`Error: ${response.error || 'No se pudo iniciar la transmisión'}`, 'error');
        }
    });
    
    socket.emit('vendor-go-live');
    console.log('goLive: Evento vendor-go-live emitido - esperando respuesta del servidor...');
}

function stopLive() {
    // Timeout para respuesta del servidor (5 segundos)
    const responseTimeout = setTimeout(() => {
        console.error('⏱️ Timeout: El servidor no respondió');
        showNotification('Error: Timeout del servidor.', 'error');
    }, 5000);
    
    socket.once('vendor-stop-live-response', (response) => {
        clearTimeout(responseTimeout);
        console.log('📡 Respuesta del servidor:', response);
        if (response.success) {
            isLive = false;
            updateLiveStatus(false);
            updateConnectionStatus();
            
            // Ocultar los videos de las cámaras
            vendorCamera.style.display = 'none';
            productCamera1.style.display = 'none';
            productCamera2.style.display = 'none';
            productCamera3.style.display = 'none';
            
            showNotification('Transmisión detenida. Los clientes no podrán unirse.', 'success');
        } else {
            showNotification(`Error: ${response.error || 'No se pudo detener la transmisión'}`, 'error');
        }
    });
    
    socket.emit('vendor-stop-live');
}

function updateLiveStatus(isLiveStatus) {
    if (!liveStatus) {
        console.error('❌ liveStatus element not found');
        return;
    }
    
    if (isLiveStatus) {
        liveStatus.classList.remove('offline');
        liveStatus.classList.add('live');
        liveStatusText.textContent = '🔴 EN VIVO';
        goLiveBtn.style.display = 'none';
        stopLiveBtn.style.display = 'inline-block';
        acceptNextClientBtn.disabled = false;
    } else {
        liveStatus.classList.remove('live');
        liveStatus.classList.add('offline');
        liveStatusText.textContent = 'FUERA DE LÍNEA';
        goLiveBtn.style.display = 'inline-block';
        stopLiveBtn.style.display = 'none';
        acceptNextClientBtn.disabled = true;
    }
}

function stopAllCameras() {
    if (vendorStream) {
        vendorStream.getTracks().forEach(track => track.stop());
        vendorStream = null;
    }
    
    productStreams.forEach((stream, index) => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            productStreams[index] = null;
        }
    });
    
    vendorCamera.srcObject = null;
    productCamera1.srcObject = null;
    productCamera2.srcObject = null;
    productCamera3.srcObject = null;
    
    // Ocultar los videos
    vendorCamera.style.display = 'none';
    productCamera1.style.display = 'none';
    productCamera2.style.display = 'none';
    productCamera3.style.display = 'none';
    
    startCamerasBtn.disabled = false;
    stopCamerasBtn.disabled = true;
    goLiveBtn.disabled = true;
    
    // Actualizar indicador visual
    const cameraSection = document.querySelector('.camera-section-collapsible');
    if (cameraSection) {
        const summary = cameraSection.querySelector('summary');
        if (summary) {
            summary.textContent = '📹 Gestión de Cámaras';
        }
    }
    
    // Detener transmisión si estaba activa
    if (liveStatusText.textContent === '🔴 EN VIVO') {
        stopLive();
    }
    
    showNotification('Cámaras detenidas', 'info');
}

async function switchCamera(cameraIndex, deviceId) {
    console.log(`🔄 Cambiando cámara ${cameraIndex} a dispositivo:`, deviceId);
    let stream, videoElement;
    const withAudio = (cameraIndex === 0);  // Solo la cámara principal tiene audio
    
    switch(cameraIndex) {
        case 0:
            if (vendorStream) vendorStream.getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, vendorCamera, withAudio);
            vendorStream = stream;
            break;
        case 1:
            if (productStreams[0]) productStreams[0].getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, productCamera1, withAudio);
            productStreams[0] = stream;
            break;
        case 2:
            if (productStreams[1]) productStreams[1].getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, productCamera2, withAudio);
            productStreams[1] = stream;
            break;
        case 3:
            if (productStreams[2]) productStreams[2].getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, productCamera3, withAudio);
            productStreams[2] = stream;
            break;
    }
    
    if (!stream) {
        console.error('❌ No se pudo cambiar la cámara');
        return;
    }
    
    console.log('✅ Nueva cámara iniciada, actualizando conexiones...');
    
    // Actualizar conexión WebRTC activa con cliente (si existe)
    if (peerConnection && stream) {
        updatePeerConnectionTracks(peerConnection, cameraIndex, stream);
    }
    
    // Actualizar todas las conexiones de espectadores públicos
    publicViewers.forEach((viewerPeerConnection, viewerId) => {
        console.log(`📹 Actualizando stream para espectador: ${viewerId}`);
        updatePeerConnectionTracks(viewerPeerConnection, cameraIndex, stream);
    });
    
    console.log('✅ Todas las conexiones actualizadas con la nueva cámara');
}

// Función auxiliar para actualizar tracks en una conexión peer
function updatePeerConnectionTracks(peerConnection, cameraIndex, stream) {
    const senders = peerConnection.getSenders();
    const videoTrack = stream.getVideoTracks()[0];
    
    // Encontrar el sender de video correspondiente
    // Para cámara 0 (vendor), buscar el primer video track
    // Para cámaras 1-3 (productos), buscar por índice
    const videoSenders = senders.filter(sender => sender.track && sender.track.kind === 'video');
    
    if (videoSenders[cameraIndex]) {
        videoSenders[cameraIndex].replaceTrack(videoTrack);
        console.log(`✅ Track ${cameraIndex} reemplazado exitosamente`);
    } else {
        console.warn(`⚠️ No se encontró sender para cámara ${cameraIndex}`);
    }
}

function acceptNextClient() {
    socket.emit('accept-next-client');
}

function endCurrentCall() {
    socket.emit('end-call');
    resetCallState();
}

// Función para avanzar manualmente al siguiente turno (para clientes presenciales)
function advanceToNextTicket() {
    // Si estamos atendiendo un turno, avanzar al siguiente
    if (currentServingTicket !== null) {
        currentServingTicket = null;
        console.log('✅ Turno completado manualmente, listo para el siguiente');
    }
    
    // Si hay clientes en la cola presencial, no hacemos nada más
    // El vendedor debe aceptar manualmente al siguiente cliente presencial
    
    updateTicketCounter();
    
    // Mostrar notificación
    showNotification('Turno completado. Puedes atender al siguiente cliente.', 'success');
}

async function resetTicketCounter() {
    // Confirmar acción con el usuario
    if (!(await showConfirmModal('¿Estás seguro de que quieres resetear el contador de turnos? Esto reiniciará la numeración a 1 y limpiará todas las colas.', '⚠️ Resetear Contador'))) {
        return;
    }
    
    // Enviar evento al servidor para resetear el contador
    socket.emit('reset-ticket-counter');
    
    console.log('🔄 Solicitud de reseteo de contador enviada');
    showNotification('Contador de turnos reseteado', 'info');
}

function resetCallState() {
    activeClientId = null;
    currentServingTicket = null;  // Resetear turno en atención
    updateTicketCounter();  // Actualizar contador
    
    callStatusText.textContent = 'Sin llamada activa';
    callStatusText.style.background = '#f7fafc';
    endCurrentCallBtn.disabled = true;
    acceptNextClientBtn.disabled = false;
    clientVideoSection.style.display = 'none';
    
    // Ocultar información del cliente activo
    activeClientInfo.style.display = 'none';
    
    // Detener audio del cliente
    if (clientAudioElement) {
        clientAudioElement.pause();
        clientAudioElement.srcObject = null;
        clientAudioElement = null;
        console.log('🔇 Audio del cliente detenido');
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log('🔒 Conexión WebRTC cerrada');
    }
}

function toggleVendorAudio() {
    if (vendorStream) {
        const audioTrack = vendorStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            toggleVendorAudioBtn.textContent = audioTrack.enabled ? '🎤 Silenciar' : '🎤 Activar';
        }
    }
}

async function startPeerConnection(clientId) {
    console.log('🔗 Creando RTCPeerConnection...');
    peerConnection = new RTCPeerConnection(configuration);
    
    // Agregar todos los streams (vendedor + 3 productos)
    if (vendorStream) {
        vendorStream.getTracks().forEach(track => {
            console.log('📤 Agregando track del vendedor:', track.kind);
            peerConnection.addTrack(track, vendorStream);
        });
    }
    
    productStreams.forEach((stream, index) => {
        if (stream) {
            stream.getTracks().forEach(track => {
                console.log(`📤 Agregando track del producto ${index + 1}:`, track.kind);
                peerConnection.addTrack(track, stream);
            });
        }
    });
    
    // Recibir stream del cliente (solo audio)
    peerConnection.ontrack = (event) => {
        console.log('📥 Track del cliente recibido:', event.track.kind);
        if (event.track.kind === 'audio') {
            // Crear un elemento de audio para reproducir el audio del cliente
            if (clientAudioElement) {
                clientAudioElement.pause();
                clientAudioElement.srcObject = null;
            }
            clientAudioElement = new Audio();
            clientAudioElement.srcObject = event.streams[0];
            clientAudioElement.play();
            console.log('🔊 Reproduciendo audio del cliente');
        }
    };
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
                to: clientId,
                candidate: event.candidate
            });
        }
    };
    
    // Crear oferta
    console.log('📝 Creando oferta WebRTC...');
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log('📤 Enviando oferta al cliente:', clientId);
    
    socket.emit('webrtc-offer', {
        to: clientId,
        offer: offer
    });
}

// ═══════════════════════════════════════════════
// FUNCIONES PARA SISTEMA DE DOBLE COLA
// ═══════════════════════════════════════════════

function generateStoreNumber() {
    console.log('🏪 Generando número de tienda...');
    socket.emit('generate-store-number');
}

function updateQueues(storeQueue, onlineQueue) {
    inStoreQueue = storeQueue || [];
    onlineQueue = onlineQueue || [];
    
    // Actualizar último turno emitido basándose en el número más alto
    let maxTicket = lastIssuedTicket; // Mantener el actual como mínimo
    
    // Buscar el número más alto en la cola presencial
    inStoreQueue.forEach(client => {
        if (client.number && client.number > maxTicket) {
            maxTicket = client.number;
        }
    });
    
    // Buscar el número más alto en la cola online (ticketNumber)
    onlineQueue.forEach(client => {
        if (client.ticketNumber && client.ticketNumber > maxTicket) {
            maxTicket = client.ticketNumber;
        }
    });
    
    // Actualizar si encontramos un número mayor
    if (maxTicket > lastIssuedTicket) {
        lastIssuedTicket = maxTicket;
        console.log(`📈 Último turno emitido actualizado a: ${lastIssuedTicket}`);
    }
    
    // Actualizar contadores
    storeQueueCount.textContent = inStoreQueue.length;
    onlineQueueCount.textContent = onlineQueue.length;
    
    // Actualizar título de la página
    const totalWaiting = inStoreQueue.length + onlineQueue.length;
    updatePageTitle(totalWaiting);
    
    // Actualizar contador de turnos
    updateTicketCounter();
    
    // Actualizar cola presencial
    if (inStoreQueue.length === 0) {
        storeQueueList.innerHTML = '<p class="empty-message">No hay clientes en tienda esperando</p>';
    } else {
        storeQueueList.innerHTML = '';
        inStoreQueue.forEach((client) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            
            const joinTime = new Date(client.joinedAt);
            const waitTime = Math.floor((new Date() - joinTime) / 1000 / 60);
            
            item.innerHTML = `
                <div class="queue-item-header">
                    <div class="queue-item-number">🏪 #${client.number}</div>
                    <div class="queue-item-time">⏱️ ${waitTime}min</div>
                </div>
                <div class="queue-item-actions">
                    <button class="btn-queue-action btn-accept" onclick="acceptStoreClient('${client.id}')">
                        ✅ Atender
                    </button>
                    <button class="btn-queue-action btn-remove" onclick="removeFromQueue('store', '${client.id}')">
                        ❌ Eliminar
                    </button>
                </div>
            `;
            storeQueueList.appendChild(item);
        });
    }
    
    // Actualizar cola online
    if (onlineQueue.length === 0) {
        onlineQueueList.innerHTML = '<p class="empty-message">No hay clientes online esperando</p>';
    } else {
        onlineQueueList.innerHTML = '';
        onlineQueue.forEach((client, index) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            
            const joinTime = new Date(client.joinedAt);
            const waitTime = Math.floor((new Date() - joinTime) / 1000 / 60);
            const timeStr = joinTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            
            // Mostrar número de turno si está disponible
            const ticketDisplay = client.ticketNumber ? `🎟️ Turno #${client.ticketNumber}` : `Posición ${index + 1}`;
            
            item.innerHTML = `
                <div class="queue-item-header">
                    <div class="queue-item-name">🌐 ${escHtml(client.name)}</div>
                    <div class="queue-item-time">⏱️ ${waitTime}min</div>
                </div>
                <div style="font-size: 0.85em; color: var(--c-amber); font-weight: 600; margin-top: 4px;">${ticketDisplay}</div>
                <div class="queue-item-phone">${client.phone ? '📱 ' + escHtml(client.phone) : '📞 Sin teléfono'}</div>
                <div style="font-size: 0.8em; color: #a0aec0; margin-top: 4px;">Se unió a las ${timeStr}</div>
                <div class="queue-item-actions">
                    <button class="btn-queue-action btn-accept" onclick="acceptOnlineClient('${escHtml(client.id)}')">
                        ✅ Atender
                    </button>
                    <button class="btn-queue-action btn-remove" onclick="removeFromQueue('online', '${escHtml(client.id)}')">
                        ❌ Eliminar
                    </button>
                </div>
            `;
            onlineQueueList.appendChild(item);
        });
    }
    
    // Habilitar/deshabilitar botón de aceptar siguiente
    if (totalWaiting > 0 && liveStatusText.textContent === '🔴 EN VIVO') {
        acceptNextClientBtn.disabled = false;
    } else {
        acceptNextClientBtn.disabled = true;
    }
}

// Actualizar contador de turnos
function updateTicketCounter() {
    // Último turno emitido
    if (lastTicketNumber) {
        lastTicketNumber.textContent = lastIssuedTicket > 0 ? lastIssuedTicket : '-';
    }
    
    // Turno que se está atendiendo ahora
    if (currentServingNumber) {
        currentServingNumber.textContent = currentServingTicket !== null ? currentServingTicket : '-';
    }
    
    // Calcular cuántos turnos están esperando
    const waiting = inStoreQueue.length + onlineQueue.length;
    if (ticketsWaiting) {
        ticketsWaiting.textContent = waiting;
    }
    
    // Habilitar/deshabilitar botón "Siguiente Turno"
    if (nextTicketBtn) {
        nextTicketBtn.disabled = currentServingTicket === null;
        if (currentServingTicket === null) {
            nextTicketBtn.style.opacity = '0.5';
            nextTicketBtn.style.cursor = 'not-allowed';
        } else {
            nextTicketBtn.style.opacity = '1';
            nextTicketBtn.style.cursor = 'pointer';
        }
    }
    
    console.log(`🎟️ Turnos - Último emitido: ${lastIssuedTicket}, Atendiendo: ${currentServingTicket || 'ninguno'}, En espera: ${waiting}`);
}

function acceptStoreClient(clientId) {
    console.log('🏪 Aceptando cliente presencial:', clientId);
    socket.emit('accept-store-client', { clientId });
}

function acceptOnlineClient(clientId) {
    console.log('🌐 Aceptando cliente online:', clientId);
    socket.emit('accept-online-client', { clientId });
}

async function removeFromQueue(queueType, clientId) {
    if (await showConfirmModal('¿Seguro que quieres eliminar este cliente de la cola?', '\u26a0️ Eliminar Cliente')) {
        console.log(`Eliminando cliente ${clientId} de cola ${queueType}`);
        socket.emit('remove-from-queue', { queueType, clientId });
    }
}

// DEPRECATED: Mantener por compatibilidad
function updateQueue(queue) {
    console.warn('⚠️ updateQueue() es obsoleto. Usa updateQueues() en su lugar.');
    updateQueues([], queue);
}

function addOrderToList(order) {
    const currentCount = parseInt(ordersCount.textContent);
    ordersCount.textContent = currentCount + 1;
    
    if (ordersList.querySelector('.empty-message')) {
        ordersList.innerHTML = '';
    }
    
    const item = document.createElement('div');
    item.className = 'order-item';
    
    const orderTime = new Date(order.timestamp);
    const timeStr = orderTime.toLocaleTimeString('es-ES');
    
    item.innerHTML = `
        <h4>Pedido #${escHtml(order.id.substr(0, 8))}</h4>
        <p><strong>${escHtml(order.clientName)}</strong></p>
        <p>${order.items.length} artículo(s) - Total: ${Number(order.total).toFixed(2)}€</p>
        <p>📍 ${escHtml(order.shippingAddress)}</p>
        <p style="font-size: 0.8em; color: #a0aec0;">${timeStr}</p>
    `;
    
    ordersList.insertBefore(item, ordersList.firstChild);
}

// Funciones de notificación para nuevos clientes
function playNotificationSound() {
    // Crear un sonido de notificación usando Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Crear oscilador para el primer tono
    const oscillator1 = audioContext.createOscillator();
    const gainNode1 = audioContext.createGain();
    
    oscillator1.connect(gainNode1);
    gainNode1.connect(audioContext.destination);
    
    oscillator1.frequency.value = 800; // Frecuencia del sonido
    oscillator1.type = 'sine';
    
    gainNode1.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator1.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.3);
    
    // Segundo tono
    setTimeout(() => {
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        
        oscillator2.frequency.value = 1000;
        oscillator2.type = 'sine';
        
        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator2.start(audioContext.currentTime);
        oscillator2.stop(audioContext.currentTime + 0.3);
    }, 200);
}

function showNotification(message, type = 'info') {
    // Configuración según el tipo
    const config = {
        success: {
            gradient: 'linear-gradient(135deg, #48bb78, #38a169)',
            icon: '✅',
            title: 'Éxito'
        },
        error: {
            gradient: 'linear-gradient(135deg, #f56565, #e53e3e)',
            icon: '❌',
            title: 'Error'
        },
        info: {
            gradient: 'linear-gradient(135deg, #667eea, #764ba2)',
            icon: '🔔',
            title: 'Nuevo Cliente en Espera'
        }
    };
    
    const notifConfig = config[type] || config.info;
    
    // Verificar si el navegador soporta notificaciones
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`FrescosEnVivo - ${notifConfig.title}`, {
            body: message,
            icon: '🐟',
            badge: notifConfig.icon
        });
    }
    
    // Notificación visual en la página
    const notification = document.createElement('div');
    notification.className = 'vendor-notification';
    notification.innerHTML = `
        <div style="background: ${notifConfig.gradient}; 
                    color: white; 
                    padding: 20px; 
                    border-radius: 12px; 
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    min-width: 300px;
                    animation: slideIn 0.3s ease-out;">
            <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 10px;">
                ${notifConfig.icon} ${notifConfig.title}
            </div>
            <div style="font-size: 1em;">
                ${message}
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Eliminar después de 5 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function highlightAcceptButton() {
    // Agregar clase de animación al botón
    acceptNextClientBtn.classList.add('pulse-animation');
    
    // Cambiar estilo temporalmente
    const originalBackground = acceptNextClientBtn.style.background;
    acceptNextClientBtn.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';
    acceptNextClientBtn.style.boxShadow = '0 0 20px rgba(72, 187, 120, 0.6)';
    
    // Quitar después de unos segundos
    setTimeout(() => {
        acceptNextClientBtn.classList.remove('pulse-animation');
        acceptNextClientBtn.style.background = originalBackground;
        acceptNextClientBtn.style.boxShadow = '';
    }, 5000);
}

// Solicitar permiso para notificaciones cuando se carga la página
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Variable para controlar el parpadeo del título
let titleInterval = null;
const originalTitle = 'FrescosEnVivo - Panel del Vendedor';

function updatePageTitle(clientsWaiting) {
    // Limpiar intervalo anterior si existe
    if (titleInterval) {
        clearInterval(titleInterval);
        titleInterval = null;
    }
    
    if (clientsWaiting > 0) {
        // Hacer parpadear el título
        let showAlert = true;
        titleInterval = setInterval(() => {
            document.title = showAlert 
                ? `(${clientsWaiting}) 🔔 CLIENTES ESPERANDO!` 
                : originalTitle;
            showAlert = !showAlert;
        }, 1000);
    } else {
        document.title = originalTitle;
    }
}
