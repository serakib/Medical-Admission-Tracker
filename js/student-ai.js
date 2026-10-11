/* Student Life Support AI frontend. API key remains on the Worker, never in this file. */
(function (window, document) {
  'use strict';
  var WORKER_URL = 'https://medical-admission-tracker.asrafuldcg.workers.dev/chat';
  var MAX_CHARS = 3000;
  var MAX_MESSAGES = 10;

  function init() {
    var form = document.getElementById('sls-chat-form');
    var input = document.getElementById('sls-question');
    var messagesEl = document.getElementById('sls-chat-messages');
    var clearBtn = document.getElementById('sls-clear');
    var sendBtn = document.getElementById('sls-send');
    var statusEl = document.getElementById('sls-status');
    if (!form || !input || !messagesEl || form.dataset.slsReady === '1') return;
    form.dataset.slsReady = '1';

    var history = [];
    var busy = false;
    function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
    function addMessage(role, text, options) {
      var row = document.createElement('div');
      row.className = 'sls-message ' + (role === 'user' ? 'sls-user-message' : 'sls-assistant-message');
      if (role !== 'user') {
        var label = document.createElement('span');
        label.className = 'sls-message-label';
        label.textContent = (options && options.loading) ? 'Student Guide · ভাবছে…' : 'Student Guide';
        row.appendChild(label);
      }
      var p = document.createElement('p');
      p.className = 'm-0';
      p.textContent = text;
      row.appendChild(p);
      messagesEl.appendChild(row);
      scrollToBottom();
      return row;
    }
    function status(message, isError) {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.classList.toggle('text-red-600', !!isError);
      statusEl.classList.toggle('dark:text-red-400', !!isError);
    }
    function setBusy(value) {
      busy = value;
      input.disabled = value;
      if (sendBtn) {
        sendBtn.disabled = value;
        sendBtn.setAttribute('aria-busy', String(value));
        var label = sendBtn.querySelector('span');
        if (label) label.textContent = value ? 'অপেক্ষা…' : 'পাঠান';
        else sendBtn.textContent = value ? 'অপেক্ষা…' : 'পাঠান';
      }
    }
    async function send(question) {
      question = String(question || '').trim();
      if (!question || busy) return;
      if (question.length > MAX_CHARS) { status('প্রশ্নটি ৩০০০ অক্ষরের মধ্যে রাখুন।', true); return; }
      status('');
      addMessage('user', question);
      input.value = '';
      setBusy(true);
      var waiting = addMessage('assistant', 'একটু অপেক্ষা করুন…', { loading: true });
      var requestMessages = history.slice(-(MAX_MESSAGES - 1));
      requestMessages.push({ role: 'user', content: question });
      try {
        var response = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: requestMessages })
        });
        var data = await response.json().catch(function () { return null; });
        if (!data) throw new Error('Server-এর response JSON নয়। Worker endpoint পরীক্ষা করুন।');
        if (!response.ok) {
          if (response.status === 403) throw new Error('Worker-এ https://serakib.github.io origin অনুমোদিত আছে কি না পরীক্ষা করুন।');
          if (response.status === 404) throw new Error('Worker-এ /chat endpoint নেই। সঙ্গে দেওয়া worker.js deploy করুন।');
          throw new Error(data.error || ('Request ব্যর্থ হয়েছে: ' + response.status));
        }
        if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('AI কোনো উত্তর ফেরত দেয়নি।');
        waiting.remove();
        addMessage('assistant', data.reply.trim());
        history.push({ role: 'user', content: question }, { role: 'assistant', content: data.reply.trim() });
        if (history.length > MAX_MESSAGES) history.splice(0, history.length - MAX_MESSAGES);
        status('উত্তর পাওয়া গেছে।');
      } catch (error) {
        waiting.remove();
        var note = error && error.message ? error.message : 'Network error হয়েছে।';
        addMessage('assistant', 'দুঃখিত, এখন উত্তর পাওয়া যায়নি। ' + note);
        status('AI service-এ যোগাযোগ করা যায়নি।', true);
        console.error('[Student Life Support]', error);
      } finally {
        setBusy(false);
        input.focus();
      }
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      send(input.value);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (form.requestSubmit) form.requestSubmit();
      }
    });
    document.querySelectorAll('[data-sls-prompt]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (busy) return;
        input.value = chip.getAttribute('data-sls-prompt') || '';
        input.focus();
      });
    });
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (busy) return;
      history = [];
      messagesEl.replaceChildren();
      addMessage('assistant', 'নতুন করে শুরু হলো। 😊 কোন বিষয়ে সহায়তা দরকার?');
      status('কথোপকথন রিসেট করা হয়েছে।');
      input.focus();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window, document);
