/* Guionero mobile-only experience bridge: Android and iPhone/iPad browsers. */
(() => {
  'use strict';
  if (window.__guioneroMobileTouchDevice !== true) return;

  const $ = (id) => document.getElementById(id);
  const body = document.body;
  body.classList.add('guionero-mobile-device');
  // El estilo se agrega al final de la cascada para que las reglas móviles anteriores
  // no puedan esconder la barra ni volver a insertar Gestión de guiones en el editor.
  if (!$('guioneroMobileScriptDrawerStyle')) {
    const mobileStyle = document.createElement('style');
    mobileStyle.id = 'guioneroMobileScriptDrawerStyle';
    mobileStyle.textContent = `
      body.guionero-mobile-device .sidebar {
        overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
      }
      body.guionero-mobile-device #projectManagementDock.project-management-mobile {
        flex:0 0 auto; max-height:none!important; overflow:visible!important;
        margin:9px 12px 13px; padding:10px; border:1px solid var(--line);
        border-radius:11px; background:var(--app);
      }
      body.guionero-mobile-device #projectManagementDock.project-management-mobile::before {
        content:"ADMINISTRACIÓN DEL PROYECTO"; display:block; margin:0 0 8px;
        color:var(--muted); font:800 9px/1.4 system-ui,sans-serif; letter-spacing:.1em;
      }
      body.guionero-mobile-device #projectManagementDock .script-project-toolbar {
        display:flex; flex-direction:column; align-items:stretch; flex-wrap:nowrap;
        gap:7px; width:100%; max-width:100%;
      }
      body.guionero-mobile-device #projectManagementDock .script-project-toolbar>* {
        width:100%; max-width:100%; min-width:0;
      }
      body.guionero-mobile-device #projectManagementDock #projectLibraryStatus {
        display:block; white-space:normal;
      }
      body.guionero-mobile-device #paneScript {
        display:flex; flex:1 1 auto; flex-direction:column;
        min-width:0; min-height:0; overflow:hidden;
      }
      body.guionero-mobile-device #paneScript>#workspace {
        flex:1 1 auto; min-width:0; min-height:0; overflow:auto;
        overscroll-behavior:contain; -webkit-overflow-scrolling:touch;
      }
      body.guionero-mobile-device #guioneroMobileScriptToolbar {
        position:relative; z-index:1005; display:flex!important; flex:0 0 auto;
        align-items:stretch; width:100%; max-width:100%;
        min-height:58px; max-height:60px; margin:0; padding:6px 8px;
        overflow-x:auto; overflow-y:hidden; flex-wrap:nowrap;
        border:0; border-bottom:1px solid var(--line); border-radius:0;
        background:var(--panel); box-shadow:0 4px 12px rgba(0,0,0,.06);
        -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain;
        scrollbar-width:none; touch-action:pan-x; visibility:visible!important;
      }
      body.guionero-mobile-device #guioneroMobileScriptToolbar::-webkit-scrollbar {display:none}
      body.guionero-mobile-device #guioneroMobileScriptToolbar button {
        flex:0 0 auto; min-width:68px; min-height:44px; padding:4px 8px;
        touch-action:manipulation;
      }
      body.guionero-mobile-device.android-script-focus #guioneroMobileScriptToolbar,
      body.guionero-mobile-device.android-keyboard-visible #guioneroMobileScriptToolbar {
        display:flex!important; visibility:visible!important;
      }
      body.guionero-mobile-device #mobileMenuBtn {
        position:relative; z-index:1002;
      }
      body.guionero-mobile-device #mobileMenuBtn[aria-expanded="true"] {
        border-color:var(--accent); background:var(--accent-soft); color:var(--accent);
      }
      @media (orientation:landscape) and (max-height:520px) {
        body.guionero-mobile-device #guioneroMobileScriptToolbar {
          min-height:52px; max-height:54px; padding-top:4px; padding-bottom:4px;
        }
      }`;
    document.head.appendChild(mobileStyle);
  }

  // El menú de las tres rayitas abre el mismo drawer que contiene la gestión.
  const mobileMenu = $('mobileMenuBtn');
  const mobileSidebar = $('sidebar');
  if (mobileMenu && mobileSidebar) {
    const syncMenuState = () => {
      const open = mobileSidebar.classList.contains('open');
      mobileMenu.setAttribute('aria-expanded', String(open));
      mobileMenu.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      mobileMenu.title = open ? 'Cerrar menú' : 'Abrir menú';
    };
    mobileMenu.addEventListener('click', () => requestAnimationFrame(syncMenuState));
    if ('MutationObserver' in window) {
      const drawerObserver = new MutationObserver(syncMenuState);
      drawerObserver.observe(mobileSidebar, {attributes:true, attributeFilter:['class']});
    }
    const closeDrawer = () => {
      mobileSidebar.classList.remove('open');
      syncMenuState();
    };
    mobileSidebar.addEventListener('click', event => {
      const action = event.target.closest(
        '#newScriptBtn,#savedScriptsBrowseBtn,#projectImportBtn,#projectSaveBtn,' +
        '#projectSaveAsBtn,#guioneroStructureBtn,#guioneroSettingsBtn,.nav-item'
      );
      if (action) closeDrawer();
    });
    $('savedScriptSelect')?.addEventListener('change', closeDrawer);
    syncMenuState();
  }

  // Cuando el teclado reduce el viewport, conserva visible la línea que tiene el cursor.
  let activeLineFrame = 0;
  const keepActiveScriptLineVisible = () => {
    if (activeLineFrame) cancelAnimationFrame(activeLineFrame);
    activeLineFrame = requestAnimationFrame(() => {
      const workspace = $('workspace');
      const editor = $('script');
      if (!workspace || !editor || !editor.contains(document.activeElement) &&
          document.activeElement !== editor) return;
      const selection = window.getSelection?.();
      let node = selection?.anchorNode || document.activeElement;
      if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
      const line = node?.closest?.('#script .script-line') ||
        editor.querySelector('.script-line[data-active="true"]');
      if (!line) return;
      const view = workspace.getBoundingClientRect();
      const rect = line.getBoundingClientRect();
      const margin = 12;
      if (rect.bottom > view.bottom - margin) {
        workspace.scrollTop += rect.bottom - view.bottom + margin;
      } else if (rect.top < view.top + margin) {
        workspace.scrollTop -= view.top - rect.top + margin;
      }
    });
  };
  document.addEventListener('focusin', event => {
    if (event.target === $('script') || $('script')?.contains(event.target)) {
      keepActiveScriptLineVisible();
    }
  }, true);
  window.visualViewport?.addEventListener('resize', keepActiveScriptLineVisible, {passive:true});
  window.visualViewport?.addEventListener('scroll', keepActiveScriptLineVisible, {passive:true});


  function mobileToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(mobileToast.timer);
    mobileToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  /* Script: los botones móviles convierten la línea activa sin abrir el selector de creación. */
  const scriptPane = $('paneScript');
  const script = $('script');
  const formatDetails = $('androidScriptFormatDetails');
  if (scriptPane && script && !$('guioneroMobileScriptToolbar')) {
    if (!$('guioneroMobileScriptToolbarStyle')) {
      const style = document.createElement('style');
      style.id = 'guioneroMobileScriptToolbarStyle';
      style.textContent = '.guionero-mobile-script-toolbar{position:relative;z-index:35;flex:0 0 auto;display:flex;align-items:stretch;gap:6px;width:100%;max-width:100%;box-sizing:border-box;overflow-x:auto;overflow-y:hidden;padding:7px 9px;border-bottom:1px solid var(--line);background:var(--panel);-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-width:none}.guionero-mobile-script-toolbar::-webkit-scrollbar{display:none}.guionero-mobile-script-tool{display:flex;flex:0 0 auto;min-width:68px;min-height:44px;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px 8px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);font:700 10px/1.2 system-ui,sans-serif;touch-action:manipulation}.guionero-mobile-script-tool:active,.guionero-mobile-script-tool:focus-visible{border-color:var(--accent);background:var(--accent-soft);outline:none}.guionero-mobile-script-tool .mobile-tool-icon{font-size:15px;line-height:1}.guionero-mobile-script-tool .mobile-tool-label{white-space:nowrap}';
      document.head.appendChild(style);
    }
    const bar = document.createElement('div');
    bar.id = 'guioneroMobileScriptToolbar';
    bar.className = 'guionero-mobile-script-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Herramientas de formato del guion');
    const entries = [
      ['SCENE', '▣', 'Escena'],
      ['CHARACTER', '♙', 'Personaje'],
      ['DIALOGUE', '☷', 'Diálogo'],
      ['INTRO', '☆', 'Intro'],
      ['ACTION', '✎', 'Acción'],
      ['PARENTHETICAL', '(', 'Parentética'],
      ['TRANSITION', '⇢', 'Transición']
    ];
    function applyType(type) {
      const apply = window.GuioneroApplyScriptElementType;
      if (typeof apply !== 'function' || apply(type) !== true) {
        mobileToast('Coloca el cursor en la línea que quieres cambiar.');
      }
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
      button.addEventListener('click', () => applyType(type));
      bar.appendChild(button);
    });
    // La barra vive fuera del contenedor #workspace que desplaza el guion: permanece siempre a la vista.
    const reference = $('workspace') || formatDetails || $('scriptFormatToolbar')?.parentElement || $('scriptProjectToolbar');
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
  if (shapeMenu && !$('guioneroMobilePaintShapeOptions')) {
    const panel = document.createElement('div');
    panel.id = 'guioneroMobilePaintShapeOptions';
    panel.className = 'guionero-mobile-shape-options';
    panel.hidden = true;
    const label = document.createElement('label');
    label.textContent = 'Transparencia de la forma';
    const range = document.createElement('input');
    range.type = 'range';
    range.id = 'guioneroMobilePaintShapeOpacity';
    range.min = '5';
    range.max = '100';
    range.value = '100';
    range.setAttribute('aria-label', 'Transparencia de las formas');
    label.appendChild(range);
    panel.appendChild(label);
    paintPane.appendChild(panel);
    const syncShapeOptions = () => {
      panel.hidden = !['rect', 'ellipse'].includes($('paintTool')?.value);
    };
    $('paintTool')?.addEventListener('change', syncShapeOptions);
    syncShapeOptions();
  }

})();
