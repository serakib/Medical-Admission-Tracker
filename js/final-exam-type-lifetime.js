/* Final user-requested exam and lifetime leaderboard behavior. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__finalExamTypeAndLifetimePatch) return;
  app.__finalExamTypeAndLifetimePatch = true;

  const style = document.createElement('style');
  style.id = 'final-exam-type-lifetime-styles';
  style.textContent = '#view-setup #setup-mode-options,#view-setup #setup-subject-area,#view-setup .time-btn{display:none!important} #view-setup .q-count-btn:not([data-final-count="50"]):not([data-final-count="100"]){display:none!important} #view-setup #setup-question-count-options{grid-template-columns:repeat(2,minmax(0,1fr))!important} #weekly-reset-setting,label[for="weekly-reset-setting"],.league-banner{display:none!important} #final-exam-type-panel{border:1px solid rgba(16,185,129,.24);border-radius:16px;padding:16px;background:rgba(16,185,129,.045)} #final-exam-type-panel label{display:block;font-weight:800;font-size:.9rem;margin-bottom:8px} #final-exam-type{width:100%;border:1px solid #94a3b8;border-radius:12px;padding:12px;background:var(--surface,#fff);color:inherit} #final-exam-type-help{margin-top:8px;font-size:.8rem;color:#64748b;line-height:1.6} html.dark #final-exam-type{background:#1f2937}';
  document.head.appendChild(style);

  const historyKey = () => 'med_review_history_v2_' + (app.authUser?.uid || 'guest');
  const qKey = q => String(q?.id || [q?.subject,q?.year,q?.question || q?.questionText].join('|')).toLowerCase().replace(/\s+/g,' ').trim();
  const readHistory = () => { try { const x=JSON.parse(localStorage.getItem(historyKey())||'{}'); return x && typeof x==='object' && !Array.isArray(x) ? x : {}; } catch (_) { return {}; } };
  const writeHistory = value => { try { localStorage.setItem(historyKey(),JSON.stringify(value)); } catch (_) {} };
  const currentType = () => document.getElementById('final-exam-type')?.value || 'all';

  function installExamTypeUI() {
    const setup=document.getElementById('view-setup'), counts=document.getElementById('setup-question-count-options');
    if(!setup || !counts) return;
    const timeControl=setup.querySelector('.time-btn')?.closest('.space-y-2');
    if(timeControl)timeControl.remove();
    let panel=document.getElementById('final-exam-type-panel');
    if(!panel) {
      panel=document.createElement('section'); panel.id='final-exam-type-panel';
      panel.innerHTML='<label for="final-exam-type">Exam Type</label><select id="final-exam-type"><option value="all">All Questions</option><option value="previous-year">Previous Year</option><option value="wrong">Wrong Answer Questions</option><option value="skipped">Skipped Questions</option><option value="reviewed">Reviewed Questions</option></select><p id="final-exam-type-help">Choose an exam type. Model Test supports 50 or 100 marks; time is calculated automatically.</p>';
      const area=counts.closest('.space-y-2');
      if(area) area.insertAdjacentElement('beforebegin',panel); else setup.prepend(panel);
      panel.querySelector('select').addEventListener('change',()=>{
        const type=currentType(), yearArea=document.getElementById('setup-year-area');
        if(yearArea) yearArea.hidden=type!=='previous-year';
        if(type==='previous-year'){
          const yearSelect=document.getElementById('setup-year');
          const years=[...new Set((app.questionBank||[]).filter(q=>q.year&&!/^practice$/i.test(String(q.year))).map(q=>String(q.year)))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
          if(yearSelect&&(!yearSelect.value||yearSelect.value==='all')&&years.length)yearSelect.value=years[0];
        }
        const help=document.getElementById('final-exam-type-help');
        if(help) help.textContent=type==='previous-year'?'Select a year. Every MCQ in that year will be included. The 50/100-mark limit does not apply to a full previous-year collection.':'Time is automatic: 50 questions = 30 minutes; 100 questions = 60 minutes. Filtered exams use all matching questions up to the selected limit.';
      });
    }
    const countButtons=counts.querySelectorAll('button');
    countButtons.forEach(btn=>{
      const n=Number((btn.textContent.match(/\d+/)||[])[0]);
      if(n===50||n===100){btn.dataset.finalCount=String(n);btn.hidden=false;btn.disabled=false;}
      else{btn.hidden=true;btn.disabled=true;}
    });
    if(![50,100].includes(Number(app.setup?.questionsCount))) app.setup.questionsCount=50;
    app.setup.mode='model'; app.setup.subject='all';
    if(typeof app.setSetupMode==='function') {
      const modelButton=document.getElementById('setup-mode-model');
      if(modelButton) modelButton.classList.add('is-selected');
    }
    const yearArea=document.getElementById('setup-year-area');
    if(yearArea) yearArea.hidden=currentType()!=='previous-year';
  }

  function openModelTest() {
    if(app.examActive && !app.examState?.submitted){app.confirmSubmitExam?.('navigation');return;}
    if(app.practiceTimerInterval){clearInterval(app.practiceTimerInterval);app.practiceTimerInterval=null;}
    app.practiceSession=null;
    app.setup.mode='model'; app.setup.subject='all';
    app.setup.questionsCount=50;
    app.setup.durationMins=30;
    const show=app.showView.bind(app);
    show('setup');
    installExamTypeUI();
    if(typeof app.updateSetupUI==='function') app.updateSetupUI();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  const originalQuick=app.setupExamQuick?.bind(app);
  app.setupExamQuick=function(mode){if(mode==='model'){openModelTest();return;}return originalQuick?originalQuick(mode):openModelTest();};
  const originalShow=app.showView.bind(app);
  app.showView=function(name,...args){const result=originalShow(name,...args);if(name==='setup')installExamTypeUI();return result;};
  const originalCount=app.setSetupQuestions?.bind(app);
  if(originalCount) app.setSetupQuestions=function(count){const n=Number(count);if(![50,100].includes(n))return;originalCount(n);this.setup.questionsCount=n;this.setup.durationMins=n*.6;if(originalUpdate)originalUpdate();installExamTypeUI();};
  const originalUpdate=app.updateSetupUI?.bind(app);
  if(originalUpdate) app.updateSetupUI=function(...args){const result=originalUpdate(...args);installExamTypeUI();return result;};

  app.prepareExamFromSetup=function(){
    if(!this.questionsLoaded||!this.questionBank?.length){this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি।');return;}
    installExamTypeUI();
    const type=currentType(), history=readHistory();
    const yearSelect=document.getElementById('setup-year'), year=yearSelect?.value||'all';
    let pool=this.questionBank.slice();
    if(type==='previous-year'){
      if(year==='all'){alert('পরীক্ষার আগে একটি নির্দিষ্ট বছর নির্বাচন করুন।');return;}
      pool=pool.filter(q=>String(q.year).trim()===String(year).trim());
    } else if(type==='wrong') pool=pool.filter(q=>Boolean(history[qKey(q)]?.wrong));
    else if(type==='skipped') pool=pool.filter(q=>Boolean(history[qKey(q)]?.skipped));
    else if(type==='reviewed') pool=pool.filter(q=>Boolean(history[qKey(q)]?.reviewed));
    if(!pool.length){const labels={wrong:'Wrong Answer',skipped:'Skipped',reviewed:'Reviewed'};alert(type==='previous-year'?'এই বছরের জন্য কোনো বিগত বছরের প্রশ্ন পাওয়া যায়নি।':(labels[type]||'এই Exam Type')+' তালিকায় এখনো কোনো প্রশ্ন নেই।');return;}
    const limit=type==='previous-year'?pool.length:Number(this.setup.questionsCount||50);
    if(type==='previous-year'){this.previousSelectedYear=year;this.setup.mode='previousQuiz';}
    else {this.setup.mode='model';const ys=document.getElementById('setup-year');if(ys)ys.value='all';this.setup.subject='all';}
    const questions=this.shuffleQuestionsAndOptions(pool,Math.min(limit,pool.length));
    if(!questions.length)return;
    const actualCount=questions.length, durationMins=Math.max(1,Math.round(actualCount*.6));
    this.setup.mode=type==='previous-year'?'previousQuiz':'model';this.setup.subject='all';this.setup.durationMins=durationMins;
    this.preparedExam={questions,mode:this.setup.mode,subject:'all',year:type==='previous-year'?year:'all',durationMins,examType:type};
    this.renderExamIntro();
    const title=document.getElementById('exam-intro-title');
    if(title)title.textContent=type==='previous-year'?'বিগত বছরের পরীক্ষা — '+year:({all:'Model Test — All Questions',wrong:'Model Test — Wrong Answer Questions',skipped:'Model Test — Skipped Questions',reviewed:'Model Test — Reviewed Questions'}[type]||'Model Test');
    this.showView('exam-intro');
  };

  const originalSubmit=app.submitExam.bind(app);
  app.submitExam=function(...args){
    const questions=(this.examState?.questions||[]).slice(), answers=(this.examState?.userAnswers||[]).slice(), history=readHistory();
    questions.forEach((q,i)=>{
      const key=qKey(q), record=history[key]||{key,question:q,reviewed:false,wrong:false,skipped:false};
      if(answers[i]===null||answers[i]===undefined)record.skipped=true;
      else { const correct = Number.isInteger(q.answer) ? q.answer : (Number.isInteger(q.correctAnswer) ? q.correctAnswer : 'ABCD'.indexOf(String(q.correctAnswer||'').toUpperCase())); if(answers[i]!==correct)record.wrong=true; }
      record.question=q;record.updatedAt=Date.now();history[key]=record;
    });
    writeHistory(history);
    return originalSubmit(...args);
  };

  function removeWeeklyUI(){
    document.querySelectorAll('#weekly-reset-setting,label[for="weekly-reset-setting"],.league-banner').forEach(el=>el.remove());
    document.querySelectorAll('.rank-stat').forEach(el=>{if(/weekly rank points|weekly reset/i.test(el.textContent||''))el.remove();});
    const heading=document.querySelector('#view-leaderboard h2'), paragraph=heading?.parentElement?.querySelector('p');
    const leaderboardCopy='All Time ranks by lifetime RP, Weekly ranks by this week\'s RP, and Friends shows accepted friends.';
    // The observer below watches this subtree; avoid resetting identical text and
    // triggering an endless MutationObserver microtask loop on every pass.
    if(paragraph && paragraph.textContent!==leaderboardCopy)paragraph.textContent=leaderboardCopy;
  }
  const oldRankUpdate=app.updateProfileRanks?.bind(app);
  if(oldRankUpdate)app.updateProfileRanks=function(rows=[]){
    const sorted=(Array.isArray(rows)?rows:[]).slice().sort((a,b)=>Number(b.rankPoints??b.points??0)-Number(a.rankPoints??a.points??0));
    const uid=this.authUser?.uid||'guest_local', index=sorted.findIndex(row=>row.uid===uid);
    const live=document.getElementById('profile-live-rank'),best=document.getElementById('profile-best-rank');
    if(live)live.textContent=index>=0?'#'+(index+1):'—';if(best)best.textContent=index>=0?'#'+(index+1):'—';
  };
  const observer=new MutationObserver(()=>removeWeeklyUI());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',()=>{installExamTypeUI();removeWeeklyUI();},{once:true});
  document.addEventListener('DOMContentLoaded',()=>{installExamTypeUI();removeWeeklyUI();},{once:true});
  installExamTypeUI();removeWeeklyUI();
})();
