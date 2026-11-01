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
  <form id="mat-promo-member-form" class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
   <h4 class="font-bold text-sm">Individual Member Override</h4>
   <label class="block text-xs font-semibold">Registered member<select id="mat-member-select" required class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"><option value="">Select member</option></select></label>
   <label class="block text-xs font-semibold">Member-specific Promo Code<input id="mat-member-code" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Blank = inherit global/public code"></label>
   <div class="grid grid-cols-2 gap-2"><label class="text-xs font-semibold">PB per redeem<input id="mat-member-reward" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Inherit global"></label><label class="text-xs font-semibold">Redeem limit<input id="mat-member-limit" type="number" min="0" step="1" class="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder="Inherit global"></label></div>
   <div class="flex flex-wrap items-center gap-2"><label class="text-xs font-semibold">Limit period<select id="mat-member-period" class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2"><option value="">Inherit global</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="UNLIMITED">Unlimited</option></select></label><label class="text-xs flex items-center gap-1"><input id="mat-member-enabled" type="checkbox" checked> Enabled</label></div>
   <button class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save Member Settings</button><p id="mat-member-note" class="text-xs text-gray-500 dark:text-gray-400">Select a member to load their current overrides.</p>
  </form>
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
 $('mat-promo-member-form').addEventListener('submit',async e=>{e.preventDefault();const msg=$('mat-admin-message');msg.textContent='Saving member settings…';try{await api('adminSaveMemberPromo',{userId:$('mat-member-select').value,code:$('mat-member-code').value,rewardPB:$('mat-member-reward').value,limitCount:$('mat-member-limit').value,limitPeriod:$('mat-member-period').value,enabled:$('mat-member-enabled').checked});msg.textContent='Individual Promo Settings saved.';await loadAdmin();}catch(err){msg.textContent=err.message;}});
 $('mat-member-select').addEventListener('change',()=>loadSelectedMember());
 $('mat-admin-add-form').addEventListener('submit',async e=>{e.preventDefault();const msg=$('mat-admin-message');msg.textContent='Saving…';try{await api('adminAddMember',{email:$('mat-admin-email').value});$('mat-admin-email').value='';msg.textContent='Admin member added.';await loadAdmin();}catch(err){msg.textContent=err.message;}});
 refresh();
}
let memberTargets=[];
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
    <header class="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
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
function loadSelectedMember(){
 const id=$('mat-member-select').value,m=memberTargets.find(x=>x.userId===id);if(!m)return;
 $('mat-member-code').value=m.code||'';$('mat-member-reward').value=m.rewardPB==null?'':m.rewardPB;
 $('mat-member-limit').value=m.limitCount==null?'':m.limitCount;$('mat-member-period').value=m.limitPeriod||'';
 $('mat-member-enabled').checked=m.enabled!==false;$('mat-member-note').textContent=m.name+' · '+m.email;
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
  if(!userId||activeIds.has(userId))return;
  grant.disabled=true;grant.setAttribute('aria-busy','true');
  try{
   await api('adminSetPremiumNameAccess',{userId:userId,enabled:true});
   $('mat-admin-message').textContent='Premium Golden Name access granted.';
   await loadPremiumNameAccess(members);
  }catch(error){$('mat-admin-message').textContent=error.message||'Access grant failed.';updateGrantState();}
  finally{grant.removeAttribute('aria-busy');}
 };
 const list=$('mat-premium-name-list');
 list.innerHTML=access.length?'<h5 class="font-bold text-xs text-amber-900 dark:text-amber-200">ACTIVE SUBSCRIBERS ('+access.length+')</h5>'+access.map(row=>'<div class="flex items-center justify-between gap-2 border-t border-amber-200 dark:border-amber-900 pt-2"><span class="min-w-0"><strong class="block truncate">'+esc(row.name||'Student')+'</strong><small class="block truncate text-gray-500">'+esc(row.email)+'</small></span><button type="button" data-revoke-premium-name="'+esc(row.userId)+'" class="shrink-0 rounded-lg border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">Revoke</button></div>').join(''):'<p class="text-xs text-gray-500">No manually granted subscriber access yet.</p>';
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
 $('mat-global-code').value=config.global.code||'';$('mat-global-reward').value=config.global.rewardPB==null?'':config.global.rewardPB;
 $('mat-global-limit').value=config.global.limitCount==null?'':config.global.limitCount;$('mat-global-period').value=config.global.limitPeriod||'DAILY';$('mat-global-enabled').checked=config.global.enabled!==false;
 memberTargets=targets.members||[];
 try{await loadPremiumNameAccess(members);}
 catch(error){
  const premiumSection=$('mat-premium-name-access');
  if(premiumSection&&members.canManage){
   premiumSection.classList.remove('hidden');
   $('mat-premium-name-list').textContent='Deploy the latest Apps Script backend version to manage subscriber Golden Name access.';
  }
  console.warn('[Premium Name] Access management API is not available yet:',error);
 }
 const select=$('mat-member-select'),previous=select.value;select.innerHTML='<option value="">Select member</option>'+memberTargets.map(m=>'<option value="'+esc(m.userId)+'">'+esc(m.name||'Student')+' · '+esc(m.email)+'</option>').join('');if(previous&&memberTargets.some(m=>m.userId===previous))select.value=previous;
 loadSelectedMember();
 const box=$('mat-admin-members');
 box.innerHTML='<h4 class="font-bold text-gray-800 dark:text-white">Admin Members</h4>'+members.members.map(m=>'<div class="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 py-2"><span class="min-w-0 break-all">'+esc(m.email)+' <small class="text-gray-500">('+esc(m.role)+')</small></span>'+(m.role==='SUPER_ADMIN'||!members.canManage?'':'<button data-remove="'+esc(m.email)+'" class="text-xs font-bold text-rose-600">Remove</button>')+'</div>').join('');
 $('mat-admin-add-form').classList.toggle('hidden',!members.canManage);
 box.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('এই Admin Member-কে remove করবেন?'))return;try{await api('adminRemoveMember',{email:b.dataset.remove});await loadAdmin();}catch(e){$('mat-admin-message').textContent=e.message;}}));
 const toggle=$('mat-admin-unlimited-toggle');toggle.textContent=promo.unlimitedEnabled?'Disable Admin-only Code':'Enable Admin-only Code';toggle.onclick=async()=>{try{await api('adminSetUnlimitedEnabled',{enabled:!promo.unlimitedEnabled});await refresh();}catch(e){$('mat-admin-message').textContent=e.message;}};
}
async function refresh(){
 try{
  const d=await api('getPromoInfo');
  $('mat-promo-public-code').textContent=d.publicCode;
  $('mat-promo-public-meta').textContent=(d.publicType==='weekly'?'Weekly · Saturday only':'Daily · আজ রাত ১২টা পর্যন্ত')+' · '+Number(d.rewardPB||0).toLocaleString()+' PB · Bangladesh Time';
  $('mat-promo-balance').textContent=Number(d.promoPB||0).toLocaleString()+' PB';
  if(d.assignedCode&&d.assignedCode!==d.publicCode){$('mat-promo-assigned-wrap').classList.remove('hidden');$('mat-promo-assigned-code').textContent=d.assignedCode;$('mat-promo-assigned-meta').textContent='আপনার জন্য নির্ধারিত code · PB ও limit Admin settings অনুযায়ী';}
  else $('mat-promo-assigned-wrap').classList.add('hidden');
  if(d.isAdmin&&d.adminCode){$('mat-promo-admin-code-wrap').classList.remove('hidden');$('mat-promo-admin-code').textContent=d.adminCode;}
  else $('mat-promo-admin-code-wrap').classList.add('hidden');
  if(d.isAdmin){ensureAdminDashboard();await loadAdmin();}else{const b=$('mat-admin-management-nav'),dash=$('mat-admin-dashboard');if(b)b.classList.add('hidden');if(dash)dash.classList.add('hidden');}
 }catch(e){$('mat-promo-public-code').textContent='Sign in করে Promo Code ব্যবহার করুন';$('mat-promo-message').textContent=e.message;}
}
window.addEventListener('student-progress-updated',event=>{const p=event.detail||{};const appProfile=window.app&&window.app.profile||{};const currentId=String(appProfile.userId||appProfile.uid||'');const eventId=String(p.userId||p.uid||p.playerId||'');if(currentId&&eventId===currentId&&p.promoPB!=null&&$('mat-promo-balance'))$('mat-promo-balance').textContent=Number(p.promoPB||0).toLocaleString()+' PB';});
function mount(){card();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.addEventListener('mat:firebase-auth-ready',()=>{if($('mat-promo-card'))refresh();});
new MutationObserver(()=>{if(document.body&&$('sidebar-student-profile-extras'))mount();}).observe(document.documentElement,{childList:true,subtree:true});
})();