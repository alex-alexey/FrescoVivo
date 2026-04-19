# Superadmin Roadmap

## Objetivo
Cerrar el panel de Superadmin para operar FrescosEnVivo en produccion: alta de clientes, facturacion, dashboard operativo, seguridad y soporte.

## Fase 1 (Must Have)
- Auditoria completa de acciones criticas.
- Dashboard con metricas clave (MRR, vencidos, estado clientes, actividad reciente).
- Gestion robusta de clientes (alta, suspension, activacion, baja logica).
- Facturacion base (estado cobro, historial, marcar pagado, envio de factura).
- Seguridad minima operativa (session hardening, rate limit en auth, trazabilidad).

## Fase 2 (Should Have)
- Roles internos para superadmin (owner, billing, soporte, readonly).
- Automatizaciones de cobro y recordatorios.
- Centro de actividad/alertas internas.
- Soporte 360 por cliente (actividad, facturas, incidencias).

## Fase 3 (Could Have)
- KPIs avanzados (churn, ARPA, cohortes).
- Integraciones contables/exportacion.
- Backups/restore por tenant con flujos guiados.
- Alertas proactivas por riesgo operativo.

## Estado actual
- Billing y gestion base de clientes: implementado.
- Auditoria de acciones criticas: en progreso en esta rama.
- Vista de actividad en UI superadmin: en progreso en esta rama.
