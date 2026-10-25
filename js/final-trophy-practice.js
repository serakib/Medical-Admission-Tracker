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

    .lifetime-trophy-card{width:100%;text-align:left;cursor:pointer;color:inherit;font:inherit}#profile-rank-card{display:none!important}
    .exam-trophy-hub-modal[hidden]{display:none!important}
    .exam-trophy-hub-modal{position:fixed!important;inset:0!important;z-index:12000!important;display:block!important;overflow:auto!important;max-width:none!important;width:100%!important;margin:0!important;padding:12px!important;background:rgba(2,6,23,.8)!important;backdrop-filter:blur(8px)}
    .exam-trophy-hub-modal>div{width:min(100%,900px);max-height:calc(100vh - 24px);overflow:auto;margin:0 auto!important;background:var(--surface,#fff);border-radius:22px;padding:18px!important;box-shadow:0 24px 80px #0005}
    .exam-hub-close{display:block;margin:0 0 12px auto;padding:8px 12px;border-radius:10px;background:#334155;color:#fff;font-weight:800}
    .exam-trophy-collection{margin:18px 0;padding:16px;border:1px solid rgba(148,163,184,.3);border-radius:18px;background:rgba(148,163,184,.06)}
    .exam-trophy-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.exam-trophy-heading span{font-size:9px;letter-spacing:1.8px;font-weight:900;opacity:.65}.exam-trophy-heading h3{font-size:20px;font-weight:950;margin:3px 0}.exam-trophy-heading p{font-size:12px;opacity:.7}.exam-trophy-heading>b{white-space:nowrap;font-size:12px}
    .exam-trophy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px}.exam-trophy-item{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 6px;border-radius:13px;background:rgba(148,163,184,.09);border:1px solid rgba(148,163,184,.2)}.exam-trophy-item .premium-trophy-medal{width:66px;height:72px;flex-basis:72px}.exam-trophy-item strong{font-size:11px;margin-top:5px}.exam-trophy-item small{font-size:9px;font-weight:900;opacity:.7;margin-top:3px}.is-locked{filter:grayscale(1);opacity:.45}.leader-latest-trophy{display:flex;align-items:center;justify-content:flex-end;gap:6px}.leader-trophy-dot{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;color:#fff;font-size:14px;border:2px solid #fff8;box-shadow:0 3px 8px #0003}.leader-latest-trophy small{font-size:10px;white-space:nowrap}
    @media(max-width:600px){.exam-trophy-hub-modal>div{padding:12px!important}.exam-trophy-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.exam-trophy-heading{align-items:flex-start;flex-direction:column}}

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
    const rankMatch = rankText.match(/([\d,]+)\s*lifetime Rank Points/i);
    if (rankMatch) return Math.max(0, Number(rankMatch[1].replace(/,/g, '')) || 0);
    try { const progress = JSON.parse(localStorage.getItem('med_account_progress_v1_' + (app.authUser?.uid || 'guest')) || '{}'); if (Number.isFinite(Number(progress.rankPoints))) return Math.max(0, Number(progress.rankPoints)); } catch (_) {}
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
    const profile=document.getElementById('view-profile');
    if(!profile)return;
    const points=lifetimePoints();
    const current=rankFromPoints(points);
    const rank=current.rank;
    let card=profile.querySelector('.lifetime-trophy-card');
    if(!card){
      card=document.createElement('button');card.type='button';card.className='lifetime-trophy-card';
      card.setAttribute('aria-label','Open all trophy ranks');
      const anchor=profile.querySelector('#profile-rank-card')||profile.querySelector('.profile-hero');
      if(anchor)anchor.insertAdjacentElement('afterend',card);else profile.prepend(card);
    }
    card.innerHTML='<div class="premium-trophy-medal" style="--trophy-main:'+rank[1]+';--trophy-dark:'+rank[2]+';--trophy-shine:'+rank[3]+'" role="img" aria-label="'+rank[0]+' trophy"><svg viewBox="0 0 100 112" aria-hidden="true"><path d="M28 22H10v15c0 15 10 24 25 24M72 22h18v15c0 15-10 24-25 24" fill="none" stroke="'+rank[1]+'" stroke-width="9"/><path d="M28 12h44v26c0 18-10 29-22 29S28 56 28 38Z" fill="'+rank[1]+'" stroke="'+rank[3]+'" stroke-width="1.5"/><path d="M50 24l4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.3-8.4-4.4-8.4 4.4 1.6-9.3-6.8-6.6 9.4-1.4Z" fill="'+rank[3]+'" stroke="'+rank[2]+'"/><path d="M28 83h44l7 15H21Z" fill="'+rank[1]+'" stroke="'+rank[3]+'" stroke-width="1.5"/><path d="M31 87h38M31 99h38" stroke="'+rank[2]+'" stroke-width="1.5"/><text x="50" y="94" text-anchor="middle" font-size="10" font-weight="900" fill="'+rank[2]+'" stroke="'+rank[3]+'" stroke-width=".25">'+Math.floor(points).toLocaleString()+' RP</text></svg></div><div class="lifetime-trophy-copy"><div class="trophy-eyebrow">LATEST ACHIEVEMENT</div><strong>'+rank[0]+'</strong><small>'+Math.floor(points).toLocaleString()+' Lifetime RP · '+current.left+' / '+current.required+' RP toward next rank</small><div class="lifetime-trophy-track"><span style="width:'+Math.min(100,current.left/current.required*100)+'%;background:linear-gradient(90deg,'+rank[2]+','+rank[1]+','+rank[3]+')"></span></div><div class="trophy-progress-label"><span>Open Exam & Trophy Hub</span><span>View all ↗</span></div></div>';
    card.onclick=function(){openExamTrophyHub('random');};
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
  const trophyRanks = [
    ['Bronze I','#b8793f','#583018','#f6d1a0'],['Bronze II','#b8793f','#583018','#f6d1a0'],['Bronze III','#b8793f','#583018','#f6d1a0'],
    ['Silver I','#a8b4c4','#475569','#ffffff'],['Silver II','#a8b4c4','#475569','#ffffff'],['Silver III','#a8b4c4','#475569','#ffffff'],
    ['Gold I','#eab308','#854d0e','#fff2a6'],['Gold II','#eab308','#854d0e','#fff2a6'],['Gold III','#eab308','#854d0e','#fff2a6'],
    ['Platinum I','#7dd3fc','#1e40af','#eff6ff'],['Platinum II','#7dd3fc','#1e40af','#eff6ff'],['Platinum III','#7dd3fc','#1e40af','#eff6ff'],
    ['Emerald I','#34d399','#065f46','#d1fae5'],['Emerald II','#34d399','#065f46','#d1fae5'],['Emerald III','#34d399','#065f46','#d1fae5'],
    ['Diamond I','#c4b5fd','#5b21b6','#f5f3ff'],['Diamond II','#c4b5fd','#5b21b6','#f5f3ff'],['Diamond III','#c4b5fd','#5b21b6','#f5f3ff'],
    ['Master I','#fb7185','#881337','#ffe4e6'],['Master II','#fb7185','#881337','#ffe4e6'],['Master III','#fb7185','#881337','#ffe4e6'],
    ['Grandmaster I','#f97316','#7c2d12','#ffedd5'],['Grandmaster II','#f97316','#7c2d12','#ffedd5'],['Grandmaster III','#f97316','#7c2d12','#ffedd5'],
    ['Legend I','#facc15','#713f12','#fef9c3'],['Legend II','#facc15','#713f12','#fef9c3'],['Legend III','#facc15','#713f12','#fef9c3'],
    ['Mythic I','#e879f9','#701a75','#fae8ff'],['Mythic II','#e879f9','#701a75','#fae8ff'],['Mythic III','#e879f9','#701a75','#fae8ff'],
    ['Immortal','#f43f5e','#4c0519','#ffe4e6']
  ];
  function requiredRP(index) { if(index===0)return 100; let n=100; for(let i=1;i<=index;i++)n=Math.ceil(120+n*0.2); return n; }
  function rankFromPoints(points) {
    let left=Math.max(0,Number(points)||0), index=0;
    while(index<trophyRanks.length-1 && left>=requiredRP(index)){left-=requiredRP(index);index++;}
    return {index:index,left:left,rank:trophyRanks[index],required:requiredRP(index)};
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderTrophy, {once:true});
  else renderTrophy();

  function closeExamTrophyHub() {
    const overlay=document.getElementById('exam-trophy-hub-modal');
    if(overlay)overlay.hidden=true;
    document.body.style.overflow='';
  }
  function openExamTrophyHub() {
    let overlay=document.getElementById('exam-trophy-hub-modal');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='exam-trophy-hub-modal';
      overlay.className='exam-trophy-hub-modal';
      overlay.hidden=true;
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-labelledby','exam-trophy-hub-title');
      overlay.innerHTML='<div><button type="button" class="exam-hub-close" aria-label="Close trophy gallery">✕ Close</button><section id="exam-trophy-collection" class="exam-trophy-collection"></section></div>';
      overlay.addEventListener('click',function(event){if(event.target===overlay)closeExamTrophyHub();});
      overlay.querySelector('.exam-hub-close').addEventListener('click',closeExamTrophyHub);
      document.body.appendChild(overlay);
    }
    renderCollection();
    overlay.hidden=false;
    document.body.style.overflow='hidden';
    const heading=overlay.querySelector('#exam-trophy-hub-title');
    if(heading)heading.focus();
  }
  function renderCollection() {
    const points=lifetimePoints();
    const current=rankFromPoints(points);
    const overlay=document.getElementById('exam-trophy-hub-modal');
    if(!overlay)return;
    let host=overlay.querySelector('#exam-trophy-collection');
    if(!host){
      host=document.createElement('section');
      host.id='exam-trophy-collection';
      host.className='exam-trophy-collection';
      overlay.querySelector(':scope > div').appendChild(host);
    }
    let cards='';
    trophyRanks.forEach(function(rank,i){
      let target=0;
      for(let j=0;j<i;j++)target+=requiredRP(j);
      const earned=points>=target;
      const c=rank[1],d=rank[2],s=rank[3];
      const emblem=i%3===0
        ? '<path d="M50 24l4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.3-8.4-4.4-8.4 4.4 1.6-9.3-6.8-6.6 9.4-1.4Z" fill="'+s+'" stroke="'+d+'" stroke-width="1.5"/>'
        : i%3===1
          ? '<path d="M50 22 65 38 50 54 35 38Z" fill="'+s+'" stroke="'+d+'" stroke-width="2"/><path d="M50 29v18M41 38h18" stroke="'+d+'" stroke-width="2"/>'
          : '<path d="M34 29l10 8 6-13 6 13 10-8-3 20H37Z" fill="'+s+'" stroke="'+d+'" stroke-width="2"/><path d="M39 53h22" stroke="'+s+'" stroke-width="3"/>';

      const stage=i%3+1;
      const tier=Math.floor(i/3);
      cards+='<article class="exam-trophy-item rank-stage-'+stage+' rank-tier-'+tier+' '+(earned?'earned':'locked')+'"><div class="premium-trophy-medal '+(earned?'is-earned':'is-locked')+'" style="--trophy-main:'+c+';--trophy-dark:'+d+';--trophy-shine:'+s+'"><svg viewBox="0 0 100 112" aria-hidden="true"><path d="M28 22H10v15c0 15 10 24 25 24M72 22h18v15c0 15-10 24-25 24" fill="none" stroke="'+c+'" stroke-width="9"/><path d="M28 12h44v26c0 18-10 29-22 29S28 56 28 38Z" fill="'+c+'" stroke="'+s+'" stroke-width="2"/>'+emblem+'<path d="M28 83h44l7 15H21Z" fill="'+c+'" stroke="'+s+'" stroke-width="2"/><text x="50" y="94" text-anchor="middle" font-size="10" font-weight="900" fill="'+d+'">'+target+' RP</text></svg></div><strong>'+rank[0]+'</strong><small>'+(earned?'UNLOCKED':'TARGET '+target.toLocaleString()+' RP')+'</small></article>';
    });
    host.innerHTML='<div class="exam-trophy-heading"><div><span>ACHIEVEMENT VAULT</span><h3 id="exam-trophy-hub-title" tabindex="-1">All Trophy Ranks</h3><p>Earned trophies are highlighted; locked trophies show their RP target.</p></div><b>'+Math.floor(points).toLocaleString()+' Lifetime RP</b></div><div class="exam-trophy-grid">'+cards+'</div>';
    // Make all ranks visually distinguishable, even within the same colour tier.
    host.querySelectorAll('.exam-trophy-item').forEach(function(card,index){
      const stage=index%3;
      card.style.borderRadius=stage===0?'18px 18px 12px 12px':stage===1?'10px 18px 10px 18px':'22px 8px 22px 8px';
      card.style.borderStyle=stage===0?'solid':stage===1?'double':'dashed';
    });
  }
  const previousShowView=app.showView.bind(app);
  app.showView=function(viewName) {
    const result=previousShowView.apply(this,arguments);
    if(viewName==='profile')setTimeout(renderTrophy,0);
    return result;
  };
  document.addEventListener('click',function(event){
    const start=event.target.closest('#view-setup button[onclick*="startExamWithConfig"]');
    if(start)document.getElementById('view-setup')?.classList.remove('exam-trophy-hub-modal');
    if(event.target.closest('#setup-mode-model'))setTimeout(function(){
      const opts=document.getElementById('setup-question-count-options');
      if(opts)opts.querySelectorAll('button').forEach(function(btn){const n=Number((btn.textContent.match(/\d+/)||[])[0]);if(n!==50&&n!==100){btn.hidden=true;btn.disabled=true;}});
      document.querySelectorAll('.time-btn').forEach(function(btn){btn.remove();});
      const label=[...document.querySelectorAll('label')].find(function(el){return el.textContent.includes('সময়সীমা');});
      if(label&&label.parentElement)label.parentElement.remove();
    },0);
  });
  const oldLeaderboard=app.renderLeaderboardRows&&app.renderLeaderboardRows.bind(app);
  if(oldLeaderboard)app.renderLeaderboardRows=function(rows){
    const result=oldLeaderboard(rows), body=document.getElementById('leaderboard-body');
    if(body)body.querySelectorAll('tr').forEach(function(tr,i){
      const cells=tr.querySelectorAll('td'), cell=cells[cells.length-1];if(!cell)return;
      const points=Number((Array.isArray(rows)&&rows[i]&&rows[i].points)||0), current=rankFromPoints(points), rank=current.rank;
      cell.innerHTML='<span class="leader-latest-trophy" title="Latest achievement: '+rank[0]+'"><span class="leader-trophy-dot" style="background:linear-gradient(135deg,'+rank[1]+','+rank[2]+')">🏆</span><small>'+rank[0]+'</small></span>';
    });
    return result;
  };
  window.addEventListener('storage',function(){setTimeout(renderTrophy,0);});

})();