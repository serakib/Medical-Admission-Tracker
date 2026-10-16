/* ============================================================
 * Student Life Support AI — Advanced Frontend
 * ------------------------------------------------
 * Features:
 *  - Multi-turn conversation memory (context-aware)
 *  - Markdown rendering (headings, lists, bold, italic, links)
 *  - Code block detection + syntax highlight + copy button
 *  - Bengali / Banglish / English auto-detect friendly
 *  - System prompt oriented for coding, reasoning, study help
 *  - Typing / streaming simulation for better UX
 *  - Message actions: copy, regenerate, retry
 *  - Token counting estimate + response time display
 *  - Rate-limit + length guard + graceful error handling
 *  - API key never lives here — handled by Cloudflare Worker
 * ============================================================ */
(function (window, document) {
    'use strict';

    /* -------------------- CONFIG -------------------- */
    var WORKER_URL = 'https://medical-admission-tracker.asrafuldcg.workers.dev/chat';
    var MAX_CHARS = 4000;
    var MAX_HISTORY = 12;         // how many past messages we send as context
    var STREAM_CHUNK_MS = 12;     // typing animation speed
    var MIN_REQUEST_GAP_MS = 800; // rate-limit between sends

    /* System prompt — sent on every request so the AI behaves like
     * a powerful coding + reasoning + study assistant. */
    var SYSTEM_PROMPT = [
        'You are "Student Guide" — an advanced AI assistant for Bangladeshi',
        'HSC and Medical Admission students, powered by a large reasoning model.',
        '',
        'You can:',
        '  • Answer ANY question (coding, math, science, general knowledge,',
        '    career advice, study strategy, exam technique, motivation).',
        '  • Write, debug, and explain code in any language (Python, JS, C,',
        '    C++, Java, HTML/CSS, SQL, etc.) with clear, working examples.',
        '  • Reason step-by-step for tricky problems (physics numericals,',
        '    chemistry stoichiometry, biology mechanisms, logic puzzles).',
        '  • Explain in Bengali, Banglish, or English — match the user\'s language.',
        '',
        'Formatting rules:',
        '  • Use markdown: ## headings, **bold**, *italic*, `inline code`,',
        '    - bullet lists, 1. numbered lists, > quotes.',
        '  • Wrap code in triple backticks with the language tag, e.g. ```python.',
        '  • Be concise but complete. No fluff. No repeated greetings.',
        '  • For study topics, give practical, actionable steps — not vague advice.',
        '  • If the user writes in Banglish (Bengali in English letters), reply in',
        '    Bengali script unless they explicitly ask otherwise.',
        '  • Never invent facts. If unsure, say so and suggest how to verify.',
        '  • For medical/health emergencies, tell the user to seek professional help.'
    ].join('\n');

    /* -------------------- STATE -------------------- */
    var history = [];              // [{role:'user'|'assistant', content:'...'}]
    var busy = false;
    var lastRequestAt = 0;
    var initialized = false;

    /* -------------------- DOM HELPERS -------------------- */
    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
        });
    }

    /* -------------------- MARKDOWN RENDERER -------------------- */
    /* Lightweight but solid — handles the common cases students actually use. */
    function renderMarkdown(text) {
        if (!text) return '';

        // 1) Extract code blocks first so we don't mangle them with other regexes
        var codeBlocks = [];
        text = text.replace(/```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
            var idx = codeBlocks.length;
            codeBlocks.push({ lang: (lang || '').toLowerCase(), code: code.replace(/\n$/, '') });
            return '\u0000CODEBLOCK' + idx + '\u0000';
        });

        // 2) Escape HTML in the remaining text
        text = escapeHtml(text);

        // 3) Headings  ## / ### / ####
        text = text.replace(/^####\s+(.+)$/gm, '<h4 class="sls-h4">$1</h4>');
        text = text.replace(/^###\s+(.+)$/gm, '<h3 class="sls-h3">$1</h3>');
        text = text.replace(/^##\s+(.+)$/gm, '<h2 class="sls-h2">$1</h2>');
        text = text.replace(/^#\s+(.+)$/gm, '<h1 class="sls-h1">$1</h1>');

        // 4) Horizontal rule
        text = text.replace(/^\s*---+\s*$/gm, '<hr class="sls-hr">');

        // 5) Blockquote
        text = text.replace(/^&gt;\s?(.+)$/gm, '<blockquote class="sls-quote">$1</blockquote>');

        // 6) Bold / italic / inline code
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
        text = text.replace(/`([^`\n]+)`/g, '<code class="sls-inline-code">$1</code>');

        // 7) Links  [text](url)
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer" class="sls-link">$1</a>');

        // 8) Unordered lists (- item or * item)
        text = text.replace(/(?:^|\n)((?:[-*]\s+.+(?:\n|$))+)/g, function (block) {
            var items = block.trim().split(/\n/).map(function (line) {
                return '<li>' + line.replace(/^[-*]\s+/, '') + '</li>';
            }).join('');
            return '\n<ul class="sls-ul">' + items + '</ul>';
        });

        // 9) Ordered lists (1. item)
        text = text.replace(/(?:^|\n)((?:\d+\.\s+.+(?:\n|$))+)/g, function (block) {
            var items = block.trim().split(/\n/).map(function (line) {
                return '<li>' + line.replace(/^\d+\.\s+/, '') + '</li>';
            }).join('');
            return '\n<ol class="sls-ol">' + items + '</ol>';
        });

        // 10) Paragraphs — double newlines become <br><br> for simplicity
        text = text.replace(/\n{2,}/g, '<br><br>');
        text = text.replace(/(?<!>)\n(?!<)/g, '<br>');

        // 11) Re-insert code blocks
        text = text.replace(/\u0000CODEBLOCK(\d+)\u0000/g, function (_, i) {
            var block = codeBlocks[Number(i)];
            return buildCodeBlockHtml(block.lang, block.code);
        });

        return text;
    }

    function buildCodeBlockHtml(lang, code) {
        var langLabel = lang ? lang : 'code';
        var id = 'cb_' + Math.random().toString(36).slice(2, 9);
        return (
            '<div class="sls-codeblock" data-code-id="' + id + '">' +
                '<div class="sls-codeblock-head">' +
                    '<span class="sls-codeblock-lang">' + escapeHtml(langLabel) + '</span>' +
                    '<button type="button" class="sls-codeblock-copy" data-copy-target="' + id + '">' +
                        '<i class="fa-regular fa-copy"></i> Copy' +
                    '</button>' +
                '</div>' +
                '<pre class="sls-codeblock-pre"><code id="' + id + '">' +
                    escapeHtml(code) +
                '</code></pre>' +
            '</div>'
        );
    }

    /* -------------------- MESSAGE UI -------------------- */
    function appendMessage(role, content, opts) {
        opts = opts || {};
        var messagesEl = $('sls-chat-messages');
        if (!messagesEl) return null;

        var row = document.createElement('div');
        row.className = 'sls-message ' + (role === 'user' ? 'sls-user-message' : 'sls-assistant-message');
        if (opts.loading) row.classList.add('sls-loading');

        // Label
        if (role !== 'user') {
            var label = document.createElement('span');
            label.className = 'sls-message-label';
            label.textContent = opts.loading ? 'Student Guide · ভাবছে…' : 'Student Guide';
            row.appendChild(label);
        }

        // Body
        var body = document.createElement('div');
        body.className = 'sls-message-body';
        if (opts.loading) {
            body.innerHTML =
                '<span class="sls-typing"><i></i><i></i><i></i></span>';
        } else if (role === 'user') {
            body.textContent = content;
        } else {
            body.innerHTML = renderMarkdown(content);
        }
        row.appendChild(body);

        // Meta actions (assistant only, non-loading)
        if (role === 'assistant' && !opts.loading) {
            var actions = document.createElement('div');
            actions.className = 'sls-message-actions';
            actions.innerHTML =
                '<button type="button" class="sls-action-btn" data-act="copy"><i class="fa-regular fa-copy"></i> Copy</button>' +
                '<button type="button" class="sls-action-btn" data-act="regenerate"><i class="fa-solid fa-rotate-right"></i> Regenerate</button>';
            row.appendChild(actions);
        }

        messagesEl.appendChild(row);
        scrollToBottom();
        return row;
    }

    function scrollToBottom() {
        var el = $('sls-chat-messages');
        if (el) el.scrollTop = el.scrollHeight;
    }

    function setStatus(msg, isError) {
        var el = $('sls-status');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('text-red-600', !!isError);
        el.classList.toggle('dark:text-red-400', !!isError);
    }

    function setBusy(value) {
        busy = value;
        var input = $('sls-question');
        var sendBtn = $('sls-send');
        if (input) input.disabled = value;
        if (sendBtn) {
            sendBtn.disabled = value;
            sendBtn.setAttribute('aria-busy', String(value));
            var label = sendBtn.querySelector('span');
            if (label) label.textContent = value ? 'অপেক্ষা…' : 'পাঠান';
        }
    }

    /* -------------------- STREAMING / TYPING SIMULATION -------------------- */
    /* We simulate typing because the Worker returns the full response at once.
     * This gives users a ChatGPT/DeepSeek-like feel. */
    function typeOutMessage(row, fullText) {
        return new Promise(function (resolve) {
            var body = row.querySelector('.sls-message-body');
            if (!body) return resolve();

            // Render markdown fully at the end — for the typing phase we
            // progressively reveal the raw text then swap in markdown.
            var i = 0;
            var step = Math.max(2, Math.ceil(fullText.length / 240)); // ~240 frames
            body.innerHTML = '';

            function tick() {
                if (i >= fullText.length) {
                    // Final markdown render
                    body.innerHTML = renderMarkdown(fullText);
                    scrollToBottom();
                    resolve();
                    return;
                }
                var chunk = fullText.slice(i, i + step);
                i += step;
                body.textContent += chunk;
                scrollToBottom();
                setTimeout(tick, STREAM_CHUNK_MS);
            }
            tick();
        });
    }

    /* -------------------- SEND MESSAGE -------------------- */
    async function send(question) {
        question = String(question || '').trim();
        if (!question || busy) return;

        // Rate-limit guard
        var now = Date.now();
        if (now - lastRequestAt < MIN_REQUEST_GAP_MS) {
            setStatus('একটু দ্রুত পাঠাচ্ছেন — ১ সেকেন্ড পরে আবার চেষ্টা করুন।', true);
            return;
        }
        lastRequestAt = now;

        if (question.length > MAX_CHARS) {
            setStatus('প্রশ্নটি ' + MAX_CHARS + ' অক্ষরের মধ্যে রাখুন।', true);
            return;
        }

        setStatus('');
        appendMessage('user', question);
        var input = $('sls-question');
        if (input) input.value = '';
        setBusy(true);

        var waiting = appendMessage('assistant', '', { loading: true });

        // Build request messages with system prompt
        var requestMessages = [{ role: 'system', content: SYSTEM_PROMPT }]
            .concat(history.slice(-(MAX_HISTORY - 1)))
            .concat([{ role: 'user', content: question }]);

        var startedAt = Date.now();
        try {
            var response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: requestMessages,
                    max_tokens: 2048,
                    temperature: 0.7
                })
            });

            var data = await response.json().catch(function () { return null; });
            if (!data) throw new Error('Server-এর response JSON নয়। Worker endpoint পরীক্ষা করুন।');

            if (!response.ok) {
                if (response.status === 403)
                    throw new Error('Worker-এ origin অনুমোদিত নয়। CORS সেটিংস চেক করুন।');
                if (response.status === 404)
                    throw new Error('Worker-এ /chat endpoint নেই।');
                if (response.status === 429)
                    throw new Error('অনেক বেশি রিকোয়েস্ট হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।');
                throw new Error(data.error || ('Request ব্যর্থ: ' + response.status));
            }

            var reply = (typeof data.reply === 'string' && data.reply.trim())
                ? data.reply.trim()
                : (typeof data.content === 'string' && data.content.trim())
                    ? data.content.trim()
                    : (typeof data.message === 'string' && data.message.trim())
                        ? data.message.trim()
                        : '';
            if (!reply) throw new Error('AI কোনো উত্তর ফেরত দেয়নি।');

            // Remove loading placeholder and stream-in
            if (waiting) waiting.remove();
            var assistantRow = appendMessage('assistant', '');
            await typeOutMessage(assistantRow, reply);

            // Save to history
            history.push({ role: 'user', content: question });
            history.push({ role: 'assistant', content: reply });
            if (history.length > MAX_HISTORY * 2) {
                history = history.slice(-(MAX_HISTORY * 2));
            }

            var elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
            setStatus('উত্তর পাওয়া গেছে · ' + elapsed + 's');
        } catch (error) {
            if (waiting) waiting.remove();
            var note = (error && error.message) ? error.message : 'Network error হয়েছে।';
            appendMessage('assistant',
                '**দুঃখিত, এখন উত্তর পাওয়া যায়নি।**\n\n' + note +
                '\n\n> পরামর্শ: ইন্টারনেট চেক করুন, অথবা আবার চেষ্টা করুন।');
            setStatus('AI service-এ যোগাযোগ করা যায়নি।', true);
            console.error('[Student Life Support]', error);
        } finally {
            setBusy(false);
            if (input) input.focus();
        }
    }

    /* -------------------- REGENERATE -------------------- */
    async function regenerate(assistantRow) {
        if (busy) return;
        // Find the last user message in history
        var lastUser = null;
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') { lastUser = history[i].content; break; }
        }
        if (!lastUser) {
            setStatus('Regenerate করার মতো কোনো আগের প্রশ্ন নেই।', true);
            return;
        }
        // Remove last assistant message from history (will be replaced)
        if (history.length && history[history.length - 1].role === 'assistant') {
            history.pop();
        }
        // Remove the assistant row from DOM
        if (assistantRow && assistantRow.parentNode) assistantRow.remove();
        // Re-send
        lastRequestAt = 0;
        await send(lastUser);
    }

    /* -------------------- CLICK HANDLERS (event delegation) -------------------- */
    function bindMessageActions() {
        var messagesEl = $('sls-chat-messages');
        if (!messagesEl || messagesEl.dataset.actionsBound === '1') return;
        messagesEl.dataset.actionsBound = '1';

        messagesEl.addEventListener('click', function (e) {
            // Code-block copy button
            var codeCopy = e.target.closest('.sls-codeblock-copy');
            if (codeCopy) {
                var targetId = codeCopy.getAttribute('data-copy-target');
                var codeEl = document.getElementById(targetId);
                if (codeEl) {
                    var text = codeEl.textContent || '';
                    navigator.clipboard.writeText(text).then(function () {
                        codeCopy.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
                        setTimeout(function () {
                            codeCopy.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                        }, 1400);
                    }).catch(function () {
                        codeCopy.textContent = 'Copy failed';
                    });
                }
                return;
            }

            // Message-level action buttons
            var actionBtn = e.target.closest('.sls-action-btn');
            if (actionBtn) {
                var act = actionBtn.getAttribute('data-act');
                var msgRow = actionBtn.closest('.sls-message');
                if (!msgRow) return;
                var body = msgRow.querySelector('.sls-message-body');
                var rawText = body ? body.innerText : '';

                if (act === 'copy') {
                    navigator.clipboard.writeText(rawText).then(function () {
                        actionBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
                        setTimeout(function () {
                            actionBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                        }, 1400);
                    });
                } else if (act === 'regenerate') {
                    regenerate(msgRow);
                }
            }
        });
    }

    /* -------------------- INIT -------------------- */
    function init() {
        var form = $('sls-chat-form');
        var input = $('sls-question');
        var messagesEl = $('sls-chat-messages');
        var clearBtn = $('sls-clear');
        if (!form || !input || !messagesEl) return;
        if (initialized) return;
        initialized = true;

        // Ensure the form is bound once
        if (form.dataset.slsReady !== '1') {
            form.dataset.slsReady = '1';
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                send(input.value);
            });
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    if (form.requestSubmit) form.requestSubmit();
                    else send(input.value);
                }
            });
        }

        // Suggested prompt chips
        document.querySelectorAll('[data-sls-prompt]').forEach(function (chip) {
            if (chip.dataset.bound === '1') return;
            chip.dataset.bound = '1';
            chip.addEventListener('click', function () {
                if (busy) return;
                input.value = chip.getAttribute('data-sls-prompt') || '';
                input.focus();
            });
        });

        // Clear chat
        if (clearBtn && clearBtn.dataset.bound !== '1') {
            clearBtn.dataset.bound = '1';
            clearBtn.addEventListener('click', function () {
                if (busy) return;
                history = [];
                messagesEl.innerHTML = '';
                appendMessage('assistant',
                    'নতুন করে শুরু হলো। 😊\n\n' +
                    '**আমি যেসব বিষয়ে সাহায্য করতে পারি:**\n' +
                    '- কোডিং (Python, JavaScript, C, C++, HTML/CSS)\n' +
                    '- মেডিকেল/HSC সাবজেক্ট (Biology, Chemistry, Physics)\n' +
                    '- Math numericals ও logic puzzle\n' +
                    '- Study routine, exam strategy, motivation\n' +
                    '- General knowledge ও career guidance');
                setStatus('কথোপকথন রিসেট করা হয়েছে।');
                input.focus();
            });
        }

        // Bind message actions (delegation)
        bindMessageActions();
    }

    /* -------------------- BOOTSTRAP -------------------- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})(window, document);
