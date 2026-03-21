const express = require('express');
const router = express.Router();
const StoreConfig = require('../models/StoreConfig');
const { auth, isAdmin } = require('../middleware/auth');

// GET - Obtener configuración de la tienda (pública)
router.get('/config', async (req, res) => {
    try {
        // Obtener el cliente desde el middleware de tenant
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        // Si no existe configuración, crear una por defecto
        if (!config) {
            config = new StoreConfig({
                clientId: req.client._id,
                storeName: req.client.businessName,
                tagline: 'Productos frescos de calidad',
                description: 'Bienvenido a nuestra tienda',
                schedule: {
                    monday: { open: '09:00', close: '20:00', closed: false },
                    tuesday: { open: '09:00', close: '20:00', closed: false },
                    wednesday: { open: '09:00', close: '20:00', closed: false },
                    thursday: { open: '09:00', close: '20:00', closed: false },
                    friday: { open: '09:00', close: '20:00', closed: false },
                    saturday: { open: '09:00', close: '14:00', closed: false },
                    sunday: { open: '', close: '', closed: true }
                }
            });
            await config.save();
        }

        // Devolver solo la configuración pública
        res.json(config.getPublicConfig());
    } catch (error) {
        console.error('Error obteniendo configuración:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET - Obtener configuración completa (admin)
router.get('/config/admin', auth, isAdmin, async (req, res) => {
    try {
        if (!req.client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            config = new StoreConfig({
                clientId: req.client._id,
                storeName: req.client.businessName
            });
            await config.save();
        }

        res.json(config);
    } catch (error) {
        console.error('Error obteniendo configuración:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar configuración básica
router.put('/config/basic', auth, isAdmin, async (req, res) => {
    try {
        const { storeName, tagline, description, logo, heroImage } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        if (storeName) config.storeName = storeName;
        if (tagline) config.tagline = tagline;
        if (description) config.description = description;
        if (logo !== undefined) config.logo = logo;
        if (heroImage !== undefined) config.heroImage = heroImage;

        await config.save();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando configuración:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar colores
router.put('/config/colors', auth, isAdmin, async (req, res) => {
    try {
        const { primary, secondary, accent } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        if (primary) config.colors.primary = primary;
        if (secondary) config.colors.secondary = secondary;
        if (accent) config.colors.accent = accent;

        await config.save();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando colores:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar horarios
router.put('/config/schedule', auth, isAdmin, async (req, res) => {
    try {
        const { schedule } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        config.schedule = schedule;
        await config.save();
        
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando horarios:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar contacto
router.put('/config/contact', auth, isAdmin, async (req, res) => {
    try {
        const { phone, email, address, city, postalCode, country } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        if (phone !== undefined) config.contact.phone = phone;
        if (email !== undefined) config.contact.email = email;
        if (address !== undefined) config.contact.address = address;
        if (city !== undefined) config.contact.city = city;
        if (postalCode !== undefined) config.contact.postalCode = postalCode;
        if (country !== undefined) config.contact.country = country;

        await config.save();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando contacto:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar redes sociales
router.put('/config/social', auth, isAdmin, async (req, res) => {
    try {
        const { facebook, instagram, twitter, whatsapp } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        if (facebook !== undefined) config.social.facebook = facebook;
        if (instagram !== undefined) config.social.instagram = instagram;
        if (twitter !== undefined) config.social.twitter = twitter;
        if (whatsapp !== undefined) config.social.whatsapp = whatsapp;

        await config.save();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando redes sociales:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST - Agregar producto
router.post('/products', auth, isAdmin, async (req, res) => {
    try {
        const { name, description, price, image, category, available, order } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        config.products.push({
            name,
            description,
            price,
            image,
            category,
            available: available !== undefined ? available : true,
            order: order || config.products.length
        });

        await config.save();
        res.json({ success: true, product: config.products[config.products.length - 1] });
    } catch (error) {
        console.error('Error agregando producto:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar producto
router.put('/products/:productId', auth, isAdmin, async (req, res) => {
    try {
        const { productId } = req.params;
        const { name, description, price, image, category, available, order } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        const product = config.products.id(productId);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        if (name) product.name = name;
        if (description !== undefined) product.description = description;
        if (price !== undefined) product.price = price;
        if (image !== undefined) product.image = image;
        if (category !== undefined) product.category = category;
        if (available !== undefined) product.available = available;
        if (order !== undefined) product.order = order;

        await config.save();
        res.json({ success: true, product });
    } catch (error) {
        console.error('Error actualizando producto:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// DELETE - Eliminar producto
router.delete('/products/:productId', auth, isAdmin, async (req, res) => {
    try {
        const { productId } = req.params;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        config.products.id(productId).remove();
        await config.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando producto:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar características/features
router.put('/config/features', auth, isAdmin, async (req, res) => {
    try {
        const { features } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        config.features = { ...config.features, ...features };
        await config.save();
        
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando características:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar CSS personalizado
router.put('/config/custom-css', auth, isAdmin, async (req, res) => {
    try {
        const { customCSS } = req.body;

        let config = await StoreConfig.findOne({ clientId: req.client._id });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        config.customCSS = customCSS || '';
        await config.save();
        
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando CSS:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
