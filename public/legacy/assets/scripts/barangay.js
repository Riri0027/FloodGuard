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
 *   window.FloodGuardBarangay.render({ box, currentUser, lastSeasonInfo })
 *
 * To add a new barangay-only widget, add its markup inside buildHeroMarkup()
 * below and style it in barangay.css.
 */
(function () {

  const FALLS_TO_BARANGAY_KM = '1.8 km';
  const LAST_DRILL_LABEL = 'May 2026';

  /* Builds the Barangay Official hero panel markup. */
  function buildHeroMarkup(seasonLabel) {
    return `
      <div class="role-hero barangay">
        <div class="eyebrow">Barangay Cabotonan · Community Disaster Watch</div>
        <h1>Barangay Official Console</h1>
        <p>Local monitoring for Bilog Falls, the community's primary flood-safety concern.</p>
        <div class="hero-stats">
          <div class="hstat"><div class="k">Current season</div><div class="v" id="heroSeasonVal" style="font-size:0.95rem">${seasonLabel}</div></div>
          <div class="hstat"><div class="k">Falls → barangay proper</div><div class="v">${FALLS_TO_BARANGAY_KM}</div></div>
          <div class="hstat"><div class="k">Last community drill</div><div class="v" style="font-size:0.95rem">${LAST_DRILL_LABEL}</div></div>
        </div>
      </div>`;
  }

  /**
   * Public entry point called from script.js's renderHero().
   * @param {Object} ctx
   * @param {HTMLElement} ctx.box       - the #roleHero container to fill
   * @param {Object} ctx.currentUser    - the logged-in user record
   * @param {Object|null} ctx.lastSeasonInfo - cached weather/season info ({season, ...}) or null if not fetched yet
   */
  function render(ctx) {
    const { box, lastSeasonInfo } = ctx || {};
    if (!box) return;
    const seasonLabel = lastSeasonInfo ? lastSeasonInfo.season : '—';
    box.innerHTML = buildHeroMarkup(seasonLabel);
  }

  window.FloodGuardBarangay = { render };

})();
