/* Guionero mobile-only experience bridge: Android and iPhone/iPad browsers. */
(() => {
  'use strict';
  if (window.__guioneroMobileTouchDevice !== true) return;

  const $ = (id) => document.getElementById(id);
  const body = document.body;
  body.classList.add('guionero-mobile-device');

  function mobileToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(mobileToast.timer);
    mobileToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  /* Script: preserve the existing continuous editor and open its real type picker. */
  const scriptPane = $('paneScript');
  const script = $('script');
  const picker = $('picker');
  const formatDetails = $('androidScriptFormatDetails');
  if (scriptPane && script && picker && !$('guioneroMobileScriptToolbar')) {
    const bar = document.createElement('div');
    bar.id = 'guioneroMobileScriptToolbar';
    bar.className = 'guionero-mobile-script-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Herramientas de formato del guion');
    const entries = [
      ['SCENE', '▣', 'Scene'],
      ['ACTION', '✎', 'Action'],
      ['CHARACTER', '♙', 'Character'],
      ['PARENTHETICAL', '(', 'Parenthetical'],
      ['DIALOGUE', '☷', 'Dialogue'],
      ['TRANSITION', '⇢', 'Transition'],
      ['INTRO', '☆', 'Intro']
    ];
    function openType(type) {
      script.focus({ preventScroll: true });
      const pickerAlreadyOpen = picker.classList.contains('visible');
      if (!pickerAlreadyOpen) {
        script.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Tab', code: 'Tab', bubbles: true, cancelable: true
        }));
      }
      const choose = () => {
        const option = picker.querySelector('[data-pick="' + type + '"]');
        if (option) option.click();
        else if (picker.classList.contains('visible')) mobileToast('No se pudo abrir esa herramienta del guion.');
      };
      requestAnimationFrame(() => requestAnimationFrame(choose));
    }
    entries.forEach(([type, glyph, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'guionero-mobile-script-tool';
      button.dataset.scriptType = type;
      button.innerHTML = '<span class="mobile-tool-icon" aria-hidden="true"></span><span></span>';
      button.children[0].textContent = glyph;
      button.children[1].textContent = label;
      button.addEventListener('click', () => openType(type));
      bar.appendChild(button);
    });
    const reference = formatDetails || $('scriptFormatToolbar')?.parentElement || $('scriptProjectToolbar');
    if (reference?.parentNode) reference.parentNode.insertBefore(bar, reference);
    else scriptPane.insertBefore(bar, scriptPane.firstChild);
  }

  /* Paint: surface common actions without replacing the original controls. */
  const paintPane = $('panePaint');
  const dock = $('androidPaintDock');
  if (paintPane && dock && !dock.dataset.mobileEnhanced) {
    dock.dataset.mobileEnhanced = 'true';
    const makeButton = (id, glyph, label, action) => {
      if ($(id)) return $(id);
      const button = document.createElement('button');
      button.type = 'button';
      button.id = id;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = '<span class="dock-symbol" aria-hidden="true"></span><span></span>';
      button.children[0].textContent = glyph;
      button.children[1].textContent = label;
      button.addEventListener('click', action);
      dock.appendChild(button);
      return button;
    };
    makeButton('guioneroMobilePaintDraw', '✎', 'Dibujar', () => {
      const mode = $('paintMode'), tool = $('paintTool');
      if (mode) { mode.value = 'draw'; mode.dispatchEvent(new Event('change', { bubbles: true })); }
      if (tool) { tool.value = 'pen'; tool.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    makeButton('guioneroMobilePaintText', 'T', 'Texto', () => $('paintTextBtn')?.click());
    makeButton('guioneroMobilePaintImage', '▧', 'Imagen', () => $('paintImport')?.click());
    makeButton('guioneroMobilePaintPan', '✋', 'Mover', () => $('paintPanMode')?.click());

    const gridButton = makeButton('guioneroMobilePaintGrid', '⠿', 'Cuadrícula', () => {
      const hidden = body.classList.toggle('guionero-paint-grid-hidden');
      gridButton.setAttribute('aria-pressed', String(!hidden));
      gridButton.children[1].textContent = hidden ? 'Sin puntos' : 'Cuadrícula';
      try { window.__guioneroSafeStorage?.setItem('guionero_mobile_paint_grid_hidden_v1', String(hidden)); } catch (_) {}
    });
    let gridHidden = false;
    try { gridHidden = window.__guioneroSafeStorage?.getItem('guionero_mobile_paint_grid_hidden_v1') === 'true'; } catch (_) {}
    body.classList.toggle('guionero-paint-grid-hidden', gridHidden);
    gridButton.setAttribute('aria-pressed', String(!gridHidden));
    gridButton.children[1].textContent = gridHidden ? 'Sin puntos' : 'Cuadrícula';

    if (!$('guioneroMobilePaintShapeMenu')) {
      const menu = document.createElement('div');
      menu.id = 'guioneroMobilePaintShapeMenu';
      menu.className = 'guionero-mobile-shape-menu';
      menu.hidden = true;
      const shapeEntries = [['rect', '▭', 'Rectángulo'], ['ellipse', '◯', 'Elipse']];
      shapeEntries.forEach(([value, glyph, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.paintShape = value;
        button.textContent = glyph + ' ' + label;
        button.addEventListener('click', () => {
          const mode = $('paintMode'), tool = $('paintTool');
          if (mode) { mode.value = 'draw'; mode.dispatchEvent(new Event('change', { bubbles: true })); }
          if (tool) { tool.value = value; tool.dispatchEvent(new Event('change', { bubbles: true })); }
          menu.hidden = true;
          mobileToast('Arrastra el dedo sobre el lienzo para crear la forma.');
        });
        menu.appendChild(button);
      });
      paintPane.appendChild(menu);
    }
    makeButton('guioneroMobilePaintShapes', '◇', 'Formas', () => {
      const menu = $('guioneroMobilePaintShapeMenu');
      if (menu) menu.hidden = !menu.hidden;
    });
    document.addEventListener('pointerdown', (event) => {
      const menu = $('guioneroMobilePaintShapeMenu');
      if (menu && !menu.hidden && !menu.contains(event.target) && !event.target.closest('#guioneroMobilePaintShapes')) menu.hidden = true;
    }, true);
  }
})();
