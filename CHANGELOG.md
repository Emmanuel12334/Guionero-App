# Registro de cambios

## Experiencia móvil Android — 2026-10-30

- Añadida detección Android basada en plataforma y capacidades táctiles; la nueva interfaz solo se activa en dispositivos Android táctiles.
- Añadida barra de navegación inferior y navegación lateral desplegable con áreas seguras de pantalla.
- Añadido modo de escritura enfocado para Script, con restauración de controles, selección de texto y ajuste al viewport visible cuando aparece el teclado.
- Reorganizado Notes con barra de opciones desplegable y panel de edición móvil.
- Reorganizado Paint con cajones temporales de herramientas, capas y objetos, barra flotante de zoom, porcentaje, Fit y vista 100%.
- El tablero de Paint es blanco en Android tanto en tema claro como oscuro; el canvas raster y las capas no se aplanan, y las exportaciones de capa conservan transparencia.
- Evita que un pinch de dos dedos convierta un arrastre de objeto en movimiento; el gesto de navegación cancela el gesto de un dedo antes de mover/zoomear la cámara.
- Ampliadas las pruebas de Chromium/Playwright a teléfono y tableta, vertical y horizontal, con comparación automatizada del escritorio frente al HTML previo de main.



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
