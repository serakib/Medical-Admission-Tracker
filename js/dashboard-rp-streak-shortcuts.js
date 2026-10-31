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
    .mat-dash-modal{width:min(96vw,1000px);max-height:88vh;overflow:auto;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:22px;padding:24px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 24px 80px rgba(0,0,0,.24)}
    .mat-dash-modal:has(#mat-streak-chart){width:min(96vw,1000px)}
    .mat-dash-modal:has(#mat-streak-chart) h2{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line,rgba(148,163,184,.16))}
    .mat-dash-modal h2{font-size:21px;font-weight:950;margin:0 0 10px}
    .mat-dash-modal p,.mat-dash-modal li{font-size:13px;line-height:1.8;color:var(--muted,#64748b)}
    .mat-dash-modal-close{display:block;margin:16px 0 0 auto;padding:9px 14px;border-radius:11px;background:#059669;color:white;font-size:12px;font-weight:900}
    .mat-profile-streak-button{position:fixed;top:88px;right:18px;z-index:12000;display:none;align-items:center;gap:8px;padding:10px 15px;border:1px solid rgba(249,115,22,.35);border-radius:999px;background:linear-gradient(135deg,#fff7ed,#ffedd5);color:#9a3412;font-size:13px;font-weight:950;box-shadow:0 8px 24px rgba(124,45,18,.16);cursor:pointer}
    .mat-profile-streak-button i{font-size:16px;color:#ea580c}
    .mat-streak-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:18px 0 16px}
    .mat-streak-tab{min-width:0;padding:10px 8px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:12px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#0f172a);white-space:nowrap}
    .mat-streak-tab[aria-selected="true"]{background:#ea580c;color:#fff;border-color:#ea580c}
    .mat-streak-chart{width:100%;overflow-x:auto;overflow-y:hidden;padding:14px 0 8px;border:1px solid var(--line,rgba(148,163,184,.18));border-radius:14px;background:var(--surface,#fff)}
    .mat-streak-chart svg{display:block;width:100%;min-width:760px;height:auto;max-width:none;overflow:visible}
    .mat-streak-chart{overscroll-behavior-x:contain;cursor:grab;scroll-behavior:smooth;scrollbar-width:thin;touch-action:pan-x pan-y}
    .mat-streak-chart:active{cursor:grabbing}
    .mat-streak-chart.is-dragging{scroll-behavior:auto;user-select:none}
    .mat-streak-chart.is-dragging svg{pointer-events:none}
    .mat-streak-calendar{min-width:300px;padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:18px;background:var(--surface,#fff)}
    .mat-streak-calendar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}
    .mat-streak-calendar-month{font-size:16px;font-weight:950;color:var(--text,#0f172a)}
    .mat-streak-calendar-actions{display:flex;align-items:center;gap:5px}
    .mat-streak-calendar-actions button{min-width:32px;height:32px;padding:0 9px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:10px;color:var(--text,#0f172a);font-size:12px;font-weight:800}
    .mat-streak-calendar-weekdays,.mat-streak-calendar-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
    .mat-streak-calendar-weekdays{margin-bottom:6px}
    .mat-streak-calendar-weekdays span{text-align:center;font-size:10px;font-weight:850;color:var(--muted,#64748b);padding:5px 0}
    .mat-streak-calendar-day{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:52px;padding:5px 2px;border:1px solid transparent;border-radius:12px;background:rgba(148,163,184,.07);color:var(--text,#0f172a);font-size:12px;font-weight:800}
    .mat-streak-calendar-day .mat-streak-calendar-count{font-size:9px;font-weight:800;color:var(--muted,#64748b);line-height:1}
    .mat-streak-calendar-day.has-activity{background:rgba(16,185,129,.13);border-color:rgba(16,185,129,.18)}
    .mat-streak-calendar-day.has-activity .mat-streak-calendar-count{color:#059669}
    .mat-streak-calendar-day.is-today{box-shadow:inset 0 0 0 2px #ea580c}
    .mat-streak-calendar-day.is-selected{background:#ea580c;color:#fff;border-color:#ea580c}
    .mat-streak-calendar-day.is-selected .mat-streak-calendar-count{color:#fff}
    .mat-streak-calendar-day.is-outside{opacity:.35}
    .mat-streak-calendar-detail{margin-top:12px;padding:13px 14px;border-radius:14px;background:rgba(148,163,184,.09);display:flex;align-items:center;justify-content:space-between;gap:10px}
    .mat-streak-calendar{box-sizing:border-box;width:100%;min-width:0;padding:clamp(12px,2vw,20px);border-radius:18px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 8px 28px rgba(15,23,42,.06)}
    .mat-streak-calendar-head{padding-bottom:12px;border-bottom:1px solid var(--line,rgba(148,163,184,.18))}
    .mat-streak-calendar-actions button{min-width:36px;background:var(--surface,#fff);cursor:pointer;transition:background .15s,border-color .15s}
    .mat-streak-calendar-actions button:hover{background:rgba(16,185,129,.10);border-color:rgba(16,185,129,.4)}
    .mat-streak-calendar-weekdays span{padding:8px 0}
    .mat-streak-calendar-days{gap:clamp(3px,1vw,7px)}
    .mat-streak-calendar-day{min-height:clamp(42px,6vw,62px);border-radius:11px;transition:transform .15s,background .15s,border-color .15s;cursor:pointer}
    .mat-streak-calendar-day:hover{transform:translateY(-1px);border-color:rgba(16,185,129,.45)}
    .mat-streak-calendar-detail{display:block;margin-top:16px;padding:0;background:transparent}
    .mat-streak-calendar-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:15px;border:1px solid var(--line,rgba(148,163,184,.22));border-radius:14px;background:var(--surface,#fff);color:var(--text,#0f172a);text-align:left;cursor:pointer}
    .mat-streak-calendar-summary strong{font-size:14px;line-height:1.45}
    .mat-streak-calendar-summary small{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:11px}
    .mat-streak-calendar-summary-count{text-align:right;white-space:nowrap}
    .mat-streak-calendar-summary-count b{display:block;font-size:22px;color:#059669}
    .mat-streak-calendar-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px}
    .mat-streak-calendar-metric{min-width:0;padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:13px;background:rgba(148,163,184,.045)}
    .mat-streak-calendar-metric span{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:750}
    .mat-streak-calendar-metric b{display:block;margin-top:6px;font-size:clamp(16px,2.5vw,21px);line-height:1.2;overflow-wrap:anywhere}
    .mat-streak-calendar-metric.is-correct b{color:#059669}
    .mat-streak-calendar-metric.is-wrong b{color:#dc2626}
    .mat-streak-calendar-metric.is-time b{color:#2563eb}
    .mat-streak-calendar-details-panel{padding:12px 0 0}
    @media(max-width:480px){.mat-streak-calendar-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.mat-streak-calendar-weekdays,.mat-streak-calendar-days{gap:3px}.mat-streak-calendar-day{min-height:39px;border-radius:8px}.mat-streak-calendar-summary{padding:12px}}

    .mat-streak-calendar-detail strong{font-size:12px;color:var(--text,#0f172a)}
    .mat-streak-calendar-detail small{display:block;margin-top:4px;font-size:11px;color:var(--muted,#64748b)}
    .mat-streak-calendar-total{text-align:right;white-space:nowrap}
    .mat-streak-calendar-total b{display:block;font-size:20px;color:#059669}
    .mat-streak-calendar-total small{font-size:10px;color:var(--muted,#64748b)}
    .mat-streak-grid{stroke:var(--line,rgba(148,163,184,.2));stroke-width:1;stroke-dasharray:4 5}
    .mat-streak-axis-label{fill:var(--muted,#64748b);font-size:10px}
    .mat-streak-point{stroke:var(--surface,#fff);stroke-width:2}
    .mat-streak-legend{font-size:11px;line-height:1.6;color:var(--muted,#64748b);margin-top:10px}
    .mat-streak-legend .up{color:#059669;font-weight:900}
    .mat-streak-legend .down{color:#dc2626;font-weight:900}
    .mat-streak-fullscreen{position:fixed;inset:0;z-index:15000;overflow:auto;background:var(--surface,#fff);color:var(--text,#0f172a);padding:clamp(12px,2.5vw,30px);overscroll-behavior:contain}
    .mat-streak-fullscreen-head{position:static;top:auto;z-index:5;display:flex;align-items:center;gap:14px;padding:8px 0 16px;margin-bottom:14px;background:var(--surface,#fff);border-bottom:1px solid var(--line,rgba(148,163,184,.2))}
    .mat-streak-back{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;padding:10px 14px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:12px;background:var(--surface,#fff);color:var(--text,#0f172a);font-weight:850;cursor:pointer}
    .mat-streak-fullscreen-title{font-size:clamp(20px,3vw,30px);font-weight:950;margin:0}
    .mat-streak-fullscreen-content{max-width:1250px;margin:0 auto}
    .mat-streak-range-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 12px}
    .mat-streak-range-nav button{padding:9px 13px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:11px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#0f172a)}
    .mat-streak-range-label{font-size:12px;font-weight:850;color:var(--muted,#64748b);text-align:center}
    .mat-streak-chart{touch-action:pan-y;cursor:default;overflow-x:hidden;padding:12px;min-height:250px}\n    .mat-streak-chart svg{display:block;min-width:0;width:100%;max-width:100%;height:auto;overflow:visible}\n    .mat-streak-chart .mat-streak-axis-label{font-size:12px}\n    .mat-streak-chart .mat-streak-point{stroke:var(--surface,#fff);stroke-width:2.5}
    .mat-streak-fullscreen .mat-streak-tabs{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:16px}
    .mat-streak-fullscreen .mat-streak-calendar{width:100%;max-width:620px;margin:0 auto}
    @media(max-width:640px){.mat-streak-fullscreen{padding:12px}.mat-streak-fullscreen-head{gap:9px}.mat-streak-back{padding:9px 10px;font-size:12px}.mat-streak-fullscreen .mat-streak-tabs{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.mat-streak-fullscreen .mat-streak-tab{font-size:11px;padding:10px 3px}.mat-streak-range-nav button{padding:8px 9px}.mat-streak-range-label{font-size:10px}}
    @media(max-width:640px){.mat-profile-streak-button{top:76px;right:10px;padding:9px 12px;font-size:12px}.mat-dash-modal{padding:16px;border-radius:18px}.mat-streak-tabs{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.mat-streak-tab{padding:9px 5px;font-size:11px}.mat-streak-chart{padding:10px 0 6px}.mat-streak-chart svg{min-width:720px}.mat-streak-legend{font-size:10px;line-height:1.7}}
    /* Streak journey opens in a compact, scrollable dialog; fullscreen is opt-in. */
    .mat-streak-popup{position:fixed;inset:0;z-index:15000;display:grid;place-items:center;overflow:hidden;padding:12px;background:rgba(2,6,23,.64);backdrop-filter:blur(4px);overscroll-behavior:contain}
    .mat-streak-popup-card{box-sizing:border-box;width:min(94vw,900px);max-height:90vh;max-height:90dvh;overflow:auto;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:18px;padding:clamp(12px,2vw,20px);background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 24px 70px rgba(0,0,0,.28);overscroll-behavior:contain}
    .mat-streak-popup .mat-streak-fullscreen-head{top:0;gap:8px;padding:4px 0 10px;margin:0 0 10px}
    .mat-streak-popup .mat-streak-fullscreen-title{flex:1;min-width:0;font-size:clamp(17px,2.4vw,23px);line-height:1.25}
    .mat-streak-popup .mat-streak-fullscreen-content{max-width:100%;margin:0}
    .mat-streak-popup .mat-streak-back,.mat-streak-popup-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:0 0 auto;padding:8px 10px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:11px;background:var(--surface,#fff);color:var(--text,#0f172a);font-size:12px;font-weight:850;white-space:nowrap;cursor:pointer}
    .mat-streak-popup-toggle{border-color:rgba(16,185,129,.32);background:rgba(16,185,129,.10);color:#047857}
    .mat-streak-popup .mat-streak-tabs{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:12px 0}
    .mat-streak-popup .mat-streak-tab{padding:8px 4px;font-size:11px;white-space:normal}
    .mat-streak-popup .mat-streak-chart{touch-action:pan-y;cursor:default;overflow:hidden;padding:7px;min-height:0;border-radius:12px}
    .mat-streak-popup .mat-streak-chart svg{display:block;width:100%;min-width:0;max-width:100%;height:auto;overflow:visible}
    .mat-streak-popup .mat-streak-axis-label{font-size:10px}
    .mat-streak-popup .mat-streak-calendar{box-sizing:border-box;min-width:0;width:100%;max-width:none;margin:0;padding:9px;border-radius:12px}
    .mat-streak-popup .mat-streak-calendar-weekdays,.mat-streak-popup .mat-streak-calendar-days{gap:3px}
    .mat-streak-popup .mat-streak-calendar-day{min-height:38px;padding:3px 1px;gap:2px;border-radius:8px;font-size:11px}
    .mat-streak-popup .mat-streak-calendar-day .mat-streak-calendar-count{font-size:8px}
    .mat-streak-popup .mat-streak-calendar-detail{flex-wrap:wrap;padding:9px;gap:8px}
    .mat-streak-popup .mat-streak-calendar-total b{font-size:16px}
    .mat-streak-popup .mat-streak-legend{font-size:10px;line-height:1.5}
    .mat-streak-fullscreen .mat-streak-popup-card{width:100%;max-height:none;overflow:visible;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
    .mat-streak-fullscreen .mat-streak-popup-toggle{border-color:rgba(16,185,129,.32);background:rgba(16,185,129,.10);color:#047857}
    @media(max-width:420px){.mat-streak-popup{padding:7px}.mat-streak-popup-card{width:100%;max-height:94vh;max-height:94dvh;padding:12px;border-radius:14px}.mat-streak-popup .mat-streak-fullscreen-head{gap:6px;flex-wrap:wrap}.mat-streak-popup .mat-streak-fullscreen-title{order:1;flex-basis:100%;font-size:17px}.mat-streak-popup .mat-streak-tabs{gap:4px}.mat-streak-popup .mat-streak-tab{padding:7px 2px;font-size:10px}.mat-streak-popup .mat-streak-calendar-day{min-height:35px}}
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
  // Count only time while this site tab is visible; persist daily totals per account.
  const siteTimeKey = () => 'mat_site_active_time_v1_' + ((app && app.authUser && app.authUser.uid) || 'guest');
  let siteTimeLastTick = Date.now();
  function recordSiteTime() {
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(now - siteTimeLastTick, 30000));
    siteTimeLastTick = now;
    if (document.hidden || elapsed <= 0) return;
    try {
      const key = siteTimeKey();
      const data = JSON.parse(localStorage.getItem(key) || '{}') || {};
      const date = dhakaTodayDate();
      data[date] = Math.max(0, Number(data[date]) || 0) + elapsed;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
  }
  function siteTimeForDate(date) {
    try {
      const data = JSON.parse(localStorage.getItem(siteTimeKey()) || '{}') || {};
      return Math.max(0, Number(data[date]) || 0);
    } catch (_) { return 0; }
  }
  function formatSiteTime(milliseconds) {
    const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
    const hours = Math.floor(minutes / 60);
    return hours ? hours + 'h ' + (minutes % 60) + 'm' : (minutes % 60) + 'm';
  }
  setInterval(recordSiteTime, 15000);
  document.addEventListener('visibilitychange', () => { recordSiteTime(); siteTimeLastTick = Date.now(); });
  window.addEventListener('pagehide', recordSiteTime);

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
    counts.hourly = new Map();
    counts.monthly = new Map();
    counts.details = new Map();
    counts.examAttempts = new Map();
    const dhakaParts = timestamp => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone:'Asia/Dhaka', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'
      }).formatToParts(new Date(timestamp));
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return { date:values.year + '-' + values.month + '-' + values.day, month:values.year + '-' + values.month, hour:Number(values.hour) };
    };
    try {
      const history = JSON.parse(localStorage.getItem(key) || '{}') || {};
      Object.entries(history).forEach(([questionKey, entry]) => {
        if (!entry || entry.attempted !== true) return;
        const attemptRecords = Array.isArray(entry.attemptRecords) ? entry.attemptRecords : [];
        let timestamps = attemptRecords.length
          ? attemptRecords.map(record => record && record.timestamp)
          : Array.isArray(entry.attemptTimestamps) ? entry.attemptTimestamps : [];
        if (!timestamps.length) timestamps = [entry.firstAttemptAt, entry.updatedAt].filter((value, index, values) => value != null && values.indexOf(value) === index);
        timestamps = [...new Set(timestamps.map(Number).filter(value => Number.isFinite(value) && value > 0))];
        timestamps.forEach(timestamp => {
          const parts = dhakaParts(timestamp);
          counts.set(parts.date, (counts.get(parts.date) || 0) + 1);
          const hourKey = parts.date + 'T' + String(parts.hour).padStart(2,'0');
          counts.hourly.set(hourKey, (counts.hourly.get(hourKey) || 0) + 1);
          counts.monthly.set(parts.month, (counts.monthly.get(parts.month) || 0) + 1);
          if (!counts.details.has(parts.date)) counts.details.set(parts.date, []);
          const record = attemptRecords.find(item => Number(item && item.timestamp) === timestamp) || {};
          const legacyLatest = Number(entry.updatedAt) === timestamp || (attemptRecords.length === 0 && timestamps.length === 1);
          const status = String(entry.answerStatus ?? entry.status ?? entry.result ?? '').toLowerCase();
          const recordedCorrect = typeof record.correct === 'boolean' ? record.correct : legacyLatest && typeof entry.correct === 'boolean' ? entry.correct : null;
          const isCorrect = recordedCorrect === true || (recordedCorrect == null && /correct|right|success/.test(status));
          const isWrong = recordedCorrect === false || (recordedCorrect == null && /wrong|incorrect|fail/.test(status));
          const outcome = isCorrect ? 'Correct' : isWrong ? 'Wrong' : '';
          const question = entry.question || {};
          const source = String(record.source || question.source || entry.source || question.year || entry.year || '').trim();
          const subject = String(record.subject || question.subject || entry.subject || '').trim();
          const before = record.leaderboardStatusBefore || entry.leaderboardStatusBefore || {};
          counts.details.get(parts.date).push({ timestamp, outcome, correct:isCorrect, questionKey, source, subject, leaderboardStatusBefore:before });
        });
      });
    } catch (_) {}
    try {
      const examHistoryKey = typeof app.getHistoryKey === 'function'
        ? app.getHistoryKey()
        : 'med_history_' + ((app.authUser && app.authUser.uid) || 'guest');
      const attempts = JSON.parse(localStorage.getItem(examHistoryKey) || '[]');
      if (Array.isArray(attempts)) attempts.forEach(attempt => {
        if (!attempt || !attempt.attemptId) return;
        const timestamp = Number(attempt.attemptId);
        if (!Number.isFinite(timestamp) || timestamp < 100000000000) return;
        const date = dhakaParts(timestamp).date;
        if (!counts.examAttempts.has(date)) counts.examAttempts.set(date, []);
        counts.examAttempts.get(date).push(attempt);
      });
    } catch (_) {}
    counts.details.forEach(list => list.sort((a,b) => a.timestamp-b.timestamp));
    counts.examAttempts.forEach(list => {
      const unique = new Map();
      list.forEach(attempt => {
        const key = String(attempt?.attemptId ?? '').split('-').pop();
        if (!key) return;
        const previous = unique.get(key);
        if (!previous || (!previous.reviewData && attempt.reviewData)) unique.set(key, attempt);
      });
      list.splice(0, list.length, ...Array.from(unique.values()).sort((a,b) => Number(b.attemptId)-Number(a.attemptId)));
    });
    return counts;
  }
  function streakGraphMarkup(period, counts, anchorDate, compact = false) {
    const today = dhakaTodayDate();
    const anchor = anchorDate || today;
    const items = [];
    if (period === 'daily') {
      for (let hour = 0; hour < 24; hour++) {
        const hour12 = hour % 12 || 12;
        items.push({date:anchor, hour, label:hour12 + (hour < 12 ? 'am' : 'pm'), value:counts.hourly?.get(anchor + 'T' + String(hour).padStart(2,'0')) || 0, key:anchor + 'T' + String(hour).padStart(2,'0')});
      }
    } else {
      const anchorParts = anchor.split('-').map(Number);
      const monthFirst = period === 'monthly'
        ? new Date(Date.UTC(anchorParts[0], anchorParts[1] - 1, 1)).toISOString().slice(0, 10)
        : '';
      const days = period === 'weekly'
        ? 7
        : period === 'monthly'
          ? new Date(Date.UTC(anchorParts[0], anchorParts[1], 0)).getUTCDate()
          : 10;
      const startDate = period === 'monthly' ? monthFirst : dateOffset(anchor, -(days - 1));
      for (let i = 0; i < days; i++) {
        const date = dateOffset(startDate, i);
        const d = new Date(date + 'T00:00:00Z');
        const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()];
        const label = period === 'weekly' ? (date.slice(8) + ' ' + weekday) : String(d.getUTCDate());
        items.push({date, label, value:counts.get(date) || 0, key:date});
      }
    }
    // Size the SVG to its current mode so it can fit narrow popups without
    // horizontal page scrolling; fullscreen naturally gets a larger graph.
    const viewportWidth = Math.max(280, Number(window.innerWidth) || 900);
    const width = compact
      ? Math.max(280, Math.min(760, Math.round(viewportWidth * 0.88)))
      : Math.max(320, Math.min(960, Math.round(viewportWidth - 80)));
    const height = Math.round(width * (compact ? 0.42 : 0.395));
    const left = compact && width < 400 ? 34 : 52;
    const right = compact && width < 400 ? 10 : 18;
    const top = compact ? 30 : 34;
    const bottom = compact && width < 400 ? 36 : 52;
    const plotWidth = width-left-right, plotHeight = height-top-bottom;
    const max = Math.max(0, ...items.map(item => item.value));
    const yMax = Math.max(4, Math.ceil(max / 4) * 4);
    const points = items.map((item, i) => ({...item, x:left + (items.length <= 1 ? plotWidth/2 : i*plotWidth/(items.length-1)), y:top + plotHeight - (item.value/yMax)*plotHeight}));
    const grid = [0,.25,.5,.75,1].map(ratio => {
      const y = top + plotHeight - ratio*plotHeight;
      return '<line class="mat-streak-grid" x1="' + left + '" y1="' + y + '" x2="' + (width-right) + '" y2="' + y + '"/><text class="mat-streak-axis-label" x="' + (left-10) + '" y="' + (y+4) + '" text-anchor="end">' + Math.round(yMax*ratio) + '</text>';
    }).join('');
    const segments = points.slice(1).map((point,i) => {
      const prev = points[i], color = point.value > prev.value ? '#059669' : point.value < prev.value ? '#dc2626' : '#64748b';
      return '<line x1="' + prev.x + '" y1="' + prev.y + '" x2="' + point.x + '" y2="' + point.y + '" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>';
    }).join('');
    const area = period === 'daily' ? '' : points.map((point,i)=>(i?'L':'M')+point.x+' '+point.y).join(' ')+' L '+points[points.length-1].x+' '+(top+plotHeight)+' L '+points[0].x+' '+(top+plotHeight)+' Z';
    const circles = points.map(point => {
      const detail = period === 'daily' ? (String(point.hour).padStart(2,'0') + ':00') : point.date;
      return '<circle class="mat-streak-point" cx="' + point.x + '" cy="' + point.y + '" r="' + (compact && width < 400 ? 3 : 5) + '" fill="' + (point.value ? '#059669' : '#94a3b8') + '"><title>' + esc(detail + ': ' + point.value + ' attempted question(s)') + '</title></circle>';
    }).join('');
    const labelStep = period === 'daily' ? (compact && width < 400 ? 4 : 2) : period === 'monthly' ? (compact && width < 400 ? 5 : 3) : 1;
    const labels = points.map((point,i) => {
      if (i % labelStep !== 0 && i !== points.length-1) return '';
      return '<text class="mat-streak-axis-label" x="' + point.x + '" y="' + (height-12) + '" text-anchor="middle">' + esc(point.label) + '</text>';
    }).join('');
    const rangeStart = period === 'monthly' ? new Date(Date.UTC(Number(anchor.slice(0,4)), Number(anchor.slice(5,7)) - 1, 1)).toISOString().slice(0,10) : dateOffset(anchor, -(period === 'weekly' ? 6 : 9));
    const rangeLabel = period === 'daily'
      ? new Intl.DateTimeFormat('en', {weekday:'long', month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}).format(new Date(anchor + 'T00:00:00Z'))
      : period === 'weekly'
        ? new Intl.DateTimeFormat('en', {month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(anchor + 'T00:00:00Z')) + ' · ' + new Intl.DateTimeFormat('en', {month:'short', day:'numeric', timeZone:'UTC'}).format(new Date(rangeStart + 'T00:00:00Z')) + ' – ' + new Intl.DateTimeFormat('en', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}).format(new Date(anchor + 'T00:00:00Z'))
        : period === 'monthly'
          ? new Intl.DateTimeFormat('en', {month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(anchor + 'T00:00:00Z'))
          : rangeStart + ' — ' + anchor;
    const periodLabel = period === 'daily' ? 'Hourly attempted questions' : 'Daily attempted questions';
    return '<div class="mat-streak-range-nav"><button type="button" data-range-nav="-1" aria-label="Previous range">‹ Previous</button><div class="mat-streak-range-label">' + esc(rangeLabel) + '</div><button type="button" data-range-nav="1" aria-label="Next range">Next ›</button></div><svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + periodLabel + '"><text class="mat-streak-axis-label" x="12" y="14">' + periodLabel + '</text>' + grid + '<path d="' + area + '" fill="rgba(16,185,129,.10)"/>' + segments + circles + labels + '</svg>';
  }
  function streakCalendarMarkup(counts, monthDate, selectedDate, leaderboardInfo) {
    const year = monthDate.getUTCFullYear();
    const month = monthDate.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const monthName = new Intl.DateTimeFormat('en', { month:'long', year:'numeric', timeZone:'UTC' }).format(first);
    const startDay = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const today = dhakaTodayDate();
    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
    let cells = '';
    for (let i = 0; i < totalCells; i++) {
      const day = i - startDay + 1;
      const date = dateOffset(year + '-' + String(month + 1).padStart(2,'0') + '-01', day - 1);
      const inMonth = day >= 1 && day <= daysInMonth;
      const value = counts.get(date) || 0;
      const classes = ['mat-streak-calendar-day', inMonth ? '' : 'is-outside', date === today ? 'is-today' : '', date === selectedDate ? 'is-selected' : '', value > 0 ? 'has-activity' : ''].filter(Boolean).join(' ');
      cells += '<button type="button" class="' + classes + '" data-calendar-date="' + date + '" aria-label="' + esc(date) + ', ' + value + ' attempted questions"' + (inMonth ? '' : ' tabindex="-1"') + '><span>' + Number(date.slice(8)) + '</span><span class="mat-streak-calendar-count">' + (value ? value + ' Q' : '—') + '</span></button>';
    }
    const selected = selectedDate || today;
    const selectedCount = counts.get(selected) || 0;
    const selectedDateObj = new Date(selected + 'T00:00:00Z');
    const selectedLabel = new Intl.DateTimeFormat('en', { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'UTC' }).format(selectedDateObj);
    const entries = (counts.details && counts.details.get(selected)) || [];
    const examAttempts = (counts.examAttempts && counts.examAttempts.get(selected)) || [];
    const questionCorrect = entries.filter(item => item.outcome === 'Correct').length;
    const questionWrong = entries.filter(item => item.outcome === 'Wrong').length;
    const examCorrect = examAttempts.reduce((sum, item) => sum + Math.max(0, Number(item.correctCount) || 0), 0);
    const examWrong = examAttempts.reduce((sum, item) => sum + Math.max(0, Number(item.wrongCount) || 0), 0);
    const correctCount = questionCorrect + examCorrect;
    const wrongCount = questionWrong + examWrong;
    const knownOutcomes = correctCount + wrongCount;
    const accuracy = knownOutcomes ? Math.round(correctCount / knownOutcomes * 1000) / 10 : null;
    const siteTime = siteTimeForDate(selected);
    const practicedFrom = [...new Set(entries.map(item => item.source || item.subject).filter(Boolean))];
    const leaderboardBefore = entries.map(item => item.leaderboardStatusBefore || {}).find(item => item.rank != null || item.rp != null || item.status);
    const examTimeline = examAttempts.length
      ? '<div style="display:grid;gap:8px;margin-top:14px"><strong style="font-size:12px">Exam attempts (' + examAttempts.length + ')</strong>' + examAttempts.map((attempt, index) => {
          const time = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Number(attempt.attemptId)));
          const reviewable = !!attempt.reviewData?.questions?.length && Array.isArray(attempt.reviewData.userAnswers);
          const label = attempt.modeLabel || attempt.mode || 'Exam';
          const countsText = 'Correct ' + (attempt.correctCount ?? '—') + ' · Wrong ' + (attempt.wrongCount ?? '—') + ' · Skipped ' + (attempt.skippedCount ?? '—');
          return '<article style="padding:11px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:12px;display:grid;gap:7px"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong style="font-size:12px">' + esc(label) + ' · ' + esc(time) + '</strong><span style="font-size:11px;font-weight:800">' + esc(attempt.score ?? '—') + ' / ' + esc(attempt.total ?? '—') + '</span></div><small style="font-size:11px;color:var(--muted,#64748b)">' + esc(countsText) + ' · Accuracy ' + esc(attempt.accuracy || '—') + '</small><button type="button" data-review-attempt-id="' + esc(attempt.attemptId) + '" ' + (reviewable ? '' : 'disabled') + ' style="justify-self:start;padding:7px 10px;border-radius:9px;background:' + (reviewable ? '#059669;color:white;cursor:pointer' : '#94a3b8;color:white;cursor:not-allowed') + ';font-size:11px;font-weight:800">' + (reviewable ? 'Open Answer Review' : 'Review unavailable for this attempt') + '</button></article>';
        }).join('') + '</div>'
      : '';
    const leaderboardActivityMarkup = (() => {
      const info = leaderboardInfo || {};
      const prior = info.previousDay || null;
      const live = info.live || null;
      const card = (title, row, color) => '<div style="padding:12px;border:1px solid var(--line,rgba(148,163,184,.18));border-radius:13px;min-width:0"><small style="display:block;color:var(--muted,#64748b);font-weight:800">' + title + '</small>' +
        (row ? '<strong style="display:block;margin-top:6px;color:' + color + ';font-size:20px">#' + number(row.position) + '</strong><div style="font-size:12px;margin-top:5px;line-height:1.8">Weekly RP: <b>' + number(row.weeklyRP) + '</b><br>XP: <b>' + number(row.xp) + '</b></div>' :
        '<p style="font-size:12px;line-height:1.6;margin:6px 0 0;color:var(--muted,#64748b)">Previous-day snapshot not available yet</p>') + '</div>';
      const friendLines = Array.isArray(info.friendActivity) ? info.friendActivity : [];
      return '<div style="display:grid;gap:9px;margin-top:14px">' +
        '<button type="button" data-toggle-leaderboard aria-expanded="false" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:12px;background:var(--surface,#fff);color:var(--text,#0f172a);font-weight:850;text-align:left">Leaderboard comparison <span aria-hidden="true">＋</span></button>' +
        '<section data-leaderboard-panel hidden style="padding:12px;border:1px solid var(--line,rgba(148,163,184,.18));border-radius:13px"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">' +
        card('Previous day · ' + (info.previousDate || '—'), prior, '#64748b') + card('Today · live position', live, '#059669') +
        '</div><p class="mat-streak-legend">Previous-day values appear after a daily leaderboard snapshot has been saved. Live values use the latest available Weekly leaderboard data.</p></section>' +
        '<button type="button" data-toggle-friends aria-expanded="false" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:12px;background:var(--surface,#fff);color:var(--text,#0f172a);font-weight:850;text-align:left">Friend activity · weekly RP <span aria-hidden="true">＋</span></button>' +
        '<section data-friends-panel hidden style="padding:12px;border:1px solid var(--line,rgba(148,163,184,.18));border-radius:13px">' +
        (friendLines.length ? '<div style="display:grid;gap:8px">' + friendLines.slice(0,12).map(item =>
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;font-size:12px;line-height:1.5"><span><b>' + esc(item.name) + '</b> ' + esc(item.message) + '</span><strong style="white-space:nowrap;color:' + (item.direction === 'friend-passed' ? '#dc2626' : '#059669') + '">' + (item.delta > 0 ? '+' : '') + number(item.delta) + ' RP</strong></div>'
        ).join('') + '</div>' : '<p style="font-size:12px;line-height:1.6;margin:0;color:var(--muted,#64748b)">No new friend position changes are recorded yet.</p>') +
        '</section>' +
        (examAttempts.length ? '<button type="button" data-toggle-exam-attempts aria-expanded="false" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:12px;background:var(--surface,#fff);color:var(--text,#0f172a);font-weight:850;text-align:left">Exam attempted (' + number(examAttempts.length) + ') <span aria-hidden="true">＋</span></button><section data-exam-attempts-panel hidden style="padding:12px;border:1px solid var(--line,rgba(148,163,184,.18));border-radius:13px">' + examTimeline + '</section>' : '') +
        '</div>';
    })();

    
    return '<section class="mat-streak-calendar" aria-label="Study activity calendar">' +
      '<div class="mat-streak-calendar-head"><div class="mat-streak-calendar-month">' + esc(monthName) + '</div><div class="mat-streak-calendar-actions"><button type="button" data-calendar-nav="-1" aria-label="Previous month">‹</button><button type="button" data-calendar-nav="today">Today</button><button type="button" data-calendar-nav="1" aria-label="Next month">›</button></div></div>' +
      '<div class="mat-streak-calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>' +
      '<div class="mat-streak-calendar-days">' + cells + '</div>' +
      '<div class="mat-streak-calendar-detail">' +
      '<button type="button" class="mat-streak-calendar-summary" data-toggle-day-activity aria-expanded="false"><span><strong>' + esc(selectedLabel) + '</strong><small>' + (selected === today ? 'Today · ' : '') + (selectedCount || examAttempts.length ? 'Study activity recorded' : 'No attempted questions recorded') + '</small></span><span class="mat-streak-calendar-summary-count"><b>' + number(selectedCount) + '</b><small>attempted questions　＋</small></span></button>' +
      '<section class="mat-streak-calendar-details-panel" data-day-activity-panel hidden>' +
      '<div class="mat-streak-calendar-metrics">' +
      '<div class="mat-streak-calendar-metric is-correct"><span>Right answers</span><b>' + number(correctCount) + '</b></div>' +
      '<div class="mat-streak-calendar-metric is-wrong"><span>Wrong answers</span><b>' + number(wrongCount) + '</b></div>' +
      '<div class="mat-streak-calendar-metric"><span>Accuracy</span><b>' + (accuracy == null ? '—' : accuracy + '%') + '</b></div>' +
      '<div class="mat-streak-calendar-metric is-time"><span>Time on website</span><b>' + (siteTime ? esc(formatSiteTime(siteTime)) : '—') + '</b><span>' + (siteTime ? 'Visible-tab time' : 'Tracking starts after this update') + '</span></div>' +
      '<div class="mat-streak-calendar-metric"><span>Exam sessions</span><b>' + number(examAttempts.length) + '</b></div>' +
      '<div class="mat-streak-calendar-metric"><span>Known answers</span><b>' + number(knownOutcomes) + '</b></div>' +
      '</div>' +
      '<p class="mat-streak-legend" style="margin-bottom:0">Time counts while this website tab is visible, including study, practice and other pages on this site. Older dates only show time if it was tracked and saved. Times use Bangladesh time (Asia/Dhaka).</p>' +
      leaderboardActivityMarkup + '</section></div>';
  }

  function openProfileStreak() {
    window.__matCloseStreakDialog?.();
    document.getElementById('mat-streak-fullscreen')?.remove();
    const progress = profileProgress();
    const publicSection = document.getElementById('view-student-profile');
    const showingPublicProfile = !!publicSection && !publicSection.classList.contains('hidden');
    const publicStudent = showingPublicProfile ? (window.__matActivePublicStudentProfile || {}) : null;
    const source = publicStudent || progress;
    const current = Math.max(0, Number(publicStudent ? (source.streak ?? 0) : (source.streak ?? app.profile?.streak ?? 0)) || 0);
    const highestFallback = publicStudent ? current : (app.profile?.highestStreak ?? current);
    const highest = Math.max(current, Number(source.highestStreak ?? source.maxStreak ?? highestFallback) || 0);
    const counts = publicStudent ? new Map() : attemptedQuestionCounts();
    const buildLeaderboardInfo = () => {
      const weeklySnapshotKey = 'med_streak_weekly_snapshots_v1_' + String((app.authUser && app.authUser.uid) || app.profile?.userId || app.profile?.uid || 'guest');
      const today = dhakaTodayDate();
      const previousDate = dateOffset(today, -1);
      const getWeeklyRows = period => {
        try {
          const rows = window.MedGlobalLeague?.getCachedRows?.(period) || [];
          return Array.isArray(rows) ? rows.map(row => row && row.raw ? row.raw : row).filter(Boolean) : [];
        } catch (_) { return []; }
      };
      const rowId = row => String(row?.userId || row?.uid || row?.playerId || row?.id || '');
      const rowName = row => String(row?.name || row?.username || 'Student');
      const weeklyValue = row => Math.max(0, Number(row?.weeklyRP ?? row?.weeklyRankPoints ?? row?.boardPoints ?? row?.WeeklyRP ?? 0) || 0);
      const xpValue = row => Math.max(0, Number(row?.xp ?? row?.XP ?? 0) || 0);
      const ownId = String((app.authUser && app.authUser.uid) || app.profile?.userId || app.profile?.uid || '');
      let savedSnapshots = {};
      try { savedSnapshots = JSON.parse(localStorage.getItem(weeklySnapshotKey) || '{}') || {}; } catch (_) {}
      const dedupeLatestRows = rows => {
        const byId = new Map();
        rows.forEach(row => {
          const id = rowId(row);
          if (!id) return;
          const old = byId.get(id);
          if (!old || weeklyValue(row) > weeklyValue(old) || (weeklyValue(row) === weeklyValue(old) && xpValue(row) > xpValue(old))) byId.set(id, row);
        });
        return [...byId.values()];
      };
      const weeklyRows = dedupeLatestRows(getWeeklyRows('weekly')).sort((a,b) => weeklyValue(b)-weeklyValue(a) || xpValue(b)-xpValue(a));
      const friendIds = new Set(dedupeLatestRows(getWeeklyRows('friends')).map(rowId).filter(id => id && id !== ownId));
      const rankedRows = weeklyRows.map((row,index) => ({
        userId:rowId(row), name:rowName(row), position:index+1,
        weeklyRP:weeklyValue(row), xp:xpValue(row), rank:row.rank || row.currentRank || ''
      }));
      const ownLive = rankedRows.find(row => row.userId === ownId) || null;
      const friendsLive = rankedRows.filter(row => friendIds.has(row.userId));
      if (ownLive) {
        savedSnapshots[today] = { date:today, own:ownLive, friends:friendsLive };
        const snapshotDates = Object.keys(savedSnapshots).sort();
        snapshotDates.slice(0, Math.max(0, snapshotDates.length - 45)).forEach(date => delete savedSnapshots[date]);
        try { localStorage.setItem(weeklySnapshotKey, JSON.stringify(savedSnapshots)); } catch (_) {}
      }
      const priorSnapshot = savedSnapshots[previousDate] || null;
      const previousOwn = priorSnapshot?.own || null;
      const previousFriends = Array.isArray(priorSnapshot?.friends) ? priorSnapshot.friends : [];
      const liveFriendById = new Map(friendsLive.map(row => [row.userId, row]));
      const previousFriendById = new Map(previousFriends.map(row => [row.userId, row]));
      const friendActivity = [];
      previousFriends.forEach(friend => {
        const live = liveFriendById.get(friend.userId);
        if (!live) return;
        const delta = live.weeklyRP - Number(friend.weeklyRP || 0);
        const passedUser = previousOwn && friend.position > previousOwn.position && live.position < ownLive?.position;
        const userPassed = previousOwn && friend.position < previousOwn.position && live.position > ownLive?.position;
        if (passedUser) friendActivity.push({name:live.name, message:'passed you today · ahead by', delta:Math.max(0, live.weeklyRP - Number(ownLive?.weeklyRP || 0)), direction:'friend-passed'});
        else if (userPassed) friendActivity.push({name:live.name, message:'you passed them today · ahead by', delta:Math.max(0, Number(ownLive?.weeklyRP || 0) - live.weeklyRP), direction:'user-passed'});
        else if (delta !== 0) friendActivity.push({name:live.name, message:(delta > 0 ? 'gained' : 'lost') + ' weekly RP today', delta:Math.abs(delta), direction:delta > 0 ? 'friend-passed' : 'user-passed'});
      });
      const leaderboardInfo = { previousDate, previousDay:previousOwn, live:ownLive, friendActivity };
        return leaderboardInfo;
    };
    let leaderboardInfo = buildLeaderboardInfo();
    const overlay = document.createElement('section');
    overlay.id = 'mat-streak-fullscreen';
    overlay.className = 'mat-streak-popup';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Your Streak Journey');
    overlay.innerHTML = '<div class="mat-streak-popup-card"><header class="mat-streak-fullscreen-head"><button type="button" class="mat-streak-back" data-streak-close aria-label="Close streak statistics">× Close</button><h1 class="mat-streak-fullscreen-title">Your Streak Journey</h1><button type="button" class="mat-streak-popup-toggle" data-streak-fullscreen aria-pressed="false">⛶ Fullscreen</button></header><div class="mat-streak-fullscreen-content">' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">' +
      '<div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px;background:rgba(249,115,22,.06)"><small>Current Streak</small><h2 style="margin:5px 0 0;color:#ea580c">' + number(current) + ' days</h2></div>' +
      '<div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px;background:rgba(16,185,129,.06)"><small>Highest Streak</small><h2 style="margin:5px 0 0;color:#059669">' + number(highest) + ' days</h2></div></div>' +
      '<div class="mat-streak-tabs" role="tablist" aria-label="Streak activity range">' +
      '<button class="mat-streak-tab" type="button" data-streak-period="daily" aria-selected="true">Daily</button><button class="mat-streak-tab" type="button" data-streak-period="weekly" aria-selected="false">Weekly</button>' +
      '<button class="mat-streak-tab" type="button" data-streak-period="monthly" aria-selected="false">Monthly</button><button class="mat-streak-tab" type="button" data-streak-period="calendar" aria-selected="false">Calendar</button></div>' +
      '<div id="mat-streak-chart" class="mat-streak-chart" aria-label="Recorded streak activity graph"></div>' +
      '<p class="mat-streak-legend"><span class="up">Green = activity</span> · <span class="down">Red = change from previous point</span> · Daily = hourly · Weekly = 7 days · Monthly = full calendar month (28–31 days). Swipe left for older activity and right for newer activity. Calendar and date details remain available.</p></div></div>';
    document.body.appendChild(overlay);
    const chart = overlay.querySelector('#mat-streak-chart');
    let activePeriod = 'daily';
    let calendarMonth = new Date(dhakaTodayDate() + 'T00:00:00Z');
    let selectedCalendarDate = dhakaTodayDate();
    let anchorDate = dhakaTodayDate();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = () => {
      overlay.remove();
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', onKey);
      if (window.__matCloseStreakDialog === close) delete window.__matCloseStreakDialog;
    };
    const onKey = event => { if (event.key === 'Escape') close(); };
    window.__matCloseStreakDialog = close;
    document.addEventListener('keydown', onKey);
    let rangeAnimating = false;
    const shiftRange = async direction => {
      if (rangeAnimating || activePeriod === 'calendar') return;
      const period = activePeriod;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      rangeAnimating = true;
      try {
        const canAnimate = !reduceMotion && typeof chart?.animate === 'function';
        // Previous (-1) exits right; Next (+1) exits left.
        const outgoingX = direction < 0 ? 22 : -22;
        if (canAnimate) {
          const outgoing = chart.animate(
            [{opacity:1, transform:'translateX(0)'},{opacity:0, transform:'translateX(' + outgoingX + 'px)'}],
            {duration:130, easing:'ease-in', fill:'both'}
          );
          await outgoing.finished.catch(() => {});
          outgoing.cancel();
          chart.style.opacity = '0';
          chart.style.transform = 'translateX(' + outgoingX + 'px)';
        }
        if (period === 'daily') anchorDate = dateOffset(anchorDate, direction);
        else if (period === 'weekly') anchorDate = dateOffset(anchorDate, direction * 7);
        else if (period === 'monthly') { const parts = anchorDate.split('-').map(Number); anchorDate = new Date(Date.UTC(parts[0], parts[1] - 1 + direction, 1)).toISOString().slice(0, 10); }
        render(period);
        if (canAnimate) {
          // Previous enters from left; Next enters from right.
          const incomingX = direction < 0 ? -22 : 22;
          const incoming = chart.animate(
            [{opacity:0, transform:'translateX(' + incomingX + 'px)'},{opacity:1, transform:'translateX(0)'}],
            {duration:190, easing:'ease-out', fill:'both'}
          );
          await incoming.finished.catch(() => {});
          incoming.cancel();
        }
      } finally {
        if (chart) { chart.style.opacity = ''; chart.style.transform = ''; }
        rangeAnimating = false;
      }
    };
    const shiftCalendar = async direction => {
      if (activePeriod !== 'calendar' || rangeAnimating) return;
      rangeAnimating = true;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const canAnimate = !reduceMotion && typeof chart?.animate === 'function';
      const outgoingX = direction < 0 ? 22 : -22;
      try {
        if (canAnimate) {
          const outgoing = chart.animate(
            [{opacity:1, transform:'translateX(0)'},{opacity:0, transform:'translateX(' + outgoingX + 'px)'}],
            {duration:130, easing:'ease-in', fill:'both'}
          );
          await outgoing.finished.catch(() => {});
          outgoing.cancel();
          chart.style.opacity = '0';
          chart.style.transform = 'translateX(' + outgoingX + 'px)';
        }
        const year = calendarMonth.getUTCFullYear();
        const month = calendarMonth.getUTCMonth() + direction;
        calendarMonth = new Date(Date.UTC(year, month, 1));
        const monthStart = calendarMonth.getUTCFullYear() + '-' + String(calendarMonth.getUTCMonth() + 1).padStart(2,'0') + '-01';
        const day = Math.min(Number(selectedCalendarDate.slice(8)), new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 0)).getUTCDate());
        selectedCalendarDate = dateOffset(monthStart, day - 1);
        render('calendar');
        if (canAnimate) {
          const incomingX = direction < 0 ? -22 : 22;
          const incoming = chart.animate(
            [{opacity:0, transform:'translateX(' + incomingX + 'px)'},{opacity:1, transform:'translateX(0)'}],
            {duration:190, easing:'ease-out', fill:'both'}
          );
          await incoming.finished.catch(() => {});
          incoming.cancel();
        }
      } finally {
        if (chart) { chart.style.opacity = ''; chart.style.transform = ''; }
        rangeAnimating = false;
      }
    };
    const render = (period = activePeriod) => {
      activePeriod = period;
      overlay.querySelectorAll('[data-streak-period]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.streakPeriod === period)));
      if (!chart) return;
      const compact = overlay.classList.contains('mat-streak-popup');
      chart.innerHTML = period === 'calendar'
        ? streakCalendarMarkup(counts, calendarMonth, selectedCalendarDate, leaderboardInfo)
        : streakGraphMarkup(period, counts, anchorDate, compact);
      chart.style.overflowX = compact ? 'hidden' : 'visible';
      chart.style.cursor = 'default';
      const rangeButtons = chart.querySelectorAll('[data-range-nav]');
      rangeButtons.forEach(button => button.addEventListener('click', () => shiftRange(Number(button.dataset.rangeNav))));
    };
    overlay.querySelector('[data-streak-close]')?.addEventListener('click', close);
    overlay.querySelector('[data-streak-fullscreen]')?.addEventListener('click', () => {
      const enteringFullscreen = !overlay.classList.contains('mat-streak-fullscreen');
      overlay.classList.toggle('mat-streak-fullscreen', enteringFullscreen);
      overlay.classList.toggle('mat-streak-popup', !enteringFullscreen);
      overlay.setAttribute('aria-label', enteringFullscreen ? 'Your Streak Journey fullscreen' : 'Your Streak Journey popup');
      const toggle = overlay.querySelector('[data-streak-fullscreen]');
      if (toggle) {
        toggle.textContent = enteringFullscreen ? '↙ Exit fullscreen' : '⛶ Fullscreen';
        toggle.setAttribute('aria-pressed', String(enteringFullscreen));
      }
      render(activePeriod);
    });
    overlay.querySelectorAll('[data-streak-period]').forEach(button => button.addEventListener('click', () => render(button.dataset.streakPeriod)));
    render('daily');
    // Refresh the currently selected leaderboard view without temporarily writing
    // "weekly" into localStorage, which could change the tab in another open page.
    if (!publicStudent && window.MedGlobalLeague?.loadLeaderboard) {
      Promise.resolve(window.MedGlobalLeague.loadLeaderboard(true)).catch(() => {}).finally(() => {
        if (!overlay.isConnected) return;
        leaderboardInfo = buildLeaderboardInfo();
        if (activePeriod === 'calendar') render('calendar');
      });
    }

    chart?.addEventListener('click', event => {
      const toggleDayActivity = event.target.closest?.('[data-toggle-day-activity]');
      if (toggleDayActivity) {
        const panel = chart.querySelector('[data-day-activity-panel]');
        if (panel) {
          const opening = panel.hidden;
          panel.hidden = !opening;
          toggleDayActivity.setAttribute('aria-expanded', String(opening));
          const indicator = toggleDayActivity.querySelector('.mat-streak-calendar-summary-count small');
          if (indicator) indicator.textContent = 'attempted questions　' + (opening ? '−' : '＋');
        }
        return;
      }
      const toggleLeaderboard = event.target.closest?.('[data-toggle-leaderboard]');
      const toggleFriends = event.target.closest?.('[data-toggle-friends]');
      const toggleExamAttempts = event.target.closest?.('[data-toggle-exam-attempts]');
      const togglePanel = (button, selector) => {
        if (!button) return false;
        const panel = chart.querySelector(selector);
        if (!panel) return true;
        const opening = panel.hidden;
        panel.hidden = !opening;
        button.setAttribute('aria-expanded', String(opening));
        const icon = button.querySelector('span[aria-hidden="true"]');
        if (icon) icon.textContent = opening ? '−' : '＋';
        return true;
      };
      if (togglePanel(toggleLeaderboard, '[data-leaderboard-panel]')) return;
      if (togglePanel(toggleFriends, '[data-friends-panel]')) return;
      if (togglePanel(toggleExamAttempts, '[data-exam-attempts-panel]')) return;
      const reviewButton = event.target.closest?.('[data-review-attempt-id]');
      if (reviewButton) {
        if (typeof app.openSavedExamReview === 'function' && !reviewButton.disabled) app.openSavedExamReview(reviewButton.dataset.reviewAttemptId);
        return;
      }
      const dateButton = event.target.closest?.('[data-calendar-date]');
      if (dateButton) {
        selectedCalendarDate = dateButton.dataset.calendarDate;
        const parts = selectedCalendarDate.split('-').map(Number);
        calendarMonth = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
        render('calendar');
        return;
      }
      const nav = event.target.closest?.('[data-calendar-nav]');
      if (nav) {
        const direction = nav.dataset.calendarNav;
        if (direction === 'today') {
          selectedCalendarDate = dhakaTodayDate();
          calendarMonth = new Date(selectedCalendarDate + 'T00:00:00Z');
        } else {
          calendarMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + Number(direction), 1));
          selectedCalendarDate = dateOffset(calendarMonth.getUTCFullYear() + '-' + String(calendarMonth.getUTCMonth() + 1).padStart(2,'0') + '-01', Math.min(
            Number(selectedCalendarDate.slice(8)),
            new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 0)).getUTCDate()
          ) - 1);
        }
        render('calendar');
      }
    });

    let swipeStart = null;
    // Pointer events cover touchscreens, pens and mouse/trackpad drags consistently.
    chart?.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      swipeStart = {x:event.clientX, y:event.clientY, pointerId:event.pointerId};
    }, {passive:true});
    chart?.addEventListener('pointerup', event => {
      if (!swipeStart || event.pointerId !== swipeStart.pointerId) { swipeStart = null; return; }
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        if (activePeriod === 'calendar') shiftCalendar(dx > 0 ? -1 : 1);
        else shiftRange(dx > 0 ? -1 : 1);
      }
      swipeStart = null;
    }, {passive:true});
    chart?.addEventListener('pointercancel', () => { swipeStart = null; }, {passive:true});
    let lastWheelRangeChange = 0;
    chart?.addEventListener('wheel', event => {
      if (Math.abs(event.deltaX) < 30 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
      const now = Date.now();
      if (now - lastWheelRangeChange < 450) return;
      lastWheelRangeChange = now;
      if (activePeriod === 'calendar') shiftCalendar(event.deltaX > 0 ? -1 : 1);
      else shiftRange(event.deltaX > 0 ? 1 : -1);
    }, {passive:true});
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
      ['rp','fa-ranking-star','RP Details','Monthly and weekly RP details'],
      ['rules','fa-circle-info','Ranking Rules','XP, RP, trophies & Safe Zone']
    ].map(([key, icon, title, subtitle]) => '<button type="button" class="mat-dash-shortcut" data-shortcut="' + key + '"><span class="mat-dash-shortcut-icon"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></span><span class="mat-dash-shortcut-copy"><strong>' + title + '</strong><small>' + subtitle + '</small></span></button>').join('');
    stats.insertAdjacentElement('afterend', wrap);
  }
  function handleShortcut(key) {
    const profile = app.profile || {};
    const progress = profileProgress();
    if (key === 'rules') {
      modal('Leaderboard & Progress Rules', '<ul><li>XP records learning activity and progress; RP determines ranking.</li><li>Monthly RP determines the Monthly leaderboard and Monthly Safe Zone; Weekly RP determines the Weekly leaderboard and its Promotion Zone.</li><li>Trophies represent rank/subrank progress. The progress star advances as progress increases.</li><li>The Monthly Safe Zone applies to the whole Main Rank. Weekly has a Promotion Zone only—no Safe Zone or demotion.</li><li>The Safe Zone percentage is an internal calculation and is not displayed as a percentage to students.</li></ul>');
      return;
    }
    if (key === 'rp') {
      const monthly = Number(profile.monthlyRP ?? profile.monthlyRankPoints ?? 0);
      const weekly = Number(profile.weeklyRankPoints ?? profile.weeklyRP ?? 0);
      modal('Your RP Details', '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Monthly RP</small><h2 style="margin:5px 0 0">' + number(monthly) + '</h2></div><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Weekly RP</small><h2 style="margin:5px 0 0">' + number(weekly) + '</h2></div></div><p>Monthly RP is calculated from the Bangladesh calendar month. Weekly RP is calculated from the current week.</p>');
      return;
    }
    if (key === 'streak') {
      const current = Math.max(0, Number(progress.streak ?? profile.streak ?? 0) || 0);
      const highest = Math.max(current, Number(progress.highestStreak ?? progress.maxStreak ?? profile.highestStreak ?? current) || 0);
      modal('Your Study Streak', '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Current streak</small><h2 style="margin:5px 0 0">' + number(current) + ' days</h2></div><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Highest streak</small><h2 style="margin:5px 0 0">' + number(highest) + ' days</h2></div></div><p>Your streak statistics are based on the progress data currently available to this account.</p><button id="mat-open-profile-from-streak" class="mat-dash-modal-close" type="button">Open profile</button>');
      document.getElementById('mat-open-profile-from-streak')?.addEventListener('click', () => {
        document.getElementById('mat-dash-modal-backdrop')?.remove();
        if (typeof app.openProfile === 'function') app.openProfile();
        else if (typeof app.showView === 'function') app.showView('account');
        else { const nav = document.querySelector('[data-nav-view="account"]'); if (nav) nav.click(); }
        setTimeout(() => {
          const target = document.getElementById('student-profile-streak');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
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
  // Observe only the profile views whose visibility controls this button.
  // A body-wide subtree observer reruns this DOM scan for unrelated page updates.
  const profileObserver = new MutationObserver(() => ensureProfileStreakButton());
  [document.getElementById('view-profile'), document.getElementById('view-student-profile')]
    .filter(Boolean)
    .forEach(section => profileObserver.observe(section, { attributes: true, attributeFilter: ['class','aria-hidden'] }));
  window.addEventListener('student-progress-updated', refresh);
  window.addEventListener('medical-profile-updated', refresh);
})();
