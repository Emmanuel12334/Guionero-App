# Registro de cambios

## Experiencia Android ampliada — 2026-10-29

- Detección Android basada en plataforma y capacidad táctil; se mantienen los estilos y controles Android detrás de la clase de dispositivo.
- Paint incorpora controles flotantes de zoom, porcentaje, Ajustar y 100%, y un panel de capas en cajón para dejar el lienzo libre.
- El tablero conserva el blanco aunque la interfaz use tema oscuro; las capas rasterizadas mantienen la transparencia original.
- Un gesto de dos dedos cancela de forma segura los trazos y transformaciones de objeto que estuvieran empezando.
- Script añade modo enfocado y menú de formato plegable; el ajuste del viewport acompaña los cambios del teclado virtual.
- La validación incluye teléfonos y tabletas, además de comprobaciones de escritorio.

## Revisión de Android para teléfonos — 2026-10-29

- Adaptado Paint a un panel de capas superior en orientación vertical para ampliar el área útil del lienzo.
- Conservada la disposición lateral de capas en horizontal y habilitado el menú lateral en teléfonos Android apaisados con ancho superior a 650 px.
- Aumentados a 42–44 px los controles táctiles de Android y limitado el alto de las barras para que el lienzo conserve espacio.
- Ampliada la batería Playwright a tres tamaños/orientaciones Android y a pulsaciones táctiles reales sobre los controles plegables de Paint.

## Versión consolidada — 2026-10-29

- Reunida la aplicación web en `index.html` para facilitar su publicación como repositorio.
- Incorporadas las mejoras recientes del selector de proyectos, importación de archivos `.guionero`, estructura narrativa y configuración.
- Endurecido el arranque de las mejoras opcionales para que un inicializador que falle no impida intentar inicializar los demás.
- Añadida una capa de acceso seguro al almacenamiento con alternativa de sesión cuando el almacenamiento del navegador no está disponible.
- Añadidos README, informe de validación, comprobación local y flujo de GitHub Actions.

Las pruebas actuales son de humo y de sintaxis; consulta `docs/VALIDATION.md` para conocer el alcance real.
