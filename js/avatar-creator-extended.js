/* Local Avataaars renderer. Editable SVG components and the source definition are stored in this repository. */
(function () {
  'use strict';
  const base = window.MedAvatarCreator || {};
  if (base.dicebearAvataaars10) return;

  const choices = {
    skinTone: [['#f2d2b4','হালকা বেইজ'],['#edb98a','হালকা গম-রঙ'],['#dfb38e','গম-রঙ'],['#c9916b','মাঝারি শ্যামলা'],['#a96f4e','শ্যামলা'],['#80543e','গাঢ় বাদামি'],['#5e4034','গভীর বাদামি']],
    eyeShape: [['default','স্বাভাবিক'],['happy','হাসিখুশি'],['closed','বন্ধ'],['side','পাশে তাকানো'],['wink','চোখ টেপা'],['hearts','হার্ট'],['squint','চোখ ছোট'],['eyeRoll','চোখ ঘোরানো']],
    eyebrowShape: [['defaultNatural','স্বাভাবিক'],['default','সাধারণ'],['raisedExcited','উঁচু'],['angry','গম্ভীর'],['sadConcerned','চিন্তিত'],['flatNatural','সমান']],
    expression: [['smile','হাসি'],['default','স্বাভাবিক'],['serious','গম্ভীর'],['sad','মন খারাপ'],['screamOpen','অবাক'],['twinkle','উজ্জ্বল'],['concerned','চিন্তিত'],['disbelief','অবিশ্বাস'],['eating','খাচ্ছে'],['grimace','বিব্রত'],['tongue','জিহ্বা'],['vomit','বমি']],
    nose: [['default','স্বাভাবিক']],
    clothingGraphic: [['none','নেই']],
    gender: [['male','পুরুষ'],['female','নারী']],
    hairStyle: [
      ['shortFlat','ছোট সোজা'],['shortCurly','ছোট কোঁকড়া'],['shortRound','গোল ছোট'],['shortWaved','ঢেউ খেলানো ছোট'],
      ['sides','সাইড পার্ট'],['theCaesar','সিজার কাট'],['theCaesarAndSidePart','সিজার + সাইড পার্ট'],
      ['shaggy','লেয়ার কাট'],['shaggyMullet','মুলেট কাট'],['shavedSides','শেভড সাইড'],
      ['bigHair','ভলিউমি'],['bob','বব কাট'],['bun','খোঁপা'],['curly','কোঁকড়া'],['curvy','কার্ভি'],
      ['dreads','ড্রেডলক'],['dreads01','ড্রেডলক ১'],['dreads02','ড্রেডলক ২'],['frida','ফ্রিদা স্টাইল'],
      ['frizzle','ফ্রিজল'],['fro','আফ্রো'],['froBand','আফ্রো ব্যান্ড'],['hijab','হিজাব'],
      ['longButNotTooLong','লম্বা'],['miaWallace','মিয়া স্টাইল'],['straight01','সোজা ১'],
      ['straight02','সোজা ২'],['straightAndStrand','সোজা স্ট্র্যান্ড']
    ],
    hairColor: [['2c1b18','কালো'],['4a312c','গাঢ় বাদামি'],['724133','বাদামি'],['b58143','সোনালি বাদামি'],['a55728','কমলা-বাদামি'],['c93305','লাল']],
    facialHair: [['none','নেই'],['beardLight','হালকা দাড়ি'],['beardMedium','মাঝারি দাড়ি'],['beardMajestic','ঘন দাড়ি'],['moustacheFancy','গোঁফ'],['moustacheMagnum','ঘন গোঁফ']],
    facialHairColor: [['2c1b18','কালো'],['4a312c','বাদামি'],['724133','গাঢ় বাদামি'],['b58143','সোনালি বাদামি']],
    glasses: [['none','নেই'],['round','গোল'],['prescription01','চশমা ১'],['prescription02','চশমা ২'],['wayfarers','ওয়েফেয়ার'],['sunglasses','সানগ্লাস'],['kurt','Kurt'],['eyepatch','Eyepatch']],
    hat: [['none','নেই'],['hat','ক্যাপ'],['winterHat1','শীতের টুপি ১'],['winterHat02','শীতের টুপি ২'],['winterHat03','শীতের টুপি ৩'],['winterHat04','শীতের টুপি ৪'],['turban','পাগড়ি'],['hijab','হিজাব']],
    hatColor: [['dc2626','লাল'],['2563eb','নীল'],['7c3aed','বেগুনি'],['10b981','সবুজ'],['f8fafc','সাদা'],['333344','ডার্ক']],
    clothingType: [['hoodie','হুডি'],['blazerAndShirt','ব্লেজার'],['blazerAndSweater','ব্লেজার ও সোয়েটার'],['shirtCrewNeck','গোল গলার টি-শার্ট'],['shirtVNeck','ভি-নেক'],['shirtScoopNeck','সাধারণ শার্ট'],['overall','ওভারঅল'],['collarAndSweater','কলার সোয়েটার'],['graphicShirt','গ্রাফিক টি-শার্ট']],
    clothingColor: [['2563eb','নীল'],['7c3aed','বেগুনি'],['dc2626','লাল'],['333344','ডার্ক গ্রে'],['10b981','সবুজ'],['f8fafc','সাদা']],
    clothingGraphic: [['none','নেই']],
    petType: [['none','নেই'],['chick','ছোট ছানা'],['cat','বিড়াল'],['bear','সাদা ভালুক']],
    headphones: [['none','নেই'],['#24242b','কালো'],['#2563eb','নীল'],['#dc2626','লাল'],['#10b981','সবুজ'],['#f8fafc','সাদা']],
    background: [['a5a8ff','ল্যাভেন্ডার'],['f3d8e8','পিঙ্ক'],['bde0fe','আকাশি'],['caffbf','মিন্ট'],['ffe8a3','হালকা হলুদ'],['121218','ডার্ক']]
  };
  const defaults = {
    gender:'male', ageGroup:'teen', skinTone:'#edb98a', eyeShape:'default', eyebrowShape:'defaultNatural', expression:'smile', nose:'default',
    hairStyle:'shortFlat', hairColor:'2c1b18', facialHair:'none', facialHairColor:'2c1b18',
    glasses:'none', hat:'none', hatColor:'dc2626', clothingType:'blazerAndShirt', clothingColor:'333344', clothingGraphic:'none',
    petType:'none', headphones:'none', characterPreset:'m01', background:'a5a8ff'
  };

    const characterPresets = [
    // All 20 starting identities are configured for HSC-age students (16–18).
    // No adult/mature presets or facial-hair defaults are included.
    ...[
      ['m01','male','teen','#edb98a','shortFlat','2c1b18','default','defaultNatural','smile','none','blazerAndShirt','333344'],
      ['m02','male','teen','#c9916b','shortCurly','4a312c','happy','raisedExcited','smile','none','hoodie','2563eb'],
      ['m03','male','teen','#a96f4e','sides','2c1b18','side','flatNatural','serious','none','shirtCrewNeck','10b981'],
      ['m04','male','teen','#dfb38e','theCaesar','724133','squint','default','twinkle','none','hoodie','dc2626'],
      ['m05','male','teen','#80543e','shaggy','2c1b18','eyeRoll','angry','default','none','blazerAndSweater','7c3aed'],
      ['m06','male','teen','#f2d2b4','shortWaved','b58143','happy','defaultNatural','smile','none','collarAndSweater','2563eb'],
      ['m07','male','teen','#5e4034','dreads','2c1b18','default','flatNatural','serious','none','hoodie','10b981'],
      ['m08','male','teen','#c9916b','froBand','a55728','side','raisedExcited','concerned','none','shirtCrewNeck','dc2626'],
      ['m09','male','teen','#a96f4e','shavedSides','2c1b18','squint','angry','serious','none','blazerAndShirt','333344'],
      ['m10','male','teen','#dfb38e','shaggyMullet','724133','happy','raisedExcited','twinkle','none','hoodie','7c3aed'],
      ['f01','female','teen','#edb98a','longButNotTooLong','2c1b18','happy','raisedExcited','smile','none','blazerAndShirt','333344'],
      ['f02','female','teen','#c9916b','bob','4a312c','side','defaultNatural','twinkle','none','shirtCrewNeck','2563eb'],
      ['f03','female','teen','#a96f4e','curly','2c1b18','default','flatNatural','serious','none','blazerAndSweater','10b981'],
      ['f04','female','teen','#dfb38e','straight01','b58143','wink','raisedExcited','smile','none','shirtCrewNeck','dc2626'],
      ['f05','female','teen','#80543e','bigHair','2c1b18','squint','angry','concerned','none','collarAndSweater','333344'],
      ['f06','female','teen','#f2d2b4','straight01','a55728','hearts','defaultNatural','twinkle','none','hoodie','2563eb'],
      ['f07','female','teen','#5e4034','hijab','2c1b18','default','flatNatural','smile','none','blazerAndShirt','10b981'],
      ['f08','female','teen','#c9916b','frida','724133','happy','raisedExcited','smile','none','hoodie','dc2626'],
      ['f09','female','teen','#a96f4e','straight02','4a312c','side','sadConcerned','concerned','none','blazerAndSweater','7c3aed'],
      ['f10','female','teen','#dfb38e','miaWallace','2c1b18','wink','default','twinkle','none','shirtCrewNeck','333344']
    ].map(([id,gender,ageGroup,skinTone,hairStyle,hairColor,eyeShape,eyebrowShape,expression,facialHair,clothingType,clothingColor],index)=>({
      id,characterPreset:id,gender,ageGroup,skinTone,hairStyle,hairColor,eyeShape,eyebrowShape,expression,
      facialHair,clothingType,clothingColor,glasses:index%4===0?'round':'none',
      hat:'none',hatColor:'dc2626',facialHairColor:'2c1b18',petType:'none',
      headphones:'none',background:['a5a8ff','f3d8e8','bde0fe','caffbf','ffe8a3'][index%5]
    }))
  ];
  const maleHair = ['shortFlat','shortCurly','shortRound','shortWaved','sides','theCaesar','theCaesarAndSidePart','shaggy','shaggyMullet','shavedSides','dreads','dreads01','dreads02','froBand'];
  const femaleHair = ['bigHair','bob','bun','curly','curvy','frida','frizzle','fro','hijab','longButNotTooLong','miaWallace','straight01','straight02','straightAndStrand'];
  const hairChoicesFor = gender => {
    const source = gender === 'female' ? femaleHair : maleHair;
    return choices.hairStyle.filter(([value]) => source.includes(value));
  };
  const inferGenderFromHair = hair => femaleHair.includes(String(hair || '')) && !maleHair.includes(String(hair || '')) ? 'female' : 'male';
  const normalize = input => {
    const result = {...defaults};
    Object.entries(choices).forEach(([key,list]) => {
      const value = input && input[key];
      if (list.some(([v]) => v === value)) result[key] = value;
    });
    const supplied = input && typeof input === 'object' ? input : {};
    result.gender = supplied.gender === 'female' || supplied.gender === 'male' ? supplied.gender : inferGenderFromHair(supplied.hairStyle);
    // The avatar creator is for HSC students: legacy adult/mature values normalize to teen.
    result.ageGroup = 'teen';
    const requestedPreset = characterPresets.find(item => item.id === supplied.characterPreset && item.gender === result.gender);
    result.characterPreset = requestedPreset ? requestedPreset.id : (result.gender === 'female' ? 'f01' : 'm01');
    const allowedHair = hairChoicesFor(result.gender).map(([value]) => value);
    if (!allowedHair.includes(result.hairStyle)) result.hairStyle = allowedHair[0] || defaults.hairStyle;
    if (result.gender === 'female' || result.ageGroup === 'teen') result.facialHair = 'none';
    const selectedPreset = characterPresets.find(item => item.id === result.characterPreset);
    if (!selectedPreset || selectedPreset.gender !== result.gender) {
      result.characterPreset = result.gender === 'female' ? 'f01' : 'm01';
    }
    if (input && typeof input === 'object') {
      const hats = ['none','hat','winterHat1','winterHat02','winterHat03','winterHat04','turban','hijab'];
      if (hats.includes(input.hat)) result.hat = input.hat;
      if (/^#?[0-9a-f]{6}$/i.test(String(input.hatColor || ''))) result.hatColor = String(input.hatColor).replace(/^#/,'');
      if (/^#?[0-9a-f]{6}$/i.test(String(input.background || ''))) result.background = String(input.background).replace(/^#/,'');
    }
    return result;
  };
  const hex = value => String(value || '').replace(/^#/,'');
  const svgDefinition = window.MedAvatarSvgDefinition;
  const svgEscape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
  const svgColorMap = c => ({skin:c.skinTone,hair:'#'+hex(c.hairColor),clothes:'#'+hex(c.clothingColor),accessories:'#262e33',facialHair:'#'+hex(c.facialHairColor),hat:'#'+hex(c.hatColor)});
  const renderDefinitionElement = (element, colors) => {
    if (!element || element.type === 'component') return '';
    const tag = String(element.name || '');
    if (!/^[A-Za-z][A-Za-z0-9:-]*$/.test(tag)) return '';
    const attrs = Object.entries(element.attributes || {}).map(([name, raw]) => {
      const value = raw && typeof raw === 'object' && raw.type === 'color' ? (colors[raw.name] || '#000000') : raw;
      return ' ' + name + '="' + svgEscape(value) + '"';
    }).join('');
    const children = (element.children || []).map(child => renderDefinitionElement(child, colors)).join('');
    return children ? '<'+tag+attrs+'>'+children+'</'+tag+'>' : '<'+tag+attrs+'/>';
  };
  const normalizeAssetKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const findManifestAsset = (category, variant) => {
    const list = base.assetManifest?.categories?.[category];
    if (!Array.isArray(list)) return null;
    const wanted = normalizeAssetKey(variant);
    return list.find(asset => {
      const filename = String(asset.path || '').split('/').pop().replace(/\.svg$/i, '');
      return normalizeAssetKey(asset.id) === wanted || normalizeAssetKey(filename) === wanted;
    }) || null;
  };
  const svgAssetMarkup = (category, variant, instanceKey) => {
    const asset = findManifestAsset(category, variant);
    if (!asset || typeof asset.content !== 'string' || !asset.content.trim()) return null;
    try {
      const parsed = new DOMParser().parseFromString(asset.content, 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
        throw new Error('Malformed SVG asset: ' + asset.path);
      }
      const sourceRoot = parsed.documentElement.cloneNode(true);
      sourceRoot.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
      const ids = new Map();
      [sourceRoot, ...Array.from(sourceRoot.querySelectorAll('*'))].forEach(node => {
        const id = node.getAttribute?.('id');
        if (id) ids.set(id, instanceKey + '-' + id);
      });
      [sourceRoot, ...Array.from(sourceRoot.querySelectorAll('*'))].forEach(node => {
        if (!node.attributes) return;
        Array.from(node.attributes).forEach(attribute => {
          const name = attribute.name.toLowerCase();
          let value = attribute.value;
          if (name.startsWith('on')) {
            node.removeAttribute(attribute.name);
            return;
          }
          if ((name === 'href' || name.endsWith(':href')) && value && !value.startsWith('#')) {
            node.removeAttribute(attribute.name);
            return;
          }
          if (name === 'id' && ids.has(value)) value = ids.get(value);
          value = value.replace(/url\(#([^)]*)\)/g, (whole, id) => ids.has(id) ? 'url(#' + ids.get(id) + ')' : whole);
          if ((name === 'href' || name.endsWith(':href')) && value.startsWith('#') && ids.has(value.slice(1))) {
            value = '#' + ids.get(value.slice(1));
          }
          if (name === 'aria-labelledby' || name === 'aria-describedby') {
            value = value.split(/\s+/).map(id => ids.get(id) || id).join(' ');
          }
          node.setAttribute(attribute.name, value);
        });
      });
      const serializer = new XMLSerializer();
      return Array.from(sourceRoot.childNodes)
        .filter(node => node.nodeType === 1 && !['title','desc'].includes(String(node.localName || '').toLowerCase()))
        .map(node => serializer.serializeToString(node))
        .join('');
    } catch (error) {
      console.warn('[Avatar SVG] Skipping invalid local component:', asset.path, error);
      return null;
    }
  };
  const buildManifestSvgMarkup = c => {
    const requiredBase = svgAssetMarkup('base', 'face-and-body', 'mat-base');
    if (!requiredBase) return null;
    const colors = svgColorMap(c);
    const skin = svgEscape(colors.skin || '#edb98a');
    const hair = svgEscape(colors.hair || '#2c1b18');
    const clothes = svgEscape(colors.clothes || '#2563eb');
    const facialHair = svgEscape(colors.facialHair || '#2c1b18');
    const hat = svgEscape(colors.hat || '#dc2626');
    const baseMarkup = '<g data-avatar-part="base">' + requiredBase + '</g>';
    const part = (category, variant, name, transform, instanceKey) => {
      if (!variant || variant === 'none') return '';
      const artwork = svgAssetMarkup(category, variant, instanceKey || ('mat-' + name));
      if (!artwork) return '';
      return '<g data-avatar-part="' + svgEscape(name) + '" data-avatar-variant="' + svgEscape(variant) + '" transform="' + svgEscape(transform) + '">' + artwork + '</g>';
    };
    const clothing = part('clothing', c.clothingType, 'clothes', 'translate(40 184.7)', 'mat-clothes');
    const graphic = c.clothingType === 'graphicShirt' && c.clothingGraphic !== 'none'
      ? part('clothing-graphics', c.clothingGraphic, 'clothesGraphic', 'translate(85 229)', 'mat-clothes-graphic')
      : '';
    const mouth = part('mouths', c.expression, 'mouth', 'translate(94 140)', 'mat-mouth');
    const nose = part('nose', c.nose || 'default', 'nose', 'translate(128 130)', 'mat-nose');
    const eyes = part('eyes', c.eyeShape, 'eyes', 'translate(98 98)', 'mat-eyes');
    const eyebrows = part('eyebrows', c.eyebrowShape, 'eyebrows', 'translate(91.86 82)', 'mat-eyebrows');
    const topVariant = c.hat !== 'none' ? c.hat : c.hairStyle;
    const topCategory = findManifestAsset('hair', topVariant) ? 'hair' : 'headwear';
    const top = part(topCategory, topVariant, 'top', 'translate(8)', 'mat-top');
    const beard = c.facialHair !== 'none'
      ? part('facial-hair', c.facialHair, 'facialHair', 'translate(81 98)', 'mat-facial-hair')
      : '';
    const glasses = c.glasses !== 'none'
      ? part('accessories', c.glasses, 'accessories', 'translate(75.77 46)', 'mat-accessories')
      : '';
    const body = baseMarkup + clothing + graphic + mouth + nose + eyes + eyebrows + top + beard + glasses;
    return '<?xml version="1.0" encoding="UTF-8"?><!--MAT-AVATAR:' + btoa(JSON.stringify(c)) + '--><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280" width="280" height="280" fill="none" role="img" aria-label="Editable local student avatar" data-mat-living="true" data-avatar-eyes="' + svgEscape(c.eyeShape) + '" style="--avatar-skin:' + skin + ';--avatar-hair:' + hair + ';--avatar-clothes:' + clothes + ';--avatar-facialHair:' + facialHair + ';--avatar-accessories:#262e33;--avatar-hat:' + hat + '">' + "<style>@keyframes mat-avatar-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1px) scale(1.006)}}@keyframes mat-avatar-blink{0%,93%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}97%{transform:scaleY(1)}}svg[data-mat-living=\"true\"]{transform-box:view-box;transform-origin:50% 72%;animation:mat-avatar-breathe 4.8s ease-in-out infinite}svg[data-mat-living=\"true\"][data-avatar-eyes=\"default\"] [data-avatar-part=\"eyes\"],svg[data-mat-living=\"true\"][data-avatar-eyes=\"happy\"] [data-avatar-part=\"eyes\"],svg[data-mat-living=\"true\"][data-avatar-eyes=\"side\"] [data-avatar-part=\"eyes\"],svg[data-mat-living=\"true\"][data-avatar-eyes=\"squint\"] [data-avatar-part=\"eyes\"] > *{transform-box:fill-box;transform-origin:center;animation:mat-avatar-blink 5.2s ease-in-out infinite}@media(prefers-reduced-motion:reduce){svg[data-mat-living=\"true\"],svg[data-mat-living=\"true\"] [data-avatar-part=\"eyes\"] > *{animation:none!important}}</style>" + body + '</svg>';
  };
  const buildLocalSvgMarkup = input => {
    const c = normalize(input);
    // After deployment, the manifest contains the exact SVG source files from /public/assets.
    // The pinned definition remains only a first-load fallback while that manifest is loading.
    const manifestMarkup = buildManifestSvgMarkup(c);
    if (manifestMarkup) return manifestMarkup;
    if (!svgDefinition || !svgDefinition.canvas || !svgDefinition.components) throw new Error('Local Avataaars definition is not loaded.');
    const colors = svgColorMap(c);
    const variants = {clothes:c.clothingType,mouth:c.expression,nose:c.nose,eyes:c.eyeShape,eyebrows:c.eyebrowShape,top:c.hat !== 'none' ? c.hat : c.hairStyle};
    if (c.facialHair !== 'none') variants.facialHair = c.facialHair;
    if (c.glasses !== 'none') variants.accessories = c.glasses;
    const body = svgDefinition.canvas.elements.map(element => {
      if (element.type !== 'component') return renderDefinitionElement(element, colors);
      const name = element.name, variant = variants[name], component = svgDefinition.components[name];
      const selected = component && variant && component.variants && component.variants[variant];
      if (!selected) return '';
      const transform = element.attributes && element.attributes.transform ? ' transform="' + svgEscape(element.attributes.transform) + '"' : '';
      const artwork = (selected.elements || []).map(child => renderDefinitionElement(child, colors)).join('');
      const graphic = name === 'clothes' && c.clothingType === 'graphicShirt' && c.clothingGraphic !== 'none'
        ? svgDefinition.components.clothesGraphic?.variants?.[c.clothingGraphic] : null;
      const graphicMarkup = graphic
        ? '<g data-avatar-part="clothesGraphic" transform="translate(45 44.3)">' + (graphic.elements || []).map(child => renderDefinitionElement(child, colors)).join('') + '</g>'
        : '';
      return '<g data-avatar-part="' + svgEscape(name) + '" data-avatar-variant="' + svgEscape(variant) + '"' + transform + '>' + artwork + graphicMarkup + '</g>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><!--MAT-AVATAR:' + btoa(JSON.stringify(c)) + '--><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280" width="280" height="280" fill="none" role="img" aria-label="Editable local student avatar" data-mat-living="true" data-avatar-eyes="' + svgEscape(c.eyeShape) + '">' + "<style>@keyframes mat-avatar-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1px) scale(1.006)}}@keyframes mat-avatar-blink{0%,93%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}97%{transform:scaleY(1)}}svg[data-mat-living=\"true\"]{transform-box:view-box;transform-origin:50% 72%;animation:mat-avatar-breathe 4.8s ease-in-out infinite}svg[data-mat-living=\"true\"][data-avatar-eyes=\"default\"] [data-avatar-part=\"eyes\"],svg[data-mat-living=\"true\"][data-avatar-eyes=\"happy\"] [data-avatar-part=\"eyes\"],svg[data-mat-living=\"true\"][data-avatar-eyes=\"side\"] [data-avatar-part=\"eyes\"],svg[data-mat-living=\"true\"][data-avatar-eyes=\"squint\"] [data-avatar-part=\"eyes\"] > *{transform-box:fill-box;transform-origin:center;animation:mat-avatar-blink 5.2s ease-in-out infinite}@media(prefers-reduced-motion:reduce){svg[data-mat-living=\"true\"],svg[data-mat-living=\"true\"] [data-avatar-part=\"eyes\"] > *{animation:none!important}}</style>" + body + '</svg>';
  };
  const buildUrl = input => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildLocalSvgMarkup(input));
  const configFromAvatar = source => {
    try {
      const raw = String(source || '').replace(/#mat-(?:default|custom)-avatar$/i,'');
      if (raw.startsWith('data:image/svg+xml;charset=utf-8,')) {
        const markup = decodeURIComponent(raw.slice(raw.indexOf(',') + 1));
        const metadata = markup.match(/<!--MAT-AVATAR:([A-Za-z0-9+/=]+)-->/);
        if (metadata) return normalize(JSON.parse(atob(metadata[1])));
      }
      if (!/^https:\/\/api\.dicebear\.com\/10\.x\/avataaars\/svg\?/i.test(raw)) return null;
      const p = new URL(raw).searchParams, top = p.get('topVariant') || defaults.hat;
      const meta = Object.fromEntries(String(p.get('seed') || '').split('|').slice(1).map(part => { const pair = part.split('='); return [pair[0], pair[1] || '']; }));
      return normalize({skinTone:'#'+(p.get('skinColor') || hex(defaults.skinTone)),eyeShape:p.get('eyesVariant') || defaults.eyeShape,eyebrowShape:p.get('eyebrowsVariant') || defaults.eyebrowShape,expression:p.get('mouthVariant') || defaults.expression,nose:p.get('noseVariant') || defaults.nose,gender:meta.gender || inferGenderFromHair(meta.hair || top),characterPreset:meta.character || (meta.gender === 'female' ? 'f01' : 'm01'),headphones:meta.headphones || 'none',ageGroup:meta.age || defaults.ageGroup,hairStyle:meta.hair || (['hat','winterHat1','winterHat02','winterHat03','winterHat04','turban','hijab'].includes(top) ? defaults.hairStyle : top),hairColor:p.get('hairColor') || defaults.hairColor,facialHair:p.get('facialHairProbability') === '0' ? 'none' : (p.get('facialHairVariant') || 'beardLight'),facialHairColor:p.get('facialHairColor') || defaults.facialHairColor,glasses:p.get('accessoriesProbability') === '0' ? 'none' : (p.get('accessoriesVariant') || 'round'),hat:meta.hat || (['hat','winterHat1','winterHat02','winterHat03','winterHat04','turban'].includes(top) ? top : 'none'),hatColor:p.get('hatColor') || defaults.hatColor,clothingType:p.get('clothesVariant') || defaults.clothingType,clothingColor:p.get('clothesColor') || defaults.clothingColor,clothingGraphic:p.get('clothesGraphicProbability') === '0' ? 'none' : (p.get('clothesGraphic') || 'none'),petType:meta.pet || defaults.petType,background:meta.bg || p.get('backgroundColor') || defaults.background});
    } catch (_) { return null; }
  };
  const escapeAttr = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const renderLayersMarkup = (source, input, className) => {
    const c = input && typeof input === 'object' ? normalize(input) : null;
    const pet = c && c.petType !== 'none' ? base.assetPaths?.pets?.[c.petType] : '';
    const headphoneColors = {'#24242b':'#24242b','#2563eb':'#2563eb','#dc2626':'#dc2626','#10b981':'#10b981','#f8fafc':'#f8fafc'};
    const headphoneColor = c && headphoneColors[c.headphones] ? headphoneColors[c.headphones] : '';
    const headphones = headphoneColor ? '<svg class="med-avatar-headphones" viewBox="0 0 280 280" aria-hidden="true"><path d="M76 137V121a64 64 0 0 1 128 0v16" fill="none" stroke="'+headphoneColor+'" stroke-width="10" stroke-linecap="round"/><rect x="64" y="130" width="22" height="46" rx="10" fill="'+headphoneColor+'" stroke="#111827" stroke-opacity=".18" stroke-width="2.5"/><rect x="194" y="130" width="22" height="46" rx="10" fill="'+headphoneColor+'" stroke="#111827" stroke-opacity=".18" stroke-width="2.5"/></svg>' : '';
    const ageLines = c && c.ageGroup === 'adult'
      ? '<svg class="med-avatar-age-lines" viewBox="0 0 280 280" aria-hidden="true"><g fill="none" stroke="#765b4b" stroke-width="1" stroke-linecap="round" opacity=".24"><path d="M111 151q-3 3-3 6m54-6q3 3 3 6M124 161q16 4 32 0"/></g></svg>'
      : c && c.ageGroup === 'mature'
        ? '<svg class="med-avatar-age-lines" viewBox="0 0 280 280" aria-hidden="true"><g fill="none" stroke="#765b4b" stroke-width="1.15" stroke-linecap="round" opacity=".48"><path d="M101 112q5 2 10 0m58 0q5 2 10 0M111 101l-4 1m66-1 4 1M117 151q-5 4-4 9m50-9q5 4 4 9M124 161q16 5 32 0"/></g></svg>'
        : '';
    const baseImage = '<img class="med-avatar-base" src="' + escapeAttr(source) + '" alt="" draggable="false">';
    return '<span class="med-avatar-stack ' + escapeAttr(className || '') + '">' + headphones + baseImage + ageLines +
      (pet ? '<img class="med-avatar-pet" src="' + escapeAttr(pet) + '" alt="" aria-hidden="true" draggable="false">' : '') + '</span>';
  };
  const randomize = seed => {
    let h = 2166136261, s = String(seed || 'student-avatar');
    for (let i=0;i<s.length;i++) h = Math.imul(h ^ s.charCodeAt(i),16777619);
    const preset = characterPresets[(Math.abs(h)>>>0)%characterPresets.length];
    return normalize({...preset,background:choices.background[(Math.abs(h+17)>>>0)%choices.background.length][0],petType:choices.petType[(Math.abs(h+29)>>>0)%choices.petType.length][0]});
  };
  const pick = (list, seed, index) => list[(Math.abs(String(seed||'student').split('').reduce((h,ch)=>Math.imul(h^ch.charCodeAt(0),16777619),2166136261)+index)>>>0)%list.length][0];
  choices.characterPreset = characterPresets.map(item=>[item.id,(item.gender==='female'?'নারী ':'পুরুষ ')+item.id.toUpperCase()]);
  base.choices = Object.fromEntries(Object.entries(choices).map(([key,list]) => [key,list.map(([value,label])=>({value,label}))]));
  base.getOptionsForField = (fieldKey, input) => {
    const config = normalize(input || defaults);
    if (fieldKey === 'hairStyle') return hairChoicesFor(config.gender, config.ageGroup).map(([value,label])=>({value,label}));
    if (fieldKey === 'facialHair' && (config.gender === 'female' || config.ageGroup === 'teen')) return [{value:'none',label:'নেই'}];
    return (base.choices[fieldKey] || []).slice();
  };
  base.defaultConfig = seed => {
    const identity = String(seed || 'student-default');
    let h = 2166136261; for(let i=0;i<identity.length;i++) h=Math.imul(h^identity.charCodeAt(i),16777619);
    const preset = characterPresets[(Math.abs(h)>>>0)%characterPresets.length];
    return normalize({...preset,characterPreset:preset.id,background:choices.background[(Math.abs(h+12)>>>0)%choices.background.length][0]});
  };
  /* Legacy defaultConfig implementation retained below only as unreachable compatibility text. */
  const legacyDefaultConfig = seed => {
    const identity = String(seed || 'student-default');
    return normalize({
      ...defaults,
      gender:pick(choices.gender,identity,13),
      ageGroup:'teen',
      skinTone:pick(choices.skinTone,identity,0),
      eyeShape:pick(choices.eyeShape.filter(([value])=>['default','happy','side','squint','eyeRoll','surprised'].includes(value)),identity,1),
      eyebrowShape:pick(choices.eyebrowShape,identity,2),
      expression:pick(choices.expression,identity,3),
      hairStyle:pick(hairChoicesFor(pick(choices.gender,identity,13)),identity,4),
      hairColor:pick(choices.hairColor,identity,5),
      hat:'none',
      hatColor:pick(choices.hatColor,identity,7),
      clothingType:pick(choices.clothingType,identity,8),
      clothingColor:pick(choices.clothingColor,identity,9),
      petType:'none',
      background:pick(choices.background,identity,12)
    });
  };
  base.characterPresets = characterPresets.map(({id,gender,ageGroup})=>({id,gender,ageGroup}));
  base.getOptionsForField = (fieldKey, input) => {
    const config = normalize(input || defaults);
    if (fieldKey === 'characterPreset') return characterPresets.filter(item=>item.gender===config.gender).map(item=>({value:item.id,label:(item.gender==='female'?'নারী ':'পুরুষ ')+item.id.toUpperCase()}));
    if (fieldKey === 'hairStyle') return hairChoicesFor(config.gender, config.ageGroup).map(([value,label])=>({value,label}));
    if (fieldKey === 'facialHair' && (config.gender === 'female' || config.ageGroup === 'teen')) return [{value:'none',label:'নেই'}];
    return (base.choices[fieldKey] || []).slice();
  };
  base.applyCharacterPreset = (id, current) => {
    const preset = characterPresets.find(item=>item.id===String(id));
    if (!preset) return normalize(current || defaults);
    return normalize({...preset,background:current?.background || preset.background});
  };
  base.normalize = normalize;
  base.render = buildUrl;
  base.randomize = randomize;
  base.configFromAvatar = configFromAvatar;
  base.isAvatar = value => /^https:\/\/api\.dicebear\.com\/10\.x\/avataaars\/svg\?/i.test(String(value||'')) || /^data:image\/svg\+xml;charset=utf-8,/i.test(String(value||''));

  /* Inline the locally generated SVG only for the large/live avatar surfaces.
     Keeping its component groups editable lets the eyes, brows, mouth and hair
     move independently instead of faking life with whole-image zoom alone. */
  const livingSvgCache = new Map();
  const svgNs = 'http://www.w3.org/2000/svg';
  const livingTimers = new WeakMap();

  function getLivingSvgText(source) {
    if (!livingSvgCache.has(source)) {
      const request = fetch(source, { mode:'cors', credentials:'omit', cache:'force-cache' })
        .then(response => {
          if (!response.ok) throw new Error('Avatar SVG request failed: ' + response.status);
          return response.text();
        })
        .then(markup => {
          if (!markup || markup.length > 180 * 1024) throw new Error('Avatar SVG is not a valid lightweight portrait.');
          return markup;
        })
        .catch(error => {
          livingSvgCache.delete(source);
          throw error;
        });
      livingSvgCache.set(source, request);
    }
    return livingSvgCache.get(source);
  }

  function wrapSvgChildren(parent, className, doc) {
    if (!parent) return null;
    const existing = Array.from(parent.children).find(child =>
      child.namespaceURI === svgNs && String(child.getAttribute('class') || '').split(/\s+/).includes(className)
    );
    if (existing) return existing;
    const wrapper = doc.createElementNS(svgNs, 'g');
    wrapper.setAttribute('class', className);
    while (parent.firstChild) wrapper.appendChild(parent.firstChild);
    parent.appendChild(wrapper);
    return wrapper;
  }

  function startLivingFaceMotion(stack, svg, motion) {
    const previousCleanup = livingTimers.get(stack);
    if (previousCleanup) previousCleanup();

    const prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (prefersReduced()) return;

    const timers = new Set();
    const current = () => stack.isConnected && svg.isConnected && stack.contains(svg);
    const later = (callback, delay) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (current() && !prefersReduced()) callback();
      }, delay);
      timers.add(timer);
      return timer;
    };
    const blink = () => {
      if (document.hidden) { later(blink, 1400); return; }
      motion.blink?.classList.add('is-blinking');
      later(() => motion.blink?.classList.remove('is-blinking'), 105);
      if (motion.blink && Math.random() < 0.17) {
        later(() => {
          motion.blink?.classList.add('is-blinking');
          later(() => motion.blink?.classList.remove('is-blinking'), 100);
        }, 205);
      }
      later(blink, 3900 + Math.random() * 3400);
    };
    const glance = () => {
      if (document.hidden) { later(glance, 1600); return; }
      const states = ['is-looking-left','is-looking-right','is-looking-down'];
      const state = states[Math.floor(Math.random() * states.length)];
      motion.gaze?.classList.add(state);
      if (motion.brows && Math.random() < 0.38) motion.brows.classList.add('is-raised');
      later(() => {
        motion.gaze?.classList.remove(...states);
        motion.brows?.classList.remove('is-raised');
      }, 520 + Math.random() * 280);
      later(glance, 4300 + Math.random() * 3900);
    };
    const expression = () => {
      if (document.hidden) { later(expression, 1800); return; }
      if (motion.mouth && Math.random() < 0.34) {
        motion.mouth.classList.add('is-soft-smile');
        later(() => motion.mouth?.classList.remove('is-soft-smile'), 520 + Math.random() * 260);
      }
      if (motion.hair && Math.random() < 0.3) {
        motion.hair.classList.add('is-swaying');
        later(() => motion.hair?.classList.remove('is-swaying'), 700);
      }
      later(expression, 7600 + Math.random() * 5200);
    };

    if (motion.canBlink) later(blink, 900 + Math.random() * 1300);
    if (motion.canLook) later(glance, 1900 + Math.random() * 1600);
    later(expression, 3200 + Math.random() * 2200);

    livingTimers.set(stack, () => {
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    });
  }

  base.hydrateLivingFace = async stack => {
    if (!stack || typeof stack.querySelector !== 'function') return false;
    const image = stack.querySelector('img.med-avatar-base');
    if (!image) return !!stack.querySelector('svg.med-avatar-inline-svg');
    const source = String(image.currentSrc || image.src || '');
    if (!source.startsWith('https://api.dicebear.com/10.x/avataaars/svg?') && !source.startsWith('data:image/svg+xml;charset=utf-8,')) return false;
    if (stack.dataset.matFaceMotionSource === source && stack.querySelector('svg.med-avatar-inline-svg')) return true;
    if (stack.dataset.matFaceMotionPending === source) return false;
    stack.dataset.matFaceMotionPending = source;

    try {
      const markup = await getLivingSvgText(source);
      if (!stack.isConnected || stack.querySelector('img.med-avatar-base') !== image) return false;
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') {
        throw new Error('Local avatar SVG markup is malformed.');
      }

      const svg = doc.documentElement;
      const findComponent = (id, transform) =>
        svg.querySelector('g[id="' + id + '"]') ||
        Array.from(svg.querySelectorAll('g')).find(group => group.getAttribute('transform') === transform) ||
        null;
      const eyes = findComponent('eyes', 'translate(98 98)');
      if (!eyes) throw new Error('Avatar eye component was not found.');
      const localConfig = configFromAvatar(source);
      const parameters = source.startsWith('data:image/svg+xml;charset=utf-8,') ? null : new URL(source).searchParams;
      const eyeVariant = localConfig?.eyeShape || parameters?.get('eyesVariant') || 'default';
      const accessories = localConfig ? localConfig.glasses : (parameters?.get('accessoriesProbability') === '0' ? 'none' : (parameters?.get('accessoriesVariant') || 'none'));
      const canSeeEyes = eyeVariant !== 'closed' && !['sunglasses','eyepatch'].includes(accessories);

      const gaze = wrapSvgChildren(eyes, 'mat-avatar-eye-gaze', doc);
      const blink = wrapSvgChildren(gaze, 'mat-avatar-eye-blink', doc);
      const browRoot = findComponent('eyebrows', 'translate(91.86 82)');
      const mouthRoot = findComponent('mouth', 'translate(94 140)');
      const hairRoot = findComponent('top', 'translate(8)');
      const brows = wrapSvgChildren(browRoot, 'mat-avatar-brow-motion', doc);
      const mouth = wrapSvgChildren(mouthRoot, 'mat-avatar-mouth-motion', doc);
      const hair = wrapSvgChildren(hairRoot, 'mat-avatar-hair-motion', doc);

      const style = doc.createElementNS(svgNs, 'style');
      style.textContent = [
        '.mat-avatar-eye-gaze{transform-box:fill-box;transform-origin:center;transition:transform .48s cubic-bezier(.2,.8,.2,1)}',
        '.mat-avatar-eye-gaze.is-looking-left{transform:translateX(-1.35px)}',
        '.mat-avatar-eye-gaze.is-looking-right{transform:translateX(1.35px)}',
        '.mat-avatar-eye-gaze.is-looking-down{transform:translateY(1px)}',
        '.mat-avatar-eye-blink{transform-box:fill-box;transform-origin:center;transition:transform 95ms cubic-bezier(.2,.8,.2,1)}',
        '.mat-avatar-eye-blink.is-blinking{transform:scaleY(.055)}',
        '.mat-avatar-brow-motion{transform-box:fill-box;transform-origin:center;transition:transform .38s ease}',
        '.mat-avatar-brow-motion.is-raised{transform:translateY(-.75px)}',
        '.mat-avatar-mouth-motion{transform-box:fill-box;transform-origin:center;transition:transform .42s ease}',
        '.mat-avatar-mouth-motion.is-soft-smile{transform:scaleY(1.045)}',
        '.mat-avatar-hair-motion{transform-box:fill-box;transform-origin:50% 80%;transition:transform .55s ease}',
        '.mat-avatar-hair-motion.is-swaying{transform:rotate(.35deg)}',
        '@media(prefers-reduced-motion:reduce){.mat-avatar-eye-gaze,.mat-avatar-eye-blink,.mat-avatar-brow-motion,.mat-avatar-mouth-motion,.mat-avatar-hair-motion{transition:none!important}}'
      ].join('');
      svg.insertBefore(style, svg.firstChild);
      svg.setAttribute('class', 'med-avatar-base med-avatar-inline-svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('aria-hidden', 'true');

      // The avatar URL is generated by this adapter from the official DiceBear host.
      // Strip executable and external-reference nodes before inserting it inline.
      svg.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
      svg.querySelectorAll('*').forEach(node => {
        Array.from(node.attributes).forEach(attribute => {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim();
          if (name.startsWith('on') || ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#'))) {
            node.removeAttribute(attribute.name);
          }
        });
      });

      const inlineSvg = document.importNode(svg, true);
      image.replaceWith(inlineSvg);
      stack.dataset.matFaceMotionSource = source;
      const liveEyes = inlineSvg.querySelector('.mat-avatar-eye-blink');
      const liveGaze = inlineSvg.querySelector('.mat-avatar-eye-gaze');
      const liveBrows = inlineSvg.querySelector('.mat-avatar-brow-motion');
      const liveMouth = inlineSvg.querySelector('.mat-avatar-mouth-motion');
      const liveHair = inlineSvg.querySelector('.mat-avatar-hair-motion');
      startLivingFaceMotion(stack, inlineSvg, {
        blink: liveEyes,
        gaze: liveGaze,
        brows: liveBrows,
        mouth: liveMouth,
        hair: liveHair,
        canBlink: canSeeEyes && !!liveEyes,
        canLook: canSeeEyes && !!liveGaze
      });
      return true;
    } catch (error) {
      // Keep the original <img> visible whenever SVG inlining is unavailable.
      console.warn('[Avatar motion] Using static avatar fallback:', error);
      return false;
    } finally {
      if (stack.dataset.matFaceMotionPending === source) delete stack.dataset.matFaceMotionPending;
    }
  };

  base.dicebearAvataaars10 = true;
  base.localSvgRenderer = true;
  base.renderLayersMarkup = renderLayersMarkup;
  base.assetPaths = {pets:{chick:'./public/assets/pets/chick.svg',cat:'./public/assets/pets/cat.svg',bear:'./public/assets/pets/white-bear.svg'}};
  base.assetManifest = {categories:{pets:[]},total:0};

  // The deployment workflow rebuilds this manifest from the real SVG files on every
  // Pages deploy. Keep each original SVG file as an <img src>; never redraw/recolor it.
  base.loadAssetManifest = async function () {
    try {
      const response = await fetch('./public/assets/asset-manifest.json?refresh=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw new Error('SVG asset manifest HTTP ' + response.status);
      const manifest = await response.json();
      if (!manifest || typeof manifest !== 'object' || !manifest.categories) throw new Error('Invalid SVG asset manifest');
      base.assetManifest = manifest;
      const petAssets = Array.isArray(manifest.categories.pets) ? manifest.categories.pets : [];
      const nextPets = {};
      petAssets.forEach(asset => {
        if (asset && /^[a-z0-9_-]+$/.test(String(asset.id || '')) && typeof asset.path === 'string') {
          nextPets[asset.id] = asset.path;
        }
      });
      // Keep older saved "bear" selections working when the actual file is white-bear.svg.
      if (!nextPets.bear && nextPets['white-bear']) nextPets.bear = nextPets['white-bear'];
      base.assetPaths.pets = nextPets;

      // Character cards are backed by the actual SVG files in /characters.
      // Adding/removing a preset SVG therefore adds/removes its selectable option.
      const characterAssets = Array.isArray(manifest.categories.characters) ? manifest.categories.characters : [];
      const previousPresets = new Map(characterPresets.map(item => [String(item.id).toLowerCase(), item]));
      const discoveredPresets = characterAssets.map(asset => {
        const filename = String(asset.path || '').split('/').pop() || '';
        const id = filename.replace(/\.svg$/i, '');
        if (!/^[a-z0-9_-]+$/i.test(id)) return null;
        const existing = previousPresets.get(id.toLowerCase());
        if (existing) return existing;
        const gender = /^f/i.test(id) ? 'female' : 'male';
        const template = previousPresets.get(gender === 'female' ? 'f01' : 'm01') || characterPresets[0];
        return template ? {...template, id, characterPreset:id, gender} : null;
      }).filter(Boolean);
      characterPresets.splice(0, characterPresets.length, ...discoveredPresets);
      choices.characterPreset = characterPresets.map(item => [item.id, (item.gender === 'female' ? 'নারী ' : 'পুরুষ ') + item.id.toUpperCase()]);
      base.characterPresets = characterPresets.map(({id,gender,ageGroup}) => ({id,gender,ageGroup}));
      base.choices.characterPreset = choices.characterPreset.map(([value,label]) => ({value,label}));

      // Keep the option lists synchronized with the actual SVG folders.
      // Existing labels are preserved; newly added SVGs receive manifest labels.
      const categoryFields = {
        hairStyle:'hair', eyeShape:'eyes', eyebrowShape:'eyebrows',
        expression:'mouths', nose:'nose', facialHair:'facial-hair',
        glasses:'accessories', hat:'headwear', clothingType:'clothing', clothingGraphic:'clothing-graphics'
      };
      Object.entries(categoryFields).forEach(([fieldKey, category]) => {
        const assets = Array.isArray(manifest.categories[category]) ? manifest.categories[category] : [];
        const previous = new Map((choices[fieldKey] || []).map(([value, label]) => [String(value).toLowerCase(), label]));
        const keepNone = (choices[fieldKey] || []).filter(([value]) => value === 'none');
        const discovered = assets.map(asset => {
          const filename = String(asset.path || '').split('/').pop() || '';
          const value = filename.replace(/\.svg$/i, '');
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) return null;
          return [value, previous.get(value.toLowerCase()) || asset.label || value];
        }).filter(Boolean);
        const merged = [...keepNone, ...discovered];
        choices[fieldKey].splice(0, choices[fieldKey].length, ...merged);
        base.choices[fieldKey] = choices[fieldKey].map(([value, label]) => ({value, label}));
      });

      // A newly added hairstyle is available to both character types unless a later
      // curated gender rule explicitly removes it.
      const discoveredHair = Array.isArray(manifest.categories.hair) ? manifest.categories.hair : [];
      discoveredHair.forEach(asset => {
        const filename = String(asset.path || '').split('/').pop() || '';
        const value = filename.replace(/\.svg$/i, '');
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) return;
        if (!maleHair.includes(value)) maleHair.push(value);
        if (!femaleHair.includes(value)) femaleHair.push(value);
      });
      const headwearAssets = Array.isArray(manifest.categories.headwear) ? manifest.categories.headwear : [];
      if (headwearAssets.some(asset => String(asset.path || '').toLowerCase().endsWith('/hijab.svg'))) {
        if (!femaleHair.includes('hijab')) femaleHair.push('hijab');
        if (!choices.hairStyle.some(([value]) => value === 'hijab')) {
          choices.hairStyle.push(['hijab','হিজাব']);
          base.choices.hairStyle = choices.hairStyle.map(([value,label])=>({value,label}));
        }
      }
      choices.petType = [['none','নেই'], ...petAssets.map(asset => {
        const filename = String(asset.path || '').split('/').pop() || '';
        const id = filename.replace(/\.svg$/i, '');
        return [id === 'white-bear' ? 'bear' : id, id === 'white-bear' ? 'সাদা ভালুক' : (asset.label || id)];
      })].filter((item, index, list) => list.findIndex(candidate => candidate[0] === item[0]) === index);
      base.choices.petType = choices.petType.map(([value,label])=>({value,label}));
      document.dispatchEvent(new CustomEvent('med-avatar-assets-updated', {detail:{manifest}}));
      return manifest;
    } catch (error) {
      console.warn('[Avatar assets] Could not load generated SVG manifest; keeping built-in fallback paths.', error);
      return base.assetManifest;
    }
  };
  window.MedAvatarCreator = base;
  base.assetManifestReady = base.loadAssetManifest();
})();