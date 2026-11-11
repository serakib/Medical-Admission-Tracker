/* Persistent attempted-question history for Practice. Skipped questions are intentionally excluded. */
(function () {
  'use strict';
  const ready = () => {
    const app = window.app;
    if (!app || typeof app.submitExam !== 'function') return;
    const accountKey = () => typeof app.getLocalIdentityKey === 'function'
      ? app.getLocalIdentityKey()
      : String(app.authUser && app.authUser.uid || 'visitor');
    const storageKey = () => 'med_practice_attempt_history_v1_' + accountKey();
    const safeRead = () => {
      try {
        const value = JSON.parse(localStorage.getItem(storageKey()) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch (_) { return {}; }
    };
    const safeWrite = value => {
      try { localStorage.setItem(storageKey(), JSON.stringify(value)); }
      catch (error) { console.warn('[Practice history] Could not save local history:', error); }
    };
    const questionKey = q => String(q && q.id != null ? q.id : [
      q && q.subject || '', q && q.year || '', q && (q.question || q.questionText || q.question_bn) || ''
    ].join('|')).toLowerCase().replace(/\s+/g, ' ').trim();
    const esc = value => String(value == null ? '' : value).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
    const questionText = q => q && (q.question_bn || q.question || q.questionText || q.question_en) || 'Question text unavailable';
    const answerText = (q, index) => q && Array.isArray(q.options) && q.options[index] != null ? q.options[index] : String(index == null ? '—' : index);
    const explanationText = q => q && (q.explanation_bn || q.explanationBn || q.explanation || q.explanation_en || q.solution || q.answerExplanation || q.rationale) || '';
    let filter='wrong';
    function renderHistory(){
      const view=document.getElementById('view-practice');if(!view)return;let panel=document.getElementById('practice-attempt-history');
      if(!panel){panel=document.createElement('section');panel.id='practice-attempt-history';panel.className='practice-attempt-history';const host=document.getElementById('enhanced-review-history')||document.getElementById('practice-browser')||view;host.insertAdjacentElement('afterend',panel);}
      const attempts=safeRead(),rk='med_review_history_v2_'+accountKey();let reviews={};try{reviews=JSON.parse(localStorage.getItem(rk)||'{}')||{};}catch(_){}
      const map=new Map();Object.values(attempts).filter(e=>e&&e.attempted).forEach(e=>{const r=reviews[e.key]||{};map.set(e.key,{...e,reviewed:!!r.reviewed,wrong:r.wrong===undefined?!e.correct:!!r.wrong});});
      Object.values(reviews).filter(e=>e&&(e.reviewed||e.wrong)).forEach(e=>{const p=map.get(e.key)||{};map.set(e.key,{...e,...p,key:e.key,question:p.question||e.question,reviewed:!!e.reviewed,wrong:!!e.wrong});});
      const entries=[...map.values()],wrong=entries.filter(e=>e.wrong),reviewed=entries.filter(e=>e.reviewed),shown=filter==='wrong'?wrong:reviewed;
      panel.innerHTML='<h3>Practice History <span class="practice-history-total">('+entries.length+' saved questions)</span></h3><p class="text-sm opacity-75">প্রশ্ন, উত্তর ও ব্যাখ্যা review করার জন্য এখানে সংরক্ষিত থাকে।</p><div class="practice-history-toolbar" role="group" aria-label="Practice history filters"><button type="button" data-practice-history-filter="wrong" class="'+(filter==='wrong'?'active':'')+'">Wrong ('+wrong.length+')</button><button type="button" data-practice-history-filter="reviewed" class="'+(filter==='reviewed'?'active':'')+'">Reviewed ('+reviewed.length+')</button><button type="button" id="practice-history-clear" '+(entries.length?'':'disabled')+'>Clear History</button></div><div class="practice-history-list">'+(shown.length?shown.sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0)).map(e=>{const q=e.question||{},ui=e.userAnswerIndex,ci=e.correctAnswerIndex!=null?e.correctAnswerIndex:Number(q.answer),has=ui!==null&&ui!==undefined&&ui!=='';return '<article class="practice-history-card"><div class="practice-history-meta"><span>'+esc(e.subject||q.subject||'Medical')+' · '+(e.wrong?'Wrong':'Reviewed')+' · '+Number(e.attempts||1)+' attempt(s)</span></div><h4>'+esc(questionText(q))+'</h4>'+(Array.isArray(q.options)&&q.options.length?'<div class="practice-history-options"><strong>Options:</strong><ol>'+q.options.map((o,i)=>'<li class="'+(i===Number(ci)?'is-correct-option ':'')+(has&&i===Number(ui)?'is-selected-option':'')+'"><span class="practice-history-option-letter">'+String.fromCharCode(65+i)+'.</span> '+esc(o)+(has&&i===Number(ui)?' <span class="practice-history-option-tag">Your answer</span>':'')+(i===Number(ci)?' <span class="practice-history-option-tag">Correct answer</span>':'')+'</li>').join('')+'</ol></div>':'')+'<div class="practice-history-answer '+(e.wrong?'is-wrong':'is-correct')+'"><strong>Your answer:</strong> '+esc(has?answerText(q,ui):'আগের উত্তর সংরক্ষিত নেই')+'<br><strong>Correct answer:</strong> '+esc(answerText(q,ci))+'</div><section class="practice-history-explanation"><h5>ব্যাখ্যা (Explanation)</h5><p>'+esc(explanationText(q)||'এই প্রশ্নের ডেটায় এখনো ব্যাখ্যা যোগ করা হয়নি।')+'</p></section></article>';}).join(''):'<div class="enhanced-empty">'+(filter==='wrong'?'এখনো কোনো ভুল উত্তর নেই।':'এখনো কোনো reviewed প্রশ্ন নেই।')+'</div>')+'</div>';
      panel.querySelectorAll('[data-practice-history-filter]').forEach(btn=>btn.addEventListener('click',()=>{filter=btn.dataset.practiceHistoryFilter;renderHistory();}));
      panel.querySelector('#practice-history-clear').addEventListener('click',()=>{if(!entries.length||!window.confirm('এই account-এর Practice History মুছে ফেলবেন?'))return;safeWrite({});try{localStorage.removeItem(rk);}catch(_){}renderHistory();});
    }
    const originalSubmit = app.submitExam.bind(app);
    app.submitExam = function (autoSubmitted) {
      const state = this.examState;
      if (state && String(state.mode || '').toLowerCase() === 'practice' && Array.isArray(state.questions) && Array.isArray(state.userAnswers)) {
        const history = safeRead();
        const now = Date.now();
        state.questions.forEach((question, index) => {
          const answerIndex = state.userAnswers[index];
          if (answerIndex === null || answerIndex === undefined || answerIndex === '') return;
          const key = questionKey(question);
          if (!key) return;
          const previous = history[key];
          const correctIndex = Number(question && question.answer);
          const correct = Number(answerIndex) === correctIndex;
          const attemptTimestamps = Array.isArray(previous && previous.attemptTimestamps)
            ? previous.attemptTimestamps.slice()
            : [previous && previous.firstAttemptAt, previous && previous.updatedAt]
                .filter((timestamp, i, values) => Number.isFinite(Number(timestamp)) && values.indexOf(timestamp) === i)
                .map(Number);
          attemptTimestamps.push(now);
          const attemptRecords = Array.isArray(previous && previous.attemptRecords) ? previous.attemptRecords.slice() : [];
          const profile = app.profile || {};
          const leaderboardStatusBefore = {
            rank: profile.rank ?? profile.currentRank ?? null,
            rp: profile.rankPoints ?? profile.currentRP ?? null,
            status: profile.leaderboardStatus ?? null
          };
          attemptRecords.push({
            timestamp: now, correct, subject: question && question.subject || 'Medical',
            source: question && (question.source || question.year) || '',
            leaderboardStatusBefore
          });
          history[key] = {
            key, question, subject: question && question.subject || 'Medical',
            userAnswerIndex: Number(answerIndex), correctAnswerIndex: correctIndex,
            correct, attempted: true, attempts: Math.max(0, Number(previous && previous.attempts) || 0) + 1,
            attemptTimestamps, attemptRecords, leaderboardStatusBefore,
            firstAttemptAt: previous && previous.firstAttemptAt || now, updatedAt: now
          };
        });
        safeWrite(history);
        const rk='med_review_history_v2_'+accountKey();let rh={};try{rh=JSON.parse(localStorage.getItem(rk)||'{}')||{};}catch(_){}
        state.questions.forEach((q,i)=>{const ans=state.userAnswers[i];if(ans===null||ans===undefined||ans==='')return;const key=questionKey(q),ci=Number(q&&q.answer),p=rh[key]||{key,question:q,reviewed:false,wrong:false};rh[key]={...p,key,question:q,userAnswerIndex:Number(ans),correctAnswerIndex:ci,wrong:Number(ans)!==ci,updatedAt:now};});
        try{localStorage.setItem(rk,JSON.stringify(rh));}catch(_){}renderHistory();
      }
      return originalSubmit(autoSubmitted);
    };
    const originalShowView = app.showView.bind(app);
    app.showView = function (name, ...args) {
      const result = originalShowView(name, ...args);
      if (name === 'practice') renderHistory();
      return result;
    };
    const originalAuth = app.setAuthState && app.setAuthState.bind(app);
    if (originalAuth) app.setAuthState = function (user, ...args) {
      const result = originalAuth(user, ...args);
      renderHistory();
      return result;
    };
    renderHistory();
  };
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, { once: true });
})();
