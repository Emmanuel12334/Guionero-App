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
      button.title = label;
      button.setAttribute('aria-label', label);
      const icon = document.createElement('span');
      icon.className = 'mobile-tool-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = glyph;
      const caption = document.createElement('span');
      caption.className = 'mobile-tool-label';
      caption.textContent = label;
      button.append(icon, caption);
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
  /* Add real rectangle/ellipse drawing to the existing active raster layer.
     It uses the app's undo and save bridge; imported projects remain unchanged. */
  const paintTool = $('paintTool');
  if (paintTool) {
    [['rect', 'Rectángulo'], ['ellipse', 'Elipse']].forEach(([value, label]) => {
      if (![...paintTool.options].some(option => option.value === value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        paintTool.appendChild(option);
      }
    });
  }

  const shapeCanvas = $('paintCanvas');
  const opacityControl = $('guioneroMobilePaintShapeOpacity');
  if (shapeCanvas && !shapeCanvas.dataset.mobileShapeHandlers) {
    shapeCanvas.dataset.mobileShapeHandlers = 'true';
    const shapeContext = shapeCanvas.getContext('2d');
    let shapeDrag = null;

    const getShapePoint = event => {
      const rect = shapeCanvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * shapeCanvas.width / Math.max(1, rect.width),
        y: (event.clientY - rect.top) * shapeCanvas.height / Math.max(1, rect.height)
      };
    };

    const drawShapePreview = event => {
      if (!shapeDrag || event.pointerId !== shapeDrag.pointerId) return;
      const current = getShapePoint(event);
      const left = Math.min(shapeDrag.start.x, current.x);
      const top = Math.min(shapeDrag.start.y, current.y);
      const width = Math.abs(current.x - shapeDrag.start.x);
      const height = Math.abs(current.y - shapeDrag.start.y);
      shapeContext.putImageData(shapeDrag.before, 0, 0);
      shapeContext.save();
      shapeContext.globalAlpha = Math.max(0.05, Math.min(1, Number($('guioneroMobilePaintShapeOpacity')?.value ?? 100) / 100));
      shapeContext.strokeStyle = $('paintColor')?.value || '#202124';
      shapeContext.lineWidth = Math.max(1, Number($('paintSize')?.value) || 5);
      shapeContext.lineJoin = 'round';
      shapeContext.lineCap = 'round';
      shapeContext.beginPath();
      if (shapeDrag.tool === 'ellipse') {
        shapeContext.ellipse(left + width / 2, top + height / 2, Math.max(0.5, width / 2), Math.max(0.5, height / 2), 0, 0, Math.PI * 2);
      } else {
        shapeContext.rect(left, top, width, height);
      }
      shapeContext.stroke();
      shapeContext.restore();
    };

    const finishShape = event => {
      if (!shapeDrag || event.pointerId !== shapeDrag.pointerId) return;
      if (event.type === 'pointercancel') {
        shapeContext.putImageData(shapeDrag.before, 0, 0);
      } else {
        drawShapePreview(event);
        try { window.GuioneroStudio?.exportState?.(); } catch (_) {}
      }
      shapeDrag = null;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointerdown', event => {
      if (!shapeCanvas.contains(event.target)) {
        if (shapeDrag && event.pointerType === 'touch' && event.pointerId !== shapeDrag.pointerId) {
          shapeContext.putImageData(shapeDrag.before, 0, 0);
          shapeDrag = null;
        }
        return;
      }
      const selectedTool = $('paintTool')?.value;
      if (!['rect', 'ellipse'].includes(selectedTool) || $('paintMode')?.value !== 'draw') return;
      if (shapeDrag) {
        shapeContext.putImageData(shapeDrag.before, 0, 0);
        shapeDrag = null;
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      try { window.GuioneroStudio?.recordPaintUndo?.(); } catch (_) {}
      shapeDrag = {
        pointerId: event.pointerId,
        tool: selectedTool,
        start: getShapePoint(event),
        before: shapeContext.getImageData(0, 0, shapeCanvas.width, shapeCanvas.height)
      };
      try { shapeCanvas.setPointerCapture(event.pointerId); } catch (_) {}
    }, true);

    window.addEventListener('pointermove', event => {
      if (!shapeDrag || event.pointerId !== shapeDrag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      drawShapePreview(event);
    }, true);
    window.addEventListener('pointerup', finishShape, true);
    window.addEventListener('pointercancel', finishShape, true);
  }

  const shapeMenu = $('guioneroMobilePaintShapeMenu');
  if (shapeMenu && !opacityControl) {
    const label = document.createElement('label');
    label.textContent = 'Transparencia';
    label.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:115px;padding:4px 8px;color:var(--muted);font:11px system-ui;';
    const range = document.createElement('input');
    range.type = 'range';
    range.id = 'guioneroMobilePaintShapeOpacity';
    range.min = '5';
    range.max = '100';
    range.value = '100';
    range.setAttribute('aria-label', 'Transparencia de las formas');
    label.appendChild(range);
    shapeMenu.appendChild(label);
  }

})();
