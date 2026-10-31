# Informe de validación

Fecha del paquete: 2026-10-29.

## Comprobaciones ejecutadas

- Se comprobó la sintaxis de los bloques JavaScript embebidos con Node.js.
- Se buscó la presencia de los elementos principales: `newScriptBtn`, `guioneroProjectPicker`, `guioneroStructureBtn` y `guioneroSettingsBtn`.
- En una prueba de navegador automatizada, la interfaz se mostró; el selector de proyectos abrió su menú; los controles de estructura y configuración abrieron sus paneles; no se registraron excepciones de JavaScript durante ese recorrido.
- La lista de errores de inicialización de las mejoras quedó vacía en esa prueba.

- La auditoría Android también cubre ahora 360×740 y 412×915 en vertical, y 915×412 en horizontal; comprueba el apilado del panel de capas, el ancho útil del lienzo, el menú lateral y los botones táctiles de Paint.

## Nueva auditoría Android

La capa móvil detecta plataforma Android junto con capacidades táctiles; no aplica su interfaz cuando el navegador informa Windows/macOS/Linux como plataforma. El modo Android introduce navegación inferior, paneles temporales para Paint, panel de opciones en Notes y modo de escritura enfocado para Script. El fondo visual de Paint se fuerza a blanco en Android; el canvas de dibujo y las exportaciones de capas aisladas conservan transparencia. Las exportaciones de composición completa mantienen el fondo blanco.

La auditoría automatizada se ejecuta con Chromium/Playwright emulando teléfonos y tabletas Android, eventos táctiles, controles desplegables, escritura en contentEditable, cambios de tamaño del viewport como aproximación al teclado virtual, y verificación de salida PNG (blanco en composición completa, alfa en capa aislada). En el mismo trabajo compara la geometría y estilos calculados de escritorio contra el archivo index.html capturado desde main antes de la actualización, y repite controles de zoom con ratón en Paint y Node.

## Límites conocidos de estas pruebas

- No se probó exhaustivamente cada característica ni cada combinación de datos. La emulación Chromium no sustituye una comprobación física en varios modelos Android, capas del fabricante y teclados reales.
- El entorno de prueba bloqueó la navegación directa mediante `file://`, por lo que la comprobación visual se hizo cargando el HTML en una página de prueba; esto no certifica todos los entornos de escritorio o móviles.
- No se certificó la persistencia después de reiniciar el navegador, ni todos los casos de uso de almacenamiento, importación y exportación.
- Una de las pruebas de humo mostró que el almacenamiento persistente estaba bloqueado en el entorno de prueba. En navegadores que bloqueen el almacenamiento, la aplicación puede mantener datos solo durante la sesión y debe exportarse el proyecto antes de cerrar.

Por estas razones, el paquete es una base de código lista para subir y seguir probando, no una garantía de ausencia total de errores.
