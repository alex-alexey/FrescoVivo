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

// Event Listeners - Solo si los elementos existen
if (showJoinFormBtn) showJoinFormBtn.addEventListener('click', showJoinModal);
if (showJoinFormBtn2) showJoinFormBtn2.addEventListener('click', showJoinModal);
if (showJoinFormBtn3) showJoinFormBtn3.addEventListener('click', showJoinModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', closeJoinModal);
if (joinBtn) joinBtn.addEventListener('click', joinQueue);
if (toggleAudioBtn) toggleAudioBtn.addEventListener('click', toggleAudio);
if (leaveCallBtn) leaveCallBtn.addEventListener('click', leaveCall);

// Event listener para el campo de nombre (puede ser del modal o de otra pantalla)
const modalNameInput = document.getElementById('m-name');
if (modalNameInput) {
    modalNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinQueue();
    });
}

if (clientNameInput) {
    clientNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinQueue();
    });
}

// Cerrar modal al hacer clic fuera
if (joinModal) {
    joinModal.addEventListener('click', (e) => {
        if (e.target === joinModal) closeJoinModal();
    });
}

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
    
    // Si el vendedor está en vivo, solicitar stream público
    if (data.isLive) {
        requestPublicStream();
    } else {
        // Si el vendedor se desconecta, limpiar streams públicos
        stopPublicStream();
    }
});

socket.on('vendor-not-live', () => {
    alert('Miguel no está transmitiendo en este momento. Por favor, espera a que inicie la transmisión.');
    closeJoinModal();
});

socket.on('queue-position', (data) => {
    console.log('📊 Actualización de posición en cola:', data);
    
    // Actualizar número de turno en el modal nuevo
    const qNum = document.getElementById('qNum');
    if (qNum) {
        // Mostrar el número de turno si existe, si no, mostrar la posición
        if (data.ticketNumber) {
            qNum.textContent = data.ticketNumber;
        } else {
            qNum.textContent = data.position;
        }
    }
    
    // Actualizar etiqueta para mostrar "Tu turno" en lugar de "Tu posición"
    const qLbl = document.querySelector('.q-lbl');
    if (qLbl && data.ticketNumber) {
        qLbl.textContent = `Tu turno #${data.ticketNumber} · Posición en cola: ${data.position}`;
    }
    
    // Actualizar posición en la pantalla de cola antigua (si existe)
    if (queuePosition) {
        queuePosition.textContent = data.position;
    }
    
    // Mostrar información detallada de ambas colas
    if (data.onlineQueueLength !== undefined && queueLength) {
        queueLength.textContent = `${data.onlineQueueLength} online`;
        
        // Agregar información adicional
        const queueInfo = document.getElementById('queue-extra-info');
        if (queueInfo) {
            queueInfo.innerHTML = `
                <p style="margin-top: 10px; color: #718096; font-size: 0.9em;">
                    🏪 Clientes en tienda: ${data.inStoreQueueLength}<br>
                    🌐 Clientes online: ${data.onlineQueueLength}<br>
                    📊 Total esperando: ${data.totalWaiting}
                </p>
                <p style="margin-top: 10px; padding: 10px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 0.85em;">
                    ⚠️ Los clientes en tienda tienen prioridad
                </p>
            `;
        }
    } else if (queueLength) {
        // Compatibilidad con versión anterior solo si el elemento existe
        queueLength.textContent = data.queueLength || 0;
    }
});
socket.on('call-accepted', async () => {
    console.log('✅ ¡Llamada aceptada por el vendedor!');
    
    // Ocultar pantallas antiguas si existen
    if (queueScreen) queueScreen.style.display = 'none';
    if (callScreen) callScreen.style.display = 'block';
    
    // Transición en el modal nuevo
    const qState = document.getElementById('qState');
    const callState = document.getElementById('callState');
    
    if (qState && callState) {
        qState.classList.remove('show');
        qState.style.display = 'none';
        callState.style.display = 'block';
        callState.classList.add('show');
    }
    
    // Iniciar el micrófono del cliente
    await startLocalStream();
    
    console.log('🎤 Esperando oferta WebRTC del vendedor...');
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
    if (joinModal) {
        joinModal.style.display = 'flex';
    } else {
        console.error('❌ No se encontró el modal de unirse');
    }
}

function closeJoinModal() {
    if (joinModal) joinModal.style.display = 'none';
}

function joinQueue() {
    // Buscar el input correcto (puede ser 'm-name' del modal o 'client-name' de otra pantalla)
    const nameInput = document.getElementById('m-name') || document.getElementById('client-name');
    const phoneInput = document.getElementById('m-phone');
    
    if (!nameInput) {
        console.error('❌ No se encontró el campo de nombre');
        alert('Error: No se pudo encontrar el formulario');
        return;
    }
    
    clientName = nameInput.value.trim();
    const clientPhone = phoneInput ? phoneInput.value.trim() : '';
    
    if (!clientName) {
        // Agregar clase de error si el input existe
        if (nameInput.classList) nameInput.classList.add('err');
        if (nameInput.focus) nameInput.focus();
        return;
    }
    
    // Remover clase de error
    if (nameInput.classList) nameInput.classList.remove('err');
    
    console.log('📤 Uniéndose a la cola online:', clientName);
    
    // Usar nuevo evento para cola ONLINE
    socket.emit('client-join-online', { 
        name: clientName,
        phone: clientPhone
    });
    
    // Cambiar estado del modal si existe
    const formState = document.getElementById('formState');
    const qState = document.getElementById('qState');
    
    if (formState && qState) {
        formState.classList.add('hide');
        qState.classList.add('show');
        
        // Actualizar número de posición (se actualizará con el evento real del servidor)
        const qNum = document.getElementById('qNum');
        if (qNum) qNum.textContent = '...';
    }
    
    // Cerrar modal antiguo si existe
    closeJoinModal();
    
    // Solo ocultar estas pantallas si existen
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (queueScreen) queueScreen.style.display = 'block';
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
            const toggleBtn = document.getElementById('toggle-audio');
            if (toggleBtn) {
                toggleBtn.textContent = audioTrack.enabled ? '🎤 Silenciar' : '🔇 Activar Audio';
            }
            console.log('🎤 Audio', audioTrack.enabled ? 'activado' : 'silenciado');
        }
    }
}

function leaveCall() {
    console.log('👋 Finalizando llamada...');
    
    // Emitir evento al servidor
    socket.emit('client-leave-call');
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Limpiar videos
    const vendorVideo = document.getElementById('vendor-video');
    const productVideos = [
        document.getElementById('product-video-1'),
        document.getElementById('product-video-2'),
        document.getElementById('product-video-3')
    ];
    
    if (vendorVideo) vendorVideo.srcObject = null;
    productVideos.forEach(video => {
        if (video) video.srcObject = null;
    });
    
    // Cerrar modal y resetear estados
    const modalBg = document.getElementById('modalBg');
    const callState = document.getElementById('callState');
    const formState = document.getElementById('formState');
    
    if (callState) {
        callState.classList.remove('show');
        callState.style.display = 'none';
    }
    
    if (modalBg) {
        modalBg.classList.remove('open');
    }
    
    // Resetear formulario
    if (formState) {
        formState.classList.remove('hide');
        const nameInput = document.getElementById('m-name');
        const phoneInput = document.getElementById('m-phone');
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
    }
    
    // Ocultar pantallas antiguas si existen
    if (callScreen) callScreen.style.display = 'none';
    if (endScreen) endScreen.style.display = 'block';
    
    console.log('✅ Llamada finalizada y limpiada');
}

function updateVendorStatus() {
    console.log('🔄 Actualizando estado del vendedor a:', isVendorLive);
    
    // Actualizar badges de las cámaras en la nueva sección (página principal)
    const liveBadges = document.querySelectorAll('.live-badge');
    
    if (isVendorLive) {
        // Actualizar badges de cámaras a LIVE
        liveBadges.forEach(badge => {
            badge.classList.remove('offline');
            badge.classList.add('live');
            const badgeText = badge.querySelector('span:last-child');
            if (badgeText) {
                badgeText.textContent = 'EN VIVO';
            }
        });
        
        // Indicador del CTA (si existe)
        if (vendorStatusIndicator) {
            const statusDot = vendorStatusIndicator.querySelector('.status-dot');
            const statusText = vendorStatusIndicator.querySelector('.status-text');
            
            if (statusDot) {
                statusDot.classList.remove('offline');
                statusDot.classList.add('online');
            }
            if (statusText) {
                statusText.textContent = '🔴 Miguel está EN VIVO';
            }
        }
        
        // Indicador del Hero (si existe)
        if (heroStatusIndicator) {
            heroStatusIndicator.classList.remove('offline');
            heroStatusIndicator.classList.add('online');
            const heroText = heroStatusIndicator.querySelector('span:last-child');
            if (heroText) {
                heroText.textContent = '🔴 Miguel está disponible ahora';
            }
        }
        
        // Habilitar todos los botones (si existen)
        if (showJoinFormBtn) showJoinFormBtn.disabled = false;
        if (showJoinFormBtn2) showJoinFormBtn2.disabled = false;
        if (showJoinFormBtn3) showJoinFormBtn3.disabled = false;
    } else {
        // Actualizar badges de cámaras a OFFLINE
        liveBadges.forEach(badge => {
            badge.classList.remove('live');
            badge.classList.add('offline');
            const badgeText = badge.querySelector('span:last-child');
            if (badgeText) {
                badgeText.textContent = 'Offline';
            }
        });
        
        // Indicador del CTA (si existe)
        if (vendorStatusIndicator) {
            const statusDot = vendorStatusIndicator.querySelector('.status-dot');
            const statusText = vendorStatusIndicator.querySelector('.status-text');
            
            if (statusDot) {
                statusDot.classList.remove('online');
                statusDot.classList.add('offline');
            }
            if (statusText) {
                statusText.textContent = 'Miguel no está transmitiendo';
            }
        }
        
        // Indicador del Hero (si existe)
        if (heroStatusIndicator) {
            heroStatusIndicator.classList.remove('online');
            heroStatusIndicator.classList.add('offline');
            const heroText = heroStatusIndicator.querySelector('span:last-child');
            if (heroText) {
                heroText.textContent = 'Miguel no está disponible';
            }
        }
        
        // Deshabilitar todos los botones (si existen)
        if (showJoinFormBtn) showJoinFormBtn.disabled = true;
        if (showJoinFormBtn2) showJoinFormBtn2.disabled = true;
        if (showJoinFormBtn3) showJoinFormBtn3.disabled = true;
    }
}

// ========== PUBLIC STREAM (Vista previa de cámaras) ==========
let publicPeerConnection = null;
let receivedStreams = [];

function requestPublicStream() {
    console.log('📹 Solicitando stream público...');
    console.log('📹 isVendorLive:', isVendorLive);
    console.log('📹 publicPeerConnection actual:', publicPeerConnection);
    console.log('📹 Socket conectado:', socket.connected);
    console.log('📹 Socket ID:', socket.id);
    
    if (!isVendorLive) {
        console.log('⚠️ Vendedor no está en vivo');
        return;
    }
    
    if (publicPeerConnection) {
        console.log('⚠️ Ya existe una conexión de stream público, cerrando...');
        stopPublicStream();
    }
    
    console.log('📤 Emitiendo request-public-stream al servidor...');
    socket.emit('request-public-stream');
    console.log('✅ Evento request-public-stream emitido');
}

// Recibir offer del vendedor para stream público
socket.on('public-stream-offer', async (data) => {
    console.log('📥 Offer de stream público recibido');
    
    try {
        publicPeerConnection = new RTCPeerConnection(configuration);
        let trackCounter = 0;
        
        // Recibir tracks remotos (las 4 cámaras)
        publicPeerConnection.ontrack = (event) => {
            console.log('📥 Track de stream público recibido:', event.track.kind, 'Stream ID:', event.streams[0].id);
            
            // Solo procesar tracks de video
            if (event.track.kind !== 'video') {
                console.log('⚠️ Track de audio ignorado para visualización pública');
                return;
            }
            
            trackCounter++;
            console.log(`📹 Asignando cámara #${trackCounter}`);
            
            if (trackCounter === 1) {
                // Primera cámara → Cámara principal
                const mainCamera = document.getElementById('mainCamera');
                const mainPlaceholder = document.getElementById('mainPlaceholder');
                if (mainCamera) {
                    mainCamera.srcObject = event.streams[0];
                    mainCamera.style.display = 'block';
                    if (mainPlaceholder) mainPlaceholder.style.display = 'none';
                    console.log('✅ Cámara principal asignada');
                }
            } else if (trackCounter >= 2 && trackCounter <= 4) {
                // Cámaras 2, 3, 4 → Miniaturas
                const thumbIndex = trackCounter - 2; // 0, 1, 2
                const thumbContainers = document.querySelectorAll('.live-side .live-thumb');
                
                if (thumbContainers[thumbIndex]) {
                    const container = thumbContainers[thumbIndex];
                    
                    // Buscar si ya existe un video
                    let video = container.querySelector('.live-thumb-video');
                    
                    if (!video) {
                        // Crear nuevo elemento video
                        video = document.createElement('video');
                        video.className = 'live-thumb-video';
                        video.autoplay = true;
                        video.playsinline = true;
                        video.muted = true;
                        
                        // Insertar antes del placeholder
                        const placeholder = container.querySelector('.live-thumb-placeholder');
                        if (placeholder) {
                            container.insertBefore(video, placeholder);
                        } else {
                            container.appendChild(video);
                        }
                    }
                    
                    // Asignar el stream
                    video.srcObject = event.streams[0];
                    video.style.display = 'block';
                    
                    // Ocultar placeholder
                    const placeholder = container.querySelector('.live-thumb-placeholder');
                    if (placeholder) placeholder.style.display = 'none';
                    
                    console.log(`✅ Cámara ${trackCounter} asignada a miniatura ${thumbIndex + 1}`);
                }
            }
        };
        
        // Manejar ICE candidates
        publicPeerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('public-stream-ice-candidate', {
                    to: 'vendor',
                    candidate: event.candidate
                });
            }
        };
        
        // Establecer offer remoto
        await publicPeerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        // Crear answer
        const answer = await publicPeerConnection.createAnswer();
        await publicPeerConnection.setLocalDescription(answer);
        
        // Enviar answer al vendedor
        socket.emit('public-stream-answer', {
            answer: answer
        });
        
        console.log('✅ Answer de stream público enviado');
        
    } catch (error) {
        console.error('❌ Error estableciendo stream público:', error);
    }
});

// ICE candidate para stream público
socket.on('public-stream-ice-candidate', async (data) => {
    if (publicPeerConnection && data.candidate) {
        await publicPeerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

socket.on('public-stream-unavailable', () => {
    console.log('⚠️ Stream público no disponible');
});

function stopPublicStream() {
    console.log('🛑 Deteniendo stream público');
    
    if (publicPeerConnection) {
        publicPeerConnection.close();
        publicPeerConnection = null;
    }
    
    receivedStreams = [];
    
    // Ocultar videos y mostrar placeholders
    const mainCamera = document.getElementById('mainCamera');
    const mainPlaceholder = document.getElementById('mainPlaceholder');
    
    if (mainCamera) {
        mainCamera.srcObject = null;
        mainCamera.style.display = 'none';
    }
    if (mainPlaceholder) {
        mainPlaceholder.style.display = 'flex';
    }
    
    // Limpiar miniaturas
    document.querySelectorAll('.live-thumb video').forEach(video => {
        video.srcObject = null;
        video.remove();
    });
    
    document.querySelectorAll('.live-thumb-placeholder').forEach(placeholder => {
        placeholder.style.display = 'flex';
    });
}
