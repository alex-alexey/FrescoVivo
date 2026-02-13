const socket = io();
let localStream = null;
let peerConnection = null;
let clientName = '';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Elementos del DOM
const welcomeScreen = document.getElementById('welcome-screen');
const queueScreen = document.getElementById('queue-screen');
const callScreen = document.getElementById('call-screen');
const endScreen = document.getElementById('end-screen');

const clientNameInput = document.getElementById('client-name');
const joinBtn = document.getElementById('join-btn');
const queuePosition = document.getElementById('queue-position');
const queueLength = document.getElementById('queue-length');

const vendorVideo = document.getElementById('vendor-video');
const productVideo1 = document.getElementById('product-video-1');
const productVideo2 = document.getElementById('product-video-2');
const productVideo3 = document.getElementById('product-video-3');

const toggleAudioBtn = document.getElementById('toggle-audio');
const leaveCallBtn = document.getElementById('leave-call');

// Elementos de estado del vendedor
const vendorStatusIndicator = document.getElementById('vendor-status-indicator');
const heroStatusIndicator = document.getElementById('hero-status-indicator');
const showJoinFormBtn = document.getElementById('show-join-form');
const showJoinFormBtn2 = document.getElementById('show-join-form-2');
const showJoinFormBtn3 = document.getElementById('show-join-form-3');
const joinModal = document.getElementById('join-modal');
const closeModalBtn = document.getElementById('close-modal');

let isVendorLive = false;

// Event Listeners
showJoinFormBtn.addEventListener('click', showJoinModal);
showJoinFormBtn2.addEventListener('click', showJoinModal);
if (showJoinFormBtn3) showJoinFormBtn3.addEventListener('click', showJoinModal);
closeModalBtn.addEventListener('click', closeJoinModal);
joinBtn.addEventListener('click', joinQueue);
toggleAudioBtn.addEventListener('click', toggleAudio);
leaveCallBtn.addEventListener('click', leaveCall);

clientNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinQueue();
});

// Cerrar modal al hacer clic fuera
joinModal.addEventListener('click', (e) => {
    if (e.target === joinModal) closeJoinModal();
});

// Socket event listeners - deben estar antes de emitir eventos
socket.on('connect', () => {
    console.log('✅ Conexión Socket.IO establecida. Socket ID:', socket.id);
    console.log('📡 Solicitando estado del vendedor...');
    socket.emit('check-vendor-status');
});

socket.on('vendor-status-changed', (data) => {
    console.log('🔔 EVENTO RECIBIDO: vendor-status-changed');
    console.log('📊 Datos recibidos:', data);
    console.log('🎬 Estado del vendedor:', data.isLive ? 'EN VIVO ✅' : 'OFFLINE ❌');
    isVendorLive = data.isLive;
    updateVendorStatus();
    console.log('🖼️ Interfaz actualizada');
});

socket.on('vendor-not-live', () => {
    alert('Miguel no está transmitiendo en este momento. Por favor, espera a que inicie la transmisión.');
    closeJoinModal();
});

socket.on('queue-position', (data) => {
    queuePosition.textContent = data.position;
    queueLength.textContent = data.queueLength;
});

socket.on('call-accepted', async () => {
    console.log('✅ ¡Llamada aceptada por el vendedor!');
    queueScreen.style.display = 'none';
    callScreen.style.display = 'block';
    
    // Iniciar el micrófono del cliente
    await startLocalStream();
});

socket.on('call-ended', () => {
    alert('La llamada ha terminado');
    leaveCall();
});

socket.on('vendor-disconnected', () => {
    alert('El vendedor se ha desconectado');
    leaveCall();
});

socket.on('webrtc-offer', async (data) => {
    console.log('📨 Oferta WebRTC recibida del vendedor');
    
    // Crear la conexión si no existe
    if (!peerConnection) {
        await createPeerConnection();
    }
    
    // Establecer la oferta como descripción remota
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    console.log('✅ Oferta establecida como descripción remota');
    
    // Crear y enviar la respuesta
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log('📤 Enviando respuesta al vendedor');
    
    socket.emit('webrtc-answer', {
        to: data.from,
        answer: answer
    });
});

socket.on('webrtc-ice-candidate', async (data) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Funciones
function showJoinModal() {
    if (!isVendorLive) {
        alert('Miguel no está transmitiendo en este momento. Por favor, vuelve más tarde.');
        return;
    }
    joinModal.style.display = 'flex';
}

function closeJoinModal() {
    joinModal.style.display = 'none';
}

function joinQueue() {
    clientName = clientNameInput.value.trim();
    if (!clientName) {
        alert('Por favor ingresa tu nombre');
        return;
    }
    
    socket.emit('client-join', { name: clientName });
    closeJoinModal();
    welcomeScreen.style.display = 'none';
    queueScreen.style.display = 'block';
}

async function startLocalStream() {
    try {
        // Solo capturar AUDIO, no video
        localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
        });
        console.log('✅ Audio capturado correctamente');
    } catch (error) {
        console.error('❌ Error al acceder al micrófono:', error);
        alert('No se pudo acceder a tu micrófono. Verifica los permisos del navegador.');
    }
}

async function createPeerConnection() {
    console.log('🔗 Creando conexión peer-to-peer...');
    peerConnection = new RTCPeerConnection(configuration);
    
    // Agregar tracks locales (solo audio)
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log('📤 Agregando track local:', track.kind);
            peerConnection.addTrack(track, localStream);
        });
    }
    
    // Manejar tracks remotos (video del vendedor y productos)
    peerConnection.ontrack = (event) => {
        console.log('📥 Track remoto recibido:', event.track.kind);
        // Asignar streams a los videos en orden
        if (!vendorVideo.srcObject) {
            vendorVideo.srcObject = event.streams[0];
            console.log('🎥 Video del vendedor asignado');
        } else if (!productVideo1.srcObject) {
            productVideo1.srcObject = event.streams[0];
            console.log('🐟 Producto 1 asignado');
        } else if (!productVideo2.srcObject) {
            productVideo2.srcObject = event.streams[0];
            console.log('🐟 Producto 2 asignado');
        } else if (!productVideo3.srcObject) {
            productVideo3.srcObject = event.streams[0];
            console.log('🐟 Producto 3 asignado');
        }
    };
    
    // Manejar candidatos ICE
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
                to: 'vendor',
                candidate: event.candidate
            });
        }
    };
}

function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const button = toggleAudioBtn.querySelector('span:last-child');
            if (button) {
                button.textContent = audioTrack.enabled ? 'Silenciar' : 'Activar';
            }
            console.log('🎤 Audio', audioTrack.enabled ? 'activado' : 'silenciado');
        }
    }
}

function leaveCall() {
    console.log('👋 Finalizando llamada...');
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    callScreen.style.display = 'none';
    endScreen.style.display = 'block';
}

function updateVendorStatus() {
    if (!vendorStatusIndicator || !showJoinFormBtn || !showJoinFormBtn2) {
        console.error('❌ Elementos del DOM no encontrados');
        return;
    }
    
    const statusDot = vendorStatusIndicator.querySelector('.status-dot');
    const statusText = vendorStatusIndicator.querySelector('.status-text');
    
    if (!statusDot || !statusText) {
        console.error('❌ Elementos de estado no encontrados');
        return;
    }
    
    console.log('🔄 Actualizando estado del vendedor a:', isVendorLive);
    
    if (isVendorLive) {
        // Indicador del CTA
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        statusText.textContent = '🔴 Miguel está EN VIVO';
        
        // Indicador del Hero
        if (heroStatusIndicator) {
            heroStatusIndicator.classList.remove('offline');
            heroStatusIndicator.classList.add('online');
            const heroText = heroStatusIndicator.querySelector('span:last-child');
            if (heroText) {
                heroText.textContent = '🔴 Miguel está disponible ahora';
            }
        }
        
        // Habilitar todos los botones
        showJoinFormBtn.disabled = false;
        showJoinFormBtn2.disabled = false;
        if (showJoinFormBtn3) showJoinFormBtn3.disabled = false;
    } else {
        // Indicador del CTA
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
        statusText.textContent = 'Miguel no está transmitiendo';
        
        // Indicador del Hero
        if (heroStatusIndicator) {
            heroStatusIndicator.classList.remove('online');
            heroStatusIndicator.classList.add('offline');
            const heroText = heroStatusIndicator.querySelector('span:last-child');
            if (heroText) {
                heroText.textContent = 'Miguel no está disponible';
            }
        }
        
        // Deshabilitar todos los botones
        showJoinFormBtn.disabled = true;
        showJoinFormBtn2.disabled = true;
        if (showJoinFormBtn3) showJoinFormBtn3.disabled = true;
    }
}
