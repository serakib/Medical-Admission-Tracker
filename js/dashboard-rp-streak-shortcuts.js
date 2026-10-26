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
      const key = 'med_account_progress_v1_' + ((app.authUser && app.authUser.uid) || 'guest');
      return JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (_) { return {}; }
  }
  function renderShortcuts() {
    const home = document.getElementById('view-home');
    const stats = home?.querySelector('.grid.grid-cols-2.md\\:grid-cols-4');
    if (!home || !stats || document.getElementById('mat-dash-shortcuts')) return;
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
      const current = Number(profile.streak ?? progress.streak ?? 0);
      const highest = Number(profile.highestStreak ?? progress.highestStreak ?? progress.maxStreak ?? current);
      modal('Your Study Streak', '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Current streak</small><h2 style="margin:5px 0 0">' + number(current) + ' days</h2></div><div style="padding:14px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:14px"><small>Highest streak</small><h2 style="margin:5px 0 0">' + number(highest) + ' days</h2></div></div><p>Your streak statistics are based on the progress data currently available to this account.</p><button id="mat-open-profile-from-streak" class="mat-dash-modal-close" type="button">Open profile</button>');
      document.getElementById('mat-open-profile-from-streak')?.addEventListener('click', () => {
        document.getElementById('mat-dash-modal-backdrop')?.remove();
        if (typeof app.openProfile === 'function') app.openProfile();
        else if (typeof app.showView === 'function') app.showView('account');
        else document.querySelector('[data-nav-view="account"]')?.click();
        setTimeout(() => {
          const target = document.getElementById('profile-streak') || document.getElementById('student-profile-streak') || document.querySelector('[data-profile-stat="streak"]');
          target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      });
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-shortcut]');
    if (button) handleShortcut(button.dataset.shortcut);
  });
  const refresh = () => { renderShortcuts(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
  const observer = new MutationObserver(() => renderShortcuts());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('student-progress-updated', refresh);
  window.addEventListener('medical-profile-updated', refresh);
})();
