(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const HISTORY_KEY = 'med_offline_practice_history_v1';
  let bank = [];
  let session = [];
  let index = 0;
  let correct = 0;
  let answered = false;
  const shuffle = list => [...list].sort(() => Math.random() - 0.5);

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  function start() {
    session = shuffle(bank.filter(q => q && q.options && q.correctAnswer)).slice(0, Math.min(20, bank.length));
    index = 0;
    correct = 0;
    hide('result-card');
    show('quiz-card');
    renderQuestion();
  }

  function renderQuestion() {
    const q = session[index];
    answered = false;
    $('subject-label').textContent = String(q.subject || 'Mixed').toUpperCase();
    $('question-counter').textContent = 'প্রশ্ন ' + (index + 1) + ' / ' + session.length;
    $('progress-bar').style.width = (index / session.length * 100) + '%';
    $('question-text').textContent = q.question || 'প্রশ্ন পাওয়া যায়নি';
    $('options').replaceChildren();
    $('feedback').textContent = '';
    hide('feedback');
    $('next-btn').disabled = true;
    ['A', 'B', 'C', 'D'].forEach(letter => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option';
      button.textContent = letter + '. ' + String(q.options[letter] || '');
      button.addEventListener('click', () => choose(letter, button));
      $('options').append(button);
    });
    $('next-btn').textContent = index === session.length - 1 ? 'ফলাফল দেখুন' : 'পরের প্রশ্ন';
  }

  function choose(letter, selectedButton) {
    if (answered) return;
    answered = true;
    const q = session[index];
    const isCorrect = letter === String(q.correctAnswer).toUpperCase();
    if (isCorrect) correct += 1;
    [...$('options').children].forEach(button => {
      const optionLetter = button.textContent.slice(0, 1);
      if (optionLetter === String(q.correctAnswer).toUpperCase()) button.classList.add('correct');
      else if (button === selectedButton && !isCorrect) button.classList.add('wrong');
      button.disabled = true;
    });
    $('feedback').textContent = (isCorrect ? 'সঠিক উত্তর!' : 'সঠিক উত্তর: ' + q.correctAnswer) +
      (q.explanation ? ' — ' + q.explanation : '');
    show('feedback');
    $('next-btn').disabled = false;
  }

  function finish() {
    hide('quiz-card');
    show('result-card');
    $('progress-bar').style.width = '100%';
    const percent = Math.round(correct / session.length * 100);
    $('result-title').textContent = correct + ' / ' + session.length + ' সঠিক';
    $('result-summary').textContent = 'Accuracy: ' + percent + '%. এই ফলাফল শুধু এই device-এ সংরক্ষিত হয়েছে।';
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      history.unshift({ date: new Date().toISOString(), correct, total: session.length, accuracy: percent, mode: 'offline' });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    } catch (error) {
      console.warn('Offline result could not be saved:', error);
    }
  }

  $('next-btn').addEventListener('click', () => {
    if (!answered) return;
    if (index + 1 >= session.length) finish();
    else { index += 1; renderQuestion(); }
  });
  $('again-btn').addEventListener('click', start);
  $('network-state').textContent = navigator.onLine ? 'Online · local practice' : 'Offline ready';
  window.addEventListener('online', () => { $('network-state').textContent = 'Online · local practice'; });
  window.addEventListener('offline', () => { $('network-state').textContent = 'Offline ready'; });

  fetch('./data/questions.json')
    .then(response => { if (!response.ok) throw new Error('Question bank is not cached.'); return response.json(); })
    .then(data => {
      bank = Array.isArray(data) ? data.filter(q => q && q.question && q.options && q.correctAnswer) : [];
      if (!bank.length) throw new Error('কোনো বৈধ প্রশ্ন পাওয়া যায়নি।');
      $('loading-card').textContent = bank.length + 'টি প্রশ্ন প্রস্তুত। প্রতিটি session-এ সর্বোচ্চ ২০টি random প্রশ্ন থাকবে।';
      const button = document.createElement('button');
      button.textContent = 'অনুশীলন শুরু করুন';
      button.addEventListener('click', start);
      $('loading-card').append(button);
    })
    .catch(error => {
      $('loading-card').textContent = error.message + ' — ইন্টারনেট চালু করে মূল ওয়েবসাইট একবার খুলে আবার চেষ্টা করুন।';
    });
})();
