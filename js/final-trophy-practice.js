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
    .premium-trophy-medal{display:grid;place-items:center;flex:0 0 82px;width:82px;height:92px;filter:drop-shadow(0 7px 5px #0003);position:relative}
    .premium-trophy-medal:after{content:'';position:absolute;inset:5px 8px 10px;border:1px solid var(--trophy-shine);border-radius:45% 45% 12% 12%;opacity:.45;pointer-events:none}
    .premium-trophy-medal svg{width:100%;height:100%;overflow:visible}
    .trophy-eyebrow{font-size:9px;letter-spacing:1.8px;font-weight:900;opacity:.65;margin-bottom:4px}
    .trophy-progress-label{display:flex;justify-content:space-between;margin-top:5px;font-size:10px;font-weight:800;opacity:.72}
    .lifetime-trophy-copy{min-width:0;flex:1}.lifetime-trophy-copy strong{display:block;font-size:1rem;font-weight:900}
    .lifetime-trophy-copy small{display:block;margin-top:4px;opacity:.75;line-height:1.6}
    .lifetime-trophy-track{height:7px;overflow:hidden;border-radius:99px;background:rgba(148,163,184,.25);margin-top:9px}
    .lifetime-trophy-track span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#a16207,#facc15,#fff0a6)}
    @media(max-width:600px){#view-exam-intro.final-instructions-modal{padding:10px}#view-exam-intro.final-instructions-modal > div{max-height:calc(100vh - 20px)}.lifetime-trophy-card{gap:11px;padding:13px}.premium-trophy-medal{flex-basis:66px;width:66px;height:76px}}
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
    if (!profile) return;
    const points = lifetimePoints();
    const upgrades = Math.floor(points / 120);
    const within = points % 120;
    const tiers = [
      {name:'Bronze', color:'#b8793f', dark:'#583018', shine:'#f6d1a0'},
      {name:'Silver', color:'#a8b4c4', dark:'#475569', shine:'#ffffff'},
      {name:'Gold', color:'#eab308', dark:'#854d0e', shine:'#fff2a6'},
      {name:'Platinum', color:'#7dd3fc', dark:'#1e40af', shine:'#eff6ff'},
      {name:'Emerald', color:'#34d399', dark:'#065f46', shine:'#d1fae5'},
      {name:'Diamond', color:'#c4b5fd', dark:'#5b21b6', shine:'#f5f3ff'},
      {name:'Master', color:'#fb7185', dark:'#881337', shine:'#ffe4e6'}
    ];
    const tier = tiers[Math.min(tiers.length - 1, Math.floor(upgrades / 3))];
    const level = upgrades + 1;
    let card = profile.querySelector('.lifetime-trophy-card');
    if (!card) {
      card = document.createElement('section');
      card.className = 'lifetime-trophy-card';
      const anchor = profile.querySelector('#profile-rank-card') || profile.querySelector('.profile-hero');
      if (anchor) anchor.insertAdjacentElement('afterend', card);
      else profile.prepend(card);
    }
    card.innerHTML = `
      <div class="premium-trophy-medal" style="--trophy-main:${tier.color};--trophy-dark:${tier.dark};--trophy-shine:${tier.shine}" role="img" aria-label="${tier.name} trophy">
        <svg viewBox="0 0 100 112" aria-hidden="true">
          <defs><linearGradient id="trophy-metal-${tier.name}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--trophy-shine)"/><stop offset=".28" stop-color="var(--trophy-main)"/><stop offset=".63" stop-color="var(--trophy-dark)"/><stop offset=".82" stop-color="var(--trophy-main)"/><stop offset="1" stop-color="var(--trophy-dark)"/></linearGradient></defs>
          <path d="M28 22H10v15c0 15 10 24 25 24M72 22h18v15c0 15-10 24-25 24" fill="none" stroke="url(#trophy-metal-${tier.name})" stroke-width="9" stroke-linecap="round"/>
          <path d="M28 12h44v26c0 18-10 29-22 29S28 56 28 38Z" fill="url(#trophy-metal-${tier.name})" stroke="var(--trophy-shine)" stroke-width="1.5"/>
          <path d="M35 18h30v19c0 12-6 20-15 20s-15-8-15-20Z" fill="none" stroke="var(--trophy-shine)" stroke-opacity=".75" stroke-width="1.4"/>
          <path d="M50 24l4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.3-8.4-4.4-8.4 4.4 1.6-9.3-6.8-6.6 9.4-1.4Z" fill="var(--trophy-shine)" stroke="var(--trophy-dark)" stroke-width=".8"/>
          <path d="M43 66h14v12H43z" fill="url(#trophy-metal-${tier.name})"/><path d="M34 76h32v7H34z" fill="url(#trophy-metal-${tier.name})" stroke="var(--trophy-shine)" stroke-width="1"/>
          <path d="M28 83h44l7 15H21Z" fill="url(#trophy-metal-${tier.name})" stroke="var(--trophy-shine)" stroke-width="1.5"/>
          <path d="M35 88h30M32 93h36" stroke="var(--trophy-shine)" stroke-opacity=".9" stroke-width="1.2"/>
          <text x="50" y="93" text-anchor="middle" font-size="8" font-weight="900" fill="var(--trophy-dark)">${String(level).padStart(2,'0')}</text>
        </svg>
      </div>
      <div class="lifetime-trophy-copy"><div class="trophy-eyebrow">LIFETIME ACHIEVEMENT</div><strong>${tier.name} Trophy · Level ${level}</strong>
      <small><b>${Math.floor(points).toLocaleString()}</b> Lifetime Rank Points · ${120-within} RP to next upgrade</small>
      <div class="lifetime-trophy-track" role="progressbar" aria-label="Progress to next trophy" aria-valuemin="0" aria-valuemax="120" aria-valuenow="${within}"><span style="width:${within/120*100}%;background:linear-gradient(90deg,${tier.dark},${tier.color},${tier.shine})"></span></div>
      <div class="trophy-progress-label"><span>${within} / 120 RP</span><span>${Math.round(within/120*100)}%</span></div></div>`;
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