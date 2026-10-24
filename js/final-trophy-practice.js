/* Final PR: Practice instructions modal and lifetime trophy progression.
   Additive layer; preserves the existing exam engine and current rank points. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__finalTrophyPracticePatch) return;
  app.__finalTrophyPracticePatch = true;

  const style = document.createElement('style');
  style.id = 'final-trophy-practice-styles';
  style.textContent = `
    #view-exam-intro.final-instructions-modal {
      position: fixed !important; inset: 0 !important; z-index: 12000 !important;
      display: grid !important; place-items: center; overflow-y: auto;
      padding: 18px; background: rgba(2,6,23,.76); backdrop-filter: blur(8px);
      max-width: none !important; width: 100% !important; margin: 0 !important;
    }
    #view-exam-intro.final-instructions-modal > div {
      width: min(100%, 760px); max-height: calc(100vh - 36px); overflow-y: auto;
    }
    .lifetime-trophy-card{display:flex;align-items:center;gap:16px;padding:18px;border-radius:18px;
      border:1px solid rgba(180,130,45,.38);background:linear-gradient(135deg,rgba(120,75,20,.12),rgba(250,204,21,.08));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 12px 28px rgba(15,23,42,.08);margin:16px 0}
    .lifetime-trophy-medal{display:grid;place-items:center;flex:0 0 62px;width:62px;height:62px;border-radius:50%;
      color:#fff8dc;background:radial-gradient(circle at 32% 25%,#fff2b3 0,#d9a441 25%,#8b5a16 65%,#52340d 100%);
      border:3px double #f7d98b;box-shadow:inset 0 0 0 3px rgba(75,45,5,.35),0 6px 15px rgba(100,65,10,.28);font-size:24px}
    .lifetime-trophy-copy{min-width:0;flex:1}.lifetime-trophy-copy strong{display:block;font-size:1rem;font-weight:900}
    .lifetime-trophy-copy small{display:block;margin-top:4px;opacity:.75;line-height:1.6}
    .lifetime-trophy-track{height:7px;overflow:hidden;border-radius:99px;background:rgba(148,163,184,.25);margin-top:9px}
    .lifetime-trophy-track span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#a16207,#facc15,#fff0a6)}
    @media(max-width:600px){#view-exam-intro.final-instructions-modal{padding:10px}#view-exam-intro.final-instructions-modal > div{max-height:calc(100vh - 20px)}.lifetime-trophy-card{gap:11px;padding:13px}.lifetime-trophy-medal{flex-basis:52px;width:52px;height:52px}}
  `;
  document.head.appendChild(style);

  const originalShowView = app.showView.bind(app);
  app.showView = function(viewName, force) {
    const intro = document.getElementById('view-exam-intro');
    if (intro) intro.classList.remove('final-instructions-modal');
    originalShowView(viewName, force);
    if (viewName === 'exam-intro' && intro) {
      intro.classList.add('final-instructions-modal');
      intro.setAttribute('role','dialog');
      intro.setAttribute('aria-modal','true');
      intro.setAttribute('aria-labelledby','exam-intro-title');
    }
  };

  function lifetimePoints() {
    const rankCard = document.getElementById('profile-rank-card');
    const rankText = rankCard?.textContent || '';
    const rankMatch = rankText.match(/([\\d,]+)\\s*lifetime Rank Points/i);
    if (rankMatch) return Math.max(0, Number(rankMatch[1].replace(/,/g, '')) || 0);
    const keys = [
      'med_lifetime_rank_points_' + (app.authUser?.uid || 'guest'),
      'med_rank_points_lifetime_' + (app.authUser?.uid || 'guest'),
      'med_lifetime_rank_points',
      'med_rank_points_lifetime'
    ];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw !== null && Number.isFinite(Number(raw))) return Math.max(0, Number(raw));
    }
    return 0;
  }
  function renderTrophy() {
    const profile = document.getElementById('view-profile');
    if (!profile || profile.querySelector('.lifetime-trophy-card')) return;
    const points = lifetimePoints();
    const upgrades = Math.floor(points / 120);
    const within = points % 120;
    const tiers = ['Bronze','Silver','Gold','Platinum','Emerald','Diamond','Master'];
    const tier = tiers[Math.min(tiers.length - 1, Math.floor(upgrades / 3))];
    const level = upgrades + 1;
    const card = document.createElement('section');
    card.className = 'lifetime-trophy-card';
    card.innerHTML = `<div class="lifetime-trophy-medal" aria-hidden="true"><i class="fa-solid fa-trophy"></i></div>
      <div class="lifetime-trophy-copy"><strong>${tier} Trophy · Level ${level}</strong>
      <small>Lifetime Rank Points: <b>${Math.floor(points)}</b> · Next upgrade: ${120-within} RP</small>
      <div class="lifetime-trophy-track" role="progressbar" aria-label="Progress to next trophy" aria-valuemin="0" aria-valuemax="120" aria-valuenow="${within}"><span style="width:${within/120*100}%"></span></div></div>`;
    const anchor = profile.querySelector('.profile-rank-grid') || profile.querySelector('.profile-stat-grid');
    if (anchor) anchor.insertAdjacentElement('afterend', card);
    else profile.prepend(card);
  }
  const originalShowProfile = app.showProfile?.bind(app);
  if (originalShowProfile) app.showProfile = function(...args) {
    const result = originalShowProfile(...args);
    renderTrophy();
    return result;
  };
  const originalLoadStats = app.loadProgressStats?.bind(app);
  if (originalLoadStats) app.loadProgressStats = function(...args) {
    const result = originalLoadStats(...args);
    renderTrophy();
    return result;
  };
  window.addEventListener('storage', event => {
    if (event.key && /rank_points|lifetime/i.test(event.key)) {
      document.querySelector('#view-profile .lifetime-trophy-card')?.remove();
      renderTrophy();
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderTrophy, {once:true});
  else renderTrophy();
})();