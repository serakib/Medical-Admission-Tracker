/* Dashboard RP / Streak / rules shortcuts and compact leaderboard polish.
   The Google Sheets leaderboard remains the source of truth for RP. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || window.__matDashboardShortcutsInstalled) return;
  window.__matDashboardShortcutsInstalled = true;

  const style = document.createElement('style');
  style.id = 'mat-dashboard-shortcuts-style';
  style.textContent = `
    .mat-dash-shortcuts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 24px}
    .mat-dash-shortcut{display:flex;align-items:center;gap:12px;min-width:0;padding:14px 16px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:16px;background:var(--surface,#fff);color:var(--text,#0f172a);text-align:left;cursor:pointer;transition:transform .16s,border-color .16s,box-shadow .16s}
    .mat-dash-shortcut:hover{transform:translateY(-2px);border-color:rgba(16,185,129,.55);box-shadow:0 8px 22px rgba(15,23,42,.08)}
    .mat-dash-shortcut-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:13px;background:rgba(16,185,129,.12);color:#059669;font-size:17px}
    .mat-dash-shortcut[data-shortcut="rp"] .mat-dash-shortcut-icon{background:rgba(245,158,11,.15);color:#b7791f}
    .mat-dash-shortcut[data-shortcut="streak"] .mat-dash-shortcut-icon{background:rgba(249,115,22,.14);color:#ea580c}
    .mat-dash-shortcut-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
    .mat-dash-shortcut-copy strong{font-size:14px;font-weight:950}
    .mat-dash-shortcut-copy small{font-size:11px;line-height:1.45;color:var(--muted,#64748b)}
    .mat-dash-modal-backdrop{position:fixed;inset:0;z-index:13000;display:grid;place-items:center;padding:16px;background:rgba(2,6,23,.66);backdrop-filter:blur(5px)}
    .mat-dash-modal{width:min(100%,560px);max-height:85vh;overflow:auto;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:22px;padding:22px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 24px 80px rgba(0,0,0,.24)}
    .mat-dash-modal h2{font-size:21px;font-weight:950;margin:0 0 10px}
    .mat-dash-modal p,.mat-dash-modal li{font-size:13px;line-height:1.8;color:var(--muted,#64748b)}
    .mat-dash-modal-close{display:block;margin:16px 0 0 auto;padding:9px 14px;border-radius:11px;background:#059669;color:white;font-size:12px;font-weight:900}
    .mat-profile-streak-button{position:fixed;top:88px;right:18px;z-index:12000;display:none;align-items:center;gap:8px;padding:10px 15px;border:1px solid rgba(249,115,22,.35);border-radius:999px;background:linear-gradient(135deg,#fff7ed,#ffedd5);color:#9a3412;font-size:13px;font-weight:950;box-shadow:0 8px 24px rgba(124,45,18,.16);cursor:pointer}
    .mat-profile-streak-button i{font-size:16px;color:#ea580c}
    .mat-streak-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0 12px}
    .mat-streak-tab{padding:8px 13px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:999px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#0f172a)}
    .mat-streak-tab[aria-selected="true"]{background:#ea580c;color:#fff;border-color:#ea580c}
    .mat-streak-chart{width:100%;overflow-x:auto;padding:8px 0 0}
    .mat-streak-chart svg{display:block;width:100%;min-width:420px;height:auto;max-width:none;overflow:visible}
    .mat-streak-chart{overscroll-behavior-x:contain;cursor:grab}
    .mat-streak-chart:active{cursor:grabbing}
    .mat-streak-grid{stroke:var(--line,rgba(148,163,184,.2));stroke-width:1;stroke-dasharray:4 5}
    .mat-streak-axis-label{fill:var(--muted,#64748b);font-size:10px}
    .mat-streak-point{stroke:var(--surface,#fff);stroke-width:2}
    .mat-streak-legend{font-size:11px;line-height:1.6;color:var(--muted,#64748b);margin-top:10px}
    .mat-streak-legend .up{color:#059669;font-weight:900}
    .mat-streak-legend .down{color:#dc2626;font-weight:900}
    @media(max-width:640px){.mat-profile-streak-button{top:76px;right:10px;padding:9px 12px;font-size:12px}.mat-streak-chart{gap:3px;padding-left:3px;padding-right:3px}.mat-streak-label{font-size:8px}}
    #leaderboard-body td,#leaderboard-body th{padding:9px 8px!important}
    #leaderboard-body th{white-space:nowrap;font-size:12px}
    #leaderboard-body td:last-child{min-width:0!important;font-size:17px}
    #leaderboard-body .leader-person{gap:7px}
    #leaderboard-body .leader-avatar{width:29px;height:29px;flex:0 0 29px;border-radius:9px}
    #leaderboard-list .overflow-x-auto{overflow-x:auto;overscroll-behavior-x:contain}
    .mat-rank-rail{scrollbar-width:none!important;-ms-overflow-style:none}
    .mat-rank-rail::-webkit-scrollbar{display:none}
    .mat-rank-rail{scroll-behavior:smooth;touch-action:pan-x pan-y}
    .mat-rank-track .mat-safe-zone-marker{pointer-events:none}
    .mat-rank-track .mat-progress-star{position:absolute;z-index:3;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:26px;height:26px;color:#b7791f;font-size:19px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.22));pointer-events:none;transition:left .35s ease}
    .mat-rank-track .mat-safe-zone-marker{z-index:2}
    .mat-rank-track{overflow:visible!important}
    .mat-rank-rail .mat-rank-scroll-button,.mat-rank-rail .trophy-scroll-button,.mat-rank-rail .scroll-arrow,.mat-rank-rail .scroll-button{display:none!important}
    @media(max-width:640px){.mat-dash-shortcuts{gap:8px}.mat-dash-shortcut{align-items:flex-start;flex-direction:column;padding:11px}.mat-dash-shortcut-icon{width:36px;height:36px;flex-basis:36px}.mat-dash-shortcut-copy strong{font-size:12px}.mat-dash-shortcut-copy small{font-size:10px}.mat-dash-modal{padding:17px}#leaderboard-body td,#leaderboard-body th{padding:8px 5px!important}#leaderboard-body .leader-avatar{display:none}}
  `;
  document.head.appendChild(style);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Math.max(0, Number(value) || 0).toLocaleString();
  function modal(title, body) {
    document.getElementById('mat-dash-modal-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'mat-dash-modal-backdrop';
    backdrop.className = 'mat-dash-modal-backdrop';
    backdrop.innerHTML = '<section class="mat-dash-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><h2>' + esc(title) + '</h2>' + body + '<button class="mat-dash-modal-close" type="button">Close</button></section>';
    backdrop.addEventListener('click', event => { if (event.target === backdrop || event.target.closest('.mat-dash-modal-close')) backdrop.remove(); });
    document.addEventListener('keydown', function onKey(event) { if (event.key === 'Escape') { backdrop.remove(); document.removeEventListener('keydown', onKey); } }, { once: true });
    document.body.appendChild(backdrop);
    backdrop.querySelector('.mat-dash-modal-close')?.focus();
  }
  function profileProgress() {
    try {
      // Read through the same account-scoped progress API used by exam rewards.
      if (typeof app.getAccountProgress === 'function') return app.getAccountProgress() || {};
      const key = 'med_account_progress_v1_' + ((app.authUser && app.authUser.uid) || 'guest');
      return JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (_) { return {}; }
  }

  function dhakaTodayDate(offset = 0) {
    const now = new Date(Date.now() + offset * 86400000);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + '-' + values.month + '-' + values.day;
  }
  function dateOffset(dateString, days) {
    const parts = String(dateString).split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1]-1, parts[2] + days));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
  }
  function activityDates(progress) {
    const dates = Array.isArray(progress.streakActivityDates) ? progress.streakActivityDates : [];
    const last = String(progress.lastStreakActivityDate || '');
    if (last && !dates.includes(last)) dates.push(last);
    return new Set(dates.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(String(value))).map(String));
  }
  function attemptedQuestionCounts() {
    const key = 'med_practice_attempt_history_v1_' + ((app.authUser && app.authUser.uid) || 'guest');
    const counts = new Map();
    try {
      const history = JSON.parse(localStorage.getItem(key) || '{}') || {};
      Object.values(history).forEach(entry => {
        if (!entry || entry.attempted !== true) return;
        let timestamps = Array.isArray(entry.attemptTimestamps) ? entry.attemptTimestamps : [];
        if (!timestamps.length) {
          timestamps = [entry.firstAttemptAt, entry.updatedAt]
            .filter((value, index, values) => value != null && values.indexOf(value) === index);
        }
        timestamps.forEach(timestamp => {
          const numeric = Number(timestamp);
          if (!Number.isFinite(numeric) || numeric <= 0) return;
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'
          }).formatToParts(new Date(numeric));
          const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
          const date = values.year + '-' + values.month + '-' + values.day;
          counts.set(date, (counts.get(date) || 0) + 1);
        });
      });
    } catch (_) {}
    return counts;
  }
  function streakGraphMarkup(period, counts, zoom = 1) {
    const today = dhakaTodayDate();
    const items = [];
    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 365;
    for (let i = days - 1; i >= 0; i--) {
      const date = dateOffset(today, -i);
      const d = new Date(date + 'T00:00:00Z');
      const label = period === 'weekly'
        ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]
        : period === 'monthly' ? date.slice(8) : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
      items.push({ date, label, value: counts.get(date) || 0 });
    }
    const width = 900, height = 250, left = 48, right = 14, top = 22, bottom = 38;
    const plotWidth = width-left-right, plotHeight = height-top-bottom;
    const max = Math.max(0, ...items.map(item => item.value));
    const yMax = Math.max(4, Math.ceil(max / 4) * 4);
    const points = items.map((item, i) => ({
      ...item,
      x: left + (items.length <= 1 ? plotWidth/2 : i*plotWidth/(items.length-1)),
      y: top + plotHeight - (item.value/yMax)*plotHeight
    }));
    const grid = [0, .25, .5, .75, 1].map(ratio => {
      const y = top + plotHeight - ratio*plotHeight;
      const label = Math.round(yMax*ratio);
      return '<line class="mat-streak-grid" x1="' + left + '" y1="' + y + '" x2="' + (width-right) + '" y2="' + y + '"/><text class="mat-streak-axis-label" x="' + (left-10) + '" y="' + (y+4) + '" text-anchor="end">' + label + '</text>';
    }).join('');
    const segments = points.slice(1).map((point, i) => {
      const previous = points[i];
      const color = point.value > previous.value ? '#059669' : point.value < previous.value ? '#dc2626' : '#64748b';
      return '<line x1="' + previous.x + '" y1="' + previous.y + '" x2="' + point.x + '" y2="' + point.y + '" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>';
    }).join('');
    const area = points.map((point, i) => (i ? 'L' : 'M') + point.x + ' ' + point.y).join(' ') + ' L ' + points[points.length-1].x + ' ' + (top+plotHeight) + ' L ' + points[0].x + ' ' + (top+plotHeight) + ' Z';
    const circles = points.map(point => {
      const title = point.date + ': ' + point.value + ' attempted question(s)';
      return '<circle class="mat-streak-point" cx="' + point.x + '" cy="' + point.y + '" r="' + (period === 'yearly' ? '2.1' : '3.5') + '" fill="' + (point.value ? '#059669' : '#94a3b8') + '"><title>' + esc(title) + '</title></circle>';
    }).join('');
    const labelStep = period === 'weekly' ? 1 : period === 'monthly' ? Math.max(1, Math.round(5 / zoom)) : 1;
    const labels = points.map((point, i) => {
      if (period === 'yearly' && i > 0 && point.date.slice(5, 7) === points[i-1].date.slice(5, 7)) return '';
      if (period !== 'yearly' && i % labelStep !== 0 && i !== points.length-1) return '';
      return '<text class="mat-streak-axis-label" x="' + point.x + '" y="' + (height-10) + '" text-anchor="middle">' + esc(point.label) + '</text>';
    }).join('');
    const svgWidth = zoom > 1 ? ' style="width:' + (width * zoom) + 'px;min-width:' + (width * zoom) + 'px;max-width:none"' : '';
    return '<svg' + svgWidth + ' viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Daily attempted questions line graph, zoom ' + zoom + 'x"><text class="mat-streak-axis-label" x="12" y="12">Attempted questions</text>' + grid + '<path d="' + area + '" fill="rgba(16,185,129,.10)"/>' + segments + circles + labels + '</svg>';
  }
  function openProfileStreak() {
    const progress = profileProgress();
    const publicSection = document.getElementById('view-student-profile');
    const showingPublicProfile = !!publicSection && !publicSection.classList.contains('hidden');
    const publicStudent = showingPublicProfile ? (window.__matActivePublicStudentProfile || {}) : null;
    const source = publicStudent || progress;
    const current = Math.max(0, Number(publicStudent ? (source.streak ?? 0) : (source.streak ?? app.profile?.streak ?? 0)) || 0);
    const highestFallback = publicStudent ? current : (app.profile?.highestStreak ?? current);
    const highest = Math.max(current, Number(source.highestStreak ?? source.maxStreak ?? highestFallback) || 0);
    const counts = publicStudent ? new Map() : attemptedQuestionCounts();
    const body = '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">' +
      '<div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px;background:rgba(249,115,22,.06)"><small>Current Streak</small><h2 style="margin:5px 0 0;color:#ea580c">' + number(current) + ' days</h2></div>' +
      '<div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px;background:rgba(16,185,129,.06)"><small>Highest Streak</small><h2 style="margin:5px 0 0;color:#059669">' + number(highest) + ' days</h2></div></div>' +
      '<div class="mat-streak-tabs" role="tablist" aria-label="Streak activity range">' +
      '<button class="mat-streak-tab" type="button" data-streak-period="weekly" aria-selected="true">Weekly</button>' +
      '<button class="mat-streak-tab" type="button" data-streak-period="monthly" aria-selected="false">Monthly</button>' +
      '<button class="mat-streak-tab" type="button" data-streak-period="yearly" aria-selected="false">Yearly</button></div>' +
      '<div id="mat-streak-chart" class="mat-streak-chart" aria-label="Recorded streak activity graph" title="Use Ctrl + touchpad pinch to zoom this graph"></div>' +
      '<p class="mat-streak-legend"><span class="up">↗ Green = trend up</span> · <span class="down">↘ Red = trend down</span> · X-axis = day, Y-axis = attempted questions per day. Correct and wrong answers count; skipped questions do not.</p>';
    modal('Your Streak Journey', body);
    const chart = document.getElementById('mat-streak-chart');
    let activePeriod = 'weekly';
    let zoom = 1;
    const render = (period = activePeriod, keepScroll = false) => {
      const previousRatio = chart && chart.scrollWidth > chart.clientWidth ? (chart.scrollLeft + chart.clientWidth / 2) / chart.scrollWidth : 0;
      activePeriod = period;
      document.querySelectorAll('[data-streak-period]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.streakPeriod === period)));
      if (chart) chart.innerHTML = streakGraphMarkup(period, counts, zoom);
      if (chart && keepScroll) chart.scrollLeft = Math.max(0, previousRatio * chart.scrollWidth - chart.clientWidth / 2);
    };
    render('weekly');
    document.querySelectorAll('[data-streak-period]').forEach(button => button.addEventListener('click', () => render(button.dataset.streakPeriod)));
    // Trackpad pinch zoom is commonly delivered as a Ctrl+wheel event in Chrome.
    // Capture it only over this graph so the rest of the page keeps normal browser zoom behavior.
    if (chart) chart.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const nextZoom = Math.max(1, Math.min(4, zoom + (event.deltaY < 0 ? 0.25 : -0.25)));
      if (nextZoom === zoom) return;
      zoom = Math.round(nextZoom * 100) / 100;
      render(activePeriod, true);
    }, { passive: false });
  }
  function ensureProfileStreakButton() {
    let button = document.getElementById('mat-profile-streak-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'mat-profile-streak-button';
      button.type = 'button';
      button.className = 'mat-profile-streak-button';
      button.setAttribute('data-profile-streak', 'true');
      button.setAttribute('aria-label', 'Open streak statistics and activity graph');
      button.innerHTML = '<i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i><span>Streak</span>';
      document.body.appendChild(button);
    }
    const own = document.getElementById('view-profile');
    const publicProfile = document.getElementById('view-student-profile');
    const isVisible = section => section && !section.classList.contains('hidden');
    button.style.display = isVisible(own) || isVisible(publicProfile) ? 'inline-flex' : 'none';
  }

  function renderShortcuts() {
    // The dashboard shortcut row was intentionally removed. Clean up a copy
    // left in the DOM by an older cached script, but retain this file's
    // leaderboard polish stylesheet.
    document.getElementById('mat-dash-shortcuts')?.remove();
    return;
    const home = document.getElementById('view-home');
    const stats = home?.querySelector('.grid.grid-cols-2.md\\:grid-cols-4');
    if (!home || !stats) return;
    let existing = document.getElementById('mat-dash-shortcuts');
    // Dashboard sections can be moved/rebuilt when switching views. Re-anchor
    // the existing shortcut row instead of letting it remain in a stale position.
    if (existing && (existing.parentElement !== stats.parentElement || existing.previousElementSibling !== stats)) {
      existing.remove();
      existing = null;
    }
    if (existing) return;
    const wrap = document.createElement('div');
    wrap.id = 'mat-dash-shortcuts';
    wrap.className = 'mat-dash-shortcuts';
    wrap.innerHTML = [
      ['streak','fa-fire-flame-curved','Streak','View current & highest streak'],
      ['rp','fa-ranking-star','RP Details','Lifetime and weekly rank points'],
      ['rules','fa-circle-info','Ranking Rules','XP, RP, trophies & Safe Zone']
    ].map(([key, icon, title, subtitle]) => '<button type="button" class="mat-dash-shortcut" data-shortcut="' + key + '"><span class="mat-dash-shortcut-icon"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></span><span class="mat-dash-shortcut-copy"><strong>' + title + '</strong><small>' + subtitle + '</small></span></button>').join('');
    stats.insertAdjacentElement('afterend', wrap);
  }
  function handleShortcut(key) {
    const profile = app.profile || {};
    const progress = profileProgress();
    if (key === 'rules') {
      modal('Leaderboard & Progress Rules', '<ul><li>XP records learning activity and progress; RP determines ranking.</li><li>Lifetime RP is used for All-Time ranking; current-week RP is used for Weekly ranking.</li><li>Trophies represent rank/subrank progress. The progress star advances as progress increases.</li><li>The Weekly leaderboard Safe Zone divider separates students meeting the next-subrank safety threshold from those below it.</li><li>The Safe Zone percentage is an internal calculation and is not displayed as a percentage to students.</li></ul>');
      return;
    }
    if (key === 'rp') {
      const lifetime = Number(profile.totalRP ?? profile.rankPoints ?? 0);
      const weekly = Number(profile.weeklyRankPoints ?? profile.weeklyRP ?? 0);
      modal('Your RP Details', '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Lifetime RP</small><h2 style="margin:5px 0 0">' + number(lifetime) + '</h2></div><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Weekly RP</small><h2 style="margin:5px 0 0">' + number(weekly) + '</h2></div></div><p>Lifetime RP controls All-Time rank. Weekly RP is calculated from activity in the current week.</p>');
      return;
    }
    if (key === 'streak') {
      const current = Math.max(0, Number(progress.streak ?? profile.streak ?? 0) || 0);
      const highest = Math.max(current, Number(progress.highestStreak ?? progress.maxStreak ?? profile.highestStreak ?? current) || 0);
      modal('Your Study Streak', '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Current streak</small><h2 style="margin:5px 0 0">' + number(current) + ' days</h2></div><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Highest streak</small><h2 style="margin:5px 0 0">' + number(highest) + ' days</h2></div></div><p>Your streak statistics are based on the progress data currently available to this account.</p><button id="mat-open-profile-from-streak" class="mat-dash-modal-close" type="button">Open profile</button>');
      document.getElementById('mat-open-profile-from-streak')?.addEventListener('click', () => {
        document.getElementById('mat-dash-modal-backdrop')?.remove();
        const rows = window.MedGlobalLeague && typeof window.MedGlobalLeague.getCachedRows === 'function' ? window.MedGlobalLeague.getCachedRows('all-time') : [];
        const ownId = String((app.profile && (app.profile.userId || app.profile.uid)) || (app.authUser && app.authUser.uid) || '');
        const ownRow = rows.find(row => row && (row.isMine || (ownId && String(row.userId || row.uid || '') === ownId)));
        if (ownRow && window.MedStudentProfile && typeof window.MedStudentProfile.open === 'function') {
          Promise.resolve(window.MedStudentProfile.open(ownRow)).then(() => setTimeout(() => {
            const target = document.getElementById('student-profile-streak');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120));
        } else if (typeof app.openProfile === 'function') app.openProfile();
        else if (typeof app.showView === 'function') app.showView('account');
        else { const nav = document.querySelector('[data-nav-view="account"]'); if (nav) nav.click(); }
      });
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-shortcut]');
    if (button) handleShortcut(button.dataset.shortcut);
    if (event.target.closest?.('[data-profile-streak]')) openProfileStreak();
  });
  const refresh = () => { renderShortcuts(); ensureProfileStreakButton(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
  const observer = new MutationObserver(() => ensureProfileStreakButton());
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','aria-hidden'] });
  window.addEventListener('student-progress-updated', refresh);
  window.addEventListener('medical-profile-updated', refresh);
})();
