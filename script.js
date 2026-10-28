/* Medical Admission Tester - application engine
 * Questions are loaded from ./questions.json at runtime.
 * Firebase configuration/auth remains external and is never hard-coded here.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    deleteUser,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase Configuration & Initialization (firebaseApp নাম ব্যবহার করা হয়েছে ডুপ্লিকেট এড়াতে)[cite: 1]
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

let QUESTION_BANK = [];

class MedicalExamApp {
    constructor() {
        this.views = ['home', 'question-bank', 'practice', 'exam-intro', 'previous', 'setup', 'exam', 'result', 'review', 'profile', 'account', 'leaderboard', 'student-profile', 'syllabus', 'medical-hsc-info'];
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
        this.leaderboardCacheKey = 'med_sheet_leaderboard_cache_v1';
        this.leaderboardLocalKey = 'med_sheet_leaderboard_cache_v1';
        this.leaderboardSyncKey = 'med_sheet_exam_pending_v1';
        this.firestore = db;
        this.profile = null;
        
        // Exam Setup Options
        this.setup = {
            mode: 'model', // 'random', 'model', 'previous'
            subject: 'all',
            questionsCount: 30,
            durationMins: 30
        };

        // Active Exam State
        this.examState = {
            questions: [],
            userAnswers: [], // Array of selected option indices (or null)
            markedForReview: [], // Array of booleans
            currentIndex: 0,
            timerSeconds: 0,
            timerInterval: null,
            timeUsedSeconds: 0,
            submitted: false
        };

        this.questionBank = [];
        this.questionsLoaded = false;
        this.authUser = null;
        this.auth = auth;
        this.authMode = 'login';
        this.authReady = false;
        this.authStateResolved = false;
        this.__medicalRegistrationInProgress = false;
        this.examActive = false;
        this.beforeUnloadHandler = (event) => { if (this.examActive && !this.examState.submitted) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        window.addEventListener('popstate', () => { if (this.examActive && !this.examState.submitted) { history.pushState({ exam: true }, '', window.location.href); this.confirmSubmitExam('navigation'); } });

        this.init();
    }

    async init() {
        this.applyTheme();
        this.initButtonFeedback();
        this.applyLanguage();
        history.replaceState({ app: true }, '', window.location.href);
        this.showView('home');
        this.setDataStatus('loading');

        this.initAuth();

        let loadError = null;
        try {
            await this.loadQuestionBank();
        } catch (error) {
            loadError = error;
            console.error('Question bank loading failed:', error);
        }

        // A secondary UI/rendering error must never prevent the loading status from
        // being replaced with a ready/error message.
        let uiError = null;
        const safeRun = (label, callback) => {
            try {
                callback();
            } catch (error) {
                console.error(`Question bank initialization: ${label} failed:`, error);
                if (!uiError) uiError = error;
            }
        };

        safeRun('subject counts', () => this.updateSubjectCountsUI());
        safeRun('exam setup', () => this.updateSetupUI());
        safeRun('progress stats', () => this.loadProgressStats());
        safeRun('practice browser', () => this.renderPracticeBrowser());

        if (loadError) {
            this.setDataStatus('error', loadError.message || 'questions.json লোড করা যায়নি।');
        } else if (uiError) {
            this.setDataStatus('error', 'প্রশ্নগুলো লোড হয়েছে, কিন্তু পেজের কিছু অংশ দেখাতে সমস্যা হয়েছে। Console error পরীক্ষা করুন।');
        } else {
            this.setDataStatus('ready');
        }

        // Leaderboard syncing is non-critical and must not block the question-bank status.
        safeRun('leaderboard', () => this.loadLeaderboard(true));
    }

    setDataStatus(state, message = '') {
        const el = document.getElementById('question-data-status');
        if (!el) return;
        el.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-xs';
        if (this.__dataStatusHideTimer) {
            clearTimeout(this.__dataStatusHideTimer);
            this.__dataStatusHideTimer = null;
        }
        el.className = 'question-data-status-banner';
        const refreshButton = '<button type="button" class="question-data-refresh-btn" onclick="window.app.refreshQuestionBank()" aria-label="সর্বশেষ প্রশ্ন, উত্তর ও ব্যাখ্যা রিফ্রেশ করুন"><i class="fa-solid fa-rotate"></i><span>Refresh Questions</span></button>';
        if (state === 'ready') {
            el.classList.add('is-success');
            el.innerHTML = '<span class="question-data-status-icon"><i class="fa-solid fa-circle-check"></i></span><span><strong>প্রশ্ন সফলভাবে লোড হয়েছে!</strong><small>সর্বশেষ প্রশ্ন, উত্তর ও ব্যাখ্যা আপডেট হয়েছে</small></span><span class="question-data-status-check"><i class="fa-solid fa-check"></i></span>';
            el.classList.remove('hidden');
            this.__dataStatusHideTimer = setTimeout(() => {
                el.classList.add('is-leaving');
                setTimeout(() => { el.classList.add('hidden'); el.classList.remove('is-leaving'); }, 260);
            }, 1800);
            return;
        }
        el.classList.remove('hidden', 'is-leaving');
        if (state === 'loading') {
            el.classList.add('is-loading');
            el.innerHTML = '<span class="question-data-status-icon"><i class="fa-solid fa-arrows-rotate question-loading-spin"></i></span><span><strong>প্রশ্ন লোড হচ্ছে...</strong><small>সর্বশেষ প্রশ্ন, উত্তর ও ব্যাখ্যা আনা হচ্ছে</small></span><span class="question-loading-dots"><i></i><i></i><i></i></span>';
        } else {
            el.classList.add('is-error');
            el.innerHTML = `<span class="question-data-status-icon"><i class="fa-solid fa-triangle-exclamation"></i></span><span><strong>প্রশ্ন লোড করা যায়নি</strong><small>${this.escapeHtml(message || 'প্রশ্ন ব্যাংক লোড করা যায়নি।')}</small></span>`;
        }
    }

    showDataError(message) {
        this.setDataStatus('error', message);
    }

    async refreshQuestionBank() {
        if (this.__questionRefreshInProgress) return;
        this.__questionRefreshInProgress = true;
        const button = document.querySelector('.question-data-refresh-btn');
        if (button) {
            button.disabled = true;
            button.classList.add('is-refreshing');
            button.innerHTML = '<i class="fa-solid fa-rotate question-loading-spin"></i><span>Loading...</span>';
        }
        this.setDataStatus('loading');
        try {
            await this.loadQuestionBank();
            this.updateSubjectCountsUI();
            this.updateSetupUI();
            this.renderPracticeBrowser();
            if (typeof this.renderQuestionBank === 'function') this.renderQuestionBank();
            this.setDataStatus('ready');
        } catch (error) {
            console.error('Question bank refresh failed:', error);
            this.setDataStatus('error', error.message || 'সর্বশেষ প্রশ্ন লোড করা যায়নি।');
        } finally {
            this.__questionRefreshInProgress = false;
            const currentButton = document.querySelector('.question-data-refresh-btn');
            if (currentButton) {
                currentButton.disabled = false;
                currentButton.classList.remove('is-refreshing');
                currentButton.innerHTML = '<i class="fa-solid fa-rotate"></i><span>Refresh Questions</span>';
            }
        }
    }

    async loadQuestionBank() {
        const cacheBuster = `?v=${Date.now()}`;
        const controller = new AbortController();
        // Keep the timeout active through response.json(); fetch() alone only covers
        // receiving the response headers, not necessarily reading the response body.
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(`./questions.json${cacheBuster}`, {
                cache: 'no-store',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`questions.json (${response.status})`);
            }

            const raw = await response.json();
            if (!Array.isArray(raw)) {
                throw new Error('questions.json-এ একটি JSON array থাকতে হবে।');
            }

            const normalized = raw.map((q, index) => this.normalizeQuestion(q, index))
                .filter(Boolean);

            if (!normalized.length) {
                throw new Error('questions.json-এ কোনো বৈধ প্রশ্ন পাওয়া যায়নি।');
            }

            this.questionBank = normalized;
            this.questionsLoaded = true;
            this.populateYearFilter();
        } catch (error) {
            if (controller.signal.aborted) {
                throw new Error('প্রশ্ন ব্যাংক লোড হতে ১৫ সেকেন্ডের বেশি সময় লাগছে। সংযোগ বা questions.json-এর response body পরীক্ষা করতে হবে।');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    normalizeQuestion(q, index) {
        if (!q || typeof q !== 'object') return null;

        const rawOptions = Array.isArray(q.options)
            ? q.options
            : ['A', 'B', 'C', 'D'].map(k => q.options && q.options[k]);

        const options = rawOptions.map(v => String(v ?? '').trim());
        if (options.length !== 4 || options.some(v => !v)) {
            return null;
        }

        const rawAnswer = q.correctAnswer ?? q.answer;
        let answer = -1;

        if (Number.isInteger(rawAnswer)) {
            answer = rawAnswer;
        } else {
            const value = String(rawAnswer ?? '').trim();
            if (/^[ABCD]$/i.test(value)) {
                answer = 'ABCD'.indexOf(value.toUpperCase());
            } else if (/^[0-3]$/.test(value)) {
                answer = Number(value);
            } else {
                const found = options.findIndex(opt => opt === value);
                if (found >= 0) answer = found;
            }
        }

        if (answer < 0 || answer > 3) return null;

        const questionText = String(q.question ?? q.questionText ?? '').trim();
        if (!questionText) return null;

        const source = String(q.source || 'Model Test').trim();
        const year = q.year === null || q.year === undefined || q.year === '' ? null : String(q.year).trim();

        const rawSubject = String(q.subject || 'general').trim().toLowerCase();
        const subjectAliases = {
            'biology - zoology': 'biology',
            'biology - botany': 'biology',
            'chemistry 1st paper': 'chemistry',
            'chemistry 2nd paper': 'chemistry',
            'physics 1st paper': 'physics',
            'physics 2nd paper': 'physics',
            'general knowledge': 'gk',
            'general knowledge / current affairs': 'gk'
        };
        const subject = subjectAliases[rawSubject] || rawSubject;

        return {
            id: String(q.id || q.questionId || `question_${index + 1}`),
            subject,
            difficulty: String(q.difficulty || 'medium').toLowerCase().trim(),
            source,
            year,
            question: questionText,
            question_bn: String(q.question_bn || '').trim() || null,
            question_en: String(q.question_en || '').trim() || null,
            options,
            options_bn: Array.isArray(q.options_bn) ? q.options_bn.map(v=>String(v??'').trim()) : null,
            options_en: Array.isArray(q.options_en) ? q.options_en.map(v=>String(v??'').trim()) : null,
            answer,
            correctAnswer: 'ABCD'[answer],
            explanation: String(q.explanation || '').trim(),
            explanation_bn: String(q.explanation_bn || '').trim() || null,
            explanation_en: String(q.explanation_en || '').trim() || null,
            isPreviousYear: Boolean(year) && !/^practice$/i.test(year) || /previous\s*year|বিগত|past\s*year|verified previous/i.test(source)
        };
    }

    populateQuestionBankYearFilter(){
        const select=document.getElementById('question-bank-year'); if(!select)return;
        const years=[...new Set(this.questionBank.map(q=>q.year).filter(y=>y && !/^practice$/i.test(y)))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
        select.innerHTML=`<option value="all">${this.t('All Years','সব বছর')}</option>`+years.map(y=>`<option value="${this.escapeHtml(y)}">${this.escapeHtml(y)}</option>`).join('');
    }

    populateYearFilter() {
        const select = document.getElementById('setup-year');
        if (!select) return;
        const years = [...new Set(this.questionBank.map(q => q.year).filter(y => y && !/^practice$/i.test(y)))]
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        const previous = select.value;
        select.innerHTML = '<option value="all">সব বছর (All Years)</option>';
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });
        select.value = years.includes(previous) ? previous : 'all';
    }

    getHistoryKey() {
        return this.authUser?.uid ? `med_history_${this.authUser.uid}` : 'med_history';
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[ch]));
    }

    initAuth() {
        try {
            setPersistence(this.auth, browserLocalPersistence).catch(err => {
                console.warn('Firebase persistence could not be set:', err);
            });

            onAuthStateChanged(this.auth, async user => {
                this.authStateResolved = false;
                this.setAuthState(user);
                if (user) await this.loadUserProfile();
                this.authStateResolved = true;
                try { window.dispatchEvent(new CustomEvent('student-auth-state-resolved', { detail: { user: user || null } })); } catch (_) {}
            });
            this.authReady = true;
        } catch (error) {
            console.error('Firebase initialization error:', error);
            this.setAuthState(null, 'Firebase authentication failed. You can continue as Guest.');
        }
    }

    setAuthState(user, notice = '') {
        this.authUser = user || null;
        const button = document.getElementById('authStatusBtn');
        const icon = document.getElementById('authStatusIcon');
        const label = document.getElementById('authStatusLabel');

        if (button && label) {
            if (user) {
                label.textContent = user.displayName || user.email || 'Account';
                button.title = user.email || 'Logged in';
                if (icon) icon.className = 'fa-solid fa-user-check ml-1';
            } else {
                label.textContent = 'লগইন';
                button.title = 'লগইন / রেজিস্টার';
                if (icon) icon.className = 'fa-solid fa-user ml-1';
            }
        }

        const authNotice = document.getElementById('authNotice');
        if (authNotice) {
            if (notice) {
                authNotice.textContent = notice;
                authNotice.classList.remove('hidden');
            } else {
                authNotice.classList.add('hidden');
            }
        }

        const accountEmail = document.getElementById('auth-account-email');
        if (accountEmail) accountEmail.textContent = user?.email || user?.displayName || 'Guest';
        this.renderAccountProfile();

        this.loadProgressStats();
        // The Medical Sheets API adapter loads the authoritative leaderboard after auth resolves.
    }

    openAuthModal(mode = this.authUser ? 'account' : 'login') {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        const msg = document.getElementById('authMessage');
        if (msg) msg.textContent = '';
        this.setAuthMode(mode);
    }

    closeAuthModal() {
        document.getElementById('authModal')?.classList.add('hidden');
    }

    setAuthMode(mode) {
        this.authMode = mode;
        const loginTab = document.getElementById('auth-tab-login');
        const registerTab = document.getElementById('auth-tab-register');
        const nameWrap = document.getElementById('auth-name-wrap');
        const registerFields = document.getElementById('auth-register-fields');
        const submit = document.getElementById('auth-submit');
        const title = document.getElementById('auth-modal-title');
        const form = document.getElementById('auth-form');

        if (mode === 'account') {
            document.getElementById('auth-form')?.classList.add('hidden');
            document.getElementById('auth-account')?.classList.remove('hidden');
            document.getElementById('auth-email')?.setAttribute('disabled', 'disabled');
            return;
        }

        document.getElementById('auth-account')?.classList.add('hidden');
        form?.classList.remove('hidden');
        document.getElementById('auth-email')?.removeAttribute('disabled');

        const isRegister = mode === 'register';
        if (loginTab) loginTab.className = isRegister
            ? 'flex-1 py-2 text-sm font-semibold text-gray-500 hover:text-medical-600'
            : 'flex-1 py-2 text-sm font-semibold text-medical-700 border-b-2 border-medical-600';
        if (registerTab) registerTab.className = isRegister
            ? 'flex-1 py-2 text-sm font-semibold text-medical-700 border-b-2 border-medical-600'
            : 'flex-1 py-2 text-sm font-semibold text-gray-500 hover:text-medical-600';
        if (nameWrap) nameWrap.classList.toggle('hidden', true);
        if (registerFields) registerFields.classList.toggle('hidden', !isRegister);
        if (submit) submit.textContent = isRegister ? 'রেজিস্টার করুন' : 'লগইন করুন';
        if (title) title.textContent = isRegister ? 'নতুন অ্যাকাউন্ট তৈরি করুন' : 'অ্যাকাউন্টে লগইন করুন';
    }

    async handleAuthSubmit(event) {
        event.preventDefault();
        const isRegister = this.authMode === 'register';
        if (!isRegister && !window.confirm('আপনি কি লগইন করতে চান?')) return;
        const message = document.getElementById('authMessage');
        const email = document.getElementById('auth-email')?.value.trim();
        const password = document.getElementById('auth-password')?.value;
        const name = document.getElementById('auth-name')?.value.trim();
        const college = document.getElementById('auth-college')?.value.trim();
        const mobile = document.getElementById('auth-mobile')?.value.trim();
        const studentClass = document.getElementById('auth-class')?.value.trim();
        const bloodGroup = document.getElementById('auth-blood')?.value;

        if (!this.auth) {
            if (message) message.textContent = 'Firebase Authentication কনফিগার করা নেই। Guest mode ব্যবহার করতে পারেন।';
            return;
        }
        if (!email || !password || password.length < 6) {
            if (message) message.textContent = 'সঠিক ইমেইল দিন এবং অন্তত ৬ অক্ষরের পাসওয়ার্ড ব্যবহার করুন।';
            return;
        }

        this.__medicalRegistrationInProgress = isRegister;
        try {
            if (message) message.textContent = 'অনুগ্রহ করে অপেক্ষা করুন...';
            let result;
            if (isRegister) {
                result = await createUserWithEmailAndPassword(this.auth, email, password);
                if (name && result.user) await updateProfile(result.user, { displayName: name });
                this.profile = Object.assign({}, this.profile || {}, {
                    uid: result.user.uid, name: name || result.user.displayName || '',
                    email: email, college: college || '', batch: studentClass || '',
                    class: studentClass || '', mobile: mobile || '', bloodGroup: bloodGroup || ''
                });
                if (this.firestore && result.user) {
                    await setDoc(doc(this.firestore, 'students', result.user.uid), {
                        uid: result.user.uid, name: name || '', college: college || '', mobile: mobile || '',
                        email: email, class: studentClass || '', batch: studentClass || '', bloodGroup: bloodGroup || '',
                        updatedAt: serverTimestamp(), createdAt: serverTimestamp()
                    }, { merge: true });
                }
            } else {
                result = await signInWithEmailAndPassword(this.auth, email, password);
                this.profile = { uid: result.user.uid, name: result.user.displayName || email.split('@')[0], email: email };
            }
            this.closeAuthModal();
            this.setAuthState(result.user);

            // A new account is recorded by the dedicated Medical Sheets API.
            // It sends a Telegram alert once per registered account; normal login is not a notification.
            if (isRegister && window.MedGlobalLeague && typeof window.MedGlobalLeague.registerUser === 'function') {
                try {
                    await window.MedGlobalLeague.registerUser({
                        name: name || result.user.displayName || email.split('@')[0],
                        college: college || '',
                        batch: studentClass || '',
                        avatar: ''
                    });
                    if (message) message.textContent = 'অ্যাকাউন্ট তৈরি হয়েছে এবং Medical profile সংরক্ষিত হয়েছে।';
                } catch (apiError) {
                    console.warn('[Medical API] Registration profile will retry after auth resolves:', apiError);
                    if (message) message.textContent = 'অ্যাকাউন্ট তৈরি হয়েছে; Medical profile sync আবার চেষ্টা করা হবে।';
                }
            }
        } catch (error) {
            console.error('Authentication error:', error);
            if (message) message.textContent = this.friendlyAuthError(error);
        } finally {
            this.__medicalRegistrationInProgress = false;
            if (this.authUser) {
                this.authStateResolved = true;
                try { window.dispatchEvent(new CustomEvent('student-auth-state-resolved', { detail: { user: this.authUser } })); } catch (_) {}
            }
        }
    }

    async logout() {
        // Route every app/sidebar logout through the same visible confirmation dialog.
        // The dialog itself calls signOut(auth) only after the user confirms.
        if (typeof window.handleLogout === 'function') {
            window.handleLogout();
            return;
        }

        // Safe fallback only if the global confirmation handler has not loaded.
        if (!window.confirm('আপনি কি সত্যিই আপনার অ্যাকাউন্ট থেকে লগআউট করতে চান?')) return;
        try {
            if (this.auth) await signOut(this.auth);
            this.closeAuthModal();
            window.location.reload();
        } catch (error) {
            console.error('Logout error:', error);
            const message = document.getElementById('authMessage');
            if (message) message.textContent = this.friendlyAuthError(error);
        }
    }

    continueAsGuest() {
        this.authUser = null;
        localStorage.setItem('med_guest_mode', 'true');
        this.authStateResolved = true;
        this.closeAuthModal();
        this.setAuthState(null);
        try { window.dispatchEvent(new CustomEvent('student-auth-state-resolved', { detail: { user: null } })); } catch (_) {}
    }

    friendlyAuthError(error) {
        const code = error?.code || '';
        const map = {
            'auth/invalid-email': 'ইমেইল ঠিকানাটি সঠিক নয়।',
            'auth/user-not-found': 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।',
            'auth/wrong-password': 'পাসওয়ার্ড সঠিক নয়।',
            'auth/email-already-in-use': 'এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে।',
            'auth/weak-password': 'পাসওয়ার্ড আরও শক্তিশালী করুন (কমপক্ষে ৬ অক্ষর)।',
            'auth/too-many-requests': 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
            'auth/network-request-failed': 'নেটওয়ার্ক সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করুন।'
        };
        return map[code] || error?.message || 'Authentication ব্যর্থ হয়েছে।';
    }

    t(en, bn) { return bn ?? en; }
    applyLanguage() {
        document.documentElement.lang = 'bn';
        document.body.classList.remove('lang-en');
    }
    localizedSubject(subject) { const m={biology:'Biology',chemistry:'Chemistry',physics:'Physics',english:'English',gk:'General Knowledge'}; return m[subject]||subject; }
    localizedSource(source) { if(/previous|verified/i.test(source)) return 'Previous Year'; if(/model/i.test(source)) return 'Model Test'; return source; }
    getLocalizedQuestionText(q) { return q.question; }
    getLocalizedOption(q,i) { const key='ABCD'[i]; return Array.isArray(q.options) ? (q.options[i]||'') : (q.options?.[key]||''); }

    renderQuestionIfCurrent(idx){ if(this.examState.currentIndex===idx && this.examActive) this.renderQuestion(); else if(!document.getElementById('view-previous')?.classList.contains('hidden')) this.renderPreviousQuestions(); }

    showPreviousYears() { this.showView('previous'); this.renderPreviousYearList(); }
    renderPreviousYearList() {
        const years=[...new Set(this.questionBank.filter(q=>q.year && q.isPreviousYear).map(q=>q.year))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
        const el=document.getElementById('previous-year-list'); if(!el) return;
        el.innerHTML=years.map(y=>`<button onclick="app.selectPreviousYear('${this.escapeHtml(y).replace(/'/g,"\\'")}')" class="p-4 text-right rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-medical-500 shadow-sm"><div class="text-xs text-gray-500">Previous Year</div><div class="text-xl font-extrabold text-gray-900 dark:text-white mt-1">${this.escapeHtml(y)}</div><div class="text-xs text-medical-600 mt-1">${this.questionBank.filter(q=>q.year===y&&q.isPreviousYear).length} questions</div></button>`).join('');
    }
    selectPreviousYear(year) { this.previousSelectedYear=year; this.previousShowAnswers=false; document.getElementById('previous-browser')?.classList.remove('hidden'); this.renderPreviousQuestions(); }
    togglePreviousAnswers(){ this.previousShowAnswers=!this.previousShowAnswers; this.renderPreviousQuestions(); }
    renderPreviousQuestions(){
        if(!this.previousSelectedYear) return; const qs=this.questionBank.filter(q=>q.year===this.previousSelectedYear&&q.isPreviousYear); document.getElementById('previous-selected-year').textContent=this.t(`Previous Year ${this.previousSelectedYear}`,`বিগত বছর ${this.previousSelectedYear}`); document.getElementById('previous-count').textContent=this.t(`${qs.length} questions — read-only mode`,`${qs.length}টি প্রশ্ন — শুধু দেখার জন্য`); document.getElementById('previous-answer-toggle').textContent=this.previousShowAnswers?this.t('Hide Answers','উত্তর লুকান'):this.t('Show Answers','উত্তর দেখুন');
        const box=document.getElementById('previous-question-list'); box.innerHTML=''; qs.forEach((q,i)=>{ const card=document.createElement('article'); card.className='bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700'; const opts=q.options.map((o,j)=>`<div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm"><b>${'ABCD'[j]}.</b> ${this.escapeHtml(this.getLocalizedOption(q,j))}</div>`).join(''); card.innerHTML=`<div class="flex justify-between gap-3 mb-3"><span class="text-xs font-bold text-medical-600">${this.escapeHtml(q.subject)}</span><span class="text-xs text-gray-500">${this.escapeHtml(q.year)} • ${this.t('Previous Year','পূর্ববর্তী বছর')}</span></div><h3 class="font-bold text-gray-900 dark:text-white leading-relaxed">${i+1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h3><div class="grid gap-2 mt-4">${opts}</div>${this.previousShowAnswers?`<div class="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-300"><b>${this.t('Correct Answer','সঠিক উত্তর')}:</b> ${q.correctAnswer}<br>${this.escapeHtml(q.explanation||'')}</div>`:''}`; box.appendChild(card); });
    }
    startPreviousYearQuiz(){ if(!this.previousSelectedYear) return; this.setup.mode='previousQuiz'; this.setup.subject='all'; this.setup.questionsCount=this.questionBank.filter(q=>q.year===this.previousSelectedYear&&q.isPreviousYear).length; this.setup.durationMins=Math.max(1,Math.ceil(this.setup.questionsCount*0.6)); const ss=document.getElementById('setup-subject'); if(ss) ss.value='all'; const ys=document.getElementById('setup-year'); if(ys) ys.value=this.previousSelectedYear; this.prepareExamFromSetup(); }

    async loadUserProfile(){
        if (!this.firestore || !this.authUser) return null;
        try {
            const snap = await getDoc(doc(this.firestore, 'students', this.authUser.uid));
            this.profile = snap.exists()
                ? snap.data()
                : { name: this.authUser.displayName || '', email: this.authUser.email || '' };
            this.loadProgressStats();
            try { window.dispatchEvent(new CustomEvent('student-profile-loaded', { detail: { uid: this.authUser.uid } })); } catch (_) {}
            return this.profile;
        } catch (e) {
            console.warn('Profile load failed', e);
            return null;
        }
    }

    async syncFirebaseStudentProfile(fields = {}) {
        if (!this.authUser) return false;
        const safeFields = {};
        ['name', 'college', 'batch', 'class', 'mobile', 'bloodGroup', 'avatar'].forEach(key => {
            if (Object.prototype.hasOwnProperty.call(fields, key)) safeFields[key] = fields[key];
        });
        if (safeFields.name) {
            try { await updateProfile(this.authUser, { displayName: String(safeFields.name).slice(0, 80) }); }
            catch (error) { console.warn('Firebase display name sync failed:', error); }
        }
        if (this.firestore) {
            try {
                await setDoc(doc(this.firestore, 'students', this.authUser.uid), {
                    uid: this.authUser.uid,
                    email: this.authUser.email || '',
                    ...safeFields,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.warn('Firebase student profile sync failed:', error);
            }
        }
        this.profile = Object.assign({}, this.profile || {}, safeFields, {
            uid: this.authUser.uid,
            email: this.authUser.email || (this.profile && this.profile.email) || ''
        });
        this.renderAccountProfile();
        return true;
    }

    getDemoLeaderboardRows(){ return []; }
    getLocalLeaderboardRows(){
        if(window.MedGlobalLeague && typeof window.MedGlobalLeague.getCachedRows === 'function') return window.MedGlobalLeague.getCachedRows();
        return [];
    }
    setLocalLeaderboardRows(rows){
        if(window.MedGlobalLeague && typeof window.MedGlobalLeague.saveCache === 'function') return window.MedGlobalLeague.saveCache(rows);
        return Array.isArray(rows) ? rows.filter(x => x && !x.isDemo) : [];
    }
    getLeaderboardCache(){ return null; }
    setLeaderboardCache(){ return false; }
    getLeaderboardSyncQueue(){ return []; }
    setLeaderboardSyncQueue(){ return false; }
    queueLeaderboardSync(){ return false; }
    getLeaderboardRowTime(row){ return Number(row && row.updatedAtMs || 0); }
    mergeLeaderboardRows(remoteRows=[]){
        return (Array.isArray(remoteRows) ? remoteRows : []).filter(row => row && !row.isDemo)
            .slice().sort((a,b) => Number(b.rankPoints ?? b.points ?? 0) - Number(a.rankPoints ?? a.points ?? 0));
    }
    renderLeaderboardRows(rows){
        const body=document.getElementById('leaderboard-body'); if(!body)return;
        const safe=(Array.isArray(rows)?rows:[]).slice().sort((a,b)=>Number(b.points||0)-Number(a.points||0));
        this.updateProfileRanks(safe);
        const podium=document.getElementById('leaderboard-podium');
        const me=document.getElementById('leaderboard-me');
        body.innerHTML='';
        if(podium) podium.innerHTML='';
        if(me){ me.innerHTML=''; me.classList.add('hidden'); }
        if(!safe.length){ body.innerHTML=`<tr><td colspan="5" class="py-12 text-center text-sm text-gray-500">এখনও কোনো leaderboard data নেই। Challenge Quiz সম্পন্ন করলে এখানে দেখা যাবে।</td></tr>`; return; }
        const top=safe.slice(0,3);
        if(podium){
            podium.innerHTML=top.map((x,i)=>`<article class="podium-card podium-${i+1}" data-uid="${this.escapeHtml(x.uid||'')}"><div class="podium-medal">${['🥇','🥈','🥉'][i]}</div><div class="podium-avatar">${this.escapeHtml((x.name||'S').charAt(0).toUpperCase())}</div><strong>${this.escapeHtml(x.name||'Student')}</strong><span>${Number(x.points||0)} Points</span><small>${Number(x.accuracy||0).toFixed(1)}% Accuracy</small></article>`).join('');
        }
        safe.forEach((x,i)=>{
            const tr=document.createElement('tr');
            tr.className=`leader-row ${this.authUser?.uid===x.uid?'is-me':''}`;
            tr.dataset.uid = String(x.uid || '');
            tr.innerHTML=`<td class="py-4 px-3"><div class="leader-person"><span class="leader-avatar">${this.escapeHtml((x.name||'S').charAt(0).toUpperCase())}</span><span><b>${this.escapeHtml(x.name||'Student')}</b>${this.authUser?.uid===x.uid?'<em>YOU</em>':''}</span></div></td><td class="py-4 px-3">${this.escapeHtml(x.college||'—')}</td><td class="py-4 px-3">${x.quizzes||0}</td><td class="py-4 px-3">${Number(x.accuracy||0).toFixed(1)}%</td><td class="leader-rank-points py-4 px-3"><strong class="leader-rank-number">${i+1}</strong><small class="leader-points-label">${Number(x.points||0)} Points</small></td>`;
            body.appendChild(tr);
        });
        const mine=this.authUser?.uid ? safe.find(x=>x.uid===this.authUser.uid) : null;
        if(me && mine){ me.classList.remove('hidden'); me.innerHTML=`<div><span>Your Position</span><strong>#${safe.indexOf(mine)+1}</strong></div><div><b>${this.escapeHtml(mine.name||'Student')}</b><small>${Number(mine.accuracy||0).toFixed(1)}% accuracy • ${Number(mine.points||0)} points</small></div>`; }
    }
    updateProfileRanks(rows=[]) {
        const liveEl=document.getElementById('profile-live-rank');
        const bestEl=document.getElementById('profile-best-rank');
        const uid=this.authUser?.uid||'guest_local';
        const safe=(Array.isArray(rows)?rows:[]).slice().sort((a,b)=>Number(b.rankPoints??b.points??0)-Number(a.rankPoints??a.points??0));
        const index=safe.findIndex(row=>row.uid===uid);
        if(liveEl)liveEl.textContent=index>=0?'#'+(index+1):'—';
        if(bestEl)bestEl.textContent=index>=0?'#'+(index+1):'—';
        const mine=safe.find(row=>row.uid===uid);
        const points=Math.max(0,Number(mine?.rankPoints??mine?.points??0));
        const progress=Math.max(0,Math.min(100,Math.round((points%150)/150*100)));
        const bar=document.querySelector('.league-progress span');
        const track=document.querySelector('.league-progress[role="progressbar"]');
        if(bar)bar.style.width=progress+'%';
        if(track)track.setAttribute('aria-valuenow',String(progress));
    }

    async recordLeaderboardResult(meta={}){
        if(window.MedGlobalLeague && typeof window.MedGlobalLeague.recordLeaderboardResult === 'function') {
            return window.MedGlobalLeague.recordLeaderboardResult(meta);
        }
        this.showLeaderboardStatus('Global leaderboard adapter loading — result not sent yet.', true);
        return false;
    }
    async syncLeaderboardUser(){ return false; }
    async syncPendingLeaderboard(){
        if(window.MedGlobalLeague && typeof window.MedGlobalLeague.flushPending === 'function') return window.MedGlobalLeague.flushPending();
        return false;
    }
    async loadLeaderboard(silent=false){
        if(window.MedGlobalLeague && typeof window.MedGlobalLeague.loadLeaderboard === 'function') return window.MedGlobalLeague.loadLeaderboard(silent);
        return false;
    }
        showLeaderboardStatus(msg,error){const el=document.getElementById('leaderboard-status');if(!el)return;el.textContent=msg;el.className=`mb-4 rounded-xl p-3 text-sm ${error?'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300':'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`;}

    // Question Bank + Practice
    openQuestionBank(mode='view'){ this.bankMode=mode; this.bankSearch=''; this.bankSubject='all'; this.bankYear='all'; this.showView(mode==='practice'?'practice':'question-bank'); if(mode==='practice') this.startPractice(); else this.refreshQuestionBank(); }
    getFilteredBank(){
        let qs=[...this.questionBank];
        if(this.bankSubject!=='all')qs=qs.filter(q=>q.subject===this.bankSubject);
        if(this.bankYear!=='all')qs=qs.filter(q=>q.year===this.bankYear);
        if(this.bankSearch.trim()){const s=this.bankSearch.trim().toLowerCase();qs=qs.filter(q=>[q.question,q.question_bn,q.question_en,q.source,q.subject,q.year].join(' ').toLowerCase().includes(s));}
        return qs;
    }
    renderQuestionBank(){
        const list=document.getElementById('question-bank-list'); if(!list)return; const qs=this.getFilteredBank();
        const count=document.getElementById('question-bank-count'); if(count)count.textContent=this.t(`${qs.length} questions`,`মোট ${qs.length}টি প্রশ্ন`);
        list.innerHTML='';
        qs.forEach((q,i)=>{const card=document.createElement('article');card.className='bank-card';const opts=q.options.map((o,j)=>`<div class="bank-option"><b>${'ABCD'[j]}</b><span>${this.escapeHtml(this.getLocalizedOption(q,j))}</span></div>`).join('');card.innerHTML=`<div class="bank-meta"><span>${this.escapeHtml(this.localizedSubject(q.subject))}</span><span>${this.escapeHtml(q.year||this.t('practice','Practice'))}</span></div><h3>${i+1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h3><div class="bank-options">${opts}</div><button class="bank-answer-btn" type="button">${this.t('Show Answer','উত্তর দেখুন')}</button><div class="bank-answer hidden"><strong>${this.t('Correct Answer','সঠিক উত্তর')}:</strong> ${q.correctAnswer}<br>${this.escapeHtml(this.language==='en'?(q.explanation_en||q.explanation||''):(q.explanation||''))}</div>`;card.querySelector('.bank-answer-btn').onclick=()=>{const a=card.querySelector('.bank-answer');a.classList.toggle('hidden');card.querySelector('.bank-answer-btn').textContent=a.classList.contains('hidden')?this.t('Show Answer','উত্তর দেখুন'):this.t('Hide Answer','উত্তর লুকান')};list.appendChild(card);});
        if(!qs.length)list.innerHTML=`<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>${this.t('No questions found','কোনো প্রশ্ন পাওয়া যায়নি')}</h3><p>${this.t('Try another filter or search term.','অন্য filter বা search ব্যবহার করুন।')}</p></div>`;
    }

    // Browser mode is independent of quiz mode. It never starts a timer or marks answers.
    renderPracticeBrowser(){
        const list=document.getElementById('practice-browser-list');
        if(!list)return;
        const countEl=document.getElementById('practice-browser-count');
        if(!this.questionsLoaded || !this.questionBank.length){
            list.innerHTML=`<div class="empty-state"><i class="fa-solid fa-book-open"></i><h3>${this.t('Questions are loading','প্রশ্ন লোড হচ্ছে')}</h3><p>${this.t('Check that questions.json is available if this message remains.','এই বার্তা থেকে গেলে questions.json ফাইলটি আছে কি না দেখুন।')}</p></div>`;
            if(countEl)countEl.textContent=this.t('Loading questions…','প্রশ্ন লোড হচ্ছে…');
            return;
        }
        const questions=[...this.questionBank];
        if(countEl)countEl.textContent=this.t(`${questions.length} questions`,`মোট ${questions.length}টি প্রশ্ন`);
        const frag=document.createDocumentFragment();
        questions.forEach((q,i)=>{
            const card=document.createElement('article');
            card.className='bank-card';
            const options=q.options.map((_,j)=>`<div class="bank-option"><b>${'ABCD'[j]}</b><span>${this.escapeHtml(this.getLocalizedOption(q,j))}</span></div>`).join('');
            const explanation=this.language==='en'?(q.explanation_en||q.explanation||''):(q.explanation_bn||q.explanation||'');
            card.innerHTML=`<div class="bank-meta"><span>${this.escapeHtml(this.localizedSubject(q.subject))}</span><span>${this.escapeHtml(q.year||this.t('Practice','প্র্যাকটিস'))}</span></div><h3>${i+1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h3><div class="bank-options">${options}</div><button class="bank-answer-btn" type="button">${this.t('Show Answer','উত্তর দেখুন')}</button><div class="bank-answer hidden"><strong>${this.t('Correct Answer','সঠিক উত্তর')}:</strong> ${this.escapeHtml(q.correctAnswer)}${explanation?`<br>${this.escapeHtml(explanation)}`:''}</div>`;
            const answer=card.querySelector('.bank-answer');
            const button=card.querySelector('.bank-answer-btn');
            button.addEventListener('click',()=>{
                const opening=answer.classList.contains('hidden');
                answer.classList.toggle('hidden',!opening);
                button.textContent=opening?this.t('Hide Answer','উত্তর লুকান'):this.t('Show Answer','উত্তর দেখুন');
            });
            frag.appendChild(card);
        });
        list.replaceChildren(frag);
    }

    openPracticeBrowser(){
        if(this.practiceTimerInterval){clearInterval(this.practiceTimerInterval);this.practiceTimerInterval=null;}
        this.practiceSession=null;
        const browser=document.getElementById('practice-browser');
        const quiz=document.getElementById('practice-quiz-view');
        if(browser)browser.hidden=false;
        if(quiz)quiz.hidden=true;
        this.showView('practice');
        this.renderPracticeBrowser();
    }

    startPracticeFromBrowser(){
        if(!this.questionsLoaded || !this.questionBank.length){
            this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।');
            return;
        }
        this.openQuestionBank('practice');
        const browser=document.getElementById('practice-browser');
        const quiz=document.getElementById('practice-quiz-view');
        if(browser)browser.hidden=true;
        if(quiz)quiz.hidden=false;
    }

    startPractice(){
        if (this.practiceTimerInterval) {
            clearInterval(this.practiceTimerInterval);
        }

        const qs=this.questionBank.filter(q=>q.source && !/^verified previous/i.test(q.source) && !q.isPreviousYear);
        const pool = qs.length ? qs : this.questionBank; 
        this.showView('practice');
        
        const selected=[...pool].sort(()=>Math.random()-.5).slice(0, Math.min(10, pool.length));
        
        this.markQuestionsSeen(selected);
        
        this.practiceSession={
            questions: selected,
            index: 0,
            answers: [],
            marks: 0,
            showAnswer: false,
            timeLeft: 600
        }; 

        this.renderPractice();
        this.startPracticeTimer();
    }

    startPracticeTimer() {
        if (this.practiceTimerInterval) clearInterval(this.practiceTimerInterval);

        this.practiceTimerInterval = setInterval(() => {
            if (!this.practiceSession) {
                clearInterval(this.practiceTimerInterval);
                return;
            }

            if (this.practiceSession.timeLeft > 0) {
                this.practiceSession.timeLeft--;
                this.updatePracticeTimerUI();
            } else {
                clearInterval(this.practiceTimerInterval);
                this.practiceTimerInterval = null;
                alert('সময় শেষ! আপনার প্র্যাকটিস সেশন শেষ হয়েছে।');
                this.finishPractice(true);
            }
        }, 1000);
    }

    updatePracticeTimerUI() {
        const timerEl = document.getElementById('practice-timer');
        if (!timerEl || !this.practiceSession) return;

        const mins = Math.floor(this.practiceSession.timeLeft / 60);
        const secs = this.practiceSession.timeLeft % 60;
        timerEl.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    renderPractice(){
        const s=this.practiceSession,q=s?.questions?.[s.index]; if(!q)return;
        const root=document.getElementById('practice-question'); if(!root)return;
        const chosen=s.answers[s.index];
        
        this.updatePracticeTimerUI();

        root.innerHTML=`<div class="practice-meta"><span>${this.localizedSubject(q.subject)}</span><span>প্রশ্ন ${s.index+1} / ${s.questions.length}</span></div><h2>${s.index+1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h2><div class="practice-options">${q.options.map((o,j)=>`<button class="practice-option ${chosen!==undefined?(j===q.answer?'correct':j===chosen?'wrong':''):''}" ${chosen!==undefined?'disabled':''} data-i="${j}"><span>${'ABCD'[j]}</span>${this.escapeHtml(this.getLocalizedOption(q,j))}</button>`).join('')}</div>${chosen!==undefined?`<div class="practice-feedback ${chosen===q.answer?'ok':'bad'}"><strong>${chosen===q.answer?this.t('Correct — +1 practice mark','সঠিক — +১ practice mark'):this.t('Not correct — 0 mark','সঠিক নয় — ০ mark')}</strong><p>${this.escapeHtml(this.language==='en'?(q.explanation_en||q.explanation||''):(q.explanation||''))}</div>`:''}`;
        root.querySelectorAll('.practice-option').forEach(btn=>btn.onclick=()=>this.answerPractice(Number(btn.dataset.i)));
        document.getElementById('practice-score').textContent=String(s.marks);
        document.getElementById('practice-progress').textContent=this.t(`Question ${s.index+1} of ${s.questions.length}`,`প্রশ্ন ${s.index+1} / ${s.questions.length}`);
    }

    answerPractice(i){
        const s=this.practiceSession;
        if(!s||s.answers[s.index]!==undefined)return;
        s.answers[s.index]=i;
        this.markQuestionPracticed(s.questions[s.index]);
        if(i===s.questions[s.index].answer){
            s.marks++;
            this.markQuestionCoveredIfCorrect(s.questions[s.index],i);
        }
        this.renderPractice();
    }

    finishPractice(timeExpired=false){
        const s=this.practiceSession;
        if(!s)return;
        if(this.practiceTimerInterval){clearInterval(this.practiceTimerInterval);this.practiceTimerInterval=null;}
        const root=document.getElementById('practice-question');
        const timer=document.getElementById('practice-timer');
        const progress=document.getElementById('practice-progress');
        if(timeExpired&&timer)timer.textContent='00:00';
        if(progress)progress.textContent=this.t('Practice complete', 'প্র্যাকটিস সম্পন্ন');
        if(root){
            root.innerHTML=`<div class="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-800 p-6 text-center"><div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><i class="fa-solid fa-check text-2xl"></i></div><h2 class="text-xl font-extrabold text-gray-900 dark:text-white">${this.t('Practice complete','প্র্যাকটিস সম্পন্ন')}</h2><p class="mt-2 text-sm text-gray-600 dark:text-gray-300">${this.t(`Your score: ${s.marks} / ${s.questions.length}`,`আপনার স্কোর: ${s.marks} / ${s.questions.length}`)}</p><button id="practice-back-browser" type="button" class="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700">${this.t('Back to Practice Browser','Practice Browser-এ ফিরুন')}</button></div>`;
            document.getElementById('practice-back-browser')?.addEventListener('click',()=>this.openPracticeBrowser());
        }
        this.practiceSession=null;
    }

    nextPractice(){
        const s=this.practiceSession;
        if(!s) return;
        if(s.index < s.questions.length - 1){
            s.index++;
            this.renderPractice();
        } else {
            this.finishPractice(false);
        }
    }

    prevPractice(){
        const s=this.practiceSession;
        if(s&&s.index>0){
            s.index--;
            this.renderPractice();
        }
    }

    initButtonFeedback() {
        if (this._buttonFeedbackBound) return;
        this._buttonFeedbackBound = true;

        // Delegated feedback works for buttons that are rendered later too.
        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element
                ? event.target.closest('button, [role="button"], input[type="button"], input[type="submit"]')
                : null;
            if (!target || target.disabled ||
                target.getAttribute('aria-disabled') === 'true' ||
                target.id === 'theme-toggle' ||
                target.closest('[data-suppress-action-feedback]')) return;

            target.classList.remove('button-action-feedback');
            void target.offsetWidth;
            target.classList.add('button-action-feedback');
            window.setTimeout(() => target.classList.remove('button-action-feedback'), 650);
        }, true);
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('med_theme', this.currentTheme);
        this.applyTheme(true);
        this.renderAccountProfile();
    }

    applyTheme(animateIcon = false) {
        const isDark = this.currentTheme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);

        // Make the selected theme unmistakable: sun for light, moon for dark.
        const themeButtons = document.querySelectorAll('button[onclick*="toggleTheme"]');
        const icon = isDark
            ? '<svg class="theme-toggle-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.985 12.486A9 9 0 1 1 11.514 3.015a7 7 0 0 0 9.471 9.471Z"></path></svg>'
            : '<svg class="theme-toggle-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>';
        themeButtons.forEach((themeToggle) => {
            const isFloatingToggle = themeToggle.id === 'theme-toggle';
            themeToggle.innerHTML = isFloatingToggle ? icon : icon + ' Toggle theme';
            themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
            themeToggle.setAttribute('aria-label', themeToggle.title);
            themeToggle.setAttribute('aria-pressed', String(isDark));
            themeToggle.dataset.themeState = isDark ? 'dark' : 'light';
            if (animateIcon) {
                const svg = themeToggle.querySelector('svg');
                if (svg) svg.classList.add('theme-icon-animate');
            }
        })
    }

    toggleMobileMenu() {
        const menu = document.getElementById('mobileMenu');
        menu.classList.toggle('hidden');
    }

    showProfile() {
        this.showView('profile');
        this.loadProgressStats();
        const profile = document.getElementById('view-profile');
        if (profile) profile.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    openProfile() {
        this.showProfile();
    }

    openAccountProfile() {
        this.showView('account');
        this.renderAccountProfile();
    }

    renderAccountProfile() {
        const user = this.authUser || null;
        const name = document.getElementById('account-profile-name');
        const email = document.getElementById('account-profile-email');
        const status = document.getElementById('account-profile-status');
        const theme = document.getElementById('account-theme-status');
        if (name) name.textContent = user?.displayName || (user?.email ? user.email.split('@')[0] : 'Guest Student');
        if (email) email.textContent = user?.email || 'Guest mode · Sign in to connect your account';
        if (status) {
            status.textContent = user ? 'Signed in' : 'Guest account';
            status.className = user
                ? 'inline-flex mt-3 rounded-full px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'inline-flex mt-3 rounded-full px-3 py-1 text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100';
        }
        if (theme) theme.textContent = this.currentTheme === 'dark' ? 'Dark mode is active' : 'Light mode is active';
        const deleteCard = document.getElementById('account-delete-card');
        const hasEmailPassword = Boolean(user && user.email && Array.isArray(user.providerData) &&
            user.providerData.some(provider => provider && provider.providerId === 'password'));
        if (deleteCard) deleteCard.classList.toggle('hidden', !hasEmailPassword);
    }

    openAccountAuth(mode = 'login') {
        const modal = document.getElementById('authModal');
        if (modal) {
            this.openAuthModal(mode);
            return;
        }
        if (typeof window.redirectToLogin === 'function') {
            window.redirectToLogin();
            return;
        }
        console.warn('Account sign-in UI is not available in this build.');
    }

    showView(viewName, force = false) {
        if (this.examActive && !this.examState.submitted && !force && viewName !== 'exam') {
            this.confirmSubmitExam('navigation');
            return;
        }
        if (viewName !== 'practice' && this.practiceTimerInterval) {
            clearInterval(this.practiceTimerInterval);
            this.practiceTimerInterval = null;
            this.practiceSession = null;
        }
        this.views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) {
                const visible = v === viewName;
                el.classList.toggle('hidden', !visible);
                el.setAttribute('aria-hidden', visible ? 'false' : 'true');
                if (visible) {
                    el.classList.remove('view-reenter');
                    void el.offsetWidth;
                    el.classList.add('view-reenter');
                }
            }
        });
        document.body.classList.toggle('exam-active', viewName === 'exam');
        if (viewName === 'exam') { history.pushState({ exam: true }, '', '#exam'); }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    openSetupView() {
        this.showView('setup');
    }

    setupExamQuick(mode) {
        this.setSetupMode(mode);
        if (mode === 'previous') { this.showPreviousYears(); return; }
        this.showView('setup');
    }

    startChallenge() { this.setup.mode='challenge'; this.setup.subject='all'; this.setup.questionsCount=20; this.setup.durationMins=10; const ys=document.getElementById('setup-year'); if(ys) ys.value='all'; this.prepareExamFromSetup(); }

    startSubjectExam(subjectKey) {
        this.setup.mode = 'random';
        this.setup.subject = subjectKey;
        this.setup.questionsCount = 20;
        this.setup.durationMins = 20;
        const subjectSelect = document.getElementById('setup-subject');
        if (subjectSelect) subjectSelect.value = subjectKey;
        this.prepareExamFromSetup();
    }

    setSetupMode(mode) {
        this.setup.mode = mode;
        ['random', 'model', 'previous'].forEach(m => {
            const btn = document.getElementById(`setup-mode-${m}`);
            if (btn) {
                if (m === mode) {
                    btn.className = "mode-select-btn py-2.5 px-3 text-xs sm:text-sm font-bold rounded-xl border border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-700 dark:text-medical-300 text-center";
                } else {
                    btn.className = "mode-select-btn py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-300 dark:border-gray-600 text-center hover:bg-gray-50 dark:hover:bg-gray-700";
                }
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

        const qBtns = document.querySelectorAll('.q-count-btn');
        qBtns.forEach(btn => {
            const val = parseInt(btn.innerText.trim());
            if (val === this.setup.questionsCount) {
                btn.className = "q-count-btn py-2 text-xs sm:text-sm font-bold rounded-xl border-2 border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-700 dark:text-medical-300 text-center shadow-sm";
            } else {
                btn.className = "q-count-btn py-2 text-xs sm:text-sm font-bold rounded-xl border border-gray-300 dark:border-gray-600 text-center hover:bg-gray-50 dark:hover:bg-gray-700";
            }
        });

        const tBtns = document.querySelectorAll('.time-btn');
        tBtns.forEach(btn => {
            const val = parseInt(btn.innerText.replace(/[^0-9]/g, ''));
            if (val === this.setup.durationMins) {
                btn.className = "time-btn py-2 text-xs sm:text-sm font-bold rounded-xl border-2 border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-700 dark:text-medical-300 text-center shadow-sm";
            } else {
                btn.className = "time-btn py-2 text-xs sm:text-sm font-bold rounded-xl border border-gray-300 dark:border-gray-600 text-center hover:bg-gray-50 dark:hover:bg-gray-700";
            }
        });
    }

    updateSubjectCountsUI() {
        const subjects = ['biology', 'chemistry', 'physics', 'english', 'gk'];
        subjects.forEach(sub => {
            const count = this.questionBank.filter(q => q.subject === sub).length;
            const el = document.getElementById(`count-subject-${sub}`);
            if (el) el.innerText = `${count} টি প্রশ্ন`;
        });
        const totalEl = document.getElementById('dash-total-questions');
        if (totalEl) totalEl.innerText = `${this.questionBank.length}+`;
    }

    getSeenQuestionKey() { return this.authUser?.uid ? `med_seen_questions_${this.authUser.uid}` : 'med_seen_questions_guest'; }
    getSeenQuestionIds() {
        try { const raw=JSON.parse(localStorage.getItem(this.getSeenQuestionKey())||'[]'); return new Set(Array.isArray(raw)?raw.map(String):[]); } catch { return new Set(); }
    }
    saveSeenQuestionIds(set) { localStorage.setItem(this.getSeenQuestionKey(), JSON.stringify([...set])); }
    markQuestionsSeen(questions) { const seen=this.getSeenQuestionIds(); questions.forEach(q=>{ if(q?.id!=null) seen.add(String(q.id)); }); this.saveSeenQuestionIds(seen); }
    getUnseenPool(pool) { const seen=this.getSeenQuestionIds(); return pool.filter(q=>q?.id!=null && !seen.has(String(q.id))); }

    getAnsweredQuestionKey() { return this.authUser?.uid ? `med_answered_questions_${this.authUser.uid}` : 'med_answered_questions_guest'; }
    getPracticedQuestionKey() { return this.authUser?.uid ? `med_practiced_questions_${this.authUser.uid}` : 'med_practiced_questions_guest'; }
    getPracticedQuestionIds() {
        try { const raw = JSON.parse(localStorage.getItem(this.getPracticedQuestionKey()) || '[]'); return new Set(Array.isArray(raw) ? raw.map(String) : []); } catch { return new Set(); }
    }
    markQuestionPracticed(question) {
        if (!question || question.id == null) return;
        const practiced = this.getPracticedQuestionIds();
        practiced.add(String(question.id));
        localStorage.setItem(this.getPracticedQuestionKey(), JSON.stringify([...practiced]));
    }
    resetCoverage() {
        localStorage.removeItem(this.getAnsweredQuestionKey());
        this.loadProgressStats();
    }
    clearCoverage() { this.resetCoverage(); }
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

    shuffleQuestionsAndOptions(pool, count) {
        let filtered = [...pool];
        if (this.setup.mode === 'previousQuiz') {
            // A Previous Year paper must use the selected year's full validated question set.
            // Do not let stale setup dropdown filters silently reduce the paper.
            filtered = filtered.filter(q => q.year === this.previousSelectedYear);
        } else {
            const subjectSelect = document.getElementById('setup-subject');
            const selectedSubject = subjectSelect ? subjectSelect.value : this.setup.subject;
            const yearSelect = document.getElementById('setup-year');
            const selectedYear = yearSelect ? yearSelect.value : 'all';
            if (selectedSubject && selectedSubject !== 'all') filtered = filtered.filter(q => q.subject === selectedSubject);
            if (selectedYear && selectedYear !== 'all') filtered = filtered.filter(q => q.year === selectedYear);
            if (this.setup.mode === 'previous') filtered = filtered.filter(q => q.isPreviousYear && q.year);
            if (this.setup.mode === 'challenge') filtered = filtered.filter(q => q.source && !/^practice$/i.test(q.year || '') );
        }
        if (!filtered.length) { this.showDataError('এই ফিল্টারে কোনো বৈধ প্রশ্ন পাওয়া যায়নি।'); return []; }
        for (let i=filtered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[filtered[i],filtered[j]]=[filtered[j],filtered[i]];}
        return filtered.slice(0,Math.min(count,filtered.length)).map(q=>{
            const optionsWithIndex=q.options.map((text,idx)=>({text,isCorrect:idx===q.answer}));
            for(let i=optionsWithIndex.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[optionsWithIndex[i],optionsWithIndex[j]]=[optionsWithIndex[j],optionsWithIndex[i]];}
            return {...q,options:optionsWithIndex.map(o=>o.text),answer:optionsWithIndex.findIndex(o=>o.isCorrect)};
        });
    }

    startExamWithConfig() { this.prepareExamFromSetup(); }

    prepareExamFromSetup() {
        if (!this.questionsLoaded || !this.questionBank.length) { this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি।'); return; }
        const selectedYear = this.setup.mode === 'previousQuiz'
            ? this.previousSelectedYear
            : (document.getElementById('setup-year')?.value || 'all');
        // Keep the exam pool tied to the selected academic year. Previously, the
        // year was saved only as metadata while questions were shuffled from the
        // entire bank, allowing questions from other sessions to appear.
        let eligibleQuestions = this.setup.mode === 'previousQuiz'
            ? this.questionBank.filter(q => q.year === selectedYear && q.isPreviousYear)
            : [...this.questionBank];
        if (this.setup.mode !== 'challenge' && selectedYear !== 'all') {
            eligibleQuestions = eligibleQuestions.filter(q => q.year === selectedYear);
        }
        if (this.setup.mode !== 'challenge' && this.setup.subject && this.setup.subject !== 'all') {
            eligibleQuestions = eligibleQuestions.filter(q => q.subject === this.setup.subject);
        }
        const count = this.setup.mode === 'previousQuiz'
            ? eligibleQuestions.length
            : (this.setup.mode === 'challenge' ? 20 : this.setup.questionsCount);
        if (!eligibleQuestions.length) {
            this.showDataError(selectedYear !== 'all'
                ? `নির্বাচিত ${selectedYear} শিক্ষাবর্ষে এই সেটিংসের জন্য কোনো প্রশ্ন পাওয়া যায়নি।`
                : 'এই সেটিংসের জন্য কোনো প্রশ্ন পাওয়া যায়নি।');
            return;
        }
        const questions = this.shuffleQuestionsAndOptions(eligibleQuestions, count);
        if (!questions.length) return;
        const examYear = this.setup.mode === 'previousQuiz' ? this.previousSelectedYear : selectedYear;
        this.preparedExam = { questions, mode: this.setup.mode, subject: this.setup.subject, year: examYear, durationMins: this.setup.durationMins };
        this.renderExamIntro();
        this.showView('exam-intro');
    }

    renderExamIntro() {
        const cfg = this.preparedExam;
        const title = cfg.mode === 'challenge' ? this.t('Medical Challenge','মেডিকেল চ্যালেঞ্জ') : (cfg.mode === 'previous' || cfg.mode === 'previousQuiz') ? `${this.t('Previous Year Exam','বিগত বছরের পরীক্ষা')} — ${cfg.year}` : this.t('Exam Instructions','পরীক্ষার নির্দেশনা');
        document.getElementById('exam-intro-title').textContent = title;
        document.getElementById('exam-intro-subtitle').textContent = this.t('Read the rules before you start. Your timer begins only after you press Start Exam.','শুরু করার আগে নিয়মগুলো পড়ে নিন। Start Exam চাপার পরই সময় গণনা শুরু হবে।');
        document.getElementById('exam-intro-start').textContent = this.t('Start Exam','পরীক্ষা শুরু করুন');
        const rules = cfg.mode === 'previousQuiz'
            ? [
                this.t(`Previous Year paper: ${cfg.year} only`, `বিগত বছরের প্রশ্নপত্র: শুধু ${cfg.year} সালের প্রশ্ন`),
                this.t(`All ${cfg.questions.length} questions from the selected year are included`, `নির্বাচিত বছরের সব ${cfg.questions.length}টি প্রশ্ন থাকবে`),
                this.t(`Time limit: ${cfg.durationMins} minutes`, `সময়: ${cfg.durationMins} মিনিট`),
                this.t('+1 for correct, −0.25 for wrong, 0 for skipped', 'সঠিক +১, ভুল −০.২৫, স্কিপ ০'),
                this.t('Any exam of 100 marks or more uses the special PB earning rule', '১০০ বা তার বেশি মার্কের যেকোনো পরীক্ষায় বিশেষ PB earning rule প্রযোজ্য'),
                this.t('Time ending submits automatically', 'সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হবে')
            ]
            : (cfg.mode === 'challenge')
                ? [this.t(`${cfg.questions.length} MCQ questions`,`${cfg.questions.length}টি MCQ প্রশ্ন`), this.t(`Time limit: ${cfg.durationMins} minutes`,`সময়: ${cfg.durationMins} মিনিট`), this.t('+1 for correct, −0.25 for wrong, 0 for skipped','সঠিক +১, ভুল −০.২৫, স্কিপ ০'), this.t('Leaving the exam requires submitting it first','পরীক্ষা থেকে বের হতে হলে আগে পরীক্ষা জমা দিতে হবে'), this.t('Time ending submits automatically','সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হবে')]
                : [this.t(`${cfg.questions.length} questions` ,`${cfg.questions.length}টি প্রশ্ন`), this.t(`Time limit: ${cfg.durationMins} minutes`,`সময়: ${cfg.durationMins} মিনিট`), this.t('+1 for correct, −0.25 for wrong, 0 for skipped','সঠিক +১, ভুল −০.২৫, স্কিপ ০'), this.t('You cannot leave without submitting the exam','জমা না দিয়ে পরীক্ষা থেকে বের হওয়া যাবে না'), this.t('Time ending submits automatically','সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হবে')];
        document.getElementById('exam-intro-rules').innerHTML = rules.map(x => `<li>• ${this.escapeHtml(x)}</li>`).join('');
        document.getElementById('exam-intro-stats').innerHTML = [
            [this.t('Questions','প্রশ্ন'), cfg.questions.length], [this.t('Time','সময়'), `${cfg.durationMins} min`], [this.t('Marks','নম্বর'), cfg.questions.length], [this.t('Negative','নেগেটিভ'), '0.25']
        ].map(([a,b])=>`<div class="rounded-2xl bg-gray-50 dark:bg-gray-700/50 p-4"><div class="text-[11px] uppercase text-gray-500">${a}</div><div class="text-lg font-extrabold text-gray-900 dark:text-white mt-1">${b}</div></div>`).join('');
    }

    beginPreparedExam() {
        if (!this.preparedExam) return;
        const cfg = this.preparedExam;
        const questionCount = Array.isArray(cfg.questions) ? cfg.questions.length : 0;
        if (!questionCount) {
            this.showDataError('পরীক্ষা শুরু করার জন্য কোনো প্রশ্ন পাওয়া যায়নি।');
            return;
        }
        // Recalculate model/previous-year duration from the actual prepared question set,
        // so stale setup state cannot shorten or extend the exam unexpectedly.
        const durationMins = (cfg.mode === 'model' || cfg.mode === 'previousQuiz')
            ? Math.max(1, Math.round(questionCount * 0.6))
            : Math.max(1, Number(cfg.durationMins) || Math.round(questionCount * 0.5) || 1);
        cfg.durationMins = durationMins;
        const now = Date.now();
        this.examState = { questions: cfg.questions, userAnswers: new Array(cfg.questions.length).fill(null), markedForReview: new Array(cfg.questions.length).fill(false), currentIndex: 0, durationMins, timerSeconds: durationMins * 60, timerInterval: null, timeUsedSeconds: 0, submitted: false, startedAt: now, deadlineAt: now + durationMins * 60000, mode: cfg.mode, year: cfg.year, subject: cfg.subject };
        this.examActive = true;
        this.markQuestionsSeen(cfg.questions);
        this.renderQuestion(); this.renderPalette(); this.showView('exam'); this.startTimer();
    }

    startTimer() {
        const state = this.examState;
        if (!state || state.submitted || !this.examActive) return;
        if (state.timerInterval) clearInterval(state.timerInterval);
        // Validate the new exam deadline; a stale or already-expired deadline must not instantly submit.
        const totalSeconds = Math.max(1, Math.round(Number(state.durationMins) * 60 || Number(state.timerSeconds) || 1));
        const now = Date.now();
        const startedAt = Number(state.startedAt);
        const deadlineAt = Number(state.deadlineAt);
        const expectedDeadline = startedAt + totalSeconds * 1000;
        const validDeadline = Number.isFinite(startedAt) && startedAt > 0 &&
            Number.isFinite(deadlineAt) && deadlineAt > now &&
            deadlineAt > startedAt && Math.abs(deadlineAt - expectedDeadline) <= 5000;
        if (!validDeadline) {
            state.startedAt = now;
            state.deadlineAt = now + totalSeconds * 1000;
            state.timeUsedSeconds = 0;
        }
        let timeoutSubmitted = false;
        const tick = () => {
            if (this.examState !== state || state.submitted || !this.examActive) {
                if (state.timerInterval) clearInterval(state.timerInterval);
                state.timerInterval = null;
                return;
            }
            const remaining = Math.max(0, state.deadlineAt - Date.now());
            state.timerSeconds = Math.ceil(remaining / 1000);
            state.timeUsedSeconds = Math.max(0, Math.min(state.deadlineAt - state.startedAt, Date.now() - state.startedAt) / 1000);
            const mins = Math.floor(state.timerSeconds / 60), secs = state.timerSeconds % 60;
            const el = document.getElementById('exam-timer');
            if (el) el.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            if (state.timerSeconds <= 0 && !timeoutSubmitted) {
                timeoutSubmitted = true;
                if (state.timerInterval) clearInterval(state.timerInterval);
                state.timerInterval = null;
                this.submitExam(true);
            }
        };
        tick();
        if (!timeoutSubmitted && !state.submitted && this.examState === state) state.timerInterval = setInterval(tick, 250);
    }

    renderQuestion() {
        const idx = this.examState.currentIndex;
        const q = this.examState.questions[idx];

        const progressText = document.getElementById('exam-progress-text');
        progressText.innerText = `${this.t('Question','প্রশ্ন')}: ${idx + 1} / ${this.examState.questions.length}`;
        // A decorative progress indicator; the exam state and timer remain authoritative.
        let progressTrack = document.getElementById('exam-progress-indicator');
        if (!progressTrack) {
            progressTrack = document.createElement('div');
            progressTrack.id = 'exam-progress-indicator';
            progressTrack.className = 'exam-progress-track';
            progressTrack.setAttribute('role', 'progressbar');
            progressTrack.setAttribute('aria-label', 'Exam question progress');
            progressTrack.setAttribute('aria-valuemin', '0');
            progressTrack.setAttribute('aria-valuemax', String(this.examState.questions.length));
            progressText.closest('#view-exam')?.querySelector('.exam-progress-track')?.remove();
            document.getElementById('q-text')?.before(progressTrack);
        }
        const progressPercent = Math.round(((idx + 1) / Math.max(1, this.examState.questions.length)) * 100);
        progressTrack.setAttribute('aria-valuenow', String(idx + 1));
        progressTrack.setAttribute('aria-valuemax', String(this.examState.questions.length));
        progressTrack.innerHTML = '<span></span>';
        progressTrack.querySelector('span').style.width = progressPercent + '%';

        document.getElementById('q-subject').innerText = this.localizedSubject(q.subject);
        document.getElementById('q-source').innerText = q.year ? `${this.localizedSource(q.source)} • ${q.year}` : this.localizedSource(q.source);
        document.getElementById('q-difficulty').classList.add('hidden');
        const questionText = document.getElementById('q-text');
        questionText.innerText = `${idx + 1}. ${this.getLocalizedQuestionText(q)}`;
        questionText.classList.remove('question-enter');
        void questionText.offsetWidth;
        questionText.classList.add('question-enter');

        const optionsContainer = document.getElementById('q-options');
        optionsContainer.innerHTML = '';
        optionsContainer.classList.remove('question-enter');
        void optionsContainer.offsetWidth;
        optionsContainer.classList.add('question-enter');

        const optionLabels = ['A', 'B', 'C', 'D'];
        q.options.forEach((optText, optIdx) => {
            const isSelected = this.examState.userAnswers[idx] === optIdx;
            const btn = document.createElement('button');
            btn.className = `w-full text-right p-4 rounded-2xl border transition flex items-center justify-between ${
                isSelected 
                    ? 'border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-800 dark:text-medical-200 font-bold' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`;
            btn.onclick = () => this.selectOption(optIdx);

            btn.innerHTML = `
                <div class="flex items-center space-x-3 space-x-reverse">
                    <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-medical-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }">${optionLabels[optIdx]}</span>
                    <span class="text-sm sm:text-base" data-option-index="${optIdx}">${this.escapeHtml(this.getLocalizedOption(q,optIdx))}</span>
                </div>
            `;
            optionsContainer.appendChild(btn);
        });

        const reviewBtn = document.getElementById('btn-mark-review');
        if (this.examState.markedForReview[idx]) {
            reviewBtn.className = "px-3 py-2 rounded-xl bg-amber-500 text-white font-semibold text-xs transition flex items-center";
        } else {
            reviewBtn.className = "px-3 py-2 rounded-xl border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-semibold text-xs transition flex items-center";
        }

        document.getElementById('btn-prev-q').disabled = idx === 0;
        const nextBtn = document.getElementById('btn-next-q');
        if (nextBtn) {
            const isLast = idx === this.examState.questions.length - 1;
            nextBtn.disabled = false;
            nextBtn.textContent = isLast ? this.t('Submit','সাবমিট') : this.t('Next','পরবর্তী');
            nextBtn.setAttribute('aria-label', isLast ? 'Submit exam' : 'Next question');
        }
    }

    renderPalette() {
        const paletteGrid = document.getElementById('q-palette-grid');
        paletteGrid.innerHTML = '';

        this.examState.questions.forEach((_, idx) => {
            const btn = document.createElement('button');
            const isCurrent = idx === this.examState.currentIndex;
            const isAnswered = this.examState.userAnswers[idx] !== null;
            const isMarked = this.examState.markedForReview[idx];

            let bgClass = "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
            if (isMarked) bgClass = "bg-amber-400 text-white font-bold";
            else if (isAnswered) bgClass = "bg-emerald-500 text-white font-bold";

            let borderClass = isCurrent ? "ring-2 ring-medical-600 ring-offset-2" : "";

            btn.className = `h-9 w-9 rounded-xl text-xs font-bold flex items-center justify-center transition ${bgClass} ${borderClass}`;
            btn.innerText = idx + 1;
            btn.onclick = () => {
                this.examState.currentIndex = idx;
                this.renderQuestion();
                this.renderPalette();
            };
            paletteGrid.appendChild(btn);
        });
    }

    selectOption(optIdx) {
        const state = this.examState;
        if (!this.examActive || !state || state.submitted || !Array.isArray(state.questions)) return;
        const idx = state.currentIndex;
        const question = state.questions[idx];
        if (!question || !Array.isArray(question.options) || !Number.isInteger(optIdx) || optIdx < 0 || optIdx >= question.options.length) return;
        // One answer per question for the entire attempt: no multi-select and no unselect.
        if (state.userAnswers[idx] !== null && state.userAnswers[idx] !== undefined) return;
        state.userAnswers[idx] = optIdx;
        // Progress/trophy bookkeeping must never prevent the selected answer from rendering.
        try { this.markQuestionPracticed(question); } catch (error) { console.error('[Exam] Could not save practiced-question progress:', error); }
        try { this.markQuestionCoveredIfCorrect(question, optIdx); } catch (error) { console.error('[Exam] Could not save coverage progress:', error); }
        try { this.renderQuestion(); } catch (error) { console.error('[Exam] Could not render selected answer:', error); }
        try { this.renderPalette(); } catch (error) { console.error('[Exam] Could not render question palette:', error); }
    }

    clearOptionSelection() {
        return;
    }

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

    confirmSubmitExam(reason = 'manual') {
        const msg = reason === 'navigation'
            ? this.t('You must submit the exam before leaving. Submit now?','পরীক্ষা থেকে বের হওয়ার আগে আপনাকে পরীক্ষা জমা দিতে হবে। এখনই জমা দেবেন?')
            : this.t('Are you sure you want to submit the exam? You cannot continue this attempt after submission.','আপনি কি নিশ্চিত যে পরীক্ষা জমা দিতে চান? জমা দেওয়ার পর এই attempt-এ আর ফিরতে পারবেন না।');
        if (confirm(msg)) this.submitExam(false);
    }

    submitExam(autoSubmitted = false) {
        const state = this.examState;
        if (!state || state.submitted || !Array.isArray(state.questions)) return;
        // Lock submission immediately so timer/manual clicks cannot submit twice.
        state.submitted = true;
        if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }

        const questions = state.questions;
        const answers = Array.isArray(state.userAnswers) ? state.userAnswers : [];
        let correctCount = 0, wrongCount = 0, skippedCount = 0;
        let currentCorrectStreak = 0, maxCorrectStreak = 0;
        questions.forEach((q, idx) => {
            const answer = answers[idx];
            const correct = Number.isInteger(q?.answer) ? q.answer
                : Number.isInteger(q?.correctAnswer) ? q.correctAnswer
                : 'ABCD'.indexOf(String(q?.correctAnswer || '').toUpperCase());
            if (answer === null || answer === undefined) {
                skippedCount++;
                currentCorrectStreak = 0;
            } else if (answer === correct) {
                correctCount++;
                currentCorrectStreak++;
                maxCorrectStreak = Math.max(maxCorrectStreak, currentCorrectStreak);
            } else {
                wrongCount++;
                currentCorrectStreak = 0;
            }
        });

        const negativeMarks = wrongCount * 0.25;
        const totalQuestions = questions.length;
        const totalScore = Math.max(0, correctCount - negativeMarks);
        const accuracy = (correctCount + wrongCount) > 0
            ? ((correctCount / (correctCount + wrongCount)) * 100).toFixed(1) : '0.0';
        const setResultText = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.innerText = String(value);
        };
        setResultText('res-score-main', totalScore.toFixed(2) + ' / ' + totalQuestions);
        setResultText('res-percentage', (totalQuestions ? (totalScore / totalQuestions * 100) : 0).toFixed(1) + '%');
        setResultText('res-accuracy', accuracy + '%');
        setResultText('res-correct', correctCount);
        setResultText('res-wrong', wrongCount);
        setResultText('res-skipped', skippedCount);
        setResultText('res-negative', '-' + negativeMarks.toFixed(2));

        const usedSeconds = Math.max(0, Math.round(Number(state.timeUsedSeconds) || 0));
        const minsUsed = Math.floor(usedSeconds / 60);
        const secsUsed = usedSeconds % 60;
        setResultText('res-time-used', minsUsed + ':' + String(secsUsed).padStart(2, '0'));

        // Every submitted exam awards Rank API points, regardless of exam mode.
        const quizPoints = Math.max(0, correctCount * 4 - wrongCount);
        // Persist the result independently from non-critical progress/leaderboard updates.
        try {
            this.saveExamAttempt({
                attemptId: String(state.startedAt || Date.now()),
                date: new Date().toLocaleDateString('bn-BD'),
                mode: state.mode === 'practice' ? 'practice' : (this.setup?.mode || state.mode || 'model'),
                subject: document.getElementById('setup-subject')?.value || state.subject || 'all',
                year: document.getElementById('setup-year')?.value || state.year || 'all',
                score: totalScore.toFixed(2),
                total: totalQuestions,
                accuracy: accuracy + '%',
                timeUsed: minsUsed + ':' + String(secsUsed).padStart(2, '0'),
                quizPoints,
                modeLabel: state.mode,
                correctCount,
                wrongCount,
                skippedCount,
                reviewData: {
                    questions: questions.map(q => ({
                        ...q,
                        options: Array.isArray(q?.options) ? q.options.slice() : []
                    })),
                    userAnswers: answers.map(answer => answer === null || answer === undefined ? null : Number(answer)),
                    correctCount,
                    wrongCount,
                    skippedCount
                }
            });
        } catch (error) {
            console.error('[Exam] Result calculated, but saving exam history failed:', error);
        }
        // The result page shows XP/RP confirmed by the dedicated Medical API.
        const attemptId = String(state.startedAt || Date.now());
        const rewardPanel = document.getElementById('exam-reward-summary');
        if (rewardPanel) rewardPanel.dataset.attemptId = attemptId;
        if (typeof window.updateExamRewardDisplay === 'function') {
            window.updateExamRewardDisplay({ attemptId, pending: true, message: 'XP ও RP হিসাব করে আনা হচ্ছে…' });
        }
        try {
            Promise.resolve(this.recordLeaderboardResult({
                correctCount, wrongCount, totalQuestions, quizPoints, score: totalScore,
                examMode: state.mode === 'practice' ? 'practice' : (this.setup?.mode || state.mode || 'Exam'),
                subject: document.getElementById('setup-subject')?.value || state.subject || 'all',
                year: document.getElementById('setup-year')?.value || state.year || 'all',
                timeUsed: minsUsed + ':' + String(secsUsed).padStart(2, '0'),
                accuracy, attemptId, maxCombo: maxCorrectStreak
            })).then(reward => {
                if (typeof window.updateExamRewardDisplay === 'function') {
                    window.updateExamRewardDisplay(reward || { attemptId, pending: true, message: 'Reward sync-এর অপেক্ষায় আছে।' });
                }
                // Refresh server-backed attempt history after the reward API finishes.
                if (window.app) {
                    window.app.__serverProgressFetchedAt = 0;
                    window.app.loadProgressStats();
                }
            }).catch(error => {
                console.error('[Exam] Could not update global reward after submission:', error);
                if (typeof window.updateExamRewardDisplay === 'function') {
                    window.updateExamRewardDisplay({ attemptId, pending: true, message: 'API-তে সংযোগ হয়নি; reward sync retry হবে।' });
                }
            });
        } catch (error) {
            console.error('[Exam] Could not update global reward after submission:', error);
            if (typeof window.updateExamRewardDisplay === 'function') {
                window.updateExamRewardDisplay({ attemptId, pending: true, message: 'Reward sync-এর অপেক্ষায় আছে।' });
            }
        }

        // Always leave the exam state locked and attempt to show the result, even if an
        // optional history/progress/leaderboard integration throws.
        this.examActive = false;
        this.preparedExam = null;
        try { history.replaceState({ app: true }, '', window.location.pathname + window.location.search); }
        catch (error) { console.warn('[Exam] Could not clean the exam URL:', error); }
        try { this.showView('result', true); }
        catch (error) {
            console.error('[Exam] Result view navigation failed:', error);
            document.querySelectorAll('main .view-section').forEach(section => {
                const visible = section.id === 'view-result';
                section.classList.toggle('hidden', !visible);
                section.setAttribute('aria-hidden', visible ? 'false' : 'true');
            });
        }
    }

    showReviewAnswersView() {
        const container = document.getElementById('review-list-container');
        container.innerHTML = '';

        const optionLabels = ['A', 'B', 'C', 'D'];

        this.examState.questions.forEach((q, idx) => {
            const userAns = this.examState.userAnswers[idx];
            const isCorrect = userAns === q.answer;
            const isSkipped = userAns === null;

            const card = document.createElement('div');
            card.className = "bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4 shadow-sm";
            card.dataset.reviewStatus = isSkipped ? 'skipped' : (isCorrect ? 'correct' : 'wrong');
            card.dataset.reviewAnswered = isSkipped ? 'false' : 'true';

            let statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">সঠিক</span>`;
            if (isSkipped) {
                statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">উত্তর দেওয়া হয়নি</span>`;
            } else if (!isCorrect) {
                statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">ভুল উত্তর</span>`;
            }

            let optionsHTML = q.options.map((opt, optIdx) => {
                let optStyle = "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600";
                if (optIdx === q.answer) {
                    optStyle = "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold";
                } else if (optIdx === userAns && !isCorrect) {
                    optStyle = "bg-red-50 dark:bg-red-950/40 border-red-500 text-red-800 dark:text-red-300 font-bold";
                }

                return `
                    <div class="p-3 rounded-xl border text-sm flex items-center justify-between ${optStyle}">
                        <span>${optionLabels[optIdx]}. ${this.escapeHtml(opt)}</span>
                        ${optIdx === q.answer ? '<i class="fa-solid fa-check text-emerald-600"></i>' : ''}
                        ${optIdx === userAns && !isCorrect ? '<i class="fa-solid fa-xmark text-red-600"></i>' : ''}
                    </div>
                `;
            }).join('');

            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-medical-600 uppercase">${this.escapeHtml(q.subject)}</span>
                    ${statusBadge}
                </div>
                <h4 class="font-bold text-gray-900 dark:text-white text-base">${idx + 1}. ${this.escapeHtml(q.question)}</h4>
                <div class="space-y-2">${optionsHTML}</div>
                <div class="p-3 bg-medical-50 dark:bg-medical-900/30 rounded-xl text-xs text-medical-800 dark:text-medical-300 border border-medical-100 dark:border-medical-800">
                    <strong>${this.t('Explanation:','ব্যাখ্যা:')}</strong> ${this.escapeHtml(q.explanation || 'এই প্রশ্নের কোনো ব্যাখ্যা দেওয়া হয়নি।')}
                </div>
            `;
            container.appendChild(card);
        });

        this.showView('review');
        this.setupAnswerReviewFilters();
    }

    openSavedExamReview(attemptId) {
        const normalizeId = value => String(value ?? '').split('-').pop();
        const localHistory = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
        const allHistory = [
            ...localHistory,
            ...(Array.isArray(this.serverExamHistory) ? this.serverExamHistory : [])
        ];
        const saved = allHistory.find(item => item && item.reviewData &&
            (String(item.attemptId) === String(attemptId) ||
             normalizeId(item.attemptId) === normalizeId(attemptId)));
        if (!saved || !Array.isArray(saved.reviewData.questions) || !Array.isArray(saved.reviewData.userAnswers)) {
            alert('এই attempt-এর Answer Review data আগে সংরক্ষিত হয়নি, তাই প্রশ্ন ও উত্তর দেখানো যাচ্ছে না। নতুন attempt-এ Answer Review সংরক্ষিত থাকবে।');
            return;
        }
        this.__savedReviewReturnState = {
            examState: this.examState,
            examActive: this.examActive,
            preparedExam: this.preparedExam
        };
        this.examState = {
            questions: saved.reviewData.questions,
            userAnswers: saved.reviewData.userAnswers,
            markedForReview: [],
            currentIndex: 0,
            timerSeconds: 0,
            timerInterval: null,
            timeUsedSeconds: 0,
            submitted: true,
            mode: saved.mode || 'saved-review'
        };
        this.examActive = false;
        this.preparedExam = null;
        this.showReviewAnswersView();
    }

    returnFromAnswerReview() {
        if (this.__savedReviewReturnState) {
            const previous = this.__savedReviewReturnState;
            this.examState = previous.examState;
            this.examActive = previous.examActive;
            this.preparedExam = previous.preparedExam;
            this.__savedReviewReturnState = null;
            this.showView('profile', true);
            return;
        }
        this.showView('result', true);
    }

    setupAnswerReviewFilters() {
        const controls = document.getElementById('answer-review-filters');
        const container = document.getElementById('review-list-container');
        if (!controls || !container) return;
        const cards = Array.from(container.children).filter(card => card.dataset.reviewStatus);
        const counts = {
            all: cards.length,
            answered: cards.filter(card => card.dataset.reviewAnswered === 'true').length,
            correct: cards.filter(card => card.dataset.reviewStatus === 'correct').length,
            wrong: cards.filter(card => card.dataset.reviewStatus === 'wrong').length,
            skipped: cards.filter(card => card.dataset.reviewStatus === 'skipped').length
        };
        Object.entries(counts).forEach(([key, count]) => {
            const badge = controls.querySelector('[data-filter-count="' + key + '"]');
            if (badge) badge.textContent = count;
        });
        if (controls.dataset.bound !== 'true') {
            controls.addEventListener('click', event => {
                const button = event.target.closest('[data-review-filter]');
                if (!button) return;
                const filter = button.dataset.reviewFilter;
                controls.querySelectorAll('[data-review-filter]').forEach(item => {
                    const active = item === button;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
                Array.from(container.children).forEach(card => {
                    if (!card.dataset.reviewStatus) return;
                    const status = card.dataset.reviewStatus;
                    const answered = card.dataset.reviewAnswered === 'true';
                    card.hidden = !(filter === 'all' || (filter === 'answered' && answered) ||
                        (filter === 'correct' && status === 'correct') ||
                        (filter === 'wrong' && status === 'wrong') || (filter === 'skipped' && status === 'skipped'));
                });
            });
            controls.dataset.bound = 'true';
        }
        const active = controls.querySelector('[data-review-filter].active');
        const filter = active ? active.dataset.reviewFilter : 'all';
        cards.forEach(card => {
            const status = card.dataset.reviewStatus;
            const answered = card.dataset.reviewAnswered === 'true';
            card.hidden = !(filter === 'all' || (filter === 'answered' && answered) ||
                (filter === 'correct' && status === 'correct') ||
                (filter === 'wrong' && status === 'wrong') || (filter === 'skipped' && status === 'skipped'));
        });
    }

    saveExamAttempt(attempt) {
        let history = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
        history.unshift(attempt);
        // Keep full answer-review snapshots for the 20 most recent local attempts;
        // older summary rows remain available without risking localStorage exhaustion.
        history.forEach((item, index) => {
            if (index >= 20 && item && item.reviewData) delete item.reviewData;
        });
        localStorage.setItem(this.getHistoryKey(), JSON.stringify(history));
        this.loadProgressStats();
    }

    loadProgressStats() {
        const localHistory = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
        const localByAttemptId = new Map(localHistory.filter(item => item && item.attemptId).map(item => [String(item.attemptId), item]));
        const normalizeAttemptId = value => String(value ?? '').split('-').pop();
        const historySource = Array.isArray(this.serverExamHistory) ? this.serverExamHistory : localHistory;
        const historyById = new Map();
        historySource.forEach(item => {
            if (!item) return;
            const local = item.attemptId
                ? localByAttemptId.get(String(item.attemptId)) || localByAttemptId.get(normalizeAttemptId(item.attemptId))
                : null;
            const merged = local?.reviewData
                ? { ...item, reviewData: local.reviewData, correctCount: local.correctCount, wrongCount: local.wrongCount, skippedCount: local.skippedCount }
                : item;
            const key = item.attemptId ? normalizeAttemptId(item.attemptId) : JSON.stringify([item.date, item.mode, item.score, item.total, item.timeUsed]);
            const existing = historyById.get(key);
            // Keep one row per exam attempt; prefer the copy that has its local answer snapshot.
            if (!existing || (!existing.reviewData && merged.reviewData)) historyById.set(key, merged);
        });
        const history = Array.from(historyById.values()).sort((a, b) =>
            Number(normalizeAttemptId(b.attemptId)) - Number(normalizeAttemptId(a.attemptId))
        );
        const answered=this.getAnsweredQuestionIds();
        const total=this.questionBank.length||520;
        const attempts=history.length;
        const best=attempts?Math.max(...history.map(h=>parseFloat(h.score)||0)):0;
        const avgAcc=attempts?(history.reduce((a,h)=>a+(parseFloat(h.accuracy)||0),0)/attempts):0;
        const avgScore=attempts?(history.reduce((a,h)=>a+(parseFloat(h.score)||0),0)/attempts):0;
        const set=(id,val)=>{const el=document.getElementById(id);if(el)el.innerText=val;};
        set('dash-total-exams',attempts); set('prog-total-attempts',attempts); set('dash-best-score',best.toFixed(2)); set('prog-best-score',best.toFixed(2)); set('dash-avg-accuracy',`${avgAcc.toFixed(1)}%`); set('prog-avg-accuracy',`${avgAcc.toFixed(1)}%`); set('prog-avg-score',avgScore.toFixed(2));
        set('profile-name',this.authUser?(this.profile?.name||this.authUser.displayName||this.authUser.email||'Student'):'Guest Student');
        set('profile-email',this.authUser?(this.profile?.email||this.authUser.email||'Signed in'):'Guest mode • আপনার progress এই device-এ সংরক্ষিত');
        set('profile-seen-count',answered.size); set('profile-attempt-count',attempts); set('profile-best-score',best.toFixed(2)); set('profile-accuracy',`${avgAcc.toFixed(1)}%`);
        let accountProgress = {};
        try { accountProgress = typeof this.getAccountProgress === 'function' ? this.getAccountProgress() || {} : {}; } catch (_) {}
        // Streak is shown only in the dashboard's top-right control. Keep the
        // latest locally saved value intact instead of rendering a false zero
        // when the server is offline or returns an older snapshot.
        const coverage=total?Math.min(100,(answered.size/total)*100):0; set('profile-coverage',`${coverage.toFixed(0)}%`);
        const bar=document.getElementById('profile-progress-bar');if(bar)bar.style.width=`${coverage}%`;
        const note=document.getElementById('profile-performance-note');if(note) note.textContent=attempts?`আপনার গড় Accuracy ${avgAcc.toFixed(1)}% এবং Best Score ${best.toFixed(2)}। ধারাবাহিক practice করলে এই trend আরও উন্নত হবে।`:'এখনও কোনো exam attempt নেই। Practice বা Model Test শুরু করুন—আপনার progress এখানে automatically তৈরি হবে।';
        const action=document.getElementById('profile-auth-action');if(action)action.textContent=this.authUser?'Account':'লগইন / রেজিস্টার';
        const tbody=document.getElementById('prog-history-tbody');
        if(tbody){tbody.innerHTML=''; history.slice(0,10).forEach(item=>{
            const tr=document.createElement('tr');
            const canReview=!!item.reviewData?.questions?.length && Array.isArray(item.reviewData.userAnswers);
            tr.className='transition '+(canReview?'cursor-pointer hover:bg-medical-50 dark:hover:bg-medical-900/20':'hover:bg-gray-50 dark:hover:bg-gray-700/50');
            if(canReview){tr.tabIndex=0;tr.setAttribute('role','button');tr.title='ক্লিক করে এই পরীক্ষার Answer Review দেখুন';}
            tr.innerHTML=`<td class="py-3 px-4 font-medium">${this.escapeHtml(item.date || '—')}</td><td class="py-3 px-4 capitalize">${this.escapeHtml(item.mode || 'Exam')}</td><td class="py-3 px-4">${this.escapeHtml(item.subject || '—')}</td><td class="py-3 px-4 font-bold text-medical-600">${this.escapeHtml(item.score ?? '0')} / ${this.escapeHtml(item.total ?? 0)}</td><td class="py-3 px-4">${this.escapeHtml(item.accuracy || '0%')}</td><td class="py-3 px-4 text-emerald-600 font-semibold">${item.correctCount ?? '—'}</td><td class="py-3 px-4 text-rose-600 font-semibold">${item.wrongCount ?? '—'}</td><td class="py-3 px-4 text-amber-600 font-semibold">${item.skippedCount ?? '—'}</td><td class="py-3 px-4 text-gray-500">${this.escapeHtml(item.timeUsed || '—')}</td>`;
            if(canReview){
                const open=()=>this.openSavedExamReview(item.attemptId);
                tr.addEventListener('click',open);
                tr.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
            }
            tbody.appendChild(tr);
        });}
        // Refresh account progress from the authenticated Medical Sheets API.
        // Keep local history visible until the first successful server response.
        const league = window.MedGlobalLeague;
        if (league && typeof league.getProgress === 'function' &&
            !this.__serverProgressLoading &&
            (!this.__serverProgressFetchedAt || Date.now() - this.__serverProgressFetchedAt > 30000)) {
            this.__serverProgressLoading = true;
            const appInstance = this;
            league.getProgress().then(response => {
                if (!response || !Array.isArray(response.attempts)) throw new Error('Server progress response is incomplete.');
                const serverAttempts = response.attempts;
                const localAttempts = JSON.parse(localStorage.getItem(appInstance.getHistoryKey()) || '[]');
                const normalizeAttemptId = value => String(value ?? '').split('-').pop();
                const serverIds = new Set(serverAttempts.map(item => normalizeAttemptId(item?.attemptId)).filter(Boolean));
                const unsyncedLocalAttempts = localAttempts.filter(item => item && item.attemptId &&
                    !serverIds.has(normalizeAttemptId(item.attemptId)));
                const mergedById = new Map();
                [...serverAttempts, ...unsyncedLocalAttempts].forEach(item => {
                    if (!item) return;
                    const key = normalizeAttemptId(item.attemptId) || JSON.stringify([item.date, item.mode, item.score, item.total]);
                    const existing = mergedById.get(key);
                    if (!existing || (!existing.reviewData && item.reviewData)) mergedById.set(key, item);
                });
                appInstance.serverExamHistory = Array.from(mergedById.values())
                    .sort((a, b) => Number(normalizeAttemptId(b.attemptId)) - Number(normalizeAttemptId(a.attemptId)));
                appInstance.__serverProgressFetchedAt = Date.now();
                appInstance.loadProgressStats();
            }).catch(error => {
                console.warn('[Account progress] Server sync failed; showing available local history.', error);
                appInstance.__serverProgressFetchedAt = Date.now();
            }).finally(() => { appInstance.__serverProgressLoading = false; });
        }
    }

    clearStorageHistory() {
        if (confirm("আপনি কি সমস্ত পরীক্ষার ইতিহাস মুছে ফেলতে চান?")) {
            localStorage.removeItem(this.getHistoryKey());
            this.loadProgressStats();
        }
    }
}

window.app = new MedicalExamApp();

window.updateExamRewardDisplay = function (reward) {
    const panel = document.getElementById('exam-reward-summary');
    if (!panel || !reward) return;
    const activeAttempt = String(panel.dataset.attemptId || '');
    const rewardAttempt = String(reward.attemptId || '');
    if (activeAttempt && rewardAttempt && activeAttempt !== rewardAttempt) return;
    const xpEl = document.getElementById('res-xp-earned');
    const rpEl = document.getElementById('res-rp-earned');
    const rankEl = document.getElementById('res-rank-earned');
    const statusEl = document.getElementById('res-reward-status');
    if (reward.success && !reward.pending) {
        const xp = reward.xpGained == null || !Number.isFinite(Number(reward.xpGained)) ? null : Number(reward.xpGained);
        const rp = reward.rankPointsDelta == null || !Number.isFinite(Number(reward.rankPointsDelta)) ? null : Number(reward.rankPointsDelta);
        if (xpEl) xpEl.textContent = xp == null ? '—' : ((xp >= 0 ? '+' : '') + xp.toLocaleString() + ' XP');
        if (rpEl) rpEl.textContent = rp == null ? '—' : ((rp >= 0 ? '+' : '') + rp.toLocaleString() + ' RP');
        if (rankEl) rankEl.textContent = reward.rank ? ('বর্তমান Rank: ' + reward.rank) : '';
        if (statusEl) {
            statusEl.textContent = (xp == null || rp == null)
                ? 'API থেকে result গ্রহণ করা হয়েছে, কিন্তু earned XP/RP-এর নির্দিষ্ট amount response-এ পাওয়া যায়নি।'
                : (reward.fallbackUsed
                    ? 'Medical API result sync হয়নি; reward নিশ্চিত হলে updated amount দেখানো হবে।'
                    : (reward.synced ? 'Medical API থেকে XP/RP sync হয়েছে।' : 'API থেকে reward পাওয়া গেছে।'));
        }
        panel.dataset.rewardState = (xp == null || rp == null) ? 'amount-unavailable' : (reward.fallbackUsed ? 'fallback' : 'synced');
        return;
    }
    if (reward.pending) {
        if (xpEl) xpEl.textContent = 'Pending';
        if (rpEl) rpEl.textContent = 'Pending';
        if (rankEl) rankEl.textContent = '';
        if (statusEl) statusEl.textContent = reward.message || 'Medical API থেকে XP ও RP নিশ্চিত করা হচ্ছে।';
        panel.dataset.rewardState = 'pending';
        return;
    }
    if (xpEl) xpEl.textContent = '—';
    if (rpEl) rpEl.textContent = '—';
    if (rankEl) rankEl.textContent = '';
    if (statusEl) statusEl.textContent = reward.message || 'এই result-এর reward এখনো নিশ্চিত হয়নি।';
    panel.dataset.rewardState = 'unavailable';
};

let isWrongFiltered = false;
let originalQuestionStates = new Map();

window.toggleWrongQuestions = function() {
    const btn = document.getElementById("wrong-btn");
    const container = document.getElementById("review-list-container");

    if (!container) {
        console.error("review-list-container not found!");
        return;
    }

    const questions = container.querySelectorAll(":scope > div");

    if (!isWrongFiltered) {
        originalQuestionStates.clear();

        let foundWrongOrSkipped = false;

        questions.forEach(question => {
            const text = question.innerText || "";

            const isWrongOrSkipped =
                /ভুল উত্তর|উত্তর দেওয়া হয়নি|উত্তর দেওয়া হয়নি|উত্তর দেয়া হয়নি|উত্তর দেয়া হয়নি|Wrong|Incorrect|Skipped/i.test(text);

            originalQuestionStates.set(question, question.hidden);

            question.hidden = !isWrongOrSkipped;

            if (isWrongOrSkipped) {
                foundWrongOrSkipped = true;
            }
        });

        if (!foundWrongOrSkipped) {
            originalQuestionStates.forEach((wasHidden, question) => {
                if (question.isConnected) {
                    question.hidden = wasHidden;
                }
            });

            originalQuestionStates.clear();

            alert("কোনো ভুল বা উত্তর না দেওয়া প্রশ্ন পাওয়া যায়নি!");
            return;
        }

        isWrongFiltered = true;

        if (btn) {
            btn.innerText = "সব প্রশ্ন দেখুন";
            btn.style.backgroundColor = "#2ecc71";
        }

    } else {
        originalQuestionStates.forEach((wasHidden, question) => {
            if (question.isConnected) {
                question.hidden = wasHidden;
            }
        });

        originalQuestionStates.clear();
        isWrongFiltered = false;

        if (btn) {
            btn.innerText = "See Wrong Questions";
            btn.style.backgroundColor = "#dc3545";
        }
    }
}

window.handleSubmit = async function() {
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const email = emailInput ? emailInput.value.trim() : '';
  const pass = passwordInput ? passwordInput.value : '';

  if (!email) {
    alert('* Please enter your email address');
    return;
  }
  if (!pass) {
    alert('Please enter your password.');
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    alert('Login Successful!');
    window.location.href = "https://serakib.github.io/Medical-Admission-Tracker/";
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// ফায়ারবেস অথেন্টিকেশন লিসেনার ও ডাইনামিক বাটন আপডেট
onAuthStateChanged(auth, (user) => {
    const authContainers = document.querySelectorAll('.auth-btn-target');
    authContainers.forEach(container => {
        if (user) {
            container.innerHTML = `
                <button onclick="window.handleLogout()" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-red-400 bg-red-500/10 border border-red-500/40 rounded-lg hover:bg-red-500/20 transition-all outline-none cursor-pointer">
                    <i class="fa-solid fa-right-from-bracket"></i>
                    <span>লগআউট</span>
                </button>
            `;
        } else {
            container.innerHTML = `
                <button onclick="window.redirectToLogin()" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-emerald-400 bg-transparent border border-emerald-500/40 rounded-lg hover:bg-emerald-500/10 transition-all outline-none cursor-pointer">
                    <i class="fa-solid fa-right-to-bracket"></i>
                    <span>Login / Sign up</span>
                </button>
            `;
        }
    });
});

// গ্লোবাল রিডাইরেক্ট এবং লগআউট ফাংশন
window.redirectToLogin = function() {
    if (!window.confirm("আপনি কি লগইন পেজে যেতে চান?")) return;
    window.location.href = "https://serakib.github.io/Medical-Admission-Tracker-login/";
};

window.handleLogout = function() {
    // Use an in-page confirmation dialog so the logout action always has a visible prompt.
    if (document.getElementById('logout-confirmation-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'logout-confirmation-modal';
    overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-4';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
        <section role="dialog" aria-modal="true" aria-labelledby="logout-confirmation-title"
            class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div class="mb-3 flex items-center gap-3">
                <span class="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300">
                    <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
                </span>
                <h2 id="logout-confirmation-title" class="text-lg font-bold text-slate-900 dark:text-white">লগআউট নিশ্চিত করুন</h2>
            </div>
            <p class="mb-5 text-sm leading-6 text-slate-600 dark:text-slate-300">আপনি কি সত্যিই আপনার অ্যাকাউন্ট থেকে লগআউট করতে চান?</p>
            <div class="flex justify-end gap-2">
                <button type="button" data-logout-cancel class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">বাতিল</button>
                <button type="button" data-logout-confirm class="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">লগআউট</button>
            </div>
        </section>`;
    document.body.appendChild(overlay);

    const closeDialog = () => overlay.remove();
    overlay.querySelector('[data-logout-cancel]').addEventListener('click', closeDialog);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeDialog();
    });
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeDialog();
    });
    const confirmButton = overlay.querySelector('[data-logout-confirm]');
    confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = 'লগআউট হচ্ছে...';
        try {
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            console.error('Logout Error:', error);
            closeDialog();
            alert('লগআউট করতে ব্যর্থ হয়েছে।');
        }
    });
    overlay.querySelector('[data-logout-cancel]').focus();
};

/**
 * Double-confirmed, password-verified account deletion.
 * Password reset exactly reuses Firebase sendPasswordResetEmail from the existing
 * Medical-Admission-Tracker-login website's Forgot Password flow.
 */
window.handleAccountDeletion = function() {
    if (document.getElementById('account-delete-confirmation-modal')) return;
    const user = auth.currentUser || window.app?.authUser;
    const hasEmailPassword = Boolean(user && user.email && Array.isArray(user.providerData) &&
        user.providerData.some(provider => provider && provider.providerId === 'password'));
    if (!hasEmailPassword) {
        alert('Account delete করতে registered email/password account-এ sign in করুন।');
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'account-delete-confirmation-modal';
    overlay.className = 'fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/70 p-4';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="account-delete-title"
        class="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-2xl dark:border-red-900 dark:bg-slate-900">
        <div class="mb-3 flex items-center gap-3">
          <span class="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          </span>
          <h2 id="account-delete-title" class="text-lg font-bold text-slate-900 dark:text-white">Are you sure to delete this account?</h2>
        </div>
        <p class="mb-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          এটি শুধু logout নয়। আপনার Firebase account, Medical profile, XP/RP/rank, stored exam attempts এবং Friends requests/connections স্থায়ীভাবে মুছে যাবে।
        </p>
        <p class="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold leading-5 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          এই কাজ undo করা যাবে না। চালিয়ে যেতে দ্বিতীয়বার নিশ্চিত করতে হবে এবং account password যাচাই হবে।
        </p>
        <div class="flex justify-end gap-2">
          <button type="button" data-account-delete-cancel class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
          <button type="button" data-account-delete-next class="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Continue</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);

    const closeDialog = () => overlay.remove();
    overlay.querySelector('[data-account-delete-cancel]').addEventListener('click', closeDialog);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') closeDialog(); });

    overlay.querySelector('[data-account-delete-next]').addEventListener('click', () => {
        const dialog = overlay.querySelector('[role="dialog"]');
        dialog.innerHTML = `
          <div class="mb-3 flex items-center gap-3">
            <span class="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300">
              <i class="fa-solid fa-user-xmark" aria-hidden="true"></i>
            </span>
            <h2 id="account-delete-title" class="text-lg font-bold text-slate-900 dark:text-white">Are you sure to delete this account?</h2>
          </div>
          <p class="mb-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Final confirmation for <strong data-account-delete-email></strong>. This permanently deletes your account and connected Medical data. Enter your current password to confirm.</p>
          <form id="account-delete-form" class="space-y-3">
            <label for="account-delete-password" class="block text-sm font-semibold text-slate-800 dark:text-slate-100">Verify current password</label>
            <input id="account-delete-password" name="password" type="password" required autocomplete="current-password"
              class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              placeholder="Account password">
            <button type="button" data-account-delete-reset class="text-sm font-semibold text-sky-700 underline hover:text-sky-900 dark:text-sky-300">Forgot password? Send reset link</button>
            <p id="account-delete-status" class="hidden rounded-xl p-3 text-sm leading-5" role="status" aria-live="polite"></p>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" data-account-delete-cancel class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" data-account-delete-final class="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Verify password &amp; delete account</button>
            </div>
          </form>
        `;
        dialog.querySelector('[data-account-delete-email]').textContent = String(user.email || '');
        dialog.querySelector('[data-account-delete-cancel]').addEventListener('click', closeDialog);
        const passwordInput = dialog.querySelector('#account-delete-password');
        const status = dialog.querySelector('#account-delete-status');
        const setDeleteStatus = (message, isError = false) => {
          if (!status) return;
          status.textContent = String(message || '');
          status.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'bg-emerald-50', 'text-emerald-700', 'dark:bg-red-950/30', 'dark:text-red-300', 'dark:bg-emerald-950/30', 'dark:text-emerald-300');
          status.classList.add(isError ? 'bg-red-50' : 'bg-emerald-50', isError ? 'text-red-700' : 'text-emerald-700', isError ? 'dark:bg-red-950/30' : 'dark:bg-emerald-950/30', isError ? 'dark:text-red-300' : 'dark:text-emerald-300');
        };

        dialog.querySelector('[data-account-delete-reset]').addEventListener('click', async event => {
          const button = event.currentTarget;
          button.disabled = true;
          setDeleteStatus('Medical login website-এর reset-link flow ব্যবহার করে email request পাঠানো হচ্ছে…');
          try {
            await sendPasswordResetEmail(auth, user.email);
            setDeleteStatus('Password reset link পাঠানো হয়েছে। ' + user.email + '-এর Inbox/Spam দেখুন; password reset করে ফিরে এসে আবার verification করুন।');
          } catch (error) {
            console.warn('[Account deletion] Password reset request result:', error);
            setDeleteStatus('Password reset request process করা হয়েছে। ' + user.email + '-এর Inbox/Spam দেখুন; প্রয়োজনে Medical login page-এর Forgot Password ব্যবহার করুন।');
          } finally {
            button.disabled = false;
          }
        });

        dialog.querySelector('#account-delete-form').addEventListener('submit', async event => {
          event.preventDefault();
          const confirmButton = dialog.querySelector('[data-account-delete-final]');
          const resetButton = dialog.querySelector('[data-account-delete-reset]');
          const password = String(passwordInput.value || '');
          if (!password) { setDeleteStatus('Account password দিন।', true); passwordInput.focus(); return; }
          confirmButton.disabled = true;
          passwordInput.disabled = true;
          resetButton.disabled = true;
          confirmButton.textContent = 'Verifying password…';
          setDeleteStatus('Password যাচাই হচ্ছে। তারপর account data delete হবে…');

          try {
            const liveUser = auth.currentUser;
            if (!liveUser || liveUser.uid !== user.uid) throw new Error('Active login account বদলে গেছে। আবার নিজের account-এ sign in করুন।');

            // 1. Verify the current account password before any deletion starts.
            const credential = EmailAuthProvider.credential(liveUser.email, password);
            await reauthenticateWithCredential(liveUser, credential);

            // 2. Delete server-side Medical profile, exam history, and friend links.
            const endpoint = String(window.MED_LEADERBOARD_API_URL || '').trim();
            if (!endpoint) throw new Error('Medical backend URL পাওয়া যায়নি। Account delete করা হয়নি।');
            const token = await liveUser.getIdToken(true);
            const response = await fetch(endpoint, {
              method: 'POST',
              mode: 'cors',
              credentials: 'omit',
              cache: 'no-store',
              redirect: 'follow',
              headers: { 'Accept': 'application/json,text/plain,*/*', 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'deleteAccount', idToken: token })
            });
            const raw = await response.text();
            let data;
            try { data = JSON.parse(raw); }
            catch (_) { throw new Error('Medical backend JSON response দেয়নি। Latest Code.gs deploy না হওয়ায় account delete করা হয়নি।'); }
            if (!response.ok || data.success === false || data.deleted !== true) {
              const apiError = String(data.error || data.message || 'Medical account data delete হয়নি।');
              if (/unknown action|unsupported action/i.test(apiError)) {
                throw new Error('Live Apps Script-এ deleteAccount action নেই। Latest Medical_Admission_Tracker_Backend.gs deploy না হওয়া পর্যন্ত account delete করা হয়নি।');
              }
              throw new Error(apiError);
            }

            // 3. Remove the user's Firestore profile, then remove Firebase Auth access.
            try {
              await deleteDoc(doc(db, 'students', liveUser.uid));
            } catch (firestoreError) {
              console.error('[Account deletion] Firestore profile cleanup failed after Medical Sheets cleanup:', firestoreError);
              throw new Error('Medical Sheets-এর account data delete হয়েছে, কিন্তু Firestore profile remove হয়নি। Account login এখনও delete করা হয়নি; আবার চেষ্টা করুন।');
            }
            await deleteUser(liveUser);

            // Remove only this account's local records; app-wide preferences remain.
            const uid = String(user.uid);
            [
              'med_history_' + uid,
              'med_seen_questions_' + uid,
              'med_answered_questions_' + uid,
              'med_practiced_questions_' + uid,
              'med_review_history_v2_' + uid,
              'med_profile_avatar_v1_' + uid,
              'med_profile_avatar_manual_v1_' + uid,
              'med_sheet_profile_v1_' + uid,
              'med_account_progress_v1_' + uid,
              'med_sheet_selected_rank_v1_' + uid
            ].forEach(key => { try { localStorage.removeItem(key); } catch (_) {} });

            try {
              const queue = JSON.parse(localStorage.getItem('med_sheet_exam_pending_v1') || '[]');
              if (Array.isArray(queue)) {
                localStorage.setItem('med_sheet_exam_pending_v1', JSON.stringify(queue.filter(item => String(item && item.userId || '') !== uid)));
              }
            } catch (_) {}
            ['med_sheet_leaderboard_cache_v1_all-time','med_sheet_leaderboard_cache_v1_weekly','med_sheet_leaderboard_cache_v1_friends']
              .forEach(key => { try { localStorage.removeItem(key); } catch (_) {} });
            try {
              const remembered = JSON.parse(localStorage.getItem('med_recent_accounts_v1') || '[]');
              if (Array.isArray(remembered)) {
                localStorage.setItem('med_recent_accounts_v1', JSON.stringify(remembered.filter(item =>
                  String(item && item.email || '').toLowerCase() !== String(user.email || '').toLowerCase()
                )));
              }
            } catch (_) {}
            overlay.remove();
            window.location.reload();
          } catch (error) {
            console.error('[Account deletion] Account delete failed:', error);
            let message = String(error && error.message || error || 'Account delete failed.');
            if (error && (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials')) {
              message = 'Password সঠিক নয়। আবার দিন, অথবা Forgot password দিয়ে reset link পাঠান।';
            } else if (error && error.code === 'auth/requires-recent-login') {
              message = 'Password verification complete হয়নি। আবার password দিয়ে চেষ্টা করুন।';
            } else if (error && /auth\/network-request-failed/.test(String(error.code || ''))) {
              message = 'Network সমস্যা হয়েছে। Internet check করে আবার চেষ্টা করুন।';
            }
            setDeleteStatus(message, true);
            confirmButton.disabled = false;
            passwordInput.disabled = false;
            resetButton.disabled = false;
            confirmButton.textContent = 'Verify password & delete account';
            passwordInput.focus();
          }
        });
        passwordInput.focus();
    });
    overlay.querySelector('[data-account-delete-cancel]').focus();
};


/* Exam timing + student XP/points foundation.
   Existing question data and scoring rules remain authoritative. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__examProgressFoundation) return;
  app.__examProgressFoundation = true;
  const accountKey = () => 'med_account_progress_v1_' + (app.authUser?.uid || 'guest');
  const PENDING_PB_DELAY_MS = 2 * 60 * 60 * 1000;
  const pendingPBTotal = progress => (Array.isArray(progress.pendingPBEntries) ? progress.pendingPBEntries : []).reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
  const readProgress = () => {
    try {
      const data = JSON.parse(localStorage.getItem(accountKey()) || '{}');
      const xp = Math.max(0, Number(data.xp ?? data.performanceBonus) || 0);
      return { ...data, rankPoints: Math.max(0, Number(data.rankPoints) || 0), pendingPBEntries: Array.isArray(data.pendingPBEntries) ? data.pendingPBEntries.filter(entry => Number(entry?.amount) > 0 && Number.isFinite(Number(entry?.convertsAt))).map(entry => ({ id: String(entry.id || ''), amount: Math.floor(Number(entry.amount)), earnedAt: Number(entry.earnedAt) || 0, convertsAt: Number(entry.convertsAt) })) : [], pendingPB: 0, xp, performanceBonus: xp, completedExams: Math.max(0, Number(data.completedExams) || 0), streak: Math.max(0, Number(data.streak) || 0), lastExamDate: String(data.lastExamDate || ''), lastStreakActivityDate: String(data.lastStreakActivityDate || ''), highestStreak: Math.max(0, Number(data.highestStreak || data.maxStreak) || 0), streakActivityDates: Array.isArray(data.streakActivityDates) ? Array.from(new Set(data.streakActivityDates.map(String).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))).slice(-366) : [], streakSyncPending: !!data.streakSyncPending, rewarded: Array.isArray(data.rewarded) ? data.rewarded : [] };
    } catch (_) { return {rankPoints:0,pendingPBEntries:[],pendingPB:0,xp:0,performanceBonus:0,completedExams:0,streak:0,lastExamDate:'',lastStreakActivityDate:'',highestStreak:0,streakActivityDates:[],streakSyncPending:false,rewarded:[]}; }
  };
  const saveProgress = data => {
    data.rankPoints = Math.max(0, Number(data.rankPoints) || 0);
    data.pendingPBEntries = Array.isArray(data.pendingPBEntries) ? data.pendingPBEntries : [];
    data.xp = Math.max(0, Number(data.xp ?? data.performanceBonus) || 0);
    // Legacy compatibility only; account levels now use XP.
    data.performanceBonus = data.xp;
    localStorage.setItem(accountKey(), JSON.stringify(data));
  };
  function consumePendingPB(progress, amount) {
    let remaining = amount;
    const next = [];
    const entries = (Array.isArray(progress.pendingPBEntries) ? progress.pendingPBEntries : []).slice().sort((a, b) => Number(a.earnedAt || 0) - Number(b.earnedAt || 0));
    for (const entry of entries) {
      const available = Math.max(0, Number(entry.amount) || 0);
      const used = Math.min(available, remaining);
      remaining -= used;
      if (available > used) next.push({ ...entry, amount: available - used });
    }
    if (remaining > 0) return false;
    progress.pendingPBEntries = next;
    return true;
  }
  function syncRankProgress(progress, reason = 'progress') {
    // The Google Sheets API is authoritative for the global leaderboard.
    // Local learning-progress events never write Firebase leaderboard documents.
    document.dispatchEvent(new CustomEvent('student-progress-updated', {
      detail: { ...progress, pendingPB: pendingPBTotal(progress), source: reason || 'local-progress' }
    }));
  }
    function settleDuePB(progress, now = Date.now()) {
    const entries = Array.isArray(progress.pendingPBEntries) ? progress.pendingPBEntries : [];
    let converted = 0;
    const pending = [];
    entries.forEach(entry => {
      const amount = Math.max(0, Number(entry.amount) || 0);
      if (amount && Number(entry.convertsAt) <= now) converted += amount;
      else if (amount) pending.push(entry);
    });
    progress.pendingPBEntries = pending;
    if (converted) progress.rankPoints += converted;
    return converted;
  }
  const roundRequirementToFive = value => Math.max(5, Math.round(Number(value || 0) / 5) * 5);
  const requiredXPForLevel = level => {
    const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
    const base = currentLevel * 500;
    return roundRequirementToFive(currentLevel === 1 ? base : base * 1.3);
  };
  const getPerformanceLevelProgress = totalXP => {
    let remaining = Math.max(0, Number(totalXP) || 0);
    let level = 1, guard = 0, required = requiredXPForLevel(level);
    while (remaining >= required && guard < 1000) {
      remaining -= required;
      level++;
      guard++;
      required = requiredXPForLevel(level);
    }
    return { level, required, remaining, toNext: Math.max(0, required - remaining), percent: required > 0 ? Math.min(100, Math.round(remaining / required * 100)) : 100 };
  };
  app.getPerformanceLevelProgress = getPerformanceLevelProgress;
  app.settlePendingPB = function(now = Date.now()) {
    const progress = readProgress();
    const converted = settleDuePB(progress, now);
    if (!converted) return { ok: true, convertedPB: 0, rankPoints: progress.rankPoints, pendingPB: pendingPBTotal(progress) };
    saveProgress(progress);
    syncRankProgress(progress, 'Automatic PB-to-RP conversion');
    document.dispatchEvent(new CustomEvent('student-progress-updated', {
      detail: { ...progress, pendingPB: pendingPBTotal(progress), autoConversion: { pb: converted, rp: converted } }
    }));
    return { ok: true, convertedPB: converted, rankPoints: progress.rankPoints, pendingPB: pendingPBTotal(progress) };
  };
  app.getAccountProgress = () => {
    app.settlePendingPB();
    const progress = readProgress();
    progress.pendingPB = pendingPBTotal(progress);
    return { ...progress };
  };
  // Daily streak tracks a student's visit/activity on the site, not only exam submissions.
  // The date and streak are written locally first, so offline visits are never lost.
  function dhakaDate(offsetDays = 0) {
    const date = new Date(Date.now() + offsetDays * 86400000);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + '-' + values.month + '-' + values.day;
  }
  app.recordDailyStreakActivity = function() {
    const progress = readProgress();
    const today = dhakaDate();
    const yesterday = dhakaDate(-1);
    const previousDate = String(progress.lastStreakActivityDate || progress.lastExamDate || '');
    if (previousDate !== today) {
      if (previousDate === yesterday) progress.streak = Math.max(0, Number(progress.streak) || 0) + 1;
      else progress.streak = 1;
      progress.lastStreakActivityDate = today;
      progress.streakActivityDates = Array.isArray(progress.streakActivityDates) ? progress.streakActivityDates : [];
      if (!progress.streakActivityDates.includes(today)) progress.streakActivityDates.push(today);
      progress.streakActivityDates = Array.from(new Set(progress.streakActivityDates)).sort().slice(-366);
      progress.highestStreak = Math.max(
        Number(progress.highestStreak || progress.maxStreak) || 0,
        Number(progress.streak) || 0
      );
      progress.streakSyncPending = true;
      saveProgress(progress);
      syncRankProgress(progress, 'daily-streak-activity');
    } else {
      progress.streakActivityDates = Array.isArray(progress.streakActivityDates) ? progress.streakActivityDates : [];
      const needsHistorySync = !progress.lastStreakActivityDate || !progress.streakActivityDates.includes(today);
      if (!progress.streakActivityDates.includes(today)) {
        progress.streakActivityDates.push(today);
        progress.streakActivityDates = Array.from(new Set(progress.streakActivityDates)).sort().slice(-366);
      }
      if (!progress.lastStreakActivityDate) progress.lastStreakActivityDate = today;
      // A legacy lastExamDate can equal today before the daily-visit tracker stores this date.
      // Queue one idempotent sync without incrementing the streak.
      if (needsHistorySync) progress.streakSyncPending = true;
      progress.highestStreak = Math.max(Number(progress.highestStreak || progress.maxStreak) || 0, Number(progress.streak) || 0);
      saveProgress(progress);
    }
    return { streak: Math.max(0, Number(progress.streak) || 0), lastStreakActivityDate: String(progress.lastStreakActivityDate || today), highestStreak: Math.max(0, Number(progress.highestStreak || progress.maxStreak) || 0), pending: !!progress.streakSyncPending };
  };
  function trackDailyVisit() {
    try { app.recordDailyStreakActivity(); } catch (_) {}
  }
  // Track on page entry and when returning to the site on a later day.
  trackDailyVisit();
  window.addEventListener('student-auth-state-resolved', trackDailyVisit);
  window.addEventListener('student-profile-loaded', trackDailyVisit);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) trackDailyVisit();
  });
  function getConvertibleProgress() {
    app.settlePendingPB();
    return readProgress();
  }
  app.convertPBToXP = function(amount) {
    const pointsToConvert = Math.floor(Number(amount));
    if (!Number.isFinite(pointsToConvert) || pointsToConvert <= 0) return { ok: false, message: 'Enter a whole PB amount greater than zero.' };
    const progress = getConvertibleProgress();
    if (pointsToConvert > pendingPBTotal(progress)) return { ok: false, message: 'You do not have enough pending PB. PB older than 2 hours has already become RP.' };
    if (!consumePendingPB(progress, pointsToConvert)) return { ok: false, message: 'Unable to use the selected pending PB.' };
    progress.xp += pointsToConvert * 2;
    progress.performanceBonus = progress.xp;
    saveProgress(progress);
    syncRankProgress(progress, 'PB-to-XP conversion');
    document.dispatchEvent(new CustomEvent('student-progress-updated', {
      detail: { ...progress, pendingPB: pendingPBTotal(progress), conversion: { pb: pointsToConvert, xp: pointsToConvert * 2 } }
    }));
    return { ok: true, convertedPB: pointsToConvert, earnedXP: pointsToConvert * 2, rankPoints: progress.rankPoints, pendingPB: pendingPBTotal(progress), xp: progress.xp };
  };
  app.convertPBToRP = function(amount) {
    const pointsToConvert = Math.floor(Number(amount));
    if (!Number.isFinite(pointsToConvert) || pointsToConvert <= 0) return { ok: false, message: 'Enter a whole PB amount greater than zero.' };
    const progress = getConvertibleProgress();
    if (pointsToConvert > pendingPBTotal(progress)) return { ok: false, message: 'You do not have enough pending PB. PB older than 2 hours has already become RP.' };
    if (!consumePendingPB(progress, pointsToConvert)) return { ok: false, message: 'Unable to use the selected pending PB.' };
    progress.rankPoints += pointsToConvert;
    saveProgress(progress);
    syncRankProgress(progress, 'Manual PB-to-RP conversion');
    document.dispatchEvent(new CustomEvent('student-progress-updated', {
      detail: { ...progress, pendingPB: pendingPBTotal(progress), conversion: { pb: pointsToConvert, rp: pointsToConvert } }
    }));
    return { ok: true, convertedPB: pointsToConvert, earnedRP: pointsToConvert, rankPoints: progress.rankPoints, pendingPB: pendingPBTotal(progress) };
  };
  // The tab can mature PB while open; opening/returning to the page also settles overdue entries.
  const settlePBNow = () => app.settlePendingPB();
  window.addEventListener('load', settlePBNow);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settlePBNow(); });
  window.setInterval(settlePBNow, 30000);
  const calculateExamReward = (state, correct) => {
    const is100MarkModelTest = Array.isArray(state?.questions) && state.questions.length >= 100;
    let weightedCorrect = Math.max(0, Number(correct) || 0);
    if (is100MarkModelTest) {
      const blocks = [
        { upTo: 40, multiplier: 1 },
        { upTo: 50, multiplier: 2 },
        { upTo: 60, multiplier: 4 },
        { upTo: 70, multiplier: 5 },
        { upTo: 79, multiplier: 7 },
        { upTo: 100, multiplier: 10 }
      ];
      let previous = 0;
      weightedCorrect = 0;
      for (const block of blocks) {
        const count = Math.max(0, Math.min(Number(correct) || 0, block.upTo) - previous);
        weightedCorrect += count * block.multiplier;
        previous = block.upTo;
      }
      // Exams above 100 marks keep the top-tier PB multiplier for every additional correct answer.
      weightedCorrect += Math.max(0, (Number(correct) || 0) - 100) * 10;
    }
    return { rankPoints: weightedCorrect * 15, xp: 0, weightedCorrect, is100MarkModelTest };
  };
  const durationFor = (count, ratio = 0.5) => Math.max(1, Math.round(Number(count || 0) * ratio));
  const modelCounts = [20, 30, 50, 75, 100];
  const modelNoteText = count => 'Model Test: ' + count + ' marks · ' + count + ' questions · ' + durationFor(count, 0.6) + ' minutes (automatic) · Source: all Question Bank questions';
  const originalSetSetupQuestions = app.setSetupQuestions.bind(app);
  app.setSetupQuestions = function(count) {
    originalSetSetupQuestions(count);
    if (this.setup.mode === 'model') {
      const selectedCount = modelCounts.includes(Number(count)) ? Number(count) : 50;
      this.setup.questionsCount = selectedCount;
      this.setup.durationMins = durationFor(selectedCount, 0.6);
      this.setup.subject = 'all';
      const subjectSelect = document.getElementById('setup-subject');
      if (subjectSelect) subjectSelect.value = 'all';
      const yearSelect = document.getElementById('setup-year');
      if (yearSelect) yearSelect.value = 'all';
      const note = document.getElementById('model-test-fixed-note');
      if (note) note.textContent = modelNoteText(selectedCount);
      this.updateSetupUI();
    }
  };
  const originalSetSetupMode = app.setSetupMode.bind(app);
  app.setSetupMode = function(mode) {
    originalSetSetupMode(mode);
    const durationArea = document.querySelector('#view-setup .time-btn')?.closest('.space-y-2');
    const modeArea = document.getElementById('setup-mode-options');
    const subjectArea = document.getElementById('setup-subject-area');
    const yearArea = document.getElementById('setup-year-area');
    const title = document.getElementById('setup-title');
    const subtitle = document.getElementById('setup-subtitle');
    const countLabel = document.getElementById('setup-question-count-label');
    const note = document.getElementById('model-test-fixed-note');
    if (modeArea) modeArea.classList.toggle('hidden', mode === 'model');
    if (subjectArea) subjectArea.classList.toggle('hidden', mode === 'model');
    if (yearArea) yearArea.classList.toggle('hidden', mode === 'model');
    if (durationArea) durationArea.classList.toggle('hidden', mode === 'model');
    if (title) title.textContent = mode === 'model' ? 'Model Test Setup' : 'পরীক্ষার সেটআপ নির্বাচন করুন';
    if (subtitle) subtitle.textContent = mode === 'model'
      ? 'Question Bank-এর সব প্রশ্ন থেকে নির্ধারিত মার্কস অনুযায়ী পরীক্ষা দিন। সময় স্বয়ংক্রিয়ভাবে নির্ধারিত হবে।'
      : 'আপনার পছন্দমতো বিষয়, প্রশ্ন সংখ্যা এবং সময় নির্ধারণ করুন';
    if (countLabel) countLabel.textContent = mode === 'model' ? 'মার্কস / প্রশ্নের সংখ্যা' : 'প্রশ্নের সংখ্যা';
    document.querySelectorAll('.q-count-btn').forEach(btn => {
      btn.classList.toggle('hidden', mode === 'model' && !modelCounts.includes(Number(btn.textContent.trim())));
    });
    if (note) {
      note.classList.toggle('hidden', mode !== 'model');
      if (mode === 'model') {
        this.setup.questionsCount = modelCounts.includes(Number(this.setup.questionsCount)) ? Number(this.setup.questionsCount) : 50;
        this.setup.subject = 'all';
        this.setup.durationMins = durationFor(this.setup.questionsCount, 0.6);
        const subjectSelect = document.getElementById('setup-subject');
        if (subjectSelect) subjectSelect.value = 'all';
        const yearSelect = document.getElementById('setup-year');
        if (yearSelect) yearSelect.value = 'all';
        note.textContent = modelNoteText(this.setup.questionsCount);
      }
    }
  };
  const originalPrepare = app.prepareExamFromSetup.bind(app);
  app.prepareExamFromSetup = function() {
    if (this.setup.mode === 'model') {
      this.setup.questionsCount = modelCounts.includes(Number(this.setup.questionsCount)) ? Number(this.setup.questionsCount) : 50;
      this.setup.subject = 'all';
      const subjectSelect = document.getElementById('setup-subject');
      if (subjectSelect) subjectSelect.value = 'all';
      const yearSelect = document.getElementById('setup-year');
      if (yearSelect) yearSelect.value = 'all';
      this.setup.durationMins = durationFor(this.setup.questionsCount, 0.6);
    } else if (this.setup.mode === 'random') {
      this.setup.durationMins = durationFor(this.setup.questionsCount);
    }
    return originalPrepare();
  };
  const originalSubmitExamForProgress = app.submitExam.bind(app);
  app.submitExam = function(autoSubmitted = false) {
    const state = this.examState;
    if (!state || state.submitted) return originalSubmitExamForProgress(autoSubmitted);
    const attemptId = String(state.startedAt || Date.now());
    const progress = readProgress();
    const alreadyTracked = progress.rewarded.includes(attemptId);
    const result = originalSubmitExamForProgress(autoSubmitted);
    if (!alreadyTracked && state.submitted) {
      // Record learning activity locally, but do not award XP/RP here.
      // Medical XP/RP are authoritative in the separate Google Sheets API.
      const now = new Date();
      progress.completedExams = Math.max(0, Number(progress.completedExams) || 0) + 1;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      if (progress.lastExamDate !== today) {
        progress.streak = progress.lastExamDate === yesterday ? Math.max(0, Number(progress.streak) || 0) + 1 : 1;
        progress.lastExamDate = today;
      }
      // Preserve the best consecutive-day streak for this account.
      progress.highestStreak = Math.max(
        Math.max(0, Number(progress.highestStreak || progress.maxStreak) || 0),
        Math.max(0, Number(progress.streak) || 0)
      );
      // Prevent the previous browser-only PB->RP conversion system from adding
      // a second reward balance beside the Medical API.
      progress.pendingPBEntries = [];
      progress.pendingPB = 0;
      progress.rewarded.push(attemptId);
      if (progress.rewarded.length > 500) progress.rewarded = progress.rewarded.slice(-500);
      saveProgress(progress);
      document.dispatchEvent(new CustomEvent('student-progress-updated', {
        detail: { ...progress, pendingPB: 0, source: 'medical-exam-completed' }
      }));
    }
    return result;
  };
  window.addEventListener('load', () => {
    const note = document.getElementById('model-test-fixed-note');
    if (note && app.setup?.mode === 'model') {
      note.classList.remove('hidden');
      note.textContent = modelNoteText(app.setup.questionsCount);
    }
  });
})();
