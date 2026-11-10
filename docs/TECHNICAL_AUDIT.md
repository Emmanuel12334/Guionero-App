# Auditoría técnica verificada de Guionero

Esta auditoría contrasta las observaciones recibidas con el estado de `main` después de restaurar la CSP en el PR #17. Describe la implementación observada; no certifica ausencia total de errores.

## Resultado por observación

| # | Observación | Resultado en el código actual |
|---|---|---|
| 1 | Bloques de script y persistencia repartida | **Parcialmente confirmado.** Hay diez bloques JavaScript inline y un archivo JavaScript móvil externo. La persistencia está distribuida entre dominios de estado y rutas de respaldo. No todas las escrituras señaladas corresponden a la misma clave. |
| 2 | `Object.defineProperty(window, 'window.__guioneroSafeStorage', ...)` | **No reproducido en `main`.** No aparece esa llamada ni ese nombre literal en el archivo actual. El guardado asigna directamente `window.__guioneroSafeStorage = nativeStore` o el adaptador de memoria. |
| 3 | Configuración compleja de Firebase y tokens en almacenamiento local | **Confirmado.** La sincronización es opcional, requiere configuración Firebase, autenticación Email/Password y reglas de Realtime Database. El token ID y el refresh token se guardan en `localStorage` cuando está disponible; si el navegador lo bloquea, el adaptador usa memoria de sesión. La contraseña no forma parte del objeto de sesión persistente. No se encontró uso de File System Access API. |
| 4 | README desactualizado | **Confirmado.** El documento omitía los recursos móviles externos y la sincronización Firebase, indicaba un workflow que no existe y describía la sincronización remota como ausente. |
| 5 | Traducción basada en textos literales | **Confirmado parcialmente.** El traductor general usa un mapa de frases españolas a inglesas y un observador del DOM. Algunas etiquetas de configuración sí usan claves semánticas (`settingsLabels`), pero el sistema no está migrado por completo a claves de traducción. |
| 6 | PDF dependiente de impresión y sin Fountain | **Confirmado con matices.** PDF llama a `window.print()`; la hoja de impresión define papel Letter y márgenes de una pulgada. El editor genera una capa visual de números de página, pero no un contador vinculado a la paginación física del PDF. No hay exportador Fountain en el código actual. EPUB sí está implementado. |
| 7 | Ausencia de PWA | **Confirmado.** No hay enlace a manifiesto PWA ni registro de service worker. Las menciones a `manifest` pertenecen al paquete interno de EPUB. |
| 8 | Enfoque del producto | **Decisión de producto, no bug.** El título inicial es «Mi guion para YouTube» y existe un tipo `INTRO`, mientras que Script también usa categorías de guion audiovisual y se integra con Node y Paint. Conviene definir el público prioritario antes de cambiar esos valores por defecto. |

## Mapa actual de persistencia

La app no mantiene todos los datos en una sola estructura. Las claves separadas corresponden a áreas de estado diferentes y deben conservarse durante una futura refactorización:

| Área | Almacenamiento observado | Propósito |
|---|---|---|
| Script | `guionero_local_v1` | Título, tema, bloques del guion y HTML inline sanitizado. |
| Node/Paint | `guionero_studio_v1` | Modelo Studio, páginas, conexiones, lienzos, capas y objetos. El estado completo se refleja también en IndexedDB para recuperar datos gráficos grandes. |
| Biblioteca de proyectos | IndexedDB `GuioneroProjectLibrary`, almacén `projects` | Instantáneas completas `.guionero` de cada proyecto. |
| Respaldo de biblioteca | `guionero_project_library_fallback_v1` | Copia de la biblioteca cuando IndexedDB no está disponible. |
| Respaldo extendido de Paint | IndexedDB `GuioneroPaintVault`, almacén `projects`, registro `active` | Copia completa de los datos de Paint y recuperación si el almacenamiento local excede su cuota. |
| Proyecto activo | `guionero_active_project_id` | Identificador del proyecto actualmente cargado. |
| Preferencias | `guionero_app_preferences_v1` | Apariencia, escala y preferencia de idioma. |
| Firebase | `guionero_sync_config_v1`, `guionero_sync_session_v1` | Configuración y sesión persistente de sincronización. |
| Identidad de dispositivo / vínculo | `guionero_client_id_v1`, `guionero_cloud_bound_project_id` | Identificación de escritor y protección del vínculo de nube al cambiar proyectos. |

### Por qué no se debe fusionar todo en una sola clave sin migración

- Script y Studio evolucionan en modelos distintos; el estado de Paint puede ser grande y requiere IndexedDB cuando supera la cuota de almacenamiento local.
- La biblioteca guarda instantáneas completas, separadas del borrador activo. Sus cambios de proyecto escriben primero el estado local y colocan el identificador activo al final; hay lógica de rollback si la activación falla.
- El editor Script guarda por sí mismo y el módulo de proyectos captura ambos modelos para formar una instantánea. El módulo Studio mantiene su propio espejo de IndexedDB. Esas rutas necesitan coordinación y pruebas de carrera, no una sustitución global y ciega.
- Una futura capa única de persistencia debería ser una **fachada/API común** sobre los almacenes existentes, no necesariamente una sola clave ni un único blob. Debe conservar claves antiguas y ejecutar migraciones versionadas, con pruebas de restauración de proyectos ya creados.

La repetición de escrituras merece refactorización: hay varias rutas que actualizan `guionero_local_v1` y diferentes rutas que persisten `guionero_studio_v1`. La inspección estática por sí sola no demuestra una pérdida de datos reproducible. Antes de reescribir, hacen falta pruebas que guarden, recarguen, cambien de proyecto, restauren desde IndexedDB y recuperen después de cuota excedida.

## Seguridad: alcance real de la CSP

El PR #17 restauró en `index.html` las directivas `object-src 'none'`, `base-uri 'self'` y una lista `connect-src` que permite el origen local y los endpoints Firebase usados por la sincronización. Esta CSP es una protección limitada: no define una política estricta `script-src` y no impide por sí sola una inyección que se ejecute como JavaScript. La sanitización y el escape de contenido siguen siendo necesarios.

La cantidad de accesos a `innerHTML` no basta para declarar una vulnerabilidad: hay usos de renderizado, extracción de formato y sanitización. La revisión correcta debe seguir cada dato externo o importado hasta el punto donde se inserta en el DOM y verificar qué escape o sanitizador se aplica.

## Exportación y paginación

- PDF abre el diálogo nativo mediante `window.print()`; CSS usa `@page { size: letter; margin: 1in; }`.
- La numeración visible del editor se construye en un overlay separado del contenido editable y se calcula a partir de la geometría del papel virtual. No equivale a un motor PDF que controle los saltos, los pies de página y el número físico de cada hoja impresa.
- No se encontraron referencias a Fountain ni un exportador `.fountain`.
- EPUB se empaqueta en el navegador sin dependencias de runtime.

## Fases recomendadas para corregir con bajo riesgo

1. **Persistencia:** escribir pruebas de round-trip para Script/Node/Paint, biblioteca, cambio de proyecto, respaldo IndexedDB y cuota excedida. Después extraer una API central que mantenga claves y formatos heredados.
2. **Sincronización y archivos:** mantener Firebase como opción hasta decidir si se conserva; mejorar su onboarding y evaluar un guardado por archivo con fallback de descarga/importación. No quitar el flujo remoto sin decidir qué pasa con los usuarios que dependen de él.
3. **Exportación:** implementar Fountain y pruebas de conversión por tipo de bloque. Después diseñar paginación PDF verificable en vez de asumir que la impresión del navegador da control total.
4. **Funciones puras y pruebas:** extraer sanitización, normalización y serialización a funciones comprobables sin DOM.
5. **Módulos:** separar archivos primero con límites claros; introducir Vite solo cuando se haya definido la estrategia de módulos y el despliegue.
6. **Idioma:** migrar progresivamente las cadenas a claves semánticas, manteniendo textos de proyectos y guiones sin traducir.
7. **PWA:** añadir manifiesto y service worker con una estrategia de caché y actualización probada, sin almacenar accidentalmente sesiones o datos privados en caché.
8. **Licencia:** el repositorio no contiene `LICENSE`. El propietario debe escogerla; no se ha añadido una licencia por suposición.

## Archivos y herramientas revisados

- `index.html`
- `guionero-mobile-crossplatform.css`
- `guionero-mobile-crossplatform.js`
- `package.json`
- `scripts/check-html.js`
- `.github/workflows/guionero-browser-validation.yml`
- `.github/workflows/android-audit.yml`
- `.github/workflows/static.yml`
- `docs/VALIDATION.md`

La prueba local `npm run check` valida sintaxis JavaScript embebida y estructura HTML básica; la batería Playwright de los workflows cubre recorridos de navegador, pero no reemplaza pruebas físicas en todos los dispositivos ni una auditoría completa de persistencia.
