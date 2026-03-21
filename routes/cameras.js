const express = require('express');
const router = express.Router();
const Camera = require('../models/Camera');
const { auth, isAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET - Obtener todas las cámaras del cliente (admin)
router.get('/cameras', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const cameras = await Camera.getClientCameras(req.client._id);
        res.json({ success: true, cameras });
    } catch (error) {
        console.error('Error obteniendo cámaras:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET - Obtener cámaras activas (público)
router.get('/cameras/active', async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const cameras = await Camera.find({ 
            clientId: req.client._id, 
            isActive: true,
            'settings.showInStore': true
        }).sort({ position: 1 });
        
        res.json({ success: true, cameras });
    } catch (error) {
        console.error('Error obteniendo cámaras activas:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET - Obtener cámaras en vivo (público)
router.get('/cameras/live', async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const cameras = await Camera.find({ 
            clientId: req.client._id, 
            isActive: true,
            isLive: true 
        }).sort({ position: 1 });
        
        res.json({ success: true, cameras });
    } catch (error) {
        console.error('Error obteniendo cámaras en vivo:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST - Crear nueva cámara
router.post('/cameras', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const { name, description, position, type } = req.body;

        // Verificar que no exista otra cámara en esa posición
        const existingCamera = await Camera.findOne({ 
            clientId: req.client._id, 
            position 
        });

        if (existingCamera) {
            return res.status(400).json({ 
                error: `Ya existe una cámara en la posición ${position}` 
            });
        }

        const camera = new Camera({
            clientId: req.client._id,
            name: name || `Cámara ${position}`,
            description: description || '',
            position: position || 1,
            type: type || 'webcam',
            cameraId: `cam_${req.client._id}_${uuidv4()}`
        });

        await camera.save();
        res.json({ success: true, camera });
    } catch (error) {
        console.error('Error creando cámara:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar cámara
router.put('/cameras/:id', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOne({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        const { name, description, position, type, isActive } = req.body;

        if (name) camera.name = name;
        if (description !== undefined) camera.description = description;
        if (type) camera.type = type;
        if (isActive !== undefined) camera.isActive = isActive;
        
        // Si se cambia la posición, verificar que no exista otra cámara
        if (position && position !== camera.position) {
            const existingCamera = await Camera.findOne({ 
                clientId: req.client._id, 
                position,
                _id: { $ne: camera._id }
            });

            if (existingCamera) {
                return res.status(400).json({ 
                    error: `Ya existe una cámara en la posición ${position}` 
                });
            }
            
            camera.position = position;
        }

        await camera.save();
        res.json({ success: true, camera });
    } catch (error) {
        console.error('Error actualizando cámara:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar configuración de streaming
router.put('/cameras/:id/stream-config', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOne({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        const { resolution, fps, bitrate } = req.body;

        if (resolution) camera.streamConfig.resolution = resolution;
        if (fps) camera.streamConfig.fps = fps;
        if (bitrate) camera.streamConfig.bitrate = bitrate;

        await camera.save();
        res.json({ success: true, camera });
    } catch (error) {
        console.error('Error actualizando configuración:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar configuración avanzada
router.put('/cameras/:id/settings', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOne({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        const { showInStore, showInVendor, autoStart, enableAudio } = req.body;

        if (showInStore !== undefined) camera.settings.showInStore = showInStore;
        if (showInVendor !== undefined) camera.settings.showInVendor = showInVendor;
        if (autoStart !== undefined) camera.settings.autoStart = autoStart;
        if (enableAudio !== undefined) camera.settings.enableAudio = enableAudio;

        await camera.save();
        res.json({ success: true, camera });
    } catch (error) {
        console.error('Error actualizando configuración:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST - Iniciar streaming de cámara
router.post('/cameras/:id/start', auth, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOne({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        if (!camera.isActive) {
            return res.status(400).json({ error: 'La cámara está desactivada' });
        }

        await camera.startStream();
        
        res.json({ success: true, camera });
    } catch (error) {
        console.error('Error iniciando stream:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST - Detener streaming de cámara
router.post('/cameras/:id/stop', auth, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOne({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        await camera.stopStream();
        
        res.json({ success: true, camera });
    } catch (error) {
        console.error('Error deteniendo stream:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// DELETE - Eliminar cámara
router.delete('/cameras/:id', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOneAndDelete({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        res.json({ success: true, message: 'Cámara eliminada' });
    } catch (error) {
        console.error('Error eliminando cámara:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET - Obtener estadísticas de una cámara
router.get('/cameras/:id/stats', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOne({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        res.json({ 
            success: true, 
            stats: {
                ...camera.stats,
                isLive: camera.isLive,
                position: camera.position,
                name: camera.name
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST - Incrementar contador de vistas
router.post('/cameras/:id/view', async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const camera = await Camera.findOne({ 
            _id: req.params.id, 
            clientId: req.client._id 
        });

        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        await camera.incrementViews();
        res.json({ success: true });
    } catch (error) {
        console.error('Error incrementando vistas:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
