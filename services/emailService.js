const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.from = process.env.EMAIL_FROM || 'noreply@frescosenvivo.com';
    }

    // Inicializar el transportador de email
    async initialize() {
        try {
            // Configuración para diferentes proveedores
            if (process.env.EMAIL_SERVICE === 'gmail') {
                this.transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    }
                });
            } else if (process.env.EMAIL_SERVICE === 'smtp') {
                this.transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT || 587,
                    secure: process.env.SMTP_SECURE === 'true', // true para 465, false para otros puertos
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });
            } else {
                // Por defecto, usar ethereal para desarrollo/testing
                console.log('⚠️  Usando Ethereal Email (solo para desarrollo)');
                const testAccount = await nodemailer.createTestAccount();
                this.transporter = nodemailer.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass
                    }
                });
                console.log('📧 Cuenta de prueba creada:', testAccount.user);
            }

            // Verificar la conexión
            await this.transporter.verify();
            console.log('✅ Servicio de email inicializado correctamente');
            return true;
        } catch (error) {
            console.error('❌ Error inicializando servicio de email:', error.message);
            return false;
        }
    }

    // Enviar email genérico
    async sendEmail({ to, subject, html, text }) {
        if (!this.transporter) {
            await this.initialize();
        }

        try {
            const info = await this.transporter.sendMail({
                from: `"FrescosEnVivo" <${this.from}>`,
                to,
                subject,
                text,
                html
            });

            console.log('✅ Email enviado:', info.messageId);
            
            const response = { success: true, messageId: info.messageId };
            
            // Si es ethereal, incluir URL de preview
            if (process.env.EMAIL_SERVICE !== 'gmail' && process.env.EMAIL_SERVICE !== 'smtp') {
                const previewUrl = nodemailer.getTestMessageUrl(info);
                console.log('📧 Preview URL:', previewUrl);
                response.previewUrl = previewUrl;
            }

            return response;
        } catch (error) {
            console.error('❌ Error enviando email:', error);
            return { success: false, error: error.message };
        }
    }

    // Template: Activación de cuenta (primer acceso - sin contraseña)
    async sendActivationEmail(client, activationUrl) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .info { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px; }
        .button { display: inline-block; padding: 14px 36px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-size: 16px; font-weight: bold; }
        .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 13px; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        .highlight { color: #667eea; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 ¡Bienvenido a FrescosEnVivo!</h1>
        </div>
        <div class="content">
            <h2>Hola ${client.owner.fullName},</h2>
            <p>Tu cuenta en <strong>FrescosEnVivo</strong> para <strong>${client.businessName}</strong> ha sido creada. Solo falta un paso: establece tu contraseña pulsando el botón.</p>

            <div class="info">
                <p><strong>Negocio:</strong> ${client.businessName}</p>
                <p><strong>Usuario:</strong> <span class="highlight">${client.owner.username}</span></p>
                <p><strong>URL de tu tienda:</strong> <a href="http://${client.domain}">http://${client.domain}</a></p>
            </div>

            <center>
                <a href="${activationUrl}" class="button">Activar mi cuenta y establecer contraseña</a>
            </center>

            <div class="warning">
                ⏳ <strong>Este enlace caduca en 72 horas.</strong> Si no lo usas a tiempo, contacta con soporte para que te envíen uno nuevo.
            </div>

            <h3>📦 Tu plan incluye:</h3>
            <ul>
                <li>✅ Hasta ${client.limits.maxCameras} cámaras simultáneas</li>
                <li>✅ Hasta ${client.limits.maxKiosks} kioscos</li>
                <li>✅ Hasta ${client.limits.maxVendors} vendedores</li>
                <li>✅ ${client.limits.maxDailyTickets} tickets diarios</li>
                <li>✅ ${client.limits.storageQuotaMB}MB de almacenamiento</li>
            </ul>

            <p>Si tienes alguna pregunta no dudes en contactarnos. ¡Gracias por confiar en nosotros!</p>
        </div>
        <div class="footer">
            <p>FrescosEnVivo - Sistema Multi-Tenant</p>
            <p>Este es un correo automático, por favor no responder.</p>
        </div>
    </div>
</body>
</html>`;

        const text = `
¡Bienvenido a FrescosEnVivo!

Hola ${client.owner.fullName},

Tu cuenta para ${client.businessName} ha sido creada. Accede al siguiente enlace para establecer tu contraseña:

${activationUrl}

Este enlace caduca en 72 horas.

Usuario: ${client.owner.username}
URL de tu tienda: http://${client.domain}

¡Gracias por confiar en nosotros!
---
FrescosEnVivo - Sistema Multi-Tenant`;

        return await this.sendEmail({
            to: client.owner.email,
            subject: `🎉 Activa tu cuenta en FrescosEnVivo - ${client.businessName}`,
            html,
            text
        });
    }

    // Template: Bienvenida a nuevo cliente (mantenido por compatibilidad, sin contraseña)
    async sendWelcomeEmail(client, password) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .credentials { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        .highlight { color: #667eea; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 ¡Bienvenido a FrescosEnVivo!</h1>
        </div>
        <div class="content">
            <h2>Hola ${client.owner.fullName},</h2>
            <p>Tu cuenta en <strong>FrescosEnVivo</strong> ha sido creada exitosamente.</p>
            
            <div class="credentials">
                <h3>📋 Credenciales de acceso:</h3>
                <p><strong>Negocio:</strong> ${client.businessName}</p>
                <p><strong>URL:</strong> <a href="http://${client.domain}:3000">http://${client.domain}:3000</a></p>
                <p><strong>Usuario:</strong> <span class="highlight">${client.owner.username}</span></p>
            </div>

            <p>Si aún no has establecido tu contraseña, usa el enlace de activación que recibiste o contacta con soporte.</p>

            <h3>📦 Tu plan incluye:</h3>
            <ul>
                <li>✅ Hasta ${client.limits.maxCameras} cámaras simultáneas</li>
                <li>✅ Hasta ${client.limits.maxKiosks} kioscos</li>
                <li>✅ Hasta ${client.limits.maxVendors} vendedores</li>
                <li>✅ ${client.limits.maxDailyTickets} tickets diarios</li>
                <li>✅ ${client.limits.storageQuotaMB}MB de almacenamiento</li>
            </ul>

            <center>
                <a href="http://${client.domain}:3000" class="button">Acceder a mi panel</a>
            </center>

            <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
            <p>¡Gracias por confiar en nosotros!</p>
        </div>
        <div class="footer">
            <p>FrescosEnVivo - Sistema Multi-Tenant</p>
            <p>Este es un correo automático, por favor no responder.</p>
        </div>
    </div>
</body>
</html>
        `;

        const text = `
¡Bienvenido a FrescosEnVivo!

Hola ${client.owner.fullName},

Tu cuenta ha sido creada exitosamente.

Credenciales de acceso:
- Negocio: ${client.businessName}
- URL: http://${client.domain}:3000
- Usuario: ${client.owner.username}

Si aún no has establecido tu contraseña, usa el enlace de activación o contacta con soporte.

¡Gracias por confiar en nosotros!

---
FrescosEnVivo - Sistema Multi-Tenant
        `;

        return await this.sendEmail({
            to: client.owner.email,
            subject: `🎉 Bienvenido a FrescosEnVivo - ${client.businessName}`,
            html,
            text
        });
    }

    // Template: Recuperación de contraseña
    async sendPasswordResetEmail(user, resetToken, clientDomain = 'localhost:3000') {
        const resetUrl = `http://${clientDomain}/reset-password?token=${resetToken}`;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ef4444; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .warning { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔑 Recuperación de contraseña</h1>
        </div>
        <div class="content">
            <h2>Hola ${user.fullName || user.username},</h2>
            <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
            
            <center>
                <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
            </center>

            <p>O copia y pega este enlace en tu navegador:</p>
            <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>

            <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul>
                    <li>Este enlace expirará en 1 hora</li>
                    <li>Si no solicitaste este cambio, ignora este email</li>
                    <li>Tu contraseña actual seguirá siendo válida</li>
                </ul>
            </div>
        </div>
        <div class="footer">
            <p>FrescosEnVivo - Sistema Multi-Tenant</p>
        </div>
    </div>
</body>
</html>
        `;

        const text = `
Recuperación de contraseña

Hola ${user.fullName || user.username},

Hemos recibido una solicitud para restablecer tu contraseña.

Haz clic en el siguiente enlace para restablecer tu contraseña:
${resetUrl}

Este enlace expirará en 1 hora.

Si no solicitaste este cambio, ignora este email.

---
FrescosEnVivo
        `;

        return await this.sendEmail({
            to: user.email,
            subject: '🔑 Recuperación de contraseña - FrescosEnVivo',
            html,
            text
        });
    }

    // Template: Notificación de límite alcanzado
    async sendLimitReachedEmail(client, limitType, currentValue, maxValue) {
        const limitNames = {
            maxDailyTickets: 'tickets diarios',
            maxCameras: 'cámaras',
            maxKiosks: 'kioscos',
            maxVendors: 'vendedores',
            storageQuotaMB: 'almacenamiento'
        };

        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Límite alcanzado</h1>
        </div>
        <div class="content">
            <h2>Hola ${client.owner.fullName},</h2>
            
            <div class="alert">
                <p><strong>Has alcanzado el límite de ${limitNames[limitType]}</strong></p>
                <p>Límite actual: ${currentValue} / ${maxValue}</p>
            </div>

            <p>Para continuar usando todas las funcionalidades de FrescosEnVivo, considera actualizar tu plan.</p>

            <center>
                <a href="http://${client.domain}:3000" class="button">Ver mi plan</a>
            </center>
        </div>
    </div>
</body>
</html>
        `;

        return await this.sendEmail({
            to: client.owner.email,
            subject: `⚠️ Límite alcanzado: ${limitNames[limitType]} - ${client.businessName}`,
            html,
            text: `Has alcanzado el límite de ${limitNames[limitType]} (${currentValue}/${maxValue})`
        });
    }

    // Template: Notificación de suscripción por vencer
    async sendSubscriptionExpiringEmail(client, daysRemaining) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⏰ Tu suscripción está por vencer</h1>
        </div>
        <div class="content">
            <h2>Hola ${client.owner.fullName},</h2>
            <p>Tu suscripción de <strong>${client.businessName}</strong> vencerá en <strong>${daysRemaining} días</strong>.</p>
            <p>Fecha de vencimiento: ${new Date(client.subscriptionEndDate).toLocaleDateString('es-ES')}</p>
            
            <center>
                <a href="http://${client.domain}:3000" class="button">Renovar suscripción</a>
            </center>
        </div>
    </div>
</body>
</html>
        `;

        return await this.sendEmail({
            to: client.owner.email,
            subject: `⏰ Tu suscripción vence en ${daysRemaining} días - ${client.businessName}`,
            html,
            text: `Tu suscripción vencerá en ${daysRemaining} días.`
        });
    }

    // Template: Credenciales de nuevo usuario
    async sendUserCredentialsEmail(user, password, clientDomain = 'localhost:3000') {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .credentials-box { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px; font-family: 'Courier New', monospace; }
        .credential-item { margin: 12px 0; }
        .credential-label { font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: bold; }
        .credential-value { font-size: 16px; color: #1f2937; background: #f3f4f6; padding: 10px 12px; border-radius: 4px; word-break: break-all; margin-top: 4px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-size: 16px; font-weight: bold; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .warning-title { color: #92400e; font-weight: bold; margin-bottom: 8px; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        .role-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>👤 Tu cuenta ha sido creada</h1>
        </div>
        <div class="content">
            <h2>Hola ${user.fullName},</h2>
            <p>Se ha creado tu cuenta en <strong>FrescosEnVivo</strong> como 
            <span class="role-badge">${user.role === 'admin' ? '👨‍💼 Administrador' : '👥 Empleado'}</span></p>
            
            <div class="credentials-box">
                <h3 style="margin-top: 0; color: #667eea;">🔐 Credenciales de acceso:</h3>
                
                <div class="credential-item">
                    <div class="credential-label">🌐 URL de la plataforma</div>
                    <div class="credential-value"><a href="http://${clientDomain}" style="color: #667eea; text-decoration: none;">http://${clientDomain}</a></div>
                </div>
                
                <div class="credential-item">
                    <div class="credential-label">👤 Usuario</div>
                    <div class="credential-value">${user.username}</div>
                </div>
                
                <div class="credential-item">
                    <div class="credential-label">🔑 Contraseña</div>
                    <div class="credential-value">${password}</div>
                </div>
            </div>

            <div class="warning">
                <div class="warning-title">⚠️ Por tu seguridad:</div>
                <ul style="margin: 8px 0; padding-left: 20px;">
                    <li>No compartas estas credenciales con nadie</li>
                    <li>Guarda esta información en un lugar seguro</li>
                    <li>Se recomienda cambiar la contraseña después del primer login</li>
                    <li>Si no reconoces esta solicitud, contacta con el administrador</li>
                </ul>
            </div>

            <center>
                <a href="http://${clientDomain}" class="button">Acceder a FrescosEnVivo</a>
            </center>

            <p style="color: #6b7280; font-size: 14px;">
                Si tienes alguna pregunta o problema para acceder, contacta con el administrador de tu negocio.
            </p>
        </div>
        <div class="footer">
            <p>FrescosEnVivo - Sistema Multi-Tenant</p>
            <p>Este es un correo automático, por favor no responder.</p>
        </div>
    </div>
</body>
</html>
        `;

        const text = `
Tu cuenta en FrescosEnVivo ha sido creada

Hola ${user.fullName},

Se ha creado tu cuenta con el rol de ${user.role === 'admin' ? 'Administrador' : 'Empleado'}.

CREDENCIALES DE ACCESO:
- URL: http://${clientDomain}
- Usuario: ${user.username}
- Contraseña: ${password}

IMPORTANTE:
- No compartas estas credenciales con nadie
- Guarda esta información en un lugar seguro
- Se recomienda cambiar la contraseña después del primer login
- Si no reconoces esta solicitud, contacta con el administrador

¡Gracias por usar FrescosEnVivo!

---
FrescosEnVivo - Sistema Multi-Tenant
        `;

        return await this.sendEmail({
            to: user.email,
            subject: `🎉 Tu cuenta en FrescosEnVivo está lista - ${user.fullName}`,
            html,
            text
        });
    }

    // Template: Envío de factura mensual
    async sendInvoiceEmail(client, invoiceData, pdfBuffer) {
        const recipientEmail =
            client?.billingInfo?.billingEmail ||
            client?.owner?.email ||
            client?.email ||
            client?.contact?.email ||
            '';

        const displayName =
            client?.billingInfo?.legalName ||
            client?.businessName ||
            client?.storeName ||
            'Cliente';

        const basePlan = parseFloat(invoiceData.basePlanPrice || invoiceData.billing?.basePlanPrice || 39);
        const discount = parseFloat(invoiceData.discount || invoiceData.billing?.discount || 0);
        const total = parseFloat(invoiceData.totalAmount || 0);
        const nextDueDate = invoiceData.nextDueDate || 'Segun tu calendario de facturacion';
        const invoiceDate = new Date().toLocaleDateString('es-ES');

        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; padding: 0; background: #edf4ef; font-family: Arial, sans-serif; color: #173126; }
        .wrap { width: 100%; padding: 24px 0; }
        .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #d7e4dc; }
        .header { background: linear-gradient(135deg, #1A6B3C 0%, #0f4c2f 100%); color: white; padding: 26px 30px; }
        .brand { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.9; margin-bottom: 8px; }
        .title { font-size: 28px; font-weight: bold; margin: 0 0 8px; }
        .subtitle { font-size: 14px; margin: 0; opacity: 0.92; }
        .content { padding: 26px 30px 30px; background: #ffffff; }
        .hello { margin: 0 0 14px; font-size: 16px; }
        .grid { width: 100%; border-collapse: separate; border-spacing: 10px; margin: 10px 0 20px; }
        .card { background: #f3f8f5; border: 1px solid #dce9e1; border-radius: 10px; padding: 14px; vertical-align: top; }
        .card h4 { margin: 0 0 8px; color: #1A6B3C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
        .card p { margin: 4px 0; font-size: 13px; color: #1c3b2d; }
        .totals { background: #f8fbf9; border: 1px solid #dce9e1; border-radius: 10px; padding: 12px 14px; margin: 0 0 18px; }
        .totals table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .totals td { padding: 5px 0; }
        .totals tr:last-child td { border-top: 1px solid #d7e4dc; padding-top: 10px; font-weight: bold; color: #0f4c2f; font-size: 16px; }
        .detail-list { margin: 0 0 20px; padding-left: 20px; }
        .detail-list li { margin: 6px 0; font-size: 14px; }
        .note { margin: 0 0 20px; background: #eef7f1; border-left: 4px solid #1A6B3C; border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #305443; }
        .cta-wrap { text-align: center; margin: 24px 0 10px; }
        .action-btn { display: inline-block; background: #1A6B3C; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #dce9e1; color: #6f8378; font-size: 12px; text-align: center; }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="container">
            <div class="header">
                <div class="brand">FrescosEnVivo Billing</div>
                <h1 class="title">Factura lista</h1>
                <p class="subtitle">Adjuntamos tu factura mensual con detalle de servicios.</p>
            </div>
            <div class="content">
                <p class="hello">Hola <strong>${displayName}</strong>,</p>

                <table class="grid" role="presentation">
                    <tr>
                        <td class="card" width="50%">
                            <h4>Datos factura</h4>
                            <p><strong>Numero:</strong> ${invoiceData.invoiceNumber}</p>
                            <p><strong>Fecha:</strong> ${invoiceDate}</p>
                            <p><strong>Periodo:</strong> ${invoiceData.period || 'Mes actual'}</p>
                        </td>
                        <td class="card" width="50%">
                            <h4>Cobro</h4>
                            <p><strong>Proxima fecha:</strong> ${nextDueDate}</p>
                            <p><strong>Estado:</strong> Activa</p>
                            <p><strong>Moneda:</strong> EUR</p>
                        </td>
                    </tr>
                </table>

                <div class="totals">
                    <table role="presentation">
                        <tr><td>Plan base</td><td align="right">EUR ${basePlan.toFixed(2)}</td></tr>
                        ${invoiceData.addons?.seoPro ? `<tr><td>Add-on SEO Pro</td><td align="right">EUR ${parseFloat(invoiceData.addonPrices?.seoPro || 19).toFixed(2)}</td></tr>` : ''}
                        ${invoiceData.addons?.premiumDesigns ? `<tr><td>Add-on Disenos Premium</td><td align="right">EUR ${parseFloat(invoiceData.addonPrices?.premiumDesigns || 29).toFixed(2)}</td></tr>` : ''}
                        ${invoiceData.addons?.reviewsReputation ? `<tr><td>Add-on Reviews y Reputacion</td><td align="right">EUR ${parseFloat(invoiceData.addonPrices?.reviewsReputation || 15).toFixed(2)}</td></tr>` : ''}
                        ${discount > 0 ? `<tr><td>Descuento</td><td align="right">- EUR ${discount.toFixed(2)}</td></tr>` : ''}
                        <tr><td>Total</td><td align="right">EUR ${total.toFixed(2)}</td></tr>
                    </table>
                </div>

                <ul class="detail-list">
                    <li>Factura en PDF adjunta en este correo.</li>
                    <li>Puedes descargarla tambien desde tu panel de cliente.</li>
                    <li>Conserva este email para control administrativo.</li>
                </ul>

                <p class="note"><strong>Importante:</strong> Tu acceso se mantiene activo mientras la cuenta este al dia.</p>

                <div class="cta-wrap">
                    <a href="${invoiceData.invoiceUrl || '#'}" class="action-btn">Descargar factura PDF</a>
                </div>

                <div class="footer">
                    <p>Si tienes dudas, escribe a <strong>billing@frescosenvivo.com</strong>.</p>
                    <p>© ${new Date().getFullYear()} FrescosEnVivo</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
`;

        const text = `
Factura de FrescosEnVivo
========================

Hola ${displayName},

Tu factura mensual está lista.

Factura Nº: ${invoiceData.invoiceNumber}
Fecha: ${invoiceDate}
Período: ${invoiceData.period || 'Mes actual'}
Proxima fecha de cargo: ${nextDueDate}

DETALLE:
- Plan Base: EUR ${basePlan.toFixed(2)}
${invoiceData.addons?.seoPro ? `- Add-on SEO Pro: EUR ${parseFloat(invoiceData.addonPrices?.seoPro || 19).toFixed(2)}` : ''}
${invoiceData.addons?.premiumDesigns ? `- Add-on Disenos Premium: EUR ${parseFloat(invoiceData.addonPrices?.premiumDesigns || 29).toFixed(2)}` : ''}
${invoiceData.addons?.reviewsReputation ? `- Add-on Reviews y Reputacion: EUR ${parseFloat(invoiceData.addonPrices?.reviewsReputation || 15).toFixed(2)}` : ''}
${discount > 0 ? `- Descuento: - EUR ${discount.toFixed(2)}` : ''}

TOTAL A PAGAR: EUR ${total.toFixed(2)}

Factura PDF adjunta y disponible tambien en tu panel de control.

Si tienes preguntas sobre tu factura, contactanos en billing@frescosenvivo.com

© ${new Date().getFullYear()} FrescosEnVivo
`;

        if (!this.transporter) {
            await this.initialize();
        }

        if (!recipientEmail) {
            return { success: false, error: 'No hay email de facturación configurado para este cliente' };
        }

        try {
            const info = await this.transporter.sendMail({
                from: `"FrescosEnVivo Billing" <${this.from}>`,
                to: recipientEmail,
                subject: `📄 Tu factura de FrescosEnVivo - ${invoiceData.invoiceNumber}`,
                html,
                text,
                attachments: [
                    {
                        filename: `factura_${invoiceData.invoiceNumber}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            });

            console.log('✅ Factura enviada:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Error enviando factura:', error);
            return { success: false, error: error.message };
        }
    }

    // Template: Envío de propuesta comercial a un cliente en estado "propuesta"
    async sendProposalEmail(client, proposalDetails = {}, baseUrl = '') {
        const recipientEmail = client?.billingInfo?.billingEmail || client?.owner?.email || '';
        const acceptUrl = `${baseUrl}/propuesta/aceptar/${client._id}`;
        const recipientName =
            client?.billingInfo?.legalName ||
            client?.owner?.fullName ||
            client?.businessName ||
            'estimado cliente';

        const {
            planLabel = client.plan || 'basico',
            basePlanPrice,
            discount = client.billing?.discount || 0,
            addonLines = [],
            notes = client.notes || '',
            senderName = 'El equipo de FrescosEnVivo'
        } = proposalDetails;

        const planPrices = { basico: 39, profesional: 79, empresarial: 149, personalizado: 249 };
        const resolvedBasePrice =
            basePlanPrice !== undefined
                ? Number(basePlanPrice)
                : (client.billing?.basePlanPrice || planPrices[planLabel] || 39);

        const discountAmount = Math.round(resolvedBasePrice * (Number(discount) / 100) * 100) / 100;
        const subtotal = addonLines.reduce((sum, a) => sum + Number(a.price || 0), resolvedBasePrice);
        const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

        const planNames = { basico: 'Básico', profesional: 'Profesional', empresarial: 'Empresarial', personalizado: 'Personalizado' };
        const planName = planNames[planLabel] || planLabel;

        // Características incluidas en cada plan
        const PLAN_FEATURES = {
            basico: {
                color: '#2563eb',
                bg: '#eff6ff',
                features: [
                    '🛒 Tienda online con catálogo de productos',
                    '📷 Hasta 2 cámaras de videovigilancia',
                    '👤 1 usuario propietario',
                    '📱 Tienda adaptada a móvil y tablet',
                    '🔒 Panel de administración seguro',
                    '📧 Soporte por email'
                ]
            },
            profesional: {
                color: '#7c3aed',
                bg: '#f5f3ff',
                features: [
                    '🛒 Tienda online con catálogo avanzado',
                    '📷 Hasta 4 cámaras de videovigilancia',
                    '👥 Hasta 5 usuarios / vendedores',
                    '📱 Tienda adaptada a móvil y tablet',
                    '🔒 Panel de administración seguro',
                    '📊 Estadísticas e informes de ventas',
                    '⚡ Soporte prioritario'
                ]
            },
            empresarial: {
                color: '#b45309',
                bg: '#fffbeb',
                features: [
                    '🛒 Tienda online con catálogo ilimitado',
                    '📷 Hasta 8 cámaras de videovigilancia',
                    '👥 Usuarios y vendedores ilimitados',
                    '📱 Tienda adaptada a móvil y tablet',
                    '🔒 Panel de administración avanzado',
                    '📊 Estadísticas, informes y exportación',
                    '🌐 Dominio personalizado incluido',
                    '🚀 Soporte dedicado y configuración asistida'
                ]
            },
            personalizado: {
                color: '#1A6B3C',
                bg: '#f0fdf4',
                features: [
                    '✨ Todo lo del plan Empresarial',
                    '⚙️ Funcionalidades a medida',
                    '🔗 Integraciones con sistemas externos',
                    '🎨 Diseño personalizado de tienda',
                    '📞 Soporte telefónico directo',
                    '🤝 Account manager asignado'
                ]
            }
        };

        const planMeta = PLAN_FEATURES[planLabel] || PLAN_FEATURES.basico;
        const featuresHtml = `
            <div style="background:${planMeta.bg};border:1px solid ${planMeta.color}33;border-radius:10px;padding:20px 22px;margin:24px 0;">
                <p style="margin:0 0 14px;font-weight:bold;color:${planMeta.color};font-size:15px;">📦 ¿Qué incluye el Plan ${planName}?</p>
                <ul style="margin:0;padding:0;list-style:none;">
                    ${planMeta.features.map(f => `<li style="padding:5px 0;font-size:14px;color:#374151;">${f}</li>`).join('')}
                </ul>
            </div>`;

        const addonFeaturesMap = {
            'SEO Pro': ['🔍 Posicionamiento en Google optimizado', '📝 Metaetiquetas y URLs amigables automáticas', '📈 Informe mensual de visibilidad'],
            'Diseños Premium': ['🎨 Temas visuales exclusivos para tu tienda', '🖼️ Banners y portadas personalizadas', '✨ Animaciones y efectos visuales'],
            'Reputación & Reseñas': ['⭐ Sistema de valoraciones de clientes', '💬 Gestión de reseñas y respuestas', '📣 Widget de reputación en la tienda']
        };

        const addonFeaturesHtml = addonLines.length > 0 ? addonLines.map(a => {
            const feats = addonFeaturesMap[a.label];
            if (!feats) return '';
            return `
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;margin:12px 0;">
                <p style="margin:0 0 10px;font-weight:bold;color:#374151;font-size:14px;">➕ ${a.label}</p>
                <ul style="margin:0;padding:0;list-style:none;">
                    ${feats.map(f => `<li style="padding:4px 0;font-size:13px;color:#6b7280;">${f}</li>`).join('')}
                </ul>
            </div>`;
        }).join('') : '';

        const addonRowsHtml = addonLines.map(a => `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${a.label}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(a.price).toFixed(2)} €/mes</td>
            </tr>`).join('');

        const discountRowHtml = discount > 0 ? `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#059669;">Descuento (${discount}%)</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#059669;">-${discountAmount.toFixed(2)} €/mes</td>
            </tr>` : '';

        const notesHtml = notes ? `
            <div style="background:#f9fafb;border-left:4px solid #667eea;padding:14px 18px;border-radius:4px;margin:20px 0;">
                <p style="margin:0;font-size:14px;color:#374151;white-space:pre-line;">${notes}</p>
            </div>` : '';

        const subscriptionEndDate = client.subscriptionEndDate
            ? new Date(client.subscriptionEndDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
            : null;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin:0; padding:0; background:#edf4ef; font-family:Arial,sans-serif; color:#173126; }
        .wrap { width:100%; padding:24px 0; }
        .container { max-width:620px; margin:0 auto; background:#fff; border-radius:14px; overflow:hidden; border:1px solid #d7e4dc; }
        .header { background:linear-gradient(135deg,#1A6B3C 0%,#0f4c2f 100%); color:white; padding:28px 30px; text-align:center; }
        .header h1 { margin:0 0 6px; font-size:26px; }
        .header p { margin:0; font-size:14px; opacity:.9; }
        .content { padding:28px 30px; }
        .greeting { font-size:16px; color:#374151; margin-bottom:18px; }
        table { width:100%; border-collapse:collapse; margin:20px 0; }
        th { background:#f3f4f6; padding:10px 12px; text-align:left; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; }
        tr:last-child td { border-bottom:none !important; }
        .total-row td { padding:12px; font-weight:bold; font-size:16px; background:#f9fafb; }
        .cta { text-align:center; margin:28px 0 10px; }
        .cta a { display:inline-block; background:#1A6B3C; color:white; text-decoration:none; padding:14px 36px; border-radius:8px; font-size:15px; font-weight:bold; }
        .footer { text-align:center; color:#9ca3af; font-size:12px; padding:18px 30px; border-top:1px solid #e5e7eb; }
    </style>
</head>
<body>
<div class="wrap">
<div class="container">
    <div class="header">
        <h1>📋 Propuesta comercial</h1>
        <p>FrescosEnVivo — Tienda online para tu negocio</p>
    </div>
    <div class="content">
        <p class="greeting">Hola <strong>${recipientName}</strong>,</p>
        <p style="color:#374151;line-height:1.7;">
            Te enviamos la propuesta para poner en marcha tu tienda online con <strong>FrescosEnVivo</strong>.
            A continuación encontrarás el detalle de servicios y precio mensual.
        </p>

        <table>
            <thead>
                <tr>
                    <th>Servicio</th>
                    <th style="text-align:right;">Precio/mes</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Plan ${planName}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${resolvedBasePrice.toFixed(2)} €/mes</td>
                </tr>
                ${addonRowsHtml}
                ${discountRowHtml}
                <tr class="total-row">
                    <td>Total</td>
                    <td style="text-align:right;">${total.toFixed(2)} €/mes</td>
                </tr>
            </tbody>
        </table>

        ${subscriptionEndDate ? `<p style="font-size:13px;color:#6b7280;">📅 Fecha de inicio prevista: <strong>${subscriptionEndDate}</strong></p>` : ''}

        ${featuresHtml}
        ${addonFeaturesHtml}

        ${notesHtml}

        <p style="color:#374151;line-height:1.7;">
            Si tienes cualquier pregunta o quieres ajustar algún detalle, responde a este email y te atendemos enseguida.
        </p>

        <div class="cta">
            <a href="${acceptUrl}">✅ Aceptar propuesta</a>
        </div>
    </div>
    <div class="footer">
        <p><strong>FrescosEnVivo</strong> · Propuesta preparada por ${senderName}</p>
        <p>Este mensaje se ha enviado a ${recipientEmail}</p>
    </div>
</div>
</div>
</body>
</html>`;

        const text = `
Propuesta comercial - FrescosEnVivo

Hola ${recipientName},

Te enviamos la propuesta para tu tienda online con FrescosEnVivo.

Plan ${planName}: ${resolvedBasePrice.toFixed(2)} €/mes
${addonLines.map(a => `${a.label}: ${Number(a.price).toFixed(2)} €/mes`).join('\n')}
${discount > 0 ? `Descuento (${discount}%): -${discountAmount.toFixed(2)} €/mes` : ''}
Total: ${total.toFixed(2)} €/mes

¿Qué incluye el Plan ${planName}?
${planMeta.features.join('\n')}
${addonLines.length > 0 ? '\nAddons incluidos:\n' + addonLines.map(a => {
    const feats = addonFeaturesMap[a.label];
    return `\n${a.label}:\n${feats ? feats.join('\n') : ''}`;
}).join('\n') : ''}

${subscriptionEndDate ? `Fecha de inicio prevista: ${subscriptionEndDate}` : ''}
${notes ? `\nNotas:\n${notes}` : ''}

Para aceptar o consultar cualquier duda, responde a este email.

---
FrescosEnVivo · Preparada por ${senderName}`;

        return await this.sendEmail({
            to: recipientEmail,
            subject: `📋 Propuesta comercial FrescosEnVivo — ${client.businessName}`,
            html,
            text
        });
    }
}

// Exportar instancia única (Singleton)
const emailService = new EmailService();
module.exports = emailService;
