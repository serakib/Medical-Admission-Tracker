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
        this.views = [
            'home', 'question-bank', 'practice', 'exam-intro', 'previous',
            'setup', 'exam', 'result', 'review', 'profile', 'leaderboard',
            'syllabus', 'medical-hsc-info', 'student-life-support'
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
        this.restoreSidebarState();

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
     * SIDEBAR — toggle, restore, active sync
     * ==================================================== */
    toggleSidebar() {
        const shell = document.getElementById('appShell');
        if (!shell) return;
        if (window.innerWidth <= 1024) {
            shell.classList.toggle('is-open-mobile');
            document.body.classList.toggle('sidebar-open');
        } else {
            shell.classList.toggle('is-collapsed');
            localStorage.setItem(
                'med_sidebar_collapsed',
                shell.classList.contains('is-collapsed') ? '1' : '0'
            );
        }
    }

    restoreSidebarState() {
        const shell = document.getElementById('appShell');
        if (!shell) return;
        if (localStorage.getItem('med_sidebar_collapsed') === '1') {
            shell.classList.add('is-collapsed');
        }
        const backdrop = document.getElementById('sidebarBackdrop');
        if (backdrop && !backdrop.dataset.bound) {
            backdrop.dataset.bound = '1';
            backdrop.addEventListener('click', () => {
                shell.classList.remove('is-open-mobile');
                document.body.classList.remove('sidebar-open');
            });
        }
    }

    syncSidebarActive(viewName) {
        const aliasMap = {
            'setup': 'model-test',
            'exam-intro': 'model-test',
            'exam': 'model-test',
            'result': 'model-test',
            'review': 'model-test'
        };
        const target = aliasMap[viewName] || viewName;
        document.querySelectorAll('.sidebar-item').forEach(el => {
            el.classList.toggle('is-active', el.dataset.nav === target);
        });
    }

    /* ====================================================
     * EVENT BINDING (sidebars, buttons, inputs)
     * ==================================================== */
    bindEvents() {
        const $ = (id) => document.getElementById(id);

        // Sidebar hamburger
        const toggleBtn = $('sidebarToggle');
        if (toggleBtn) toggleBtn.addEventListener('click', () => this.toggleSidebar());

        // Theme toggle
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

        // Exam mode cards (find by icon class)
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

        // Subject cards (home)
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

        // Setup question count buttons
        document.querySelectorAll('#view-setup .q-count-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = parseInt(btn.textContent, 10);
                if (!isNaN(n)) this.setSetupQuestions(n);
            });
        });

        // Setup duration buttons
        document.querySelectorAll('#view-setup .time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = parseInt(btn.textContent.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(n)) this.setSetupDuration(n);
            });
        });

        // Setup subject/year selects
        const setupSubject = $('setup-subject');
        if (setupSubject) setupSubject.addEventListener('change', () => {
            this.setup.subject = setupSubject.value;
        });
        const setupYear = $('setup-year');
        if (setupYear) setupYear.addEventListener('change', () => {
            // year read during shuffle
        });

        // Setup start button
        const startConfig = $('btn-start-exam-config');
        if (startConfig) startConfig.addEventListener('click', () => this.startExamWithConfig());

        // Exam intro start
        const examIntroStart = $('exam-intro-start');
        if (examIntroStart) examIntroStart.addEventListener('click', () => this.beginPreparedExam());

        // Exam controls
        const submitBtn = $('btn-submit-exam');
        if (submitBtn) submitBtn.addEventListener('click', () => this.confirmSubmitExam());
        const markReviewBtn = $('btn-mark-review');
        if (markReviewBtn) markReviewBtn.addEventListener('click', () => this.toggleMarkReview());
        const clearBtn = $('btn-clear-answer');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearOptionSelection());
        const prevBtn = $('btn-prev-q');
        if (prevBtn) prevBtn.addEventListener('click', () => this.prevQuestion());
        const nextBtn = $('btn-next-q');
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextQuestion());

        // OMR container (event delegation)
        const omr = $('omrContainer');
        if (omr && !omr.dataset.bound) {
            omr.dataset.bound = '1';
            omr.addEventListener('click', (e) => {
                const bubble = e.target.closest('.omr-bubble');
                if (!bubble) return;
                const qIdx = Number(bubble.dataset.qIndex);
                const oIdx = Number(bubble.dataset.optIndex);
                this.selectOMRBubbleUI(qIdx, oIdx);
            });
        }

        // Review answers button
        const reviewBtn = $('btn-review-answers');
        if (reviewBtn) reviewBtn.addEventListener('click', () => this.showReviewAnswersView());

        // Analytics refresh
        const refreshAna = $('btn-refresh-analytics');
        if (refreshAna) refreshAna.addEventListener('click', () => {
            const history = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
            this.renderAdvancedAnalytics(history);
        });

        // Leaderboard refresh
        const refreshLb = $('btn-refresh-lb');
        if (refreshLb) refreshLb.addEventListener('click', () => this.loadLeaderboard());

        // Leaderboard filter buttons
        document.querySelectorAll('.lb-filter-btn').forEach(b => {
            b.addEventListener('click', () => {
                const crit = b.dataset.lbFilter;
                if (crit === 'college') {
                    const sel = $('leaderboard-college-select');
                    this.filterLeaderboard('college', sel ? sel.value : '');
                } else {
                    this.filterLeaderboard(crit);
                }
            });
        });
        const lbCollegeSel = $('leaderboard-college-select');
        if (lbCollegeSel) lbCollegeSel.addEventListener('change', () => {
            this.filterLeaderboard('college', lbCollegeSel.value);
        });

        // Reset coverage button (profile)
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
            question_bn: String(q.question_bn || '').trim() || null,
            question_en: String(q.question_en || '').trim() || null,
            options,
            options_bn: Array.isArray(q.options_bn) ? q.options_bn.map(v => String(v ?? '').trim()) : null,
            options_en: Array.isArray(q.options_en) ? q.options_en.map(v => String(v ?? '').trim()) : null,
            answer,
            correctAnswer: 'ABCD'[answer],
            explanation: String(q.explanation || '').trim(),
            explanation_bn: String(q.explanation_bn || '').trim() || null,
            explanation_en: String(q.explanation_en || '').trim() || null,
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
        // Auth button containers may exist in HTML with class .auth-btn-target
        document.querySelectorAll('.auth-btn-target').forEach(container => {
            if (user) {
                container.innerHTML = `
                    <button type="button" class="auth-chip" onclick="window.handleLogout && window.handleLogout()">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        <span>লগআউট</span>
                    </button>`;
            } else {
                container.innerHTML = `
                    <button type="button" class="auth-chip" onclick="window.redirectToLogin && window.redirectToLogin()">
                        <i class="fa-solid fa-user"></i>
                        <span>Log In</span>
                    </button>`;
            }
        });
        this.loadProgressStats();
    }

    friendlyAuthError(error) {
        const code = error?.code || '';
        const map = {
            'auth/invalid-email': 'ইমেইল ঠিকানাটি সঠিক নয়।',
            'auth/user-not-found': 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।',
            'auth/wrong-password': 'পাসওয়ার্ড সঠিক নয়।',
            'auth/email-already-in-use': 'এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে।',
            'auth/weak-password': 'পাসওয়ার্ড আরও শক্তিশালী করুন (কমপক্ষে ৬ অক্ষর)।',
            'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
            'auth/network-request-failed': 'নেটওয়ার্ক সমস্যা হয়েছে।'
        };
        return map[code] || error?.message || 'Authentication ব্যর্থ হয়েছে।';
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
        this.syncSidebarActive(viewName);
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
            qs = qs.filter(q => [q.question, q.question_bn, q.question_en, q.source, q.subject, q.year]
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
            card.className = 'bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm';
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
            const ans = card.querySelector('div.hidden, div:last-child');
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
        this.markQuestionsSeen(selected);
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
        this.markQuestionPracticed(s.questions[s.index]);
        if (i === s.questions[s.index].answer) {
            s.marks++;
            this.markQuestionCoveredIfCorrect(s.questions[s.index], i);
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
    getUnseenPool(pool) {
        const seen = this.getSeenQuestionIds();
        return pool.filter(q => q?.id != null && !seen.has(String(q.id)));
    }
    getAnsweredQuestionKey() {
        return this.authUser?.uid ? `med_answered_questions_${this.authUser.uid}` : 'med_answered_questions_guest';
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
    getAnsweredQuestionIds() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.getAnsweredQuestionKey()) || '[]');
            return new Set(Array.isArray(raw) ? raw.map(String) : []);
        } catch { return new Set(); }
    }
    markQuestionAnswered(question) {
        if (!question || question.id == null) return;
        const answered = this.getAnsweredQuestionIds();
        answered.add(String(question.id));
        localStorage.setItem(this.getAnsweredQuestionKey(), JSON.stringify([...answered]));
        this.loadProgressStats();
    }
    markQuestionCoveredIfCorrect(question, selectedIndex) {
        if (question && selectedIndex === question.answer) this.markQuestionAnswered(question);
    }
    resetCoverage() {
        localStorage.removeItem(this.getAnsweredQuestionKey());
        this.loadProgressStats();
    }
    clearCoverage() { this.resetCoverage(); }

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
            card.className = 'bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700';
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

    startPreviousYearQuiz() {
        if (!this.previousSelectedYear) return;
        this.setup.mode = 'previousQuiz';
        this.setup.subject = 'all';
        this.setup.questionsCount = Math.min(20,
            this.questionBank.filter(q => q.year === this.previousSelectedYear && q.isPreviousYear).length);
        this.setup.durationMins = 10;
        const ys = document.getElementById('setup-year');
        if (ys) ys.value = this.previousSelectedYear;
        this.prepareExamFromSetup();
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

    startChallenge() {
        this.setup.mode = 'challenge';
        this.setup.subject = 'all';
        this.setup.questionsCount = 20;
        this.setup.durationMins = 10;
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
        if (this.setup.mode === 'challenge')
            filtered = filtered.filter(q => q.source && !/^practice$/i.test(q.year || ''));
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
        const count = (this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz')
            ? 20 : this.setup.questionsCount;
        const questions = this.shuffleQuestionsAndOptions(this.questionBank, count);
        if (!questions.length) return;
        this.preparedExam = {
            questions,
            mode: this.setup.mode,
            subject: this.setup.subject,
            year: document.getElementById('setup-year')?.value || 'all',
            durationMins: (this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz')
                ? 10 : this.setup.durationMins
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
        const startBtn = document.getElementById('exam-intro-start');
        if (startBtn) startBtn.textContent = 'পরীক্ষা শুরু করুন';
        const rules = (cfg.mode === 'challenge' || cfg.mode === 'previousQuiz')
            ? ['২০টি MCQ প্রশ্ন', 'সময়: ১০ মিনিট', 'সঠিক +১, ভুল −০.২৫, স্কিপ ০',
               'পরীক্ষা থেকে বের হতে হলে আগে পরীক্ষা জমা দিতে হবে', 'সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হবে']
            : [`${cfg.questions.length}টি প্রশ্ন`, `সময়: ${cfg.durationMins} মিনিট`,
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
        this.initOMRSimulation();     // <-- NEW
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
        const diff = document.getElementById('q-difficulty');
        if (diff) diff.classList.add('hidden');
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
                this.initOMRSimulation();
            });
            grid.appendChild(btn);
        });
    }

    /* ====================================================
     * OMR SIMULATION — init + UI updates
     * ==================================================== */
    initOMRSimulation() {
        const c = document.getElementById('omrContainer');
        if (!c) return;
        c.innerHTML = '';
        const qs = this.examState.questions || [];
        const labels = ['A', 'B', 'C', 'D'];
        qs.forEach((q, qIdx) => {
            const row = document.createElement('div');
            row.className = 'omr-row';
            row.dataset.qIndex = String(qIdx);
            if (qIdx === this.examState.currentIndex) row.classList.add('is-current');
            if (this.examState.markedForReview[qIdx]) row.classList.add('is-marked');

            const num = document.createElement('span');
            num.className = 'omr-num';
            num.textContent = String(qIdx + 1);
            row.appendChild(num);

            const bubbles = document.createElement('div');
            bubbles.className = 'omr-bubbles';
            labels.forEach((lab, oIdx) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'omr-bubble';
                b.dataset.qIndex = String(qIdx);
                b.dataset.optIndex = String(oIdx);
                b.textContent = lab;
                if (this.examState.userAnswers[qIdx] === oIdx) b.classList.add('is-filled');
                bubbles.appendChild(b);
            });
            row.appendChild(bubbles);
            c.appendChild(row);
        });
    }

    selectOMRBubbleUI(qIndex, optIndex) {
        if (!this.examState || !Array.isArray(this.examState.questions)) return;
        if (qIndex < 0 || qIndex >= this.examState.questions.length) return;
        if (optIndex < 0 || optIndex > 3) return;

        this.examState.currentIndex = qIndex;
        if (this.examState.userAnswers[qIndex] === null) {
            this.examState.userAnswers[qIndex] = optIndex;
            const q = this.examState.questions[qIndex];
            this.markQuestionPracticed(q);
            this.markQuestionCoveredIfCorrect(q, optIndex);
        }
        this.renderQuestion();
        this.renderPalette();
        this.initOMRSimulation();
    }

    /* ====================================================
     * OPTION SELECTION
     * ==================================================== */
    selectOption(optIdx) {
        const idx = this.examState.currentIndex;
        if (this.examState.userAnswers[idx] !== null) return;
        this.examState.userAnswers[idx] = optIdx;
        const question = this.examState.questions[idx];
        this.markQuestionPracticed(question);
        this.markQuestionCoveredIfCorrect(question, optIdx);
        this.renderQuestion();
        this.renderPalette();
        this.initOMRSimulation();     // <-- sync OMR bubbles
    }

    clearOptionSelection() { return; }

    toggleMarkReview() {
        const idx = this.examState.currentIndex;
        this.examState.markedForReview[idx] = !this.examState.markedForReview[idx];
        this.renderQuestion();
        this.renderPalette();
        this.initOMRSimulation();
    }

    prevQuestion() {
        if (this.examState.currentIndex > 0) {
            this.examState.currentIndex--;
            this.renderQuestion();
            this.renderPalette();
            this.initOMRSimulation();
        }
    }

    nextQuestion() {
        if (this.examState.currentIndex < this.examState.questions.length - 1) {
            this.examState.currentIndex++;
            this.renderQuestion();
            this.renderPalette();
            this.initOMRSimulation();
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

        /* ===== SECURITY: Time validation check ===== */
        const elapsedSeconds = Math.max(0, Math.round(this.examState.timeUsedSeconds));
        const minReasonable = Math.max(5, totalQuestions * 2); // at least 2s per question
        if (!autoSubmitted && elapsedSeconds < minReasonable) {
            const flag = {
                timestamp: Date.now(),
                type: 'SUSPICIOUS_FAST_COMPLETION',
                elapsedSeconds,
                totalQuestions,
                avgSecondsPerQ: +(elapsedSeconds / Math.max(1, totalQuestions)).toFixed(2),
                uid: this.authUser?.uid || 'guest',
                mode: this.examState.mode,
                subject: this.examState.subject
            };
            try {
                const key = 'med_cheat_logs';
                const logs = JSON.parse(localStorage.getItem(key) || '[]');
                logs.unshift(flag);
                localStorage.setItem(key, JSON.stringify(logs.slice(0, 50)));
            } catch (e) { /* ignore */ }
            console.warn('[SECURITY] Suspicious fast completion flagged:', flag);
        }

        // Result UI
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

        const quizPoints = (this.examState.mode === 'challenge' || this.examState.mode === 'previousQuiz')
            ? Math.max(0, correctCount * 4 - wrongCount) : 0;

        this.saveExamAttempt({
            date: new Date().toLocaleDateString('bn-BD'),
            mode: this.setup.mode,
            subject: document.getElementById('setup-subject')?.value || this.examState.subject,
            year: document.getElementById('setup-year')?.value || 'all',
            score: totalScore.toFixed(2),
            total: totalQuestions,
            accuracy: `${accuracy}%`,
            timeUsed: `${minsUsed}:${secsUsed.toString().padStart(2, '0')}`,
            quizPoints,
            modeLabel: this.examState.mode
        });

        if (this.examState.mode === 'challenge' || this.examState.mode === 'previousQuiz') {
            this.recordLeaderboardResult({ correctCount, wrongCount, totalQuestions, quizPoints, accuracy });
        }

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
            card.className = "bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4 shadow-sm";
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
        const answered = this.getAnsweredQuestionIds();
        const total = this.questionBank.length || 520;
        const attempts = history.length;
        const best = attempts ? Math.max(...history.map(h => parseFloat(h.score) || 0)) : 0;
        const avgAcc = attempts
            ? (history.reduce((a, h) => a + (parseFloat(h.accuracy) || 0), 0) / attempts) : 0;
        const avgScore = attempts
            ? (history.reduce((a, h) => a + (parseFloat(h.score) || 0), 0) / attempts) : 0;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        set('dash-total-exams', attempts);
        set('prog-total-attempts', attempts);
        set('dash-best-score', best.toFixed(2));
        set('prog-best-score', best.toFixed(2));
        set('dash-avg-accuracy', `${avgAcc.toFixed(1)}%`);
        set('prog-avg-accuracy', `${avgAcc.toFixed(1)}%`);
        set('prog-avg-score', avgScore.toFixed(2));
        set('profile-name', this.authUser
            ? (this.profile?.name || this.authUser.displayName || this.authUser.email || 'Student')
            : 'Guest Student');
        set('profile-email', this.authUser
            ? (this.profile?.email || this.authUser.email || 'Signed in')
            : 'Guest mode • আপনার progress এই device-এ সংরক্ষিত');
        set('profile-seen-count', answered.size);
        set('profile-attempt-count', attempts);
        set('profile-best-score', best.toFixed(2));
        set('profile-accuracy', `${avgAcc.toFixed(1)}%`);

        const coverage = total ? Math.min(100, (answered.size / total) * 100) : 0;
        set('profile-coverage', `${coverage.toFixed(0)}%`);

        const bar = document.getElementById('profile-progress-bar');
        if (bar) bar.style.width = `${coverage}%`;

        const note = document.getElementById('profile-performance-note');
        if (note) note.textContent = attempts
            ? `আপনার গড় Accuracy ${avgAcc.toFixed(1)}% এবং Best Score ${best.toFixed(2)}। ধারাবাহিক practice করলে এই trend আরও উন্নত হবে।`
            : 'এখনও কোনো exam attempt নেই। Practice বা Model Test শুরু করুন—আপনার progress এখানে automatically তৈরি হবে।';

        const tbody = document.getElementById('prog-history-tbody');
        if (tbody) {
            tbody.innerHTML = '';
            history.slice(0, 10).forEach(item => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition';
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

        // NEW: trigger advanced analytics
        this.renderAdvancedAnalytics(history);
    }

    /* ====================================================
     * SMART ANALYTICS
     * ==================================================== */
    renderAdvancedAnalytics(history) {
        if (!Array.isArray(history)) history = [];
        const totalQ = history.reduce((sum, h) => sum + (Number(h.total) || 0), 0);
        const attempts = history.length;

        // Average velocity (seconds per question)
        let velocity = 0;
        if (totalQ > 0) {
            let totalSeconds = 0;
            history.forEach(h => {
                const parts = String(h.timeUsed || '0:00').split(':');
                const mins = parseInt(parts[0] || '0', 10) || 0;
                const secs = parseInt(parts[1] || '0', 10) || 0;
                totalSeconds += mins * 60 + secs;
            });
            velocity = Math.round(totalSeconds / totalQ);
        }

        // Velocity KPI
        const velEl = document.getElementById('analytics-velocity');
        if (velEl) velEl.innerHTML = `${velocity}s<span class="text-base font-bold text-gray-400 ml-1">/প্রশ্ন</span>`;

        // Velocity bar — 36s = good, >72s = critical
        const bar = document.getElementById('analytics-velocity-bar');
        if (bar) {
            const pct = Math.max(0, Math.min(100, (1 - velocity / 72) * 100));
            bar.style.width = pct + '%';
            bar.style.background = velocity <= 36
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : velocity <= 50
                    ? 'linear-gradient(90deg, #f59e0b, #facc15)'
                    : 'linear-gradient(90deg, #ef4444, #f97316)';
        }

        // Velocity note
        const noteEl = document.getElementById('analytics-velocity-note');
        if (noteEl) {
            if (attempts === 0) {
                noteEl.textContent = 'এখনও পর্যাপ্ত ডেটা নেই। একটি মডেল টেস্ট দিয়ে শুরু করুন।';
            } else if (velocity <= 36) {
                noteEl.textContent = `👌 চমৎকার! আপনি মেডিকেল স্ট্যান্ডার্ড (৩৬s) এর মধ্যে আছেন — গড় ${velocity}s/প্রশ্ন।`;
            } else if (velocity <= 50) {
                noteEl.textContent = `⚠️ গতি ${velocity}s — লক্ষ্যের চেয়ে কিছুটা ধীর। speed drill করুন।`;
            } else {
                noteEl.textContent = `🚨 গতি ${velocity}s — মেডিকেল স্ট্যান্ডার্ড ৩৬s এর অনেক উপরে। প্রতি প্রশ্নে কম সময় দিন।`;
            }
        }

        // Total questions solved
        const totEl = document.getElementById('analytics-total-attempts');
        if (totEl) totEl.textContent = String(totalQ);

        // Subject-wise stats
        const subjStats = {};
        history.forEach(h => {
            const s = String(h.subject || 'all').toLowerCase();
            if (s === 'all') return;
            if (!subjStats[s]) subjStats[s] = { correct: 0, total: 0 };
            const tot = Number(h.total) || 0;
            const acc = parseFloat(String(h.accuracy || '0').replace('%', '')) || 0;
            subjStats[s].total += tot;
            subjStats[s].correct += (acc / 100) * tot;
        });

        // Weak topics alert
        const weakEl = document.getElementById('analytics-weak-topics');
        if (weakEl) {
            const weakList = Object.entries(subjStats)
                .map(([subj, st]) => ({
                    subj,
                    acc: st.total ? (st.correct / st.total) * 100 : 0,
                    total: st.total
                }))
                .filter(x => x.total >= 5)
                .sort((a, b) => a.acc - b.acc)
                .slice(0, 4);

            if (!weakList.length) {
                weakEl.innerHTML = '<p class="text-xs italic text-gray-400">পর্যাপ্ত attempt হলে এখানে দুর্বল টপিক দেখানো হবে।</p>';
            } else {
                weakEl.innerHTML = weakList.map(x => {
                    const label = this.localizedSubject(x.subj);
                    const status = x.acc < 50 ? '🚨 দুর্বল' : x.acc < 70 ? '⚠️ উন্নতি দরকার' : '✅ ঠিক আছে';
                    const color = x.acc < 50 ? 'text-red-600 dark:text-red-400' : x.acc < 70 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
                    return `<div class="flex items-center justify-between p-2 rounded-lg bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700">
                        <span class="font-bold text-sm">${this.escapeHtml(label)}</span>
                        <span class="text-xs font-bold ${color}">${x.acc.toFixed(1)}% · ${status}</span>
                    </div>`;
                }).join('');
            }
        }

        // Subject-wise accuracy bars
        const barsEl = document.getElementById('analytics-subject-bars');
        if (barsEl) {
            const subjects = ['biology', 'chemistry', 'physics', 'english', 'gk'];
            const rows = subjects.map(s => {
                const st = subjStats[s] || { correct: 0, total: 0 };
                const acc = st.total ? (st.correct / st.total) * 100 : 0;
                const color = acc < 50 ? 'linear-gradient(90deg,#ef4444,#f97316)'
                    : acc < 70 ? 'linear-gradient(90deg,#f59e0b,#facc15)'
                    : 'linear-gradient(90deg,#10b981,#34d399)';
                const textColor = acc < 50 ? 'text-red-600 dark:text-red-400'
                    : acc < 70 ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400';
                return `<div>
                    <div class="flex justify-between text-xs mb-1">
                        <span class="font-bold">${this.escapeHtml(this.localizedSubject(s))}</span>
                        <span class="font-bold ${textColor}">${acc.toFixed(1)}%</span>
                    </div>
                    <div class="analytics-track"><span style="width:${acc}%;background:${color}"></span></div>
                </div>`;
            }).join('');
            barsEl.innerHTML = rows;
        }
    }

    clearStorageHistory() {
        if (confirm("আপনি কি সমস্ত পরীক্ষার ইতিহাস মুছে ফেলতে চান?")) {
            localStorage.removeItem(this.getHistoryKey());
            this.loadProgressStats();
        }
    }

    /* ====================================================
     * LEADERBOARD
     * ==================================================== */
    getDemoLeaderboardRows() {
        return [
            { uid: 'demo_01', name: 'Rakib Hasan', college: 'Dhaka College', points: 1890, quizzes: 18, correct: 470, answered: 520, accuracy: 90.4, isDemo: true, updatedAtMs: Date.now() - 86400000 },
            { uid: 'demo_02', name: 'Abdullah Shawon', college: 'Dhaka College', points: 1725, quizzes: 16, correct: 438, answered: 500, accuracy: 87.6, isDemo: true, updatedAtMs: Date.now() - 172800000 },
            { uid: 'demo_03', name: 'Tanvir Ahmed', college: 'Notre Dame College', points: 1580, quizzes: 15, correct: 402, answered: 470, accuracy: 85.5, isDemo: true, updatedAtMs: Date.now() - 259200000 },
            { uid: 'demo_04', name: 'Nusrat Jahan', college: 'Holy Cross College', points: 1495, quizzes: 14, correct: 381, answered: 450, accuracy: 84.7, isDemo: true, updatedAtMs: Date.now() - 345600000 },
            { uid: 'demo_05', name: 'Fahim Hasan', college: 'Rajuk Uttara Model College', points: 1360, quizzes: 13, correct: 352, answered: 425, accuracy: 82.8, isDemo: true, updatedAtMs: Date.now() - 432000000 },
            { uid: 'demo_06', name: 'Mahi Islam', college: 'Adamjee Cantonment College', points: 1240, quizzes: 12, correct: 329, answered: 400, accuracy: 82.3, isDemo: true, updatedAtMs: Date.now() - 518400000 },
            { uid: 'demo_07', name: 'Rafiul Karim', college: 'Dhaka City College', points: 1125, quizzes: 11, correct: 300, answered: 375, accuracy: 80.0, isDemo: true, updatedAtMs: Date.now() - 604800000 },
            { uid: 'demo_08', name: 'Jannatul Ferdous', college: 'Cantonment Public School & College', points: 1010, quizzes: 10, correct: 272, answered: 350, accuracy: 77.7, isDemo: true, updatedAtMs: Date.now() - 691200000 }
        ];
    }

    getLocalLeaderboardRows() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.leaderboardLocalKey) || 'null');
            if (Array.isArray(raw) && raw.length) return raw;
        } catch (e) { /* ignore */ }
        const rows = this.getDemoLeaderboardRows();
        this.setLocalLeaderboardRows(rows);
        return rows;
    }

    setLocalLeaderboardRows(rows) {
        const safe = (Array.isArray(rows) ? rows : []).map(x => ({
            ...x,
            points: Number(x.points || 0),
            quizzes: Number(x.quizzes || 0),
            correct: Number(x.correct || 0),
            answered: Number(x.answered || 0),
            accuracy: Number(x.accuracy || 0)
        }));
        localStorage.setItem(this.leaderboardLocalKey, JSON.stringify(safe));
        this.setLeaderboardCache(safe);
        return safe;
    }

    getLeaderboardCache() {
        try { return JSON.parse(localStorage.getItem(this.leaderboardCacheKey) || 'null'); }
        catch { return null; }
    }

    setLeaderboardCache(rows) {
        localStorage.setItem(this.leaderboardCacheKey, JSON.stringify({ savedAt: Date.now(), rows }));
    }

    getLeaderboardSyncQueue() {
        try {
            const q = JSON.parse(localStorage.getItem(this.leaderboardSyncKey) || '[]');
            return Array.isArray(q) ? q : [];
        } catch { return []; }
    }

    setLeaderboardSyncQueue(q) {
        localStorage.setItem(this.leaderboardSyncKey, JSON.stringify(q));
    }

    queueLeaderboardSync(payload) {
        const q = this.getLeaderboardSyncQueue().filter(x => x.uid !== payload.uid);
        q.push(payload);
        this.setLeaderboardSyncQueue(q);
    }

    getLeaderboardRowTime(row) {
        if (!row) return 0;
        if (Number(row.updatedAtMs || 0)) return Number(row.updatedAtMs);
        const stamp = row.updatedAt;
        if (stamp && typeof stamp.toMillis === 'function') return stamp.toMillis();
        if (stamp && Number(stamp.seconds)) return Number(stamp.seconds) * 1000;
        return 0;
    }

    mergeLeaderboardRows(remoteRows = []) {
        const demos = this.getDemoLeaderboardRows();
        const local = this.getLocalLeaderboardRows();
        const map = new Map();
        [...demos, ...local, ...(Array.isArray(remoteRows) ? remoteRows : [])].forEach(row => {
            if (!row?.uid) return;
            const old = map.get(row.uid);
            if (!old || this.getLeaderboardRowTime(row) >= this.getLeaderboardRowTime(old)) {
                map.set(row.uid, { ...old, ...row });
            }
        });
        return [...map.values()].sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
    }

    renderLeaderboardRows(rows) {
        const body = document.getElementById('leaderboard-body');
        if (!body) return;
        const safe = Array.isArray(rows) ? rows : [];
        const podium = document.getElementById('leaderboard-podium');
        const me = document.getElementById('leaderboard-me');
        body.innerHTML = '';
        if (podium) podium.innerHTML = '';
        if (me) { me.innerHTML = ''; me.classList.add('hidden'); }

        if (!safe.length) {
            body.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-sm text-gray-500">এই ফিল্টারে কোনো data নেই।</td></tr>`;
            return;
        }

        const top = safe.slice(0, 3);
        if (podium) {
            podium.innerHTML = top.map((x, i) => `
                <article class="text-center p-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div class="text-2xl">${['🥇', '🥈', '🥉'][i]}</div>
                    <div class="w-10 h-10 mx-auto my-2 rounded-full bg-gradient-to-tr from-medical-600 to-accent-500 grid place-items-center text-white font-bold">${this.escapeHtml((x.name || 'S').charAt(0).toUpperCase())}</div>
                    <strong class="block text-sm">${this.escapeHtml(x.name || 'Student')}</strong>
                    <span class="block text-xs text-medical-600">${Number(x.points || 0)} Points</span>
                    <small class="text-xs text-gray-500">${Number(x.accuracy || 0).toFixed(1)}% Accuracy</small>
                </article>
            `).join('');
        }

        safe.forEach((x, i) => {
            const tr = document.createElement('tr');
            tr.className = this.authUser?.uid === x.uid ? 'bg-medical-50 dark:bg-medical-900/20' : '';
            tr.innerHTML = `
                <td class="py-4 px-3 font-extrabold"><span class="inline-flex w-7 h-7 items-center justify-center rounded-lg ${i < 3 ? 'bg-amber-400 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'} font-bold text-xs">${i + 1}</span></td>
                <td class="py-4 px-3"><div class="flex items-center gap-2"><span class="w-7 h-7 rounded-full bg-gradient-to-tr from-medical-600 to-accent-500 grid place-items-center text-white text-xs font-bold">${this.escapeHtml((x.name || 'S').charAt(0).toUpperCase())}</span><b>${this.escapeHtml(x.name || 'Student')}</b>${this.authUser?.uid === x.uid ? '<em class="text-[10px] text-medical-600 font-bold">YOU</em>' : ''}</div></td>
                <td class="py-4 px-3">${this.escapeHtml(x.college || '—')}</td>
                <td class="py-3 px-3">${x.quizzes || 0}</td>
                <td class="py-3 px-3">${Number(x.accuracy || 0).toFixed(1)}%</td>
                <td class="py-3 px-3 font-extrabold text-medical-600">${Number(x.points || 0)}</td>
            `;
            body.appendChild(tr);
        });

        const mine = this.authUser?.uid ? safe.find(x => x.uid === this.authUser.uid) : null;
        if (me && mine) {
            me.classList.remove('hidden');
            me.innerHTML = `<div class="p-3 rounded-xl bg-medical-50 dark:bg-medical-900/30 border border-medical-200 dark:border-medical-800">
                <span class="text-xs">Your Position: </span><strong class="text-medical-600">#${safe.indexOf(mine) + 1}</strong>
                <span class="text-xs ml-3">${Number(mine.accuracy || 0).toFixed(1)}% accuracy • ${Number(mine.points || 0)} points</span>
            </div>`;
        }
    }

    async recordLeaderboardResult({ correctCount, wrongCount, totalQuestions, quizPoints, accuracy }) {
        const uid = this.authUser?.uid || 'guest_local';
        const name = this.profile?.name || this.authUser?.displayName || this.authUser?.email || 'Guest Student';
        const college = this.profile?.college || '';
        const current = this.getLocalLeaderboardRows().find(x => x.uid === uid)
            || { uid, name, college, points: 0, quizzes: 0, correct: 0, answered: 0 };
        const nextCorrect = Number(current.correct || 0) + Number(correctCount || 0);
        const nextAnswered = Number(current.answered || 0) + Number(correctCount || 0) + Number(wrongCount || 0);
        const updated = {
            ...current,
            name, college,
            points: Number(current.points || 0) + Number(quizPoints || 0),
            quizzes: Number(current.quizzes || 0) + 1,
            correct: nextCorrect,
            answered: nextAnswered,
            accuracy: Number(((nextCorrect / Math.max(1, nextAnswered)) * 100).toFixed(1)),
            updatedAtMs: Date.now(),
            isDemo: false
        };
        const rows = this.getLocalLeaderboardRows().filter(x => x.uid !== uid);
        rows.push(updated);
        const merged = this.mergeLeaderboardRows(rows);
        this.setLocalLeaderboardRows(merged);
        this.renderLeaderboardRows(merged);

        if (!this.authUser || !this.firestore) {
            if (this.authUser) this.queueLeaderboardSync({ ...updated, meta: { correctCount, wrongCount, totalQuestions, quizPoints, accuracy } });
            return;
        }
        await this.syncLeaderboardUser(updated, { correctCount, wrongCount, totalQuestions, quizPoints, accuracy });
    }

    async syncLeaderboardUser(updated, meta = {}) {
        if (!this.authUser || !this.firestore) return false;
        const attemptId = `${this.authUser.uid}_${this.examState.startedAt || Date.now()}`;
        try {
            const attemptRef = doc(this.firestore, 'quizAttempts', attemptId);
            const userLbRef = doc(this.firestore, 'leaderboard', this.authUser.uid);
            await runTransaction(this.firestore, async tx => {
                tx.set(attemptRef, {
                    uid: this.authUser.uid,
                    quizPoints: Number(meta.quizPoints) || 0,
                    correct: Number(meta.correctCount) || 0,
                    wrong: Number(meta.wrongCount) || 0,
                    total: Number(meta.totalQuestions) || 0,
                    accuracy: Number(meta.accuracy) || 0,
                    createdAt: serverTimestamp()
                });
                tx.set(userLbRef, {
                    uid: this.authUser.uid,
                    name: updated.name,
                    college: updated.college,
                    points: updated.points,
                    quizzes: updated.quizzes,
                    correct: updated.correct,
                    answered: updated.answered,
                    accuracy: updated.accuracy,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            });
            this.setLeaderboardSyncQueue(this.getLeaderboardSyncQueue().filter(x => x.uid !== updated.uid));
            return true;
        } catch (e) {
            console.error('Leaderboard write failed', e);
            this.queueLeaderboardSync({ ...updated, meta });
            this.showLeaderboardStatus('Firebase sync হয়নি — local data নিরাপদে সংরক্ষিত আছে।', true);
            return false;
        }
    }

    async syncPendingLeaderboard() {
        if (!this.authUser || !this.firestore) return;
        const pending = this.getLeaderboardSyncQueue().filter(x => x.uid === this.authUser.uid);
        for (const row of pending) {
            await this.syncLeaderboardUser(row, row.meta || {});
        }
    }

    async loadLeaderboard(silent = false) {
        const body = document.getElementById('leaderboard-body');
        if (!body) return;
        const local = this.getLocalLeaderboardRows();
        this.renderLeaderboardRows(local);
        if (!silent) this.showLeaderboardStatus('Local leaderboard দেখানো হচ্ছে; Firebase background sync চলছে…', false);
        if (!this.firestore) {
            if (!silent) this.showLeaderboardStatus('Local leaderboard active — Firebase config পাওয়া যায়নি।', false);
            return;
        }
        try {
            await this.syncPendingLeaderboard();
            const qRef = query(collection(this.firestore, 'leaderboard'), orderBy('points', 'desc'));
            const snap = await getDocs(qRef);
            const remote = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
            const rows = this.mergeLeaderboardRows(remote);
            this.setLocalLeaderboardRows(rows);
            this.renderLeaderboardRows(rows);
            this.showLeaderboardStatus('Leaderboard Firebase থেকে sync হয়েছে এবং local-এ cache করা হয়েছে।', false);
        } catch (e) {
            console.error(e);
            this.showLeaderboardStatus('Previous Year কোশ্চেনে কুইজ দিলে তা এখানে অন্তর্ভুক্ত হবে, তবে সেজন্য অবশ্যই লগইন করে নিতে হবে।', false);
        }
    }

    showLeaderboardStatus(msg, error) {
        const el = document.getElementById('leaderboard-status');
        if (!el) return;
        el.textContent = msg;
        el.className = `mb-4 rounded-xl p-3 text-sm ${error ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`;
    }

    /* ====================================================
     * NEW: LEADERBOARD FILTER
     * ==================================================== */
    filterLeaderboard(criteria, collegeName) {
        this.leaderboardFilter = criteria || 'all';
        this.leaderboardCollege = collegeName || '';

        // Update buttons UI
        document.querySelectorAll('.lb-filter-btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset.lbFilter === criteria);
        });

        // College select
        const collegeSel = document.getElementById('leaderboard-college-select');
        if (collegeSel) {
            if (criteria === 'college') {
                collegeSel.classList.remove('hidden');
                if (collegeSel.options.length <= 1) {
                    const rows = this.getLocalLeaderboardRows();
                    const colleges = [...new Set(rows.map(r => r.college).filter(Boolean))].sort();
                    collegeSel.innerHTML = '<option value="">সব কলেজ</option>' +
                        colleges.map(c => `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`).join('');
                    collegeSel.value = collegeName || '';
                }
            } else {
                collegeSel.classList.add('hidden');
            }
        }

        // Note
        const note = document.getElementById('leaderboard-filter-note');
        if (note) {
            if (criteria === 'weekly') note.textContent = 'শুধু গত ৭ দিনের পয়েন্ট';
            else if (criteria === 'college') note.textContent = collegeName ? `কলেজ: ${collegeName}` : 'সব কলেজ';
            else note.textContent = 'সর্বকালীন পয়েন্ট';
        }

        // Filter rows
        let rows = this.getLocalLeaderboardRows();
        const now = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;

        if (criteria === 'weekly') {
            rows = rows.filter(r => Number(r.updatedAtMs || 0) >= (now - weekMs));
        } else if (criteria === 'college' && collegeName) {
            rows = rows.filter(r => r.college === collegeName);
        }

        this.renderLeaderboardRows(rows);
    }
}

/* ============================================================
 * BOOTSTRAP
 * ============================================================ */
window.app = new MedicalExamApp();

/* ============================================================
 * GLOBAL HELPERS (used by student-ai.js / external scripts)
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

window.handleSubmit = async function () {
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const email = emailInput ? emailInput.value.trim() : '';
    const pass = passwordInput ? passwordInput.value : '';
    if (!email) { alert('* Please enter your email address'); return; }
    if (!pass) { alert('Please enter your password.'); return; }
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        alert('Login Successful!');
        window.location.href = "https://serakib.github.io/Medical-Admission-Tracker/";
    } catch (error) {
        alert('Error: ' + error.message);
    }
};

/* Firestore-side auth state listener is already handled inside initAuth().
 * The following global listener also updates any `.auth-btn-target` element
 * to be safe if someone injects auth UI dynamically.
 */
onAuthStateChanged(auth, (user) => {
    document.querySelectorAll('.auth-btn-target').forEach(container => {
        if (user) {
            container.innerHTML = `
                <button onclick="window.handleLogout && window.handleLogout()" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-red-400 bg-red-500/10 border border-red-500/40 rounded-lg hover:bg-red-500/20 transition-all outline-none cursor-pointer">
                    <i class="fa-solid fa-right-from-bracket"></i>
                    <span>লগআউট</span>
                </button>`;
        } else {
            container.innerHTML = `
                <button onclick="window.redirectToLogin && window.redirectToLogin()" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-emerald-400 bg-transparent border border-emerald-500/40 rounded-lg hover:bg-emerald-500/10 transition-all outline-none cursor-pointer">
                    <i class="fa-solid fa-right-to-bracket"></i>
                    <span>Login / Sign up</span>
                </button>`;
        }
    });
});

/* Mark module loaded */
console.log('[MedicalExamApp] engine loaded.');
