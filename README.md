# LivePescado 🐟

Plataforma de venta en directo con videoconferencia múltiple para vender pescado fresco a clientes por orden de llegada.

## Características

- **Sistema de Cola**: Los clientes se unen por orden de llegada
- **Videoconferencia Multi-cámara**: 
  - 1 cámara del vendedor
  - 3 cámaras enfocadas en los productos
  - Cámara del cliente
- **Panel del Vendedor**: Gestión de clientes, aceptar/rechazar llamadas
- **Sistema de Pedidos**: Los clientes pueden realizar pedidos durante la videollamada
- **Gestión de Envíos**: Registro de direcciones de envío y pedidos

## Requisitos Previos

- Node.js 14+ instalado
- Navegador moderno con soporte para WebRTC (Chrome, Firefox, Edge, Safari)
- Múltiples cámaras conectadas (USB o integradas) para el vendedor
- Conexión a internet estable

## Instalación

1. Clona o descarga este repositorio

2. Instala las dependencias:
```bash
npm install
```

3. Inicia el servidor:
```bash
npm start
```

Para desarrollo con auto-recarga:
```bash
npm run dev
```

4. Abre tu navegador:
   - **Panel del vendedor**: http://localhost:3000/vendor
   - **Panel del cliente**: http://localhost:3000/

## Configuración de Cámaras

### Para el Vendedor:

1. Conecta 4 cámaras a tu ordenador (1 principal + 3 de producto)
2. Abre el panel del vendedor
3. Haz clic en "Iniciar Cámaras"
4. Selecciona la cámara apropiada para cada posición usando los selectores dropdown
5. Acepta los permisos del navegador para acceder a las cámaras

### Recomendaciones de Configuración:

- **Cámara Principal (Vendedor)**: Webcam de alta calidad enfocada a tu rostro
- **Cámaras de Producto**: Pueden ser webcams USB económicas enfocadas:
  - Cámara 1: Vista general del producto
  - Cámara 2: Detalle/close-up del producto
  - Cámara 3: Otro ángulo o segundo producto

## Uso

### Como Vendedor:

1. Abre el panel del vendedor en http://localhost:3000/vendor
2. Inicia todas las cámaras
3. Espera a que los clientes se unan a la cola
4. Haz clic en "Aceptar Siguiente Cliente" para iniciar la videollamada
5. Durante la llamada, podrás ver al cliente y él podrá verte junto con los productos
6. El cliente puede hacer pedidos durante la llamada
7. Cuando termines, haz clic en "Terminar Llamada"

### Como Cliente:

1. Abre http://localhost:3000/
2. Ingresa tu nombre y únete a la cola
3. Espera tu turno (se mostrará tu posición en la cola)
4. Cuando el vendedor te acepte, se iniciará la videollamada
5. Podrás ver:
   - Al vendedor
   - 3 vistas diferentes del producto
6. Añade productos al carrito durante la llamada
7. Ingresa tu dirección de envío
8. Realiza el pedido

## Estructura del Proyecto

```
LivePescado/
├── server.js              # Servidor principal con Socket.IO y WebRTC
├── package.json           # Dependencias del proyecto
├── README.md             # Este archivo
└── public/               # Archivos públicos
    ├── client.html       # Interfaz del cliente
    ├── client.css        # Estilos del cliente
    ├── client.js         # Lógica del cliente
    ├── vendor.html       # Panel del vendedor
    ├── vendor.css        # Estilos del vendedor
    └── vendor.js         # Lógica del vendedor
```

## Tecnologías Utilizadas

- **Backend**: Node.js, Express
- **WebSockets**: Socket.IO para comunicación en tiempo real
- **WebRTC**: Para videollamadas peer-to-peer
- **Frontend**: HTML5, CSS3, JavaScript vanilla

## Características Técnicas

### Sistema de Cola
- Los clientes se agregan automáticamente a una cola FIFO
- El vendedor puede ver la cola en tiempo real
- Actualización automática de posiciones

### WebRTC
- Conexión peer-to-peer para mejor calidad de video
- Soporte para múltiples streams simultáneos
- Señalización a través de Socket.IO
- Servidores STUN de Google para NAT traversal

### Sistema de Pedidos
- Carrito de compra en tiempo real
- Cálculo automático de totales
- Registro de direcciones de envío
- Historial de pedidos para el vendedor

## Solución de Problemas

### Las cámaras no se detectan:
- Verifica que las cámaras estén correctamente conectadas
- Asegúrate de dar permisos al navegador
- Reinicia el navegador

### No se establece la conexión de video:
- Verifica tu firewall
- Asegúrate de tener una conexión a internet estable
- Prueba con otro navegador

### El audio no funciona:
- Verifica los permisos del micrófono
- Comprueba que el micrófono no esté silenciado
- Revisa las configuraciones de audio del sistema

## Próximas Mejoras

- [ ] Base de datos persistente (MongoDB/PostgreSQL)
- [ ] Sistema de autenticación para vendedores
- [ ] Procesamiento de pagos integrado
- [ ] Notificaciones push
- [ ] Grabación de llamadas
- [ ] Chat de texto durante la llamada
- [ ] Estadísticas y métricas de ventas
- [ ] Soporte para múltiples vendedores
- [ ] App móvil

## Licencia

ISC

## Soporte

Para problemas o preguntas, abre un issue en el repositorio del proyecto.

---

Desarrollado con ❤️ para LivePescado
