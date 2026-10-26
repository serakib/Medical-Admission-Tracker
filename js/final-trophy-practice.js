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
    .live-trophy-medal-wrap{display:flex;flex:0 0 82px;width:82px;flex-direction:column;align-items:center;gap:2px}.live-trophy-rp-caption{font-size:10px;font-weight:950;line-height:1.2;white-space:nowrap;text-align:center;letter-spacing:.02em}.live-trophy-medal-wrap .premium-trophy-medal{flex-basis:82px}.premium-trophy-medal{display:grid;place-items:center;flex:0 0 82px;width:82px;height:92px;filter:drop-shadow(0 7px 5px #0003);position:relative}
    .premium-trophy-medal:after{content:'';position:absolute;inset:5px 8px 10px;border:1px solid var(--trophy-shine);border-radius:45% 45% 12% 12%;opacity:.45;pointer-events:none}
    .premium-trophy-medal svg{width:100%;height:100%;overflow:visible}

    .lifetime-trophy-card{width:100%;text-align:left;cursor:pointer;color:inherit;font:inherit}#profile-rank-card{display:none!important}
    .exam-trophy-hub-modal[hidden]{display:none!important}
    .exam-trophy-hub-modal{position:fixed!important;inset:0!important;z-index:12000!important;display:block!important;overflow:auto!important;max-width:none!important;width:100%!important;margin:0!important;padding:12px!important;background:rgba(2,6,23,.8)!important;backdrop-filter:blur(8px)}
    .exam-trophy-hub-modal>div{width:min(100%,900px);max-height:calc(100vh - 24px);overflow:auto;margin:0 auto!important;background:var(--surface,#fff);border-radius:22px;padding:18px!important;box-shadow:0 24px 80px #0005}
    .exam-hub-close{display:block;margin:0 0 12px auto;padding:8px 12px;border-radius:10px;background:#334155;color:#fff;font-weight:800}
    .exam-trophy-collection{margin:18px 0;padding:16px;border:1px solid rgba(148,163,184,.3);border-radius:18px;background:rgba(148,163,184,.06)}
    .exam-trophy-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.exam-trophy-heading span{font-size:9px;letter-spacing:1.8px;font-weight:900;opacity:.65}.exam-trophy-heading h3{font-size:20px;font-weight:950;margin:3px 0}.exam-trophy-heading p{font-size:12px;opacity:.7}.exam-trophy-heading>b{white-space:nowrap;font-size:12px}
    .exam-trophy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px}.exam-trophy-rp-caption{font-size:10px;font-weight:900;letter-spacing:.045em;opacity:.8;margin:0 0 3px;text-align:center}
    .exam-trophy-item{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 6px;border-radius:13px;background:rgba(148,163,184,.09);border:1px solid rgba(148,163,184,.2)}.exam-trophy-item .premium-trophy-medal{width:66px;height:72px;flex-basis:72px}.exam-trophy-item strong{font-size:11px;margin-top:5px}.exam-trophy-item small{font-size:9px;font-weight:900;opacity:.7;margin-top:3px}.is-locked{filter:grayscale(1);opacity:.45}.leader-latest-trophy{display:flex;align-items:center;justify-content:flex-end;gap:6px}.leader-trophy-dot{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;color:#fff;font-size:14px;border:2px solid #fff8;box-shadow:0 3px 8px #0003}.leader-latest-trophy small{font-size:10px;white-space:nowrap}
    @media(max-width:600px){.exam-trophy-hub-modal>div{padding:12px!important}.exam-trophy-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.exam-trophy-heading{align-items:flex-start;flex-direction:column}}

    .trophy-eyebrow{font-size:9px;letter-spacing:1.8px;font-weight:900;opacity:.65;margin-bottom:4px}
    .trophy-progress-label{display:flex;justify-content:space-between;margin-top:5px;font-size:10px;font-weight:800;opacity:.72}
    .lifetime-trophy-copy{min-width:0;flex:1}.lifetime-trophy-copy strong{display:block;font-size:1rem;font-weight:900}
    .lifetime-trophy-copy small{display:block;margin-top:4px;opacity:.75;line-height:1.6}
    .lifetime-trophy-track{height:7px;overflow:hidden;border-radius:99px;background:rgba(148,163,184,.25);margin-top:9px}
    .lifetime-trophy-track span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#a16207,#facc15,#fff0a6)}
    @media(max-width:600px){#view-exam-intro.final-instructions-modal{padding:10px}#view-exam-intro.final-instructions-modal > div{max-height:calc(100vh - 20px)}.lifetime-trophy-card{gap:11px;padding:13px}.live-trophy-medal-wrap{flex-basis:66px;width:66px}.live-trophy-rp-caption{font-size:9px}.live-trophy-medal-wrap .premium-trophy-medal,.premium-trophy-medal{flex-basis:66px;width:66px;height:76px}}
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
    // Prefer the Medical Sheets API's lifetime total over browser-only legacy rank points.
    const profileTotal = Number(app.profile?.totalRP);
    if (Number.isFinite(profileTotal) && profileTotal >= 0) return profileTotal;
    const cachedRows = typeof app.getLocalLeaderboardRows === 'function' ? app.getLocalLeaderboardRows() : [];
    const currentId = String(app.authUser?.uid || app.profile?.uid || app.profile?.userId || '');
    const cachedMe = Array.isArray(cachedRows) ? cachedRows.find(row => currentId && String(row.uid || row.userId || '') === currentId) : null;
    const cachedTotal = Number(cachedMe?.totalRP);
    if (Number.isFinite(cachedTotal) && cachedTotal >= 0) return cachedTotal;
    if (typeof app.getAccountProgress === 'function') {
      const state = app.getAccountProgress();
      if (Number.isFinite(Number(state.rankPoints))) return Math.max(0, Number(state.rankPoints));
    }
    const rankCard = document.getElementById('profile-rank-card');
    const rankText = rankCard?.textContent || '';
    const rankMatch = rankText.match(/([\d,]+)\s*(?:RP(?: \(Rank Points\))?|lifetime Rank Points)/i);
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
    const nextRankText=current.index>=trophyRanks.length-1?'Maximum trophy rank reached':current.left.toLocaleString()+' / '+current.required.toLocaleString()+' RP toward next rank';
    const trophyProgress=current.index>=trophyRanks.length-1?100:Math.min(100,current.left/current.required*100);
    card.innerHTML='<div class="live-trophy-medal-wrap"><div class="live-trophy-rp-caption">RP: '+Math.floor(points).toLocaleString()+'</div><div class="premium-trophy-medal" style="--trophy-main:'+rank[1]+';--trophy-dark:'+rank[2]+';--trophy-shine:'+rank[3]+'" role="img" aria-label="'+rank[0]+' trophy"><svg viewBox="0 0 100 112" aria-hidden="true"><path d="M28 22H10v15c0 15 10 24 25 24M72 22h18v15c0 15-10 24-25 24" fill="none" stroke="'+rank[1]+'" stroke-width="9"/>'+buildTrophyEmblem(current.index,rank[1],rank[2],rank[3])+'<path d="M28 83h44l7 15H21Z" fill="'+rank[1]+'" stroke="'+rank[3]+'" stroke-width="1.5"/><text x="50" y="94" text-anchor="middle" font-size="11" font-weight="900" textLength="58" lengthAdjust="spacingAndGlyphs" fill="'+rank[2]+'">'+Math.floor(points).toLocaleString()+' RP</text></svg></div></div><div class="lifetime-trophy-copy"><div class="trophy-eyebrow">LATEST ACHIEVEMENT</div><strong>'+rank[0]+'</strong><small>'+Math.floor(points).toLocaleString()+' Lifetime RP · '+nextRankText+'</small><div class="lifetime-trophy-track"><span style="width:'+trophyProgress+'%;background:linear-gradient(90deg,'+rank[2]+','+rank[1]+','+rank[3]+')"></span></div><div class="trophy-progress-label"><span>Open Exam & Trophy Hub</span><span>View all ↗</span></div></div>';
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
  const subRanks = ['V', 'IV', 'III', 'II', 'I'];
  const trophyTiers = [
    { name:'Bronze', main:'#b8793f', dark:'#583018', shine:'#f6d1a0' },
    { name:'Silver', main:'#a8b4c4', dark:'#475569', shine:'#ffffff' },
    { name:'Gold', main:'#eab308', dark:'#854d0e', shine:'#fff2a6' },
    { name:'Platinum', main:'#7dd3fc', dark:'#1e40af', shine:'#eff6ff' },
    { name:'Emerald', main:'#34d399', dark:'#065f46', shine:'#d1fae5' },
    { name:'Diamond', main:'#c4b5fd', dark:'#5b21b6', shine:'#f5f3ff' },
    { name:'Master', main:'#fb7185', dark:'#881337', shine:'#ffe4e6' },
    { name:'Grandmaster', main:'#f97316', dark:'#7c2d12', shine:'#ffedd5' },
    { name:'Legend', main:'#facc15', dark:'#713f12', shine:'#fef9c3' },
    { name:'Mythic', main:'#e879f9', dark:'#701a75', shine:'#fae8ff' }
  ];
  const trophyRanks = trophyTiers.flatMap(tier => subRanks.map(sub => [tier.name+' '+sub, tier.main, tier.dark, tier.shine, tier.name.toLowerCase(), sub]));
  trophyRanks.push(['Immortal','#f43f5e','#4c0519','#ffe4e6','immortal','I']);
  function roundRankCost(value) { return Math.max(5, Math.round(Number(value || 0) / 5) * 5); }
  // Rank-up costs use RP: step 1 costs 200 RP; later steps scale by 200 plus 20%.
  function requiredRP(index) {
    if (index >= trophyRanks.length - 1) return 0;
    const step = index + 1;
    const base = step * 200;
    return roundRankCost(step === 1 ? base : base * 1.2);
  }
  function rankFromPoints(points) {
    const value = Math.max(0, Number(points) || 0);
    let index = 0, accumulated = 0;
    while (index < trophyRanks.length - 1) {
      const required = requiredRP(index);
      if (value < accumulated + required) break;
      accumulated += required;
      index++;
    }
    const atMax = index === trophyRanks.length - 1;
    const required = atMax ? 0 : requiredRP(index);
    const left = atMax ? 0 : Math.max(0, value - accumulated);
    return { index, left, rank: trophyRanks[index], required, progress: atMax ? 100 : Math.min(100, left / required * 100) };
  }
  function buildTrophyEmblem(index, main, dark, shine) {
    const frames = [
      '<path d="M50 12 78 25 74 61 50 84 26 61 22 25Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M50 19 70 29 66 56 50 72 34 56 30 29Z" fill="none" stroke="'+dark+'" stroke-width="2"/>',
      '<path d="M50 12 72 23 84 45 72 68 50 82 28 68 16 45 28 23Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M50 20 66 29 75 45 66 61 50 72 34 61 25 45 34 29Z" fill="none" stroke="'+dark+'" stroke-width="2"/>',
      '<path d="M50 10 59 25 77 18 73 37 90 46 73 55 77 74 59 67 50 84 41 67 23 74 27 55 10 46 27 37 23 18 41 25Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/>',
      '<path d="M50 9 82 35 68 75 50 87 32 75 18 35Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M50 17 73 37 62 68 50 77 38 68 27 37Z" fill="none" stroke="'+dark+'" stroke-width="2"/>',
      '<path d="M50 15 69 22 82 39 72 61 50 83 28 61 18 39 31 22Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M25 50Q18 30 35 29M75 50Q82 30 65 29M29 57Q22 68 37 72M71 57Q78 68 63 72" fill="none" stroke="'+dark+'" stroke-width="3"/>',
      '<path d="M50 10 79 27 79 59 50 83 21 59 21 27Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M50 18 70 31 70 56 50 73 30 56 30 31Z" fill="none" stroke="'+dark+'" stroke-width="2"/><path d="M30 31 70 56M70 31 30 56" stroke="'+shine+'" stroke-width="1.5"/>',
      '<path d="M17 28 34 34 42 17 50 31 58 17 66 34 83 28 78 55 68 65 32 65 22 55Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M29 70H71L76 79H24Z" fill="'+dark+'" stroke="'+shine+'" stroke-width="1.5"/>',
      '<path d="M12 25 35 33 50 18 65 33 88 25 77 49 66 59 50 84 34 59 23 49Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M21 33 38 42M79 33 62 42" stroke="'+dark+'" stroke-width="3"/>',
      '<path d="M50 10 61 32 85 23 72 45 91 58 65 61 61 85 50 67 39 85 35 61 9 58 28 45 15 23 39 32Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/>',
      '<path d="M50 12Q65 31 78 24L73 52Q68 68 50 84Q32 68 27 52L22 24Q35 31 50 12Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2"/><path d="M50 28Q61 43 59 56Q54 67 44 70Q49 59 42 48Q39 40 50 28Z" fill="'+shine+'" stroke="'+dark+'" stroke-width="1.5"/>'
    ];
    const centers = [
      '<path d="M50 24 64 39 50 54 36 39Z" fill="'+shine+'" stroke="'+dark+'" stroke-width="2"/><path d="M50 29V49M40 39H60" stroke="'+dark+'" stroke-width="1.5"/>',
      '<path d="M50 22 55 34 68 35 58 44 61 57 50 50 39 57 42 44 32 35 45 34Z" fill="'+shine+'" stroke="'+dark+'" stroke-width="1.7"/>',
      '<path d="M31 39 40 30 50 39 60 30 69 39 64 52H36Z" fill="'+shine+'" stroke="'+dark+'" stroke-width="2"/><path d="M36 57H64" stroke="'+dark+'" stroke-width="3"/>',
      '<path d="M27 35Q34 25 42 37L50 45 58 37Q66 25 73 35L66 52 50 61 34 52Z" fill="'+shine+'" stroke="'+dark+'" stroke-width="1.8"/><path d="M34 56 29 49M66 56 71 49" stroke="'+dark+'" stroke-width="2"/>',
      '<path d="M50 21 56 34 70 35 59 45 62 59 50 52 38 59 41 45 30 35 44 34Z" fill="'+shine+'" stroke="'+dark+'" stroke-width="1.7"/><circle cx="50" cy="42" r="5" fill="'+main+'" stroke="'+dark+'" stroke-width="1.5"/>'
    ];
    if (index >= 50) return '<path d="M50 12 62 28 81 22 75 42 91 52 72 62 69 82 50 72 31 82 28 62 9 52 25 42 19 22 38 28Z" fill="'+main+'" stroke="'+shine+'" stroke-width="2.5"/><path d="M50 24Q70 43 58 59Q54 67 43 70Q50 59 42 48Q37 37 50 24Z" fill="'+shine+'" stroke="'+dark+'" stroke-width="2"/><circle cx="50" cy="48" r="27" fill="none" stroke="'+shine+'" stroke-width="2"/>';
    return frames[Math.floor(index / 5)] + centers[index % 5];
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
      // Show the cost of that rank's next upgrade; Immortal shows its cumulative unlock threshold.
      const required=i<trophyRanks.length-1?requiredRP(i):target;
      const c=rank[1],d=rank[2],s=rank[3];
      const emblem=buildTrophyEmblem(i,c,d,s);
      const stage=i%5+1;
      const tier=Math.floor(i/5);

      cards+='<article class="exam-trophy-item rank-stage-'+stage+' rank-tier-'+tier+' '+(earned?'earned':'locked')+'"><div class="exam-trophy-rp-caption">RP: '+required.toLocaleString()+'</div><div class="premium-trophy-medal '+(earned?'is-earned':'is-locked')+'" style="--trophy-main:'+c+';--trophy-dark:'+d+';--trophy-shine:'+s+'"><svg viewBox="0 0 100 112" aria-hidden="true"><path d="M28 22H10v15c0 15 10 24 25 24M72 22h18v15c0 15-10 24-25 24" fill="none" stroke="'+c+'" stroke-width="9"/><path d="M28 12h44v26c0 18-10 29-22 29S28 56 28 38Z" fill="'+c+'" stroke="'+s+'" stroke-width="2"/>'+emblem+'<path d="M28 83h44l7 15H21Z" fill="'+c+'" stroke="'+s+'" stroke-width="2"/><text x="50" y="94" text-anchor="middle" font-size="11" font-weight="900" textLength="58" lengthAdjust="spacingAndGlyphs" fill="'+d+'">'+required.toLocaleString()+' RP</text></svg></div><strong>'+rank[0]+'</strong><small>'+(earned?'UNLOCKED':'REQUIRES '+required.toLocaleString()+' RP')+'</small></article>';
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
  function rankPointsForLeaderboardRow(row) {
    // Achievement Vault trophy progression is based on lifetime RP, never weekly RP.
    return Math.max(0, Number(row?.totalRP ?? row?.lifetimeRankPoints ?? row?.rankPoints ?? row?.points ?? 0) || 0);
  }
  function rankIndexForName(name) {
    const wanted = String(name || '').trim().toLowerCase();
    return trophyRanks.findIndex(rank => rank[0].toLowerCase() === wanted);
  }
  function getRankInfoForName(name) {
    const index = rankIndexForName(name);
    if (index < 0) return null;
    let rankStartRP = 0;
    for (let i = 0; i < index; i++) rankStartRP += requiredRP(i);
    const atMax = index >= trophyRanks.length - 1;
    const required = atMax ? 0 : requiredRP(index);
    return { index, name: trophyRanks[index][0], nextName: atMax ? '' : trophyRanks[index + 1][0], rankStartRP, required, safeZoneRP: atMax ? 0 : Math.ceil(required * 0.3), atMax };
  }
  function getRankInfoForPoints(points) {
    const current = rankFromPoints(points);
    return { index: current.index, name: current.rank[0], nextName: current.index >= trophyRanks.length - 1 ? '' : trophyRanks[current.index + 1][0], progressRP: current.left, required: current.required, progress: current.progress, safeZoneRP: current.index >= trophyRanks.length - 1 ? 0 : Math.ceil(current.required * 0.3), atMax: current.index >= trophyRanks.length - 1 };
  }
  function trophySvgForIndex(index, className) {
    const safeIndex = Math.max(0, Math.min(trophyRanks.length - 1, Number(index) || 0));
    const [name, main, dark, shine] = trophyRanks[safeIndex];
    return '<svg class="' + String(className || 'vault-rank-trophy-svg') + '" viewBox="0 0 100 112" role="img" aria-label="' + name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + ' trophy">' +
      '<path d="M28 22H10v15c0 15 10 24 25 24M72 22h18v15c0 15-10 24-25 24" fill="none" stroke="' + main + '" stroke-width="9"/>' +
      '<path d="M28 12h44v26c0 18-10 29-22 29S28 56 28 38Z" fill="' + main + '" stroke="' + shine + '" stroke-width="2"/>' +
      buildTrophyEmblem(safeIndex, main, dark, shine) +
      '<path d="M28 83h44l7 15H21Z" fill="' + main + '" stroke="' + shine + '" stroke-width="2"/></svg>';
  }
  function trophySvgForRankName(name, className) {
    const index = rankIndexForName(name);
    return trophySvgForIndex(index >= 0 ? index : rankFromPoints(lifetimePoints()).index, className);
  }
  function leaderboardTrophyMarkup(row) {
    const points = rankPointsForLeaderboardRow(row);
    const current = rankFromPoints(points);
    const apiRank = String(row?.rank || '').trim();
    const apiRankIndex = rankIndexForName(apiRank);
    const index = apiRankIndex >= 0 ? apiRankIndex : current.index;
    const name = apiRankIndex >= 0 ? trophyRanks[apiRankIndex][0] : current.rank[0];
    return '<span class="leader-rank-trophy" title="' + name + '">' + trophySvgForIndex(index, 'leader-rank-trophy-svg') + '<span class="leader-rank-trophy-copy"><strong>' + name + '</strong></span></span>';
  }
  function installLeaderboardTrophyStyles() {
    if (document.getElementById('leader-rank-trophy-styles')) return;
    const style = document.createElement('style');
    style.id = 'leader-rank-trophy-styles';
    style.textContent = '.leader-rank-trophy{display:inline-flex;align-items:center;gap:6px;max-width:100%;vertical-align:middle;margin:3px 0}.leader-rank-trophy-svg{display:block;flex:0 0 28px;width:28px;height:32px;filter:drop-shadow(0 2px 2px #0003)}.leader-rank-trophy-copy{display:flex;flex-direction:column;align-items:flex-start;min-width:0;line-height:1.25}.leader-rank-trophy-copy strong{font-size:10px;font-weight:950;white-space:nowrap}.leader-rank-trophy-copy small{font-size:9px;opacity:.78;white-space:nowrap}.podium-card .leader-rank-trophy{justify-content:center}.podium-card .leader-rank-trophy-copy{align-items:center}.podium-place-label{display:flex;align-items:center;justify-content:center;width:40px;height:32px;margin:0 auto 4px;border:1px solid var(--line,rgba(148,163,184,.28));border-radius:10px;color:var(--text,#0f172a);background:var(--surface-2,rgba(148,163,184,.12));font-size:12px;font-weight:950;letter-spacing:.08em;box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}.dark .podium-place-label{color:#f8fafc;background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.26)}.leaderboard-me .leader-rank-trophy{margin-inline-start:8px}@media(max-width:600px){.leader-rank-trophy-svg{flex-basis:24px;width:24px;height:28px}.leader-rank-trophy-copy strong{font-size:9px}.leader-rank-trophy-copy small{font-size:8px}}';
    document.head.appendChild(style);
  }
  let latestLeaderboardRowsForTrophies = [];
  function paintLeaderboardTrophies(rows) {
    installLeaderboardTrophyStyles();
    if (Array.isArray(rows) && rows.length) latestLeaderboardRowsForTrophies = rows.slice();
    const byUid = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const id = String(row?.uid || row?.userId || row?.playerId || '');
      if (id) byUid.set(id,row);
    });
    const ordered = (Array.isArray(rows) ? rows : []).slice().sort((a,b)=>rankPointsForLeaderboardRow(b)-rankPointsForLeaderboardRow(a));
    const body = document.getElementById('leaderboard-body');
    if (body) body.querySelectorAll('tr.leader-row').forEach((tr,index)=>{
      tr.querySelectorAll('.leader-rank-trophy').forEach(el=>el.remove());
      const row = byUid.get(String(tr.dataset.uid || tr.dataset.medPlayer || '')) || (tr.dataset.totalRp ? { totalRP:Number(tr.dataset.totalRp), rankPoints:Number(tr.dataset.totalRp), rank:tr.dataset.rank || '' } : null) || ordered[index];
      const cell = tr.querySelector('.leader-rank-points') || tr.querySelector('td:last-child');
      if (!row || !cell) return;
      cell.insertAdjacentHTML('beforeend', leaderboardTrophyMarkup(row));
    });
    const podium = document.getElementById('leaderboard-podium');
    if (podium) podium.querySelectorAll('.podium-card').forEach((card,index)=>{
      card.querySelectorAll('.leader-rank-trophy').forEach(el=>el.remove());
      const row = byUid.get(String(card.dataset.uid || card.dataset.medPlayer || '')) || (card.dataset.totalRp ? { totalRP:Number(card.dataset.totalRp), rankPoints:Number(card.dataset.totalRp), rank:card.dataset.rank || '' } : null) || ordered[index];
      if (row) card.insertAdjacentHTML('beforeend', leaderboardTrophyMarkup(row));
    });
    const me = document.getElementById('leaderboard-me');
    const mine = (Array.isArray(rows)?rows:[]).find(row=>row?.uid && row.uid===app.authUser?.uid);
    if (me && mine) {
      me.querySelectorAll('.leader-rank-trophy').forEach(el=>el.remove());
      me.insertAdjacentHTML('beforeend', leaderboardTrophyMarkup(mine));
    }
  }
  const oldLeaderboard=app.renderLeaderboardRows&&app.renderLeaderboardRows.bind(app);
  if(oldLeaderboard)app.renderLeaderboardRows=function(rows){
    const result=oldLeaderboard(rows);
    paintLeaderboardTrophies(rows);
    return result;
  };
  window.addEventListener('storage',function(){setTimeout(renderTrophy,0);});
  document.addEventListener('student-progress-updated',function(){
    const localRows = typeof app.getLocalLeaderboardRows === 'function' ? app.getLocalLeaderboardRows() : [];
    const localByUid = new Map((Array.isArray(localRows)?localRows:[]).filter(row=>row?.uid).map(row=>[String(row.uid),row]));
    const base = latestLeaderboardRowsForTrophies.length ? latestLeaderboardRowsForTrophies : localRows;
    const merged = (Array.isArray(base)?base:[]).map(row=>localByUid.has(String(row?.uid||''))?{...row,...localByUid.get(String(row.uid))}:row);
    setTimeout(function(){paintLeaderboardTrophies(merged);},0);
    setTimeout(renderTrophy,0);
  });

})();