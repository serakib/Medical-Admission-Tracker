/* Account-only personalized website guide for Medical Admission Tracker.
 * Isolated module: the launcher lives inside Account Profile only; existing app flows remain intact.
 */
(function (window, document) {
  'use strict';
  if (window.MedicalWebsiteSlideshow) return;

  var overlay = null;
  var launcher = null;
  var activeIndex = 0;
  var timer = null;
  var autoplay = false;
  var touchStartX = null;
  var previousFocus = null;
  var intervalMs = 6500;

  var slides = [
    { icon: 'fa-hand-wave', title: 'Welcome to your guide', subtitle: 'আপনার medical website সহজে ব্যবহার করার ছোট্ট tour', render: renderWelcome },
    { icon: 'fa-gauge-high', title: 'Dashboard', subtitle: 'website-এর main starting point', render: renderDashboard },
    { icon: 'fa-book-medical', title: 'Question Bank', subtitle: 'প্রশ্ন খুঁজুন, filter করুন এবং নিজের exam তৈরি করুন', render: renderQuestionBank },
    { icon: 'fa-bullseye', title: 'Practice & Model Test', subtitle: 'practice এবং timed exam-এর ব্যবহার', render: renderPractice },
    { icon: 'fa-clock-rotate-left', title: 'Previous Year Questions', subtitle: 'আগের বছরের প্রশ্ন অনুশীলন করুন', render: renderPrevious },
    { icon: 'fa-trophy', title: 'Leaderboard & Progress', subtitle: 'নিজের অগ্রগতি ও available ranking দেখুন', render: renderProgress },
    { icon: 'fa-book-open', title: 'Syllabus & Medical Info', subtitle: 'পড়াশোনার গাইড ও প্রয়োজনীয় তথ্য', render: renderResources },
    { icon: 'fa-users', title: 'Community & support', subtitle: 'Friends, help, AI assistant এবং student resources', render: renderCommunity },
    { icon: 'fa-user-gear', title: 'Your account & settings', subtitle: 'আপনার profile ও preferences', render: renderAccount },
    { icon: 'fa-compass', title: 'Where to go next', subtitle: 'আপনার প্রয়োজন অনুযায়ী পরের ধাপ বেছে নিন', render: renderNext }
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function app() { return window.app || null; }
  function textOf(id, fallback) {
    var el = document.getElementById(id);
    var value = el ? String(el.textContent || '').trim() : '';
    return value || fallback || '—';
  }
  function inputOf(id, fallback) {
    var el = document.getElementById(id);
    var value = el && typeof el.value === 'string' ? el.value.trim() : '';
    return value || fallback || '—';
  }
  function currentUser() { var a = app(); return a && a.authUser ? a.authUser : null; }
  function currentProfile() {
    var a = app();
    return a && a.profile && typeof a.profile === 'object' ? a.profile : {};
  }
  function userName() {
    var u = currentUser(), p = currentProfile();
    return inputOf('medical-profile-name', p.name || (u && u.displayName) || textOf('account-profile-name', 'Student'));
  }
  function userEmail() {
    var u = currentUser(), p = currentProfile();
    return textOf('account-profile-email', p.email || (u && u.email) || 'Guest mode');
  }
  function accountFacts() {
    var u = currentUser(), p = currentProfile();
    return [
      ['Name', inputOf('medical-profile-name', p.name || (u && u.displayName) || textOf('account-profile-name', 'Guest Student'))],
      ['Email', inputOf('medical-profile-email', p.email || (u && u.email) || textOf('account-profile-email', 'Guest mode'))],
      ['College', inputOf('medical-profile-college', p.college || 'Not added')],
      ['Batch / Class', inputOf('medical-profile-batch', p.batch || p.class || 'Not added')]
    ];
  }
  function card(icon, label, value, note) {
    return '<article class="mws-stat"><span class="mws-stat-icon"><i class="fa-solid ' + esc(icon) + '" aria-hidden="true"></i></span><span class="mws-stat-copy"><span class="mws-stat-label">' + esc(label) + '</span><strong>' + esc(value) + '</strong>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</span></article>';
  }
  function action(label, target, icon, description) {
    return '<button type="button" class="mws-action" data-mws-action="' + esc(target) + '"><span class="mws-action-icon"><i class="fa-solid ' + esc(icon) + '" aria-hidden="true"></i></span><span class="mws-action-copy"><strong>' + esc(label) + '</strong>' + (description ? '<small>' + esc(description) + '</small>' : '') + '</span><i class="fa-solid fa-arrow-right mws-action-end" aria-hidden="true"></i></button>';
  }
  function steps(items) {
    return '<ol class="mws-steps">' + items.map(function (item, i) {
      return '<li><span>' + (i + 1) + '</span><p>' + item + '</p></li>';
    }).join('') + '</ol>';
  }
  function renderWelcome() {
    var u = currentUser(), p = currentProfile();
    var college = inputOf('medical-profile-college', p.college || 'College not added yet');
    var batch = inputOf('medical-profile-batch', p.batch || p.class || 'Batch not added yet');
    return '<div class="mws-welcome"><span class="mws-welcome-mark"><i class="fa-solid fa-heart-pulse" aria-hidden="true"></i></span><div><span class="mws-eyebrow">YOUR PERSONAL WEBSITE TOUR</span><h3>স্বাগতম, ' + esc(userName()) + '!</h3><p>এই guide-এ website-এর কোন feature কোথায় আছে এবং কীভাবে ব্যবহার করবেন তা ধাপে ধাপে দেখানো হবে।</p><span class="mws-account-pill"><i class="fa-solid ' + (u ? 'fa-circle-check' : 'fa-user') + '" aria-hidden="true"></i> ' + esc(u ? 'Connected account' : 'Guest session') + '</span></div></div><div class="mws-grid">' + card('fa-envelope','Account email',userEmail(),'বর্তমান session-এর তথ্য') + card('fa-building-columns','College',college,'আপনার profile থেকে') + card('fa-graduation-cap','Batch / Class',batch,'আপনার profile থেকে') + card('fa-moon','Appearance',textOf('account-theme-status','Theme preference available in settings'),'আপনার বর্তমান preference') + '</div><div class="mws-callout"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>Profile information পরিবর্তন করলে slideshow নতুন করে render হলে latest value দেখাবে। যেসব তথ্য website-এ নেই, সেগুলো অনুমান করে দেখানো হবে না।</span></div>';
  }
  function renderDashboard() {
    return '<p class="mws-intro">Dashboard হলো main starting point। এখান থেকে overview, homepage-এর useful sections এবং website navigation ব্যবহার করুন।</p>' + steps(['Sidebar-এর <strong>Dashboard</strong> চাপলে main page-এ ফিরবেন।','Sidebar থেকে Question Bank, Practice, Model Test, Previous Year বা Leaderboard-এ যেতে পারবেন।','Mobile-এ উপরের menu button চাপুন; menu থেকে feature বেছে নিন।']) + '<div class="mws-action-list">' + action('Open Dashboard','dashboard','fa-gauge-high','Main website view') + '</div>';
  }
  function renderQuestionBank() {
    return '<p class="mws-intro">Question Bank-এ প্রশ্ন পড়া, filter করা এবং নির্বাচিত প্রশ্ন দিয়ে exam শুরু করার tools রয়েছে।</p>' + steps(['Question Bank খুলে subject, year বা available filters ব্যবহার করে প্রশ্ন খুঁজুন।','প্রতিটি প্রশ্ন আলাদাভাবে select করুন, অথবা Select all ব্যবহার করুন।','Clear selection শুধু selection সরায়—প্রশ্ন delete করে না।','নির্বাচিত প্রশ্নের count দেখে Start Exam with Selected চাপুন।','Question Bank heading-এর পাশের Refresh দিয়ে latest question data reload করুন।']) + '<div class="mws-callout"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span>Refresh button Question Bank-এর মধ্যেই থাকবে। Exam শুরু করার আগে selected question count দেখে নিন।</span></div><div class="mws-action-list">' + action('Open Question Bank','question-bank','fa-book-medical','Find and select questions') + '</div>';
  }
  function renderPractice() {
    return '<p class="mws-intro">Practice ও Model Test আলাদা study modes—আপনার উদ্দেশ্য অনুযায়ী বেছে নিন।</p>' + steps(['Practice খুলে available question set থেকে অনুশীলন করুন।','Model Test খুলে exam mode, question count ও duration-এর available options ঠিক করুন।','Exam চলাকালে answer দিন এবং প্রয়োজন হলে review-marking ব্যবহার করুন।','Submit করার পর result ও saved progress review করুন।']) + '<div class="mws-action-list">' + action('Open Practice','practice','fa-bullseye','Practice questions') + action('Open Model Test','model-test','fa-clipboard-check','Timed exam setup') + '</div>';
  }
  function renderPrevious() {
    return '<p class="mws-intro">Previous Year section আগের বছরের প্রশ্ন পড়া ও অনুশীলনের জন্য।</p>' + steps(['Previous Year খুলুন।','প্রয়োজনীয় year নির্বাচন করুন।','প্রশ্ন দেখুন; available controls দিয়ে answer reveal বা quiz/practice শুরু করুন।','Dashboard-এ ফিরতে Dashboard navigation ব্যবহার করুন।']) + '<div class="mws-action-list">' + action('Open Previous Year','previous','fa-clock-rotate-left','Browse past papers') + '</div>';
  }
  function renderProgress() {
    return '<p class="mws-intro">আপনার website-এ সংরক্ষিত study progress ও available leaderboard information এখানে কীভাবে খুঁজবেন।</p><div class="mws-grid">' + card('fa-book-open-reader','Questions seen',textOf('profile-seen-count','—'),'Student Profile-এর saved count') + card('fa-clipboard-check','Exam attempts',textOf('profile-attempt-count','—'),'Recorded attempts') + card('fa-trophy','Best score',textOf('profile-best-score','—'),'Saved best score') + card('fa-bullseye','Accuracy',textOf('profile-accuracy','—'),'Recorded accuracy') + '</div>' + steps(['Student Profile খুলে progress summary ও exam history দেখুন।','Leaderboard খুলে available ranking দেখুন।','Network বা saved data unavailable হলে value না-ও দেখা যেতে পারে; এখানে কোনো score বানিয়ে দেখানো হয় না।']) + '<div class="mws-action-list">' + action('Student Profile','profile','fa-user-graduate','Your progress and history') + action('Leaderboard','leaderboard','fa-trophy','Available rankings') + '</div>';
  }
  function renderResources() {
    return '<p class="mws-intro">Study planning এবং medical admission সম্পর্কিত reference information-এর জন্য এই sections ব্যবহার করুন।</p>' + steps(['Syllabus খুলে syllabus-related content দেখুন।','Medical Info section-এ medical/HSC information ও available guidance পড়ুন।','কোনো তথ্য update বা eligibility-related হলে official source দিয়ে যাচাই করুন।']) + '<div class="mws-action-list">' + action('Open Syllabus','syllabus','fa-book-open','Study topics') + action('Open Medical Info','medical-info','fa-hospital','Medical admission information') + '</div>';
  }
  function renderCommunity() {
    return '<p class="mws-intro">Website-এর study tools ছাড়াও support ও community-related resources খুঁজে পেতে এই shortcuts ব্যবহার করুন।</p>' + steps(['Leaderboard এবং league-related area-তে available ranking ও competition progress দেখুন।','Student Life Support section-এ student wellbeing ও support-related information দেখুন।','AI Assistant খুলে study-related প্রশ্নে সাহায্য নিন; গুরুত্বপূর্ণ medical বা admission সিদ্ধান্ত official source দিয়ে যাচাই করুন।','Help & Support বা Student Blog link Account Profile → App Settings-এও রয়েছে।']) + '<div class="mws-action-list">' + action('Student Life Support','student-life-support','fa-hand-holding-heart','Student support resources') + action('Contact & Help','contact','fa-envelope','Contact section and support links') + action('AI Assistant','ai-assistant','fa-comments','Open AI study assistant') + action('Student Blog','student-blog','fa-blog','Read student resources') + '</div>';
  }
  function renderAccount() {
    var facts = accountFacts();
    return '<p class="mws-intro">Account Profile-এ personal details, account connection, app preferences ও theme controls পাওয়া যায়।</p><div class="mws-account-grid">' + facts.map(function (f) { return '<div class="mws-account-item"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1]) + '</strong></div>'; }).join('') + '</div>' + steps(['Account Profile-এ নাম, College এবং Batch/Class update করে Save Profile চাপুন।','App Settings খুলে theme এবং question palette preference পরিবর্তন করুন।','Switch account বা Add another account দিয়ে account connection পরিচালনা করুন।','এই slideshow আবার দেখতে Account Profile-এর Website Guide button ব্যবহার করুন।']) + '<div class="mws-action-list">' + action('Open Account Settings','account','fa-user-gear','Profile and preferences') + action('Appearance / Theme','theme','fa-circle-half-stroke','Switch light/dark theme') + '</div>';
  }
  function renderNext() {
    return '<div class="mws-next-hero"><span class="mws-next-icon"><i class="fa-solid fa-route" aria-hidden="true"></i></span><h3>এখন কোথা থেকে শুরু করবেন?</h3><p>আপনার প্রয়োজন অনুযায়ী নিচের যেকোনো section খুলুন। যেকোনো সময় close/back button দিয়ে guide থেকে বের হতে পারবেন।</p></div><div class="mws-action-list">' + action('Dashboard','dashboard','fa-gauge-high','Main view') + action('Question Bank','question-bank','fa-book-medical','Find questions') + action('Practice','practice','fa-bullseye','Practice now') + action('Account Profile','account','fa-user-gear','Update your details') + '</div><div class="mws-callout"><i class="fa-solid fa-envelope" aria-hidden="true"></i><span>Contact section Dashboard page-এর নিচের দিকে রয়েছে। Help & Support link Account Profile → App Settings-এ পাওয়া যায়।</span></div>';
  }

  function injectStyles() {
    if (document.getElementById('mws-styles')) return;
    var style = document.createElement('style');
    style.id = 'mws-styles';
    style.textContent = `
      #mws-overlay{position:fixed;inset:0;z-index:20000;display:grid;place-items:center;padding:clamp(10px,3vw,28px);background:rgba(2,6,23,.74);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      #mws-overlay[hidden]{display:none!important}
      .mws-dialog{display:flex;flex-direction:column;width:min(100%,900px);max-height:min(900px,94dvh);overflow:hidden;border:1px solid rgba(148,163,184,.25);border-radius:26px;background:#fff;color:#0f172a;box-shadow:0 30px 100px rgba(0,0,0,.34)}
      html.dark .mws-dialog,body.dark .mws-dialog{background:#0f172a;color:#f8fafc;border-color:#334155}
      .mws-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 20px;border-bottom:1px solid #e2e8f0;background:linear-gradient(120deg,rgba(16,185,129,.09),rgba(14,165,233,.09))}
      html.dark .mws-topbar,body.dark .mws-topbar{border-color:#334155;background:linear-gradient(120deg,rgba(16,185,129,.12),rgba(14,165,233,.12))}
      .mws-brand{display:flex;align-items:center;gap:11px;min-width:0}.mws-brand-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:14px;background:#059669;color:white;font-size:18px}.mws-brand-copy{min-width:0}.mws-brand-copy strong{display:block;font-size:14px;font-weight:900}.mws-brand-copy small{display:block;margin-top:3px;color:#64748b;font-size:11px}
      .mws-close{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border:1px solid #dbe3eb;border-radius:13px;background:transparent;color:inherit;font-size:17px;cursor:pointer}
      .mws-content{overflow:auto;overscroll-behavior:contain;padding:clamp(18px,4vw,34px);min-height:270px}
      .mws-slide-heading{display:flex;align-items:flex-start;gap:14px;margin-bottom:24px}.mws-slide-icon{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:16px;background:#ecfdf5;color:#059669;font-size:19px}.mws-slide-heading h2{margin:0;font-size:clamp(22px,3vw,30px);font-weight:900;letter-spacing:-.03em;line-height:1.2}.mws-slide-heading p{margin:7px 0 0;color:#64748b;font-size:13px;line-height:1.6}
      html.dark .mws-slide-heading p,body.dark .mws-slide-heading p,html.dark .mws-brand-copy small,body.dark .mws-brand-copy small{color:#94a3b8}
      .mws-welcome{display:flex;align-items:flex-start;gap:18px;padding:clamp(17px,3vw,25px);border:1px solid #d1fae5;border-radius:22px;background:linear-gradient(135deg,#f0fdf4,#eff6ff);margin-bottom:17px}.mws-welcome-mark{display:grid;place-items:center;flex:0 0 54px;width:54px;height:54px;border-radius:17px;background:#059669;color:#fff;font-size:23px}.mws-eyebrow{font-size:10px;letter-spacing:.14em;font-weight:900;color:#047857}.mws-welcome h3,.mws-next-hero h3{margin:7px 0;font-size:clamp(21px,3vw,28px);font-weight:900;line-height:1.3;color:#0f172a}.mws-welcome p,.mws-next-hero p{margin:0;color:#475569;font-size:13px;line-height:1.8}.mws-account-pill{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:6px 10px;border-radius:999px;background:rgba(5,150,105,.1);color:#047857;font-size:11px;font-weight:800;overflow-wrap:anywhere}
      .mws-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mws-stat{display:flex;align-items:flex-start;gap:12px;min-width:0;padding:15px;border:1px solid #e2e8f0;border-radius:17px;background:#fff}.mws-stat-icon{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:12px;background:#ecfdf5;color:#059669}.mws-stat-copy{display:flex;flex-direction:column;gap:4px;min-width:0}.mws-stat-label{font-size:11px;color:#64748b}.mws-stat-copy strong{font-size:15px;font-weight:900;overflow-wrap:anywhere}.mws-stat-copy small{font-size:10px;color:#94a3b8;line-height:1.5}
      .mws-intro{margin:0 0 17px;color:#64748b;font-size:13px;line-height:1.85}.mws-steps{display:grid;gap:10px;margin:0;padding:0;list-style:none}.mws-steps li{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.mws-steps li>span{display:grid;place-items:center;flex:0 0 27px;width:27px;height:27px;border-radius:9px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:900}.mws-steps p{margin:2px 0 0;color:#334155;font-size:12px;line-height:1.8}.mws-callout{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:14px 16px;border-radius:15px;background:#f8fafc;color:#475569;font-size:12px;line-height:1.8}.mws-callout i{margin-top:4px;color:#059669}
      .mws-action-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}.mws-action{display:flex;align-items:center;gap:10px;min-width:0;padding:13px;border:1px solid #dbe3eb;border-radius:14px;background:#fff;color:#0f172a;text-align:left;cursor:pointer;transition:border-color .18s,transform .18s}.mws-action:hover{border-color:#10b981;transform:translateY(-1px)}.mws-action-icon{display:grid;place-items:center;flex:0 0 35px;width:35px;height:35px;border-radius:11px;background:#ecfdf5;color:#059669}.mws-action-copy{display:grid;gap:3px;min-width:0}.mws-action-copy strong{font-size:12px;font-weight:850}.mws-action-copy small{font-size:10px;color:#64748b;line-height:1.4}.mws-action-end{margin-left:auto;color:#94a3b8;font-size:11px}
      .mws-account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:17px}.mws-account-item{display:flex;flex-direction:column;gap:7px;min-width:0;padding:14px;border:1px solid #e2e8f0;border-radius:15px}.mws-account-item span{font-size:11px;color:#64748b}.mws-account-item strong{font-size:13px;font-weight:800;overflow-wrap:anywhere}
      .mws-next-hero{text-align:center;padding:12px 12px 22px}.mws-next-icon{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 15px;border-radius:20px;background:#ecfdf5;color:#059669;font-size:24px}
      .mws-footer{display:flex;flex-direction:column;gap:12px;padding:15px 20px;border-top:1px solid #e2e8f0;background:#f8fafc}.mws-progress-row{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#64748b;font-size:11px;font-weight:800}.mws-progress-track{height:5px;overflow:hidden;border-radius:999px;background:#e2e8f0}.mws-progress-fill{height:100%;width:11%;border-radius:inherit;background:linear-gradient(90deg,#059669,#0284c7);transition:width .25s ease}.mws-controls{display:flex;align-items:center;justify-content:space-between;gap:10px}.mws-control-group{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.mws-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:39px;padding:9px 12px;border:1px solid #dbe3eb;border-radius:12px;background:#fff;color:#334155;font-size:11px;font-weight:800;cursor:pointer}.mws-btn:disabled{opacity:.4;cursor:not-allowed}.mws-btn-primary{border-color:#059669;background:#059669;color:#fff}.mws-btn[aria-pressed="true"]{border-color:#0284c7;background:#eff6ff;color:#0369a1}
      #mws-overlay button:focus-visible,#mws-launch:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}
      html.dark .mws-stat,body.dark .mws-stat,html.dark .mws-steps li,body.dark .mws-steps li,html.dark .mws-action,body.dark .mws-action,html.dark .mws-account-item,body.dark .mws-account-item,html.dark .mws-btn,body.dark .mws-btn{background:#111c2e;color:#e2e8f0;border-color:#334155}
      html.dark .mws-stat-label,body.dark .mws-stat-label,html.dark .mws-account-item span,body.dark .mws-account-item span,html.dark .mws-action-copy small,body.dark .mws-action-copy small{color:#94a3b8}html.dark .mws-steps p,body.dark .mws-steps p{color:#cbd5e1}
      html.dark .mws-callout,body.dark .mws-callout,html.dark .mws-footer,body.dark .mws-footer{background:#111c2e;color:#cbd5e1;border-color:#334155}
      html.dark .mws-welcome,body.dark .mws-welcome{background:linear-gradient(135deg,#102b28,#172b40);border-color:#24534a}html.dark .mws-welcome h3,body.dark .mws-welcome h3{color:#f8fafc}html.dark .mws-welcome p,body.dark .mws-welcome p{color:#cbd5e1}
      html.dark .mws-progress-track,body.dark .mws-progress-track{background:#334155}html.dark .mws-close,body.dark .mws-close{border-color:#334155}
      @media(max-width:600px){.mws-dialog{max-height:96dvh;border-radius:20px}.mws-topbar{padding:12px 14px}.mws-content{padding:17px 13px;min-height:220px}.mws-welcome{padding:15px;gap:12px}.mws-welcome-mark{flex-basis:43px;width:43px;height:43px;font-size:19px}.mws-grid,.mws-account-grid,.mws-action-list{grid-template-columns:1fr}.mws-stat{padding:12px}.mws-footer{padding:12px 13px}.mws-controls{align-items:stretch;flex-direction:column}.mws-control-group{justify-content:space-between}.mws-btn{flex:1;min-width:0;padding:9px 7px}.mws-progress-row{font-size:10px}.mws-slide-heading{gap:10px;margin-bottom:18px}.mws-slide-icon{flex-basis:42px;width:42px;height:42px}.mws-action{padding:12px}}
      @media(prefers-reduced-motion:reduce){.mws-action,.mws-progress-fill{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function build() {
    if (overlay) return;
    launcher = document.getElementById('mws-launch');
    if (!launcher) return;
    injectStyles();
    launcher.addEventListener('click', open);
    overlay = document.createElement('div');
    overlay.id = 'mws-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="mws-dialog" role="dialog" aria-modal="true" aria-labelledby="mws-slide-title"><header class="mws-topbar"><div class="mws-brand"><span class="mws-brand-icon"><i class="fa-solid fa-heart-pulse" aria-hidden="true"></i></span><span class="mws-brand-copy"><strong>Medical Admission Tracker</strong><small>Website guide · personalised for you</small></span></div><button type="button" class="mws-close" data-mws-close aria-label="Back to Account Settings"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button></header><main class="mws-content" id="mws-slide-content" tabindex="-1"></main><footer class="mws-footer"><div class="mws-progress-row"><span id="mws-slide-count">Slide 1 of ' + slides.length + '</span><span id="mws-autoplay-status">Manual mode</span></div><div class="mws-progress-track" aria-hidden="true"><div class="mws-progress-fill" id="mws-progress-fill"></div></div><div class="mws-controls"><div class="mws-control-group"><button class="mws-btn" type="button" data-mws-prev><i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>Previous</span></button><button class="mws-btn" type="button" data-mws-next><span>Next</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div><div class="mws-control-group"><button class="mws-btn" type="button" data-mws-restart title="Restart autoplay from the current slide"><i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Restart</span></button><button class="mws-btn" type="button" data-mws-first title="Return to the first slide"><i class="fa-solid fa-backward-step" aria-hidden="true"></i><span>First</span></button><button class="mws-btn mws-btn-primary" type="button" data-mws-play aria-pressed="false"><i class="fa-solid fa-play" aria-hidden="true"></i><span>Start</span></button></div></div></footer></section>';
    overlay.addEventListener('click', onOverlayClick);
    overlay.addEventListener('touchstart', function (event) {
      if (!overlay.hidden && event.changedTouches && event.changedTouches.length) touchStartX = event.changedTouches[0].clientX;
    }, { passive: true });
    overlay.addEventListener('touchend', function (event) {
      if (overlay.hidden || touchStartX === null || !event.changedTouches || !event.changedTouches.length) return;
      var dx = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 55) go(activeIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.body.appendChild(overlay);
    render();
  }
  function render() {
    if (!overlay) return;
    var slide = slides[activeIndex];
    overlay.querySelector('#mws-slide-content').innerHTML = '<div class="mws-slide-heading"><span class="mws-slide-icon"><i class="fa-solid ' + slide.icon + '" aria-hidden="true"></i></span><div><h2 id="mws-slide-title">' + esc(slide.title) + '</h2><p>' + esc(slide.subtitle) + '</p></div></div><div class="mws-slide-body">' + slide.render() + '</div>';
    overlay.querySelector('#mws-slide-count').textContent = 'Slide ' + (activeIndex + 1) + ' of ' + slides.length;
    overlay.querySelector('#mws-progress-fill').style.width = (((activeIndex + 1) / slides.length) * 100) + '%';
    overlay.querySelector('[data-mws-prev]').disabled = activeIndex === 0;
    overlay.querySelector('[data-mws-next]').disabled = activeIndex === slides.length - 1;
    overlay.querySelector('#mws-autoplay-status').textContent = autoplay ? 'Auto slideshow on' : 'Manual mode';
    var play = overlay.querySelector('[data-mws-play]');
    play.setAttribute('aria-pressed', String(autoplay));
    play.innerHTML = autoplay ? '<i class="fa-solid fa-pause" aria-hidden="true"></i><span>Stop</span>' : '<i class="fa-solid fa-play" aria-hidden="true"></i><span>Start</span>';
  }
  function stopTimer() {
    if (timer) window.clearInterval(timer);
    timer = null;
    autoplay = false;
  }
  function startTimer() {
    if (!overlay || overlay.hidden) return;
    if (timer) window.clearInterval(timer);
    autoplay = true;
    timer = window.setInterval(function () {
      if (activeIndex >= slides.length - 1) { stopTimer(); render(); return; }
      activeIndex += 1;
      render();
    }, intervalMs);
    render();
  }
  function go(index) {
    if (index < 0 || index >= slides.length) return;
    activeIndex = index;
    if (autoplay) startTimer(); else render();
  }
  function close() {
    if (!overlay || overlay.hidden) return;
    stopTimer();
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }
  function open() {
    build();
    if (!overlay) return;
    previousFocus = document.activeElement;
    activeIndex = 0;
    stopTimer();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    render();
    overlay.querySelector('[data-mws-close]').focus();
  }
  function runAction(target) {
    var a = app();
    close();
    if (!a) return;
    window.setTimeout(function () {
      try {
        if (target === 'dashboard') a.showView('home');
        else if (target === 'question-bank' && typeof a.openQuestionBank === 'function') a.openQuestionBank('view');
        else if (target === 'practice' && typeof a.openPracticeBrowser === 'function') a.openPracticeBrowser();
        else if (target === 'model-test' && typeof a.setupExamQuick === 'function') a.setupExamQuick('model');
        else if (target === 'previous' && typeof a.showPreviousYears === 'function') a.showPreviousYears();
        else if (target === 'leaderboard' && typeof a.openLeaderboard === 'function') a.openLeaderboard();
        else if (target === 'syllabus') a.showView('syllabus');
        else if (target === 'medical-info') a.showView('medical-hsc-info');
        else if (target === 'student-life-support') a.showView('student-life-support');
        else if (target === 'contact') { a.showView('home'); window.setTimeout(function () { var contact = document.getElementById('contact'); if (contact) contact.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 180); }
        else if (target === 'ai-assistant') window.open('https://serakib.github.io/Ai-Assisstant/', '_blank', 'noopener,noreferrer');
        else if (target === 'student-blog') window.open('https://rakibhasandc27.blogspot.com/', '_blank', 'noopener,noreferrer');
        else if (target === 'profile' && typeof a.openProfile === 'function') a.openProfile();
        else if (target === 'account' && typeof a.openAccountProfile === 'function') a.openAccountProfile();
        else if (target === 'theme' && typeof a.toggleTheme === 'function') a.toggleTheme();
      } catch (error) { console.error('[Website Guide] Could not open feature:', target, error); }
    }, 80);
  }
  function onOverlayClick(event) {
    var target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-mws-close')) { close(); return; }
    if (target.hasAttribute('data-mws-prev')) { go(activeIndex - 1); return; }
    if (target.hasAttribute('data-mws-next')) { go(activeIndex + 1); return; }
    if (target.hasAttribute('data-mws-play')) { if (autoplay) { stopTimer(); render(); } else startTimer(); return; }
    if (target.hasAttribute('data-mws-restart')) { startTimer(); return; }
    if (target.hasAttribute('data-mws-first')) { activeIndex = 0; startTimer(); return; }
    var actionTarget = target.getAttribute('data-mws-action');
    if (actionTarget) runAction(actionTarget);
  }
  function onKeydown(event) {
    if (!overlay || overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); go(activeIndex + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(activeIndex - 1); }
  }
  function refreshIfOpen() { if (overlay && !overlay.hidden) render(); }
  function init() {
    build();
    if (!overlay) {
      var observer = new MutationObserver(function () {
        var button = document.getElementById('mws-launch');
        if (button && !overlay) { build(); observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('student-profile-loaded', refreshIfOpen);
    window.addEventListener('med-account-progress-updated', refreshIfOpen);
    window.addEventListener('storage', refreshIfOpen);
    window.addEventListener('focus', refreshIfOpen);
    document.addEventListener('submit', function (event) {
      if (event.target && (event.target.id === 'medical-profile-form' || event.target.id === 'medical-profile-editor')) {
        window.setTimeout(refreshIfOpen, 250);
      }
    });
  }
  window.MedicalWebsiteSlideshow = Object.freeze({
    open: open,
    close: close,
    refresh: refreshIfOpen,
    start: startTimer,
    stop: stopTimer,
    restart: function () { startTimer(); },
    restartFromFirst: function () { activeIndex = 0; startTimer(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window, document);
