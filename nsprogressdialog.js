/**
 * @NApiVersion 2.0
 * @NModuleScope SameAccount
 */

/**
 * @date 2026-09-04
 * @version 1.1.0
 */

define(['N/https'], function (https) {
  const DEFAULT_TITLE = 'Processing...';
  const END_DELAY = 3000;
  const STAGGER_WINDOW = 300; // ms to spread a single pane-render batch across
  const MAX_ANIMATED = 200; // pane count above which the list renders virtualized (no cascade)
  const PANE_HEIGHT = 34; // virtual row height (px); matches .tl-vwindow .tl-pane
  const RETRY_LIMIT = 3; // consecutive transient failures (exceptions) before rejecting; does NOT count toward maxChecks
  const REDUCED_MOTION = typeof window !== 'undefined' && !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeInstance = null;

  function _el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  const _checkSvg = (function () {
    const wrap = document.createElement('span');
    wrap.innerHTML = `
      <svg class="tl-pane-dot" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M320 576C178.6 576 64 461.4 64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576zM438 209.7C427.3 201.9 412.3 204.3 404.5 215L285.1 379.2L233 327.1C223.6 317.7 208.4 317.7 199.1 327.1C189.8 336.5 189.7 351.7 199.1 361L271.1 433C276.1 438 282.9 440.5 289.9 440C296.9 439.5 303.3 435.9 307.4 430.2L443.3 243.2C451.1 232.5 448.7 217.5 438 209.7z"/>
      </svg>
    `;
    return wrap.children[0]; // the <svg> element (skip leading-whitespace text node)
  })();

  function _checkIcon() {
    return _checkSvg.cloneNode(true);
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

      .tl-panes { max-height: 160px; overflow-y: auto; }
      .tl-panes-area { margin-top: 12px; }
      .tl-panes-count { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 6px; text-align: right; }
      .tl-pane { display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 4px; border: 1px solid #e5e7eb; border-radius: var(--tl-radius); background: #f9fafb; color: var(--tl-accent); font-size: 12px; font-weight: 500; text-decoration: none; cursor: pointer; transition: background .15s, border-color .15s; animation: tl-pane-in .22s ease backwards; }
      .tl-pane:hover { background: #eff6ff; border-color: var(--tl-accent); }
      .tl-pane .tl-pane-dot { flex: none; width: 14px; height: 14px; color: var(--tl-accent); }
      .tl-pane .tl-pane-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-pane.entered { animation: none; }
      .tl-vspace { overflow: hidden; }
      .tl-vwindow .tl-pane { height: 34px; box-sizing: border-box; margin: 0; }
      @keyframes tl-pane-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: none; }
      }

      .tl-error { margin-top: 12px; border: 1px solid #fca5a5; border-radius: var(--tl-radius); background: #fef2f2; padding: 8px 10px; max-height: 140px; overflow-y: auto; }
      .tl-error-text { font-size: 12px; line-height: 1.4; color: #b91c1c; white-space: pre-wrap; word-break: break-word; }

      @media (prefers-reduced-motion: reduce) {
        .tl-pane { animation: none; }
        .tl-bar, .tl-mini-bar { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function progressUpdater(options, ui) {
    return new Promise(function (resolve, reject) {
      let failures = 0; // consecutive exceptions (governed by RETRY_LIMIT)
      let checks = 0; // successful non-terminal PROCESSING polls (governed by maxChecks)
      const id = setInterval(function () {
        if (ui.stopped) { clearInterval(id); return; } // dialog closed / cleaned up: stop polling
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
          failures = 0; // a successful poll resets the transient-failure counter

          options.mrTaskId = body.mrTaskId;
          options.status = body.status;
          options.stage = body.stage;
          options.pendingCount = body.pendingCount;
          options.totalCount = body.totalCount;
          options.processedCount = Math.max(0, options.totalCount - options.pendingCount);
          options.percentage = body.percentage;
          if (options.status === 'COMPLETE') options.percentage = 100;
          options.panes = Array.isArray(body.panes) ? body.panes : (options.panes || []);
          options.errorMsg = typeof body.errorMsg === 'string' && body.errorMsg ? body.errorMsg : (options.errorMsg || '');

          ui.update(options);

          if (options.status === 'COMPLETE') {
            clearInterval(id);
            resolve();
          } else if (options.status === 'FAILED') {
            clearInterval(id);
            reject(new Error(options.errorMsg || 'Backend processing has failed.'));
          } else {
            checks++; // successful PROCESSING poll -> counts toward maxChecks timeout
            if (options.maxChecks && checks >= options.maxChecks) {
              clearInterval(id);
              reject(new Error('Task check timed out after ' + options.maxChecks + ' attempts.'));
            }
          }
        } catch (e) {
          failures++; // transient exception - governed by RETRY_LIMIT, not counted toward maxChecks
          if (failures >= RETRY_LIMIT) {
            clearInterval(id);
            reject(new Error('An error occurred during progress update: ' + e.message));
          }
          // else: transient failure - keep polling on the next tick
        }
      }, 1000);
    });
  }

  function ProgressDialogUI(options) {
    let minimized = false;
    let root = null; // backdrop container (modal)
    let mini = null; // lower-right widget
    let refs = { paneList: [] };
    let cardEl = null;
    let dragStart = null;
    const dragOffset = { x: 0, y: 0 };
    let countTimers = [];
    let virtual = false; // this instance renders the pane list windowed (large lists)
    let onVirtualScroll = null;
    let vRaf = null; // pending rAF for throttled virtual scroll render
    let vFrom = -1;
    let vTo = -1;
    let vTotal = -1; // last-rendered virtual window (for unchanged-window skip)

    function buildModal() {
      root = _el('div', 'tl-backdrop');
      root.id = 'tl_backdrop';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');

      const card = _el('div', 'tl-card');
      cardEl = card;
      card.innerHTML = `
        <div class="tl-header">
          <div class="tl-title"></div>
          ${(options.allowMinimize || options.closable) ? `
          <div class="tl-controls">
            ${options.allowMinimize ? '<button type="button" class="tl-btn min-btn" title="Minimize" aria-label="Minimize">\u2500</button>' : ''}
            ${options.closable ? '<button type="button" class="tl-btn close-btn" title="Close" aria-label="Close">\u2715</button>' : ''}
          </div>` : ''}
        </div>
        <div class="tl-body">
          ${options.message ? '<p class="tl-message"></p>' : ''}
          <div class="tl-grid">
            <div class="tl-cell"><b class="tl-status"></b></div>
            <div class="tl-cell tl-right"><span class="tl-percent">0%</span></div>
          </div>
          <div class="tl-track"><div class="tl-bar"></div></div>
          <div class="tl-grid tl-grid-bot">
            <div class="tl-cell"><span class="tl-count">0 of 0</span></div>
            <div class="tl-cell tl-right stage-cell"><b class="tl-stage"></b></div>
          </div>
          <div class="tl-error" style="display:none"><div class="tl-error-text"></div></div>
          <div class="tl-panes-area" style="display:none"><div class="tl-panes-count"></div><div class="tl-panes"></div></div>
        </div>
      `;

      refs.status = card.querySelector('.tl-status');
      refs.status.textContent = options.status || '';
      refs.stage = card.querySelector('.tl-stage');
      refs.percent = card.querySelector('.tl-percent');
      refs.bar = card.querySelector('.tl-bar');
      refs.count = card.querySelector('.tl-count');
      refs.stageCell = card.querySelector('.stage-cell');
      refs.errBox = card.querySelector('.tl-error');
      refs.error = card.querySelector('.tl-error-text');
      refs.panesArea = card.querySelector('.tl-panes-area');
      refs.panesCount = card.querySelector('.tl-panes-count');
      refs.panesWrap = card.querySelector('.tl-panes');

      if (options.message) card.querySelector('.tl-message').textContent = options.message;
      card.querySelector('.tl-title').textContent = options.title;

      // drag the modal by its header (ignore clicks on the min/close controls)
      card.querySelector('.tl-header').addEventListener('mousedown', function (ev) {
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
      if (options.allowMinimize) card.querySelector('.min-btn').addEventListener('click', minimize);
      if (options.closable) card.querySelector('.close-btn').addEventListener('click', close);

      root.appendChild(card);
    }

    function buildMini() {
      mini = _el('div', 'tl-mini');
      mini.id = 'tl_mini';
      mini.innerHTML = `
        <div class="tl-mini-label"></div>
        <div class="tl-mini-track"><div class="tl-mini-bar" style="width:0%"></div></div>
        ${options.closable ? '<button type="button" class="tl-mini-close" aria-label="Close">\u2715</button>' : ''}
      `;
      mini.addEventListener('click', restore);
      mini.querySelector('.tl-mini-label').textContent = options.title;
      refs.miniBarInner = mini.querySelector('.tl-mini-bar');

      // small close on the widget (only when closable)
      if (options.closable) {
        mini.querySelector('.tl-mini-close').addEventListener('click', function (e) {
          e.stopPropagation();
          close();
        });
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

      if (Array.isArray(o.panes)) renderPanes(o.panes);

      if (o.errorMsg) {
        refs.error.textContent = o.errorMsg;
        refs.errBox.style.display = '';
      }
    };

    // Render record panes only - never touches status, percentage, count, or bar.
    this.addPanes = function (panes) {
      if (Array.isArray(panes)) renderPanes(panes);
    };

    function renderPanes(panes) {
      if (!refs.panesWrap) return; // instance has been cleaned up
      refs.panesRenderedSet = refs.panesRenderedSet || new Set();
      const seen = new Set();
      const batch = [];
      panes.forEach(function (p) {
        if (!p || !p.url) return;
        if (refs.panesRenderedSet.has(p.url) || seen.has(p.url)) return;
        seen.add(p.url);
        batch.push(p);
      });
      const m = batch.length;
      const base = refs.paneList.length; // count already rendered before this batch
      // maintain the ordered list + dedup set
      batch.forEach(function (p) {
        refs.panesRenderedSet.add(p.url);
        refs.paneList.push(p);
      });

      if (!refs.paneList.length) {
        refs.panesArea.style.display = 'none';
        countTimers.forEach(clearTimeout);
        countTimers = [];
        return;
      }
      refs.panesArea.style.display = '';

      // large list: switch to virtualized (windowed) rendering once
      if (!virtual && refs.paneList.length > MAX_ANIMATED) switchToVirtual();
      if (virtual) { renderVirtual(); return; }

      if (m === 0) {
        // No new panes this call: refresh the label only while nothing is mid-cascade.
        if (!countTimers.length && refs.panesCount) refs.panesCount.textContent = 'Count: ' + base;
        return;
      }

      if (refs.panesCount) refs.panesCount.textContent = 'Count: ' + base;
      const rows = batch.map(buildPaneRow);

      if (REDUCED_MOTION) {
        // no animations wanted: insert the whole batch now with the final count
        rows.forEach(function (row) {
          if (refs.panesWrap) refs.panesWrap.appendChild(row);
        });
        if (refs.panesCount) refs.panesCount.textContent = 'Count: ' + refs.paneList.length;
        return;
      }

      // defer insertion so the container height/scrollbar grows one row at a time with the reveal
      for (let i = 0; i < m; i++) {
        const delay = m > 1 ? Math.round((i / (m - 1)) * STAGGER_WINDOW) : 0;
        const val = base + (i + 1);
        let t = setTimeout(function () {
          const idx = countTimers.indexOf(t);
          if (idx > -1) countTimers.splice(idx, 1);
          const row = rows[i];
          if (refs.panesWrap) refs.panesWrap.appendChild(row);
          if (refs.panesCount) refs.panesCount.textContent = 'Count: ' + val;
          row.addEventListener('animationend', function () {
            row.classList.add('entered'); // freeze final state; no replay on re-attach
          }, { once: true });
        }, delay);
        countTimers.push(t);
      }
    }

    function buildPaneRow(p) {
      const row = _el('a', 'tl-pane');
      row.href = p.url;
      row.target = '_blank';
      row.rel = 'noopener noreferrer';
      row.appendChild(_checkIcon());
      row.appendChild(_el('span', 'tl-pane-text', p.text || p.url));
      return row;
    }

    function switchToVirtual() {
      countTimers.forEach(clearTimeout);
      countTimers = [];
      virtual = true;
      // single wipe: drop any appended small-mode rows, then lay the persistent scaffold
      refs.panesWrap.innerHTML = '';
      refs.vTop = _el('div', 'tl-vspace');
      refs.vWin = _el('div', 'tl-vwindow');
      refs.vBot = _el('div', 'tl-vspace');
      refs.panesWrap.appendChild(refs.vTop);
      refs.panesWrap.appendChild(refs.vWin);
      refs.panesWrap.appendChild(refs.vBot);
      if (!onVirtualScroll) {
        onVirtualScroll = function () {
          if (vRaf) return;
          vRaf = requestAnimationFrame(function () {
            vRaf = null;
            renderVirtual();
          });
        };
        refs.panesWrap.addEventListener('scroll', onVirtualScroll);
      }
      renderVirtual();
    }

    function renderVirtual() {
      if (!refs.panesWrap || !virtual) return;
      const total = refs.paneList.length;
      if (!total) return;
      const H = PANE_HEIGHT;
      const ch = refs.panesWrap.clientHeight || 160;
      const st = refs.panesWrap.scrollTop || 0;
      const from = Math.max(0, Math.floor(st / H) - 3);
      const to = Math.min(total, Math.ceil((st + ch) / H) + 3);
      // skip if the window has not changed (avoids needless row rebuild on tiny scrolls/re-fires)
      if (vFrom === from && vTo === to && vTotal === total) return;
      vFrom = from;
      vTo = to;
      vTotal = total;
      // spacers persist, so the content height (total*H) and scrollTop stay stable across scrolls
      refs.vTop.style.height = (from * H) + 'px';
      refs.vBot.style.height = ((total - to) * H) + 'px';
      const win = refs.vWin;
      win.innerHTML = ''; // swap only the window rows
      for (let i = from; i < to; i++) {
        const row = buildPaneRow(refs.paneList[i]);
        row.classList.add('entered'); // no animation in virtual mode
        win.appendChild(row);
      }
      if (refs.panesCount) refs.panesCount.textContent = 'Count: ' + total;
    }

    this.finalize = function (status) {
      // ensure the right final color (+ keep widget/mini in sync) even if minimized
      const o = {
        status: status === 'complete' ? 'COMPLETE' : 'FAILED',
        percentage: 100,
        stage: options.stage,
        processedCount: options.processedCount,
        totalCount: options.totalCount,
        errorMsg: options.errorMsg,
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
      const cb = this._cancelCb;
      this._cancelCb = null;
      cleanup();
      if (typeof cb === 'function') {
        const err = new Error('Dialog closed before completion.');
        err.canceled = true; // consumer marker: distinguish early-close from a real failure
        cb(err); // rejects the pending create() promise (no-op if already settled)
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
      countTimers.forEach(clearTimeout);
      countTimers = [];
      if (onVirtualScroll && refs.panesWrap) {
        refs.panesWrap.removeEventListener('scroll', onVirtualScroll);
        onVirtualScroll = null;
      }
      if (vRaf) { cancelAnimationFrame(vRaf); vRaf = null; }
      vFrom = vTo = vTotal = -1;
      virtual = false;
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
    this._cancelCb = null;
    this.onCancel = function (fn) { this._cancelCb = fn; };
  }

  /**
   * Shared end-of-processing flow: for non-closable + autoclose, auto-cleanup the modal
   * after END_DELAY; otherwise keep the final colored state. No navigation - the consumer
   * owns reload/redirect via the resolved/rejected promise (or its own controller calls).
   * @private
   */
  function endFlow(options, ui, cb) {
    if (!options.closable && options.autoclose) {
      setTimeout(function () {
        ui.cleanup();
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
    const last = {
      processed: 0,
      total: 100,
      panes: Array.isArray(options.panes) ? options.panes : [],
      errorMsg: '',
    };
    const payload = function (status, pct) {
      const o = {
        status: status,
        percentage: pct,
        processedCount: last.processed,
        totalCount: last.total,
      };
      if (last.panes && last.panes.length) o.panes = last.panes;
      if (last.errorMsg) o.errorMsg = last.errorMsg;
      return o;
    };
    const currentPct = function () {
      return last.total > 0 ? Math.round((last.processed / last.total) * 100) : 0;
    };
    return {
      /**
       * Update progress from a count. Percentage is auto-computed.
       * @param {Object} data
       * @param {number} [data.processed] - Items processed (default 0).
       * @param {number} [data.total] - Total items (default 100).
       * @param {Array} [data.panes] - Replace the list of {url, text} record panes.
       * @param {string} [data.errorMsg] - Error message to show in the error box.
       */
      update: function (data) {
        data = data || {};
        last.processed = data.processed == null ? 0 : data.processed;
        last.total = data.total == null ? 100 : data.total;
        if (Array.isArray(data.panes)) last.panes = data.panes;
        if (typeof data.errorMsg === 'string') last.errorMsg = data.errorMsg;
        ui.update(payload('PROCESSING', currentPct()));
      },
      /** Mark as complete (green), then run the end flow. */
      complete: function (data) {
        data = data || {};
        if (Array.isArray(data.panes)) last.panes = data.panes;
        if (typeof data.errorMsg === 'string') last.errorMsg = data.errorMsg;
        ui.update(payload('COMPLETE', 100));
        endFlow(options, ui);
      },
      /** Mark as failed (red), then run the end flow. */
      fail: function (data) {
        data = data || {};
        if (Array.isArray(data.panes)) last.panes = data.panes;
        if (typeof data.errorMsg === 'string') last.errorMsg = data.errorMsg;
        ui.update(payload('FAILED', currentPct()));
        endFlow(options, ui);
      },
      /** Append record panes without changing status or percentage; re-renders them. */
      addPanes: function (panes) {
        if (!Array.isArray(panes) || !panes.length) return;
        last.panes = last.panes.concat(panes);
        ui.addPanes(last.panes);
      },
      /** Close immediately: dismiss the dialog (no navigation - consumer owns it). */
      close: function () {
        ui.close();
      },
    };
  }

  function _normalizePanes(panes) {
    if (!Array.isArray(panes)) return [];
    const out = [];
    panes.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      const url = p.url;
      if (typeof url !== 'string' || !url) return;
      out.push({ url: url, text: typeof p.text === 'string' && p.text ? p.text : url });
    });
    return out;
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
   * @param {Object[]} [options.panes] - Initial list of {url, text} record panes (manual mode).
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

    // Manual mode: no Suitelet ids - client script drives the loader.
    const manualMode = !options.suiteletScriptId || !options.suiteletDeploymentId;
    if (manualMode) options.status = options.status || 'PROCESSING';

    const ui = new ProgressDialogUI(options);
    activeInstance = ui;

    if (manualMode) {
      return manualController(options, ui);
    }

    return new Promise(function (resolve, reject) {
      ui.onCancel(reject);

      progressUpdater(options, ui)
        .then(function () {
          ui.finalize('complete');
          endFlow(options, ui, resolve);
        })
        .catch(function (err) {
          if (!options.errorMsg) options.errorMsg = err.message;
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
   * Builds the JSON payload a Suitelet returns so the client can update progress.
   * @param {module} taskModule - The N/task module.
   * @param {string} mrTaskId - Task ID generated from execution
   * @param {string} suiteletScriptId - Suitelet Script String ID
   * @param {string} suiteletDeploymentId - Suitelet Deployment String ID
   * @param {Object[]} [resultRecords] - Optional list of {url, text} record panes to echo to the client.
   * @param {string} [errorMsg] - Optional error message to echo to the client (shown in the error box on failure).
   * @returns {Object}
   */
  function statusCheck(taskModule, mrTaskId, suiteletScriptId, suiteletDeploymentId, resultRecords, errorMsg) {
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
    const processedCount = Math.max(0, totalCount - pendingCount);
    const percentage = taskStatus.getPercentageCompleted();

    return {
      mrTaskId: mrTaskId,
      status: status,
      stage: stage,
      pendingCount: pendingCount,
      totalCount: totalCount,
      processedCount: processedCount,
      percentage: percentage,
      panes: _normalizePanes(resultRecords),
      errorMsg: typeof errorMsg === 'string' ? errorMsg : '',
      suiteletScriptId: suiteletScriptId,
      suiteletDeploymentId: suiteletDeploymentId,
    };
  }

  return {
    create: create,
    statusCheck: statusCheck,
  };
});
