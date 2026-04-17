const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class InvoiceService {
    constructor() {
        this.invoicePath = path.join(__dirname, '../invoices');
        this.ensureInvoiceDir();
    }

    ensureInvoiceDir() {
        if (!fs.existsSync(this.invoicePath)) {
            fs.mkdirSync(this.invoicePath, { recursive: true });
        }
    }

    /**
     * Generar factura en PDF
     * @param {Object} invoiceData - Datos de la factura
     * @returns {Object} {invoiceId, filename, buffer}
     */
    async generateInvoicePDF(invoiceData) {
        const invoiceId = uuidv4();
        const invoiceNumber = invoiceData.invoiceNumber || `FAC-${Date.now()}`;
        const filename = `factura_${invoiceNumber}_${invoiceId}.pdf`;
        const filepath = path.join(this.invoicePath, filename);

        const basePlanPrice = parseFloat(invoiceData.billing?.basePlanPrice || 39);
        const addons = invoiceData.billing?.addons || {};
        const addonPrices = invoiceData.billing?.addonPrices || {};
        const discount = parseFloat(invoiceData.billing?.discount || 0);
        const ivaRate = 0.21;

        const rows = [
            {
                concept: 'Plan Base',
                description: 'Suscripcion mensual FrescosEnVivo',
                quantity: 1,
                total: basePlanPrice
            }
        ];

        if (addons.seoPro) {
            rows.push({
                concept: 'Add-on SEO Pro',
                description: 'SEO avanzado y posicionamiento',
                quantity: 1,
                total: parseFloat(addonPrices.seoPro || 19)
            });
        }

        if (addons.premiumDesigns) {
            rows.push({
                concept: 'Add-on Disenos Premium',
                description: 'Plantillas y personalizaciones premium',
                quantity: 1,
                total: parseFloat(addonPrices.premiumDesigns || 29)
            });
        }

        if (addons.reviewsReputation) {
            rows.push({
                concept: 'Add-on Reviews',
                description: 'Modulo de resenas y reputacion',
                quantity: 1,
                total: parseFloat(addonPrices.reviewsReputation || 15)
            });
        }

        const subtotal = rows.reduce((sum, row) => sum + row.total, 0);
        const subtotalAfterDiscount = Math.max(subtotal - discount, 0);
        const ivaAmount = subtotalAfterDiscount * ivaRate;
        const total = subtotalAfterDiscount + ivaAmount;

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 40
            });

            const writeStream = fs.createWriteStream(filepath);
            const buffers = [];

            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => {
                const buffer = Buffer.concat(buffers);
                resolve({
                    invoiceId,
                    invoiceNumber,
                    filename,
                    filepath,
                    buffer
                });
            });

            doc.on('error', reject);
            writeStream.on('error', reject);

            const colors = {
                primary: '#1A6B3C',
                dark: '#0F2A1D',
                light: '#F2F7F4',
                muted: '#6B7280',
                border: '#D9E6DE'
            };

            const left = 40;
            const right = 555;
            const contentWidth = right - left;

            // Header principal
            doc.rect(0, 0, doc.page.width, 120).fill(colors.primary);

            const logoX = left;
            const logoY = 24;
            const logoSize = 60;
            const textStartX = left + logoSize + 14;

            // FrescosEnVivo logo brand
            doc.roundedRect(logoX, logoY, logoSize, logoSize, 10).fill('#FFFFFF');
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, 22).fill(colors.primary);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, 20).fill('#FFFFFF');
            
            // Draw smiling fish icon (two eyes and mouth)
            doc.circle(logoX + logoSize / 2 - 5, logoY + logoSize / 2 - 8, 3.5).fill(colors.primary);
            doc.circle(logoX + logoSize / 2 + 5, logoY + logoSize / 2 - 8, 3.5).fill(colors.primary);
            doc.path(`M ${logoX + logoSize / 2 - 6} ${logoY + logoSize / 2 + 4} Q ${logoX + logoSize / 2} ${logoY + logoSize / 2 + 10} ${logoX + logoSize / 2 + 6} ${logoY + logoSize / 2 + 4}`).stroke(colors.primary);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2 + 14, 2).fill(colors.primary);

            doc.fillColor('#FFFFFF')
                .font('Helvetica-Bold')
                .fontSize(24)
                .text('FACTURA', textStartX, 28);

            doc.font('Helvetica')
                .fontSize(10)
                .text(invoiceData.storeName || 'FrescosEnVivo', textStartX, 62)
                .text(invoiceData.storeEmail || 'info@frescosenvivo.com', textStartX, 78)
                .text(invoiceData.storePhone || '', textStartX, 92);

            // Tarjeta datos factura
            const cardX = 350;
            const cardY = 22;
            const cardW = 185;
            const cardH = 82;
            doc.roundedRect(cardX, cardY, cardW, cardH, 8).fill('#FFFFFF');
            doc.fillColor(colors.dark)
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('Numero', cardX + 12, cardY + 12)
                .font('Helvetica')
                .fontSize(11)
                .text(invoiceNumber, cardX + 12, cardY + 27)
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('Fecha', cardX + 12, cardY + 45)
                .font('Helvetica')
                .fontSize(11)
                .text(this.formatDate(invoiceData.date || new Date()), cardX + 12, cardY + 60);

            // Bloques de emisor y cliente
            const infoTop = 145;
            const boxH = 100;
            const boxGap = 16;
            const boxW = (contentWidth - boxGap) / 2;

            doc.roundedRect(left, infoTop, boxW, boxH, 8).fill(colors.light);
            doc.roundedRect(left + boxW + boxGap, infoTop, boxW, boxH, 8).fill(colors.light);

            doc.fillColor(colors.dark)
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('EMISOR', left + 12, infoTop + 12)
                .font('Helvetica')
                .fontSize(10)
                .text(invoiceData.storeName || 'FrescosEnVivo', left + 12, infoTop + 30)
                .text(invoiceData.storeEmail || 'info@frescosenvivo.com', left + 12, infoTop + 46)
                .text(invoiceData.storePhone || ' ', left + 12, infoTop + 62);

            doc.fillColor(colors.dark)
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('FACTURADO A', left + boxW + boxGap + 12, infoTop + 12)
                .font('Helvetica')
                .fontSize(10)
                .text(invoiceData.clientName || 'N/A', left + boxW + boxGap + 12, infoTop + 30)
                .text(invoiceData.clientEmail || 'N/A', left + boxW + boxGap + 12, infoTop + 46)
                .text(`NIF/CIF: ${invoiceData.clientTaxId || 'N/A'}`, left + boxW + boxGap + 12, infoTop + 62)
                .text(invoiceData.clientAddress || ' ', left + boxW + boxGap + 12, infoTop + 78, { width: boxW - 24 });

            // Tabla de conceptos
            let tableY = infoTop + boxH + 26;
            const colConcept = left + 10;
            const colDesc = left + 160;
            const colQty = left + 400;
            const colTotal = left + 455;

            doc.roundedRect(left, tableY, contentWidth, 28, 6).fill(colors.primary);
            doc.fillColor('#FFFFFF')
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('Concepto', colConcept, tableY + 9)
                .text('Descripcion', colDesc, tableY + 9)
                .text('Cant.', colQty, tableY + 9)
                .text('Total', colTotal, tableY + 9);

            tableY += 28;
            rows.forEach((row, index) => {
                const rowH = 24;
                const rowColor = index % 2 === 0 ? '#FFFFFF' : '#F8FBF9';
                doc.rect(left, tableY, contentWidth, rowH).fill(rowColor);
                doc.fillColor(colors.dark)
                    .font('Helvetica')
                    .fontSize(10)
                    .text(row.concept, colConcept, tableY + 7)
                    .text(row.description, colDesc, tableY + 7, { width: 220, ellipsis: true })
                    .text(String(row.quantity), colQty, tableY + 7)
                    .text(`EUR ${row.total.toFixed(2)}`, colTotal, tableY + 7);
                tableY += rowH;
            });

            doc.rect(left, infoTop + boxH + 26, contentWidth, tableY - (infoTop + boxH + 26)).strokeColor(colors.border).lineWidth(1).stroke();

            // Resumen de importes
            const summaryW = 210;
            const summaryX = right - summaryW;
            const summaryY = tableY + 16;
            const totalLineY = summaryY + (discount > 0 ? 62 : 44);

            doc.roundedRect(summaryX, summaryY, summaryW, 94, 8).fill('#F7FBF8');
            doc.fillColor(colors.dark)
                .font('Helvetica')
                .fontSize(10)
                .text('Subtotal', summaryX + 12, summaryY + 14)
                .text(`EUR ${subtotal.toFixed(2)}`, summaryX + 125, summaryY + 14);

            let lineY = summaryY + 30;
            if (discount > 0) {
                doc.text('Descuento', summaryX + 12, lineY)
                    .text(`- EUR ${discount.toFixed(2)}`, summaryX + 125, lineY);
                lineY += 16;
            }

            doc.text('IVA (21%)', summaryX + 12, lineY)
                .text(`EUR ${ivaAmount.toFixed(2)}`, summaryX + 125, lineY);

            doc.moveTo(summaryX + 12, totalLineY)
                .lineTo(summaryX + summaryW - 12, totalLineY)
                .strokeColor(colors.border)
                .stroke();

            doc.font('Helvetica-Bold')
                .fontSize(11)
                .text('TOTAL', summaryX + 12, totalLineY + 10)
                .text(`EUR ${total.toFixed(2)}`, summaryX + 125, totalLineY + 10);

            // Bloque legal y footer
            const notesY = summaryY + 112;
            doc.fillColor(colors.muted)
                .font('Helvetica')
                .fontSize(9)
                .text(
                    `Condiciones de pago: Factura mensual. El cargo se realiza el dia ${invoiceData.billingDayOfMonth || 5} de cada mes.`,
                    left,
                    notesY,
                    { width: 330 }
                )
                .text(
                    'En caso de impago, el acceso a la tienda puede quedar suspendido automaticamente.',
                    left,
                    notesY + 14,
                    { width: 330 }
                );

            doc.moveTo(left, doc.page.height - 60)
                .lineTo(right, doc.page.height - 60)
                .strokeColor(colors.border)
                .stroke();

            doc.fillColor(colors.muted)
                .font('Helvetica')
                .fontSize(8)
                .text('FrescosEnVivo | Facturacion', left, doc.page.height - 50)
                .text(`Generada: ${new Date().toLocaleString('es-ES')}`, left, doc.page.height - 38)
                .text(`ID tecnico: ${invoiceId}`, left, doc.page.height - 26);

            doc.pipe(writeStream);
            doc.end();
        });
    }

    /**
     * Formatear fecha
     */
    formatDate(date) {
        if (typeof date === 'string') date = new Date(date);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Obtener factura existente
     */
    getInvoice(invoiceId) {
        const dir = fs.readdirSync(this.invoicePath);
        const file = dir.find(f => f.includes(invoiceId));
        
        if (!file) return null;

        const filepath = path.join(this.invoicePath, file);
        return {
            filename: file,
            filepath,
            buffer: fs.readFileSync(filepath)
        };
    }

    /**
     * Listar facturas de un cliente
     */
    getClientInvoices(clientId) {
        // Esto requeriría guardar una base de datos de facturas
        // Por ahora, retorna un array vacío
        return [];
    }

    /**
     * Eliminar factura
     */
    deleteInvoice(invoiceId) {
        const invoice = this.getInvoice(invoiceId);
        if (invoice && fs.existsSync(invoice.filepath)) {
            fs.unlinkSync(invoice.filepath);
            return true;
        }
        return false;
    }
}

module.exports = new InvoiceService();
