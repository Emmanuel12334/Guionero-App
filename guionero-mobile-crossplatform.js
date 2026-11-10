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

  /* Mobile Script layout: keep the type controls above the only scrolling document area. */
  if (scriptPane && script && $('workspace') && $('guioneroMobileScriptToolbar')) {
    const style = document.createElement('style');
    style.id = 'guioneroMobileScriptLayoutStyle';
    style.textContent = [
      'body.guionero-mobile-device #paneScript{display:flex!important;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;overflow:hidden}',
      'body.guionero-mobile-device #guioneroMobileScriptToolbar{position:relative!important;top:auto!important;left:auto!important;right:auto!important;z-index:30;display:flex!important;flex:0 0 auto;align-self:stretch;box-sizing:border-box;width:100%;max-width:100%;min-height:58px;margin:0;padding:7px max(9px,env(safe-area-inset-right,0px)) 7px max(9px,env(safe-area-inset-left,0px));overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-bottom:1px solid var(--line);background:var(--panel)}',
      'body.guionero-mobile-device #guioneroMobileScriptToolbar::-webkit-scrollbar{display:none}',
      'body.guionero-mobile-device #guioneroMobileScriptToolbar .guionero-mobile-script-tool{flex:0 0 auto;min-width:68px;min-height:44px;padding:4px 8px;white-space:nowrap;touch-action:manipulation}',
      'body.guionero-mobile-device #workspace{flex:1 1 0;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:contain;scroll-padding-top:10px;scroll-padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}',
      'body.guionero-mobile-device.android-keyboard-visible #guioneroMobileScriptToolbar{display:flex!important;visibility:visible!important}',
      'body.guionero-mobile-device.android-keyboard-visible #workspace{min-height:0;overflow-y:auto}',
      'body.guionero-mobile-device #sidebar .sidebar-actions:empty{display:none!important}',
      'body.guionero-mobile-device #sidebar #projectManagementDock{display:flex;flex:0 1 auto;flex-direction:column;gap:8px;box-sizing:border-box;width:100%;max-width:100%;max-height:min(43dvh,390px);min-height:0;margin:0;padding:11px 12px;overflow-x:hidden;overflow-y:auto;border:0;border-bottom:1px solid var(--line);border-radius:0;background:var(--panel);overscroll-behavior:contain;scrollbar-width:thin}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .guionero-mobile-admin-heading{flex:0 0 auto;padding:2px 1px 7px;border-bottom:1px solid var(--line);color:var(--muted);font:850 10px/1.3 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}',
      'body.guionero-mobile-device #sidebar #projectManagementDock #newScriptBtn{display:flex;width:100%;min-height:44px;justify-content:center;align-items:center}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .script-project-toolbar{display:flex;flex:0 0 auto;flex-direction:column;align-items:stretch;gap:7px;width:100%;max-width:100%;padding:0;border:0;background:transparent}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .script-project-toolbar>*{box-sizing:border-box;width:100%;max-width:100%;min-width:0}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .script-project-toolbar .project-toolbar-label{padding:3px 1px;color:var(--muted);font:850 10px/1.3 system-ui,sans-serif;letter-spacing:.1em}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .script-project-toolbar select,body.guionero-mobile-device #sidebar #projectManagementDock .script-project-toolbar button{min-height:44px}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .script-save-indicator{min-height:28px}',
      'body.guionero-mobile-device #sidebar #projectManagementDock #projectLibraryStatus{display:block;min-height:0;overflow-wrap:anywhere}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .guionero-management-actions{display:flex;flex:0 0 auto;gap:7px;width:100%}',
      'body.guionero-mobile-device #sidebar #projectManagementDock .guionero-management-actions>*{flex:1 1 0;min-width:0;min-height:44px;padding:7px 6px;white-space:normal}',
      'body.guionero-mobile-device #sidebar .project-card{flex:0 0 auto;margin:8px 12px 12px}',
      'body.guionero-mobile-device #sidebar .nav-scroll{min-height:0}'
    ].join('');
    document.head.appendChild(style);
  }

  /* Reuse the hamburger drawer for every existing Script project-management control. */
  const sidebar = $('sidebar');
  const menuButton = $('mobileMenuBtn');
  const projectDock = $('projectManagementDock');
  if (sidebar && menuButton && projectDock) {
    const unwrapLegacyMobileToggle = () => {
      const content = projectDock.querySelector(':scope > .android-project-content');
      if (content) {
        while (content.firstChild) projectDock.insertBefore(content.firstChild, content);
        content.remove();
      }
      projectDock.querySelector(':scope > .android-project-toggle')?.remove();
    };
    const ensureProjectDockInDrawer = () => {
      unwrapLegacyMobileToggle();
      projectDock.classList.remove('project-management-mobile');
      projectDock.classList.add('guionero-mobile-project-drawer');
      if (!projectDock.querySelector('.guionero-mobile-admin-heading')) {
        const heading = document.createElement('div');
        heading.className = 'guionero-mobile-admin-heading';
        heading.textContent = 'GESTIÓN DE GUIONES';
        projectDock.insertBefore(heading, projectDock.firstChild);
      }
      const anchor = sidebar.querySelector('.project-card') || sidebar.querySelector('.nav-search') || sidebar.querySelector('.nav-scroll');
      if (anchor && projectDock.parentNode !== sidebar) sidebar.insertBefore(projectDock, anchor);
      else if (!anchor && projectDock.parentNode !== sidebar) sidebar.appendChild(projectDock);
      const emptyActions = sidebar.querySelector('.sidebar-actions');
      if (emptyActions && !emptyActions.children.length) emptyActions.remove();
    };
    ensureProjectDockInDrawer();

    // The legacy mount routine moves this node back into Script on viewport resize.
    // Re-home the same DOM node after those resizes (including virtual-keyboard changes).
    const layoutRoot = document.querySelector('.app') || document.body;
    if ('MutationObserver' in window) {
      const drawerObserver = new MutationObserver(() => {
        if (projectDock.parentNode !== sidebar) ensureProjectDockInDrawer();
      });
      drawerObserver.observe(layoutRoot, { childList:true, subtree:true });
    }
    window.addEventListener('resize', ensureProjectDockInDrawer, { passive:true });
    window.visualViewport?.addEventListener('resize', ensureProjectDockInDrawer, { passive:true });
    window.addEventListener('orientationchange', ensureProjectDockInDrawer, { passive:true });

    const closeDrawer = () => {
      sidebar.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    };
    menuButton.setAttribute('aria-haspopup', 'true');
    menuButton.setAttribute('aria-controls', 'sidebar');
    menuButton.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    menuButton.addEventListener('click', () => {
      requestAnimationFrame(() => menuButton.setAttribute('aria-expanded', String(sidebar.classList.contains('open'))));
    });
    document.addEventListener('pointerdown', event => {
      if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !menuButton.contains(event.target)) closeDrawer();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && sidebar.classList.contains('open')) closeDrawer();
    });
    const actionIds = new Set([
      'newScriptBtn','savedScriptsBrowseBtn','projectImportBtn','projectSaveBtn',
      'projectSaveAsBtn','guioneroStructureBtn','guioneroSettingsBtn'
    ]);
    // Capture at the document level because the existing New Project handler stops propagation.
    document.addEventListener('click', event => {
      const control = event.target.closest?.('button');
      if (control && actionIds.has(control.id)) setTimeout(closeDrawer, 0);
    }, true);
    $('savedScriptSelect')?.addEventListener('change', () => setTimeout(closeDrawer, 0));
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
