# Guionero Studio

Editor web de guiones con espacios de trabajo **Script**, **Node** y **Paint**. La aplicación se publica como sitio estático y no necesita un paso de compilación para abrirse.

## Empezar

1. Descarga o descomprime el repositorio completo, no solo `index.html`.
2. Abre `index.html` con una versión reciente de Chrome, Edge o Firefox, o sirve la carpeta desde un servidor HTTPS.
3. Crea un proyecto. Guionero guarda cambios en el almacenamiento del navegador; usa **Guardar como** para exportar un archivo `.guionero` con los datos de Script, Node y Paint.

El comportamiento del almacenamiento puede variar con el navegador, el modo privado y el uso de `file://`. Para proyectos importantes, conserva una exportación `.guionero` fuera del navegador.

## Estructura del repositorio

- `index.html`: documento principal, interfaz, estilos generales y la mayor parte de la lógica de la aplicación.
- `guionero-mobile-crossplatform.css` y `guionero-mobile-crossplatform.js`: estilos y adaptación de interacción para navegadores móviles táctiles. Ambos archivos se cargan desde `index.html`.
- `package.json`: declara el comando local `npm run check`; no declara dependencias de ejecución.
- `scripts/check-html.js`: revisa la sintaxis JavaScript embebida, IDs duplicados, elementos esenciales, política CSP y recursos móviles referenciados.
- `tests/`: pruebas automatizadas de navegador para escritorio, Android emulado, iPhone/WebKit y flujos del editor Script.
- `.github/workflows/`: validación en pull requests, auditoría móvil en ramas configuradas y publicación en GitHub Pages.
- `docs/VALIDATION.md`: alcance y límites de las pruebas.
- `docs/TECHNICAL_AUDIT.md`: mapa técnico de almacenamiento y hallazgos verificados.
- `CHANGELOG.md`: historial resumido de cambios.

La lógica todavía está repartida entre varios bloques JavaScript dentro de `index.html` y el puente móvil externo. No se ha migrado a módulos Vite.

## Características

- Editor Script con bloques de escena, acción, personaje, parentética, diálogo, transición e intro.
- Espacios de trabajo Node y Paint.
- Biblioteca de proyectos, cambio de proyecto, importación y exportación `.guionero`.
- Guardado local con respaldo de datos grandes mediante IndexedDB.
- Sincronización opcional entre dispositivos mediante Firebase Authentication y Realtime Database.
- Exportación EPUB generada en el navegador.
- Exportación PDF mediante el cuadro de impresión del navegador (**Imprimir / Guardar como PDF**).

### Límites actuales

- La exportación PDF depende de la paginación y del diálogo de impresión del navegador. El editor muestra una numeración visual propia, pero no implementa un motor PDF con paginación y pies de página controlados por la aplicación.
- No hay exportador Fountain en esta versión.
- No hay manifiesto PWA ni service worker; GitHub Pages no ofrece actualmente una instalación PWA ni una caché offline administrada por Guionero.
- No se usa todavía la File System Access API para mantener un archivo sincronizado directamente con una carpeta elegida por el usuario. La exportación e importación de archivos sigue disponible mediante el selector y las descargas del navegador.

## Guardado y sincronización

### Guardado local

Script, el modelo Node/Paint y la biblioteca de proyectos son partes distintas del estado y tienen respaldos propios. La arquitectura actual conserva claves locales existentes por compatibilidad y usa IndexedDB para proyectos y datos gráficos grandes. No borres el almacenamiento del sitio sin exportar antes tus proyectos.

Los nombres de las claves, las bases IndexedDB y el orden de guardado se describen en [la auditoría técnica](docs/TECHNICAL_AUDIT.md). Esa separación explica por qué no es seguro fusionar todas las escrituras en una sola clave sin pruebas de migración y recuperación.

### Sincronización opcional con Firebase

La sincronización en la nube **sí está incluida**, pero no viene configurada automáticamente. Para activarla, cada usuario debe proporcionar la API Key de una aplicación web Firebase, la URL de Realtime Database y una cuenta con Email/Password; también debe configurar las reglas de la base de datos. Las instrucciones aparecen en la ventana **SYNC** de la aplicación.

La configuración y los tokens de sesión se guardan en el almacenamiento del navegador de ese dispositivo. La contraseña no se guarda como parte de la sesión persistente. No compartas los tokens, la cuenta ni el archivo de configuración; desconecta la sincronización en equipos que no controles. Firebase necesita conexión a Internet.

La política CSP actual limita `object-src`, `base-uri` y los destinos `connect-src` necesarios para el funcionamiento local y Firebase. Es una defensa limitada de seguridad; por sí sola no sustituye la sanitización de contenido ni una política estricta de scripts.

## Validar el código

Se requiere Node.js. Ejecuta desde la raíz:

```bash
npm run check
```

La validación local revisa la sintaxis de JavaScript embebido, IDs duplicados, elementos esenciales, recursos móviles referenciados y algunos invariantes de seguridad. No equivale a probar exhaustivamente cada operación de la aplicación.

Los workflows principales son:

- `.github/workflows/guionero-browser-validation.yml`: validación en pull requests, incluida la batería Playwright.
- `.github/workflows/android-audit.yml`: pruebas de regresión móvil y comparación de escritorio para las ramas configuradas.
- `.github/workflows/static.yml`: despliegue de GitHub Pages desde `main`.

Las pruebas Playwright se instalan durante el workflow; no son dependencias de ejecución declaradas en `package.json`.

## Publicar en GitHub Pages

El workflow `static.yml` publica el contenido del repositorio desde la raíz. En GitHub, la fuente de Pages debe estar configurada para GitHub Actions. La URL publicada aparece en **Settings → Pages**.

## Licencia

Este repositorio no contiene actualmente un archivo `LICENSE`. No se debe asumir que el código puede copiarse, modificarse o redistribuirse libremente. El titular del proyecto debe elegir y añadir una licencia antes de conceder esos permisos.
