const socket = io();
let vendorStream = null;
let productStreams = [null, null, null];
let peerConnection = null;
let activeClientId = null;
let clientAudioElement = null; // Audio del cliente

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Elementos del DOM
const connectionStatus = document.getElementById('connection-status');
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
const acceptNextClientBtn = document.getElementById('accept-next-client');
const endCurrentCallBtn = document.getElementById('end-current-call');
const toggleVendorAudioBtn = document.getElementById('toggle-vendor-audio');

const goLiveBtn = document.getElementById('go-live-btn');
const stopLiveBtn = document.getElementById('stop-live-btn');
const liveStatus = document.getElementById('live-status');
const liveStatusText = document.getElementById('live-status-text');

const queueCount = document.getElementById('queue-count');
const queueList = document.getElementById('queue-list');
const ordersCount = document.getElementById('orders-count');
const ordersList = document.getElementById('orders-list');

// Formulario de pedidos
const quickOrderForm = document.getElementById('quick-order-form');
const orderProducts = document.getElementById('order-products');
const orderTotal = document.getElementById('order-total');
const orderAddress = document.getElementById('order-address');
const saveOrderBtn = document.getElementById('save-order-btn');

// Event Listeners
startCamerasBtn.addEventListener('click', startAllCameras);
stopCamerasBtn.addEventListener('click', stopAllCameras);
goLiveBtn.addEventListener('click', () => {
    console.log('🔴 BOTÓN GO LIVE CLICKEADO');
    goLive();
});
stopLiveBtn.addEventListener('click', stopLive);
acceptNextClientBtn.addEventListener('click', acceptNextClient);
endCurrentCallBtn.addEventListener('click', endCurrentCall);
toggleVendorAudioBtn.addEventListener('click', toggleVendorAudio);
saveOrderBtn.addEventListener('click', saveOrder);

// Conectar como vendedor
console.log('🔌 Conectando como vendedor...');
console.log('🔌 Socket conectado inicial?:', socket.connected);

socket.on('connect', () => {
    console.log('✅ Socket conectado! ID:', socket.id);
    console.log('📤 Emitiendo vendor-connect...');
    socket.emit('vendor-connect');
});

socket.on('vendor-connected', (data) => {
    console.log('✅ Vendedor confirmado por el servidor');
    console.log('📊 Datos recibidos:', data);
    connectionStatus.textContent = 'Conectado';
    connectionStatus.className = 'status-badge online';
    updateQueue(data.queue);
    if (data.isLive) {
        console.log('⚠️ El servidor indica que ya estás en vivo');
        updateLiveStatus(true);
    }
    
    // TEST: Emitir un evento de prueba
    console.log('🧪 TEST: Emitiendo evento de prueba...');
    socket.emit('test-event', { message: 'Hola desde el vendedor' });
});

socket.on('queue-updated', (queue) => {
    updateQueue(queue);
});

socket.on('new-client-joined', (data) => {
    console.log('🔔 Nuevo cliente en espera:', data.name);
    
    // Reproducir sonido de notificación
    playNotificationSound();
    
    // Mostrar notificación visual
    showNotification(`📞 ${data.name} está esperando en la cola`);
    
    // Hacer parpadear el botón de aceptar
    highlightAcceptButton();
    
    // Cambiar el título de la pestaña
    updatePageTitle(data.queueLength);
});

socket.on('client-accepted', async (client) => {
    console.log('✅ Cliente aceptado:', client.name);
    
    // Resetear título si no hay más clientes esperando
    updatePageTitle(0);
    
    activeClientId = client.id;
    callStatusText.textContent = `En llamada con: ${client.name}`;
    callStatusText.style.background = '#c6f6d5';
    endCurrentCallBtn.disabled = false;
    acceptNextClientBtn.disabled = true;
    
    clientVideoSection.style.display = 'block';
    clientNameLabel.textContent = client.name;
    
    // Mostrar formulario de pedidos
    quickOrderForm.style.display = 'block';
    
    // Iniciar conexión WebRTC y crear oferta
    console.log('🔗 Iniciando conexión WebRTC con el cliente...');
    await startPeerConnection(client.id);
});

socket.on('no-clients', () => {
    alert('No hay clientes en la cola');
});

socket.on('call-ended-confirm', () => {
    resetCallState();
});

socket.on('client-disconnected', () => {
    alert('El cliente se ha desconectado');
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

async function startCamera(deviceId, videoElement) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: deviceId ? { exact: deviceId } : undefined },
            audio: true
        });
        videoElement.srcObject = stream;
        return stream;
    } catch (error) {
        console.error('Error al iniciar cámara:', error);
        alert('No se pudo acceder a la cámara. Verifica los permisos.');
        return null;
    }
}

async function startAllCameras() {
    await populateCameraSelects();
    
    vendorStream = await startCamera(vendorCameraSelect.value, vendorCamera);
    productStreams[0] = await startCamera(productCamera1Select.value, productCamera1);
    productStreams[1] = await startCamera(productCamera2Select.value, productCamera2);
    productStreams[2] = await startCamera(productCamera3Select.value, productCamera3);
    
    if (vendorStream && productStreams.every(s => s !== null)) {
        startCamerasBtn.disabled = true;
        stopCamerasBtn.disabled = false;
        goLiveBtn.disabled = false;
        alert('Todas las cámaras iniciadas correctamente. Ahora puedes iniciar la transmisión.');
    }
}

function goLive() {
    console.log('goLive: Intentando iniciar transmisión...');
    console.log('goLive: Socket conectado?:', socket.connected);
    console.log('goLive: Socket ID:', socket.id);
    
    if (!socket.connected) {
        console.error('❌ Socket NO está conectado!');
        alert('Error: No hay conexión con el servidor. Recarga la página.');
        return;
    }
    
    socket.emit('vendor-go-live');
    console.log('goLive: Evento vendor-go-live emitido');
    updateLiveStatus(true);
    alert('¡Transmisión iniciada! Los clientes pueden unirse ahora.');
}

function stopLive() {
    socket.emit('vendor-stop-live');
    updateLiveStatus(false);
    alert('Transmisión detenida. Los clientes no podrán unirse.');
}

function updateLiveStatus(isLive) {
    const liveDot = liveStatus.querySelector('.live-dot');
    
    if (isLive) {
        liveDot.classList.remove('offline');
        liveDot.classList.add('online');
        liveStatusText.textContent = '🔴 EN VIVO';
        liveStatus.style.background = '#c6f6d5';
        goLiveBtn.style.display = 'none';
        stopLiveBtn.style.display = 'inline-block';
        acceptNextClientBtn.disabled = false;
    } else {
        liveDot.classList.remove('online');
        liveDot.classList.add('offline');
        liveStatusText.textContent = 'FUERA DE LÍNEA';
        liveStatus.style.background = '#fed7d7';
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
    
    startCamerasBtn.disabled = false;
    stopCamerasBtn.disabled = true;
    goLiveBtn.disabled = true;
    
    // Detener transmisión si estaba activa
    if (liveStatusText.textContent === '🔴 EN VIVO') {
        stopLive();
    }
}

async function switchCamera(cameraIndex, deviceId) {
    let stream, videoElement;
    
    switch(cameraIndex) {
        case 0:
            if (vendorStream) vendorStream.getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, vendorCamera);
            vendorStream = stream;
            break;
        case 1:
            if (productStreams[0]) productStreams[0].getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, productCamera1);
            productStreams[0] = stream;
            break;
        case 2:
            if (productStreams[1]) productStreams[1].getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, productCamera2);
            productStreams[1] = stream;
            break;
        case 3:
            if (productStreams[2]) productStreams[2].getTracks().forEach(track => track.stop());
            stream = await startCamera(deviceId, productCamera3);
            productStreams[2] = stream;
            break;
    }
    
    // Si hay una conexión activa, actualizar los tracks
    if (peerConnection && stream) {
        const senders = peerConnection.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
        if (videoSender) {
            videoSender.replaceTrack(videoTrack);
        }
    }
}

function acceptNextClient() {
    socket.emit('accept-next-client');
}

function endCurrentCall() {
    socket.emit('end-call');
    resetCallState();
}

function resetCallState() {
    activeClientId = null;
    callStatusText.textContent = 'Sin llamada activa';
    callStatusText.style.background = '#f7fafc';
    endCurrentCallBtn.disabled = true;
    acceptNextClientBtn.disabled = false;
    clientVideoSection.style.display = 'none';
    
    // Ocultar y limpiar formulario de pedidos
    quickOrderForm.style.display = 'none';
    clearOrderForm();
    
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

function updateQueue(queue) {
    queueCount.textContent = queue.length;
    
    // Actualizar título de la página
    updatePageTitle(queue.length);
    
    if (queue.length === 0) {
        queueList.innerHTML = '<p class="empty-message">No hay clientes en espera</p>';
        return;
    }
    
    queueList.innerHTML = '';
    queue.forEach((client, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        
        const joinTime = new Date(client.joinedAt);
        const waitTime = Math.floor((new Date() - joinTime) / 1000 / 60);
        
        item.innerHTML = `
            <h4>${index + 1}. ${client.name}</h4>
            <p>Esperando: ${waitTime} minutos</p>
        `;
        queueList.appendChild(item);
    });
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
        <h4>Pedido #${order.id.substr(0, 8)}</h4>
        <p><strong>${order.clientName}</strong></p>
        <p>${order.items.length} artículo(s) - Total: ${order.total.toFixed(2)}€</p>
        <p>📍 ${order.shippingAddress}</p>
        <p style="font-size: 0.8em; color: #a0aec0;">${timeStr}</p>
    `;
    
    ordersList.insertBefore(item, ordersList.firstChild);
}

function saveOrder() {
    const products = orderProducts.value.trim();
    const total = parseFloat(orderTotal.value);
    const address = orderAddress.value.trim();
    
    // Validaciones
    if (!products) {
        alert('Por favor, ingresa los productos del pedido');
        return;
    }
    
    if (!total || total <= 0) {
        alert('Por favor, ingresa un total válido');
        return;
    }
    
    if (!address) {
        alert('Por favor, ingresa la dirección de envío');
        return;
    }
    
    if (!activeClientId) {
        alert('No hay un cliente activo en la llamada');
        return;
    }
    
    // Crear estructura del pedido
    const orderData = {
        clientName: clientNameLabel.textContent,
        items: products.split(',').map(p => ({
            name: p.trim(),
            quantity: 1
        })),
        total: total,
        shippingAddress: address
    };
    
    console.log('💾 Guardando pedido:', orderData);
    
    // Enviar al servidor
    socket.emit('create-order', orderData);
    
    // Limpiar formulario
    clearOrderForm();
    
    // Mostrar confirmación
    alert('✅ Pedido guardado correctamente');
}

function clearOrderForm() {
    orderProducts.value = '';
    orderTotal.value = '';
    orderAddress.value = '';
}

// Cargar pedidos existentes al iniciar
fetch('/api/orders')
    .then(res => res.json())
    .then(orders => {
        orders.forEach(order => addOrderToList(order));
    })
    .catch(err => console.error('Error al cargar pedidos:', err));

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

function showNotification(message) {
    // Verificar si el navegador soporta notificaciones
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('LivePescado - Nuevo Cliente', {
            body: message,
            icon: '🐟',
            badge: '🔔'
        });
    }
    
    // Notificación visual en la página
    const notification = document.createElement('div');
    notification.className = 'vendor-notification';
    notification.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
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
                🔔 Nuevo Cliente en Espera
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
const originalTitle = 'LivePescado - Panel del Vendedor';

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
