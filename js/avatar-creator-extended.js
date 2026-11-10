(function(){
'use strict';
const base=window.MedAvatarCreator;if(!base||base.full27)return;
const choices={
skinTone:[['#f7d7c4','হালকা'],['#eab99a','উষ্ণ'],['#ce8f6b','মাঝারি'],['#a96749','বাদামি'],['#75452f','গাঢ়']],
faceShape:[['oval','ওভাল'],['round','গোল'],['square','চৌকো'],['long','লম্বা']],
expression:[['smile','হাসি'],['sad','মন খারাপ'],['neutral','স্বাভাবিক'],['surprised','অবাক']],
cheeks:[['none','নেই'],['light','হালকা'],['dark','গাঢ়']],
ears:[['small','ছোট'],['large','বড়'],['pointed','পয়েন্টেড']],
eyeShape:[['happy','হাসিখুশি'],['closed','বন্ধ'],['sleepy','ঘুমঘুম'],['wide','বড়']],
eyeColor:[['#3b2418','বাদামি'],['#2563eb','নীল'],['#16a34a','সবুজ'],['#111827','কালো']],
eyebrowShape:[['default','স্বাভাবিক'],['thin','পাতলা'],['thick','ঘন'],['angled','বাঁকা']],
eyebrowColor:[['#493025','বাদামি'],['#111827','কালো'],['#d39a42','সোনালি']],
noseShape:[['small','ছোট'],['large','বড়'],['curved','বাঁকা'],['flat','চ্যাপ্টা']],
hairStyle:[['short','ছোট'],['long','লম্বা'],['curly','কোঁকড়া'],['bun','খোঁপা']],
hairColor:[['#211a19','কালো'],['#493025','বাদামি'],['#d39a42','সোনালি'],['#a83232','লাল']],
beardShape:[['none','নেই'],['full','পূর্ণ'],['thin','পাতলা'],['stubble','হালকা']],
beardColor:[['#493025','বাদামি'],['#111827','কালো'],['#d39a42','সোনালি']],
mustacheShape:[['none','নেই'],['thin','পাতলা'],['thick','ঘন'],['curved','বাঁকানো']],
mustacheColor:[['#493025','বাদামি'],['#111827','কালো'],['#d39a42','সোনালি']],
glassesShape:[['none','নেই'],['round','গোল'],['square','চৌকো'],['sunglasses','সানগ্লাস']],
glassesColor:[['#111827','কালো'],['#d4a017','গোল্ড'],['#cbd5e1','স্বচ্ছ']],
hatShape:[['none','নেই'],['cap','ক্যাপ'],['turban','পাগড়ি'],['headband','হেডব্যান্ড']],
hatColor:[['#111827','কালো'],['#dc2626','লাল'],['#2563eb','নীল']],
clothingType:[['tshirt','টি-শার্ট'],['hoodie','হুডি'],['shirt','শার্ট'],['blazer','ব্লেজার']],
clothingColor:[['#2563eb','নীল'],['#dc2626','লাল'],['#111827','কালো'],['#f8fafc','সাদা']],
headphonesType:[['none','নেই'],['over_ear','ওভার-ইয়ার'],['earbuds','ইয়ারবাড'],['gaming','গেমিং'],['neckband','নেকব্যান্ড']],
headphonesColor:[['#111827','কালো'],['#f8fafc','সাদা'],['#dc2626','লাল'],['#2563eb','নীল']],
petType:[['none','নেই'],['cat','বিড়াল'],['bird','পাখি']],
petColor:[['#f8fafc','সাদা'],['#111827','কালো'],['#f59e0b','কমলা'],['#facc15','হলুদ'],['#2563eb','নীল'],['#16a34a','সবুজ']],
background:[['white','সাদা'],['gradient','গ্রেডিয়েন্ট'],['pattern','প্যাটার্ন'],['nature','প্রকৃতি']]
};
const defaults={skinTone:'#eab99a',faceShape:'oval',expression:'smile',cheeks:'light',ears:'small',eyeShape:'happy',eyeColor:'#3b2418',eyebrowShape:'default',eyebrowColor:'#493025',noseShape:'small',hairStyle:'short',hairColor:'#211a19',beardShape:'none',beardColor:'#493025',mustacheShape:'none',mustacheColor:'#493025',glassesShape:'none',glassesColor:'#111827',hatShape:'cap',hatColor:'#dc2626',clothingType:'hoodie',clothingColor:'#2563eb',headphonesType:'over_ear',headphonesColor:'#111827',petType:'bird',petColor:'#f59e0b',background:'gradient'};
const normalize=input=>{const c={...defaults};Object.keys(choices).forEach(k=>{const v=input&&input[k];if(choices[k].some(o=>o[0]===v))c[k]=v;});return c;};
const oldRender=base.render;
function render(input){
 const c=normalize(input),old={skin:c.skinTone,hairStyle:c.hairStyle,hairColor:c.hairColor,outfit:c.clothingType==='blazer'?'coat':c.clothingType==='shirt'?'school':c.clothingType==='tshirt'?'sweater':'hoodie',outfitColor:c.clothingColor,accessory:'none',background:c.background==='white'?'#ffffff':c.background==='nature'?'#d1fae5':c.background==='pattern'?'#ede9fe':'#dbeafe'};
 let uri=oldRender(old),svg=decodeURIComponent(uri.slice(uri.indexOf(',')+1));
 const faceSize=c.faceShape==='round'?[67,67]:c.faceShape==='square'?[56,66]:c.faceShape==='long'?[52,78]:[59,70];svg=svg.replace('rx="59" ry="70"','rx="'+faceSize[0]+'" ry="'+faceSize[1]+'"');
 const eye=c.eyeShape==='closed'?'<path d="M91 101q10 7 20 0m34 0q10 7 20 0" fill="none" stroke="'+c.eyeColor+'" stroke-width="4" stroke-linecap="round"/>':'<ellipse cx="105" cy="104" rx="'+(c.eyeShape==='wide'?8:6)+'" ry="'+(c.eyeShape==='sleepy'?4:8)+'" fill="'+c.eyeColor+'"/><ellipse cx="151" cy="104" rx="'+(c.eyeShape==='wide'?8:6)+'" ry="'+(c.eyeShape==='sleepy'?4:8)+'" fill="'+c.eyeColor+'"/>';
 const brows='<path d="M86 84q15 '+(c.eyebrowShape==='angled'?-8:0)+' 30 0m24 0q15 '+(c.eyebrowShape==='angled'?-8:0)+' 30 0" stroke="'+c.eyebrowColor+'" stroke-width="'+(c.eyebrowShape==='thin'?2:c.eyebrowShape==='thick'?6:4)+'" stroke-linecap="round" fill="none"/>';
 const mouth=c.expression==='sad'?'M111 145q17 -14 34 0':c.expression==='surprised'?'M128 137a7 10 0 1 0 0 20a7 10 0 1 0 0-20':'M110 143q18 '+(c.expression==='neutral'?0:14)+' 36 0';
 let overlays='<g>'+eye+brows+'<path d="M128 113q-8 15 2 16" fill="none" stroke="#8a5747" stroke-width="'+(c.noseShape==='large'?5:3)+'" stroke-linecap="round"/><path d="'+mouth+'" fill="none" stroke="#9f3e4b" stroke-width="4" stroke-linecap="round"/>';
 if(c.cheeks!=='none')overlays+='<ellipse cx="84" cy="128" rx="11" ry="6" fill="#e87979" opacity="'+(c.cheeks==='dark'?.5:.25)+'"/><ellipse cx="172" cy="128" rx="11" ry="6" fill="#e87979" opacity="'+(c.cheeks==='dark'?.5:.25)+'"/>';
 if(c.ears==='large')overlays+='<ellipse cx="66" cy="112" rx="13" ry="18" fill="'+c.skinTone+'"/><ellipse cx="190" cy="112" rx="13" ry="18" fill="'+c.skinTone+'"/>';
 if(c.ears==='pointed')overlays+='<path d="M58 107L48 68L82 91M198 107L208 68L174 91" fill="'+c.skinTone+'"/>';
 if(c.beardShape!=='none')overlays+='<path d="M79 137q8 51 49 51t49-51q-49 30-98 0" fill="'+c.beardColor+'" opacity="'+(c.beardShape==='thin'?.7:1)+'"/>';
 if(c.mustacheShape!=='none')overlays+='<path d="M108 137q-15-12-24 0q12 17 29 5q15 12 30 0q17 12 29-5q-9-12-24 0q-20-9-40 0" fill="'+c.mustacheColor+'"/>';
 if(c.glassesShape!=='none')overlays+='<g stroke="'+c.glassesColor+'" stroke-width="4" fill="'+(c.glassesShape==='sunglasses'?c.glassesColor:'none')+'"><rect x="73" y="88" width="47" height="31" rx="'+(c.glassesShape==='round'?16:5)+'"/><rect x="136" y="88" width="47" height="31" rx="'+(c.glassesShape==='round'?16:5)+'"/><path d="M120 101h16"/></g>';
 if(c.hatShape!=='none')overlays+=c.hatShape==='cap'?'<path d="M55 69q8-50 73-50t73 50q-73-18-146 0" fill="'+c.hatColor+'"/><path d="M48 72q80-18 160 0" stroke="'+c.hatColor+'" stroke-width="10"/>':c.hatShape==='turban'?'<path d="M64 65q0-52 64-52t64 52q-64-20-128 0m0-18q64 25 128 0" fill="none" stroke="'+c.hatColor+'" stroke-width="16"/>':'<path d="M66 62q62-20 124 0" stroke="'+c.hatColor+'" stroke-width="11" fill="none"/>';
 if(c.headphonesType!=='none')overlays+=c.headphonesType==='earbuds'?'<circle cx="61" cy="112" r="7" fill="'+c.headphonesColor+'"/><circle cx="195" cy="112" r="7" fill="'+c.headphonesColor+'"/>':'<path d="M54 102V85q0-62 74-62t74 62v17" fill="none" stroke="'+c.headphonesColor+'" stroke-width="'+(c.headphonesType==='gaming'?14:9)+'"/><rect x="47" y="96" width="17" height="40" rx="8" fill="'+c.headphonesColor+'"/><rect x="192" y="96" width="17" height="40" rx="8" fill="'+c.headphonesColor+'"/>';
 if(c.petType==='cat')overlays+='<g transform="translate(174 176)"><path d="M8 27L5 2l20 12L45 2l-3 28q-3 22-18 22T8 27" fill="'+c.petColor+'"/><circle cx="18" cy="31" r="2"/><circle cx="34" cy="31" r="2"/></g>';
 if(c.petType==='bird')overlays+='<g transform="translate(179 184)"><ellipse cx="20" cy="22" rx="19" ry="23" fill="'+c.petColor+'"/><circle cx="14" cy="15" r="3" fill="#111"/><path d="M37 22l14 5-14 5" fill="#f97316"/></g>';
 overlays+='</g>';
 svg=svg.replace('</svg>',overlays+'</svg>').replace(/data-avatar-config="[^"]*"/,'data-avatar-config="'+encodeURIComponent(JSON.stringify(c))+'"');
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function configFromAvatar(src){try{const clean=String(src||'').replace(/#mat-(?:default|custom)-avatar$/i,'');if(!/^data:image\/svg\+xml;charset=utf-8,/i.test(clean))return null;const svg=decodeURIComponent(clean.slice(clean.indexOf(',')+1));const m=svg.match(/data-avatar-config="([^"]+)"/);return m?normalize(JSON.parse(decodeURIComponent(m[1]))):null;}catch(_){return null;}}
const randomize=()=>{const c={};Object.keys(choices).forEach(k=>{const a=choices[k];c[k]=a[Math.floor(Math.random()*a.length)][0];});return normalize(c);};
base.choices=Object.fromEntries(Object.entries(choices).map(([k,v])=>[k,v.map(([value,label])=>({value,label}))]));
base.defaultConfig=()=>normalize(defaults);base.normalize=normalize;base.render=render;base.randomize=randomize;base.configFromAvatar=configFromAvatar;base.isAvatar=v=>/^data:image\/svg\+xml;charset=utf-8,/i.test(String(v||''));base.full27=true;
window.MedAvatarCreator=base;
})();