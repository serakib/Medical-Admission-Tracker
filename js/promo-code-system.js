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
  <section id="mat-premium-name-access" class="hidden rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-3">
   <div><h4 class="font-extrabold text-sm text-amber-800 dark:text-amber-300"><i class="fa-solid fa-crown mr-1" aria-hidden="true"></i> Premium Golden Name Access</h4><p class="text-xs text-gray-600 dark:text-gray-300 mt-1">Admin members get this automatically. Super Admin can manually grant or revoke it for subscribers after subscription payment is confirmed.</p></div>
   <div class="flex flex-col sm:flex-row gap-2"><select id="mat-premium-name-member" class="min-w-0 flex-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"><option value="">Choose a registered member</option></select><button id="mat-premium-name-grant" type="button" class="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-extrabold text-white">Grant Golden Name</button></div>
   <div id="mat-premium-name-list" class="space-y-2 text-sm"></div>
  </section>
  <form id="mat-promo-global-form" class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
   <h4 class="font-bold text-sm">Global Promo Settings</h4>
   <label class="block text-xs font-semibold">Global Promo Code<input id="mat-global-code" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Leave blank to keep Daily/Weekly code"></label>
   <div class="grid grid-cols-2 gap-2"><label class="text-xs font-semibold">PB per redeem<input id="mat-global-reward" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Default"></label><label class="text-xs font-semibold">Redeem limit<input id="mat-global-limit" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Default"></label></div>
   <div class="flex flex-wrap items-center gap-2"><label class="text-xs font-semibold">Limit period<select id="mat-global-period" class="ml-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2"><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="UNLIMITED">Unlimited</option></select></label><label class="text-xs flex items-center gap-1"><input id="mat-global-enabled" type="checkbox" checked> Enabled</label></div>
   <button class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save Global Settings</button>
  </form>
  <section id="mat-member-overrides" class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
   <div class="flex flex-wrap items-center justify-between gap-2"><div><h4 class="font-bold text-sm">Admin-only Promo Code & Individual Overrides</h4><p class="text-xs text-gray-500 dark:text-gray-400">Admin select করলে Super Admin তার Admin-only code access, PB reward এবং redemption limit আলাদাভাবে সেট করতে পারবেন। Regular member-এর override-ও এখান থেকে manage হবে।</p></div><button type="button" id="mat-member-add-more" class="rounded-lg border border-rose-300 dark:border-rose-800 px-3 py-2 text-xs font-extrabold text-rose-700 dark:text-rose-300">+ Add More</button></div>
   <div id="mat-member-override-list" class="space-y-3"></div>
   <div class="flex flex-wrap items-center gap-2"><button type="button" id="mat-member-save-all" class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save All</button><span id="mat-member-note" class="text-xs text-gray-500 dark:text-gray-400">প্রতিটি section আলাদাভাবে Save করতে পারবেন, অথবা Save All ব্যবহার করতে পারবেন।</span></div>
  </section>
  <div id="mat-admin-members" class="space-y-2 text-sm"></div>
  <div class="flex flex-col sm:flex-row gap-2"><button type="button" id="mat-admin-unlimited-toggle" class="rounded-lg px-3 py-2 bg-gray-800 text-white text-xs font-bold">Loading Admin Code…</button></div>
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
  '<label class="block text-xs font-semibold">Member-specific Promo Code<input data-member-field="code" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Blank = inherit global/public code"></label>'+
  '<div class="grid grid-cols-2 gap-2"><label class="text-xs font-semibold">PB per redeem<input data-member-field="rewardPB" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Inherit global"></label><label class="text-xs font-semibold">Redeem limit<input data-member-field="limitCount" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Inherit global"></label></div>'+
  '<div class="flex flex-wrap items-center gap-2"><label class="text-xs font-semibold">Limit period<select data-member-field="limitPeriod" class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2"><option value="">Inherit global</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="UNLIMITED">Unlimited</option></select></label><label class="text-xs flex items-center gap-1"><input data-member-field="enabled" type="checkbox" checked> Enabled</label></div>'+
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
 status.textContent=isRoot?'SUPER ADMIN · Admin-only code access ও settings manage করা যাবে; role revoke করা যাবে না':isAdmin?'ADMIN MEMBER · Super Admin এখান থেকে Admin-only code access, PB ও limit সেট করতে পারবেন':'REGULAR MEMBER · এখানে regular promo override সেট হবে; Admin-only code ব্যবহার করতে পারবে না';
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
   try{await api('adminDeleteMemberPromo',{userId:id});$('mat-admin-message').textContent='Member override removed.';await loadAdmin();}
   catch(error){$('mat-admin-message').textContent=error.message||'Override remove failed.';}
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
  button.disabled=true;
  try{
   await api('adminSetPremiumNameAccess',{userId:userId,enabled:false});
   $('mat-admin-message').textContent='Premium Golden Name access revoked.';
   await loadPremiumNameAccess(members);
  }catch(error){$('mat-admin-message').textContent=error.message||'Access revoke failed.';button.disabled=false;}
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
   {id:'mat-admin-members',label:'Admin Members',group:'Admin Team',keywords:'admins roles remove members'},
   {id:'mat-admin-add-form',label:'Add Admin',group:'Admin Team',keywords:'invite add email admin'},
   {id:'mat-admin-unlimited-toggle',label:'Admin Code',group:'Admin Team',keywords:'unlimited admin only code'},
   {id:'mat-admin-guest-deletion',label:'Guest Deletion',group:'Account Safety',keywords:'guest account delete approval pending schedule'}
  ];
  if(!nav){
   nav=document.createElement('nav');
   nav.id='mat-admin-quick-nav';
   nav.setAttribute('aria-label','Admin panel navigation');
   nav.className='sticky top-2 z-40 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 shadow-lg space-y-3';
   nav.innerHTML='<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><p class="text-sm font-extrabold text-slate-900 dark:text-white">Admin Workspace</p><p class="text-[11px] text-slate-500">Jump to a tool · active section is highlighted</p></div><label class="relative block sm:w-64"><span class="sr-only">Search admin sections</span><input id="mat-admin-nav-search" type="search" autocomplete="off" placeholder="Search admin tools…" class="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 pl-9 text-xs outline-none focus:border-rose-400"><span class="pointer-events-none absolute left-3 top-2 text-slate-400">⌕</span></label></div><div id="mat-admin-nav-groups" class="space-y-2">'+['Access & Rewards','Admin Team','Account Safety'].map(group=>'<div data-admin-nav-group="'+group+'" class="space-y-1"><p class="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">'+group+'</p><div class="flex gap-2 overflow-x-auto pb-1">'+items.filter(item=>item.group===group).map(item=>'<a href="#'+item.id+'" data-admin-jump="'+item.id+'" data-label="'+item.label.toLowerCase()+'" data-keywords="'+item.keywords+'" class="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-rose-400 hover:text-rose-600" aria-current="false">'+item.label+'</a>').join('')+'</div></div>').join('')+'</div><div class="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2"><p id="mat-admin-nav-current" class="text-[11px] text-slate-500">Choose a section to get started</p><button type="button" id="mat-admin-nav-top" class="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">↑ Back to top</button></div>';
   const heading=panel.firstElementChild;
   if(heading)heading.insertAdjacentElement('afterend',nav);else panel.insertBefore(nav,panel.firstChild);
   nav.addEventListener('click',function(event){
    const link=event.target.closest('[data-admin-jump]');
    if(!link)return;
    const target=document.getElementById(link.getAttribute('data-admin-jump'));
    if(target){event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});}
   });
   nav.querySelector('#mat-admin-nav-top').addEventListener('click',()=>panel.scrollIntoView({behavior:'smooth',block:'start'}));
   nav.querySelector('#mat-admin-nav-search').addEventListener('input',function(){
    const query=this.value.trim().toLowerCase();
    nav.querySelectorAll('[data-admin-jump]').forEach(link=>link.classList.toggle('hidden',!!query&&!(link.dataset.label+' '+link.dataset.keywords).includes(query)));
    nav.querySelectorAll('[data-admin-nav-group]').forEach(group=>group.classList.toggle('hidden',!group.querySelector('[data-admin-jump]:not(.hidden)')));
   });
  }
  items.forEach(item=>{
   const link=nav.querySelector('[data-admin-jump="'+item.id+'"]');
   const target=document.getElementById(item.id);
   if(link)link.classList.toggle('hidden',!target||target.classList.contains('hidden'));
  });
  nav.querySelectorAll('[data-admin-nav-group]').forEach(group=>group.classList.toggle('hidden',!group.querySelector('[data-admin-jump]:not(.hidden)')));
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
   const current=nav.querySelector('#mat-admin-nav-current');
   if(current)current.textContent='Current section: '+link.textContent.trim();
  };
  nav.querySelectorAll('[data-admin-jump]').forEach(link=>link.addEventListener('click',()=>activate(link.dataset.adminJump)));
  if(!nav.dataset.observerReady&&'IntersectionObserver'in window){
   const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible)activate(visible.target.id);
   },{rootMargin:'-18% 0px -68% 0px',threshold:[0,0.15,0.4]});
   items.forEach(item=>{const target=document.getElementById(item.id);if(target){target.style.scrollMarginTop='150px';observer.observe(target);}});
   nav.dataset.observerReady='true';
  }
 })();
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
 box.innerHTML='<h4 class="font-bold text-gray-800 dark:text-white">Admin Members</h4>'+members.members.map(m=>'<div class="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 py-2"><span class="min-w-0 break-all">'+esc(m.email)+' <small class="text-gray-500">('+esc(m.role)+')</small></span>'+(m.role==='SUPER_ADMIN'||!members.canManage?'':'<button data-remove="'+esc(m.email)+'" class="text-xs font-bold text-rose-600">Remove</button>')+'</div>').join('');
 $('mat-admin-add-form').classList.toggle('hidden',!members.canManage);
 box.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('এই Admin Member-কে remove করবেন?'))return;try{await api('adminRemoveMember',{email:b.dataset.remove});await loadAdmin();}catch(e){$('mat-admin-message').textContent=e.message;}}));

 // Guest deletion is a two-person control: any Admin may request; only Super Admin may decide.
 try {
  const guestData = await api('adminListGuestDeletionTargets');
  let section = $('mat-admin-guest-deletion');
  if (!section) {
   section = document.createElement('section');
   section.id = 'mat-admin-guest-deletion';
   section.className = 'rounded-2xl border border-amber-200 dark:border-amber-900 p-4 space-y-3';
   box.parentNode.insertBefore(section, box.nextSibling);
  }
  const openGuestAdminProfile = function(userId, profileRows){
   const row=(profileRows||[]).find(item=>String(item.userId||'')===String(userId||''));
   if(!row){$('mat-guest-delete-status').textContent='এই account-এর profile data পাওয়া যায়নি।';return;}
   if(!window.MedStudentProfile||typeof window.MedStudentProfile.open!=='function'){
    $('mat-guest-delete-status').textContent='Global Profile এখনো load হয়নি। একটু পরে চেষ্টা করুন।';return;
   }
   window.MedStudentProfile.open(Object.assign({},row,{userId:String(row.userId),accountType:'GUEST'}));
  };
  section.innerHTML = '<div><h4 class="font-bold text-gray-900 dark:text-white">Guest Account Deletion</h4><p class="text-xs text-gray-500 mt-1">Admin request করতে পারবে; deletion কার্যকর হবে শুধু Super Admin approval-এর পর। User countdown-এর পাশেই আপনার দেওয়া কারণ দেখতে পাবে।</p></div><div class="flex flex-col sm:flex-row gap-2"><select id="mat-guest-delete-target" class="min-w-0 flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"><option value="">Select Guest account</option>'+guestData.guests.filter(g=>!g.deletionPending).map(g=>'<option value="'+esc(g.userId)+'">'+esc(g.name||'Guest Student')+' · '+esc(g.userId)+'</option>').join('')+'</select><button type="button" id="mat-guest-delete-view-profile" disabled class="rounded-xl border border-sky-400 px-4 py-2 text-sm font-bold text-sky-700 disabled:opacity-40">View Profile</button><button id="mat-guest-delete-request" class="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white">Request deletion</button></div><label for="mat-guest-delete-reason" class="block text-xs font-semibold">Reason shown to the user (required)</label><textarea id="mat-guest-delete-reason" maxlength="500" rows="3" required placeholder="কেন account deletion request করা হচ্ছে তা স্পষ্টভাবে লিখুন…" class="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"></textarea><p class="text-xs text-gray-500">৫–৫০০ অক্ষর। Super Admin approve করলে countdown-এর পাশেই user এটি দেখতে পাবে।</p><p id="mat-guest-delete-status" class="text-xs text-gray-500"></p>'+(members.canManage?'<div class="border-t border-amber-200 dark:border-amber-900 pt-3"><h5 class="font-bold text-sm">Pending Super Admin approvals</h5><div id="mat-guest-delete-requests" class="mt-2 space-y-2 text-sm">Loading…</div></div>':'');
  const guestTargetSelect=$('mat-guest-delete-target'),guestProfileButton=$('mat-guest-delete-view-profile');
  guestTargetSelect.onchange=function(){guestProfileButton.disabled=!this.value;};
  guestProfileButton.onclick=function(){if(guestTargetSelect.value)openGuestAdminProfile(guestTargetSelect.value,guestData.guests);};
  $('mat-guest-delete-request').onclick = async function(){
   const userId=$('mat-guest-delete-target').value,reason=$('mat-guest-delete-reason').value.trim(),button=this,status=$('mat-guest-delete-status');
   if(!userId){status.textContent='আগে Guest account select করুন।';return;}
   if(reason.length<5||reason.length>500){status.textContent='কারণ ৫–৫০০ অক্ষরের মধ্যে লিখুন।';$('mat-guest-delete-reason').focus();return;}
   if(!confirm('এই Guest account deletion-এর জন্য Super Admin approval request করবেন?'))return;
   button.disabled=true;status.textContent='Request submitting…';
   try{await api('adminCreateGuestDeletionRequest',{userId,reason});status.textContent='কারণসহ request Pending Approval হিসেবে জমা হয়েছে।';$('mat-guest-delete-target').value='';$('mat-guest-delete-reason').value='';}
   catch(error){status.textContent=error.message||'Request failed.';}
   finally{button.disabled=false;}
  };
  if(members.canManage){
   try{
    const pending=await api('adminListGuestDeletionRequests'),host=$('mat-guest-delete-requests');
    host.innerHTML=pending.requests.length?pending.requests.map(req=>'<div class="rounded-xl border border-gray-200 dark:border-gray-700 p-3"><p class="font-semibold break-all">'+esc(req.name||'Guest Student')+'</p><p class="text-xs text-gray-500">'+esc(req.userId)+'</p><p class="text-xs text-gray-500 mt-1">Requested by '+esc(req.requestedBy)+' · '+esc(req.requestedAt)+'</p><p class="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2 text-xs">Reason: '+esc(req.reason||'No reason supplied')+'</p><div class="flex flex-wrap gap-2 mt-2"><button type="button" data-guest-profile="'+esc(req.userId)+'" class="rounded-lg border border-sky-400 px-3 py-1.5 text-xs font-bold text-sky-700">View Profile</button><button data-guest-approve="'+esc(req.requestId)+'" class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white">Approve deletion</button><button data-guest-reject="'+esc(req.requestId)+'" class="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-bold">Reject</button></div></div>').join(''):'No pending requests.';
    host.querySelectorAll('[data-guest-profile]').forEach(button=>button.onclick=()=>openGuestAdminProfile(button.getAttribute('data-guest-profile'),pending.requests.map(req=>req.profile).filter(Boolean)));
    host.querySelectorAll('[data-guest-approve],[data-guest-reject]').forEach(button=>button.onclick=async()=>{
     const approve=button.hasAttribute('data-guest-approve'),requestId=button.getAttribute(approve?'data-guest-approve':'data-guest-reject');
     if(!confirm(approve?'Guest account deletion approve করবেন?':'এই deletion request reject করবেন?'))return;
     button.disabled=true;
     try{await api('adminResolveGuestDeletionRequest',{requestId,decision:approve?'APPROVE':'REJECT'});await loadAdmin();}
     catch(error){$('mat-admin-message').textContent=error.message||'Approval update failed.';button.disabled=false;}
    });
   }catch(error){const message=String(error&&error.message||'');$('mat-guest-delete-requests').textContent=/getLastRow|undefined/i.test(message)?'Backend-এর deployed version পুরোনো বা deletion-request sheet initialize হয়নি। Apps Script-এ latest backend deploy করে setupBackend() একবার চালাতে হবে।':'Approval queue unavailable: '+(message||'Unknown error');}
   // Super Admin: manage already-approved deletion deadlines and inspect audit history.
   if(members.canManage){
    try{
     const targets=await api('adminListGuestDeletionTargets');
     const active=(targets.guests||[]).filter(g=>g.deletionPending&&Date.parse(g.scheduledAt)>Date.now());
     let management=document.getElementById('mat-guest-delete-management');
     if(!management){management=document.createElement('div');management.id='mat-guest-delete-management';management.className='border-t border-amber-200 dark:border-amber-900 pt-3 space-y-3';section.appendChild(management);}
     management.innerHTML='<h5 class="font-bold text-sm">Approved deletion schedules · Super Admin</h5>'+(active.length?active.map(g=>'<div class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2"><p class="text-xs font-semibold">'+esc(g.name||'Guest Student')+'</p><p class="text-xs break-all text-gray-500">'+esc(g.userId)+'</p><p class="text-xs text-gray-500">Deadline: '+esc(g.scheduledAt)+'</p><div class="flex flex-wrap gap-2"><button type="button" data-guest-profile="'+esc(g.userId)+'" class="rounded-lg border border-sky-400 px-3 py-1.5 text-xs font-bold text-sky-700">View Profile</button><button type="button" data-guest-extend="'+esc(g.userId)+'" class="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-bold">Extend deadline</button><button type="button" data-guest-cancel-admin="'+esc(g.userId)+'" class="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700">Cancel deletion</button></div></div>').join(''):'<p class="text-xs text-gray-500">No active approved Guest deletions.</p>')+'<div class="pt-2"><h5 class="font-bold text-sm">Deletion audit history</h5><div id="mat-guest-delete-audit" class="mt-2 space-y-1 text-xs text-gray-500">Loading…</div></div>';
     management.querySelectorAll('[data-guest-profile]').forEach(button=>button.onclick=()=>openGuestAdminProfile(button.getAttribute('data-guest-profile'),targets.guests));
     management.querySelectorAll('[data-guest-extend]').forEach(button=>button.onclick=async()=>{
      const userId=button.getAttribute('data-guest-extend'),raw=prompt('বর্তমান deadline-এর সঙ্গে কত দিন যোগ করবেন? (1–365)','7'),days=Number(raw);
      if(raw===null)return;if(!Number.isInteger(days)||days<1||days>365){alert('১ থেকে ৩৬৫ দিনের মধ্যে দিন লিখুন।');return;}
      button.disabled=true;try{await api('adminExtendGuestDeletion',{userId,days});await loadAdmin();}catch(error){alert(error.message||'Deadline extend করা যায়নি।');button.disabled=false;}
     });
     management.querySelectorAll('[data-guest-cancel-admin]').forEach(button=>button.onclick=async()=>{
      const userId=button.getAttribute('data-guest-cancel-admin');if(!confirm('এই Guest deletion Super Admin হিসেবে cancel করবেন?'))return;
      button.disabled=true;try{await api('adminCancelGuestDeletion',{userId});await loadAdmin();}catch(error){alert(error.message||'Deletion cancel করা যায়নি।');button.disabled=false;}
     });
     const audit=await api('adminListGuestDeletionAudit');
     const auditHost=document.getElementById('mat-guest-delete-audit');
     auditHost.innerHTML=(audit.events||[]).length?audit.events.map(e=>'<div class="border-t border-gray-100 dark:border-gray-800 py-1"><strong>'+esc(e.event)+'</strong> · '+esc(e.userId)+'<br><span>'+esc(e.role)+' '+esc(e.actor)+' · '+esc(e.at)+'</span>'+(e.newDeadline?'<br><span>Deadline: '+esc(e.newDeadline)+'</span>':'')+'</div>').join(''):'No audit events yet.';
    }catch(error){console.warn('[Guest deletion management]',error);}
   }
  }
 } catch(error) { console.warn('[Guest deletion approval]',error); }

 const toggle=$('mat-admin-unlimited-toggle');toggle.textContent=promo.unlimitedEnabled?'Disable Admin-only Code':'Enable Admin-only Code';toggle.onclick=async()=>{try{await api('adminSetUnlimitedEnabled',{enabled:!promo.unlimitedEnabled});await refresh();}catch(e){$('mat-admin-message').textContent=e.message;}};
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