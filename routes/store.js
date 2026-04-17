const express = require('express');
const router = express.Router();
const StoreConfig = require('../models/StoreConfig');
const { auth, isAdmin } = require('../middleware/auth');

// GET - Obtener configuración de la tienda (pública)
router.get('/config', async (req, res) => {
    try {
        // Obtener el cliente desde el middleware de tenant
        if (!req.client) {
            return res.status(400).json({ 
                error: 'tenant_required',
                message: 'Debes especificar un tenant. Usa ?tenant=slug' 
            });
        }

        const clientId = req.client._id || req.client.id;
        if (!clientId) {
            return res.status(400).json({ error: 'Tenant inválido: clientId no disponible' });
        }

        let config = await StoreConfig.findOne({ clientId });
        
        // Si no existe configuración, crear una por defecto
        if (!config) {
            config = new StoreConfig({
                clientId,
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
        const publicConfig = config.getPublicConfig();
        publicConfig.addons = {
            seoPro: Boolean(req.client?.features?.seoPro),
            premiumDesigns: Boolean(req.client?.features?.premiumDesigns),
            reviewsReputation: Boolean(req.client?.features?.reviewsReputation)
        };
        res.json(publicConfig);
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

        const clientId = req.client._id || req.client.id;
        if (!clientId) {
            return res.status(400).json({ error: 'Tenant inválido: clientId no disponible' });
        }

        let config = await StoreConfig.findOne({ clientId });
        
        if (!config) {
            config = new StoreConfig({
                clientId,
                storeName: req.client.businessName
            });
            await config.save();
        }

        const adminConfig = config.toObject();
        adminConfig.storeType = req.client?.storeType || 'pescaderia';
        adminConfig.addons = {
            seoPro: Boolean(req.client?.features?.seoPro),
            premiumDesigns: Boolean(req.client?.features?.premiumDesigns),
            reviewsReputation: Boolean(req.client?.features?.reviewsReputation)
        };
        res.json(adminConfig);
    } catch (error) {
        console.error('Error obteniendo configuración:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// PUT - Actualizar contenido de addons (no habilita addons)
router.put('/config/addons-content', auth, isAdmin, async (req, res) => {
    try {
        const { seo, premiumDesign, reputation } = req.body;

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        if (!config) {
            return res.status(404).json({ success: false, error: 'Configuración no encontrada' });
        }

        if (seo && typeof seo === 'object') {
            if (!config.seo) config.seo = {};
            if (seo.title !== undefined) config.seo.title = String(seo.title || '').trim();
            if (seo.description !== undefined) config.seo.description = String(seo.description || '').trim();
            if (seo.keywords !== undefined) {
                const raw = Array.isArray(seo.keywords)
                    ? seo.keywords
                    : String(seo.keywords || '').split(',');
                config.seo.keywords = raw
                    .map((k) => String(k || '').trim())
                    .filter(Boolean)
                    .slice(0, 20);
            }
        }

        if (premiumDesign && typeof premiumDesign === 'object') {
            if (!config.premiumDesign) config.premiumDesign = {};
            if (premiumDesign.heroBadgeText !== undefined) config.premiumDesign.heroBadgeText = String(premiumDesign.heroBadgeText || '').trim();
            if (premiumDesign.heroCtaText !== undefined) config.premiumDesign.heroCtaText = String(premiumDesign.heroCtaText || '').trim();
        }

        if (reputation && typeof reputation === 'object') {
            if (!config.reputation) config.reputation = {};
            if (reputation.rating !== undefined) {
                const parsed = Number(reputation.rating);
                config.reputation.rating = Number.isFinite(parsed) ? Math.max(0, Math.min(5, parsed)) : 0;
            }
            if (reputation.reviewCount !== undefined) {
                const parsed = Number(reputation.reviewCount);
                config.reputation.reviewCount = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
            }
            if (reputation.featuredReview !== undefined) config.reputation.featuredReview = String(reputation.featuredReview || '').trim();
        }

        await config.save();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error actualizando contenido de addons:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

// PUT - Actualizar configuración básica
router.put('/config/basic', auth, isAdmin, async (req, res) => {
    try {
        const { storeName, tagline, description, logo, favicon, heroImage, typographyPreset, visualStylePreset, legal, cameraTitles, cameraSlotOrder, cameraEnabled, cameraTitleVisibility, cameraProducts, sectionTexts } = req.body;

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        if (storeName) config.storeName = storeName;
        if (tagline) config.tagline = tagline;
        if (description) config.description = description;
        if (logo !== undefined) config.logo = logo;
        if (favicon !== undefined) config.favicon = favicon;
        if (heroImage !== undefined) config.heroImage = heroImage;
        if (typographyPreset !== undefined) {
            const allowedTypography = ['moderna', 'clasica', 'mercado'];
            config.typographyPreset = allowedTypography.includes(typographyPreset) ? typographyPreset : 'moderna';
        }
        if (visualStylePreset !== undefined) {
            const allowedStyles = ['clasico', 'moderno', 'mercado', 'premium'];
            config.visualStylePreset = allowedStyles.includes(visualStylePreset) ? visualStylePreset : 'moderno';
        }
        if (legal && typeof legal === 'object') {
            if (!config.legal) config.legal = {};
            if (legal.footerNotice !== undefined) config.legal.footerNotice = (legal.footerNotice || '').toString().trim();
            if (legal.legalNotice !== undefined) config.legal.legalNotice = (legal.legalNotice || '').toString().trim() || 'Aviso legal';
            if (legal.copyrightText !== undefined) config.legal.copyrightText = (legal.copyrightText || '').toString().trim();
        }
        if (Array.isArray(cameraTitles)) {
            config.cameraTitles = cameraTitles
                .slice(0, 4)
                .map((title) => (title || '').toString().trim())
                .map((title, index) => title || config.cameraTitles?.[index] || `Camara ${index + 1}`);
        }
        if (Array.isArray(cameraSlotOrder)) {
            const normalized = [];
            cameraSlotOrder.slice(0, 4).forEach((value) => {
                const parsed = Number(value);
                if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 && !normalized.includes(parsed)) {
                    normalized.push(parsed);
                }
            });
            [1, 2, 3, 4].forEach((value) => {
                if (!normalized.includes(value)) normalized.push(value);
            });
            config.cameraSlotOrder = normalized.slice(0, 4);
        }
        if (Array.isArray(cameraEnabled)) {
            config.cameraEnabled = cameraEnabled
                .slice(0, 4)
                .map((value, index) => {
                    if (typeof value === 'boolean') return value;
                    if (typeof value === 'string') {
                        const normalized = value.trim().toLowerCase();
                        if (['false', '0', 'off', 'no'].includes(normalized)) return false;
                        if (['true', '1', 'on', 'si'].includes(normalized)) return true;
                    }
                    return config.cameraEnabled?.[index] !== false;
                });
        }
        if (Array.isArray(cameraTitleVisibility)) {
            config.cameraTitleVisibility = cameraTitleVisibility
                .slice(0, 4)
                .map((visible, index) => {
                    if (typeof visible === 'boolean') return visible;
                    if (typeof visible === 'string') {
                        const value = visible.trim().toLowerCase();
                        if (value === 'false' || value === '0' || value === 'off' || value === 'no') return false;
                        if (value === 'true' || value === '1' || value === 'on' || value === 'si') return true;
                    }
                    return config.cameraTitleVisibility?.[index] !== false;
                });
        }
        if (Array.isArray(cameraProducts)) {
            const defaultCameraProducts = [
                { icon: '🐟', name: 'Lubina salvaje', price: '11.90€/kg', promoLabel: '', visible: true },
                { icon: '🦐', name: 'Gamba roja', price: '38€/kg', promoLabel: '', visible: true },
                { icon: '🐙', name: 'Pulpo gallego', price: '12.80€/kg', promoLabel: '', visible: true },
                { icon: '🥫', name: 'Conservas artesanas', price: 'desde 3.50€', promoLabel: '', visible: true }
            ];

            config.cameraProducts = cameraProducts
                .slice(0, 4)
                .map((product, index) => {
                    const current = config.cameraProducts?.[index] || defaultCameraProducts[index];
                    const rawPromoLabel = ((product?.promoLabel ?? current.promoLabel ?? '').toString().trim()).toUpperCase();
                    const promoLabel = rawPromoLabel === 'OFERTA' ? 'OFERTA' : (rawPromoLabel === 'PROMOCION' ? 'PROMOCION' : '');
                    return {
                        icon: ((product?.icon ?? current.icon ?? '').toString().trim() || current.icon),
                        name: ((product?.name ?? current.name ?? '').toString().trim() || current.name),
                        price: ((product?.price ?? current.price ?? '').toString().trim() || current.price),
                        promoLabel,
                        visible: product?.visible !== undefined ? Boolean(product.visible) : (current.visible !== false)
                    };
                });
        }
        if (sectionTexts && typeof sectionTexts === 'object') {
            const ensure = (path, fallbackLabel, fallbackTitle) => {
                if (!config.sectionTexts) config.sectionTexts = {};
                if (!config.sectionTexts[path]) {
                    config.sectionTexts[path] = { label: fallbackLabel, title: fallbackTitle };
                }
            };

            ensure('products', 'Catálogo', 'El género de hoy');
            ensure('schedule', 'Horarios y ubicación', 'Encuéntranos');
            ensure('contact', 'Contacto', 'Habla con nosotros');

            if (sectionTexts.products) {
                if (sectionTexts.products.label !== undefined) {
                    config.sectionTexts.products.label = (sectionTexts.products.label || '').toString().trim() || 'Catálogo';
                }
                if (sectionTexts.products.title !== undefined) {
                    config.sectionTexts.products.title = (sectionTexts.products.title || '').toString().trim() || 'El género de hoy';
                }
            }

            if (sectionTexts.schedule) {
                if (sectionTexts.schedule.label !== undefined) {
                    config.sectionTexts.schedule.label = (sectionTexts.schedule.label || '').toString().trim() || 'Horarios y ubicación';
                }
                if (sectionTexts.schedule.title !== undefined) {
                    config.sectionTexts.schedule.title = (sectionTexts.schedule.title || '').toString().trim() || 'Encuéntranos';
                }
            }

            if (sectionTexts.contact) {
                if (sectionTexts.contact.label !== undefined) {
                    config.sectionTexts.contact.label = (sectionTexts.contact.label || '').toString().trim() || 'Contacto';
                }
                if (sectionTexts.contact.title !== undefined) {
                    config.sectionTexts.contact.title = (sectionTexts.contact.title || '').toString().trim() || 'Habla con nosotros';
                }
            }
        }

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

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
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

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
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
        const { phone, email, address, city, postalCode, country, mapsUrl, contactCards } = req.body;

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        if (phone !== undefined) config.contact.phone = phone;
        if (email !== undefined) config.contact.email = email;
        if (address !== undefined) config.contact.address = address;
        if (city !== undefined) config.contact.city = city;
        if (postalCode !== undefined) config.contact.postalCode = postalCode;
        if (mapsUrl !== undefined) config.contact.mapsUrl = mapsUrl;
        if (country !== undefined) config.contact.country = country;

        if (contactCards && typeof contactCards === 'object') {
            if (!config.contactCards) {
                config.contactCards = {};
            }

            const setCard = (key, fallbackIcon, fallbackHelpText) => {
                const payload = contactCards[key] || {};
                if (!config.contactCards[key]) {
                    config.contactCards[key] = { icon: fallbackIcon, helpText: fallbackHelpText };
                }
                if (payload.icon !== undefined) {
                    config.contactCards[key].icon = (payload.icon || '').toString().trim() || fallbackIcon;
                }
                if (payload.helpText !== undefined) {
                    config.contactCards[key].helpText = (payload.helpText || '').toString().trim() || fallbackHelpText;
                }
            };

            setCard('phone', '📞', 'Disponible en horario de apertura');
            setCard('email', '✉️', 'Respondemos en menos de 24h');
            setCard('whatsapp', '💬', 'La forma más rápida de hacer un encargo');
        }

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

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
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
        const { name, description, price, priceUnit, icon, iconColor, category, badge, badgeType, image, available, order } = req.body;

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        config.products.push({
            name,
            description,
            price,
            priceUnit: priceUnit || '€/kg',
            icon: icon || '🐟',
            iconColor: iconColor || 'pi-blue',
            category,
            badge,
            badgeType: badgeType || 'badge-fresh',
            image,
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
        const { name, description, price, priceUnit, icon, iconColor, category, badge, badgeType, image, available, order } = req.body;

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
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
        if (priceUnit !== undefined) product.priceUnit = priceUnit;
        if (icon !== undefined) product.icon = icon;
        if (iconColor !== undefined) product.iconColor = iconColor;
        if (category !== undefined) product.category = category;
        if (badge !== undefined) product.badge = badge;
        if (badgeType !== undefined) product.badgeType = badgeType;
        if (image !== undefined) product.image = image;
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

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
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

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
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

        let config = await StoreConfig.findOne({ clientId: (req.client._id || req.client.id) });
        
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
