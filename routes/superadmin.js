const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const User = require('../models/User');
const SuperAdminAudit = require('../models/SuperAdminAudit');
const PricingSettings = require('../models/PricingSettings');
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

const DEFAULT_PRICING_CATALOG = {
    plans: { ...PLAN_BASE_PRICES },
    addons: { ...DEFAULT_ADDON_PRICES },
    currency: 'EUR'
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

function mergePricingCatalog(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const plans = source.plans && typeof source.plans === 'object' ? source.plans : {};
    const addons = source.addons && typeof source.addons === 'object' ? source.addons : {};

    return {
        plans: {
            basico: toValidAmount(plans.basico, DEFAULT_PRICING_CATALOG.plans.basico),
            profesional: toValidAmount(plans.profesional, DEFAULT_PRICING_CATALOG.plans.profesional),
            empresarial: toValidAmount(plans.empresarial, DEFAULT_PRICING_CATALOG.plans.empresarial),
            personalizado: toValidAmount(plans.personalizado, DEFAULT_PRICING_CATALOG.plans.personalizado)
        },
        addons: {
            seoPro: toValidAmount(addons.seoPro, DEFAULT_PRICING_CATALOG.addons.seoPro),
            premiumDesigns: toValidAmount(addons.premiumDesigns, DEFAULT_PRICING_CATALOG.addons.premiumDesigns),
            reviewsReputation: toValidAmount(addons.reviewsReputation, DEFAULT_PRICING_CATALOG.addons.reviewsReputation)
        },
        currency: String(source.currency || DEFAULT_PRICING_CATALOG.currency || 'EUR').toUpperCase()
    };
}

async function getPricingCatalog() {
    const config = await PricingSettings.findOne({ key: 'global' }).lean();
    return mergePricingCatalog(config);
}

async function upsertPricingCatalog(payload) {
    const merged = mergePricingCatalog(payload);
    const doc = await PricingSettings.findOneAndUpdate(
        { key: 'global' },
        {
            $set: {
                plans: merged.plans,
                addons: merged.addons,
                currency: merged.currency
            }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return mergePricingCatalog(doc);
}

function getDefaultBillingFromCatalog(plan, pricingCatalog) {
    const catalog = mergePricingCatalog(pricingCatalog);
    return {
        currency: catalog.currency,
        basePlanPrice: catalog.plans[plan] ?? catalog.plans.basico,
        addonPrices: {
            seoPro: catalog.addons.seoPro,
            premiumDesigns: catalog.addons.premiumDesigns,
            reviewsReputation: catalog.addons.reviewsReputation
        },
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
    // isSuperAdmin se setea en login cuando accede desde dominio de hosting
    // También aceptar si el role es 'admin' y no tiene clientId (es admin master)
    const isValidSuperAdmin = req.session.isSuperAdmin || 
                              (req.session.role === 'admin' && !req.session.clientId);

    if (!isValidSuperAdmin) {
        return res.status(403).json({ success: false, message: 'Acceso denegado - Se requieren permisos de Super Admin' });
    }
    
    next();
}

const SUPERADMIN_ROLE_PERMISSIONS = {
    owner: ['*'],
    billing: ['clients:read', 'stats:read', 'invoices:read', 'billing:manage'],
    soporte: ['clients:read', 'stats:read', 'audits:read', 'invoices:read', 'database:read', 'client:toggle', 'activation:resend', 'email:test', 'settings:access'],
    readonly: ['clients:read', 'stats:read', 'audits:read', 'invoices:read', 'database:read', 'settings:access']
};

function getSuperAdminRole(req) {
    const sessionRole = String(req.session?.superAdminRole || '').toLowerCase();
    if (SUPERADMIN_ROLE_PERMISSIONS[sessionRole]) {
        return sessionRole;
    }
    return 'owner';
}

function hasSuperAdminPermission(role, permission) {
    const permissions = SUPERADMIN_ROLE_PERMISSIONS[role] || [];
    return permissions.includes('*') || permissions.includes(permission);
}

function requireSuperAdminPermission(...permissions) {
    return (req, res, next) => {
        const role = getSuperAdminRole(req);
        req.superAdminRole = role;

        const allowed = permissions.some((permission) => hasSuperAdminPermission(role, permission));
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: 'Permisos insuficientes para esta acción',
                required: permissions,
                role
            });
        }

        next();
    };
}

function requireOwnerRole(req, res, next) {
    const role = getSuperAdminRole(req);
    if (role !== 'owner') {
        return res.status(403).json({
            success: false,
            message: 'Solo el Propietario (Owner) puede acceder a esta función',
            role
        });
    }
    next();
}

function getRequestIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '';
}

function getAuditActor(req) {
    return {
        userId: req.session?.userId || null,
        username: req.session?.username || req.session?.email || 'superadmin',
        role: req.session?.role || 'admin'
    };
}

async function logSuperAdminAudit(req, payload) {
    try {
        await SuperAdminAudit.create({
            actor: getAuditActor(req),
            requestMeta: {
                ip: getRequestIp(req),
                userAgent: String(req.headers['user-agent'] || '').slice(0, 500)
            },
            ...payload
        });
    } catch (auditError) {
        console.error('⚠️ No se pudo registrar auditoría superadmin:', auditError.message);
    }
}

/**
 * GET /api/superadmin/clients
 * Listar todos los clientes
 */
router.get('/clients', superAdminAuth, requireSuperAdminPermission('clients:read'), async (req, res) => {
    try {
        const { status, plan, billingStatus, search, segment = 'all', page = 1, limit = 20, sortBy = 'createdAt', sortDir = 'desc' } = req.query;

        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

        const allowedSortFields = {
            createdAt: 'createdAt',
            businessName: 'businessName',
            status: 'status',
            plan: 'plan'
        };

        const safeSortField = allowedSortFields[String(sortBy)] || 'createdAt';
        const safeSortDir = String(sortDir).toLowerCase() === 'asc' ? 1 : -1;
        const sortConfig = { [safeSortField]: safeSortDir, _id: -1 };
        
        let query = { status: { $ne: 'eliminado' } };
        
        // Filtrar por estado
        if (status) {
            // Si status contiene coma, es una lista (ej: "prueba,propuesta")
            if (status.includes(',')) {
                const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
                query.status = { $in: statuses };
            } else {
                query.status = status;
            }
        } else {
            // Por defecto: excluir "prueba" (usar filter "Posibles clientes" para verlos)
            query.status = { $nin: ['eliminado', 'prueba'] };
        }
        
        // Filtrar por plan
        if (plan) {
            query.plan = plan;
        }

        // Segmentos rápidos operativos
        if (segment === 'new_7d') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            query.createdAt = { $gte: sevenDaysAgo };
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

        if (segment === 'overdue') {
            query['billing.paymentStatus'] = { $nin: ['pausado', 'al_dia'] };
            query['billing.nextDueDate'] = { $lt: new Date() };
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

        const skip = (parsedPage - 1) * parsedLimit;
        
        const clients = await Client.find(query)
            .select('-owner.password -database.connectionString')
            .sort(sortConfig)
            .skip(skip)
            .limit(parsedLimit);
        
        const total = await Client.countDocuments(query);
        
        res.json({
            success: true,
            data: clients,
            pagination: {
                total,
                page: parsedPage,
                pages: Math.ceil(total / parsedLimit),
                limit: parsedLimit
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
router.get('/clients/:id', superAdminAuth, requireSuperAdminPermission('clients:read'), async (req, res) => {
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
router.get('/clients/:id/invoices', superAdminAuth, requireSuperAdminPermission('invoices:read'), async (req, res) => {
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
 * GET /api/superadmin/audits
 * Historial de actividad de superadmin
 */
router.get('/audits', superAdminAuth, requireSuperAdminPermission('audits:read'), async (req, res) => {
    try {
        const { page = 1, limit = 30, action = '', search = '' } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
        const skip = (parsedPage - 1) * parsedLimit;

        const query = {};

        if (action) {
            query.action = String(action).trim();
        }

        if (search) {
            const safeSearch = String(search).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { 'actor.username': { $regex: safeSearch, $options: 'i' } },
                { action: { $regex: safeSearch, $options: 'i' } },
                { 'target.businessName': { $regex: safeSearch, $options: 'i' } },
                { 'target.domain': { $regex: safeSearch, $options: 'i' } }
            ];
        }

        const [rows, total] = await Promise.all([
            SuperAdminAudit.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
                .lean(),
            SuperAdminAudit.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: rows,
            pagination: {
                total,
                page: parsedPage,
                pages: Math.ceil(total / parsedLimit),
                limit: parsedLimit
            }
        });
    } catch (error) {
        console.error('Error al listar auditoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al listar auditoría',
            error: error.message
        });
    }
});

/**
 * GET /api/superadmin/pricing-settings
 * Obtener configuración global de planes y addons
 */
router.get('/pricing-settings', superAdminAuth, requireSuperAdminPermission('stats:read'), async (req, res) => {
    try {
        const pricing = await getPricingCatalog();
        res.json({ success: true, data: pricing });
    } catch (error) {
        console.error('Error al obtener pricing settings:', error);
        res.status(500).json({ success: false, message: 'Error al obtener configuración de precios', error: error.message });
    }
});

/**
 * PUT /api/superadmin/pricing-settings
 * Guardar configuración global de planes y addons
 */
router.put('/pricing-settings', superAdminAuth, requireSuperAdminPermission('clients:write'), async (req, res) => {
    try {
        const pricing = await upsertPricingCatalog(req.body || {});
        res.json({ success: true, message: 'Configuración de precios actualizada', data: pricing });
    } catch (error) {
        console.error('Error al actualizar pricing settings:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar configuración de precios', error: error.message });
    }
});

/**
 * POST /api/superadmin/clients
 * Crear un nuevo cliente
 */
router.post('/clients', superAdminAuth, requireSuperAdminPermission('clients:write'), async (req, res) => {
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
            billing,
            plan,
            status,
            proposalOnly,
            features,
            subscriptionEndDate,
            notes,
            tags,
            limits,
            branding
        } = req.body;

        const pricingCatalog = await getPricingCatalog();

        const normalizedBusinessName = String(
            businessName ||
            (isProposalOnly && billingInfo?.legalName ? billingInfo.legalName : '')
        ).trim();
        const normalizedDomain = String(domain || '').trim().toLowerCase();
        const normalizedOwnerUsername = String(ownerUsername || '').trim().toLowerCase();
        const normalizedOwnerEmail = String(ownerEmail || '').trim().toLowerCase();
        const normalizedOwnerFullName = String(ownerFullName || '').trim();
        const isProposalOnly = Boolean(proposalOnly);
        const requestedStatus = String(status || '').trim();
        const safeStatus = isProposalOnly
            ? 'propuesta'
            : (['activo', 'suspendido', 'prueba', 'propuesta', 'expirado'].includes(requestedStatus) ? requestedStatus : 'prueba');
        
        // Validaciones
        if (!normalizedBusinessName) {
            return res.status(400).json({
                success: false,
                message: 'El nombre del negocio es obligatorio'
            });
        }
        if (!isProposalOnly && (!normalizedDomain || !normalizedOwnerUsername || !normalizedOwnerEmail || !normalizedOwnerFullName)) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos (dominio, propietario, email y usuario son obligatorios al crear un cliente activo)'
            });
        }

        // Generar contraseña provisional automática (el propietario la cambiará al activar)
        const tempPassword = crypto.randomBytes(16).toString('hex');

        // Generar token de activación (caduca en 72 horas), salvo modo propuesta
        const activationToken = isProposalOnly ? null : generateActivationToken();
        const activationTokenExpires = isProposalOnly ? null : new Date(Date.now() + 72 * 60 * 60 * 1000);

        // Generar valores placeholder para propuesta si faltan campos no obligatorios
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        const safeDomain = normalizedDomain
            ? normalizedDomain
            : `propuesta-${normalizedBusinessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${randomSuffix}.pendiente`;
        const safeUsername = normalizedOwnerUsername
            ? normalizedOwnerUsername
            : `propuesta_${randomSuffix}`;
        const safeEmail = normalizedOwnerEmail
            ? normalizedOwnerEmail
            : `propuesta_${randomSuffix}@noreply.internal`;
        const safeFullName = normalizedOwnerFullName
            ? normalizedOwnerFullName
            : `(Propuesta) ${normalizedBusinessName}`;

        if (!isProposalOnly) {
            if (!/^[a-z0-9.-]+$/.test(safeDomain)) {
                return res.status(400).json({
                    success: false,
                    message: 'El dominio contiene caracteres no válidos'
                });
            }
            // Verificar que el dominio no exista
            const existingClient = await Client.findOne({ domain: safeDomain });
            if (existingClient) {
                return res.status(400).json({
                    success: false,
                    message: 'El dominio ya está registrado'
                });
            }
            // Verificar que el username no exista
            const existingUsername = await Client.findOne({ 'owner.username': safeUsername });
            if (existingUsername) {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre de usuario ya está en uso'
                });
            }
            // Verificar que el email no exista
            const existingEmail = await Client.findOne({ 'owner.email': safeEmail });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'El email ya está registrado'
                });
            }
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
            domain: safeDomain,
            storeType: storeType || 'pescaderia',
            owner: {
                username: safeUsername,
                email: safeEmail,
                password: tempPassword,
                fullName: safeFullName,
                phone: ownerPhone || ''
            },
            database: {
                name: dbName,
                connectionString: clientDbUri
            },
            plan: plan || 'basico',
            status: safeStatus,
            billing: normalizeBillingInput(
                billing,
                getDefaultBillingFromCatalog(plan || 'basico', pricingCatalog),
                plan || 'basico'
            ),
            billingInfo: normalizeBillingInfoInput(billingInfo, {
                legalName: normalizedBusinessName,
                billingEmail: normalizedOwnerEmail
            }),
            features: {
                seoPro: Boolean(features?.seoPro),
                premiumDesigns: Boolean(features?.premiumDesigns),
                reviewsReputation: Boolean(features?.reviewsReputation)
            },
            limits: limits || {
                maxDailyTickets: 200,
                maxCameras: 4,
                maxKiosks: 2,
                maxVendors: 3,
                storageQuotaMB: 1000
            },
            branding: branding || {},
            subscriptionEndDate: subscriptionEndDate || null,
            notes: String(notes || '').trim(),
            tags: Array.isArray(tags) ? tags.map((t) => String(t || '').trim()).filter(Boolean) : [],
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

        await logSuperAdminAudit(req, {
            action: 'client.created',
            target: {
                type: 'client',
                clientId: client._id,
                businessName: client.businessName,
                domain: client.domain
            },
            details: {
                plan: client.plan,
                status: client.status,
                storeType: client.storeType
            },
            status: 'success'
        });
        
        if (!isProposalOnly && activationToken) {
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
        }
        
        res.status(201).json({
            success: true,
            message: isProposalOnly ? 'Propuesta guardada sin activar cuenta' : 'Cliente creado exitosamente',
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
router.put('/clients/:id', superAdminAuth, requireSuperAdminPermission('clients:write'), async (req, res) => {
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

        await logSuperAdminAudit(req, {
            action: 'client.updated',
            target: {
                type: 'client',
                clientId: client._id,
                businessName: client.businessName,
                domain: client.domain
            },
            details: {
                status: client.status,
                plan: client.plan,
                storeType: client.storeType
            },
            status: 'success'
        });
        
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
router.post('/clients/:id/mark-paid', superAdminAuth, requireSuperAdminPermission('billing:manage'), async (req, res) => {
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

        await logSuperAdminAudit(req, {
            action: 'billing.mark_paid',
            target: {
                type: 'client',
                clientId: client._id,
                businessName: client.businessName,
                domain: client.domain
            },
            details: {
                nextDueDate,
                paymentStatus: client.billing.paymentStatus
            },
            status: 'success'
        });

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
router.post('/clients/:id/toggle-active', superAdminAuth, requireSuperAdminPermission('client:toggle'), async (req, res) => {
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

        await logSuperAdminAudit(req, {
            action: action === 'deactivate' ? 'client.deactivated' : 'client.activated',
            target: {
                type: 'client',
                clientId: client._id,
                businessName: client.businessName,
                domain: client.domain
            },
            details: {
                status: client.status
            },
            status: 'success'
        });

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
router.delete('/clients/:id', superAdminAuth, requireSuperAdminPermission('clients:delete'), async (req, res) => {
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

        await logSuperAdminAudit(req, {
            action: 'client.deleted_logical',
            target: {
                type: 'client',
                clientId: client._id,
                businessName: clientName,
                domain: client.domain
            },
            details: {
                dbDeleted,
                databaseName: clientDbName || null
            },
            status: 'success'
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
router.get('/stats', superAdminAuth, requireSuperAdminPermission('stats:read'), async (req, res) => {
    try {
        const totalClients = await Client.countDocuments({ status: { $nin: ['eliminado', 'propuesta'] } });
        const activeClients = await Client.countDocuments({ status: 'activo' });
        const trialClients = await Client.countDocuments({ status: 'prueba' });
        const suspendedClients = await Client.countDocuments({ status: 'suspendido' });
        const proposalClients = await Client.countDocuments({ status: 'propuesta' });

        const clientsByPlan = await Client.aggregate([
            { $match: { status: { $nin: ['eliminado', 'propuesta'] } } },
            { $group: { _id: '$plan', count: { $sum: 1 } } }
        ]);

        const recentClients = await Client.find({ status: { $nin: ['eliminado', 'propuesta'] } })
            .select('businessName domain status createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        const billingClients = await Client.find({ status: { $nin: ['eliminado', 'propuesta'] } })
            .select('billing features plan businessName');
        const monthlyRevenue = billingClients.reduce((sum, client) => {
            const totals = calculateBillingTotals(client.billing, client.features);
            return sum + totals.total;
        }, 0);
        
        // NUEVAS MÉTRICAS PARA DASHBOARD MEJORADO
        
        // 1. Próximos vencimientos (próximos 7 días)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysLater = new Date(today);
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
        
        const upcomingDueDates = await Client.find({
            status: { $ne: 'eliminado' },
            'billing.nextDueDate': { $gte: today, $lte: sevenDaysLater }
        })
        .select('businessName billing.nextDueDate billing.paymentStatus plan')
        .sort({ 'billing.nextDueDate': 1 })
        .limit(10);
        
        // 2. Revenue Trend (últimos 30 días)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        
        const allClientsForTrend = await Client.find({ status: { $nin: ['eliminado', 'propuesta'] } })
            .select('createdAt billing features plan');
        
        const revenueTrendMap = {};
        for (let i = 0; i < 30; i++) {
            const date = new Date(thirtyDaysAgo);
            date.setDate(date.getDate() + i);
            const dateKey = date.toISOString().split('T')[0];
            revenueTrendMap[dateKey] = 0;
        }
        
        // Calcular ingresos por fecha de creación (aproximado)
        allClientsForTrend.forEach(client => {
            const createdDate = new Date(client.createdAt);
            if (createdDate >= thirtyDaysAgo) {
                const dateKey = createdDate.toISOString().split('T')[0];
                if (dateKey in revenueTrendMap) {
                    const totals = calculateBillingTotals(client.billing, client.features);
                    revenueTrendMap[dateKey] += totals.total;
                }
            }
        });
        
        const revenueTrend = Object.entries(revenueTrendMap).map(([date, revenue]) => ({
            date,
            revenue: Math.round(revenue * 100) / 100
        }));
        
        // 3. Revenue por Plan (en lugar de solo contar)
        const revenueByPlan = [];
        const planNames = { basico: 'Básico', profesional: 'Profesional', empresarial: 'Empresarial', personalizado: 'Personalizado' };
        
        const plansInSystem = ['basico', 'profesional', 'empresarial', 'personalizado'];
        for (const plan of plansInSystem) {
            const clientsWithPlan = billingClients.filter(c => c.plan === plan);
            const totalRevenue = clientsWithPlan.reduce((sum, client) => {
                const totals = calculateBillingTotals(client.billing, client.features);
                return sum + totals.total;
            }, 0);
            
            revenueByPlan.push({
                plan,
                planName: planNames[plan],
                count: clientsWithPlan.length,
                revenue: Math.round(totalRevenue * 100) / 100
            });
        }
        
        res.json({
            success: true,
            data: {
                total: totalClients,
                active: activeClients,
                trial: trialClients,
                suspended: suspendedClients,
                proposals: proposalClients,
                byPlan: clientsByPlan,
                mrr: Math.round(monthlyRevenue * 100) / 100,
                recent: recentClients,
                upcomingDueDates: upcomingDueDates,
                revenueTrend: revenueTrend,
                revenueByPlan: revenueByPlan
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
router.post('/test-email', superAdminAuth, requireSuperAdminPermission('email:test'), async (req, res) => {
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
router.post('/resend-welcome/:id', superAdminAuth, requireSuperAdminPermission('activation:resend'), async (req, res) => {
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

            await logSuperAdminAudit(req, {
                action: 'client.activation_email_resent',
                target: {
                    type: 'client',
                    clientId: client._id,
                    businessName: client.businessName,
                    domain: client.domain
                },
                details: {
                    email: client.owner?.email || ''
                },
                status: 'success'
            });
            
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
 * POST /api/superadmin/clients/:id/send-proposal
 * Enviar propuesta comercial por email a un cliente en estado "propuesta"
 */
router.post('/clients/:id/send-proposal', superAdminAuth, requireSuperAdminPermission('client:edit'), async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);

        if (!client) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }

        const recipientEmail = client?.billingInfo?.billingEmail || client?.owner?.email || '';
        if (!recipientEmail || recipientEmail.startsWith('propuesta_')) {
            return res.status(400).json({ success: false, message: 'Este cliente no tiene un email real configurado. Edita el cliente y añade el email antes de enviar la propuesta.' });
        }

        // Construir líneas de addons activos
        const addonLabels = { seoPro: 'SEO Pro', premiumDesigns: 'Diseños Premium', reviewsReputation: 'Reputación & Reseñas' };
        const addonLines = Object.entries(client.addons || {})
            .filter(([, v]) => v === true)
            .map(([key]) => ({
                label: addonLabels[key] || key,
                price: client.billing?.addonPrices?.[key] || 0
            }));

        const proposalDetails = {
            planLabel: client.plan,
            basePlanPrice: client.billing?.basePlanPrice,
            discount: client.billing?.discount || 0,
            addonLines,
            notes: client.notes || '',
            senderName: req.user?.username || 'El equipo de FrescosEnVivo'
        };

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const result = await emailService.sendProposalEmail(client, proposalDetails, baseUrl);

        if (result.success) {
            await logSuperAdminAudit(req, {
                action: 'client.proposal_sent',
                target: { type: 'client', clientId: client._id, businessName: client.businessName },
                details: { email: recipientEmail },
                status: 'success'
            });

            const response = { success: true, message: `Propuesta enviada a ${recipientEmail}` };
            if (result.previewUrl) response.previewUrl = result.previewUrl;
            return res.json(response);
        }

        res.status(500).json({ success: false, message: 'Error al enviar la propuesta', error: result.error });
    } catch (error) {
        console.error('Error al enviar propuesta:', error);
        res.status(500).json({ success: false, message: 'Error interno al enviar la propuesta', error: error.message });
    }
});

/**
 * GET /api/superadmin/clients/:id/database-info
 * Obtener información de la BD del cliente
 */
router.get('/clients/:id/database-info', superAdminAuth, requireSuperAdminPermission('database:read'), async (req, res) => {
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

// ══════════════════════════════════════════════
// GESTIÓN DE USUARIOS SUPERADMIN
// ══════════════════════════════════════════════

/**
 * GET /api/superadmin/users
 * Obtener lista de usuarios superadmin (solo owner)
 */
router.get('/users', superAdminAuth, requireOwnerRole, async (req, res) => {
    try {
        // Incluir usuarios con superAdminRole asignado O admins master (sin clientId)
        // El primer admin creado con init-db puede no tener superAdminRole en BD
        const users = await User.find({
            $or: [
                { superAdminRole: { $ne: null } },
                { role: 'admin', clientId: { $exists: false } },
                { role: 'admin', clientId: null }
            ]
        }).select('-password').sort({ createdAt: -1 });

        res.json({
            success: true,
            data: users,
            count: users.length
        });
    } catch (error) {
        console.error('Error al obtener usuarios superadmin:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios',
            error: error.message
        });
    }
});

/**
 * POST /api/superadmin/users
 * Crear nuevo usuario superadmin (solo owner)
 */
router.post('/users', superAdminAuth, requireOwnerRole, async (req, res) => {
    try {
        const { username, email, fullName, superAdminRole, password } = req.body;

        // Validaciones
        if (!username || !email || !fullName || !superAdminRole || !password) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: username, email, fullName, superAdminRole, password'
            });
        }

        if (!['owner', 'billing', 'soporte', 'readonly'].includes(superAdminRole)) {
            return res.status(400).json({
                success: false,
                message: 'Rol inválido. Debe ser: owner, billing, soporte o readonly'
            });
        }

        // Verificar que no exista usuario con ese username
        const existingUser = await User.findOne({ 
            $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un usuario con ese username o email'
            });
        }

        // Crear usuario
        const newUser = new User({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            fullName,
            role: 'admin',
            superAdminRole,
            password,
            createdBy: req.session.userId
        });

        await newUser.save();

        // Audit logging
        await logSuperAdminAudit(req, {
            action: 'superadmin.user_created',
            target: {
                type: 'superadmin_user',
                userId: newUser._id,
                username: newUser.username,
                email: newUser.email
            },
            details: {
                username: newUser.username,
                email: newUser.email,
                fullName: newUser.fullName,
                superAdminRole: newUser.superAdminRole
            },
            status: 'success'
        });

        res.json({
            success: true,
            message: 'Usuario superadmin creado exitosamente',
            user: newUser.toJSON()
        });
    } catch (error) {
        console.error('Error al crear usuario superadmin:', error);
        
        // Audit logging de error
        try {
            await logSuperAdminAudit(req, {
                action: 'superadmin.user_created',
                target: { type: 'superadmin_user' },
                details: { error: error.message },
                status: 'failed'
            });
        } catch (auditError) {
            console.error('Error al registrar auditoría:', auditError);
        }

        res.status(500).json({
            success: false,
            message: 'Error al crear usuario',
            error: error.message
        });
    }
});

/**
 * PUT /api/superadmin/users/:id
 * Editar usuario superadmin (solo owner)
 */
router.put('/users/:id', superAdminAuth, requireOwnerRole, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, fullName, superAdminRole, isActive } = req.body;

        // Validar ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID de usuario inválido'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Validar que no sea el mismo usuario
        if (String(user._id) === String(req.session.userId)) {
            return res.status(400).json({
                success: false,
                message: 'No puedes editar tu propio perfil desde aquí'
            });
        }

        // Preparar cambios
        const changes = {};
        if (email && email !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe un usuario con ese email'
                });
            }
            changes.email = email.toLowerCase();
        }

        if (fullName && fullName !== user.fullName) {
            changes.fullName = fullName;
        }

        if (superAdminRole && superAdminRole !== user.superAdminRole) {
            if (!['owner', 'billing', 'soporte', 'readonly'].includes(superAdminRole)) {
                return res.status(400).json({
                    success: false,
                    message: 'Rol inválido'
                });
            }
            changes.superAdminRole = superAdminRole;
        }

        if (typeof isActive === 'boolean' && isActive !== user.isActive) {
            changes.isActive = isActive;
        }

        // Actualizar usuario
        Object.assign(user, changes);
        await user.save();

        // Audit logging
        await logSuperAdminAudit(req, {
            action: 'superadmin.user_updated',
            target: {
                type: 'superadmin_user',
                userId: user._id,
                username: user.username,
                email: user.email
            },
            details: {
                changedFields: Object.keys(changes),
                changes: changes
            },
            status: 'success'
        });

        res.json({
            success: true,
            message: 'Usuario actualizado exitosamente',
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Error al actualizar usuario superadmin:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar usuario',
            error: error.message
        });
    }
});

/**
 * DELETE /api/superadmin/users/:id
 * Eliminar usuario superadmin (solo owner)
 */
router.delete('/users/:id', superAdminAuth, requireOwnerRole, async (req, res) => {
    try {
        const { id } = req.params;

        // Validar ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID de usuario inválido'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Validar que no sea el mismo usuario
        if (String(user._id) === String(req.session.userId)) {
            return res.status(400).json({
                success: false,
                message: 'No puedes eliminar tu propio usuario'
            });
        }

        // Validar que sea un usuario superadmin
        if (!user.superAdminRole) {
            return res.status(400).json({
                success: false,
                message: 'Solo se pueden eliminar usuarios superadmin'
            });
        }

        const username = user.username;
        const email = user.email;

        // Eliminar usuario
        await User.findByIdAndDelete(id);

        // Audit logging
        await logSuperAdminAudit(req, {
            action: 'superadmin.user_deleted',
            target: {
                type: 'superadmin_user',
                userId: id,
                username: username,
                email: email
            },
            details: {
                superAdminRole: user.superAdminRole,
                wasActive: user.isActive
            },
            status: 'success'
        });

        res.json({
            success: true,
            message: 'Usuario eliminado exitosamente'
        });
    } catch (error) {
        console.error('Error al eliminar usuario superadmin:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar usuario',
            error: error.message
        });
    }
});

// ══════════════════════════════════════════════
// FACTURACIÓN - ENDPOINTS GLOBALES
// ══════════════════════════════════════════════

/**
 * GET /api/superadmin/invoices
 * Todas las facturas de todos los clientes con filtros y paginación
 */
router.get('/invoices', superAdminAuth, requireSuperAdminPermission('invoices:read'), async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const skip = (page - 1) * limit;
        const { status, search, dateFrom, dateTo } = req.query;

        // Construir pipeline de agregación para obtener facturas embebidas en clientes
        const matchClient = { 'invoices.0': { $exists: true } };

        if (search) {
            const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            matchClient.$or = [
                { businessName: regex },
                { domain: regex },
                { 'owner.email': regex }
            ];
        }

        const pipeline = [
            { $match: matchClient },
            { $unwind: '$invoices' },
        ];

        // Filtro por estado de factura
        if (status) {
            pipeline.push({ $match: { 'invoices.status': status } });
        }

        // Filtro por rango de fechas
        if (dateFrom || dateTo) {
            const dateFilter = {};
            if (dateFrom) dateFilter.$gte = new Date(dateFrom);
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                dateFilter.$lte = to;
            }
            pipeline.push({ $match: { 'invoices.date': dateFilter } });
        }

        // Total para paginación
        const countPipeline = [...pipeline, { $count: 'total' }];
        const [countResult] = await Client.aggregate(countPipeline);
        const total = countResult?.total || 0;

        // Ordenar, paginar y proyectar
        pipeline.push(
            { $sort: { 'invoices.date': -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    clientId: '$_id',
                    businessName: 1,
                    domain: 1,
                    ownerEmail: '$owner.email',
                    invoice: '$invoices'
                }
            }
        );

        const rows = await Client.aggregate(pipeline);

        res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error al obtener facturas globales:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener facturas',
            error: error.message
        });
    }
});

/**
 * GET /api/superadmin/billing/preview
 * Previsión de cobros: clientes con cobros en próximos N días y totales del mes
 */
router.get('/billing/preview', superAdminAuth, requireSuperAdminPermission('invoices:read'), async (req, res) => {
    try {
        const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
        const now = new Date();
        const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const allClients = await Client.find({
            status: { $in: ['activo', 'prueba'] }
        }).select('businessName domain owner plan status billingInfo trialEndsAt');

        // Agrupar por día de cobro
        const byDay = {};
        let totalExpected = 0;
        let totalCollected = 0;

        for (const client of allClients) {
            const billing = client.billingInfo || {};
            const paymentStatus = billing.paymentStatus || 'pendiente';

            // Calcular importe total del cliente
            const basePlanPrice = Number(billing.basePlanPrice) || 0;
            const addonPrices = billing.addonPrices || {};
            const discount = Number(billing.discount) || 0;
            const addonTotal = Object.values(addonPrices).reduce((sum, v) => sum + Number(v || 0), 0);
            const monthlyTotal = Math.max(0, basePlanPrice + addonTotal - discount);

            if (monthlyTotal === 0) continue;

            const nextDue = billing.nextDueDate ? new Date(billing.nextDueDate) : null;
            if (!nextDue || nextDue > horizon) continue;

            if (paymentStatus === 'al_dia') {
                totalCollected += monthlyTotal;
                continue;
            }

            totalExpected += monthlyTotal;

            const dayKey = nextDue.toISOString().slice(0, 10);
            if (!byDay[dayKey]) byDay[dayKey] = { date: dayKey, clients: [], total: 0 };
            byDay[dayKey].clients.push({
                clientId: client._id,
                businessName: client.businessName,
                domain: client.domain,
                ownerEmail: client.owner?.email,
                amount: monthlyTotal,
                paymentStatus,
                plan: client.plan
            });
            byDay[dayKey].total += monthlyTotal;
        }

        // Ordenar días
        const upcoming = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

        // Clientes más atrasados (paymentStatus=vencido, ordenado por nextDueDate ascendente)
        const overdueClients = allClients
            .filter(c => (c.billingInfo?.paymentStatus || '') === 'vencido')
            .map(c => {
                const billing = c.billingInfo || {};
                const basePlanPrice = Number(billing.basePlanPrice) || 0;
                const addonPrices = billing.addonPrices || {};
                const discount = Number(billing.discount) || 0;
                const addonTotal = Object.values(addonPrices).reduce((sum, v) => sum + Number(v || 0), 0);
                return {
                    clientId: c._id,
                    businessName: c.businessName,
                    domain: c.domain,
                    ownerEmail: c.owner?.email,
                    amount: Math.max(0, basePlanPrice + addonTotal - discount),
                    nextDueDate: billing.nextDueDate || null,
                    plan: c.plan
                };
            })
            .sort((a, b) => new Date(a.nextDueDate || 0) - new Date(b.nextDueDate || 0))
            .slice(0, 10);

        res.json({
            success: true,
            data: {
                upcoming,
                overdueClients,
                summary: {
                    totalExpected,
                    totalCollected,
                    days
                }
            }
        });
    } catch (error) {
        console.error('Error al obtener previsión de facturación:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener previsión',
            error: error.message
        });
    }
});

module.exports = router;
