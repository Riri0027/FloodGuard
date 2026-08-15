/*
 * FloodGuard — BARANGAY OFFICIAL MODULE
 * ---------------------------------------------------------------------------
 * Everything specific to the "Barangay Official" side account lives in this
 * file. It does NOT talk to the DOM outside of the #roleHero container it is
 * handed, and it does NOT touch global monitoring state directly — script.js
 * passes in whatever it needs, so this file can be edited/debugged in
 * isolation without risk of breaking the MDRRMO dashboard.
 *
 * Loaded BEFORE script.js (see index.html). Exposes:
 *   window.FloodGuardBarangay.render({ box, currentUser, lastSeasonInfo, toast })
 *
 * To add a new barangay-only widget: add its markup inside renderBarangayHero()
 * below, wire up its button in bindBarangayHeroEvents(), and style it in
 * barangay.css.
 */
(function () {

  const RESIDENTS_SUBSCRIBED = 184;
  const FALLS_TO_BARANGAY_KM = '1.8 km';
  const LAST_DRILL_LABEL = 'May 2026';

  /* Builds the Barangay Official hero panel markup. */
  function buildHeroMarkup(seasonLabel) {
    return `
      <div class="role-hero barangay">
        <div class="eyebrow">Barangay Cabotonan · Community Disaster Watch</div>
        <h1>Barangay Official Console</h1>
        <p>Local monitoring and resident communication for Bilog Falls, the community's primary flood-safety concern.</p>
        <div class="hero-stats">
          <div class="hstat"><div class="k">Residents subscribed</div><div class="v">${RESIDENTS_SUBSCRIBED}</div></div>
          <div class="hstat"><div class="k">Current season</div><div class="v" id="heroSeasonVal" style="font-size:0.95rem">${seasonLabel}</div></div>
          <div class="hstat"><div class="k">Falls → barangay proper</div><div class="v">${FALLS_TO_BARANGAY_KM}</div></div>
          <div class="hstat"><div class="k">Last community drill</div><div class="v" style="font-size:0.95rem">${LAST_DRILL_LABEL}</div></div>
        </div>
        <div class="hero-actions">
          <button class="primary btn-with-icon" id="btnNotify"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3V7a1 1 0 0 1 1-1Z"/><path d="m8 10 3 2 3-2"/></svg>Notify residents via SMS</button>
          <button class="btn-with-icon" id="btnEscalate"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5h6v6"/><path d="M19 5 10 14"/><path d="M5 19h8"/></svg>Escalate to MDRRMO</button>
        </div>
      </div>`;
  }

  /* Wires up the two hero action buttons. Kept separate from the markup
     builder so each piece can be tested/changed on its own. */
  function bindHeroEvents(toast) {
    const notifyBtn = document.getElementById('btnNotify');
    const escalateBtn = document.getElementById('btnEscalate');
    if (notifyBtn) {
      notifyBtn.addEventListener('click', () => {
        toast(`SMS advisory queued for ${RESIDENTS_SUBSCRIBED} subscribed residents.`);
      });
    }
    if (escalateBtn) {
      escalateBtn.addEventListener('click', () => {
        toast('Escalation sent to MDRRMO Lagonoy.');
      });
    }
  }

  /**
   * Public entry point called from script.js's renderHero().
   * @param {Object} ctx
   * @param {HTMLElement} ctx.box       - the #roleHero container to fill
   * @param {Object} ctx.currentUser    - the logged-in user record
   * @param {Object|null} ctx.lastSeasonInfo - cached weather/season info ({season, ...}) or null if not fetched yet
   * @param {Function} ctx.toast        - shared toast() notifier from script.js
   */
  function render(ctx) {
    const { box, lastSeasonInfo, toast } = ctx || {};
    if (!box) return;
    const seasonLabel = lastSeasonInfo ? lastSeasonInfo.season : '—';
    box.innerHTML = buildHeroMarkup(seasonLabel);
    bindHeroEvents(toast);
  }

  window.FloodGuardBarangay = { render };

})();
