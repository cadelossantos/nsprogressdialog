/**
 * @NApiVersion 2.0
 * @NModuleScope SameAccount
 */

/**
 * @date 2025-08-26
 * @version 1.0.0
 */

define(['N/https'], function (https) {
  const DEFAULT_TITLE = 'Processing...';
  const END_DELAY = 3000;

  let activeInstance = null;

  function _el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function _injectStyles() {
    if (document.getElementById('tl_styles')) return;
    const style = _el('style');
    style.id = 'tl_styles';
    style.textContent = `
      .tl-backdrop, .tl-mini { 
        --tl-font: "Segoe UI", sans-serif; 
        --tl-gradient: linear-gradient(270deg, #0f8cf9ff 25%, #8ef3f8ff 50%, #0f8cf9ff 75%); 
        --tl-accent: #0f8cf9; 
        --tl-done: #22c55e; 
        --tl-fail: #ef4444; 
        --tl-radius: 6px; 
      }

      .tl-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,.45); font-family: var(--tl-font); }
      .tl-card { width: 420px; max-width: 92vw; border-radius: var(--tl-radius); background: #fff; box-shadow: 0 20px 50px rgba(0,0,0,.35); overflow: hidden; }

      .tl-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; background: #607799; cursor: move; }
      .tl-title { font-size: 12px; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-controls { display: flex; gap: 6px; flex: none; }
      .tl-btn { width: 24px; height: 24px; border-radius: 0; border: 1px solid transparent; background: transparent; color: white; font-size: 16px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s, border-color .15s; }
      .tl-btn:hover { background: #eef2f7; border-color: #d1d5db; color: #111827; }

      .tl-body { padding: 16px; }
      .tl-message { margin: 0 0 12px; font-size: 12px; color: #374151; }
      .tl-grid { display: grid; grid-template-columns: 1fr 1fr; align-items: baseline; column-gap: 12px; row-gap: 6px; }
      .tl-grid.tl-grid-bot { margin-top: 8px; }
      .tl-cell { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 12px; color: #4b5563; }
      .tl-cell.tl-right { justify-content: flex-end; }
      .tl-cell b { color: #111827; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-percent { font-size: 12px; font-weight: 700; color: var(--tl-accent); }
      .tl-percent.tl-done { color: var(--tl-done); }
      .tl-percent.tl-fail { color: var(--tl-fail); }
      .tl-count { font-size: 12px; color: #4b5563; }

      .tl-track { height: 14px; margin-top: 14px; border-radius: 0; background: #e5e7eb; overflow: hidden; }
      .tl-bar, .tl-mini-bar { height: 100%; width: 0%; border-radius: 0; background: var(--tl-gradient); background-size: 200% 100%; animation: tl-slide 2.5s linear infinite; transition: width .3s ease; }
      .tl-bar.tl-done { background: var(--tl-done); animation: none; transition: width .3s ease; }
      .tl-bar.tl-fail { background: var(--tl-fail); animation: none; transition: width .3s ease; }
      @keyframes tl-slide { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

      .tl-mini { position: fixed; right: 18px; bottom: 18px; z-index: 10000; width: 240px; padding: 12px 14px; border-radius: var(--tl-radius); background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.3); border: 1px solid #e5e7eb; font-family: var(--tl-font); cursor: pointer; }
      .tl-mini-label { font-size: 12px; font-weight: 600; color: #111827; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 18px; }
      .tl-mini-track { height: 6px; border-radius: 0; background: #e5e7eb; overflow: hidden; }
      .tl-mini-bar.tl-done { background: var(--tl-done); animation: none; }
      .tl-mini-bar.tl-fail { background: var(--tl-fail); animation: none; }
      .tl-mini-close { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border: none; background: transparent; color: #9ca3af; font-size: 16px; line-height: 1; cursor: pointer; padding: 0; border-radius: 0; display: flex; align-items: center; justify-content: center; }
      .tl-mini-close:hover { background: #eef2f7; color: #111827; }
    `;
    document.head.appendChild(style);
  }

  function progressUpdater(options, ui, checks) {
    checks = checks || 0;
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (options.stopped || ui.stopped) return; // dialog closed / cleaned up: stop polling
        try {
          const res = https.requestSuitelet({
            scriptId: options.suiteletScriptId,
            deploymentId: options.suiteletDeploymentId,
            body: JSON.stringify({
              data: options.data,
              mrTaskId: options.mrTaskId,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });

          const body = JSON.parse(res.body);

          options.mrTaskId = body.mrTaskId;
          options.status = body.status;
          options.stage = body.stage;
          options.pendingCount = body.pendingCount;
          options.totalCount = body.totalCount;
          options.processedCount = options.totalCount - options.pendingCount;
          options.percentage = body.percentage;

          ui.update(options);

          if (options.status === 'COMPLETE') {
            options.percentage = 100;
            ui.update(options);
            resolve();
          } else if (options.status === 'FAILED') {
            reject(new Error('Backend processing has failed.'));
          } else if (options.maxChecks && checks + 1 >= options.maxChecks) {
            reject(new Error('Task check timed out after ' + options.maxChecks + ' attempts.'));
          } else {
            progressUpdater(options, ui, checks + 1)
              .then(resolve)
              .catch(reject);
          }
        } catch (e) {
          reject(new Error('An error occurred during progress update: ' + e.message));
        }
      }, 1000);
    });
  }

  function ProgressDialogUI(options) {
    let minimized = false;
    let root = null; // backdrop container (modal)
    let mini = null; // lower-right widget
    let refs = {};
    let cardEl = null;
    let dragStart = null;
    const dragOffset = { x: 0, y: 0 };

    function buildModal() {
      root = _el('div', 'tl-backdrop');
      root.id = 'tl_backdrop';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');

      const card = _el('div', 'tl-card');
      cardEl = card;
      const header = _el('div', 'tl-header');
      // drag the modal by its header (ignore clicks on the min/close controls)
      header.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0) return;
        if (ev.target.closest('button')) return;
        ev.preventDefault();
        dragStart = {
          mouseX: ev.clientX,
          mouseY: ev.clientY,
          offX: dragOffset.x,
          offY: dragOffset.y,
        };
      });
      header.appendChild(_el('div', 'tl-title', options.title));

      const controls = _el('div', 'tl-controls');
      if (options.allowMinimize) {
        const minBtn = _el('button', 'tl-btn', '\u2500'); // "─"
        minBtn.type = 'button';
        minBtn.title = 'Minimize';
        minBtn.setAttribute('aria-label', 'Minimize');
        minBtn.addEventListener('click', minimize);
        controls.appendChild(minBtn);
      }
      if (options.closable) {
        const closeBtn = _el('button', 'tl-btn', '\u2715'); // "✕"
        closeBtn.type = 'button';
        closeBtn.title = 'Close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.addEventListener('click', close);
        controls.appendChild(closeBtn);
      }
      if (controls.childNodes.length) header.appendChild(controls);
      card.appendChild(header);

      const body = _el('div', 'tl-body');
      if (options.message) body.appendChild(_el('p', 'tl-message', options.message));

      refs.status = _el('b');
      refs.status.textContent = options.status || '';
      refs.stage = _el('b');

      // top row: status | percentage
      const topGrid = _el('div', 'tl-grid');
      const tL = _el('div', 'tl-cell');
      tL.appendChild(refs.status);
      const tR = _el('div', 'tl-cell tl-right');
      refs.percent = _el('span', 'tl-percent');
      refs.percent.textContent = '0%';
      tR.appendChild(refs.percent);
      topGrid.appendChild(tL);
      topGrid.appendChild(tR);
      body.appendChild(topGrid);

      // progress bar
      const track = _el('div', 'tl-track');
      refs.bar = _el('div', 'tl-bar');
      track.appendChild(refs.bar);
      body.appendChild(track);

      // bottom row: item count | stage
      const botGrid = _el('div', 'tl-grid tl-grid-bot');
      const bL = _el('div', 'tl-cell');
      refs.count = _el('span', 'tl-count', '0 of 0');
      bL.appendChild(refs.count);
      const bR = _el('div', 'tl-cell tl-right');
      bR.appendChild(refs.stage);
      refs.stageCell = bR;
      botGrid.appendChild(bL);
      botGrid.appendChild(bR);
      body.appendChild(botGrid);

      card.appendChild(body);
      root.appendChild(card);
    }

    function buildMini() {
      mini = _el('div', 'tl-mini');
      mini.id = 'tl_mini';
      mini.addEventListener('click', restore);

      const label = _el('div', 'tl-mini-label', options.title);
      mini.appendChild(label);

      const track = _el('div', 'tl-mini-track');
      refs.miniBarInner = _el('div', 'tl-mini-bar');
      refs.miniBarInner.style.width = '0%';
      track.appendChild(refs.miniBarInner);
      mini.appendChild(track);

      // small close on the widget (only when closable)
      if (options.closable) {
        const mc = _el('button', 'tl-mini-close', '\u2715');
        mc.type = 'button';
        mc.setAttribute('aria-label', 'Close');
        mc.addEventListener('click', function (e) {
          e.stopPropagation();
          close();
        });
        mini.appendChild(mc);
      }
    }

    function show() {
      _injectStyles();
      buildModal();
      document.body.appendChild(root);
    }

    this.update = function (o) {
      if (!refs.bar) return; // instance has been cleaned up (new create() replaced it)
      let pct = o.percentage == null ? 0 : o.percentage;
      pct = Math.min(100, Math.max(0, pct));
      refs.status.textContent = o.status == null ? '' : o.status;
      if (o.stage) {
        refs.stage.textContent = o.stage;
        refs.stageCell.style.display = '';
      } else {
        refs.stageCell.style.display = 'none';
      }
      refs.percent.textContent = pct + '%';
      refs.count.textContent = (o.processedCount || 1) + ' of ' + (o.totalCount || 1);
      refs.bar.style.width = pct + '%';

      if (refs.miniBarInner) refs.miniBarInner.style.width = Math.min(100, pct) + '%';

      if (o.status === 'COMPLETE') {
        refs.bar.classList.add('tl-done');
        refs.bar.classList.remove('tl-fail');
        refs.percent.classList.add('tl-done');
        refs.percent.classList.remove('tl-fail');
        if (refs.miniBarInner) refs.miniBarInner.classList.add('tl-done');
      } else if (o.status === 'FAILED') {
        refs.bar.classList.add('tl-fail');
        refs.bar.classList.remove('tl-done');
        refs.percent.classList.add('tl-fail');
        refs.percent.classList.remove('tl-done');
        if (refs.miniBarInner) refs.miniBarInner.classList.add('tl-fail');
      } else {
        refs.bar.classList.remove('tl-done');
        refs.bar.classList.remove('tl-fail');
        refs.percent.classList.remove('tl-done');
        refs.percent.classList.remove('tl-fail');
      }
    };

    this.finalize = function (status) {
      // ensure the right final color (+ keep widget/mini in sync) even if minimized
      const o = {
        status: status === 'complete' ? 'COMPLETE' : 'FAILED',
        percentage: 100,
        stage: options.stage,
        processedCount: options.processedCount,
        totalCount: options.totalCount,
      };
      this.update(o);
    };

    function minimize() {
      if (minimized) return;
      minimized = true;
      if (root) root.remove();
      if (!mini) buildMini();
      document.body.appendChild(mini);
    }

    function restore() {
      if (!minimized) return;
      minimized = false;
      if (mini) mini.remove();
      document.body.appendChild(root);
    }

    function close() {
      cleanup();
      if (options.redirectTo) {
        window.location = options.redirectTo;
      } else {
        window.location.reload();
      }
    }

    function cleanup() {
      this.stopped = true;
      if (root) {
        root.remove();
        root = null;
      }
      if (mini) {
        mini.remove();
        mini = null;
      }
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragUp);
      cardEl = null;
      dragStart = null;
      refs = {};
      activeInstance = null;
    }

    function onDragMove(ev) {
      if (!dragStart || !cardEl) return;
      const x = ev.clientX - dragStart.mouseX + dragStart.offX;
      const y = ev.clientY - dragStart.mouseY + dragStart.offY;
      dragOffset.x = x;
      dragOffset.y = y;
      cardEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    }
    function onDragUp() {
      dragStart = null;
    }
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);

    show();
    this.stopped = false;
    this.close = close;
    this.cleanup = cleanup;
  }

  /**
   * Creates and shows a progress modal.
   *
   * When suiteletScriptId AND suiteletDeploymentId are provided, returns a Promise
   * and auto-polls the Suitelet for task status (map/reduce flow).
   * Otherwise returns a controller object ({ update, complete, fail, close }) that
   * lets a client script drive progress directly - no polling, no stage.
   *
   * @param {Object} options
   * @param {string} [options.title] - Modal title. Default 'Processing...'.
   * @param {string} [options.message] - Optional message shown under the header.
   * @param {boolean} [options.closable] - Show close button. Default false.
   * @param {boolean} [options.allowMinimize] - Show minimize button. Default false.
   * @param {boolean} [options.autoclose] - Auto-close ~3s after COMPLETE/FAILED (non-closable). Default true.
   * @param {string} [options.redirectTo] - URL to navigate to on close; empty reloads the page.
   * @param {string} [options.suiteletScriptId]
   * @param {string} [options.suiteletDeploymentId]
   * @param {Object} [options.data]
   * @param {string} [options.mrTaskId]
   * @returns {Promise|Object}
   */
  function create(options) {
    if (!options || typeof options !== 'object') {
      return Promise.reject(new Error('create() requires an options object.'));
    }

    // destroy any previously rendered instance
    if (activeInstance) activeInstance.cleanup();

    options.closable = options.closable === true;
    options.allowMinimize = options.allowMinimize === true;
    options.autoclose = options.autoclose !== false;
    options.title = options.title || DEFAULT_TITLE;
    options.redirectTo = options.redirectTo || '';

    // Manual mode: no Suitelet ids - client script drives the loader.
    const manualMode = !options.suiteletScriptId || !options.suiteletDeploymentId;
    if (manualMode) options.status = options.status || 'PROCESSING';

    const ui = new ProgressDialogUI(options);
    activeInstance = ui;

    if (manualMode) {
      return manualController(options, ui);
    }

    return new Promise(function (resolve, reject) {
      progressUpdater(options, ui)
        .then(function () {
          ui.finalize('complete');
          endFlow(options, ui, resolve);
        })
        .catch(function (err) {
          ui.finalize('failed');
          if (options.closable) {
            // closable modal shows final red state; user closes it.
            reject(err);
          } else {
            endFlow(options, ui, function () {
              reject(err);
            });
          }
        });
    });
  }

  /**
   * Shared end-of-processing flow: auto-close (non-closable + autoclose), else keep
   * the final colored state and resolve/settle via cb. Runs redirect/reload when it closes.
   * @private
   */
  function endFlow(options, ui, cb) {
    if (!options.closable && options.autoclose) {
      setTimeout(function () {
        ui.cleanup();
        if (options.redirectTo) {
          window.location = options.redirectTo;
        } else {
          window.location.reload();
        }
        cb && cb();
      }, END_DELAY);
    } else {
      // non-closable w/o autoclose, or closable: keep final color until user closes
      cb && cb();
    }
  }

  /**
   * Returns the manual-mode controller. No polling; the caller feeds progress via
   * update() and signals completion via complete()/fail().
   * @private
   */
  function manualController(options, ui) {
    const last = { processed: 0, total: 100 };
    return {
      /**
       * Update progress from a count. Percentage is auto-computed.
       * @param {Object} data
       * @param {number} [data.processed] - Items processed (default 0).
       * @param {number} [data.total] - Total items (default 100).
       */
      update: function (data) {
        data = data || {};
        last.processed = data.processed == null ? 0 : data.processed;
        last.total = data.total == null ? 100 : data.total;
        const pct = last.total > 0 ? Math.round((last.processed / last.total) * 100) : 0;
        ui.update({
          status: 'PROCESSING',
          percentage: pct,
          processedCount: last.processed,
          totalCount: last.total,
        });
      },
      /** Mark as complete (green), then run the end flow. */
      complete: function () {
        ui.update({
          status: 'COMPLETE',
          percentage: 100,
          processedCount: last.processed,
          totalCount: last.total,
        });
        endFlow(options, ui);
      },
      /** Mark as failed (red), then run the end flow. */
      fail: function () {
        const pct = last.total > 0 ? Math.round((last.processed / last.total) * 100) : 0;
        ui.update({
          status: 'FAILED',
          percentage: pct,
          processedCount: last.processed,
          totalCount: last.total,
        });
        endFlow(options, ui);
      },
      /** Close immediately: cleanup + redirect/reload per redirectTo. */
      close: function () {
        ui.close();
      },
    };
  }

  /**
   * Builds the JSON payload a Suitelet returns so the client can update progress.
   * @param {module} taskModule - The N/task module.
   * @param {string} mrTaskId - Task ID generated from execution
   * @param {string} suiteletScriptId - Suitelet Script String ID
   * @param {string} suiteletDeploymentId - Suitelet Deployment String ID
   * @returns {Object}
   */
  function statusCheck(taskModule, mrTaskId, suiteletScriptId, suiteletDeploymentId) {
    const taskStatus = taskModule.checkStatus(mrTaskId);
    const status = taskStatus.status;
    const stage = taskStatus.stage;
    let pendingCount = 0;
    let totalCount = 0;

    if (stage === 'MAP') {
      pendingCount = taskStatus.getPendingMapCount();
      totalCount = taskStatus.getTotalMapCount();
    } else if (stage === 'REDUCE') {
      pendingCount = taskStatus.getPendingReduceCount();
      totalCount = taskStatus.getTotalReduceCount();
    }
    const processedCount = totalCount - pendingCount;
    const percentage = taskStatus.getPercentageCompleted();

    return {
      mrTaskId: mrTaskId,
      status: status,
      stage: stage,
      pendingCount: pendingCount,
      totalCount: totalCount,
      processedCount: processedCount,
      percentage: percentage,
      suiteletScriptId: suiteletScriptId,
      suiteletDeploymentId: suiteletDeploymentId,
    };
  }

  return {
    create: create,
    statusCheck: statusCheck,
  };
});
