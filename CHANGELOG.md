# Registro de cambios

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
