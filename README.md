# Guionero Studio

Editor web de guiones en español, preparado para abrirse directamente en un navegador moderno. Esta distribución corresponde a la última versión consolidada en esta conversación.

## Empezar

1. Descarga o descomprime el proyecto.
2. Abre `index.html` con Chrome, Edge o Firefox actualizado.
3. Crea un guion y usa **Guardar como** para exportar una copia del proyecto cuando quieras conservarla o moverla a otro dispositivo.

La aplicación está construida como una página HTML autocontenida: el código de interfaz, los estilos y la lógica principal están dentro de `index.html`. No necesita instalar paquetes ni compilarse para abrirse. Para un uso más fiable, también puedes servir la carpeta desde un servidor estático local o publicarla con GitHub Pages.

## Contenido del proyecto

- `index.html`: aplicación completa.
- `docs/VALIDATION.md`: comprobaciones realizadas y límites de las pruebas.
- `CHANGELOG.md`: resumen de los cambios de esta versión.
- `scripts/check-html.js`: comprobación local de sintaxis JavaScript embebida e identificadores HTML básicos.
- `.github/workflows/validate.yml`: ejecución automática de la comprobación en GitHub Actions.
- `package.json`: comandos de validación; no declara dependencias externas.

## Características incluidas en esta versión

- Editor de guiones con formato de escritura.
- Vistas de trabajo **Script**, **Node** y **Paint**.
- Biblioteca/selector de guiones, importación y exportación de proyectos.
- Panel para estructuras narrativas y configuración general.
- Preferencias de idioma y presentación expuestas desde la interfaz.

La disponibilidad exacta y el comportamiento de cada opción deben verificarse en el navegador de destino; el informe de validación solo describe las pruebas de humo realizadas, no una certificación exhaustiva de todas las funciones.

## Guardado de proyectos y privacidad

Los datos se gestionan en el navegador. El comportamiento del almacenamiento local puede variar según el navegador, el modo privado y si se abre el archivo como `file://` o desde un servidor web. Exporta los proyectos importantes a un archivo y guarda una copia de seguridad antes de borrar datos del navegador. Esta versión no incluye una cuenta de usuario ni sincronización remota propia.

## Validar el código

Se requiere Node.js instalado. Desde la carpeta del proyecto ejecuta:

```bash
npm run check
```

El comando revisa la sintaxis de los bloques JavaScript embebidos y comprueba algunos elementos esenciales de la interfaz. No reemplaza las pruebas manuales de todas las herramientas.

## Publicar en GitHub Pages

1. Crea o abre un repositorio en GitHub.
2. Sube el contenido de esta carpeta, manteniendo `index.html` en la raíz.
3. En **Settings → Pages**, configura la publicación desde la rama principal y la carpeta raíz (`/root`).
4. Abre la URL que GitHub Pages muestre al terminar la publicación.

## Licencia

Esta distribución no añade una licencia de reutilización. Antes de permitir que terceros copien, modifiquen o redistribuyan el código, selecciona una licencia apropiada y añade el archivo `LICENSE` correspondiente.
