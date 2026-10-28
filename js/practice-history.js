/* Persistent attempted-question history for Practice. Skipped questions are intentionally excluded. */
(function () {
  'use strict';
  const ready = () => {
    const app = window.app;
    if (!app || typeof app.submitExam !== 'function') return;
    const accountKey = () => String(app.authUser && app.authUser.uid || 'guest');
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
    let filter = 'all';
    const selected = new Set();
    function renderHistory() {
      const view = document.getElementById('view-practice');
      if (!view) return;
      let panel = document.getElementById('practice-attempt-history');
      if (!panel) {
        panel = document.createElement('section');
        panel.id = 'practice-attempt-history';
        panel.className = 'practice-attempt-history';
        const existing = document.getElementById('enhanced-review-history') || document.getElementById('practice-browser') || view;
        existing.insertAdjacentElement('afterend', panel);
      }
      const history = safeRead();
      const entries = Object.values(history).filter(entry => entry && entry.attempted === true);
      const filtered = entries.filter(entry => filter === 'all' || (filter === 'correct' ? entry.correct : !entry.correct));
      const selectedVisible = filtered.length > 0 && filtered.every(entry => selected.has(entry.key));
      panel.innerHTML = '<h3>Practice History <span class="practice-history-total">(' + entries.length + ' unique attempted questions)</span></h3>' +
        '<p class="text-sm opacity-75">শুধু উত্তর দেওয়া প্রশ্ন সংরক্ষণ করা হয়। Skipped প্রশ্ন এখানে দেখানো হয় না।</p>' +
        '<div class="practice-history-toolbar" role="group" aria-label="Practice history filters">' +
        '<button type="button" data-practice-history-filter="all" class="' + (filter === 'all' ? 'active' : '') + '">All (' + entries.length + ')</button>' +
        '<button type="button" data-practice-history-filter="correct" class="' + (filter === 'correct' ? 'active' : '') + '">Correct (' + entries.filter(e => e.correct).length + ')</button>' +
        '<button type="button" data-practice-history-filter="wrong" class="' + (filter === 'wrong' ? 'active' : '') + '">Wrong (' + entries.filter(e => !e.correct).length + ')</button>' +
        '<button type="button" id="practice-history-select-all">' + (selectedVisible ? 'Unselect All' : 'Select All') + '</button>' +
        '<button type="button" id="practice-history-repractice" ' + (selected.size ? '' : 'disabled') + '>Practice Selected (' + selected.size + ')</button>' +
        '<button type="button" id="practice-history-clear" ' + (entries.length ? '' : 'disabled') + '>Clear History</button></div>' +
        '<div class="practice-history-list">' + (filtered.length ? filtered.slice().sort((a,b) => Number(b.updatedAt||0)-Number(a.updatedAt||0)).map(entry =>
          '<article class="practice-history-card"><div class="practice-history-meta"><label><input type="checkbox" data-practice-history-key="' + esc(entry.key) + '" ' + (selected.has(entry.key) ? 'checked' : '') + '> Select</label><span>' + esc(entry.subject || 'Medical') + ' · ' + (entry.correct ? 'Correct' : 'Wrong') + ' · ' + Number(entry.attempts || 1) + ' attempt(s)</span></div>' +
          '<h4>' + esc(questionText(entry.question)) + '</h4>' +
          (Array.isArray(entry.question && entry.question.options) && entry.question.options.length ? '<div class="practice-history-options"><strong>Options:</strong><ol>' + entry.question.options.map((option, optionIndex) => '<li class="' + (optionIndex === Number(entry.correctAnswerIndex) ? 'is-correct-option ' : '') + (optionIndex === Number(entry.userAnswerIndex) ? 'is-selected-option' : '') + '"><span class="practice-history-option-letter">' + String.fromCharCode(65 + optionIndex) + '.</span> ' + esc(option) + (optionIndex === Number(entry.userAnswerIndex) ? ' <span class="practice-history-option-tag">Your answer</span>' : '') + (optionIndex === Number(entry.correctAnswerIndex) ? ' <span class="practice-history-option-tag">Correct answer</span>' : '') + '</li>').join('') + '</ol></div>' : '') +
          '<div class="practice-history-answer ' + (entry.correct ? 'is-correct' : 'is-wrong') + '"><strong>Your answer:</strong> ' + esc(answerText(entry.question, entry.userAnswerIndex)) + '<br><strong>Correct answer:</strong> ' + esc(answerText(entry.question, entry.correctAnswerIndex)) + '</div>' +
          '<section class="practice-history-explanation"><h5>ব্যাখ্যা (Explanation)</h5><p>' + esc(explanationText(entry.question) || 'এই প্রশ্নের ডেটায় এখনো ব্যাখ্যা যোগ করা হয়নি।') + '</p></section></article>'
        ).join('') : '<div class="enhanced-empty">এখনো কোনো প্রশ্ন attempt করা হয়নি। উত্তর দেওয়া শুরু করলে এখানে history জমা হবে।</div>') + '</div>';
      panel.querySelectorAll('[data-practice-history-filter]').forEach(button => button.addEventListener('click', () => {
        filter = button.dataset.practiceHistoryFilter;
        renderHistory();
      }));
      panel.querySelector('#practice-history-select-all').addEventListener('click', () => {
        const visible = filtered.map(entry => entry.key);
        const allSelected = visible.length > 0 && visible.every(key => selected.has(key));
        visible.forEach(key => allSelected ? selected.delete(key) : selected.add(key));
        renderHistory();
      });
      panel.querySelectorAll('[data-practice-history-key]').forEach(input => input.addEventListener('change', () => {
        input.checked ? selected.add(input.dataset.practiceHistoryKey) : selected.delete(input.dataset.practiceHistoryKey);
        renderHistory();
      }));
      panel.querySelector('#practice-history-repractice').addEventListener('click', () => {
        const chosen = entries.filter(entry => selected.has(entry.key)).map(entry => entry.question).filter(Boolean);
        if (!chosen.length) return;
        if (app.practiceTimerInterval) { clearInterval(app.practiceTimerInterval); app.practiceTimerInterval = null; }
        app.preparedExam = { questions: chosen, mode: 'practice', subject: 'all', year: 'all', durationMins: Math.max(1, Math.round(chosen.length * 0.5)) };
        const browser = document.getElementById('practice-browser');
        const quiz = document.getElementById('practice-quiz-view');
        if (browser) browser.hidden = true;
        if (quiz) quiz.hidden = true;
        if (typeof app.beginPreparedExam === 'function') app.beginPreparedExam();
      });
      panel.querySelector('#practice-history-clear').addEventListener('click', () => {
        if (!entries.length || !window.confirm('এই account-এর Practice History মুছে ফেলবেন?')) return;
        safeWrite({});
        selected.clear();
        renderHistory();
      });
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
            rp: profile.totalRP ?? profile.rankPoints ?? profile.currentRP ?? null,
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
        selected.clear();
        renderHistory();
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
