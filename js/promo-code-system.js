/* Medical Admission Tracker — Promo Code UI. Server remains authoritative. */
(function(){
'use strict';
if(window.__matPromoUIInstalled)return;window.__matPromoUIInstalled=true;
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function credentials(){
 const user=window.firebase&&firebase.auth&&firebase.auth().currentUser;
 if(user&&typeof user.getIdToken==='function')return user.getIdToken().then(idToken=>({idToken}));
 const token=localStorage.getItem('med_sheet_guest_token_v1')||'';
 if(token)return Promise.resolve({guestToken:token});
 throw new Error('প্রথমে account-এ sign in করুন।');
}
async function api(action,fields){
 const endpoint=String(window.MED_LEADERBOARD_API_URL||'').trim();if(!endpoint)throw new Error('Backend URL পাওয়া যায়নি।');
 const creds=await credentials(),res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action},creds,fields||{}))});
 const data=await res.json();if(!data.success)throw new Error(data.error||'Request failed.');return data;
}
function mount(){
 const view=$('view-account');if(!view||$('mat-promo-card'))return;
 const section=document.createElement('section');section.id='mat-promo-card';section.className='space-y-5';
 section.innerHTML=`
 <div class="bg-white dark:bg-gray-800 rounded-3xl p-5 sm:p-7 border border-amber-200 dark:border-amber-900 shadow-sm space-y-4">
  <div class="flex items-center justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-wider text-amber-600">Rewards</p><h2 class="text-xl font-extrabold text-gray-900 dark:text-white">Promo Code</h2></div><span class="rounded-full px-3 py-1 text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Permanent PB</span></div>
  <div class="rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 p-4"><p class="text-xs text-gray-500 dark:text-gray-400">আজকের Public Promo Code</p><div id="mat-promo-public-code" class="mt-1 text-lg sm:text-xl font-black tracking-wide text-gray-900 dark:text-white">লোড হচ্ছে…</div><p id="mat-promo-public-meta" class="text-xs text-gray-500 dark:text-gray-400 mt-1">Bangladesh Time (UTC+6)</p></div>
  <form id="mat-promo-redeem-form" class="flex flex-col sm:flex-row gap-2"><input id="mat-promo-input" autocomplete="off" spellcheck="false" placeholder="Promo Code লিখুন" class="flex-1 min-w-0 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white"><button class="rounded-xl px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold">Redeem</button></form>
  <p id="mat-promo-message" class="text-sm text-gray-600 dark:text-gray-300" aria-live="polite"></p>
  <div class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-700 pt-3"><span class="text-sm text-gray-500 dark:text-gray-400">Permanent Promo PB Balance</span><strong id="mat-promo-balance" class="text-lg text-amber-600">— PB</strong></div>
 </div>
 <div id="mat-admin-panel" class="hidden bg-white dark:bg-gray-800 rounded-3xl p-5 sm:p-7 border border-rose-200 dark:border-rose-900 shadow-sm space-y-4">
  <div><p class="text-xs font-bold uppercase tracking-wider text-rose-600">Restricted access</p><h2 class="text-xl font-extrabold text-gray-900 dark:text-white">Admin Panel</h2></div>
  <div class="rounded-xl bg-gray-50 dark:bg-gray-900 p-3 text-sm text-gray-600 dark:text-gray-300">Fixed Unlimited Code: <strong>Admin-only · 100,000 PB per redemption</strong><br>Code value is kept server-side and is not displayed here.</div>
  <div id="mat-admin-members" class="space-y-2"></div>
  <form id="mat-admin-add-form" class="flex flex-col sm:flex-row gap-2"><input id="mat-admin-email" type="email" required placeholder="Registered member Gmail" class="flex-1 min-w-0 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm"><button class="rounded-xl px-4 py-3 bg-rose-600 text-white font-bold">Add Admin</button></form>
  <p id="mat-admin-message" class="text-sm" aria-live="polite"></p>
 </div>`;
 view.appendChild(section);
 $('mat-promo-redeem-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('mat-promo-input'),msg=$('mat-promo-message');msg.textContent='Redeeming…';try{const r=await api('redeemPromoCode',{code:input.value});msg.textContent='+'+Number(r.rewardPB).toLocaleString()+' PB যোগ হয়েছে।';input.value='';$('mat-promo-balance').textContent=Number(r.promoPB).toLocaleString()+' PB';if(r.user&&window.app)window.app.profile=Object.assign(window.app.profile||{},r.user);}catch(err){msg.textContent=err.message;}});
 $('mat-admin-add-form').addEventListener('submit',async e=>{e.preventDefault();const msg=$('mat-admin-message');msg.textContent='Saving…';try{await api('adminAddMember',{email:$('mat-admin-email').value});$('mat-admin-email').value='';msg.textContent='Admin member added.';await loadAdmin();}catch(err){msg.textContent=err.message;}});
 refresh();
}
async function loadAdmin(){
 const result=await api('adminListMembers'),promo=await api('adminPromoStatus');const panel=$('mat-admin-panel'),box=$('mat-admin-members');panel.classList.remove('hidden');$('mat-admin-add-form').classList.toggle('hidden',!result.canManage);const toggle=$('mat-admin-unlimited-toggle');toggle.classList.toggle('hidden',!result.canManage);toggle.textContent=promo.unlimitedEnabled?'Disable fixed Unlimited Code':'Enable fixed Unlimited Code';toggle.onclick=async()=>{try{await api('adminSetUnlimitedEnabled',{enabled:!promo.unlimitedEnabled});await loadAdmin();}catch(e){$('mat-admin-message').textContent=e.message;}};
 box.innerHTML='<h3 class="font-bold text-gray-800 dark:text-white">Admin Members</h3>'+result.members.map(m=>'<div class="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 py-2 text-sm"><span class="min-w-0 break-all">'+esc(m.email)+' <small class="text-gray-500">('+esc(m.role)+')</small></span>'+(m.role==='SUPER_ADMIN'?'':'<button data-remove="'+esc(m.email)+'" class="text-xs font-bold text-rose-600">Remove</button>')+'</div>').join('');
 box.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('এই Admin Member-কে remove করবেন?'))return;try{await api('adminRemoveMember',{email:b.dataset.remove});await loadAdmin();}catch(e){$('mat-admin-message').textContent=e.message;}}));
}
async function refresh(){
 try{const d=await api('getPromoInfo');$('mat-promo-public-code').textContent=d.publicCode;$('mat-promo-public-meta').textContent=(d.publicType==='weekly'?'Weekly · 800 PB · Saturday only':'Daily · 200 PB · আজ রাত ১২টা পর্যন্ত')+' · Bangladesh Time';$('mat-promo-balance').textContent=Number(d.promoPB||0).toLocaleString()+' PB';}
 catch(e){$('mat-promo-public-code').textContent='Sign in করে Promo Code ব্যবহার করুন';$('mat-promo-message').textContent=e.message;}
 try{const a=await api('adminBootstrapStatus');if(a.isAdmin)await loadAdmin();}catch(_){}
}
document.addEventListener('DOMContentLoaded',mount);new MutationObserver(()=>{if(document.body&&$('view-account'))mount();}).observe(document.documentElement,{childList:true,subtree:true});
})();