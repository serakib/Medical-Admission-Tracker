/* Medical Admission Tracker — Promo Code UI. Backend is authoritative. */
(function(){
'use strict';
if(window.__matPromoUIInstalled)return;window.__matPromoUIInstalled=true;
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function credentials(){
 // Reuse the app's existing Firebase v11 modular auth session.
 // Do not call firebase.auth(): the site does not initialize the compat default app.
 const app=window.app;
 const user=(app&&(app.authUser||(app.auth&&app.auth.currentUser)))||window.__matFirebaseAuthUser||null;
 if(user&&typeof user.getIdToken==='function'){
  const idToken=await user.getIdToken();
  return {idToken};
 }
 const token=localStorage.getItem('med_sheet_guest_token_v1')||'';
 if(token)return {guestToken:token};
 throw new Error('Firebase session পাওয়া যায়নি। Sign in সম্পন্ন হলে আবার চেষ্টা করুন।');
}
const REQUEST_TIMEOUT_MS=30000;
async function api(action,fields){
 const endpoint=String(window.MED_LEADERBOARD_API_URL||'').trim();if(!endpoint)throw new Error('Backend URL পাওয়া যায়নি।');
 const controller=typeof AbortController!=='undefined'?new AbortController():null;
 let timedOut=false,timeoutId=0;
 const timeoutPromise=new Promise((_,reject)=>{
  timeoutId=setTimeout(()=>{
   timedOut=true;
   if(controller)controller.abort();
   const error=new Error('Request timed out after 30 seconds.');
   error.code='MAT_REQUEST_TIMEOUT';
   reject(error);
  },REQUEST_TIMEOUT_MS);
 });
 try{
  const request=(async()=>{
   const creds=await credentials();
   if(timedOut){const error=new Error('Request timed out after 30 seconds.');error.code='MAT_REQUEST_TIMEOUT';throw error;}
   const options={method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action},creds,fields||{}))};
   if(controller)options.signal=controller.signal;
   const res=await fetch(endpoint,options);
   if(!res.ok)throw new Error('Backend request failed (HTTP '+res.status+').');
   const data=await res.json();
   if(!data.success)throw new Error(data.error||'Request failed.');
   return data;
  })();
  return await Promise.race([request,timeoutPromise]);
 }catch(error){
  if(timedOut||(error&&error.name==='AbortError')){
   const timeoutError=new Error('Request timed out after 30 seconds. Server response পাওয়া যায়নি; আবার চেষ্টা করার আগে PB balance check করুন।');
   timeoutError.code='MAT_REQUEST_TIMEOUT';
   throw timeoutError;
  }
  throw error;
 }finally{clearTimeout(timeoutId);}
}
function card(){
 if(!$('mat-loading-dots-style'))document.head.insertAdjacentHTML('beforeend',"\n<style id=\"mat-loading-dots-style\">\n.mat-loading-dots{display:inline-flex;align-items:center;gap:2px;margin-left:2px;vertical-align:baseline}\n.mat-loading-dots i{font-style:normal;opacity:.25;animation:mat-loading-dot 1s infinite ease-in-out}\n.mat-loading-dots i:nth-child(2){animation-delay:.16s}\n.mat-loading-dots i:nth-child(3){animation-delay:.32s}\n@keyframes mat-loading-dot{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}\n@media(prefers-reduced-motion:reduce){.mat-loading-dots i{animation:none;opacity:1}}\n</style>");
 const host=$('sidebar-student-profile-extras');if(!host)return;
 const existing=$('mat-promo-card');
 if(existing){if(existing.parentElement!==host)host.insertBefore(existing,host.firstElementChild);return;}
 const section=document.createElement('section');section.id='mat-promo-card';section.className='rounded-2xl border border-amber-200 dark:border-amber-900 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-sm space-y-4';
 section.innerHTML=`
 <div class="flex items-center justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-wider text-amber-600">Rewards</p><h3 class="text-base font-extrabold text-gray-900 dark:text-white">Promo Code</h3></div><span class="rounded-full px-3 py-1 text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Permanent PB</span></div>
 <div class="rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 p-3"><p class="text-xs text-gray-500 dark:text-gray-400">আজকের Public Promo Code</p><div id="mat-promo-public-code" class="mt-1 text-lg font-black tracking-wide text-gray-900 dark:text-white">লোড হচ্ছে…</div><p id="mat-promo-public-meta" class="text-xs text-gray-500 dark:text-gray-400 mt-1">Bangladesh Time (UTC+6)</p></div>
 <div id="mat-promo-assigned-wrap" class="hidden rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3"><p class="text-xs font-bold text-amber-700 dark:text-amber-300">আপনার Promo Code</p><div id="mat-promo-assigned-code" class="mt-1 text-lg font-black tracking-wide text-gray-900 dark:text-white"></div><p id="mat-promo-assigned-meta" class="text-xs text-gray-600 dark:text-gray-300 mt-1"></p></div>
 <div id="mat-promo-admin-code-wrap" class="hidden rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3"><p class="text-xs font-bold text-rose-700 dark:text-rose-300">Admin Member Promo Code</p><div id="mat-promo-admin-code" class="mt-1 text-lg font-black tracking-wide text-gray-900 dark:text-white"></div><p class="text-xs text-gray-600 dark:text-gray-300 mt-1">Admin members only · persistent until disabled</p></div>
 <form id="mat-promo-redeem-form" class="flex flex-col sm:flex-row gap-2"><input id="mat-promo-input" autocomplete="off" spellcheck="false" placeholder="Promo Code লিখুন" class="flex-1 min-w-0 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-white"><button class="rounded-xl px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold">Redeem</button></form>
 <p id="mat-promo-message" class="text-sm text-gray-600 dark:text-gray-300" aria-live="polite"></p>
 <div class="flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-700 pt-3"><span class="text-xs text-gray-500 dark:text-gray-400">Permanent Promo PB Balance</span><strong id="mat-promo-balance" class="text-base text-amber-600">— PB</strong></div>
 <div id="mat-admin-panel" class="hidden border-t border-rose-200 dark:border-rose-900 pt-4 space-y-4">
  <div><p class="text-xs font-bold uppercase tracking-wider text-rose-600">Restricted access</p><h3 class="text-base font-extrabold text-gray-900 dark:text-white">Promo Code Admin</h3><p class="text-xs text-gray-500 dark:text-gray-400">Global defaults and individual member overrides. Individual values override global values.</p></div>
  <details class="rounded-xl border border-amber-300 dark:border-amber-800 p-3">
   <summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 font-extrabold text-sm text-amber-800 dark:text-amber-300"><span><i class="fa-solid fa-crown mr-1" aria-hidden="true"></i> Premium Golden Name Access</span><span class="text-xs font-normal text-gray-500">Expand / Collapse</span></summary>
   <section id="mat-premium-name-access" class="hidden rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-3 mt-3">
   <div><p class="text-xs text-gray-600 dark:text-gray-300">Admin members get this automatically. Super Admin can manually grant or revoke it for subscribers after subscription payment is confirmed.</p></div>
   <div class="flex flex-col sm:flex-row gap-2"><select id="mat-premium-name-member" class="min-w-0 flex-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"><option value="">Choose a registered member</option></select><button id="mat-premium-name-grant" type="button" class="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-extrabold text-white">Grant Golden Name</button></div>
   <div id="mat-premium-name-list" class="space-y-2 text-sm"></div>
  </section>
  </details>
  <details class="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
   <summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 font-bold text-sm"><span>Global Promo Settings</span><span class="text-xs font-normal text-gray-500">Expand / Collapse</span></summary>
   <form id="mat-promo-global-form" class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2 mt-3">
   <label class="block text-xs font-semibold">Global Promo Code<input id="mat-global-code" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Leave blank to keep Daily/Weekly code"></label>
   <div class="grid grid-cols-2 gap-2"><label class="text-xs font-semibold">PB per redeem<input id="mat-global-reward" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Default"></label><label class="text-xs font-semibold">Redeem limit<input id="mat-global-limit" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Default"></label></div>
   <div class="flex flex-wrap items-center gap-2"><label class="text-xs font-semibold">Limit period<select id="mat-global-period" class="ml-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2"><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="UNLIMITED">Unlimited</option></select></label><label class="text-xs flex items-center gap-1"><input id="mat-global-enabled" type="checkbox" checked> Enabled</label></div>
   <button class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save Global Settings</button>
   </form>
  </details>
  <section id="mat-member-overrides" class="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
   <details>
    <summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2"><span class="font-bold text-sm">Admin-only Promo Code & Individual Overrides</span><span class="text-xs text-gray-500">Expand / Collapse</span></summary>
    <div class="pt-3 space-y-3">
     <p class="text-xs text-gray-500 dark:text-gray-400">Admin select করলে Super Admin তার Admin-only code access, PB reward এবং redemption limit আলাদাভাবে সেট করতে পারবেন। Regular member-এর override-ও এখান থেকে manage হবে।</p>
     <div class="flex justify-end"><button type="button" id="mat-member-add-more" class="rounded-lg border border-rose-300 dark:border-rose-800 px-3 py-2 text-xs font-extrabold text-rose-700 dark:text-rose-300">+ Add More</button></div>
     <div id="mat-member-override-list" class="space-y-3"></div>
     <div class="flex flex-wrap items-center gap-2"><button type="button" id="mat-member-save-all" class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save All</button><span id="mat-member-note" class="text-xs text-gray-500 dark:text-gray-400">প্রতিটি section আলাদাভাবে Save করতে পারবেন, অথবা Save All ব্যবহার করতে পারবেন।</span></div>
    </div>
   </details>
  </section>
  <section id="mat-admin-overrides" class="hidden rounded-xl border border-rose-300 dark:border-rose-900 p-3">
   <details>
    <summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2"><span class="font-bold text-sm">Admin Override · Super Admin Only</span><span class="text-xs text-gray-500">Expand / Collapse</span></summary>
    <div class="pt-3 space-y-3">
     <p class="text-xs text-gray-500">প্রতিটি Admin member-এর আলাদা Admin-only code, PB reward ও redemption limit manage করুন। Member Override থেকে আলাদা।</p>
     <div class="flex justify-end"><button type="button" id="mat-admin-override-add-more" class="rounded-lg border border-rose-300 dark:border-rose-800 px-3 py-2 text-xs font-extrabold text-rose-700 dark:text-rose-300">+ Add More</button></div>
     <div id="mat-admin-override-list" class="space-y-3"></div>
     <div class="flex flex-wrap items-center gap-2"><button type="button" id="mat-admin-override-save-all" class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save All</button><span id="mat-admin-override-status" class="text-xs text-gray-500" aria-live="polite">প্রতিটি card আলাদাভাবে save বা Save All ব্যবহার করুন।</span></div>
    </div>
   </details>
  </section>
  <details id="mat-admin-members-details" class="rounded-2xl border border-violet-200 dark:border-violet-900 p-3" open>
   <summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 font-bold text-sm"><span>Admin Members</span><span class="text-xs font-normal text-gray-500">Expand / Collapse</span></summary>
   <div class="pt-3"><div id="mat-admin-members" class="space-y-2 text-sm"></div></div>
  </details>
  <section id="mat-admin-only-code-controls" class="hidden rounded-xl border border-rose-200 dark:border-rose-900 p-3 space-y-2"><h4 class="font-bold text-sm">Master Admin-only Promo Code · Super Admin</h4><label class="block text-xs font-semibold">Shared Admin-only Code<input id="mat-admin-fixed-code" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" autocomplete="off"></label><div class="flex flex-wrap gap-2"><button type="button" id="mat-admin-fixed-code-save" class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save Master Code</button><button type="button" id="mat-admin-unlimited-toggle" class="rounded-lg px-3 py-2 bg-gray-800 text-white text-xs font-bold">Loading Admin Code…</button></div><p class="text-xs text-gray-500">Only Super Admin can change the shared code and its enabled status.</p></section>
  <form id="mat-admin-add-form" class="hidden flex flex-col sm:flex-row gap-2"><input id="mat-admin-email" type="email" required placeholder="Registered member Gmail" class="flex-1 min-w-0 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"><button class="rounded-lg px-3 py-2 bg-rose-600 text-white text-sm font-bold">Add Admin</button></form>
  <p id="mat-admin-message" class="text-sm" aria-live="polite"></p>
 </div>`;
 host.insertBefore(section,host.firstElementChild);
 let redeemInFlight=false;
 $('mat-promo-redeem-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(redeemInFlight)return;
  const form=e.currentTarget,input=$('mat-promo-input'),msg=$('mat-promo-message');
  const code=String(input.value||'').trim();
  if(!code){msg.textContent='Promo Code লিখুন।';input.focus();return;}
  const button=form.querySelector('button[type="submit"],button:not([type])');
  const originalButtonHTML=button?button.innerHTML:'';
  const originalButtonDisabled=button?button.disabled:false,originalInputDisabled=input.disabled;
  redeemInFlight=true;
  input.disabled=true;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML='Redeeming <span class="mat-loading-dots" role="img" aria-label="loading"><i>.</i><i>.</i><i>.</i></span>';}
  msg.innerHTML='Redeeming <span class="mat-loading-dots" role="img" aria-label="loading"><i>.</i><i>.</i><i>.</i></span>';
  try{
    const r=await api('redeemPromoCode',{code});
    msg.textContent='Promo code successfully redeemed! +'+Number(r.rewardPB).toLocaleString()+' PB যোগ হয়েছে।';
    input.value='';
    if(r.user&&window.MedGlobalLeague&&typeof window.MedGlobalLeague.applyAccountSnapshot==='function'){window.MedGlobalLeague.applyAccountSnapshot(r.user);}
    else if(r.user&&window.app){window.app.profile=Object.assign(window.app.profile||{},r.user);window.app.profile.pb=Number(r.user.pb||r.user.pendingPB||0);window.app.profile.availablePB=window.app.profile.pb;window.app.profile.promoPB=Number(r.user.promoPB||0);window.dispatchEvent(new CustomEvent('student-progress-updated',{detail:Object.assign({},window.app.profile,{source:'promo-redemption'})}));}
    $('mat-promo-balance').textContent=Number(r.promoPB).toLocaleString()+' PB';
  }catch(err){
    if(err&&err.code==='MAT_REQUEST_TIMEOUT')msg.textContent='Redeem request timeout. PB balance check করে তারপর retry করুন—server request process করে থাকতে পারে।';
    else msg.textContent='Promo code redemption failed: '+(err&&err.message?err.message:'Please try again.');
  }finally{
    redeemInFlight=false;
    input.disabled=originalInputDisabled;
    if(button){button.innerHTML=originalButtonHTML;button.disabled=originalButtonDisabled;button.removeAttribute('aria-busy');}
  }
 });
 $('mat-promo-global-form').addEventListener('submit',async e=>{e.preventDefault();const msg=$('mat-admin-message');msg.textContent='Saving global settings…';try{await api('adminSavePromoConfig',{code:$('mat-global-code').value,rewardPB:$('mat-global-reward').value,limitCount:$('mat-global-limit').value,limitPeriod:$('mat-global-period').value,enabled:$('mat-global-enabled').checked});msg.textContent='Global Promo Settings saved.';await refresh();}catch(err){msg.textContent=err.message;}});
 $('mat-member-add-more').addEventListener('click',()=>addMemberOverrideCard());
 $('mat-member-save-all').addEventListener('click',()=>saveAllMemberOverrides());
 $('mat-admin-add-form').addEventListener('submit',async e=>{e.preventDefault();if(adminAddInFlight)return;const form=e.currentTarget,email=$('mat-admin-email'),button=form.querySelector('button[type=submit],button:not([type])'),msg=$('mat-admin-message'),value=String(email.value||'').trim();if(!value){msg.textContent='Registered member Gmail লিখুন।';email.focus();return;}adminAddInFlight=true;if(button){button.disabled=true;button.textContent='Adding…';button.setAttribute('aria-busy','true');}msg.textContent='Admin member যোগ করা হচ্ছে…';try{await api('adminAddMember',{email:value});email.value='';msg.textContent='Admin member added successfully.';await loadAdmin();}catch(err){msg.textContent=(err&&err.message)||'Admin member যোগ করা যায়নি।';}finally{adminAddInFlight=false;if(button){button.disabled=false;button.textContent='Add Admin';button.removeAttribute('aria-busy');}}});
 refresh();
}
let memberTargets=[];
let adminMemberRecords=[];
let canManageAdminMembers=false;
let refreshInFlight=false;
let refreshPending=false;
let adminAddInFlight=false;
function ensureAdminDashboard(){
 const panel=$('mat-admin-panel'),nav=$('mat-notifications-nav');
 if(!panel||!nav)return;
 let dashboard=$('mat-admin-dashboard');
 if(!dashboard){
  dashboard=document.createElement('section');
  dashboard.id='mat-admin-dashboard';
  dashboard.className='hidden fixed inset-0 z-[10050] overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100';
  dashboard.setAttribute('aria-label','Admin Management Dashboard');
  dashboard.innerHTML=`
   <div class="min-h-full">
    <header class="relative border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
     <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0"><div class="h-11 w-11 shrink-0 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center"><i class="fa-solid fa-shield-halved text-xl"></i></div><div class="min-w-0"><p class="text-[11px] uppercase tracking-[.18em] font-extrabold text-rose-600">Control Center</p><h1 class="text-xl sm:text-2xl font-black truncate">Admin Management</h1></div></div>
      <button id="mat-admin-dashboard-close" type="button" class="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark mr-1"></i> Close</button>
     </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
     <div class="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-rose-950 text-white p-5 sm:p-7 shadow-lg">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><p class="text-sm text-rose-200 font-bold">Restricted administrator area</p><h2 class="text-2xl sm:text-3xl font-black mt-1">Welcome to Admin Control Center</h2><p class="text-sm text-slate-300 mt-2 max-w-2xl">Manage administrator access, promo rewards and member-specific settings from one place.</p></div><span class="inline-flex items-center gap-2 self-start rounded-full bg-white/10 border border-white/15 px-3 py-2 text-xs font-bold"><i class="fa-solid fa-lock"></i> Verified Admin</span></div>
     </div>
     <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><p class="text-xs font-bold text-slate-500">ACCESS</p><p class="mt-1 text-lg font-black">Admin Members</p><p class="text-xs text-slate-500 mt-1">Manage trusted admin accounts</p></div>
      <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><p class="text-xs font-bold text-slate-500">REWARDS</p><p class="mt-1 text-lg font-black">Promo Settings</p><p class="text-xs text-slate-500 mt-1">Global and individual reward rules</p></div>
      <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"><p class="text-xs font-bold text-slate-500">SECURITY</p><p class="mt-1 text-lg font-black">Role Protected</p><p class="text-xs text-slate-500 mt-1">Actions are verified by backend</p></div>
     </div>
     <div id="mat-admin-dashboard-content" class="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm"></div>
    </main>
   </div>`;
  document.body.appendChild(dashboard);
  $('mat-admin-dashboard-close').addEventListener('click',()=>dashboard.classList.add('hidden'));
  dashboard.addEventListener('click',e=>{if(e.target===dashboard)dashboard.classList.add('hidden');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dashboard.classList.contains('hidden'))dashboard.classList.add('hidden');});
  $('mat-admin-dashboard-content').appendChild(panel);
  panel.classList.remove('border-t','border-rose-200','dark:border-rose-900','pt-4');
  panel.classList.add('block','space-y-5');
 }
 let button=$('mat-admin-management-nav');
 if(!button){
  button=document.createElement('button');
  button.id='mat-admin-management-nav';
  button.type='button';
  button.className='w-full flex items-center gap-3 text-left';
  button.innerHTML='<i class="fa-solid fa-shield-halved"></i><span>Admin Management</span>';
  button.addEventListener('click',()=>{const d=$('mat-admin-dashboard');if(d)d.classList.remove('hidden');if(window.closeAppSidebar)window.closeAppSidebar();});
  nav.parentNode.insertBefore(button,nav.nextSibling);
 }
 button.classList.remove('hidden');
}
let adminAccessConfirmed=false;
let memberOverrideCardSequence=0;
function memberOverrideCardMarkup(member){
 const id='mat-member-override-'+(++memberOverrideCardSequence);
 const selected=member?String(member.userId):'';
 const opts='<option value="">Select member</option>'+memberTargets.map(m=>'<option value="'+esc(m.userId)+'">'+esc(m.name||'Student')+' · '+esc(m.email)+'</option>').join('');
 return '<article class="mat-member-override-card rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2" data-override-card="'+id+'">'+
  '<div class="flex items-center justify-between gap-2"><strong class="text-xs uppercase tracking-wide text-slate-500">Member Override</strong><button type="button" data-remove-override class="text-xs font-bold text-rose-600">Remove</button></div>'+
  '<label class="block text-xs font-semibold">Registered member<select data-member-field="userId" required class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm">'+opts+'</select></label>'+
  '<div data-member-promo-fields class="space-y-2"><label data-member-code-label class="block text-xs font-semibold">Member-specific Promo Code<input data-member-field="code" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Blank = inherit global/public code"></label>'+
  '<div class="grid grid-cols-2 gap-2"><label class="text-xs font-semibold">PB per redeem<input data-member-field="rewardPB" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Inherit global"></label><label class="text-xs font-semibold">Redeem limit<input data-member-field="limitCount" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Inherit global"></label></div>'+
  '<div class="flex flex-wrap items-center gap-2"><label class="text-xs font-semibold">Limit period<select data-member-field="limitPeriod" class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2"><option value="">Inherit global</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="UNLIMITED">Unlimited</option></select></label><label class="text-xs flex items-center gap-1"><input data-member-field="enabled" type="checkbox" checked> Enabled</label></div></div>'+
  '<p data-member-card-note class="text-xs text-gray-500"></p><div data-admin-role-controls class="rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-2"><p data-admin-role-status class="text-xs text-gray-500">Member select করলে Admin access status দেখা যাবে।</p><button type="button" data-admin-role-action class="hidden rounded-lg px-3 py-2 text-xs font-bold"></button></div><button type="button" data-save-override class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save This Member</button></article>';
}
function getMemberOverrideCards(){return Array.from(document.querySelectorAll('#mat-member-override-list [data-override-card]'));}
function fillMemberOverrideCard(card,member){
 if(!card||!member)return;
 const set=(key,value)=>{const el=card.querySelector('[data-member-field="'+key+'"]');if(!el)return;if(el.type==='checkbox')el.checked=value!==false;else el.value=value==null?'':String(value);};
 set('userId',member.userId);set('code',member.code||'');set('rewardPB',member.rewardPB);set('limitCount',member.limitCount);set('limitPeriod',member.limitPeriod||'');set('enabled',member.enabled!==false);
 const note=card.querySelector('[data-member-card-note]');if(note)note.textContent=(member.name||'Student')+' · '+(member.email||'')+(member.hasOverride?' · Saved settings':' · New override');
}
function renderMemberAdminRoleControl(card){
 const userId=String(card&&card.querySelector('[data-member-field="userId"]')?.value||'');
 const target=memberTargets.find(m=>String(m.userId)===userId);
 const area=card&&card.querySelector('[data-admin-role-controls]');
 if(!area)return;
 const status=area.querySelector('[data-admin-role-status]'),button=area.querySelector('[data-admin-role-action]');
 if(!target){status.textContent='Admin access manage করতে Registered member select করুন।';button.classList.add('hidden');return;}
 const email=String(target.email||'').trim().toLowerCase();
 const record=adminMemberRecords.find(m=>String(m.email||'').trim().toLowerCase()===email);
 const isRoot=!!record&&record.role==='SUPER_ADMIN';
 const isAdmin=!!record&&record.status==='ACTIVE';
 const promoFields=card.querySelector('[data-member-promo-fields]');
 if(promoFields){
  promoFields.classList.toggle('hidden',isAdmin&&!canManageAdminMembers);
  const codeLabel=promoFields.querySelector('[data-member-code-label]');
  const codeInput=promoFields.querySelector('[data-member-field="code"]');
  const rewardInput=promoFields.querySelector('[data-member-field="rewardPB"]');
  const limitInput=promoFields.querySelector('[data-member-field="limitCount"]');
  if(codeLabel)codeLabel.firstChild.textContent=isAdmin?'Individual Admin-only Code':'Member-specific Promo Code';
  if(codeInput)codeInput.placeholder=isAdmin?'Blank = use shared master Admin-only code':'Blank = inherit global/public code';
  if(rewardInput)rewardInput.placeholder=isAdmin?'Default: 100000 PB':'Inherit global';
  if(limitInput)limitInput.placeholder=isAdmin?'0 = unlimited':'Inherit global';
 }
 status.textContent=isRoot?'SUPER ADMIN · Master Admin-only code controls are available above; role revoke করা যাবে না':isAdmin?'ADMIN MEMBER · Super Admin এখান থেকে individual Admin-only code, PB ও limit সেট করতে পারবেন':'REGULAR MEMBER · এখানে regular promo override সেট হবে; Admin-only code ব্যবহার করতে পারবে না';
 button.classList.toggle('hidden',!canManageAdminMembers||isRoot);
 button.textContent=isAdmin?'Revoke Admin Member':'Make Admin Member';
 button.className=(canManageAdminMembers&&!isRoot?'':'hidden ')+'rounded-lg px-3 py-2 text-xs font-bold '+(isAdmin?'border border-rose-300 text-rose-700 dark:text-rose-300':'bg-rose-600 text-white');
 button.disabled=false;
 button.onclick=async()=>{
  if(!canManageAdminMembers||!email||isRoot)return;
  const action=isAdmin?'adminRemoveMember':'adminAddMember';
  if(!confirm((isAdmin?'এই member-এর Admin access revoke':'এই member-কে Admin Member')+' করবেন?'))return;
  button.disabled=true;button.setAttribute('aria-busy','true');
  button.textContent=isAdmin?'Revoking...':'Adding...';
  status.textContent=isAdmin?'ADMIN ACCESS REVOKING...':'ADMIN ACCESS ADDING...';
  try{
   await api(action,{email});
   button.textContent=isAdmin?'Revoked':'Added';
   status.textContent=isAdmin?'ADMIN ACCESS REVOKED':'ADMIN MEMBER ACCESS GRANTED';
   $('mat-admin-message').textContent=isAdmin?'Admin access revoked.':'Admin Member access granted.';
   await new Promise(resolve=>setTimeout(resolve,900));
   await loadAdmin();
  }catch(error){
   $('mat-admin-message').textContent=(error&&error.message)||(isAdmin?'Admin access revoke failed.':'Admin access grant failed.');
   status.textContent=isAdmin?'ADMIN ACCESS REVOKE FAILED':'ADMIN MEMBER ACCESS GRANT FAILED';
   button.textContent=isAdmin?'Revoke Admin Member':'Make Admin Member';
   button.disabled=false;
  }finally{button.removeAttribute('aria-busy');}
 }
}
function addMemberOverrideCard(member){
 const host=$('mat-member-override-list');if(!host)return null;
 host.insertAdjacentHTML('beforeend',memberOverrideCardMarkup(member||null));
 const card=host.lastElementChild;
 if(member)fillMemberOverrideCard(card,member);
 card.querySelector('[data-member-field="userId"]').addEventListener('change',()=>{
  const id=card.querySelector('[data-member-field="userId"]').value;
  const duplicate=getMemberOverrideCards().some(other=>other!==card&&other.querySelector('[data-member-field="userId"]').value===id&&id);
  if(duplicate){$('mat-admin-message').textContent='একই member-এর জন্য duplicate override করা যাবে না।';card.querySelector('[data-member-field="userId"]').value='';return;}
  const target=memberTargets.find(m=>String(m.userId)===String(id));
  if(target)fillMemberOverrideCard(card,target);
  renderMemberAdminRoleControl(card);
 });
 renderMemberAdminRoleControl(card);
 card.querySelector('[data-save-override]').addEventListener('click',()=>saveMemberOverrideCard(card));
 card.querySelector('[data-remove-override]').addEventListener('click',async()=>{
  const id=card.querySelector('[data-member-field="userId"]').value;
  const target=memberTargets.find(m=>String(m.userId)===String(id));
  if(target&&target.hasOverride){
   if(!confirm('এই member-এর saved Promo Override মুছে ফেলবেন?'))return;
   const button=card.querySelector('[data-remove-override]');button.disabled=true;button.textContent='Removing...';try{await api('adminDeleteMemberPromo',{userId:id});$('mat-admin-message').textContent='Member override removed.';await loadAdmin();}
   catch(error){$('mat-admin-message').textContent=error.message||'Override remove failed.';button.disabled=false;button.textContent='Remove';}
  }else{card.remove();if(!getMemberOverrideCards().length)addMemberOverrideCard();}
 });
 return card;
}
function readMemberOverrideCard(card){
 const get=key=>card.querySelector('[data-member-field="'+key+'"]');
 return {userId:get('userId').value,code:get('code').value,rewardPB:get('rewardPB').value,limitCount:get('limitCount').value,limitPeriod:get('limitPeriod').value,enabled:get('enabled').checked};
}
async function saveMemberOverrideCard(card){
 const data=readMemberOverrideCard(card),msg=$('mat-admin-message');
 if(!data.userId){msg.textContent='প্রথমে Registered member select করুন।';return false;}
 const duplicate=getMemberOverrideCards().some(other=>other!==card&&readMemberOverrideCard(other).userId===data.userId);
 if(duplicate){msg.textContent='একই member-এর জন্য একাধিক override রাখা যাবে না।';return false;}
 const button=card.querySelector('[data-save-override]');button.disabled=true;button.textContent='Saving…';
 try{await api('adminSaveMemberPromo',data);const target=memberTargets.find(m=>String(m.userId)===String(data.userId));if(target){Object.assign(target,data,{hasOverride:true});}const note=card.querySelector('[data-member-card-note]');if(note)note.textContent=(target&&target.name||'Member')+' · '+(target&&target.email||'')+' · Saved settings';msg.textContent='Individual Promo Settings saved.';return true;}
 catch(error){msg.textContent=error.message||'Member settings save failed.';return false;}
 finally{button.disabled=false;button.textContent='Save This Member';}
}
async function saveAllMemberOverrides(){
 const cards=getMemberOverrideCards(),msg=$('mat-admin-message'),seen=new Set(),selected=[];
 for(const card of cards){const data=readMemberOverrideCard(card);if(!data.userId)continue;if(seen.has(data.userId)){msg.textContent='একই member একাধিক section-এ select করা হয়েছে। Duplicate ঠিক করুন।';return;}seen.add(data.userId);selected.push({card,data});}
 if(!selected.length){msg.textContent='Save করার জন্য অন্তত একজন member select করুন।';return;}
 const button=$('mat-member-save-all');button.disabled=true;button.textContent='Saving…';
 let saved=0;
 try{
  for(const item of selected){await api('adminSaveMemberPromo',item.data);saved++;}
  msg.textContent='সব selected member settings save হয়েছে ('+saved+').';
  await loadAdmin();
 }catch(error){msg.textContent=saved+'টি save হয়েছে; পরেরটি save হয়নি: '+(error.message||'Unknown error')+'. Save All আবার চালালে বাকি settings save হবে।';}
 finally{button.disabled=false;button.textContent='Save All';}
}
function renderMemberOverrideCards(){
 const host=$('mat-member-override-list');if(!host)return;
 host.innerHTML='';
 const saved=memberTargets.filter(m=>m.hasOverride);
 saved.forEach(member=>addMemberOverrideCard(member));
 addMemberOverrideCard();
}
let adminOverrideCardSequence=0;
function adminOverrideCardMarkup(member){
 const id='mat-admin-override-card-'+(++adminOverrideCardSequence);
 const opts='<option value="">Select Admin member</option>'+memberTargets.filter(m=>m.isAdmin).map(m=>'<option value="'+esc(m.userId)+'">'+esc(m.name||'Admin')+' · '+esc(m.email)+'</option>').join('');
 return '<article class="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/10 p-3 space-y-2" data-admin-override-card="'+id+'"><div class="flex items-center justify-between gap-2"><strong class="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-300">Admin Override</strong><button type="button" data-admin-override-remove class="text-xs font-bold text-rose-600">Remove</button></div><label class="block text-xs font-semibold">Admin member<select data-admin-override-field="userId" required class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm">'+opts+'</select></label><label class="block text-xs font-semibold">Individual Admin-only Code<input data-admin-override-field="code" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Blank = use shared master Admin-only code"></label><div class="grid grid-cols-2 gap-2"><label class="text-xs font-semibold">PB per redeem<input data-admin-override-field="rewardPB" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Default: 100000"></label><label class="text-xs font-semibold">Redeem limit<input data-admin-override-field="limitCount" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="0 = unlimited"></label></div><div class="flex flex-wrap items-center gap-2"><label class="text-xs font-semibold">Limit period<select data-admin-override-field="limitPeriod" class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2"><option value="UNLIMITED">Unlimited</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label><label class="text-xs flex items-center gap-1"><input data-admin-override-field="enabled" type="checkbox" checked> Enabled</label></div><p data-admin-override-note class="text-xs text-gray-500"></p><button type="button" data-admin-override-save class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save This Admin</button></article>';
}
function getAdminOverrideCards(){return Array.from(document.querySelectorAll('#mat-admin-override-list [data-admin-override-card]'));}
function readAdminOverrideCard(card){const get=key=>card.querySelector('[data-admin-override-field="'+key+'"]');return {userId:get('userId').value,code:get('code').value,rewardPB:get('rewardPB').value,limitCount:get('limitCount').value,limitPeriod:get('limitPeriod').value,enabled:get('enabled').checked};}
function fillAdminOverrideCard(card,member){if(!card||!member)return;const data={userId:member.userId,code:member.code||'',rewardPB:member.rewardPB,limitCount:member.limitCount,limitPeriod:member.limitPeriod||'UNLIMITED',enabled:member.enabled!==false};Object.keys(data).forEach(key=>{const el=card.querySelector('[data-admin-override-field="'+key+'"]');if(el){if(el.type==='checkbox')el.checked=data[key]!==false;else el.value=data[key]==null?'':String(data[key]);}});const note=card.querySelector('[data-admin-override-note]');if(note)note.textContent=(member.name||'Admin')+' · '+(member.email||'')+(member.hasOverride?' · Saved settings':' · No individual override saved');}
function addAdminOverrideCard(member){const host=$('mat-admin-override-list');if(!host)return null;host.insertAdjacentHTML('beforeend',adminOverrideCardMarkup(member||null));const card=host.lastElementChild;if(member)fillAdminOverrideCard(card,member);const select=card.querySelector('[data-admin-override-field="userId"]');select.addEventListener('change',()=>{const id=select.value,duplicate=getAdminOverrideCards().some(other=>other!==card&&readAdminOverrideCard(other).userId===id&&id);if(duplicate){$('mat-admin-override-status').textContent='একই Admin-এর জন্য duplicate override করা যাবে না।';select.value='';return;}const target=memberTargets.find(m=>String(m.userId)===String(id));if(target)fillAdminOverrideCard(card,target);});card.querySelector('[data-admin-override-save]').onclick=()=>saveAdminOverrideCard(card);card.querySelector('[data-admin-override-remove]').onclick=async()=>{const data=readAdminOverrideCard(card),target=memberTargets.find(m=>String(m.userId)===String(data.userId));if(target&&target.hasOverride){if(!confirm('এই Admin-এর saved override clear করবেন?'))return;const button=card.querySelector('[data-admin-override-remove]');button.disabled=true;button.textContent='Clearing…';try{await api('adminDeleteMemberPromo',{userId:data.userId});$('mat-admin-override-status').textContent='Admin Override cleared.';await loadAdmin();}catch(error){$('mat-admin-override-status').textContent=error.message||'Override clear failed.';button.disabled=false;button.textContent='Remove';}}else{card.remove();if(!getAdminOverrideCards().length)addAdminOverrideCard();}};return card;}
async function saveAdminOverrideCard(card){const data=readAdminOverrideCard(card),status=$('mat-admin-override-status');if(!data.userId){status.textContent='আগে Admin member select করুন।';return false;}const duplicate=getAdminOverrideCards().some(other=>other!==card&&readAdminOverrideCard(other).userId===data.userId);if(duplicate){status.textContent='একই Admin-এর জন্য একাধিক override রাখা যাবে না।';return false;}const button=card.querySelector('[data-admin-override-save]');button.disabled=true;button.textContent='Saving…';try{await api('adminSaveMemberPromo',data);const target=memberTargets.find(m=>String(m.userId)===String(data.userId));if(target)Object.assign(target,data,{hasOverride:true});const note=card.querySelector('[data-admin-override-note]');if(note)note.textContent=(target&&target.name||'Admin')+' · '+(target&&target.email||'')+' · Saved settings';status.textContent='Admin Override saved successfully.';return true;}catch(error){status.textContent=error.message||'Admin Override save failed.';return false;}finally{button.disabled=false;button.textContent='Save This Admin';}}
async function saveAllAdminOverrides(){const cards=getAdminOverrideCards(),status=$('mat-admin-override-status'),seen=new Set(),items=[];for(const card of cards){const data=readAdminOverrideCard(card);if(!data.userId)continue;if(seen.has(data.userId)){status.textContent='একই Admin একাধিক card-এ select করা হয়েছে। Duplicate ঠিক করুন।';return;}seen.add(data.userId);items.push({card,data});}if(!items.length){status.textContent='Save করার জন্য অন্তত একজন Admin select করুন।';return;}const button=$('mat-admin-override-save-all');button.disabled=true;button.textContent='Saving…';let saved=0;try{for(const item of items){await api('adminSaveMemberPromo',item.data);saved++;const target=memberTargets.find(m=>String(m.userId)===String(item.data.userId));if(target)Object.assign(target,item.data,{hasOverride:true});}status.textContent='সব selected Admin Override save হয়েছে ('+saved+').';await loadAdmin();}catch(error){status.textContent=saved+'টি save হয়েছে; পরেরটি save হয়নি: '+(error.message||'Unknown error')+'. Save All আবার চালালে বাকি settings save হবে।';}finally{button.disabled=false;button.textContent='Save All';}}
function renderAdminOverrideCards(){const host=$('mat-admin-override-list');if(!host)return;host.innerHTML='';memberTargets.filter(m=>m.isAdmin&&m.hasOverride).forEach(member=>addAdminOverrideCard(member));addAdminOverrideCard();}
async function loadPremiumNameAccess(members){
 const section=$('mat-premium-name-access');
 if(!section)return;
 section.classList.toggle('hidden',!members.canManage);
 if(!members.canManage)return;
 const adminEmails=new Set((members.members||[]).map(m=>String(m.email||'').trim().toLowerCase()));
 const candidates=memberTargets.filter(m=>m&&m.userId&&m.email&&!adminEmails.has(String(m.email).trim().toLowerCase()));
 const select=$('mat-premium-name-member'),previous=select.value;
 select.innerHTML='<option value="">Choose a registered member</option>'+candidates.map(m=>'<option value="'+esc(m.userId)+'">'+esc(m.name||'Student')+' · '+esc(m.email)+'</option>').join('');
 if(previous&&candidates.some(m=>String(m.userId)===previous))select.value=previous;
 const result=await api('adminListPremiumNameAccess'),access=Array.isArray(result.access)?result.access:[];
 const activeIds=new Set(access.map(row=>String(row.userId||'')));
 const grant=$('mat-premium-name-grant');
 const updateGrantState=()=>{grant.disabled=!select.value||activeIds.has(select.value);};
 updateGrantState();
 select.onchange=updateGrantState;
 grant.onclick=async()=>{
  const userId=select.value;
  if(!userId||activeIds.has(userId)||grant.getAttribute('aria-busy')==='true')return;
  const defaultLabel='Grant Golden Name';
  grant.disabled=true;grant.setAttribute('aria-busy','true');
  grant.textContent='Granting Golden Name Access...';
  try{
   await api('adminSetPremiumNameAccess',{userId:userId,enabled:true});
   $('mat-admin-message').textContent='Granted Access successfully.';
   await loadPremiumNameAccess(members);
   grant.textContent='Granted Access Successfully';
   await new Promise(resolve=>setTimeout(resolve,1200));
   grant.textContent=defaultLabel;
  }catch(error){
   $('mat-admin-message').textContent=error.message||'Access grant failed.';
   grant.textContent=defaultLabel;
   updateGrantState();
  }finally{
   grant.removeAttribute('aria-busy');
   if(activeIds.has(userId))grant.disabled=true;
   else updateGrantState();
  }
 };
 const list=$('mat-premium-name-list');
 list.innerHTML=access.length?'<h5 class="font-bold text-xs text-amber-900 dark:text-amber-200">ACTIVE SUBSCRIBERS ('+access.length+')</h5>'+access.map(row=>'<div class="flex items-center justify-between gap-2 border-t border-amber-200 dark:border-amber-900 pt-2"><span class="min-w-0"><strong class="block truncate">'+(window.MedPremiumName&&typeof window.MedPremiumName.html==='function'?window.MedPremiumName.html(row.name||'Student',true):esc(row.name||'Student'))+'</strong><small class="block truncate text-gray-500">'+esc(row.email)+'</small></span><button type="button" data-revoke-premium-name="'+esc(row.userId)+'" class="shrink-0 rounded-lg border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">Revoke</button></div>').join(''):'<p class="text-xs text-gray-500">No manually granted subscriber access yet.</p>';
 list.querySelectorAll('[data-revoke-premium-name]').forEach(button=>button.addEventListener('click',async()=>{
  const userId=button.getAttribute('data-revoke-premium-name');
  const target=access.find(row=>String(row.userId)===String(userId));
  if(!target||!confirm('Revoke Golden Name access for '+(target.name||target.email)+'?'))return;
  button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Revoking...';
  try{
   await api('adminSetPremiumNameAccess',{userId:userId,enabled:false});
   $('mat-admin-message').textContent='Premium Golden Name access revoked.';
   await loadPremiumNameAccess(members);
  }catch(error){$('mat-admin-message').textContent=error.message||'Access revoke failed.';button.disabled=false;button.textContent='Revoke';}finally{button.removeAttribute('aria-busy');}
 }));
}
async function loadAdmin(){
 const [members,promo,config,targets]=await Promise.all([api('adminListMembers'),api('adminPromoStatus'),api('adminGetPromoConfig'),api('adminListPromoTargets')]);
 $('mat-admin-panel').classList.remove('hidden');
 // Admin-friendly navigation: grouped sections, quick filter and active-section tracking.
 (function ensureAdminQuickNav(){
  const panel=$('mat-admin-panel');
  let nav=document.getElementById('mat-admin-quick-nav');
  const items=[
   {id:'mat-premium-name-access',label:'Golden Name',group:'Access & Rewards',keywords:'premium subscriber name access'},
   {id:'mat-promo-global-form',label:'Global Promo',group:'Access & Rewards',keywords:'promo code global reward'},
   {id:'mat-member-overrides',label:'Member Overrides',group:'Access & Rewards',keywords:'member individual promo limit'},
   {id:'mat-admin-overrides',label:'Admin Override',group:'Admin Team',keywords:'admin individual admin only promo code reward limit'},
   {id:'mat-admin-members',label:'Admin Members',group:'Admin Team',keywords:'admins roles remove members'},
   {id:'mat-admin-add-form',label:'Add Admin',group:'Admin Team',keywords:'invite add email admin'},
   {id:'mat-admin-unlimited-toggle',label:'Admin Code',group:'Admin Team',keywords:'unlimited admin only code'},
   {id:'mat-admin-guest-deletion',label:'Guest Deletion',group:'Account Safety',keywords:'guest account delete approval pending schedule'}
  ];
  if(!nav){
   nav=document.createElement('nav');
   nav.id='mat-admin-quick-nav';
   nav.setAttribute('aria-label','Admin panel navigation');
   nav.className='rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 space-y-2';
   nav.innerHTML='<label class="relative block"><span class="sr-only">Search admin tools</span><span class="pointer-events-none absolute left-3 top-2 text-slate-400">⌕</span><input id="mat-admin-nav-search" type="search" autocomplete="off" placeholder="Search admin tools…" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 pl-9 text-xs outline-none focus:border-rose-400"></label><div class="flex flex-wrap gap-1.5">'+items.map(item=>'<a href="#'+item.id+'" data-admin-jump="'+item.id+'" data-label="'+item.label.toLowerCase()+'" data-keywords="'+item.keywords+'" class="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition hover:border-rose-400 hover:text-rose-600" aria-current="false">'+item.label+'</a>').join('')+'</div>';
   const heading=panel.firstElementChild;
   if(heading)heading.insertAdjacentElement('afterend',nav);else panel.insertBefore(nav,panel.firstChild);
   nav.addEventListener('click',function(event){
    const link=event.target.closest('[data-admin-jump]');
    if(!link)return;
    const target=document.getElementById(link.getAttribute('data-admin-jump'));
    if(target){event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});}
   });
   nav.querySelector('#mat-admin-nav-search').addEventListener('input',function(){
    const query=this.value.trim().toLowerCase();
    nav.querySelectorAll('[data-admin-jump]').forEach(link=>link.classList.toggle('hidden',!!query&&!(link.dataset.label+' '+link.dataset.keywords).includes(query)));
   });
  }
  items.forEach(item=>{
   const link=nav.querySelector('[data-admin-jump="'+item.id+'"]');
   const target=document.getElementById(item.id);
   if(link)link.classList.toggle('hidden',!!target&&target.classList.contains('hidden'));
  });
  const activate=function(id){
   const link=nav.querySelector('[data-admin-jump="'+id+'"]');
   if(!link)return;
   nav.querySelectorAll('[data-admin-jump]').forEach(item=>{
    const active=item===link;
    item.classList.toggle('border-rose-500',active);
    item.classList.toggle('bg-rose-50',active);
    item.classList.toggle('text-rose-700',active);
    item.classList.toggle('dark:bg-rose-950/30',active);
    item.setAttribute('aria-current',active?'location':'false');
   });
  };
  nav.querySelectorAll('[data-admin-jump]').forEach(link=>link.addEventListener('click',()=>activate(link.dataset.adminJump)));
  if(!nav.dataset.observerReady&&'IntersectionObserver'in window){
   const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible)activate(visible.target.id);
   },{rootMargin:'-18% 0px -68% 0px',threshold:[0,0.15,0.4]});
   items.forEach(item=>{const target=document.getElementById(item.id);if(target){target.style.scrollMarginTop='16px';observer.observe(target);}});
   nav.dataset.observerReady='true';
  }
 })();
 const superAdmin=members.canManage===true;
 $('mat-admin-overrides').classList.toggle('hidden',!superAdmin);
 if(superAdmin){renderAdminOverrideCards();$('mat-admin-override-add-more').onclick=()=>addAdminOverrideCard();$('mat-admin-override-save-all').onclick=()=>saveAllAdminOverrides();}
 $('mat-admin-only-code-controls').classList.toggle('hidden',!superAdmin);
 $('mat-admin-fixed-code').value=superAdmin?(config.fixedCode||''):'';
 $('mat-admin-unlimited-toggle').textContent=promo.unlimitedEnabled?'Disable Admin-only Code':'Enable Admin-only Code';
 $('mat-global-code').value=config.global.code||'';$('mat-global-reward').value=config.global.rewardPB==null?'':config.global.rewardPB;
 $('mat-global-limit').value=config.global.limitCount==null?'':config.global.limitCount;$('mat-global-period').value=config.global.limitPeriod||'DAILY';$('mat-global-enabled').checked=config.global.enabled!==false;
 memberTargets=targets.members||[];
 adminMemberRecords=members.members||[];
 canManageAdminMembers=members.canManage===true;
 renderMemberOverrideCards();
 try{await loadPremiumNameAccess(members);}
 catch(error){
  const premiumSection=$('mat-premium-name-access');
  if(premiumSection&&members.canManage){
   premiumSection.classList.remove('hidden');
   $('mat-premium-name-list').textContent='Deploy the latest Apps Script backend version to manage subscriber Golden Name access.';
  }
  console.warn('[Premium Name] Access management API is not available yet:',error);
 }
 const box=$('mat-admin-members');
 box.className='rounded-2xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-900 p-3 sm:p-4 space-y-3';
 box.innerHTML='<div class="flex flex-wrap items-center justify-between gap-2"><div><h4 class="font-bold text-gray-900 dark:text-white">Admin Members</h4><p class="text-xs text-gray-500">Admin access, suspension and membership controls</p></div><span class="rounded-full bg-violet-100 dark:bg-violet-950 px-2.5 py-1 text-xs font-bold text-violet-700 dark:text-violet-300">'+members.members.filter(m=>m.role==='ADMIN'&&m.status!=='REMOVED').length+' Admins</span></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">'+members.members.map(m=>{const status=String(m.status||'ACTIVE').toUpperCase(),suspended=status==='SUSPENDED',removed=status==='REMOVED',root=m.role==='SUPER_ADMIN';return '<article class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><p class="font-semibold text-sm break-words">'+esc(m.websiteName||m.profile&&m.profile.name||m.email||'Admin member')+'</p><p class="text-xs text-gray-500 mt-0.5 break-all">'+esc(m.email)+'</p><p class="text-xs text-gray-500 mt-0.5">'+(root?'Super Admin':'Admin Member')+'</p></div><span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold '+(root?'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300':suspended?'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300':removed?'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300':'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300')+'">'+(root?'SUPER ADMIN':suspended?'SUSPENDED':removed?'REMOVED':'ACTIVE')+'</span></div>'+(suspended&&m.suspendedUntil?'<p class="text-xs text-amber-700 dark:text-amber-300">Access resumes: '+esc(m.suspendedUntil)+'</p>':'')+(!root&&members.canManage&&!removed?'<div class="flex flex-wrap gap-2 pt-1">'+(suspended?'<button data-reactivate="'+esc(m.email)+'" class="rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">Reactivate</button>':'<button data-suspend="'+esc(m.email)+'" class="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">Suspend Temporarily</button>')+'<button data-remove="'+esc(m.email)+'" class="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">Remove Admin</button></div>':'')+'<div class="pt-1"><button type="button" data-view-admin-profile="'+esc(m.userId)+'" class="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300" '+(!m.profile||!m.userId?'disabled':'')+'>View Profile</button></div></article>';}).join('')+'</div>';
 $('mat-admin-add-form').classList.toggle('hidden',!members.canManage);
 box.querySelectorAll('[data-view-admin-profile]').forEach(button=>button.onclick=()=>{
  const member=adminMemberRecords.find(item=>String(item.userId||'')===String(button.dataset.viewAdminProfile||''));
  if(!member||!member.profile){$('mat-admin-message').textContent='এই Admin-এর website profile পাওয়া যায়নি।';return;}
  if(!window.MedStudentProfile||typeof window.MedStudentProfile.open!=='function'){$('mat-admin-message').textContent='Profile view এখনো load হয়নি। Page refresh করে চেষ্টা করুন।';return;}
  const dashboard=$('mat-admin-dashboard'),profileView=$('view-student-profile');
  window.__matAdminReturnState={scrollY:window.scrollY||window.pageYOffset||0};
  if(dashboard)dashboard.classList.add('hidden');
  if(profileView&&!$('mat-back-to-admin-profile')){
   const back=document.createElement('button');back.type='button';back.id='mat-back-to-admin-profile';
   back.className='mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold';
   back.textContent='← Back to Admin Members';
   back.addEventListener('click',function(){if(dashboard)dashboard.classList.remove('hidden');const state=window.__matAdminReturnState||{};requestAnimationFrame(()=>window.scrollTo({top:Number(state.scrollY)||0,behavior:'auto'}));back.remove();});
   profileView.insertBefore(back,profileView.firstChild);
  }
  try{window.MedStudentProfile.open(Object.assign({},member.profile,{userId:member.userId,uid:member.userId,accountType:'REGISTERED',name:member.websiteName||member.profile.name||member.email}));}
  catch(error){if(dashboard)dashboard.classList.remove('hidden');$('mat-admin-message').textContent='Profile খোলা যায়নি: '+(error&&error.message||'Unknown error');}
 });
 box.querySelectorAll('[data-remove]').forEach(button=>button.onclick=async()=>{const email=button.dataset.remove;if(!confirm(email+'-এর Admin access স্থায়ীভাবে revoke করবেন?'))return;button.disabled=true;button.textContent='Removing…';try{await api('adminRemoveMember',{email});await loadAdmin();}catch(error){$('mat-admin-message').textContent=error.message;button.disabled=false;button.textContent='Remove Admin';}});
 box.querySelectorAll('[data-suspend]').forEach(button=>button.onclick=async()=>{const email=button.dataset.suspend,raw=prompt('কত সময়ের জন্য suspend করবেন? উদাহরণ: 2h 30m, 45m, 1d 4h');if(raw===null)return;const parts=String(raw).trim().match(/(\d+(?:\.\d+)?)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/gi);if(!parts||parts.join('').replace(/\s/g,'').toLowerCase()!==String(raw).replace(/[\s,]+/g,'').toLowerCase()){alert('সময় লিখুন যেমন: 2h 30m বা 1d 4h।');return;}let minutes=0;for(const part of parts){const match=part.trim().match(/^(\d+(?:\.\d+)?)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)$/i),unit=match[2].toLowerCase();minutes+=Number(match[1])*(unit[0]==='d'?1440:unit[0]==='h'?60:1);}minutes=Math.round(minutes);if(!Number.isSafeInteger(minutes)||minutes<1||minutes>525600){alert('কমপক্ষে ১ মিনিট এবং সর্বোচ্চ ৩৬৫ দিনের suspension দিন।');return;}if(!confirm(email+'-কে '+raw+' সময়ের জন্য suspend করবেন? সময় শেষ হলে access স্বয়ংক্রিয়ভাবে ফিরে আসবে।'))return;button.disabled=true;button.textContent='Suspending…';try{await api('adminSuspendMember',{email,durationMinutes:minutes});await loadAdmin();}catch(error){$('mat-admin-message').textContent=error.message;button.disabled=false;button.textContent='Suspend Temporarily';}});
 box.querySelectorAll('[data-reactivate]').forEach(button=>button.onclick=async()=>{const email=button.dataset.reactivate;if(!confirm(email+'-এর Admin access এখনই reactivate করবেন?'))return;button.disabled=true;button.textContent='Reactivating…';try{await api('adminReactivateMember',{email});await loadAdmin();}catch(error){$('mat-admin-message').textContent=error.message;button.disabled=false;button.textContent='Reactivate';}});

 // Guest deletion is a two-person control: any Admin may request; only Super Admin may decide.
 let section = $('mat-admin-guest-deletion');
 if (!section) {
  section = document.createElement('section');
  section.id = 'mat-admin-guest-deletion';
  section.className = 'rounded-2xl border border-amber-200 dark:border-amber-900 p-4 space-y-3';
  const adminMembersDetails=$('mat-admin-members-details');
  (adminMembersDetails&&adminMembersDetails.parentNode?adminMembersDetails.parentNode:box.parentNode).insertBefore(section,adminMembersDetails?adminMembersDetails.nextSibling:box.nextSibling);
 }
 try {
  const guestData = await api('adminListGuestDeletionTargets');
  const openGuestAdminProfile = function(userId, profileRows){
   const id=String(userId||'').trim();
   const rows=Array.isArray(profileRows)?profileRows:[];
   const row=rows.find(item=>String(item&&(
    item.userId||item.uid||item.playerId||item.profile&&item.profile.userId
   )||'').trim()===id);
   if(!id){$('mat-guest-delete-status').textContent='Guest account ID পাওয়া যায়নি।';return;}
   if(!window.MedStudentProfile||typeof window.MedStudentProfile.open!=='function'){
    $('mat-guest-delete-status').textContent='Global Profile এখনো load হয়নি। Page refresh করে আবার চেষ্টা করুন।';return;
   }
   // Preserve the current Admin Workspace selection and viewport before
   // temporarily switching to the shared student profile view.
   const adminNav=document.getElementById('mat-admin-quick-nav');
   const activeAdminLink=adminNav&&adminNav.querySelector('[data-admin-jump][aria-current="location"]');
   window.__matAdminReturnState={
    scrollY:window.scrollY||window.pageYOffset||0,
    activeSectionId:activeAdminLink?activeAdminLink.getAttribute('data-admin-jump'):'',
    navSearch:adminNav&&adminNav.querySelector('#mat-admin-nav-search')?adminNav.querySelector('#mat-admin-nav-search').value:''
   };
   // The admin workspace is a full-screen overlay. Hide it before opening the
   // shared student profile view, otherwise the profile opens underneath it.
   const dashboard=$('mat-admin-dashboard');
   if(dashboard)dashboard.classList.add('hidden');
   const source=row&&row.profile&&typeof row.profile==='object'?row.profile:(row||{});
   const profile=Object.assign({},source,{
    userId:id,uid:id,accountType:'GUEST',
    name:source.name||row&&row.name||'Guest Student'
   });
   // Add a clear return path because the admin dashboard is temporarily hidden
   // while the shared student profile view is displayed.
   const profileView=$('view-student-profile');
   if(profileView&&!$('mat-back-to-guest-admin')){
    const back=document.createElement('button');
    back.type='button';
    back.id='mat-back-to-guest-admin';
    back.className='mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-100 shadow-sm hover:border-rose-400';
    back.textContent='← Back to Admin Panel · Guest Account Deletion';
    back.addEventListener('click',function(){
     const admin=$('mat-admin-dashboard');
     if(admin)admin.classList.remove('hidden');
     const state=window.__matAdminReturnState||{};
     const nav=document.getElementById('mat-admin-quick-nav');
     const search=nav&&nav.querySelector('#mat-admin-nav-search');
     if(search&&typeof state.navSearch==='string'){
      search.value=state.navSearch;
      search.dispatchEvent(new Event('input',{bubbles:true}));
     }
     if(nav){
      nav.querySelectorAll('[data-admin-jump]').forEach(link=>{
       const active=!!state.activeSectionId&&link.getAttribute('data-admin-jump')===state.activeSectionId;
       link.classList.toggle('border-rose-500',active);
       link.classList.toggle('bg-rose-50',active);
       link.classList.toggle('text-rose-700',active);
       link.classList.toggle('dark:bg-rose-950/30',active);
       link.setAttribute('aria-current',active?'location':'false');
      });
     }
     requestAnimationFrame(()=>window.scrollTo({top:Number.isFinite(Number(state.scrollY))?Number(state.scrollY):0,behavior:'auto'}));
    });
    profileView.insertBefore(back,profileView.firstChild);
   }
   try{
    window.MedStudentProfile.open(profile);
   }catch(error){
    if(dashboard)dashboard.classList.remove('hidden');
    $('mat-guest-delete-status').textContent='Profile খোলা যায়নি: '+(error&&error.message||'Unknown error');
   }
  };
  section.innerHTML = '<details open><summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 font-bold text-sm text-gray-900 dark:text-white">Guest Account Deletion <span class="text-xs font-normal text-gray-500">Expand / Collapse</span></summary><div class="pt-3"><p class="text-xs text-gray-500 mb-3">Admin request করতে পারবে; deletion কার্যকর হবে শুধু Super Admin approval-এর পর। User countdown-এর পাশেই আপনার দেওয়া কারণ দেখতে পাবে।</p><div class="flex flex-col sm:flex-row gap-2"><select id="mat-guest-delete-target" class="min-w-0 flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"><option value="">Select Guest account</option>'+guestData.guests.filter(g=>!g.deletionPending).map(g=>'<option value="'+esc(g.userId)+'">'+esc(g.name||'Guest Student')+' · '+esc(g.userId)+'</option>').join('')+'</select><button type="button" id="mat-guest-delete-view-profile" disabled class="rounded-xl border border-sky-400 px-4 py-2 text-sm font-bold text-sky-700 disabled:opacity-40">View Profile</button><button id="mat-guest-delete-request" class="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white">Request deletion</button></div><label for="mat-guest-delete-reason" class="block text-xs font-semibold">Reason shown to the user (required)</label><textarea id="mat-guest-delete-reason" maxlength="500" rows="3" required placeholder="কেন account deletion request করা হচ্ছে তা স্পষ্টভাবে লিখুন…" class="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"></textarea><p class="text-xs text-gray-500">৫–৫০০ অক্ষর। Super Admin approve করলে countdown-এর পাশেই user এটি দেখতে পাবে।</p><p id="mat-guest-delete-status" class="text-xs text-gray-500"></p>'+(members.canManage?'<details class="border-t border-amber-200 dark:border-amber-900 pt-3"><summary class="cursor-pointer font-bold text-sm">Pending Super Admin approvals</summary><div id="mat-guest-delete-requests" class="mt-2 space-y-2 text-sm">Loading…</div></details>':'');
  const guestTargetSelect=$('mat-guest-delete-target'),guestProfileButton=$('mat-guest-delete-view-profile');
  guestTargetSelect.onchange=function(){guestProfileButton.disabled=!this.value;};
  guestProfileButton.onclick=function(){if(guestTargetSelect.value)openGuestAdminProfile(guestTargetSelect.value,guestData.guests);};
  $('mat-guest-delete-request').onclick = async function(){
   const userId=$('mat-guest-delete-target').value,reason=$('mat-guest-delete-reason').value.trim(),button=this,status=$('mat-guest-delete-status');
   if(!userId){status.textContent='আগে Guest account select করুন।';return;}
   if(reason.length<5||reason.length>500){status.textContent='কারণ ৫–৫০০ অক্ষরের মধ্যে লিখুন।';$('mat-guest-delete-reason').focus();return;}
   if(!confirm('এই Guest account deletion-এর জন্য Super Admin approval request করবেন?'))return;
   const previousButtonContent=button.innerHTML;
   button.disabled=true;
   button.innerHTML='Requesting deletion<span class="mat-request-loading-dots" aria-label="Loading"><i>.</i><i>.</i><i>.</i></span>';
   status.textContent='Request submitting…';
   if(!document.getElementById('mat-request-loading-dots-style')){
    const loadingStyle=document.createElement('style');
    loadingStyle.id='mat-request-loading-dots-style';
    loadingStyle.textContent='@keyframes matRequestDotPulse{0%,65%,100%{opacity:.2;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}.mat-request-loading-dots{display:inline-flex;gap:1px;margin-left:2px}.mat-request-loading-dots i{font-style:normal;animation:matRequestDotPulse 1s infinite}.mat-request-loading-dots i:nth-child(2){animation-delay:.15s}.mat-request-loading-dots i:nth-child(3){animation-delay:.3s}';
    document.head.appendChild(loadingStyle);
   }
   try{const result=await api('adminCreateGuestDeletionRequest',{userId,reason});if(!result||result.success!==true||result.verified!==true)throw new Error('Backend request save verify করেনি। Latest Apps Script deployment check করে আবার চেষ্টা করুন।');$('mat-guest-delete-target').value='';$('mat-guest-delete-reason').value='';if(members.canManage){await loadAdmin();const refreshedStatus=$('mat-guest-delete-status');if(refreshedStatus)refreshedStatus.textContent='কারণসহ request Pending Approval queue-তে save ও verify হয়েছে।';}else{status.textContent='কারণসহ request Pending Approval queue-তে save ও verify হয়েছে।';}}
   catch(error){status.textContent=error.message||'Request failed.';}
   finally{button.disabled=false;button.innerHTML=previousButtonContent;}
  };
  if(members.canManage){
   try{
    const pending=await api('adminListGuestDeletionRequests'),host=$('mat-guest-delete-requests');
    host.innerHTML=pending.requests.length?pending.requests.map(req=>'<div class="rounded-xl border border-gray-200 dark:border-gray-700 p-3"><p class="font-semibold break-all">'+esc(req.name||'Guest Student')+'</p><p class="text-xs text-gray-500">'+esc(req.userId)+'</p><p class="text-xs text-gray-500 mt-1">Requested by '+esc(req.requestedBy)+' · '+esc(req.requestedAt)+'</p><p class="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2 text-xs">Reason: '+esc(req.reason||'No reason supplied')+'</p><div class="flex flex-wrap gap-2 mt-2"><button type="button" data-guest-profile="'+esc(req.userId)+'" class="rounded-lg border border-sky-400 px-3 py-1.5 text-xs font-bold text-sky-700">View Profile</button><button data-guest-approve="'+esc(req.requestId)+'" class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white">Approve deletion</button><button data-guest-reject="'+esc(req.requestId)+'" class="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-bold">Reject</button></div></div>').join(''):'No pending requests.';
    host.querySelectorAll('[data-guest-profile]').forEach(button=>button.onclick=()=>openGuestAdminProfile(button.getAttribute('data-guest-profile'),pending.requests.map(req=>req.profile).filter(Boolean)));
    host.querySelectorAll('[data-guest-approve],[data-guest-reject]').forEach(button=>button.onclick=async()=>{
     const approve=button.hasAttribute('data-guest-approve'),requestId=button.getAttribute(approve?'data-guest-approve':'data-guest-reject');
     if(!confirm(approve?'Guest account deletion approve করবেন?':'এই deletion request reject করবেন?'))return;
     button.disabled=true;button.textContent=approve?'Approving...':'Rejecting...';
     try{await api('adminResolveGuestDeletionRequest',{requestId,decision:approve?'APPROVE':'REJECT'});await loadAdmin();}
     catch(error){$('mat-admin-message').textContent=error.message||'Approval update failed.';button.disabled=false;}
    });
   }catch(error){const message=String(error&&error.message||'');$('mat-guest-delete-requests').textContent=/getLastRow|undefined/i.test(message)?'Approval queue load করা যায়নি। Deployed backend ও Apps Script execution logs পরীক্ষা করুন।':'Approval queue unavailable: '+(message||'Unknown error');}
   // Super Admin: manage already-approved deletion deadlines and inspect audit history.
   if(members.canManage){
    try{
     const targets=await api('adminListGuestDeletionTargets');
     const active=(targets.guests||[]).filter(g=>g.deletionPending&&Date.parse(g.scheduledAt)>Date.now());
     let management=document.getElementById('mat-guest-delete-management');
     if(!management){management=document.createElement('div');management.id='mat-guest-delete-management';management.className='border-t border-amber-200 dark:border-amber-900 pt-3 space-y-3';section.appendChild(management);}
     if(management.__countdownTimer)clearInterval(management.__countdownTimer);
     management.innerHTML='<details><summary class="cursor-pointer font-bold text-sm">Approved deletion schedules · Super Admin</summary><div class="mt-2 space-y-2">'+(active.length?active.map(g=>'<div class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2"><p class="text-xs font-semibold">'+esc(g.name||'Guest Student')+'</p><p class="text-xs break-all text-gray-500">'+esc(g.userId)+'</p><p class="text-sm font-bold text-amber-700 dark:text-amber-300" data-guest-deletion-countdown data-deadline="'+esc(g.scheduledAt)+'">Calculating countdown…</p><div class="flex flex-wrap gap-2"><button type="button" data-guest-profile="'+esc(g.userId)+'" class="rounded-lg border border-sky-400 px-3 py-1.5 text-xs font-bold text-sky-700">View Profile</button><button type="button" data-guest-extend="'+esc(g.userId)+'" class="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-bold">Extend deadline</button><button type="button" data-guest-cancel-admin="'+esc(g.userId)+'" class="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700">Cancel deletion</button></div></div>').join(''):'<p class="text-xs text-gray-500">No active approved Guest deletions.</p>')+'</div></details><details class="border-t border-gray-200 dark:border-gray-700 pt-2"><summary class="cursor-pointer font-bold text-sm">Deletion audit history</summary><div class="mt-2"><div id="mat-guest-delete-audit-controls" class="hidden flex flex-wrap items-center gap-2 text-xs"><button type="button" data-audit-select-all class="rounded-lg border px-2 py-1 font-semibold">Select All</button><button type="button" data-audit-clear-selection class="rounded-lg border px-2 py-1 font-semibold">Clear Selection</button><button type="button" data-audit-remove-selected class="rounded-lg bg-rose-600 px-2 py-1 font-semibold text-white disabled:opacity-40" disabled>Remove Selected</button><span data-audit-selected-count>0 selected</span></div><div id="mat-guest-delete-audit" class="mt-2 space-y-1 text-xs text-gray-500">Loading…</div></div></details></div></details>';
     const updateDeletionCountdowns=()=>management.querySelectorAll('[data-guest-deletion-countdown]').forEach(el=>{const deadline=Date.parse(el.getAttribute('data-deadline')||''),seconds=Number.isFinite(deadline)?Math.max(0,Math.floor((deadline-Date.now())/1000)):0;el.textContent=seconds?('Time remaining: '+Math.floor(seconds/86400)+'d '+Math.floor(seconds%86400/3600)+'h '+Math.floor(seconds%3600/60)+'m '+seconds%60+'s'):'Deletion deadline reached.';});
     updateDeletionCountdowns();management.__countdownTimer=setInterval(updateDeletionCountdowns,1000);
     management.querySelectorAll('[data-guest-profile]').forEach(button=>button.onclick=()=>openGuestAdminProfile(button.getAttribute('data-guest-profile'),targets.guests));
     management.querySelectorAll('[data-guest-extend]').forEach(button=>button.onclick=async()=>{
      const userId=button.getAttribute('data-guest-extend');
      const duration=prompt('বর্তমান deadline-এর সঙ্গে কত সময় যোগ করবেন? উদাহরণ: 2h 30m, 45m, 1d 4h');
      if(duration===null)return;
      const parts=String(duration).trim().match(/(\\d+(?:\\.\\d+)?)\\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/gi);
      if(!parts||parts.join('').replace(/\\s/g,'').toLowerCase()!==String(duration).replace(/[\\s,]+/g,'').toLowerCase()){alert('সময় লিখুন যেমন: 2h 30m, 45m বা 1d 4h।');return;}
      let extensionMinutes=0;for(const part of parts){const match=part.trim().match(/^(\\d+(?:\\.\\d+)?)\\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)$/i);const unit=match[2].toLowerCase();extensionMinutes+=Number(match[1])*(unit[0]==='d'?1440:unit[0]==='h'?60:1);}
      extensionMinutes=Math.round(extensionMinutes);
      if(!Number.isSafeInteger(extensionMinutes)||extensionMinutes<1||extensionMinutes>525600){alert('কমপক্ষে ১ মিনিট এবং সর্বোচ্চ ৩৬৫ দিনের extension দিন।');return;}
      const reason=prompt('Reason (required): কেন deadline extend করছেন?');
      if(reason===null)return;if(!String(reason).trim()){alert('Deadline extend করতে Reason দেওয়া বাধ্যতামূলক।');return;}
      button.disabled=true;button.textContent='Extending...';try{await api('adminExtendGuestDeletion',{userId,extensionMinutes,reason:String(reason).trim()});await loadAdmin();}catch(error){alert(error.message||'Deadline extend করা যায়নি।');button.disabled=false;button.textContent='Extend deadline';}
     });
     management.querySelectorAll('[data-guest-cancel-admin]').forEach(button=>button.onclick=async()=>{
      const userId=button.getAttribute('data-guest-cancel-admin');if(!confirm('এই Guest deletion Super Admin হিসেবে cancel করবেন?'))return;
      button.disabled=true;button.textContent='Cancelling...';try{await api('adminCancelGuestDeletion',{userId});await loadAdmin();}catch(error){alert(error.message||'Deletion cancel করা যায়নি।');button.disabled=false;}
     });
     const audit=await api('adminListGuestDeletionAudit');
     const auditHost=document.getElementById('mat-guest-delete-audit');
     const auditEvents=Array.isArray(audit.events)?audit.events:[],selectableAuditEvents=auditEvents.filter(e=>String(e.eventId||'').trim()),auditControls=document.getElementById('mat-guest-delete-audit-controls'),selectedAuditIds=new Set();
     if(selectableAuditEvents.length)auditControls.classList.remove('hidden');
     const renderAudit=()=>{
      const selectedCount=selectedAuditIds.size,selectAllButton=auditControls.querySelector('[data-audit-select-all]'),clearButton=auditControls.querySelector('[data-audit-clear-selection]'),removeButton=auditControls.querySelector('[data-audit-remove-selected]');
      auditControls.querySelector('[data-audit-selected-count]').textContent=selectedCount+' selected';
      selectAllButton.textContent=selectableAuditEvents.length>0&&selectedCount===selectableAuditEvents.length?'Unselect All':'Select All';
      selectAllButton.disabled=!selectableAuditEvents.length;
      removeButton.disabled=!selectedCount;clearButton.disabled=!selectedCount;
      auditHost.innerHTML=auditEvents.length?auditEvents.map(e=>{
       const id=String(e.eventId||'').trim(),selectable=!!id;
       return '<label class="flex items-start gap-2 border-t border-gray-100 dark:border-gray-800 py-2">'+(selectable?'<input type="checkbox" data-audit-event="'+esc(id)+'" class="mt-0.5" '+(selectedAuditIds.has(id)?'checked':'')+'>':'<span class="mt-0.5 inline-block w-3.5 shrink-0 text-gray-400" title="This legacy record has no Event ID">—</span>')+'<span><strong>'+esc(e.event)+'</strong> · '+esc(e.userId)+'<br><span>'+esc(e.role)+' '+esc(e.actor)+' · '+esc(e.at)+'</span>'+(e.newDeadline?'<br><span>Deadline: '+esc(e.newDeadline)+'</span>':'')+(e.notes?'<br><span>Reason / Notes: '+esc(e.notes)+'</span>':'')+(!selectable?'<br><span class="text-amber-600">Cannot select this older record because it has no Event ID.</span>':'')+'</span></label>';
      }).join(''):'No audit events yet.';
      auditHost.querySelectorAll('[data-audit-event]').forEach(input=>input.onchange=()=>{
       const id=input.getAttribute('data-audit-event');if(!id)return;
       if(input.checked)selectedAuditIds.add(id);else selectedAuditIds.delete(id);
       renderAudit();
      });
     };
     auditControls.querySelector('[data-audit-select-all]').onclick=()=>{
      if(!selectableAuditEvents.length)return;
      if(selectedAuditIds.size===selectableAuditEvents.length)selectedAuditIds.clear();
      else selectableAuditEvents.forEach(e=>selectedAuditIds.add(String(e.eventId).trim()));
      renderAudit();
     };
     auditControls.querySelector('[data-audit-clear-selection]').onclick=()=>{selectedAuditIds.clear();renderAudit();};
     auditControls.querySelector('[data-audit-remove-selected]').onclick=async()=>{
      const ids=Array.from(selectedAuditIds);if(!ids.length)return;
      if(!confirm(ids.length+'টি selected audit record স্থায়ীভাবে remove করবেন? Guest deletion request বা approved schedule পরিবর্তন হবে না।'))return;
      const removeButton=auditControls.querySelector('[data-audit-remove-selected]');removeButton.disabled=true;removeButton.textContent='Removing…';
      try{const result=await api('adminDeleteGuestDeletionAudit',{eventIds:ids});if(!result||result.success!==true||Number(result.removed)!==ids.length)throw new Error('সব selected audit record remove হয়েছে কি না নিশ্চিত করা যায়নি। Refresh করে আবার যাচাই করুন।');await loadAdmin();}
      catch(error){alert(error.message||'Audit records remove করা যায়নি।');removeButton.disabled=false;removeButton.textContent='Remove Selected';}
     };
     renderAudit();
    }catch(error){console.warn('[Guest deletion management]',error);}
   }
  }
 } catch(error) {
  const section = $('mat-admin-guest-deletion');
  if(section && !section.querySelector('#mat-guest-delete-status')){
   section.innerHTML = '<details open><summary class="cursor-pointer list-none flex items-center justify-between gap-2 font-bold text-sm">Guest Account Deletion <span class="text-xs font-normal text-gray-500">Expand / Collapse</span></summary><p class="pt-3 text-sm text-rose-600">Guest deletion data could not be loaded: '+esc(error&&error.message||'Please refresh and try again.')+'</p></details>';
  }
  console.warn('[Guest deletion approval]',error);
 }

 const fixedSave=$('mat-admin-fixed-code-save');fixedSave.onclick=async()=>{fixedSave.disabled=true;fixedSave.textContent='Saving…';try{await api('adminSaveFixedPromoCode',{code:$('mat-admin-fixed-code').value});$('mat-admin-message').textContent='Master Admin-only Code saved.';await refresh();}catch(e){$('mat-admin-message').textContent=e.message||'Master code save failed.';}finally{fixedSave.disabled=false;fixedSave.textContent='Save Master Code';}};
 const toggle=$('mat-admin-unlimited-toggle');toggle.onclick=async()=>{const label=toggle.textContent;toggle.disabled=true;toggle.textContent=(promo.unlimitedEnabled?'Disabling':'Enabling')+'...';try{await api('adminSetUnlimitedEnabled',{enabled:!promo.unlimitedEnabled});await refresh();}catch(e){$('mat-admin-message').textContent=e.message;toggle.disabled=false;toggle.textContent=label;}};
}
async function refresh(){
 if(refreshInFlight){refreshPending=true;return;}
 refreshInFlight=true;
 try{
  const d=await api('getPromoInfo');
  $('mat-promo-public-code').textContent=d.publicCode;
  $('mat-promo-public-meta').textContent=(d.publicType==='weekly'?'Weekly · Saturday only':'Daily · আজ রাত ১২টা পর্যন্ত')+' · '+Number(d.rewardPB||0).toLocaleString()+' PB · Bangladesh Time';
  $('mat-promo-balance').textContent=Number(d.promoPB||0).toLocaleString()+' PB';
  if(d.assignedCode&&d.assignedCode!==d.publicCode){$('mat-promo-assigned-wrap').classList.remove('hidden');$('mat-promo-assigned-code').textContent=d.assignedCode;$('mat-promo-assigned-meta').textContent='আপনার জন্য নির্ধারিত code · PB ও limit Admin settings অনুযায়ী';}
  else $('mat-promo-assigned-wrap').classList.add('hidden');
  if(d.isAdmin&&d.adminCode){$('mat-promo-admin-code-wrap').classList.remove('hidden');$('mat-promo-admin-code').textContent=d.adminCode;}
  else $('mat-promo-admin-code-wrap').classList.add('hidden');
  if(d.isAdmin){adminAccessConfirmed=true;ensureAdminDashboard();await loadAdmin();}else{adminAccessConfirmed=false;const b=$('mat-admin-management-nav'),dash=$('mat-admin-dashboard');if(b)b.classList.add('hidden');if(dash)dash.classList.add('hidden');}
 }catch(e){$('mat-promo-public-code').textContent='Sign in করে Promo Code ব্যবহার করুন';$('mat-promo-message').textContent=e.message;}
 finally{refreshInFlight=false;if(refreshPending){refreshPending=false;Promise.resolve().then(refresh);}}
}
window.addEventListener('student-progress-updated',event=>{const p=event.detail||{};const appProfile=window.app&&window.app.profile||{};const currentId=String(appProfile.userId||appProfile.uid||'');const eventId=String(p.userId||p.uid||p.playerId||'');if(currentId&&eventId===currentId&&p.promoPB!=null&&$('mat-promo-balance'))$('mat-promo-balance').textContent=Number(p.promoPB||0).toLocaleString()+' PB';});
function mount(){card();if(adminAccessConfirmed)ensureAdminDashboard();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.addEventListener('mat:firebase-auth-ready',()=>{if($('mat-promo-card'))refresh();});
new MutationObserver(()=>{if(document.body&&$('sidebar-student-profile-extras'))mount();}).observe(document.documentElement,{childList:true,subtree:true});
})();