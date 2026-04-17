const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenantMiddleware');
const invoiceService = require('../services/invoiceService');
const emailService = require('../services/emailService');
const Client = require('../models/Client');
const mongoose = require('mongoose');

const invoiceCounterSchema = new mongoose.Schema(
    {
        _id: { type: String, required: true },
        seq: { type: Number, default: 0 }
    },
    {
        collection: 'invoice_counters',
        versionKey: false
    }
);

const InvoiceCounter = mongoose.models.InvoiceCounter || mongoose.model('InvoiceCounter', invoiceCounterSchema);

async function resolveAuthenticatedClient(req) {
    const fromSession = req.session?.clientId;
    const fromUserClient = req.user?.clientId;
    const fromUserId = req.user?._id || req.user?.id;
    const candidateId = fromSession || fromUserClient || fromUserId;

    if (!candidateId) return null;
    if (!mongoose.Types.ObjectId.isValid(String(candidateId))) return null;

    return Client.findById(candidateId);
}

async function getNextGlobalInvoiceNumber() {
    const year = new Date().getFullYear();
    const counter = await InvoiceCounter.findByIdAndUpdate(
        `invoice_number_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const sequence = String(counter.seq);
    return `F${year}${sequence}`;
}

// Generar y enviar factura (desde SuperAdmin)
router.post('/generate-and-send/:clientId', auth, async (req, res) => {
    try {
        // Verificar que sea superadmin
        const isSuperAdmin = Boolean(req.session?.isSuperAdmin && req.session?.role === 'admin');
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Solo superadmin puede generar facturas' });
        }

        const { clientId } = req.params;
        
        // Obtener cliente
        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Preparar datos de factura
        const invoiceNumber = await getNextGlobalInvoiceNumber();
        const billingInfo = client.billingInfo || {};
        const recipientEmail = billingInfo.billingEmail || client.owner?.email || '';
        const fiscalAddress = [billingInfo.fiscalAddress, billingInfo.postalCode, billingInfo.city, billingInfo.province, billingInfo.country]
            .filter(Boolean)
            .join(', ');
        const invoiceData = {
            invoiceNumber,
            storeName: client.businessName,
            storeEmail: recipientEmail,
            storePhone: client.owner?.phone || '',
            clientName: billingInfo.legalName || client.businessName,
            clientEmail: recipientEmail,
            clientTaxId: billingInfo.taxId || '',
            clientAddress: fiscalAddress,
            clientId: client._id.toString(),
            date: new Date(),
            billingDayOfMonth: client.billing?.billingDayOfMonth || 5,
            billing: {
                basePlanPrice: client.billing?.basePlanPrice || 39,
                addonPrices: client.billing?.addonPrices || {},
                discount: client.billing?.discount || 0,
                addons: client.features || {}
            },
            period: req.body.period || `${new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}`
        };

        // Calcular total
        let total = invoiceData.billing.basePlanPrice;
        Object.entries(invoiceData.billing.addons).forEach(([addon, enabled]) => {
            if (enabled) {
                total += parseFloat(invoiceData.billing.addonPrices[addon] || 0);
            }
        });
        total = total - invoiceData.billing.discount;
        invoiceData.totalAmount = total;
        invoiceData.basePlanPrice = client.billing?.basePlanPrice || 39;
        invoiceData.addonPrices = client.billing?.addonPrices || {};
        invoiceData.addons = client.features || {};

        // Generar PDF
        const pdfResult = await invoiceService.generateInvoicePDF({
            ...invoiceData,
            storeEmail: process.env.EMAIL_FROM || 'noreply@frescosenvivo.com'
        });

        // Enviar email
        const emailResult = await emailService.sendInvoiceEmail(client, {
            ...invoiceData,
            invoiceUrl: `${process.env.APP_URL}/api/invoices/download/${pdfResult.invoiceId}`
        }, pdfResult.buffer);

        // Guardar registro de factura en cliente (nuevo campo)
        if (!client.invoices) client.invoices = [];
        client.invoices.push({
            invoiceId: pdfResult.invoiceId,
            invoiceNumber: pdfResult.invoiceNumber,
            date: new Date(),
            amount: invoiceData.totalAmount,
            status: 'sent',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
        });
        client.billing.lastPaidAt = new Date();
        await client.save();

        res.json({
            success: true,
            message: emailResult.success ? 'Factura generada y enviada correctamente' : 'Factura generada y guardada, pero no se pudo enviar por email',
            invoiceNumber: pdfResult.invoiceNumber,
            invoiceId: pdfResult.invoiceId,
            emailSent: emailResult.success
        });

    } catch (error) {
        console.error('Error generando factura:', error);
        res.status(500).json({ error: error.message });
    }
});

// Descargar factura (cliente autenticado)
router.get('/download/:invoiceId', auth, async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const isSuperAdmin = Boolean(req.session?.isSuperAdmin && req.session?.role === 'admin');

        // El usuario debe pertenecer al cliente o ser superadmin
        const client = await resolveAuthenticatedClient(req);

        if (!client) {
            return res.status(403).json({ error: 'No tienes acceso a esta factura' });
        }

        // Verificar que la factura pertenezca a este cliente
        const invoiceExists = client.invoices?.some(inv => inv.invoiceId === invoiceId);
        if (!invoiceExists && !isSuperAdmin) {
            return res.status(403).json({ error: 'Factura no encontrada' });
        }

        const invoice = invoiceService.getInvoice(invoiceId);
        if (!invoice) {
            return res.status(404).json({ error: 'Factura no encontrada en servidor' });
        }

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${invoice.filename}"`,
            'Content-Length': invoice.buffer.length
        });

        res.send(invoice.buffer);

    } catch (error) {
        console.error('Error descargando factura:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener historial de facturas del cliente
router.get('/history', auth, async (req, res) => {
    try {
        const client = await resolveAuthenticatedClient(req);

        if (!client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const invoices = (client.invoices || []).map(inv => ({
            invoiceId: inv.invoiceId,
            invoiceNumber: inv.invoiceNumber,
            date: inv.date,
            amount: inv.amount,
            status: inv.status,
            dueDate: inv.dueDate
        }));

        res.json({
            storeName: client.businessName,
            email: client.owner?.email,
            invoices: invoices.sort((a, b) => new Date(b.date) - new Date(a.date))
        });

    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener factura pendiente (admin panel)
router.get('/current', auth, async (req, res) => {
    try {
        const client = await resolveAuthenticatedClient(req);

        if (!client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Calcular factura actual
        let totalToCharge = client.billing?.basePlanPrice || 39;

        Object.entries(client.features || {}).forEach(([addon, enabled]) => {
            if (enabled) {
                const price = client.billing?.addonPrices?.[addon] || 0;
                totalToCharge += parseFloat(price);
            }
        });

        totalToCharge -= (client.billing?.discount || 0);

        res.json({
            storeName: client.businessName,
            billingInfo: client.billingInfo || {},
            billingCycle: {
                dayOfMonth: client.billing?.billingDayOfMonth || 5,
                nextDueDate: client.billing?.nextDueDate,
                lastPaidAt: client.billing?.lastPaidAt
            },
            plan: {
                base: client.billing?.basePlanPrice || 39,
                addons: {
                    seoPro: client.features?.seoPro ? (client.billing?.addonPrices?.seoPro || 19) : 0,
                    premiumDesigns: client.features?.premiumDesigns ? (client.billing?.addonPrices?.premiumDesigns || 29) : 0,
                    reviewsReputation: client.features?.reviewsReputation ? (client.billing?.addonPrices?.reviewsReputation || 15) : 0
                },
                discount: client.billing?.discount || 0
            },
            totalToCharge,
            currency: client.billing?.currency || 'EUR'
        });

    } catch (error) {
        console.error('Error obteniendo factura actual:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener y actualizar datos fiscales del cliente (panel admin cliente)
router.get('/billing-info', auth, async (req, res) => {
    try {
        const client = await resolveAuthenticatedClient(req);
        if (!client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({
            success: true,
            billingInfo: client.billingInfo || {}
        });
    } catch (error) {
        console.error('Error obteniendo datos fiscales:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/billing-info', auth, async (req, res) => {
    try {
        const client = await resolveAuthenticatedClient(req);
        if (!client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const payload = req.body || {};
        client.billingInfo = {
            legalName: String(payload.legalName || '').trim(),
            taxId: String(payload.taxId || '').trim().toUpperCase(),
            billingEmail: String(payload.billingEmail || '').trim().toLowerCase(),
            fiscalAddress: String(payload.fiscalAddress || '').trim(),
            postalCode: String(payload.postalCode || '').trim(),
            city: String(payload.city || '').trim(),
            province: String(payload.province || '').trim(),
            country: String(payload.country || 'España').trim() || 'España'
        };

        await client.save();

        res.json({
            success: true,
            message: 'Datos de facturación guardados',
            billingInfo: client.billingInfo
        });
    } catch (error) {
        console.error('Error guardando datos fiscales:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
