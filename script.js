/* Medical Admission Tester - application engine
 * Questions are loaded from ./questions.json at runtime.
 * Firebase configuration/auth remains external and is never hard-coded here.
 */

let QUESTION_BANK = [];

class MedicalExamApp {
            constructor() {
                this.views = ['home', 'question-bank', 'practice', 'exam-intro', 'previous', 'setup', 'exam', 'result', 'review', 'profile', 'leaderboard', 'syllabus'];
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
                this.leaderboardCacheKey = 'med_leaderboard_cache_v5';
                this.leaderboardLocalKey = 'med_leaderboard_local_v1';
                this.leaderboardSyncKey = 'med_leaderboard_sync_queue_v1';
                this.firestore = null;
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
                this.auth = null;
                this.authMode = 'login';
                this.authReady = false;
                this.examActive = false;
                this.beforeUnloadHandler = (event) => { if (this.examActive && !this.examState.submitted) { event.preventDefault(); event.returnValue = ''; } };
                window.addEventListener('beforeunload', this.beforeUnloadHandler);
                window.addEventListener('popstate', () => { if (this.examActive && !this.examState.submitted) { history.pushState({ exam: true }, '', window.location.href); this.confirmSubmitExam('navigation'); } });

                this.init();
            }

            async init() {
                // Apply theme and show the existing home UI immediately.
                this.applyTheme();
                this.applyLanguage();
                history.replaceState({ app: true }, '', window.location.href);
                this.showView('home');
                this.setDataStatus('loading');

                // Firebase/auth should never prevent Guest mode.
                this.initAuth();

                try {
                    await this.loadQuestionBank();
                    this.updateSubjectCountsUI();
                    this.updateSetupUI();
                    this.loadProgressStats();
                    this.setDataStatus('ready');
                } catch (error) {
                    console.error('Question bank initialization failed:', error);
                    this.updateSubjectCountsUI();
                    this.updateSetupUI();
                    this.loadProgressStats();
                    this.setDataStatus('error', error.message || 'questions.json লোড করা যায়নি।');
                }
            }


            setDataStatus(state, message = '') {
                const el = document.getElementById('question-data-status');
                if (!el) return;
                el.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-xs';
                if (state === 'ready') {
                    el.classList.add('hidden');
                    return;
                }
                el.classList.remove('hidden');
                if (state === 'loading') {
                    el.classList.add('text-blue-700', 'dark:text-blue-300', 'bg-blue-50', 'dark:bg-blue-950/30');
                    el.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-1"></i> প্রশ্ন ব্যাংক লোড হচ্ছে...';
                } else {
                    el.classList.add('text-red-700', 'dark:text-red-300', 'bg-red-50', 'dark:bg-red-950/30');
                    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation ml-1"></i> ${this.escapeHtml(message || 'প্রশ্ন ব্যাংক লোড করা যায়নি।')}`;
                }
            }

            showDataError(message) {
                this.setDataStatus('error', message);
            }

            async loadQuestionBank() {
                const cacheBuster = `?v=${Date.now()}`;
                const response = await fetch(`./questions.json${cacheBuster}`, {
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
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
            }

            normalizeQuestion(q, index) {
                if (!q || typeof q !== 'object') return null;

                const rawOptions = Array.isArray(q.options)
                    ? q.options
                    : ['A', 'B', 'C', 'D'].map(k => q.options && q.options[k]);

                const options = rawOptions.map(v => String(v ?? '').trim());
                if (options.length !== 4 || options.some(v => !v)) {
                    console.warn(`Skipping invalid question at index ${index}: options missing`);
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

                if (answer < 0 || answer > 3) {
                    console.warn(`Skipping invalid question at index ${index}: correct answer missing`);
                    return null;
                }

                const questionText = String(q.question ?? q.questionText ?? '').trim();
                if (!questionText) {
                    console.warn(`Skipping invalid question at index ${index}: question text missing`);
                    return null;
                }

                const source = String(q.source || 'Model Test').trim();
                const year = q.year === null || q.year === undefined || q.year === ''
                    ? null
                    : String(q.year).trim();

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
                    if (typeof firebase === 'undefined' || !firebase.auth) {
                        this.setAuthState(null, 'Firebase Authentication is not available; Guest mode remains available.');
                        return;
                    }

                    if (!firebase.apps?.length) {
                        const config = window.FIREBASE_CONFIG || window.firebaseConfig || window.__FIREBASE_CONFIG__;
                        if (config && typeof firebase.initializeApp === 'function') {
                            firebase.initializeApp(config);
                        }
                    }

                    if (!firebase.apps?.length) {
                        this.setAuthState(null, 'Firebase configuration is unavailable; Guest mode remains available.');
                        return;
                    }

                    this.auth = firebase.auth();
                    this.firestore = firebase.firestore ? firebase.firestore() : null;
                    this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
                        console.warn('Firebase persistence could not be set:', err);
                    });

                    this.auth.onAuthStateChanged(user => { this.setAuthState(user); if (user) this.loadUserProfile(); });
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

                this.loadProgressStats();
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

                try {
                    if (message) message.textContent = 'অনুগ্রহ করে অপেক্ষা করুন...';
                    let result;
                    if (this.authMode === 'register') {
                        result = await this.auth.createUserWithEmailAndPassword(email, password);
                        if (name && result.user?.updateProfile) { await result.user.updateProfile({ displayName: name }); }
                        if (this.firestore && result.user) {
                            await this.firestore.collection('students').doc(result.user.uid).set({
                                uid: result.user.uid, name: name || '', college: college || '', mobile: mobile || '', email, class: studentClass || '', bloodGroup: bloodGroup || '',
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp(), createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        }
                    } else {
                        result = await this.auth.signInWithEmailAndPassword(email, password);
                    }
                    this.closeAuthModal();
                    this.setAuthState(result.user);
                } catch (error) {
                    console.error('Authentication error:', error);
                    if (message) message.textContent = this.friendlyAuthError(error);
                }
            }

            async logout() {
                try {
                    if (this.auth) await this.auth.signOut();
                    this.closeAuthModal();
                } catch (error) {
                    console.error('Logout error:', error);
                    const message = document.getElementById('authMessage');
                    if (message) message.textContent = this.friendlyAuthError(error);
                }
            }

            continueAsGuest() {
                this.authUser = null;
                localStorage.setItem('med_guest_mode', 'true');
                this.closeAuthModal();
                this.setAuthState(null);
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

            // Single-language UI: natural Bengali with standard English medical/technical terms where appropriate.
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

            // Previous-year browser (read-only; quiz is a separate action)
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
            startPreviousYearQuiz(){ if(!this.previousSelectedYear) return; this.setup.mode='previousQuiz'; this.setup.subject='all'; this.setup.questionsCount=Math.min(20,this.questionBank.filter(q=>q.year===this.previousSelectedYear&&q.isPreviousYear).length); this.setup.durationMins=10; const ys=document.getElementById('setup-year'); if(ys) ys.value=this.previousSelectedYear; this.prepareExamFromSetup(); }

            async loadUserProfile(){ if(!this.firestore||!this.authUser) return; try{ const snap=await this.firestore.collection('students').doc(this.authUser.uid).get(); this.profile=snap.exists?snap.data():{name:this.authUser.displayName||'',email:this.authUser.email||''}; this.loadProgressStats(); }catch(e){console.warn('Profile load failed',e);} }

            getDemoLeaderboardRows(){
                return [
                    {uid:'demo_01',name:'Arafat Hossain',college:'Dhaka College',points:1860,quizzes:18,correct:470,answered:520,accuracy:90.4,isDemo:true},
                    {uid:'demo_02',name:'Samiha Rahman',college:'Viqarunnisa Noon College',points:1725,quizzes:16,correct:438,answered:500,accuracy:87.6,isDemo:true},
                    {uid:'demo_03',name:'Tanvir Ahmed',college:'Notre Dame College',points:1580,quizzes:15,correct:402,answered:470,accuracy:85.5,isDemo:true},
                    {uid:'demo_04',name:'Nusrat Jahan',college:'Holy Cross College',points:1495,quizzes:14,correct:381,answered:450,accuracy:84.7,isDemo:true},
                    {uid:'demo_05',name:'Fahim Hasan',college:'Rajuk Uttara Model College',points:1360,quizzes:13,correct:352,answered:425,accuracy:82.8,isDemo:true},
                    {uid:'demo_06',name:'Mahi Islam',college:'Adamjee Cantonment College',points:1240,quizzes:12,correct:329,answered:400,accuracy:82.3,isDemo:true},
                    {uid:'demo_07',name:'Rafiul Karim',college:'Dhaka City College',points:1125,quizzes:11,correct:300,answered:375,accuracy:80.0,isDemo:true},
                    {uid:'demo_08',name:'Jannatul Ferdous',college:'Cantonment Public School & College',points:1010,quizzes:10,correct:272,answered:350,accuracy:77.7,isDemo:true}
                ];
            }
            getLocalLeaderboardRows(){
                try{
                    const raw=JSON.parse(localStorage.getItem(this.leaderboardLocalKey)||'null');
                    if(Array.isArray(raw)&&raw.length)return raw;
                }catch(e){}
                const rows=this.getDemoLeaderboardRows(); this.setLocalLeaderboardRows(rows); return rows;
            }
            setLocalLeaderboardRows(rows){
                const safe=(Array.isArray(rows)?rows:[]).map(x=>({...x,points:Number(x.points||0),quizzes:Number(x.quizzes||0),correct:Number(x.correct||0),answered:Number(x.answered||0),accuracy:Number(x.accuracy||0)}));
                localStorage.setItem(this.leaderboardLocalKey,JSON.stringify(safe));
                this.setLeaderboardCache(safe);
                return safe;
            }
            getLeaderboardCache(){ try{return JSON.parse(localStorage.getItem(this.leaderboardCacheKey)||'null');}catch{return null;} }
            setLeaderboardCache(rows){ localStorage.setItem(this.leaderboardCacheKey,JSON.stringify({savedAt:Date.now(),rows})); }
            getLeaderboardSyncQueue(){ try{const q=JSON.parse(localStorage.getItem(this.leaderboardSyncKey)||'[]');return Array.isArray(q)?q:[];}catch{return [];} }
            setLeaderboardSyncQueue(q){ localStorage.setItem(this.leaderboardSyncKey,JSON.stringify(q)); }
            queueLeaderboardSync(payload){ const q=this.getLeaderboardSyncQueue().filter(x=>x.uid!==payload.uid); q.push(payload); this.setLeaderboardSyncQueue(q); }
            getLeaderboardRowTime(row){
                if(!row) return 0;
                if(Number(row.updatedAtMs||0)) return Number(row.updatedAtMs);
                const stamp=row.updatedAt;
                if(stamp && typeof stamp.toMillis==='function') return stamp.toMillis();
                if(stamp && Number(stamp.seconds)) return Number(stamp.seconds)*1000;
                return 0;
            }
            mergeLeaderboardRows(remoteRows=[]){
                const demos=this.getDemoLeaderboardRows();
                const local=this.getLocalLeaderboardRows();
                const map=new Map();
                [...demos,...local,...(Array.isArray(remoteRows)?remoteRows:[])].forEach(row=>{
                    if(!row?.uid)return;
                    const old=map.get(row.uid);
                    if(!old || this.getLeaderboardRowTime(row)>=this.getLeaderboardRowTime(old)){ map.set(row.uid,{...old,...row}); }
                });
                return [...map.values()].sort((a,b)=>Number(b.points||0)-Number(a.points||0));
            }
            renderLeaderboardRows(rows){
                const body=document.getElementById('leaderboard-body'); if(!body)return;
                const safe=Array.isArray(rows)?rows:[];
                const podium=document.getElementById('leaderboard-podium');
                const me=document.getElementById('leaderboard-me');
                body.innerHTML='';
                if(podium) podium.innerHTML='';
                if(me){ me.innerHTML=''; me.classList.add('hidden'); }
                if(!safe.length){ body.innerHTML=`<tr><td colspan="6" class="py-12 text-center text-sm text-gray-500">এখনও কোনো leaderboard data নেই। Challenge Quiz সম্পন্ন করলে এখানে দেখা যাবে।</td></tr>`; return; }
                const top=safe.slice(0,3);
                if(podium){
                    podium.innerHTML=top.map((x,i)=>`<article class="podium-card podium-${i+1}"><div class="podium-medal">${['🥇','🥈','🥉'][i]}</div><div class="podium-avatar">${this.escapeHtml((x.name||'S').charAt(0).toUpperCase())}</div><strong>${this.escapeHtml(x.name||'Student')}</strong><span>${Number(x.points||0)} Points</span><small>${Number(x.accuracy||0).toFixed(1)}% Accuracy</small></article>`).join('');
                }
                safe.forEach((x,i)=>{
                    const tr=document.createElement('tr');
                    tr.className=`leader-row ${this.authUser?.uid===x.uid?'is-me':''}`;
                    tr.innerHTML=`<td class="py-4 px-3 font-extrabold"><span class="rank-badge ${i<3?'top-rank':''}">${i+1}</span></td><td class="py-4 px-3"><div class="leader-person"><span class="leader-avatar">${this.escapeHtml((x.name||'S').charAt(0).toUpperCase())}</span><span><b>${this.escapeHtml(x.name||'Student')}</b>${this.authUser?.uid===x.uid?'<em>YOU</em>':''}</span></div></td><td class="py-4 px-3">${this.escapeHtml(x.college||'—')}</td><td class="py-4 px-3">${x.quizzes||0}</td><td class="py-4 px-3">${Number(x.accuracy||0).toFixed(1)}%</td><td class="py-4 px-3 font-extrabold text-medical-600">${Number(x.points||0)}</td>`;
                    body.appendChild(tr);
                });
                const mine=this.authUser?.uid ? safe.find(x=>x.uid===this.authUser.uid) : null;
                if(me && mine){ me.classList.remove('hidden'); me.innerHTML=`<div><span>Your Position</span><strong>#${safe.indexOf(mine)+1}</strong></div><div><b>${this.escapeHtml(mine.name||'Student')}</b><small>${Number(mine.accuracy||0).toFixed(1)}% accuracy • ${Number(mine.points||0)} points</small></div>`; }
            }
            async recordLeaderboardResult({correctCount,wrongCount,totalQuestions,quizPoints,accuracy}){
                const uid=this.authUser?.uid || 'guest_local';
                const name=this.profile?.name||this.authUser?.displayName||this.authUser?.email||'Guest Student';
                const college=this.profile?.college||'';
                const current=this.getLocalLeaderboardRows().find(x=>x.uid===uid)||{uid,name,college,points:0,quizzes:0,correct:0,answered:0};
                const nextCorrect=Number(current.correct||0)+Number(correctCount||0);
                const nextAnswered=Number(current.answered||0)+Number(correctCount||0)+Number(wrongCount||0);
                const updated={...current,name,college,points:Number(current.points||0)+Number(quizPoints||0),quizzes:Number(current.quizzes||0)+1,correct:nextCorrect,answered:nextAnswered,accuracy:Number((nextCorrect/Math.max(1,nextAnswered)*100).toFixed(1)),updatedAtMs:Date.now(),isDemo:false};
                const rows=this.getLocalLeaderboardRows().filter(x=>x.uid!==uid);
                rows.push(updated);
                const merged=this.mergeLeaderboardRows(rows);
                this.setLocalLeaderboardRows(merged);
                this.renderLeaderboardRows(merged);

                if(!this.authUser||!this.firestore){
                    if(this.authUser) this.queueLeaderboardSync({...updated, meta:{correctCount,wrongCount,totalQuestions,quizPoints,accuracy}});
                    return;
                }
                await this.syncLeaderboardUser(updated, {correctCount,wrongCount,totalQuestions,quizPoints,accuracy});
            }
            async syncLeaderboardUser(updated, meta={}){
                if(!this.authUser||!this.firestore)return false;
                const attemptId=`${this.authUser.uid}_${this.examState.startedAt||Date.now()}`;
                try{
                    const attemptRef=this.firestore.collection('quizAttempts').doc(attemptId);
                    const existing=await attemptRef.get(); if(existing.exists)return true;
                    await this.firestore.runTransaction(async tx=>{
                        tx.set(attemptRef,{uid:this.authUser.uid,quizPoints:Number(meta.quizPoints)||0,correct:Number(meta.correctCount)||0,wrong:Number(meta.wrongCount)||0,total:Number(meta.totalQuestions)||0,accuracy:Number(meta.accuracy)||0,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
                        tx.set(this.firestore.collection('leaderboard').doc(this.authUser.uid),{uid:this.authUser.uid,name:updated.name,college:updated.college,points:updated.points,quizzes:updated.quizzes,correct:updated.correct,answered:updated.answered,accuracy:updated.accuracy,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
                    });
                    this.setLeaderboardSyncQueue(this.getLeaderboardSyncQueue().filter(x=>x.uid!==updated.uid));
                    return true;
                }catch(e){
                    console.error('Leaderboard write failed',e);
                    this.queueLeaderboardSync({...updated, meta});
                    this.showLeaderboardStatus('Firebase sync হয়নি — local data নিরাপদে সংরক্ষিত আছে।',true);
                    return false;
                }
            }
            async syncPendingLeaderboard(){
                if(!this.authUser||!this.firestore)return;
                const pending=this.getLeaderboardSyncQueue().filter(x=>x.uid===this.authUser.uid);
                for(const row of pending){ await this.syncLeaderboardUser(row,row.meta||{}); }
            }
            async loadLeaderboard(silent=false){
                const body=document.getElementById('leaderboard-body'); if(!body)return;
                const local=this.getLocalLeaderboardRows();
                this.renderLeaderboardRows(local);
                if(!silent)this.showLeaderboardStatus('Local leaderboard দেখানো হচ্ছে; Firebase background sync চলছে…',false);
                if(!this.firestore){
                    if(!silent)this.showLeaderboardStatus('Local leaderboard active — Firebase config পাওয়া যায়নি।',false);
                    return;
                }
                try{
                    await this.syncPendingLeaderboard();
                    const snap=await this.firestore.collection('leaderboard').orderBy('points','desc').limit(100).get();
                    const remote=snap.docs.map(d=>({uid:d.id,...d.data()}));
                    const rows=this.mergeLeaderboardRows(remote);
                    this.setLocalLeaderboardRows(rows);
                    this.renderLeaderboardRows(rows);
                    this.showLeaderboardStatus('Leaderboard Firebase থেকে sync হয়েছে এবং local-এ cache করা হয়েছে।',false);
                }catch(e){
                    console.error(e);
                    this.showLeaderboardStatus('Firebase unavailable — সর্বশেষ local leaderboard দেখানো হচ্ছে।',false);
                }
            }
            showLeaderboardStatus(msg,error){const el=document.getElementById('leaderboard-status');if(!el)return;el.textContent=msg;el.className=`mb-4 rounded-xl p-3 text-sm ${error?'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300':'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`;}

            // Question Bank + Practice
            openQuestionBank(mode='view'){ this.bankMode=mode; this.bankSearch=''; this.bankSubject='all'; this.bankYear='all'; this.showView(mode==='practice'?'practice':'question-bank'); if(mode==='practice') this.startPractice(); else this.renderQuestionBank(); }
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
                qs.slice(0,80).forEach((q,i)=>{const card=document.createElement('article');card.className='bank-card';const opts=q.options.map((o,j)=>`<div class="bank-option"><b>${'ABCD'[j]}</b><span>${this.escapeHtml(this.getLocalizedOption(q,j))}</span></div>`).join('');card.innerHTML=`<div class="bank-meta"><span>${this.escapeHtml(this.localizedSubject(q.subject))}</span><span>${this.escapeHtml(q.year||this.t('Practice','প্র্যাকটিস'))}</span></div><h3>${i+1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h3><div class="bank-options">${opts}</div><button class="bank-answer-btn" type="button">${this.t('Show Answer','উত্তর দেখুন')}</button><div class="bank-answer hidden"><strong>${this.t('Correct Answer','সঠিক উত্তর')}:</strong> ${q.correctAnswer}<br>${this.escapeHtml(this.language==='en'?(q.explanation_en||q.explanation||''):(q.explanation||''))}</div>`;card.querySelector('.bank-answer-btn').onclick=()=>{const a=card.querySelector('.bank-answer');a.classList.toggle('hidden');card.querySelector('.bank-answer-btn').textContent=a.classList.contains('hidden')?this.t('Show Answer','উত্তর দেখুন'):this.t('Hide Answer','উত্তর লুকান')};list.appendChild(card);});
                if(!qs.length)list.innerHTML=`<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>${this.t('No questions found','কোনো প্রশ্ন পাওয়া যায়নি')}</h3><p>${this.t('Try another filter or search term.','অন্য filter বা search ব্যবহার করুন।')}</p></div>`;
                if(qs.length>80){const note=document.createElement('div');note.className='empty-state compact';note.textContent=this.t('Showing the first 80 matches. Refine your filters to see more.','প্রথম ৮০টি ফলাফল দেখানো হচ্ছে। আরও নির্দিষ্ট filter ব্যবহার করুন।');list.appendChild(note);}
            }
            startPractice(){
                const qs=this.questionBank.filter(q=>q.source && !/^verified previous/i.test(q.source) && !q.isPreviousYear);
                const unseen=this.getUnseenPool(qs);
                this.showView('practice');
                if(!unseen.length){
                    this.practiceSession={questions:[],index:0,answers:[],marks:0,showAnswer:false};
                    const root=document.getElementById('practice-question');
                    if(root)root.innerHTML=`<div class="empty-state"><i class="fa-solid fa-circle-check"></i><h3>সব ইউনিক Practice প্রশ্ন শেষ করেছেন</h3><p>একই প্রশ্ন আবার দেখানো হবে না। নতুন প্রশ্ন যোগ হলে সেগুলো Practice করতে পারবেন। Question Bank থেকে আগে দেখা প্রশ্নের উত্তর ও ব্যাখ্যা দেখতে পারবেন।</p></div>`;
                    const score=document.getElementById('practice-score');if(score)score.textContent='0';
                    const progress=document.getElementById('practice-progress');if(progress)progress.textContent='সব প্রশ্ন সম্পন্ন';
                    return;
                }
                const selected=[...unseen].sort(()=>Math.random()-.5).slice(0,Math.min(20,unseen.length));
                // Strict no-repeat: reserve every question as soon as it is shown, across Practice and Exams.
                this.markQuestionsSeen(selected);
                this.practiceSession={questions:selected,index:0,answers:[],marks:0,showAnswer:false}; this.renderPractice();
            }
            renderPractice(){
                const s=this.practiceSession,q=s?.questions?.[s.index]; if(!q)return;
                const root=document.getElementById('practice-question'); if(!root)return;
                const chosen=s.answers[s.index];
                root.innerHTML=`<div class="practice-meta"><span>${this.localizedSubject(q.subject)}</span><span>${s.index+1} / ${s.questions.length}</span></div><h2>${s.index+1}. ${this.escapeHtml(this.getLocalizedQuestionText(q))}</h2><div class="practice-options">${q.options.map((o,j)=>`<button class="practice-option ${chosen!==undefined?(j===q.answer?'correct':j===chosen?'wrong':''):''}" ${chosen!==undefined?'disabled':''} data-i="${j}"><span>${'ABCD'[j]}</span>${this.escapeHtml(this.getLocalizedOption(q,j))}</button>`).join('')}</div>${chosen!==undefined?`<div class="practice-feedback ${chosen===q.answer?'ok':'bad'}"><strong>${chosen===q.answer?this.t('Correct — +1 practice mark','সঠিক — +১ practice mark'):this.t('Not correct — 0 mark','সঠিক নয় — ০ mark')}</strong><p>${this.escapeHtml(this.language==='en'?(q.explanation_en||q.explanation||''):(q.explanation||''))}</p></div>`:''}`;
                root.querySelectorAll('.practice-option').forEach(btn=>btn.onclick=()=>this.answerPractice(Number(btn.dataset.i)));
                document.getElementById('practice-score').textContent=String(s.marks);document.getElementById('practice-progress').textContent=this.t(`Question ${s.index+1} of ${s.questions.length}`,`প্রশ্ন ${s.index+1} / ${s.questions.length}`);
            }
            answerPractice(i){const s=this.practiceSession;if(!s||s.answers[s.index]!==undefined)return;s.answers[s.index]=i;this.markQuestionPracticed(s.questions[s.index]);if(i===s.questions[s.index].answer){s.marks++;this.markQuestionCoveredIfCorrect(s.questions[s.index],i);}this.renderPractice();}
            nextPractice(){const s=this.practiceSession;if(!s)return;if(s.index<s.questions.length-1){s.index++;this.renderPractice();}else{localStorage.setItem(this.getHistoryKey()+'_practice',JSON.stringify({marks:s.marks,total:s.questions.length,date:Date.now()}));this.showProfile();this.loadProgressStats();}}
            prevPractice(){const s=this.practiceSession;if(s&&s.index>0){s.index--;this.renderPractice();}}

            // Theme Management
            toggleTheme() {
                this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
                localStorage.setItem('med_theme', this.currentTheme);
                this.applyTheme();
            }

            applyTheme() {
                if (this.currentTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            }

            // Mobile Menu
            toggleMobileMenu() {
                const menu = document.getElementById('mobileMenu');
                menu.classList.toggle('hidden');
            }

            // Profile / analytics
            showProfile() {
                this.showView('profile');
                this.loadProgressStats();
                const profile = document.getElementById('view-profile');
                if (profile) profile.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            openProfile() {
                this.showProfile();
            }

            // View Switching
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
                if (viewName === 'exam') { history.pushState({ exam: true }, '', '#exam'); }
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            // Quick Exam Actions
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

            // Setup Config Adjusters
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

                // Update Question Count buttons active state
                const qBtns = document.querySelectorAll('.q-count-btn');
                qBtns.forEach(btn => {
                    const val = parseInt(btn.innerText.trim());
                    if (val === this.setup.questionsCount) {
                        btn.className = "q-count-btn py-2 text-xs sm:text-sm font-bold rounded-xl border-2 border-medical-600 bg-medical-50 dark:bg-medical-900/40 text-medical-700 dark:text-medical-300 text-center shadow-sm";
                    } else {
                        btn.className = "q-count-btn py-2 text-xs sm:text-sm font-bold rounded-xl border border-gray-300 dark:border-gray-600 text-center hover:bg-gray-50 dark:hover:bg-gray-700";
                    }
                });

                // Update Time buttons active state
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

            // Coverage means unique questions answered correctly.
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
            // Coverage includes only unique questions answered correctly.
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

            /**
             * Fisher-Yates Shuffle that reshuffles options AND updates the answer index
             */
            shuffleQuestionsAndOptions(pool, count) {
                let filtered = [...pool];
                const subjectSelect = document.getElementById('setup-subject');
                const selectedSubject = subjectSelect ? subjectSelect.value : this.setup.subject;
                const yearSelect = document.getElementById('setup-year');
                const selectedYear = yearSelect ? yearSelect.value : 'all';
                if (selectedSubject && selectedSubject !== 'all') filtered = filtered.filter(q => q.subject === selectedSubject);
                if (selectedYear && selectedYear !== 'all') filtered = filtered.filter(q => q.year === selectedYear);
                if (this.setup.mode === 'previous' || this.setup.mode === 'previousQuiz') filtered = filtered.filter(q => q.isPreviousYear && q.year);
                if (this.setup.mode === 'challenge') filtered = filtered.filter(q => q.source && !/^practice$/i.test(q.year || '') );
                if (!filtered.length) { this.showDataError('এই ফিল্টারে কোনো বৈধ প্রশ্ন পাওয়া যায়নি।'); return []; }
                // Previously answered questions remain available for unlimited practice.
                for (let i=filtered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[filtered[i],filtered[j]]=[filtered[j],filtered[i]];}
                return filtered.slice(0,Math.min(count,filtered.length)).map(q=>{
                    const optionsWithIndex=q.options.map((text,idx)=>({text,isCorrect:idx===q.answer}));
                    for(let i=optionsWithIndex.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[optionsWithIndex[i],optionsWithIndex[j]]=[optionsWithIndex[j],optionsWithIndex[i]];}
                    return {...q,options:optionsWithIndex.map(o=>o.text),answer:optionsWithIndex.findIndex(o=>o.isCorrect)};
                });
            }

            // Prepare exam; starting is always a deliberate second step after the instructions screen.
            startExamWithConfig() { this.prepareExamFromSetup(); }

            prepareExamFromSetup() {
                if (!this.questionsLoaded || !this.questionBank.length) { this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি।'); return; }
                const count = (this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz') ? 20 : this.setup.questionsCount;
                const questions = this.shuffleQuestionsAndOptions(this.questionBank, count);
                if (!questions.length) return;
                this.preparedExam = { questions, mode: this.setup.mode, subject: this.setup.subject, year: document.getElementById('setup-year')?.value || 'all', durationMins: (this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz') ? 10 : this.setup.durationMins };
                this.renderExamIntro();
                this.showView('exam-intro');
            }

            renderExamIntro() {
                const cfg = this.preparedExam;
                const title = cfg.mode === 'challenge' ? this.t('Medical Challenge','মেডিকেল চ্যালেঞ্জ') : (cfg.mode === 'previous' || cfg.mode === 'previousQuiz') ? `${this.t('Previous Year Exam','বিগত বছরের পরীক্ষা')} — ${cfg.year}` : this.t('Exam Instructions','পরীক্ষার নির্দেশনা');
                document.getElementById('exam-intro-title').textContent = title;
                document.getElementById('exam-intro-subtitle').textContent = this.t('Read the rules before you start. Your timer begins only after you press Start Exam.','শুরু করার আগে নিয়মগুলো পড়ে নিন। Start Exam চাপার পরই সময় গণনা শুরু হবে।');
                document.getElementById('exam-intro-start').textContent = this.t('Start Exam','পরীক্ষা শুরু করুন');
                const rules = (cfg.mode === 'challenge' || cfg.mode === 'previousQuiz')
                    ? [this.t('20 MCQ questions','২০টি MCQ প্রশ্ন'), this.t('Time limit: 10 minutes','সময়: ১০ মিনিট'), this.t('+1 for correct, −0.25 for wrong, 0 for skipped','সঠিক +১, ভুল −০.২৫, স্কিপ ০'), this.t('Leaving the exam requires submitting it first','পরীক্ষা থেকে বের হতে হলে আগে পরীক্ষা জমা দিতে হবে'), this.t('Time ending submits automatically','সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হবে')]
                    : [this.t(`${cfg.questions.length} questions` ,`${cfg.questions.length}টি প্রশ্ন`), this.t(`Time limit: ${cfg.durationMins} minutes`,`সময়: ${cfg.durationMins} মিনিট`), this.t('+1 for correct, −0.25 for wrong, 0 for skipped','সঠিক +১, ভুল −০.২৫, স্কিপ ০'), this.t('You cannot leave without submitting the exam','জমা না দিয়ে পরীক্ষা থেকে বের হওয়া যাবে না'), this.t('Time ending submits automatically','সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হবে')];
                document.getElementById('exam-intro-rules').innerHTML = rules.map(x => `<li>• ${this.escapeHtml(x)}</li>`).join('');
                document.getElementById('exam-intro-stats').innerHTML = [
                    [this.t('Questions','প্রশ্ন'), cfg.questions.length], [this.t('Time','সময়'), `${cfg.durationMins} min`], [this.t('Marks','নম্বর'), cfg.questions.length], [this.t('Negative','নেগেটিভ'), '0.25']
                ].map(([a,b])=>`<div class="rounded-2xl bg-gray-50 dark:bg-gray-700/50 p-4"><div class="text-[11px] uppercase text-gray-500">${a}</div><div class="text-lg font-extrabold text-gray-900 dark:text-white mt-1">${b}</div></div>`).join('');
            }

            beginPreparedExam() {
                if (!this.preparedExam) return;
                const cfg = this.preparedExam;
                const now = Date.now();
                this.examState = { questions: cfg.questions, userAnswers: new Array(cfg.questions.length).fill(null), markedForReview: new Array(cfg.questions.length).fill(false), currentIndex: 0, timerSeconds: cfg.durationMins * 60, timerInterval: null, timeUsedSeconds: 0, submitted: false, startedAt: now, deadlineAt: now + cfg.durationMins * 60000, mode: cfg.mode, year: cfg.year, subject: cfg.subject };
                this.examActive = true;
                this.markQuestionsSeen(cfg.questions);
                this.renderQuestion(); this.renderPalette(); this.showView('exam'); this.startTimer();
            }

            // Timer uses a deadline timestamp to avoid interval drift.
            startTimer() {
                if (this.examState.timerInterval) clearInterval(this.examState.timerInterval);
                const tick = () => {
                    const remaining = Math.max(0, this.examState.deadlineAt - Date.now());
                    this.examState.timerSeconds = Math.ceil(remaining / 1000);
                    this.examState.timeUsedSeconds = Math.min(this.examState.deadlineAt - this.examState.startedAt, Date.now() - this.examState.startedAt) / 1000;
                    const mins = Math.floor(this.examState.timerSeconds / 60), secs = this.examState.timerSeconds % 60;
                    const el = document.getElementById('exam-timer');
                    if (el) el.innerText = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
                    if (this.examState.timerSeconds <= 0) { clearInterval(this.examState.timerInterval); this.submitExam(true); }
                };
                tick(); this.examState.timerInterval = setInterval(tick, 250);
            }

            // Render Current Question
            renderQuestion() {
                const idx = this.examState.currentIndex;
                const q = this.examState.questions[idx];

                // Meta Info
                document.getElementById('exam-progress-text').innerText = `${this.t('Question','প্রশ্ন')}: ${idx + 1} / ${this.examState.questions.length}`;
                document.getElementById('q-subject').innerText = this.localizedSubject(q.subject);
                document.getElementById('q-source').innerText = q.year ? `${this.localizedSource(q.source)} • ${q.year}` : this.localizedSource(q.source);
                document.getElementById('q-difficulty').classList.add('hidden');
                document.getElementById('q-text').innerText = `${idx + 1}. ${this.getLocalizedQuestionText(q)}`;

                // Options
                const optionsContainer = document.getElementById('q-options');
                optionsContainer.innerHTML = '';

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

                // Review Button State
                const reviewBtn = document.getElementById('btn-mark-review');
                if (this.examState.markedForReview[idx]) {
                    reviewBtn.className = "px-3 py-2 rounded-xl bg-amber-500 text-white font-semibold text-xs transition flex items-center";
                } else {
                    reviewBtn.className = "px-3 py-2 rounded-xl border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-semibold text-xs transition flex items-center";
                }

                // Nav Buttons
                document.getElementById('btn-prev-q').disabled = idx === 0;
                const nextBtn = document.getElementById('btn-next-q');
                if (nextBtn) {
                    const isLast = idx === this.examState.questions.length - 1;
                    nextBtn.disabled = false;
                    nextBtn.textContent = isLast ? this.t('Submit','সাবমিট') : this.t('Next','পরবর্তী');
                    nextBtn.setAttribute('aria-label', isLast ? 'Submit exam' : 'Next question');
                }
            }

            // Render Side Palette Grid
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
                const idx = this.examState.currentIndex;
                // First selected option is final for this question; do not show a lock message.
                if (this.examState.userAnswers[idx] !== null) return;
                this.examState.userAnswers[idx] = optIdx;
                const question = this.examState.questions[idx];
                this.markQuestionPracticed(question);
                this.markQuestionCoveredIfCorrect(question, optIdx);
                this.renderQuestion();
                this.renderPalette();
            }

            clearOptionSelection() {
                // Selection is intentionally permanent for the current attempt.
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
                if (this.examState.submitted) return;

                if (this.examState.timerInterval) clearInterval(this.examState.timerInterval);
                this.examState.submitted = true;

                let correctCount = 0;
                let wrongCount = 0;
                let skippedCount = 0;

                this.examState.questions.forEach((q, idx) => {
                    const ans = this.examState.userAnswers[idx];
                    if (ans === null) {
                        skippedCount++;
                    } else if (ans === q.answer) {
                        correctCount++;
                    } else {
                        wrongCount++;
                    }
                });

                const negativeMarks = wrongCount * 0.25;
                const totalScore = Math.max(0, correctCount - negativeMarks);
                const totalQuestions = this.examState.questions.length;
                const accuracy = (correctCount + wrongCount) > 0 
                    ? ((correctCount / (correctCount + wrongCount)) * 100).toFixed(1) 
                    : 0;

                // Update Results View UI
                document.getElementById('res-score-main').innerText = `${totalScore.toFixed(2)} / ${totalQuestions}`;
                document.getElementById('res-percentage').innerText = `${(totalQuestions ? ((totalScore / totalQuestions) * 100) : 0).toFixed(1)}%`;
                document.getElementById('res-accuracy').innerText = `${accuracy}%`;
                document.getElementById('res-correct').innerText = correctCount;
                document.getElementById('res-wrong').innerText = wrongCount;
                document.getElementById('res-skipped').innerText = skippedCount;
                document.getElementById('res-negative').innerText = `-${negativeMarks.toFixed(2)}`;

                const usedSeconds = Math.max(0, Math.round(this.examState.timeUsedSeconds));
                const minsUsed = Math.floor(usedSeconds / 60);
                const secsUsed = usedSeconds % 60;
                document.getElementById('res-time-used').innerText = `${minsUsed}:${secsUsed.toString().padStart(2, '0')}`;

                // Save to LocalStorage
                const quizPoints = (this.examState.mode === 'challenge' || this.examState.mode === 'previousQuiz') ? Math.max(0, correctCount * 4 - wrongCount) : 0;

                this.saveExamAttempt({
                    date: new Date().toLocaleDateString('bn-BD'),
                    mode: this.setup.mode,
                    subject: document.getElementById('setup-subject').value,
                    year: document.getElementById('setup-year')?.value || 'all',
                    score: totalScore.toFixed(2),
                    total: totalQuestions,
                    accuracy: `${accuracy}%`,
                    timeUsed: `${minsUsed}:${secsUsed.toString().padStart(2, '0')}`,
                    quizPoints, modeLabel: this.examState.mode
                });
                if (this.examState.mode === 'challenge' || this.examState.mode === 'previousQuiz') this.recordLeaderboardResult({ correctCount, wrongCount, totalQuestions, quizPoints, accuracy });
                this.examActive = false;
                this.preparedExam = null;
                history.replaceState({ app: true }, '', window.location.pathname + window.location.search);
                this.showView('result', true);
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
            }

            // LocalStorage and Analytics
            saveExamAttempt(attempt) {
                let history = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
                history.unshift(attempt);
                localStorage.setItem(this.getHistoryKey(), JSON.stringify(history));
                this.loadProgressStats();
            }

            loadProgressStats() {
                const history = JSON.parse(localStorage.getItem(this.getHistoryKey()) || '[]');
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
                const coverage=total?Math.min(100,(answered.size/total)*100):0; set('profile-coverage',`${coverage.toFixed(0)}%`);
                const bar=document.getElementById('profile-progress-bar');if(bar)bar.style.width=`${coverage}%`;
                const note=document.getElementById('profile-performance-note');if(note) note.textContent=attempts?`আপনার গড় Accuracy ${avgAcc.toFixed(1)}% এবং Best Score ${best.toFixed(2)}। ধারাবাহিক practice করলে এই trend আরও উন্নত হবে।`:'এখনও কোনো exam attempt নেই। Practice বা Model Test শুরু করুন—আপনার progress এখানে automatically তৈরি হবে।';
                const action=document.getElementById('profile-auth-action');if(action)action.textContent=this.authUser?'Account':'লগইন / রেজিস্টার';
                const tbody=document.getElementById('prog-history-tbody');
                if(tbody){tbody.innerHTML=''; history.slice(0,10).forEach(item=>{const tr=document.createElement('tr');tr.className='hover:bg-gray-50 dark:hover:bg-gray-700/50 transition';tr.innerHTML=`<td class="py-3 px-4 font-medium">${this.escapeHtml(item.date)}</td><td class="py-3 px-4 capitalize">${this.escapeHtml(item.mode)}</td><td class="py-3 px-4">${this.escapeHtml(item.subject)}</td><td class="py-3 px-4 font-bold text-medical-600">${this.escapeHtml(item.score)} / ${this.escapeHtml(item.total)}</td><td class="py-3 px-4">${this.escapeHtml(item.accuracy)}</td><td class="py-3 px-4 text-gray-500">${this.escapeHtml(item.timeUsed)}</td>`;tbody.appendChild(tr);});}
            }

            clearStorageHistory() {
                if (confirm("আপনি কি সমস্ত পরীক্ষার ইতিহাস মুছে ফেলতে চান?")) {
                    localStorage.removeItem(this.getHistoryKey());
                    this.loadProgressStats();
                }
            }
        }

// Expose the app for existing inline UI handlers and legacy Firebase integration.
window.app = new MedicalExamApp();
const app = window.app;


let isWrongFiltered = false;
let originalQuestionStates = new Map();

function toggleWrongQuestions() {
    const btn = document.getElementById("wrong-btn");
    const container = document.getElementById("review-list-container");

    if (!container) {
        console.error("review-list-container not found!");
        return;
    }

    // প্রতিটি সম্পূর্ণ প্রশ্নের কার্ড খুঁজবে
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
        // সব প্রশ্ন আগের অবস্থায় ফিরিয়ে আনবে
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
