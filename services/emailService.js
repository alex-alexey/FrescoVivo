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
            
            // Si es ethereal, mostrar URL de preview
            if (process.env.EMAIL_SERVICE !== 'gmail' && process.env.EMAIL_SERVICE !== 'smtp') {
                console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
            }

            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Error enviando email:', error);
            return { success: false, error: error.message };
        }
    }

    // Template: Bienvenida a nuevo cliente
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
                <p><strong>Contraseña:</strong> <span class="highlight">${password}</span></p>
            </div>

            <p>⚠️ <strong>Importante:</strong> Por seguridad, te recomendamos cambiar tu contraseña después del primer inicio de sesión.</p>

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
- Contraseña: ${password}

Por seguridad, te recomendamos cambiar tu contraseña después del primer inicio de sesión.

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
}

// Exportar instancia única (Singleton)
const emailService = new EmailService();
module.exports = emailService;
