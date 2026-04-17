const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const emailService = require('../services/emailService');

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

const BILLING_STATUS_VALUES = new Set(['al_dia', 'pendiente', 'vencido', 'pausado']);

function toValidAmount(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    if (num < 0) return 0;
    return Math.round(num * 100) / 100;
}

function toBillingDay(value, fallback = 5) {
    const day = Number(value);
    if (!Number.isInteger(day)) return fallback;
    return Math.min(28, Math.max(1, day));
}

function parseDateValue(value, fallback = null) {
    if (!value) return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getNextBillingDate(day, baseDate = new Date()) {
    const safeDay = toBillingDay(day, 5);
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const candidate = new Date(year, month, safeDay);

    if (candidate > baseDate) {
        return candidate;
    }
    return new Date(year, month + 1, safeDay);
}

function getDefaultBilling(plan) {
    return {
        currency: 'EUR',
        basePlanPrice: PLAN_BASE_PRICES[plan] ?? PLAN_BASE_PRICES.basico,
        addonPrices: { ...DEFAULT_ADDON_PRICES },
        discount: 0,
        billingDayOfMonth: 5,
        nextDueDate: getNextBillingDate(5),
        lastPaidAt: null,
        paymentStatus: 'pendiente'
    };
}

function normalizeBillingInput(input, currentBilling, plan) {
    const base = currentBilling || getDefaultBilling(plan);
    const incoming = input && typeof input === 'object' ? input : {};
    const addonIncoming = incoming.addonPrices && typeof incoming.addonPrices === 'object'
        ? incoming.addonPrices
        : {};

    const billingDayOfMonth = toBillingDay(incoming.billingDayOfMonth, toBillingDay(base.billingDayOfMonth, 5));
    const normalizedStatus = BILLING_STATUS_VALUES.has(incoming.paymentStatus)
        ? incoming.paymentStatus
        : (BILLING_STATUS_VALUES.has(base.paymentStatus) ? base.paymentStatus : 'pendiente');
    const nextDueDate = parseDateValue(incoming.nextDueDate, parseDateValue(base.nextDueDate, getNextBillingDate(billingDayOfMonth)));
    const lastPaidAt = parseDateValue(incoming.lastPaidAt, parseDateValue(base.lastPaidAt, null));

    return {
        currency: String(incoming.currency || base.currency || 'EUR').toUpperCase(),
        basePlanPrice: toValidAmount(incoming.basePlanPrice, toValidAmount(base.basePlanPrice, PLAN_BASE_PRICES[plan] ?? PLAN_BASE_PRICES.basico)),
        addonPrices: {
            seoPro: toValidAmount(addonIncoming.seoPro, toValidAmount(base?.addonPrices?.seoPro, DEFAULT_ADDON_PRICES.seoPro)),
            premiumDesigns: toValidAmount(addonIncoming.premiumDesigns, toValidAmount(base?.addonPrices?.premiumDesigns, DEFAULT_ADDON_PRICES.premiumDesigns)),
            reviewsReputation: toValidAmount(addonIncoming.reviewsReputation, toValidAmount(base?.addonPrices?.reviewsReputation, DEFAULT_ADDON_PRICES.reviewsReputation))
        },
        discount: toValidAmount(incoming.discount, toValidAmount(base.discount, 0)),
        billingDayOfMonth,
        nextDueDate,
        lastPaidAt,
        paymentStatus: normalizedStatus
    };
}

function normalizeBillingInfoInput(input, defaults = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const base = defaults && typeof defaults === 'object' ? defaults : {};

    return {
        legalName: String(source.legalName ?? base.legalName ?? '').trim(),
        taxId: String(source.taxId ?? base.taxId ?? '').trim().toUpperCase(),
        billingEmail: String(source.billingEmail ?? base.billingEmail ?? '').trim().toLowerCase(),
        fiscalAddress: String(source.fiscalAddress ?? base.fiscalAddress ?? '').trim(),
        postalCode: String(source.postalCode ?? base.postalCode ?? '').trim(),
        city: String(source.city ?? base.city ?? '').trim(),
        province: String(source.province ?? base.province ?? '').trim(),
        country: String(source.country ?? base.country ?? 'España').trim() || 'España'
    };
}

function calculateBillingTotals(billing, features) {
    const normalized = normalizeBillingInput(billing, null, 'basico');
    const enabled = features || {};
    const addonsTotal =
        (enabled.seoPro ? normalized.addonPrices.seoPro : 0) +
        (enabled.premiumDesigns ? normalized.addonPrices.premiumDesigns : 0) +
        (enabled.reviewsReputation ? normalized.addonPrices.reviewsReputation : 0);
    const total = Math.max(0, normalized.basePlanPrice + addonsTotal - normalized.discount);
    return {
        currency: normalized.currency,
        basePlanPrice: normalized.basePlanPrice,
        addonsTotal,
        discount: normalized.discount,
        total: Math.round(total * 100) / 100
    };
}

function generateActivationToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function initializeTenantDatabase(clientDbUri) {
    const clientDbConnection = mongoose.createConnection(clientDbUri, {
        serverSelectionTimeoutMS: 10000
    });

    try {
        await clientDbConnection.asPromise();

        await clientDbConnection.createCollection('users');
        await clientDbConnection.createCollection('tickets');
        await clientDbConnection.createCollection('settings');

        const settingsCollection = clientDbConnection.collection('settings');
        const existingInit = await settingsCollection.findOne({ key: 'initialized' });

        if (!existingInit) {
            await settingsCollection.insertOne({
                key: 'initialized',
                value: true,
                createdAt: new Date()
            });
        }
    } finally {
        await clientDbConnection.close();
    }
}

async function cleanupTenantDatabase(clientDbUri, dbName) {
    const cleanupConn = mongoose.createConnection(clientDbUri, {
        serverSelectionTimeoutMS: 10000
    });

    try {
        await cleanupConn.asPromise();
        await cleanupConn.dropDatabase();
        console.log('🧹 Base de datos de tenant revertida:', dbName);
    } catch (cleanupError) {
        console.error('⚠️ No se pudo revertir la BD de tenant:', dbName, cleanupError.message);
    } finally {
        await cleanupConn.close();
    }
}

// Middleware de autenticación de Super Admin
function superAdminAuth(req, res, next) {
    // Verificar que esté autenticado
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'No autenticado', redirectTo: '/superadmin-login.html' });
    }
    
    // Verificar que tenga permisos de Super Admin
    if (!req.session.isSuperAdmin || req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acceso denegado - Se requieren permisos de Super Admin' });
    }
    
    next();
}

/**
 * GET /api/superadmin/clients
 * Listar todos los clientes
 */
router.get('/clients', superAdminAuth, async (req, res) => {
    try {
        const { status, plan, billingStatus, search, page = 1, limit = 20 } = req.query;
        
        let query = { status: { $ne: 'eliminado' } };
        
        // Filtrar por estado
        if (status) {
            query.status = status;
        }
        
        // Filtrar por plan
        if (plan) {
            query.plan = plan;
        }

        // Filtrar por estado de cobro
        if (billingStatus && BILLING_STATUS_VALUES.has(billingStatus)) {
            if (billingStatus === 'vencido') {
                query['billing.paymentStatus'] = { $nin: ['pausado', 'al_dia'] };
                query['billing.nextDueDate'] = { $lt: new Date() };
            } else {
                query['billing.paymentStatus'] = billingStatus;
            }
        }
        
        // Búsqueda
        if (search) {
            const safeSearch = String(search).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { businessName: { $regex: safeSearch, $options: 'i' } },
                { domain: { $regex: safeSearch, $options: 'i' } },
                { 'owner.email': { $regex: safeSearch, $options: 'i' } }
            ];
        }
        
        // Expirar automáticamente clientes en prueba cuyo trial ha vencido
        await Client.updateMany(
            { status: 'prueba', trialEndsAt: { $lt: new Date() } },
            { $set: { status: 'expirado' } }
        );

        const skip = (page - 1) * limit;
        
        const clients = await Client.find(query)
            .select('-owner.password -database.connectionString')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Client.countDocuments(query);
        
        res.json({
            success: true,
            data: clients,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error al listar clientes:', error);
        res.status(500).json({ success: false, message: 'Error al listar clientes', error: error.message });
    }
});

/**
 * GET /api/superadmin/clients/:id
 * Obtener un cliente específico
 */
router.get('/clients/:id', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id)
            .select('-owner.password');
        
        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }
        
        res.json({ success: true, data: client });
    } catch (error) {
        console.error('Error al obtener cliente:', error);
        res.status(500).json({ success: false, message: 'Error al obtener cliente', error: error.message });
    }
});

/**
 * GET /api/superadmin/clients/:id/invoices
 * Obtener historial de facturas de un cliente
 */
router.get('/clients/:id/invoices', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id)
            .select('businessName domain owner.email invoices');

        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }

        const invoices = Array.isArray(client.invoices) ? [...client.invoices] : [];
        invoices.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        res.json({
            success: true,
            data: {
                clientId: client._id,
                businessName: client.businessName,
                domain: client.domain,
                email: client.owner?.email || '',
                invoices
            }
        });
    } catch (error) {
        console.error('Error al obtener historial de facturas:', error);
        res.status(500).json({ success: false, message: 'Error al obtener historial de facturas', error: error.message });
    }
});

/**
 * POST /api/superadmin/clients
 * Crear un nuevo cliente
 */
router.post('/clients', superAdminAuth, async (req, res) => {
    try {
        const {
            businessName,
            domain,
            storeType,
            ownerUsername,
            ownerEmail,
            ownerFullName,
            ownerPhone,
            billingInfo,
            plan,
            limits,
            branding
        } = req.body;

        const normalizedBusinessName = String(businessName || '').trim();
        const normalizedDomain = String(domain || '').trim().toLowerCase();
        const normalizedOwnerUsername = String(ownerUsername || '').trim().toLowerCase();
        const normalizedOwnerEmail = String(ownerEmail || '').trim().toLowerCase();
        const normalizedOwnerFullName = String(ownerFullName || '').trim();
        
        // Validaciones
        if (!normalizedBusinessName || !normalizedDomain || !normalizedOwnerUsername || !normalizedOwnerEmail || !normalizedOwnerFullName) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos'
            });
        }

        // Generar contraseña provisional automática (el propietario la cambiará al activar)
        const tempPassword = crypto.randomBytes(16).toString('hex');

        // Generar token de activación (caduca en 72 horas)
        const activationToken = generateActivationToken();
        const activationTokenExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);

        if (!/^[a-z0-9.-]+$/.test(normalizedDomain)) {
            return res.status(400).json({
                success: false,
                message: 'El dominio contiene caracteres no válidos'
            });
        }
        
        // Verificar que el dominio no exista
        const existingClient = await Client.findOne({ domain: normalizedDomain });
        if (existingClient) {
            return res.status(400).json({
                success: false,
                message: 'El dominio ya está registrado'
            });
        }
        
        // Verificar que el username no exista
        const existingUsername = await Client.findOne({ 'owner.username': normalizedOwnerUsername });
        if (existingUsername) {
            return res.status(400).json({
                success: false,
                message: 'El nombre de usuario ya está en uso'
            });
        }
        
        // Verificar que el email no exista
        const existingEmail = await Client.findOne({ 'owner.email': normalizedOwnerEmail });
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }
        
        // Generar slug
        const slug = normalizedBusinessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        
        // Generar nombre de base de datos único
        const dbName = Client.generateDatabaseName(slug);
        
        // Obtener la URI base de MongoDB desde las variables de entorno
        const mongoBaseUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
        
        // Construir la URI de conexión para la base de datos del cliente
        // Si es MongoDB Atlas, reemplazar el nombre de la base de datos
        let clientDbUri;
        if (mongoBaseUri.includes('mongodb+srv://')) {
            // MongoDB Atlas
            clientDbUri = mongoBaseUri.replace(/\/[^\/]+\?/, `/${dbName}?`);
        } else {
            // MongoDB local
            clientDbUri = `${mongoBaseUri}/${dbName}`;
        }
        
        // Crear el cliente (se guardará solo si la BD tenant se inicializa correctamente)
        const client = new Client({
            businessName: normalizedBusinessName,
            slug,
            domain: normalizedDomain,
            storeType: storeType || 'pescaderia',
            owner: {
                username: normalizedOwnerUsername,
                email: normalizedOwnerEmail,
                password: tempPassword,
                fullName: normalizedOwnerFullName,
                phone: ownerPhone || ''
            },
            database: {
                name: dbName,
                connectionString: clientDbUri
            },
            plan: plan || 'basico',
            billing: getDefaultBilling(plan || 'basico'),
            billingInfo: normalizeBillingInfoInput(billingInfo, {
                legalName: normalizedBusinessName,
                billingEmail: normalizedOwnerEmail
            }),
            limits: limits || {
                maxDailyTickets: 200,
                maxCameras: 4,
                maxKiosks: 2,
                maxVendors: 3,
                storageQuotaMB: 1000
            },
            branding: branding || {},
            status: 'prueba',
            activationToken,
            activationTokenExpires,
            createdBy: req.session.username || 'superadmin'
        });
        
        // Marcar la contraseña como modificada para que el hook pre-save la hashee
        client.markModified('owner.password');
        
        let tenantInitialized = false;
        let clientSaved = false;

        try {
            // 1) Inicializar primero la BD del tenant. Si falla, no se crea el cliente en master.
            await initializeTenantDatabase(clientDbUri);
            tenantInitialized = true;
            console.log('✅ Base de datos del cliente creada:', dbName);

            // 2) Guardar cliente en master solo después de tener tenant listo.
            await client.save();
            clientSaved = true;
        } catch (dbOrSaveError) {
            console.error('❌ Error creando cliente o BD tenant:', dbOrSaveError);

            // Si la BD tenant se creó pero falló el save, revertir BD huérfana (best effort)
            if (tenantInitialized && !clientSaved) {
                await cleanupTenantDatabase(clientDbUri, dbName);
            }

            return res.status(500).json({
                success: false,
                message: 'No se pudo crear el cliente de forma segura (BD tenant no inicializada o error al guardar).',
                error: dbOrSaveError.message
            });
        }
        
        // Retornar el cliente creado (sin la contraseña)
        const clientResponse = client.toObject();
        delete clientResponse.owner.password;
        delete clientResponse.database.connectionString;
        
        // Enviar email de activación (sin contraseña; el cliente establece la suya al activar)
        const port = process.env.PORT || 3000;
        const activationUrl = `http://${client.domain}:${port}/activate-account?token=${activationToken}`;

        emailService.sendActivationEmail(client, activationUrl)
            .then(result => {
                if (result.success) {
                    console.log('✅ Email de activación enviado a:', client.owner.email);
                } else {
                    console.log('⚠️ No se pudo enviar email de activación:', result.error);
                }
            })
            .catch(err => {
                console.error('❌ Error enviando email de activación:', err);
            });
        
        res.status(201).json({
            success: true,
            message: 'Cliente creado exitosamente',
            data: clientResponse
        });
        
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear cliente',
            error: error.message
        });
    }
});

/**
 * PUT /api/superadmin/clients/:id
 * Actualizar un cliente
 */
router.put('/clients/:id', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        
        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }
        
        const {
            businessName,
            domain,
            storeType,
            ownerUsername,
            ownerEmail,
            ownerFullName,
            ownerPhone,
            ownerPassword,
            status,
            plan,
            features,
            billing,
            billingInfo,
            limits,
            branding,
            subscriptionEndDate,
            notes,
            tags
        } = req.body;
        
        // Actualizar campos permitidos
        if (businessName) client.businessName = businessName;
        if (storeType) client.storeType = storeType;
        if (domain && domain !== client.domain) {
            // Verificar que el nuevo dominio no exista
            const existingDomain = await Client.findOne({ domain, _id: { $ne: client._id } });
            if (existingDomain) {
                return res.status(400).json({
                    success: false,
                    message: 'El dominio ya está en uso'
                });
            }
            client.domain = domain;
        }
        
        // Actualizar información del propietario
        if (ownerUsername && ownerUsername !== client.owner.username) {
            // Verificar que el nuevo username no exista
            const existingUsername = await Client.findOne({ 'owner.username': ownerUsername, _id: { $ne: client._id } });
            if (existingUsername) {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre de usuario ya está en uso'
                });
            }
            client.owner.username = ownerUsername;
        }
        
        if (ownerEmail) client.owner.email = ownerEmail;
        if (ownerFullName) client.owner.fullName = ownerFullName;
        if (ownerPhone !== undefined) client.owner.phone = ownerPhone;
        
        // Actualizar contraseña solo si se proporciona
        if (ownerPassword) {
            client.owner.password = ownerPassword;
            client.markModified('owner.password'); // Marcar como modificado para que el hook pre-save funcione
        }
        
        if (status) client.status = status;
        if (plan) client.plan = plan;
        if (features && typeof features === 'object') {
            client.features = {
                seoPro: Boolean(features.seoPro),
                premiumDesigns: Boolean(features.premiumDesigns),
                reviewsReputation: Boolean(features.reviewsReputation)
            };
        }
        if (billing && typeof billing === 'object') {
            client.billing = normalizeBillingInput(billing, client.billing, client.plan || 'basico');
        }
        if (billingInfo && typeof billingInfo === 'object') {
            client.billingInfo = normalizeBillingInfoInput(billingInfo, client.billingInfo);
        }
        if (limits) client.limits = { ...client.limits, ...limits };
        if (branding) client.branding = { ...client.branding, ...branding };
        if (subscriptionEndDate !== undefined) client.subscriptionEndDate = subscriptionEndDate;
        if (notes !== undefined) client.notes = notes;
        if (tags) client.tags = tags;
        
        client.lastModifiedBy = req.session.username || 'superadmin';
        
        await client.save();
        
        const clientResponse = client.toObject();
        delete clientResponse.owner.password;
        delete clientResponse.database.connectionString;
        
        res.json({
            success: true,
            message: 'Cliente actualizado exitosamente',
            data: clientResponse
        });
        
    } catch (error) {
        console.error('❌ Error al actualizar cliente:', error);
        console.error('   Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar cliente',
            error: error.message,
            details: error.stack
        });
    }
});

/**
 * POST /api/superadmin/clients/:id/mark-paid
 * Marcar cliente como pagado y avanzar próximo cobro
 */
router.post('/clients/:id/mark-paid', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);

        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }

        const currentBilling = normalizeBillingInput({}, client.billing, client.plan || 'basico');
        const now = new Date();
        const safeBillingDay = toBillingDay(currentBilling.billingDayOfMonth, 5);
        const nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, safeBillingDay);

        client.billing = {
            ...currentBilling,
            billingDayOfMonth: safeBillingDay,
            lastPaidAt: now,
            nextDueDate,
            paymentStatus: 'al_dia'
        };
        client.lastModifiedBy = req.session.username || 'superadmin';

        await client.save();

        res.json({
            success: true,
            message: 'Cobro registrado correctamente',
            data: {
                clientId: client._id,
                paymentStatus: client.billing.paymentStatus,
                lastPaidAt: client.billing.lastPaidAt,
                nextDueDate: client.billing.nextDueDate
            }
        });
    } catch (error) {
        console.error('Error al marcar cliente como pagado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar el pago',
            error: error.message
        });
    }
});

/**
 * POST /api/superadmin/clients/:id/toggle-active
 * Desactivar o reactivar rápidamente un cliente
 */
router.post('/clients/:id/toggle-active', superAdminAuth, async (req, res) => {
    try {
        const { action } = req.body || {};

        if (!['deactivate', 'activate'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Acción inválida. Usa "deactivate" o "activate".'
            });
        }

        const client = await Client.findById(req.params.id);

        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }

        if (client.status === 'eliminado') {
            return res.status(400).json({ success: false, message: 'No se puede modificar un cliente eliminado' });
        }

        const targetStatus = action === 'deactivate' ? 'suspendido' : 'activo';

        if (client.status === targetStatus) {
            return res.json({
                success: true,
                message: action === 'deactivate' ? 'El cliente ya estaba desactivado' : 'El cliente ya estaba activo',
                data: { clientId: client._id, status: client.status }
            });
        }

        client.status = targetStatus;
        client.lastModifiedBy = req.session.username || 'superadmin';
        await client.save();

        res.json({
            success: true,
            message: action === 'deactivate' ? 'Cliente desactivado correctamente' : 'Cliente activado correctamente',
            data: { clientId: client._id, status: client.status }
        });
    } catch (error) {
        console.error('Error al cambiar estado rápido del cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cambiar el estado del cliente',
            error: error.message
        });
    }
});

/**
 * DELETE /api/superadmin/clients/:id
 * Baja lógica de un cliente (evita pérdida irreversible por error humano)
 */
router.delete('/clients/:id', superAdminAuth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID de cliente inválido' });
        }

        const client = await Client.findById(req.params.id);
        
        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }

        if (client.status === 'eliminado') {
            return res.status(400).json({ success: false, message: 'El cliente ya está eliminado' });
        }

        const remainingClients = await Client.countDocuments({ status: { $ne: 'eliminado' } });
        if (remainingClients <= 1) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar el último cliente activo del sistema.'
            });
        }

        const clientName = client.businessName;
        const clientDbName = client?.database?.name;
        const clientDbUri = client?.database?.connectionString;

        console.log(`🗑️  Iniciando baja lógica del cliente: ${clientName} (BD: ${clientDbName})`);

        // Paso 1: Intentar eliminar la BD del cliente (tenant database)
        let dbDeleted = false;
        if (clientDbUri && clientDbName) {
            try {
                await cleanupTenantDatabase(clientDbUri, clientDbName);
                dbDeleted = true;
                console.log(`✅ Base de datos del cliente eliminada: ${clientDbName}`);
            } catch (dbError) {
                console.error(`⚠️  Error eliminando BD del cliente ${clientDbName}:`, dbError.message);
                // No rechazamos si falla la BD, continuamos con la eliminación del cliente
            }
        } else {
            console.warn(`⚠️  Cliente ${clientName} sin metadatos completos de base de datos. Se omite borrado de BD tenant.`);
        }

        // Paso 2: Baja lógica en master DB
        try {
            client.status = 'eliminado';
            client.lastModifiedBy = req.session.username || 'superadmin';
            await client.save();
            console.log(`✅ Cliente marcado como eliminado en BD master: ${clientName}`);
        } catch (clientError) {
            console.error(`⚠️  Error marcando cliente como eliminado en master DB:`, clientError.message);
            return res.status(500).json({
                success: false,
                message: 'Error al marcar cliente como eliminado',
                error: clientError.message
            });
        }

        res.json({
            success: true,
            message: `Cliente "${clientName}" eliminado${dbDeleted ? ' y su BD fue limpiada' : ' (BD tenant pendiente o no disponible)'}`,
            deleted: {
                client: clientName,
                database: clientDbName || null,
                dbDeleted: dbDeleted
            }
        });

        console.log(`🗑️  Baja lógica completada: ${clientName}`);

    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar cliente',
            error: error.message
        });
    }
});

/**
 * GET /api/superadmin/stats
 * Estadísticas generales del sistema
 */
router.get('/stats', superAdminAuth, async (req, res) => {
    try {
        const totalClients = await Client.countDocuments();
        const activeClients = await Client.countDocuments({ status: 'activo' });
        const trialClients = await Client.countDocuments({ status: 'prueba' });
        const suspendedClients = await Client.countDocuments({ status: 'suspendido' });
        
        const clientsByPlan = await Client.aggregate([
            { $group: { _id: '$plan', count: { $sum: 1 } } }
        ]);
        
        const recentClients = await Client.find()
            .select('businessName domain status createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        const billingClients = await Client.find({ status: { $ne: 'eliminado' } })
            .select('billing features plan');
        const monthlyRevenue = billingClients.reduce((sum, client) => {
            const totals = calculateBillingTotals(client.billing, client.features);
            return sum + totals.total;
        }, 0);
        
        res.json({
            success: true,
            data: {
                total: totalClients,
                active: activeClients,
                trial: trialClients,
                suspended: suspendedClients,
                byPlan: clientsByPlan,
                mrr: Math.round(monthlyRevenue * 100) / 100,
                recent: recentClients
            }
        });
        
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            error: error.message
        });
    }
});

/**
 * POST /api/superadmin/test-email
 * Probar el envío de emails
 */
router.post('/test-email', superAdminAuth, async (req, res) => {
    try {
        const { email, type = 'welcome', clientId } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email es requerido'
            });
        }
        
        let result;
        
        if (type === 'welcome' && clientId) {
            // Buscar el cliente
            const client = await Client.findById(clientId);
            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }
            
            result = await emailService.sendActivationEmail(client, `http://${client.domain}:${process.env.PORT || 3000}/activate-account?token=TEST_TOKEN`);
        } else {
            // Email de prueba genérico
            result = await emailService.sendEmail({
                to: email,
                subject: '📧 Email de prueba - FrescosEnVivo',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h1 style="color: #667eea;">¡Email de prueba!</h1>
                        <p>Este es un email de prueba del sistema FrescosEnVivo.</p>
                        <p>Si recibiste este email, significa que el servicio de correo está funcionando correctamente.</p>
                        <hr>
                        <p style="color: #666; font-size: 12px;">Enviado desde el panel de Super Admin</p>
                    </div>
                `,
                text: 'Email de prueba - FrescosEnVivo'
            });
        }
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Email enviado exitosamente',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Error al enviar email',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error al enviar email de prueba:', error);
        res.status(500).json({
            success: false,
            message: 'Error al enviar email',
            error: error.message
        });
    }
});

/**
 * POST /api/superadmin/resend-welcome/:id
 * Reenviar email de bienvenida a un cliente
 */
router.post('/resend-welcome/:id', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }
        
        // Generar nuevo token de activación (caduca en 72 horas)
        const newToken = generateActivationToken();
        client.activationToken = newToken;
        client.activationTokenExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await client.save();

        const port = process.env.PORT || 3000;
        const activationUrl = `http://${client.domain}:${port}/activate-account?token=${newToken}`;

        const result = await emailService.sendActivationEmail(client, activationUrl);
        
        if (result.success) {
            const response = {
                success: true,
                message: 'Email de activación reenviado',
                messageId: result.messageId
            };
            
            // Si hay URL de preview (Ethereal), incluirla
            if (result.previewUrl) {
                response.previewUrl = result.previewUrl;
            }
            
            res.json(response);
        } else {
            res.status(500).json({
                success: false,
                message: 'Error al reenviar email',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error al reenviar email:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reenviar email',
            error: error.message
        });
    }
});

/**
 * GET /api/superadmin/clients/:id/database-info
 * Obtener información de la BD del cliente
 */
router.get('/clients/:id/database-info', superAdminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id)
            .select('businessName database owner');
        
        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }

        const clientDbConnection = mongoose.createConnection(client.database.connectionString, {
            serverSelectionTimeoutMS: 10000
        });

        try {
            await clientDbConnection.asPromise();

            // Obtener lista de colecciones
            const collections = await clientDbConnection.db.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);

            const collectionStats = [];

            for (const collectionName of collectionNames) {
                const collection = clientDbConnection.collection(collectionName);
                const count = await collection.countDocuments();
                
                // Obtener un documento de ejemplo
                const sample = await collection.findOne();

                collectionStats.push({
                    name: collectionName,
                    documentCount: count,
                    sampleDocument: sample ? { ...sample } : null
                });
            }

            // Si la colección "users" existe, contar users activos
            let usersInfo = null;
            if (collectionNames.includes('users')) {
                const usersCollection = clientDbConnection.collection('users');
                const totalUsers = await usersCollection.countDocuments();
                const activeUsers = await usersCollection.countDocuments({ status: 'activo' });
                const users = await usersCollection.find({}).limit(20).toArray();
                
                usersInfo = {
                    total: totalUsers,
                    active: activeUsers,
                    list: users.map(u => ({
                        _id: u._id,
                        username: u.username,
                        email: u.email,
                        role: u.role,
                        status: u.status,
                        createdAt: u.createdAt
                    }))
                };
            }

            res.json({
                success: true,
                data: {
                    client: {
                        id: client._id,
                        businessName: client.businessName,
                        databaseName: client.database.name,
                        owner: {
                            username: client.owner.username,
                            email: client.owner.email,
                            fullName: client.owner.fullName
                        }
                    },
                    database: {
                        collections: collectionStats,
                        collectionCount: collectionNames.length,
                        usersInfo
                    }
                }
            });
        } finally {
            await clientDbConnection.close();
        }
    } catch (error) {
        console.error('Error al obtener información de BD:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener información de la base de datos',
            error: error.message
        });
    }
});

module.exports = router;
