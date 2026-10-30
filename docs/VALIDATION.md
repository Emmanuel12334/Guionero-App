# Informe de validación

Fecha del paquete: 2026-10-29.

## Comprobaciones ejecutadas

- Se comprobó la sintaxis de los bloques JavaScript embebidos con Node.js.
- Se buscó la presencia de los elementos principales: `newScriptBtn`, `guioneroProjectPicker`, `guioneroStructureBtn` y `guioneroSettingsBtn`.
- En una prueba de navegador automatizada, la interfaz se mostró; el selector de proyectos abrió su menú; los controles de estructura y configuración abrieron sus paneles; no se registraron excepciones de JavaScript durante ese recorrido.
- La lista de errores de inicialización de las mejoras quedó vacía en esa prueba.

- La auditoría Android también cubre ahora 360×740 y 412×915 en vertical, y 915×412 en horizontal; comprueba el apilado del panel de capas, el ancho útil del lienzo, el menú lateral y los botones táctiles de Paint.

## Límites conocidos de estas pruebas

- No se probó exhaustivamente cada característica ni cada combinación de datos. La emulación Chromium no sustituye una comprobación física en varios modelos Android, capas del fabricante y teclados reales.
- El entorno de prueba bloqueó la navegación directa mediante `file://`, por lo que la comprobación visual se hizo cargando el HTML en una página de prueba; esto no certifica todos los entornos de escritorio o móviles.
- No se certificó la persistencia después de reiniciar el navegador, ni todos los casos de uso de almacenamiento, importación y exportación.
- Una de las pruebas de humo mostró que el almacenamiento persistente estaba bloqueado en el entorno de prueba. En navegadores que bloqueen el almacenamiento, la aplicación puede mantener datos solo durante la sesión y debe exportarse el proyecto antes de cerrar.

Por estas razones, el paquete es una base de código lista para subir y seguir probando, no una garantía de ausencia total de errores.
