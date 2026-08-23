/**
 * ============================================================
 * APP-UI.JS
 * User interface rendering module
 * Handles all UI rendering, charts, tables, and visual updates
 * ============================================================
 */

window.FloodGuardUI = (() => {
  const stateApi = window.FloodGuardState;
  const config = window.FloodGuardConfig;
  const { state, $, statusForLevel, formatMeters } = stateApi;

  function toast(msg) {
    const wrap = $('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  function setMobileMenu(open) {
    const menu = $('sidebarMenu');
    const toggle = $('menuToggle');
    const header = document.querySelector('header.top');
    if (!menu || !toggle) return;

    // Anchor the menu below the sticky header, even while the page scrolls.
    if (open && header) {
      document.documentElement.style.setProperty('--mobile-menu-top', `${header.getBoundingClientRect().bottom}px`);
    }

    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    menu.classList.toggle('mobile-open', open);
  }

  function showView(key) {
    document.querySelectorAll('.view-section').forEach((s) => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === key));
    $('view-' + key).classList.add('active');
    $('viewTitleText').textContent = config.VIEW_LABELS[key];
    if (key === 'historical') {
      drawChartOn($('historyChart'));
      renderHistoryTable();
    }
  }

  function renderThresholds() {
    const wrap = $('thresholdList');
    if (!wrap) return;
    wrap.innerHTML = '';
    config.THRESHOLDS.forEach((t) => {
      if (t.key === 'normal') return;
      const row = document.createElement('div');
      row.className = `th-row th-${t.key}`;
      row.style.setProperty('--threshold-color', t.color);
      row.innerHTML = `
        <span class="th-dot"></span>
        <span><span class="th-name">${t.name}</span><span class="th-desc">${t.desc}</span></span>
        <input type="range" min="20" max="119" value="${t.min}" id="range-${t.key}">
        <span class="th-val" id="val-${t.key}">${t.min} cm</span>
      `;
      wrap.appendChild(row);
      row.querySelector('input').addEventListener('input', (e) => {
        t.min = parseInt(e.target.value, 10);
        row.querySelector('.th-val').textContent = t.min + ' cm';
        drawTube();
        drawChartOn($('trendChart'));
      });
    });
  }

  function metricClass(v, warnAt, critAt) {
    return v >= critAt ? 'crit' : v >= warnAt ? 'warn' : 'ok';
  }

  function renderSourceCard() {
    const wrap = $('sourceBody');
    if (!wrap) return;
    const metricsHTML = '';

    if (!state.currentCause) {
      wrap.innerHTML = `
        <div class="source-primary normal">
          <div class="s-icon">✅</div>
          <div>
            <div class="s-label">No significant inflow detected</div>
            <div class="s-origin">Water level within baseline range</div>
            <div class="s-desc">Water-level telemetry remains within the normal operating range and no unusual inflow pattern is currently detected.</div>
          </div>
        </div>${metricsHTML}`;
      return;
    }

    const c = state.currentCause;
    wrap.innerHTML = `
      <div class="source-primary">
        <div class="s-icon">${c.icon}</div>
        <div>
          <div class="s-label">${c.label}</div>
          <div class="s-origin">📍 ${c.origin}</div>
          <div class="s-desc">${c.desc}</div>
        </div>
      </div>${metricsHTML}
      <div class="source-confidence">Auto-diagnosed from rate-of-rise correlation (simulated) · confidence <b>${(72 + Math.random() * 20).toFixed(0)}%</b></div>`;
  }

  function renderForecast() {
    const wrap = $('forecastBody');
    if (!wrap) return;
    const fc = stateApi.computeForecast();
    const nextT = config.THRESHOLDS.find((t) => t.min > state.level);
    const rising = fc && fc.slopeCmPerMin > 0.3;

    if (!rising) {
      wrap.innerHTML = `
        <div class="forecast-headline">
          <div class="f-icon">📉</div>
          <div>
            <div class="f-title">No significant rise projected</div>
            <div class="f-sub">The short-term trend from the last ${fc ? fc.windowSize : 0} readings is steady or falling.${nextT ? ' No threshold breach is currently projected if this trend continues.' : ''}</div>
          </div>
        </div>
        <div class="forecast-metrics">
          <div class="stat"><div class="k">Rate of change</div><div class="v ok">${fc ? (fc.slopeCmPerMin / 100).toFixed(3) : '0.000'} m/min</div><div class="sub">last ${fc ? fc.windowSize : 0} readings</div></div>
          <div class="stat"><div class="k">Next threshold</div><div class="v">${nextT ? nextT.name : '—'}</div><div class="sub">${nextT ? formatMeters(nextT.min - state.level) + ' away' : 'at max tier'}</div></div>
          <div class="stat"><div class="k">Projected ETA</div><div class="v">—</div><div class="sub">not applicable</div></div>
        </div>
        <div class="forecast-note">Method: short-term linear regression over the most recent sensor readings (no rainfall-model dependency required).</div>`;
      return;
    }

    const etaMin = nextT ? Math.max(0, (nextT.min - state.level) / fc.slopeCmPerMin) : null;
    const isCriticalPath = nextT && nextT.key === 'critical' && etaMin !== null && etaMin < 20;
    const headlineClass = isCriticalPath ? 'forecast-headline critical-path' : 'forecast-headline rising';

    wrap.innerHTML = `
      <div class="${headlineClass}">
        <div class="f-icon">${isCriticalPath ? '⚠️' : '📈'}</div>
        <div>
          <div class="f-title">${nextT ? `Water level projected to reach ${nextT.name.toUpperCase()} in ~${etaMin.toFixed(0)} min` : 'Water level rising, already at maximum monitored tier'}</div>
          <div class="f-sub">At the current rate of rise (${(fc.slopeCmPerMin / 100).toFixed(3)} m/min, from the last ${fc.windowSize} readings), the sensor trend is climbing${nextT ? ` toward the ${nextT.name} threshold (${formatMeters(nextT.min)})` : ''}. Cross-check against the Probable Water Source panel before acting.</div>
        </div>
      </div>
      <div class="forecast-metrics">
        <div class="stat"><div class="k">Rate of change</div><div class="v warn">+${(fc.slopeCmPerMin / 100).toFixed(3)} m/min</div><div class="sub">last ${fc.windowSize} readings</div></div>
        <div class="stat"><div class="k">Next threshold</div><div class="v">${nextT ? nextT.name : '—'}</div><div class="sub">${nextT ? formatMeters(nextT.min - state.level) + ' away' : 'at max tier'}</div></div>
        <div class="stat"><div class="k">Projected ETA</div><div class="v ${isCriticalPath ? 'crit' : 'warn'}">${nextT && etaMin !== null ? '~' + etaMin.toFixed(0) + ' min' : '—'}</div><div class="sub">${nextT ? 'if trend continues' : 'n/a'}</div></div>
      </div>
      <div class="forecast-note">Method: short-term linear regression over the most recent sensor readings — a lightweight technique that avoids the large historical datasets heavier ML forecasting models require.</div>`;
  }

  function renderDecisionSupport() {
    const wrap = $('decisionSupportBody');
    if (!wrap || !state.currentUser) return;
    const st = statusForLevel(state.level);
    const fc = stateApi.computeForecast();
    const nextT = config.THRESHOLDS.find((t) => t.min > state.level);
    const etaMin = (fc && fc.slopeCmPerMin > 0.3 && nextT) ? Math.max(0, (nextT.min - state.level) / fc.slopeCmPerMin) : null;

    $('dsRoleTag').textContent = 'for ' + state.currentUser.role;
    const actions = (config.DECISION_MATRIX[st.key] && config.DECISION_MATRIX[st.key][state.currentUser.roleKey]) || [];
    const preemptive = (etaMin !== null && etaMin < 15 && st.key !== 'critical')
      ? [`Forecast shows the next threshold may be reached in ~${etaMin.toFixed(0)} min — begin preparing the next-tier response now rather than waiting for the threshold to be crossed.`]
      : [];
    const fullList = [...preemptive, ...actions];
    const priorityColor = st.key === 'critical' ? 'var(--crit)' : st.key === 'alert' ? 'var(--warn)' : 'var(--ok)';

    wrap.innerHTML = `
      <span class="ds-priority" style="color:${priorityColor}">${st.name} priority</span>
      <ul class="ds-list">
        ${fullList.map((a, i) => `<li><span class="n">${i + 1}</span><span>${a}</span></li>`).join('')}
      </ul>
      <div class="ds-basis">Recommendation translates the current sensor status and short-term forecast into an actionable response, rather than a threshold-crossed alarm alone.</div>`;
  }

  function drawTube() {
    const tubeCanvas = $('tubeCanvas');
    if (!tubeCanvas) return;
    const ctx = tubeCanvas.getContext('2d');
    const W = tubeCanvas.width;
    const H = tubeCanvas.height;
    ctx.clearRect(0, 0, W, H);
    const tubeX = 60;
    const tubeW = 60;
    const tubeTop = 20;
    const tubeBottom = H - 40;
    const tubeH = tubeBottom - tubeTop;

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    ctx.save();
    roundRect(tubeX - 4, tubeTop - 4, tubeW + 8, tubeH + 8, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.strokeStyle = '#243a72';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    roundRect(tubeX, tubeTop, tubeW, tubeH, 12);
    ctx.clip();
    config.THRESHOLDS.forEach((t) => {
      if (t.min <= 0 || t.min > config.TUBE_MAX_CM) return;
      const yFrom = tubeBottom - Math.min(t.min, config.TUBE_MAX_CM) / config.TUBE_MAX_CM * tubeH;
      ctx.fillStyle = t.color + '14';
      ctx.fillRect(tubeX, tubeTop, tubeW, yFrom - tubeTop);
    });

    const pct = Math.min(state.level, config.TUBE_MAX_CM) / config.TUBE_MAX_CM;
    const waterY = tubeBottom - pct * tubeH;
    const st = statusForLevel(state.level);
    const grad = ctx.createLinearGradient(0, waterY, 0, tubeBottom);
    grad.addColorStop(0, st.color + 'cc');
    grad.addColorStop(1, st.color + '55');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(tubeX, tubeBottom + 10);
    ctx.lineTo(tubeX, waterY);
    for (let x = 0; x <= tubeW; x += 4) {
      const y = waterY + Math.sin((x * 0.18) + state.wavePhase) * 3.2;
      ctx.lineTo(tubeX + x, y);
    }
    ctx.lineTo(tubeX + tubeW, tubeBottom + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    config.THRESHOLDS.forEach((t) => {
      if (t.min <= 0 || t.min > config.TUBE_MAX_CM) return;
      const y = tubeBottom - t.min / config.TUBE_MAX_CM * tubeH;
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tubeX - 4, y);
      ctx.lineTo(tubeX + tubeW + 4, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = t.color;
      ctx.font = '600 10px "Roboto Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(t.name.toUpperCase(), tubeX + tubeW + 10, y + 3);
    });

    ctx.fillStyle = '#d4af37';
    roundRect(tubeX + tubeW / 2 - 14, 0, 28, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#060c1e';
    ctx.font = '700 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SNSR', tubeX + tubeW / 2, 12);
    ctx.restore();
  }

  function drawChartOn(canvas) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.parentElement.clientWidth || 600;
    canvas.width = w * devicePixelRatio;
    canvas.height = 230 * devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const W = w;
    const H = 230;
    const padL = 34;
    const padR = 14;
    const padT = 14;
    const padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    ctx.clearRect(0, 0, W, H);

    config.THRESHOLDS.forEach((t) => {
      if (t.min <= 0) return;
      const y = padT + plotH - (t.min / config.TUBE_MAX_CM) * plotH;
      ctx.strokeStyle = t.color + '55';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    ctx.fillStyle = '#7385b3';
    ctx.font = '10px "Roboto Mono", monospace';
    ctx.textAlign = 'right';
    for (let v = 0; v <= config.TUBE_MAX_CM; v += 30) {
      const y = padT + plotH - (v / config.TUBE_MAX_CM) * plotH;
      ctx.fillText((v / 100).toFixed(1) + 'm', padL - 8, y + 3);
    }

    ctx.beginPath();
    state.history.forEach((p, i) => {
      const x = padL + (i / (state.history.length - 1)) * plotW;
      const y = padT + plotH - (p.v / config.TUBE_MAX_CM) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#6fd0f2';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const last = state.history[state.history.length - 1];
    const lastX = padL + plotW;
    const lastY = padT + plotH - (last.v / config.TUBE_MAX_CM) * plotH;
    ctx.lineTo(lastX, padT + plotH);
    ctx.lineTo(padL, padT + plotH);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    g.addColorStop(0, 'rgba(111,208,242,0.28)');
    g.addColorStop(1, 'rgba(111,208,242,0)');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  function renderHistoryTable() {
    const body = $('historyBody');
    if (!body) return;
    body.innerHTML = '';
    const rows = state.history.slice().reverse();
    const displayedRows = rows.slice(0, state.visibleHistoryRows);
    displayedRows.forEach((p) => {
      const st = statusForLevel(p.v);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:'Roboto Mono',monospace">${new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(new Date(p.t))}</td>
        <td style="font-family:'Roboto Mono',monospace">${formatMeters(p.v)}</td>
        <td><span class="lvl-chip" style="background:${st.color}22; color:${st.color}; border:1px solid ${st.color}66">${st.name}</span></td>
      `;
      body.appendChild(tr);
    });
    $('historyCount').textContent = rows.length > 19
      ? `Showing ${displayedRows.length} of ${rows.length} records`
      : `${rows.length} records`;
    
    // Show less button appears when viewing more than 20 records
    const showLessBtn = $('showLessHistoryBtn');
    const showMoreBtn = $('showMoreHistoryBtn');
    
    if (showLessBtn) {
      showLessBtn.hidden = state.visibleHistoryRows <= 10;
    }
    if (showMoreBtn) {
      showMoreBtn.hidden = displayedRows.length >= rows.length;
    }
  }

  return {
    toast,
    setMobileMenu,
    showView,
    renderThresholds,
    renderSourceCard,
    renderForecast,
    renderDecisionSupport,
    drawTube,
    drawChartOn,
    renderHistoryTable
  };
})();
