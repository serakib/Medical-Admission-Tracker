/* ============================================================
 * Medical Admission Tester — Application Engine
 * Questions loaded from ./questions.json at runtime.
 * Firebase initialized via v11.6.1 ES module paths.
 * ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    runTransaction,
    serverTimestamp,
    orderBy,
    query,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* ---------------- Firebase Config ---------------- */
const firebaseConfig = {
    apiKey: "AIzaSyBWPpAhnn-OZokPwh5qFRU8McEvh7smlsQ",
    authDomain: "medical-admission-pro.firebaseapp.com",
    projectId: "medical-admission-pro",
    storageBucket: "medical-admission-pro.firebasestorage.app",
    messagingSenderId: "371132803062",
    appId: "1:371132803062:web:220cae49436abf5a9009d7"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/* ---------------- The App Class ---------------- */
class MedicalExamApp {
    constructor() {
        // Student Life Support removed as requested
        this.views = [
            'home', 'question-bank', 'practice', 'exam-intro', 'previous',
            'setup', 'exam', 'result', 'review', 'profile', 'leaderboard',
            'syllabus', 'medical-hsc-info'
        ];

        this.currentTheme = localStorage.getItem('med_theme') || 'light';
        this.language = 'bn';
        this.previousSelectedYear = null;
        this.previousShowAnswers = false;
        this.preparedExam = null;
        this.bankMode = 'view';
        this.bankSubject = 'all';
        this.bankYear = 'all';
        this.bankSearch = '';
        this.practiceIndex = 0;
        this.practiceSession = null;
        this.practiceTimerInterval = null;

        this.leaderboardCacheKey = 'med_leaderboard_cache_v5';
        this.leaderboardLocalKey = 'med_leaderboard_local_v1';
        this.leaderboardSyncKey = 'med_leaderboard_sync_queue_v1';
        this.leaderboardFilter = 'all';
        this.leaderboardCollege = '';

        this.firestore = db;
        this.profile = null;

        this.setup = {
            mode: 'model',
            subject: 'all',
            questionsCount: 30,
            durationMins: 30
        };

        this.examState = {
            questions: [],
            userAnswers: [],
            markedForReview: [],
            currentIndex: 0,
            timerSeconds: 0,
            timerInterval: null,
            timeUsedSeconds: 0,
            submitted: false,
            startedAt: 0,
            deadlineAt: 0,
            mode: 'model',
            year: 'all',
            subject: 'all'
        };

        this.questionBank = [];
        this.questionsLoaded = false;
        this.authUser = null;
        this.auth = auth;
        this.authMode = 'login';
        this.authReady = false;
        this.examActive = false;

        this.beforeUnloadHandler = (event) => {
            if (this.examActive && !this.examState.submitted) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        window.addEventListener('popstate', () => {
            if (this.examActive && !this.examState.submitted) {
                history.pushState({ exam: true }, '', window.location.href);
                this.confirmSubmitExam('navigation');
            }
        });

        this.init();
    }

    /* ====================================================
     * INIT
     * ==================================================== */
    async init() {
        this.applyTheme();
        this.applyLanguage();
        this.bindEvents();
        
        history.replaceState({ app: true }, '', window.location.href);
        this.showView('home');
        this.setDataStatus('loading');

        this.initAuth();

        try {
            await this.loadQuestionBank();
            this.updateSubjectCountsUI();
            this.updateSetupUI();
            this.loadProgressStats();
            this.setDataStatus('ready');
        } catch (error) {
            console.error('Question bank init failed:', error);
            this.updateSubjectCountsUI();
            this.updateSetupUI();
            this.loadProgressStats();
            this.setDataStatus('error', error.message || 'questions.json লোড করা যায়নি।');
        }
    }

    /* ====================================================
     * EVENT BINDING
     * ==================================================== */
    bindEvents() {
        const $ = (id) => document.getElementById(id);

        const themeBtn = $('theme-toggle');
        if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

        // Home hero buttons
        document.querySelectorAll('button').forEach(btn => {
            const txt = (btn.textContent || '').trim();
            if (txt.includes('পরীক্ষা শুরু করুন') && btn.closest('#view-home')) {
                btn.addEventListener('click', () => this.openSetupView());
            }
            if (txt.includes('বিগত বছর') && btn.closest('#view-home')) {
                btn.addEventListener('click', () => this.setupExamQuick('previous'));
            }
        });

        // Exam mode cards
        const modeMap = [
            { sel: '.fa-shuffle', mode: 'random' },
            { sel: '.fa-laptop-code', mode: 'model' },
            { sel: '.fa-clock-rotate-left', mode: 'previous' }
        ];
        modeMap.forEach(({ sel, mode }) => {
            const icon = document.querySelector(`${sel}`);
            if (icon) {
                const card = icon.closest('.group') || icon.closest('div[class*="cursor-pointer"]');
                if (card) card.addEventListener('click', () => this.setupExamQuick(mode));
            }
        });

        // Subject cards
        ['biology', 'chemistry', 'physics', 'english', 'gk'].forEach(sub => {
            const el = $(`count-subject-${sub}`);
            if (el) {
                const btn = el.closest('button');
                if (btn) btn.addEventListener('click', () => this.startSubjectExam(sub));
            }
        });

        // Question bank filters
        const bankSearch = $('question-bank-search');
        if (bankSearch) bankSearch.addEventListener('input', () => {
            this.bankSearch = bankSearch.value;
            this.renderQuestionBank();
        });
        const bankSubject = $('question-bank-subject');
        if (bankSubject) bankSubject.addEventListener('change', () => {
            this.bankSubject = bankSubject.value;
            this.renderQuestionBank();
        });
        const bankYear = $('question-bank-year');
        if (bankYear) bankYear.addEventListener('change', () => {
            this.bankYear = bankYear.value;
            this.renderQuestionBank();
        });

        // Practice prev/next
        document.querySelectorAll('#view-practice button').forEach(btn => {
            const t = (btn.textContent || '').trim();
            if (t.includes('Previous')) btn.addEventListener('click', () => this.prevPractice());
            if (t.includes('Next')) btn.addEventListener('click', () => this.nextPractice());
        });

        // Setup mode buttons
        ['random', 'model', 'previous'].forEach(m => {
            const btn = $(`setup-mode-${m}`);
            if (btn) btn.addEventListener('click', () => this.setSetupMode(m));
        });

        document.querySelectorAll('#view-setup .q-count-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = parseInt(btn.textContent, 10);
                if (!isNaN(n)) this.setSetupQuestions(n);
            });
        });

        document.querySelectorAll('#view-setup .time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = parseInt(btn.textContent.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(n)) this.setSetupDuration(n);
            });
        });

        const setupSubject = $('setup-subject');
        if (setupSubject) setupSubject.addEventListener('change', () => {
            this.setup.subject = setupSubject.value;
        });

        const startConfig = $('btn-start-exam-config');
        if (startConfig) startConfig.addEventListener('click', () => this.startExamWithConfig());

        const examIntroStart = $('exam-intro-start');
        if (examIntroStart) examIntroStart.addEventListener('click', () => this.beginPreparedExam());

        const submitBtn = $('btn-submit-exam');
        if (submitBtn) submitBtn.addEventListener('click', () => this.confirmSubmitExam());
        const markReviewBtn = $('btn-mark-review');
        if (markReviewBtn) markReviewBtn.addEventListener('click', () => this.toggleMarkReview());
        const prevBtn = $('btn-prev-q');
        if (prevBtn) prevBtn.addEventListener('click', () => this.prevQuestion());
        const nextBtn = $('btn-next-q');
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextQuestion());

        const reviewBtn = $('btn-review-answers');
        if (reviewBtn) reviewBtn.addEventListener('click', () => this.showReviewAnswersView());

        document.querySelectorAll('#view-profile button').forEach(btn => {
            const t = (btn.textContent || '').trim();
            if (t.includes('ইতিহাস মুছুন')) btn.addEventListener('click', () => this.clearStorageHistory());
        });
    }

    /* ====================================================
     * DATA STATUS
     * ==================================================== */
    setDataStatus(state, message = '') {
        const el = document.getElementById('question-data-status');
        if (!el) return;
        el.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-xs';
        if (state === 'ready') { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        if (state === 'loading') {
            el.classList.add('text-blue-700', 'dark:text-blue-300', 'bg-blue-50', 'dark:bg-blue-950/30');
            el.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-1"></i> প্রশ্ন ব্যাংক লোড হচ্ছে...';
        } else {
            el.classList.add('text-red-700', 'dark:text-red-300', 'bg-red-50', 'dark:bg-red-950/30');
            el.innerHTML = `<i class="fa-solid fa-triangle-exclamation ml-1"></i> ${this.escapeHtml(message || 'প্রশ্ন ব্যাংক লোড করা যায়নি।')}`;
        }
    }

    showDataError(message) { this.setDataStatus('error', message); }

    /* ====================================================
     * QUESTION BANK LOADING
     * ==================================================== */
    async loadQuestionBank() {
        const cacheBuster = `?v=${Date.now()}`;
        const response = await fetch(`./questions.json${cacheBuster}`, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`questions.json (${response.status})`);
        const raw = await response.json();
        if (!Array.isArray(raw)) throw new Error('questions.json-এ একটি JSON array থাকতে হবে।');

        const normalized = raw.map((q, i) => this.normalizeQuestion(q, i)).filter(Boolean);
        if (!normalized.length) throw new Error('questions.json-এ কোনো বৈধ প্রশ্ন পাওয়া যায়নি।');

        this.questionBank = normalized;
        this.questionsLoaded = true;
        this.populateYearFilter();
        this.populateQuestionBankYearFilter();
    }

    normalizeQuestion(q, index) {
        if (!q || typeof q !== 'object') return null;
        const rawOptions = Array.isArray(q.options)
            ? q.options
            : ['A', 'B', 'C', 'D'].map(k => q.options && q.options[k]);
        const options = rawOptions.map(v => String(v ?? '').trim());
        if (options.length !== 4 || options.some(v => !v)) return null;

        const rawAnswer = q.correctAnswer ?? q.answer;
        let answer = -1;
        if (Number.isInteger(rawAnswer)) answer = rawAnswer;
        else {
            const value = String(rawAnswer ?? '').trim();
            if (/^[ABCD]$/i.test(value)) answer = 'ABCD'.indexOf(value.toUpperCase());
            else if (/^[0-3]$/.test(value)) answer = Number(value);
            else {
                const found = options.findIndex(opt => opt === value);
                if (found >= 0) answer = found;
            }
        }
        if (answer < 0 || answer > 3) return null;

        const questionText = String(q.question ?? q.questionText ?? '').trim();
        if (!questionText) return null;

        const source = String(q.source || 'Model Test').trim();
        const year = q.year === null || q.year === undefined || q.year === ''
            ? null : String(q.year).trim();

        const rawSubject = String(q.subject || 'general').trim().toLowerCase();
        const subjectAliases = {
            'biology - zoology': 'biology', 'biology - botany': 'biology',
            'chemistry 1st paper': 'chemistry', 'chemistry 2nd paper': 'chemistry',
            'physics 1st paper': 'physics', 'physics 2nd paper': 'physics',
            'general knowledge': 'gk', 'general knowledge / current affairs': 'gk'
        };
        const subject = subjectAliases[rawSubject] || rawSubject;

        return {
            id: String(q.id || q.questionId || `question_${index + 1}`),
            subject,
            difficulty: String(q.difficulty || 'medium').toLowerCase().trim(),
            source, year,
            question: questionText,
            options,
            answer,
            correctAnswer: 'ABCD'[answer],
            explanation: String(q.explanation || '').trim(),
            isPreviousYear: (Boolean(year) && !/^practice$/i.test(year)) ||
                /previous\s*year|বিগত|past\s*year|verified previous/i.test(source)
        };
    }

    populateQuestionBankYearFilter() {
        const select = document.getElementById('question-bank-year');
        if (!select) return;
        const years = [...new Set(this.questionBank.map(q => q.year).filter(y => y && !/^practice$/i.test(y)))]
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        select.innerHTML = `<option value="all">${this.t('All Years', 'সব বছর')}</option>` +
            years.map(y => `<option value="${this.escapeHtml(y)}">${this.escapeHtml(y)}</option>`).join('');
    }

    populateYearFilter() {
        const select = document.getElementById('setup-year');
        if (!select) return;
        const years = [...new Set(this.questionBank.map(q => q.year).filter(y => y && !/^practice$/i.test(y)))]
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        const previous = select.value;
        select.innerHTML = '<option value="all">সব বছর (All Years)</option>';
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            select.appendChild(opt);
        });
        select.value = years.includes(previous) ? previous : 'all';
    }

    /* ====================================================
     * UTILITIES
     * ==================================================== */
    getHistoryKey() {
        return this.authUser?.uid ? `med_history_${this.authUser.uid}` : 'med_history';
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[ch]));
    }

    t(en, bn) { return bn ?? en; }

    applyLanguage() {
        document.documentElement.lang = 'bn';
        document.body.classList.remove('lang-en');
    }

    localizedSubject(subject) {
        const m = {
            biology: 'Biology', chemistry: 'Chemistry', physics: 'Physics',
            english: 'English', gk: 'General Knowledge'
        };
        return m[subject] || subject;
    }

    localizedSource(source) {
        if (/previous|verified/i.test(source)) return 'Previous Year';
        if (/model/i.test(source)) return 'Model Test';
        return source;
    }

    getLocalizedQuestionText(q) { return q.question; }
    getLocalizedOption(q, i) {
        const key = 'ABCD'[i];
        return Array.isArray(q.options) ? (q.options[i] || '') : (q.options?.[key] || '');
    }

    /* ====================================================
     * AUTH
     * ==================================================== */
    initAuth() {
        try {
            setPersistence(this.auth, browserLocalPersistence).catch(err => {
                console.warn('Firebase persistence could not be set:', err);
            });
            onAuthStateChanged(this.auth, user => {
                this.setAuthState(user);
                if (user) this.loadUserProfile();
            });
            this.authReady = true;
        } catch (error) {
            console.error('Firebase init error:', error);
            this.setAuthState(null, 'Firebase auth failed. You can continue as Guest.');
        }
    }

    setAuthState(user) {
        this.authUser = user || null;
        document.querySelectorAll('.auth-btn-target').forEach(container => {
            if (user) {
                container.innerHTML = `
                    <button type="button" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-all outline-none cursor-pointer" onclick="window.handleLogout && window.handleLogout()">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        <span>লগআউট</span>
                    </button>`;
            } else {
                container.innerHTML = `
                    <button type="button" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all outline-none cursor-pointer" onclick="window.redirectToLogin && window.redirectToLogin()">
                        <i class="fa-solid fa-user"></i>
                        <span>Log In / Sign up</span>
                    </button>`;
            }
        });
        this.loadProgressStats();
    }

    async loadUserProfile() {
        if (!this.firestore || !this.authUser) return;
        try {
            const snap = await getDoc(doc(this.firestore, 'students', this.authUser.uid));
            this.profile = snap.exists() ? snap.data() : {
                name: this.authUser.displayName || '',
                email: this.authUser.email || ''
            };
            this.loadProgressStats();
        } catch (e) { console.warn('Profile load failed', e); }
    }

    /* ====================================================
     * VIEW SWITCHING
     * ==================================================== */
    showView(viewName, force = false) {
        if (this.examActive && !this.examState.submitted && !force && viewName !== 'exam') {
            this.confirmSubmitExam('navigation');
            return;
        }
        
        this.views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.classList.toggle('hidden', v !== viewName);
        });
        
        document.body.classList.toggle('exam-active', viewName === 'exam');
        if (viewName === 'exam') history.pushState({ exam: true }, '', '#exam');
        
        // Window scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    openSetupView() { this.showView('setup'); }
    openProfile() { this.showProfile(); }
    showProfile() {
        this.showView('profile');
        this.loadProgressStats();
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('med_theme', this.currentTheme);
        this.applyTheme();
    }

    applyTheme() {
        if (this.currentTheme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }

    /* ====================================================
     * QUESTION BANK VIEW
     * ==================================================== */
    openQuestionBank(mode = 'view') {
        this.bankMode = mode;
        this.bankSearch = '';
        this.bankSubject = 'all';
        this.bankYear = 'all';
        this.showView(mode === 'practice' ? 'practice' : 'question-bank');
        if (mode === 'practice') this.startPractice();
        else this.renderQuestionBank();
    }

    getFilteredBank() {
        let qs = [...this.questionBank];
        if (this.bankSubject !== 'all') qs = qs.filter(q => q.subject === this.bankSubject);
        if (this.bankYear !== 'all') qs = qs.filter(q => q.year === this.bankYear);
        if (this.bankSearch.trim()) {
            const s = this.bankSearch.trim().toLowerCase();
            qs = qs.filter(q => [q.question, q.source, q.subject, q.year]
                .join(' ').toLowerCase().includes(s));
        }
        return qs;
    }

    renderQuestionBank() {
        const list = document.getElementById('question-bank-list');
        if (!list) return;
        const qs = this.getFilteredBank();
        const count = document.getElementById('question-bank-count');
        if (count) count.textContent = this.t(`${qs.length} questions`, `মোট ${qs.length}টি প্রশ্ন`);
        list.innerHTML = '';
        qs.forEach((q, i) => {
            const card = document.createElement('article');
            card.className = 'bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm mb-4';
            const opts = q.options.map((o, j) =>
                `<div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm"><b>${'ABCD'[j]}.</b> ${this.escapeHtml(this.getLocalizedOption(q, j))}</div>`
            ).join('');
            
            card.innerHTML = `
                <div class="flex justify-between mb-2"><span class="text-xs font-bold text-medical-600 dark:text-medical-400">${this.escapeHtml(this.localizedSubject(q.subject))}</span><span class="text-xs text-gray-500">${this.escapeHtml(q.year || this.t('practice', 'Practice'))}</span></div>
                <h3 class="font-bold text-gray-900 dark:text-white mb-3">${i + 1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h3>
                <div class="grid gap-2">${opts}</div>
                <button class="mt-3 px-3 py-2 rounded-xl bg-medical-600 text-white text-xs font-bold">${this.t('Show Answer', 'উত্তর দেখুন')}</button>
                <div class="mt-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-300 hidden">
                    <strong>${this.t('Correct Answer', 'সঠিক উত্তর')}:</strong> ${q.correctAnswer}<br>${this.escapeHtml(q.explanation || '')}
                </div>
            `;
            
            const btn = card.querySelector('button');
            // BUG FIX: Using lastElementChild to prevent selecting Option D
            const ans = card.lastElementChild; 
            
            btn.addEventListener('click', () => {
                ans.classList.toggle('hidden');
                btn.textContent = ans.classList.contains('hidden')
                    ? this.t('Show Answer', 'উত্তর দেখুন')
                    : this.t('Hide Answer', 'উত্তর লুকান');
            });
            list.appendChild(card);
        });
        if (!qs.length) {
            list.innerHTML = `<div class="text-center py-10 text-gray-500"><i class="fa-solid fa-magnifying-glass text-3xl mb-2"></i><p>${this.t('No questions found', 'কোনো প্রশ্ন পাওয়া যায়নি')}</p></div>`;
        }
    }

    /* ====================================================
     * PRACTICE MODE
     * ==================================================== */
    startPractice() {
        if (this.practiceTimerInterval) clearInterval(this.practiceTimerInterval);
        const qs = this.questionBank.filter(q => q.source && !/^verified previous/i.test(q.source) && !q.isPreviousYear);
        const pool = qs.length ? qs : this.questionBank;
        this.showView('practice');
        const selected = [...pool].sort(() => Math.random() - .5).slice(0, Math.min(10, pool.length));
        this.practiceSession = {
            questions: selected, index: 0, answers: [], marks: 0,
            showAnswer: false, timeLeft: 600
        };
        this.renderPractice();
        this.startPracticeTimer();
    }

    startPracticeTimer() {
        if (this.practiceTimerInterval) clearInterval(this.practiceTimerInterval);
        this.practiceTimerInterval = setInterval(() => {
            if (!this.practiceSession) { clearInterval(this.practiceTimerInterval); return; }
            if (this.practiceSession.timeLeft > 0) {
                this.practiceSession.timeLeft--;
                this.updatePracticeTimerUI();
            } else {
                clearInterval(this.practiceTimerInterval);
                alert('সময় শেষ! নতুন প্র্যাকটিস সেশন শুরু হচ্ছে।');
                this.startPractice();
            }
        }, 1000);
    }

    updatePracticeTimerUI() {
        const el = document.getElementById('practice-timer');
        if (!el || !this.practiceSession) return;
        const m = Math.floor(this.practiceSession.timeLeft / 60);
        const s = this.practiceSession.timeLeft % 60;
        el.innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    renderPractice() {
        const s = this.practiceSession, q = s?.questions?.[s.index];
        if (!q) return;
        const root = document.getElementById('practice-question');
        if (!root) return;
        const chosen = s.answers[s.index];
        this.updatePracticeTimerUI();
        root.innerHTML = `
            <div class="flex justify-between text-xs font-bold mb-3">
                <span class="text-medical-600 dark:text-medical-400">${this.localizedSubject(q.subject)}</span>
                <span class="text-gray-500">প্রশ্ন ${s.index + 1} / ${s.questions.length}</span>
            </div>
            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">${s.index + 1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h2>
            <div class="space-y-2">${q.options.map((o, j) => {
                let cls = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
                if (chosen !== undefined) {
                    if (j === q.answer) cls = 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500';
                    else if (j === chosen) cls = 'bg-red-50 dark:bg-red-950/30 border-red-500';
                }
                return `<button class="w-full text-left p-3 rounded-xl border ${cls} ${chosen !== undefined ? 'cursor-not-allowed' : 'hover:border-medical-500'} transition" data-i="${j}" ${chosen !== undefined ? 'disabled' : ''}><b class="mr-2">${'ABCD'[j]}.</b>${this.escapeHtml(this.getLocalizedOption(q, j))}</button>`;
            }).join('')}</div>
            ${chosen !== undefined ? `<div class="mt-4 p-4 rounded-xl ${chosen === q.answer ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300'}"><strong>${chosen === q.answer ? '✅ সঠিক' : '❌ সঠিক নয়'}</strong><p class="mt-1 text-sm">${this.escapeHtml(q.explanation || '')}</p></div>` : ''}
        `;
        root.querySelectorAll('button[data-i]').forEach(btn => {
            btn.addEventListener('click', () => this.answerPractice(Number(btn.dataset.i)));
        });
        const scoreEl = document.getElementById('practice-score');
        if (scoreEl) scoreEl.textContent = String(s.marks);
        const progEl = document.getElementById('practice-progress');
        if (progEl) progEl.textContent = `প্রশ্ন ${s.index + 1} / ${s.questions.length}`;
    }

    answerPractice(i) {
        const s = this.practiceSession;
        if (!s || s.answers[s.index] !== undefined) return;
        s.answers[s.index] = i;
        if (i === s.questions[s.index].answer) {
            s.marks++;
        }
        this.renderPractice();
    }

    nextPractice() {
        const s = this.practiceSession;
        if (!s) return;
        if (s.index < s.questions.length - 1) { s.index++; this.renderPractice(); }
        else { if (this.practiceTimerInterval) clearInterval(this.practiceTimerInterval); this.startPractice(); }
    }

    prevPractice() {
        const s = this.practiceSession;
        if (s && s.index > 0) { s.index--; this.renderPractice(); }
    }

    /* ====================================================
     * SEEN / PRACTICED / ANSWERED tracking
     * ==================================================== */
    getSeenQuestionKey() {
        return this.authUser?.uid ? `med_seen_questions_${this.authUser.uid}` : 'med_seen_questions_guest';
    }
    getSeenQuestionIds() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.getSeenQuestionKey()) || '[]');
            return new Set(Array.isArray(raw) ? raw.map(String) : []);
        } catch { return new Set(); }
    }
    saveSeenQuestionIds(set) {
        localStorage.setItem(this.getSeenQuestionKey(), JSON.stringify([...set]));
    }
    markQuestionsSeen(questions) {
        const seen = this.getSeenQuestionIds();
        questions.forEach(q => { if (q?.id != null) seen.add(String(q.id)); });
        this.saveSeenQuestionIds(seen);
    }
    getPracticedQuestionKey() {
        return this.authUser?.uid ? `med_practiced_questions_${this.authUser.uid}` : 'med_practiced_questions_guest';
    }
    getPracticedQuestionIds() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.getPracticedQuestionKey()) || '[]');
            return new Set(Array.isArray(raw) ? raw.map(String) : []);
        } catch { return new Set(); }
    }
    markQuestionPracticed(question) {
        if (!question || question.id == null) return;
        const practiced = this.getPracticedQuestionIds();
        practiced.add(String(question.id));
        localStorage.setItem(this.getPracticedQuestionKey(), JSON.stringify([...practiced]));
    }

    /* ====================================================
     * PREVIOUS YEAR BROWSER
     * ==================================================== */
    showPreviousYears() {
        this.showView('previous');
        this.renderPreviousYearList();
    }

    renderPreviousYearList() {
        const years = [...new Set(this.questionBank.filter(q => q.year && q.isPreviousYear).map(q => q.year))]
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        const el = document.getElementById('previous-year-list');
        if (!el) return;
        el.innerHTML = years.map(y => `
            <button class="p-4 text-right rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-medical-500 shadow-sm" data-year="${this.escapeHtml(y)}">
                <div class="text-xs text-gray-500">Previous Year</div>
                <div class="text-xl font-extrabold text-gray-900 dark:text-white mt-1">${this.escapeHtml(y)}</div>
                <div class="text-xs text-medical-600 mt-1">${this.questionBank.filter(q => q.year === y && q.isPreviousYear).length} questions</div>
            </button>
        `).join('');
        el.querySelectorAll('button[data-year]').forEach(btn => {
            btn.addEventListener('click', () => this.selectPreviousYear(btn.dataset.year));
        });
    }

    selectPreviousYear(year) {
        this.previousSelectedYear = year;
        this.previousShowAnswers = false;
        document.getElementById('previous-browser')?.classList.remove('hidden');
        this.renderPreviousQuestions();
    }

    togglePreviousAnswers() {
        this.previousShowAnswers = !this.previousShowAnswers;
        this.renderPreviousQuestions();
    }

    renderPreviousQuestions() {
        if (!this.previousSelectedYear) return;
        const qs = this.questionBank.filter(q => q.year === this.previousSelectedYear && q.isPreviousYear);
        const selYear = document.getElementById('previous-selected-year');
        const cnt = document.getElementById('previous-count');
        if (selYear) selYear.textContent = `বিগত বছর ${this.previousSelectedYear}`;
        if (cnt) cnt.textContent = `${qs.length}টি প্রশ্ন — শুধু দেখার জন্য`;
        const box = document.getElementById('previous-question-list');
        if (!box) return;
        box.innerHTML = '';
        qs.forEach((q, i) => {
            const card = document.createElement('article');
            card.className = 'bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 mb-4';
            const opts = q.options.map((o, j) =>
                `<div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm"><b>${'ABCD'[j]}.</b> ${this.escapeHtml(o)}</div>`
            ).join('');
            card.innerHTML = `
                <div class="flex justify-between gap-3 mb-3">
                    <span class="text-xs font-bold text-medical-600">${this.escapeHtml(q.subject)}</span>
                    <span class="text-xs text-gray-500">${this.escapeHtml(q.year)} • পূর্ববর্তী বছর</span>
                </div>
                <h3 class="font-bold text-gray-900 dark:text-white leading-relaxed">${i + 1}. ${this.escapeHtml(q.question)}</h3>
                <div class="grid gap-2 mt-4">${opts}</div>
                ${this.previousShowAnswers ? `<div class="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-sm"><b>সঠিক উত্তর:</b> ${q.correctAnswer}<br>${this.escapeHtml(q.explanation || '')}</div>` : ''}
            `;
            box.appendChild(card);
        });
    }

    /* ====================================================
     * EXAM SETUP
     * ==================================================== */
    setupExamQuick(mode) {
        this.setSetupMode(mode);
        if (mode === 'previous') { this.showPreviousYears(); return; }
        this.showView('setup');
    }

    startSubjectExam(subjectKey) {
        this.setup.mode = 'random';
        this.setup.subject = subjectKey;
        this.setup.questionsCount = 20;
        this.setup.durationMins = 20;
        const sel = document.getElementById('setup-subject');
        if (sel) sel.value = subjectKey;
        this.prepareExamFromSetup();
    }

    setSetupMode(mode) {
        this.setup.mode = mode;
        ['random', 'model', 'previous'].forEach(m => {
            const btn = document.getElementById(`setup-mode-${m}`);
            if (!btn) return;
            if (m === mode) {
                btn.className = "py-2.5 px-3 text-xs sm:text-sm font-bold rounded-xl border border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-700 dark:text-medical-300 text-center";
            } else {
                btn.className = "py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-300 dark:border-gray-600 text-center hover:bg-gray-50 dark:hover:bg-gray-700";
            }
        });
    }

    setSetupQuestions(count) {
        this.setup.questionsCount = count;
        this.updateSetupUI();
    }

    setSetupDuration(mins) {
        this.setup.durationMins = mins;
        this.updateSetupUI();
    }

    updateSetupUI() {
        const subjectSelect = document.getElementById('setup-subject');
        if (subjectSelect) subjectSelect.value = this.setup.subject || 'all';
        const yearSelect = document.getElementById('setup-year');
        if (yearSelect && !yearSelect.value) yearSelect.value = 'all';
        this.setSetupMode(this.setup.mode);
        document.querySelectorAll('.q-count-btn').forEach(btn => {
            const val = parseInt(btn.innerText.trim(), 10);
            if (val === this.setup.questionsCount) {
                btn.className = "q-count-btn py-2 text-xs sm:text-sm font-bold rounded-xl border-2 border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-700 dark:text-medical-300 text-center shadow-sm";
            } else {
                btn.className = "q-count-btn py-2 text-xs sm:text-sm font-bold rounded-xl border border-gray-300 dark:border-gray-600 text-center hover:bg-gray-50 dark:hover:bg-gray-700";
            }
        });
        document.querySelectorAll('.time-btn').forEach(btn => {
            const val = parseInt(btn.innerText.replace(/[^0-9]/g, ''), 10);
            if (val === this.setup.durationMins) {
                btn.className = "time-btn py-2 text-xs sm:text-sm font-bold rounded-xl border-2 border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-700 dark:text-medical-300 text-center shadow-sm";
            } else {
                btn.className = "time-btn py-2 text-xs sm:text-sm font-bold rounded-xl border border-gray-300 dark:border-gray-600 text-center hover:bg-gray-50 dark:hover:bg-gray-700";
            }
        });
    }

    updateSubjectCountsUI() {
        ['biology', 'chemistry', 'physics', 'english', 'gk'].forEach(sub => {
            const count = this.questionBank.filter(q => q.subject === sub).length;
            const el = document.getElementById(`count-subject-${sub}`);
            if (el) el.innerText = `${count} টি প্রশ্ন`;
        });
        const totalEl = document.getElementById('dash-total-questions');
        if (totalEl) totalEl.innerText = `${this.questionBank.length}+`;
    }

    /* ====================================================
     * EXAM PREPARATION
     * ==================================================== */
    shuffleQuestionsAndOptions(pool, count) {
        let filtered = [...pool];
        const selectedSubject = document.getElementById('setup-subject')?.value || this.setup.subject;
        const selectedYear = document.getElementById('setup-year')?.value || 'all';
        if (selectedSubject && selectedSubject !== 'all')
            filtered = filtered.filter(q => q.subject === selectedSubject);
        if (selectedYear && selectedYear !== 'all')
            filtered = filtered.filter(q => q.year === selectedYear);
        if (this.setup.mode === 'previous' || this.setup.mode === 'previousQuiz')
            filtered = filtered.filter(q => q.isPreviousYear && q.year);
        
        if (!filtered.length) { this.showDataError('এই ফিল্টারে কোনো বৈধ প্রশ্ন পাওয়া যায়নি।'); return []; }
        
        for (let i = filtered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
        }
        return filtered.slice(0, Math.min(count, filtered.length)).map(q => {
            const optionsWithIndex = q.options.map((text, idx) => ({ text, isCorrect: idx === q.answer }));
            for (let i = optionsWithIndex.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [optionsWithIndex[i], optionsWithIndex[j]] = [optionsWithIndex[j], optionsWithIndex[i]];
            }
            return {
                ...q,
                options: optionsWithIndex.map(o => o.text),
                answer: optionsWithIndex.findIndex(o => o.isCorrect)
            };
        });
    }

    startExamWithConfig() { this.prepareExamFromSetup(); }

    prepareExamFromSetup() {
        if (!this.questionsLoaded || !this.questionBank.length) {
            this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি।');
            return;
        }
        const count = this.setup.questionsCount;
        const questions = this.shuffleQuestionsAndOptions(this.questionBank, count);
        if (!questions.length) return;
        
        this.preparedExam = {
            questions,
            mode: this.setup.mode,
            subject: this.setup.subject,
            year: document.getElementById('setup-year')?.value || 'all',
            durationMins: this.setup.durationMins
        };
        this.renderExamIntro();
        this.showView('exam-intro');
    }

    renderExamIntro() {
        const cfg = this.preparedExam;
        const title = cfg.mode === 'challenge' ? 'মেডিকেল চ্যালেঞ্জ'
            : (cfg.mode === 'previous' || cfg.mode === 'previousQuiz')
                ? `বিগত বছরের পরীক্ষা — ${cfg.year}` : 'পরীক্ষার নির্দেশনা';
        const titleEl = document.getElementById('exam-intro-title');
        if (titleEl) titleEl.textContent = title;
        
        const rules = [`${cfg.questions.length}টি প্রশ্ন`, `সময়: ${cfg.durationMins} মিনিট`,
               'সঠিক +১, ভুল −০.২৫, স্কিপ ০', 'জমা না দিয়ে পরীক্ষা থেকে বের হওয়া যাবে না',
               'সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হবে'];
        const rulesEl = document.getElementById('exam-intro-rules');
        if (rulesEl) rulesEl.innerHTML = rules.map(x => `<li>• ${this.escapeHtml(x)}</li>`).join('');
        
        const statsEl = document.getElementById('exam-intro-stats');
        if (statsEl) {
            statsEl.innerHTML = [
                ['প্রশ্ন', cfg.questions.length],
                ['সময়', `${cfg.durationMins} min`],
                ['নম্বর', cfg.questions.length],
                ['নেগেটিভ', '0.25']
            ].map(([a, b]) => `<div class="rounded-2xl bg-gray-50 dark:bg-gray-700/50 p-4"><div class="text-[11px] uppercase text-gray-500">${a}</div><div class="text-lg font-extrabold text-gray-900 dark:text-white mt-1">${b}</div></div>`).join('');
        }
    }

    beginPreparedExam() {
        if (!this.preparedExam) return;
        const cfg = this.preparedExam;
        const now = Date.now();
        this.examState = {
            questions: cfg.questions,
            userAnswers: new Array(cfg.questions.length).fill(null),
            markedForReview: new Array(cfg.questions.length).fill(false),
            currentIndex: 0,
            timerSeconds: cfg.durationMins * 60,
            timerInterval: null,
            timeUsedSeconds: 0,
            submitted: false,
            startedAt: now,
            deadlineAt: now + cfg.durationMins * 60000,
            mode: cfg.mode,
            year: cfg.year,
            subject: cfg.subject
        };
        this.examActive = true;
        this.markQuestionsSeen(cfg.questions);
        this.renderQuestion();
        this.renderPalette();
        this.showView('exam');
        this.startTimer();
    }

    /* ====================================================
     * TIMER
     * ==================================================== */
    startTimer() {
        if (this.examState.timerInterval) clearInterval(this.examState.timerInterval);
        const tick = () => {
            const remaining = Math.max(0, this.examState.deadlineAt - Date.now());
            this.examState.timerSeconds = Math.ceil(remaining / 1000);
            this.examState.timeUsedSeconds = Math.min(
                this.examState.deadlineAt - this.examState.startedAt,
                Date.now() - this.examState.startedAt
            ) / 1000;
            const mins = Math.floor(this.examState.timerSeconds / 60);
            const secs = this.examState.timerSeconds % 60;
            const el = document.getElementById('exam-timer');
            if (el) el.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            if (this.examState.timerSeconds <= 0) {
                clearInterval(this.examState.timerInterval);
                this.submitExam(true);
            }
        };
        tick();
        this.examState.timerInterval = setInterval(tick, 250);
    }

    /* ====================================================
     * QUESTION RENDERING
     * ==================================================== */
    renderQuestion() {
        const idx = this.examState.currentIndex;
        const q = this.examState.questions[idx];
        if (!q) return;

        const prog = document.getElementById('exam-progress-text');
        if (prog) prog.innerText = `প্রশ্ন: ${idx + 1} / ${this.examState.questions.length}`;
        const subj = document.getElementById('q-subject');
        if (subj) subj.innerText = this.localizedSubject(q.subject);
        const src = document.getElementById('q-source');
        if (src) src.innerText = q.year ? `${this.localizedSource(q.source)} • ${q.year}` : this.localizedSource(q.source);
        const qtext = document.getElementById('q-text');
        if (qtext) qtext.innerText = `${idx + 1}. ${this.getLocalizedQuestionText(q)}`;

        const container = document.getElementById('q-options');
        if (!container) return;
        container.innerHTML = '';
        const labels = ['A', 'B', 'C', 'D'];
        q.options.forEach((optText, optIdx) => {
            const isSelected = this.examState.userAnswers[idx] === optIdx;
            const btn = document.createElement('button');
            btn.className = `w-full text-right p-4 rounded-2xl border transition flex items-center justify-between ${
                isSelected
                    ? 'border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-800 dark:text-medical-200 font-bold'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`;
            btn.addEventListener('click', () => this.selectOption(optIdx));
            btn.innerHTML = `
                <div class="flex items-center space-x-3 space-x-reverse">
                    <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-medical-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }">${labels[optIdx]}</span>
                    <span class="text-sm sm:text-base">${this.escapeHtml(this.getLocalizedOption(q, optIdx))}</span>
                </div>
            `;
            container.appendChild(btn);
        });

        const reviewBtn = document.getElementById('btn-mark-review');
        if (reviewBtn) {
            if (this.examState.markedForReview[idx]) {
                reviewBtn.className = "px-3 py-2 rounded-xl bg-amber-500 text-white font-semibold text-xs transition flex items-center";
            } else {
                reviewBtn.className = "px-3 py-2 rounded-xl border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-semibold text-xs transition flex items-center";
            }
        }
        const prevBtn = document.getElementById('btn-prev-q');
        if (prevBtn) prevBtn.disabled = idx === 0;
        const nextBtn = document.getElementById('btn-next-q');
        if (nextBtn) {
            const isLast = idx === this.examState.questions.length - 1;
            nextBtn.disabled = false;
            nextBtn.textContent = isLast ? 'সাবমিট' : 'পরবর্তী';
        }
    }

    renderPalette() {
        const grid = document.getElementById('q-palette-grid');
        if (!grid) return;
        grid.innerHTML = '';
        this.examState.questions.forEach((_, idx) => {
            const btn = document.createElement('button');
            const isCurrent = idx === this.examState.currentIndex;
            const isAnswered = this.examState.userAnswers[idx] !== null;
            const isMarked = this.examState.markedForReview[idx];
            let bg = "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
            if (isMarked) bg = "bg-amber-400 text-white font-bold";
            else if (isAnswered) bg = "bg-emerald-500 text-white font-bold";
            const border = isCurrent ? "ring-2 ring-medical-600 ring-offset-2" : "";
            btn.className = `h-9 w-9 rounded-xl text-xs font-bold flex items-center justify-center transition ${bg} ${border}`;
            btn.innerText = idx + 1;
            btn.addEventListener('click', () => {
                this.examState.currentIndex = idx;
                this.renderQuestion();
                this.renderPalette();
            });
            grid.appendChild(btn);
        });
    }

    /* ====================================================
     * OPTION SELECTION
     * ==================================================== */
    selectOption(optIdx) {
        const idx = this.examState.currentIndex;
        if (this.examState.userAnswers[idx] !== null) return;
        this.examState.userAnswers[idx] = optIdx;
        this.renderQuestion();
        this.renderPalette();
    }

    clearOptionSelection() { return; }

    toggleMarkReview() {
        const idx = this.examState.currentIndex;
        this.examState.markedForReview[idx] = !this.examState.markedForReview[idx];
        this.renderQuestion();
        this.renderPalette();
    }

    prevQuestion() {
        if (this.examState.currentIndex > 0) {
            this.examState.currentIndex--;
            this.renderQuestion();
            this.renderPalette();
        }
    }

    nextQuestion() {
        if (this.examState.currentIndex < this.examState.questions.length - 1) {
            this.examState.currentIndex++;
            this.renderQuestion();
            this.renderPalette();
        } else {
            this.confirmSubmitExam('manual');
        }
    }

    /* ====================================================
     * SUBMIT
     * ==================================================== */
    confirmSubmitExam(reason = 'manual') {
        const msg = reason === 'navigation'
            ? 'পরীক্ষা থেকে বের হওয়ার আগে আপনাকে পরীক্ষা জমা দিতে হবে। এখনই জমা দেবেন?'
            : 'আপনি কি নিশ্চিত যে পরীক্ষা জমা দিতে চান? জমা দেওয়ার পর এই attempt-এ আর ফিরতে পারবেন না।';
        if (confirm(msg)) this.submitExam(false);
    }

    submitExam(autoSubmitted = false) {
        if (this.examState.submitted) return;
        if (this.examState.timerInterval) clearInterval(this.examState.timerInterval);
        this.examState.submitted = true;

        let correctCount = 0, wrongCount = 0, skippedCount = 0;
        this.examState.questions.forEach((q, idx) => {
            const ans = this.examState.userAnswers[idx];
            if (ans === null) skippedCount++;
            else if (ans === q.answer) correctCount++;
            else wrongCount++;
        });

        const negativeMarks = wrongCount * 0.25;
        const totalScore = Math.max(0, correctCount - negativeMarks);
        const totalQuestions = this.examState.questions.length;
        const accuracy = (correctCount + wrongCount) > 0
            ? ((correctCount / (correctCount + wrongCount)) * 100).toFixed(1)
            : 0;

        const elapsedSeconds = Math.max(0, Math.round(this.examState.timeUsedSeconds));
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        
        setTxt('res-score-main', `${totalScore.toFixed(2)} / ${totalQuestions}`);
        setTxt('res-percentage', `${(totalQuestions ? (totalScore / totalQuestions) * 100 : 0).toFixed(1)}%`);
        setTxt('res-accuracy', `${accuracy}%`);
        setTxt('res-correct', correctCount);
        setTxt('res-wrong', wrongCount);
        setTxt('res-skipped', skippedCount);
        setTxt('res-negative', `-${negativeMarks.toFixed(2)}`);

        const minsUsed = Math.floor(elapsedSeconds / 60);
        const secsUsed = elapsedSeconds % 60;
        setTxt('res-time-used', `${minsUsed}:${secsUsed.toString().padStart(2, '0')}`);

        const quizPoints = Math.max(0, correctCount * 4 - wrongCount); // Points for leaderboard

        this.saveExamAttempt({
            date: new Date().toLocaleDateString('bn-BD'),
            mode: this.examState.mode,
            subject: this.examState.subject,
            year: this.examState.year,
            score: totalScore.toFixed(2),
            total: totalQuestions,
            accuracy: `${accuracy}%`,
            timeUsed: `${minsUsed}:${secsUsed.toString().padStart(2, '0')}`,
            quizPoints: quizPoints
        });

        // Update Leaderboard
        this.recordLeaderboardResult({ correctCount, wrongCount, totalQuestions, quizPoints, accuracy });

        this.examActive = false;
        this.preparedExam = null;
        history.replaceState({ app: true }, '', window.location.pathname + window.location.search);
        this.showView('result', true);
    }

    /* ====================================================
     * REVIEW
     * ==================================================== */
    showReviewAnswersView() {
        const container = document.getElementById('review-list-container');
        if (!container) return;
        container.innerHTML = '';
        const labels = ['A', 'B', 'C', 'D'];
        this.examState.questions.forEach((q, idx) => {
            const userAns = this.examState.userAnswers[idx];
            const isCorrect = userAns === q.answer;
            const isSkipped = userAns === null;
            const card = document.createElement('div');
            card.className = "bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4 shadow-sm mb-4";
            let badge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">সঠিক</span>`;
            if (isSkipped) badge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">উত্তর দেওয়া হয়নি</span>`;
            else if (!isCorrect) badge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">ভুল উত্তর</span>`;
            
            const optsHTML = q.options.map((opt, oi) => {
                let cls = "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600";
                if (oi === q.answer) cls = "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold";
                else if (oi === userAns && !isCorrect) cls = "bg-red-50 dark:bg-red-950/40 border-red-500 text-red-800 dark:text-red-300 font-bold";
                return `<div class="p-3 rounded-xl border text-sm flex items-center justify-between ${cls}"><span>${labels[oi]}. ${this.escapeHtml(opt)}</span>${oi === q.answer ? '<i class="fa-solid fa-check text-emerald-600"></i>' : ''}${oi === userAns && !isCorrect ? '<i class="fa-solid fa-xmark text-red-600"></i>' : ''}</div>`;
            }).join('');
            
            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-medical-600 uppercase">${this.escapeHtml(q.subject)}</span>
                    ${badge}
                </div>
                <h4 class="font-bold text-gray-900 dark:text-white text-base">${idx + 1}. ${this.escapeHtml(q.question)}</h4>
                <div class="space-y-2">${optsHTML}</div>
                <div class="p-3 bg-medical-50 dark:bg-medical-900/30 rounded-xl text-xs text-medical-800 dark:text-medical-300 border border-medical-100 dark:border-medical-800">
                    <strong>ব্যাখ্যা:</strong> ${this.escapeHtml(q.explanation || 'এই প্রশ্নের কোনো ব্যাখ্যা দেওয়া হয়নি।')}
                </div>
            `;
            container.appendChild(card);
        });
        this.showView('review');
    }

    /* ====================================================
     * HISTORY & STATS
     * ==================================================== */
    saveExamAttempt(attempt) {
        let history = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
        history.unshift(attempt);
        localStorage.setItem(this.getHistoryKey(), JSON.stringify(history));
        this.loadProgressStats();
    }

    loadProgressStats() {
        const history = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
        const total = this.questionBank.length || 520;
        const attempts = history.length;
        const best = attempts ? Math.max(...history.map(h => parseFloat(h.score) || 0)) : 0;
        const avgAcc = attempts
            ? (history.reduce((a, h) => a + (parseFloat(h.accuracy) || 0), 0) / attempts) : 0;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        set('dash-total-exams', attempts);
        set('prog-total-attempts', attempts);
        set('dash-best-score', best.toFixed(2));
        set('prog-best-score', best.toFixed(2));
        set('dash-avg-accuracy', `${avgAcc.toFixed(1)}%`);
        set('prog-avg-accuracy', `${avgAcc.toFixed(1)}%`);
        
        const totalPracticed = this.getPracticedQuestionIds().size;
        set('profile-seen-count', totalPracticed);
        set('profile-attempt-count', attempts);
        set('profile-best-score', best.toFixed(2));
        set('profile-accuracy', `${avgAcc.toFixed(1)}%`);

        set('profile-name', this.authUser
            ? (this.profile?.name || this.authUser.displayName || this.authUser.email || 'Student')
            : 'Guest Student');
        set('profile-email', this.authUser
            ? (this.profile?.email || this.authUser.email || 'Signed in')
            : 'Guest mode • আপনার progress এই device-এ সংরক্ষিত');

        const tbody = document.getElementById('prog-history-tbody');
        if (tbody) {
            tbody.innerHTML = '';
            history.slice(0, 10).forEach(item => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition border-b border-gray-100 dark:border-gray-700';
                tr.innerHTML = `
                    <td class="py-3 px-4 font-medium">${this.escapeHtml(item.date)}</td>
                    <td class="py-3 px-4 capitalize">${this.escapeHtml(item.mode)}</td>
                    <td class="py-3 px-4">${this.escapeHtml(item.subject)}</td>
                    <td class="py-3 px-4 font-bold text-medical-600">${this.escapeHtml(item.score)} / ${this.escapeHtml(item.total)}</td>
                    <td class="py-3 px-4">${this.escapeHtml(item.accuracy)}</td>
                    <td class="py-3 px-4 text-gray-500">${this.escapeHtml(item.timeUsed)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    clearStorageHistory() {
        if (confirm("আপনি কি সমস্ত পরীক্ষার ইতিহাস মুছে ফেলতে চান?")) {
            localStorage.removeItem(this.getHistoryKey());
            this.loadProgressStats();
        }
    }

    /* ====================================================
     * LEADERBOARD (Duolingo Style - Weekly & League)
     * ==================================================== */
    getDemoLeaderboardRows() {
        return [
            { uid: 'demo_01', name: 'Ahnaf', points: 1890, weeklyPoints: 450, quizzes: 18, accuracy: 90.4, isDemo: true },
            { uid: 'demo_02', name: 'Md Rakibul Haque', points: 1725, weeklyPoints: 365, quizzes: 16, accuracy: 87.6, isDemo: true },
            { uid: 'demo_03', name: 'Md Abdullah', points: 1580, weeklyPoints: 360, quizzes: 15, accuracy: 85.5, isDemo: true },
            { uid: 'demo_04', name: 'Ariq Bin Rafiq Tamim', points: 1495, weeklyPoints: 330, quizzes: 14, accuracy: 84.7, isDemo: true },
            { uid: 'demo_05', name: 'Fahim Hasan', points: 1360, weeklyPoints: 210, quizzes: 13, accuracy: 82.8, isDemo: true },
            { uid: 'demo_06', name: 'Mahi Islam', points: 1240, weeklyPoints: 180, quizzes: 12, accuracy: 82.3, isDemo: true },
            { uid: 'demo_07', name: 'Rafiul Karim', points: 1125, weeklyPoints: 120, quizzes: 11, accuracy: 80.0, isDemo: true },
            { uid: 'demo_08', name: 'Jannatul Ferdous', points: 1010, weeklyPoints: 80, quizzes: 10, accuracy: 77.7, isDemo: true }
        ];
    }

    getLocalLeaderboardRows() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.leaderboardLocalKey) || 'null');
            if (Array.isArray(raw) && raw.length) {
                return raw.map(r => ({ ...r, weeklyPoints: r.weeklyPoints !== undefined ? r.weeklyPoints : r.points }));
            }
        } catch (e) { /* ignore */ }
        const rows = this.getDemoLeaderboardRows();
        this.setLocalLeaderboardRows(rows);
        return rows;
    }

    setLocalLeaderboardRows(rows) {
        const safe = (Array.isArray(rows) ? rows : []).map(x => ({
            ...x,
            points: Number(x.points || 0),
            weeklyPoints: Number(x.weeklyPoints || 0),
            quizzes: Number(x.quizzes || 0),
            accuracy: Number(x.accuracy || 0)
        }));
        localStorage.setItem(this.leaderboardLocalKey, JSON.stringify(safe));
        return safe;
    }

    checkWeeklyReset() {
        const lastReset = localStorage.getItem('med_lb_last_reset');
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        if (!lastReset || (now - Number(lastReset)) > oneWeek) {
            let rows = this.getLocalLeaderboardRows();
            rows = rows.map(user => ({ ...user, weeklyPoints: 0 }));
            this.setLocalLeaderboardRows(rows);
            localStorage.setItem('med_lb_last_reset', now.toString());
        }
    }

    getLeagueData(points) {
        if (points >= 600) return { name: 'গোল্ড লীগ', min: 600, max: 1000 };
        if (points >= 300) return { name: 'সিলভার লীগ', min: 300, max: 600 };
        if (points >= 100) return { name: 'ব্রোঞ্জ লীগ', min: 100, max: 300 };
        return { name: 'আয়রন লীগ', min: 0, max: 100 };
    }

    async loadLeaderboard(silent = false) {
        this.checkWeeklyReset();
        
        let rows = this.getLocalLeaderboardRows();
        
        // Sort by weekly points descending
        rows.sort((a, b) => (b.weeklyPoints || 0) - (a.weeklyPoints || 0));

        // User Info
        const myUid = this.authUser?.uid || 'guest_local';
        const myData = rows.find(r => r.uid === myUid) || { uid: myUid, weeklyPoints: 0, name: 'আপনি' };
        
        // 1. Update League UI
        const league = this.getLeagueData(myData.weeklyPoints || 0);
        document.getElementById('current-league-name').innerText = league.name;
        document.getElementById('current-league-points').innerText = myData.weeklyPoints || 0;
        document.getElementById('next-league-points').innerText = league.max;
        
        let progress = ((myData.weeklyPoints - league.min) / (league.max - league.min)) * 100;
        progress = Math.max(0, Math.min(100, progress));
        document.getElementById('league-progress-bar').style.width = `${progress}%`;

        // 2. Update Sticky Row (My Rank)
        const myIndex = rows.findIndex(r => r.uid === myUid);
        document.getElementById('my-rank-number').innerHTML = `#${myIndex > -1 ? myIndex + 1 : '?'}`;
        document.getElementById('my-rank-points').innerHTML = `${myData.weeklyPoints || 0} <span class="text-xs text-gray-500 font-normal">পয়েন্ট</span>`;

        // 3. Render List
        const listContainer = document.getElementById('leaderboard-list');
        listContainer.innerHTML = '';
        
        rows.slice(0, 30).forEach((user, index) => {
            // Safe zone line after 3rd position
            if (index === 3) {
                const safeZoneDivider = document.createElement('div');
                safeZoneDivider.className = 'bg-green-50 dark:bg-green-900/20 py-1 px-4 text-xs font-bold text-green-600 dark:text-green-400 border-y-2 border-dashed border-green-300 dark:border-green-700 flex items-center gap-2';
                safeZoneDivider.innerHTML = `<i class="fa-solid fa-arrow-up"></i> প্রমোশন জোন (উপরে)`;
                listContainer.appendChild(safeZoneDivider);
            }

            const isMe = user.uid === myUid;
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name || 'Student'}`;
            
            const row = document.createElement('div');
            row.className = `flex items-center justify-between px-4 py-3 ${isMe ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'} transition-colors cursor-default`;
            
            row.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="font-bold text-gray-500 w-6 text-center text-sm">${index + 1}</span>
                    <img src="${avatarUrl}" alt="Avatar" class="w-10 h-10 rounded-full bg-gray-200 border border-gray-300 shadow-sm">
                    <div>
                        <h4 class="font-bold text-sm text-gray-800 dark:text-gray-200">${this.escapeHtml(user.name || 'Student')} ${isMe ? '<span class="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded ml-1">YOU</span>' : ''}</h4>
                    </div>
                </div>
                <div class="text-right">
                    <span class="font-bold text-sm text-gray-700 dark:text-gray-300">${user.weeklyPoints || 0}</span> <span class="text-[10px] text-gray-500">পয়েন্ট</span>
                </div>
            `;
            listContainer.appendChild(row);
        });

        // 4. Update Profile Ranks
        this.updateProfileRanks(rows, myUid);
    }

    updateProfileRanks(allRows, myUid) {
        // Best Score Rank (All Time)
        let allTimeSorted = [...allRows].sort((a, b) => (b.points || 0) - (a.points || 0));
        const bestRankIndex = allTimeSorted.findIndex(r => r.uid === myUid);
        
        // Live Rank (Weekly) - allRows is already sorted by weekly points
        const liveRankIndex = allRows.findIndex(r => r.uid === myUid);

        const bestRankEl = document.getElementById('profile-best-rank');
        if (bestRankEl) {
            bestRankEl.innerText = bestRankIndex > -1 ? `#${bestRankIndex + 1}` : 'N/A';
        }
        
        const liveRankEl = document.getElementById('profile-live-rank');
        if (liveRankEl) {
            liveRankEl.innerText = liveRankIndex > -1 ? `#${liveRankIndex + 1}` : 'N/A';
        }
    }

    async recordLeaderboardResult({ correctCount, wrongCount, totalQuestions, quizPoints, accuracy }) {
        const uid = this.authUser?.uid || 'guest_local';
        const name = this.profile?.name || this.authUser?.displayName || 'Guest Student';
        
        let rows = this.getLocalLeaderboardRows();
        let current = rows.find(x => x.uid === uid) || { uid, name, points: 0, weeklyPoints: 0, quizzes: 0, accuracy: 0 };
        
        const updated = {
            ...current,
            name,
            points: Number(current.points || 0) + Number(quizPoints || 0),
            weeklyPoints: Number(current.weeklyPoints || 0) + Number(quizPoints || 0),
            quizzes: Number(current.quizzes || 0) + 1,
            accuracy: accuracy,
            updatedAtMs: Date.now()
        };
        
        rows = rows.filter(x => x.uid !== uid);
        rows.push(updated);
        this.setLocalLeaderboardRows(rows);

        if (!this.authUser || !this.firestore) return;
        
        try {
            const userLbRef = doc(this.firestore, 'leaderboard', this.authUser.uid);
            await setDoc(userLbRef, {
                uid: this.authUser.uid,
                name: updated.name,
                points: updated.points,
                weeklyPoints: updated.weeklyPoints, // Sync weekly points
                quizzes: updated.quizzes,
                accuracy: updated.accuracy,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch(e) {
            console.error('Leaderboard sync failed', e);
        }
    }
}

/* ============================================================
 * BOOTSTRAP
 * ============================================================ */
window.app = new MedicalExamApp();

/* ============================================================
 * GLOBAL HELPERS
 * ============================================================ */
let isWrongFiltered = false;
let originalQuestionStates = new Map();

window.toggleWrongQuestions = function () {
    const btn = document.getElementById("wrong-btn");
    const container = document.getElementById("review-list-container");
    if (!container) return;
    const questions = container.querySelectorAll(":scope > div");
    if (!isWrongFiltered) {
        originalQuestionStates.clear();
        let found = false;
        questions.forEach(q => {
            const text = q.innerText || "";
            const isWrong = /ভুল উত্তর|উত্তর দেওয়া হয়নি|উত্তর দেয়া হয়নি|Wrong|Incorrect|Skipped/i.test(text);
            originalQuestionStates.set(q, q.hidden);
            q.hidden = !isWrong;
            if (isWrong) found = true;
        });
        if (!found) {
            originalQuestionStates.forEach((wasHidden, q) => {
                if (q.isConnected) q.hidden = wasHidden;
            });
            originalQuestionStates.clear();
            alert("কোনো ভুল বা উত্তর না দেওয়া প্রশ্ন পাওয়া যায়নি!");
            return;
        }
        isWrongFiltered = true;
        if (btn) { btn.innerText = "সব প্রশ্ন দেখুন"; btn.style.backgroundColor = "#2ecc71"; }
    } else {
        originalQuestionStates.forEach((wasHidden, q) => {
            if (q.isConnected) q.hidden = wasHidden;
        });
        originalQuestionStates.clear();
        isWrongFiltered = false;
        if (btn) { btn.innerText = "See Wrong Questions"; btn.style.backgroundColor = "#dc3545"; }
    }
};

window.redirectToLogin = function () {
    window.location.href = "https://serakib.github.io/Medical-Admission-Tracker-login/";
};

window.handleLogout = function () {
    if (!confirm("আপনি কি সত্যিই লগআউট করতে চান?")) return;
    signOut(auth).then(() => window.location.reload())
        .catch((error) => {
            console.error("Logout Error:", error);
            alert("লগআউট করতে ব্যর্থ হয়েছে।");
        });
};

onAuthStateChanged(auth, (user) => {
    // This will be handled by the app class, but we keep this for standalone auth buttons if any remain outside the app scope
});
