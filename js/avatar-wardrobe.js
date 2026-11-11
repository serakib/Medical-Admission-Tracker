/* Independent, gender-scoped avatar wardrobe.
   Character identity and outfit are separate settings. An outfit can be worn by
   any character of the same gender; changing identity never overwrites outfit. */
(function () {
  'use strict';
  const api = window.MedAvatarCreator;
  if (!api || api.wardrobeV1) return;

  const originalNormalize = api.normalize;
  const originalRender = api.render;
  const originalConfigFromAvatar = api.configFromAvatar;
  const originalOptions = api.getOptionsForField;
  const originalDefaultConfig = api.defaultConfig;
  const originalRandomize = api.randomize;

  const maleNames = [
    'শিক্ষার্থী','বিজ্ঞানী','অ্যাথলেট','শিল্পী','অভিযাত্রী',
    'গোয়েন্দা','সংগীতশিল্পী','রাঁধুনি','টেক-প্রতিভা','রাজকীয়'
  ];
  const femaleNames = [
    'শিক্ষার্থী','বিজ্ঞানী','অ্যাথলেট','শিল্পী','অভিযাত্রী',
    'গোয়েন্দা','সংগীতশিল্পী','ডিজাইনার','টেক-প্রতিভা','রাজকীয়'
  ];
  const ids = prefix => Array.from({length:10}, (_,i) => prefix + String(i+1).padStart(2,'0'));
  const optionsForGender = gender => {
    const prefix = gender === 'female' ? 'f' : 'm';
    const names = gender === 'female' ? femaleNames : maleNames;
    return ids(prefix).map((value,i) => ({value,label:names[i]}));
  };
  const sameGenderOutfit = (value, gender) =>
    typeof value === 'string' && value.startsWith(gender === 'female' ? 'f' : 'm') &&
    /^([mf])(0[1-9]|10)$/.test(value);

  function normalize(input) {
    const config = originalNormalize(input || {});
    const requested = input && input.outfitStyle;
    const identity = String(config.characterStyle || (config.gender === 'female' ? 'f01' : 'm01'));
    config.outfitStyle = sameGenderOutfit(requested, config.gender)
      ? requested
      : (sameGenderOutfit(identity, config.gender) ? identity : (config.gender === 'female' ? 'f01' : 'm01'));
    return config;
  }

  const path = (d, fill, extra) =>
    '<path d="' + d + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const line = (d, stroke, width, extra) =>
    '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + width +
    '" stroke-linecap="round" stroke-linejoin="round"' + (extra ? ' ' + extra : '') + '/>';
  const circle = (cx,cy,r,fill,extra) =>
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const star = (x,y,r,fill) => {
    const pts = [];
    for (let i=0;i<10;i++) {
      const a = -Math.PI/2 + i*Math.PI/5;
      const rr = i%2 ? r*.45 : r;
      pts.push((x+Math.cos(a)*rr).toFixed(1)+','+(y+Math.sin(a)*rr).toFixed(1));
    }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '"/>';
  };

  function buildOutfit(config) {
    const color = '#' + String(config.clothingColor || '2563eb').replace(/^#/,'');
    const white = '#f8fafc';
    const ink = '#263449';
    const gold = '#f5c451';
    const mint = '#6ee7b7';
    const blue = '#7dd3fc';
    const gender = config.gender;
    const style = config.outfitStyle;
    let body = 'M45 280 Q50 222 88 207 L120 222 L152 207 Q190 222 195 280Z';
    let details = '';

    if (gender === 'male') {
      switch (style) {
        case 'm02': // Scientist / lab coat
          body = 'M31 280 Q37 222 79 203 L120 220 L161 203 Q203 222 209 280Z';
          details = path('M103 207 L120 231 L137 207 L157 280 L83 280Z',color) +
            path('M79 203 L111 216 L99 248 L72 280 L43 280Z',white) +
            path('M161 203 L129 216 L141 248 L168 280 L197 280Z',white) +
            line('M80 207 L110 238 L101 280 M160 207 L130 238 L139 280', '#cbd5e1', 3) +
            line('M96 233 C76 245 82 267 98 264 C111 261 105 245 96 245',mint,3) +
            circle(98,264,3,mint) + path('M145 248 L176 248 L176 270 L145 270Z',white,'stroke="#94a3b8" stroke-width="2"') +
            line('M146 257h25', '#94a3b8', 2);
          break;
        case 'm03': // Athlete jersey
          body = 'M35 280 Q39 220 82 202 L120 219 L158 202 Q201 220 205 280Z';
          details = line('M78 211 L98 280 M162 211 L142 280',white,8) +
            line('M90 219 L120 243 L150 219',white,6) +
            path('M107 248 L133 248 L133 269 L107 269Z',color,'stroke="#ffffff" stroke-width="2"') +
            circle(120,258,3,white) + line('M45 267h150', '#ffffff', 3, 'opacity=".55"');
          break;
        case 'm04': // Artist smock
          body = 'M48 280 Q53 224 88 207 L120 222 L152 207 Q187 224 192 280Z';
          details = path('M78 219 Q120 231 162 219 L169 280 L71 280Z','#e2e8f0') +
            line('M87 211 L101 236 M153 211 L139 236',ink,5) +
            path('M95 247 L145 247 L145 272 L95 272Z','#cbd5e1','stroke="#64748b" stroke-width="2"') +
            line('M105 252h30 M120 247v25', '#64748b', 2) +
            line('M160 244l13 20', '#f97316', 4) + circle(173,264,3,'#f97316') +
            circle(88,258,4,'#f472b6') + circle(155,235,4,'#38bdf8');
          break;
        case 'm05': // Explorer jacket
          body = 'M37 280 Q42 220 82 204 L120 220 L158 204 Q198 220 203 280Z';
          details = path('M82 205 L111 222 L100 245 L72 280 L47 280Z','#d6a56a') +
            path('M158 205 L129 222 L140 245 L168 280 L193 280Z',color) +
            line('M70 226 L163 280',gold,9) +
            path('M83 238 L111 238 L111 262 L83 262Z',color,'stroke="#f8fafc" stroke-width="2"') +
            path('M137 238 L164 238 L164 262 L137 262Z',color,'stroke="#f8fafc" stroke-width="2"') +
            circle(120,238,4,gold) + circle(120,254,4,gold);
          break;
        case 'm06': // Detective trench coat
          body = 'M30 280 Q37 220 78 202 L120 222 L162 202 Q203 220 210 280Z';
          details = path('M78 203 L114 219 L103 248 L79 280 L48 280Z','#64748b') +
            path('M162 203 L126 219 L137 248 L161 280 L192 280Z','#475569') +
            path('M105 218 L120 244 L135 218 L127 280 L113 280Z',white) +
            line('M65 265 Q120 251 175 265',gold,5) +
            circle(112,252,3,gold) + circle(128,252,3,gold) +
            circle(112,266,3,gold) + circle(128,266,3,gold);
          break;
        case 'm07': // Musician stage jacket
          body = 'M32 280 Q39 220 80 203 L120 220 L160 203 Q201 220 208 280Z';
          details = path('M80 204 L112 220 L97 252 L70 280 L43 280Z','#202b3d') +
            path('M160 204 L128 220 L143 252 L170 280 L197 280Z','#202b3d') +
            path('M101 219 L120 246 L139 219 L132 280 L108 280Z',color) +
            line('M80 218 L101 242 M160 218 L139 242',gold,4) +
            star(91,253,7,gold) + star(149,253,7,blue) +
            line('M110 270h20',white,2);
          break;
        case 'm08': // Chef jacket
          body = 'M43 280 Q47 220 84 205 L120 221 L156 205 Q193 220 197 280Z';
          details = path('M84 205 L120 226 L156 205 L145 280 L95 280Z',white,'stroke="#cbd5e1" stroke-width="2"') +
            path('M84 205 L120 226 L109 242 L75 224Z','#e2e8f0') +
            path('M156 205 L120 226 L131 242 L165 224Z','#e2e8f0') +
            line('M120 229v49', '#94a3b8', 2) +
            circle(113,245,3,gold) + circle(127,257,3,gold) + circle(113,269,3,gold);
          break;
        case 'm09': // Tech hoodie
          body = 'M38 280 Q43 221 83 203 L120 223 L157 203 Q197 221 202 280Z';
          details = line('M83 207 Q120 259 157 207', '#1e293b', 10) +
            path('M82 248 Q120 236 158 248 L163 280 L77 280Z',color,'stroke="#1e293b" stroke-width="3"') +
            line('M105 213l-5 27 M135 213l5 27',white,2) +
            line('M120 252v25', '#1e293b', 3) +
            circle(120,263,3,blue) + circle(105,270,2,mint) + circle(135,270,2,mint);
          break;
        case 'm10': // Royal formal cape
          body = 'M21 280 Q29 216 76 198 L120 222 L164 198 Q211 216 219 280Z';
          details = path('M76 199 L120 225 L164 199 L183 280 L57 280Z',color) +
            path('M76 199 L120 225 L101 253 L52 280 L35 280Z','#243b63') +
            path('M164 199 L120 225 L139 253 L188 280 L205 280Z','#243b63') +
            path('M107 224 L120 244 L133 224 L128 280 L112 280Z',gold) +
            line('M55 268 Q120 250 185 268',gold,3) +
            circle(120,253,7,'#ef4444','stroke="#f8fafc" stroke-width="2"');
          break;
        case 'm01':
        default: // Student uniform
          body = 'M43 280 Q48 222 86 206 L120 222 L154 206 Q192 222 197 280Z';
          details = path('M86 206 L120 229 L154 206 L144 225 L120 243 L96 225Z',white) +
            path('M112 230 L128 230 L134 271 L120 280 L106 271Z','#dc2626') +
            path('M79 242 L103 242 L103 265 L79 265Z',color,'stroke="#f8fafc" stroke-width="2"') +
            line('M84 249h14 M84 256h14',white,2);
      }
    } else {
      switch (style) {
        case 'f02': // Scientist / lab coat
          body = 'M31 280 Q37 222 79 203 L120 220 L161 203 Q203 222 209 280Z';
          details = path('M103 207 L120 231 L137 207 L157 280 L83 280Z',color) +
            path('M79 203 L111 216 L99 248 L72 280 L43 280Z',white) +
            path('M161 203 L129 216 L141 248 L168 280 L197 280Z',white) +
            line('M80 207 L110 238 L101 280 M160 207 L130 238 L139 280', '#cbd5e1', 3) +
            line('M96 233 C76 245 82 267 98 264 C111 261 105 245 96 245',mint,3) +
            path('M145 248 L176 248 L176 270 L145 270Z',white,'stroke="#94a3b8" stroke-width="2"') +
            line('M146 257h25', '#94a3b8', 2);
          break;
        case 'f03': // Athlete jersey
          body = 'M35 280 Q39 220 82 202 L120 219 L158 202 Q201 220 205 280Z';
          details = line('M78 211 L98 280 M162 211 L142 280',white,8) +
            line('M90 219 L120 243 L150 219',white,6) +
            path('M107 248 L133 248 L133 269 L107 269Z',color,'stroke="#ffffff" stroke-width="2"') +
            circle(120,258,3,white) + line('M45 267h150', '#ffffff', 3, 'opacity=".55"');
          break;
        case 'f04': // Artist overalls
          body = 'M45 280 Q49 221 85 205 L120 221 L155 205 Q191 221 195 280Z';
          details = path('M80 218 L160 218 L170 280 L70 280Z','#d6a56a') +
            path('M88 207 L105 207 L113 242 L97 242Z','#e5e7eb') +
            path('M152 207 L135 207 L127 242 L143 242Z','#e5e7eb') +
            path('M96 244 L144 244 L144 273 L96 273Z',color,'stroke="#64748b" stroke-width="2"') +
            line('M104 253h32 M120 245v28', '#64748b', 2) +
            circle(89,260,4,'#f472b6') + circle(153,236,4,'#38bdf8');
          break;
        case 'f05': // Explorer jacket
          body = 'M37 280 Q42 220 82 204 L120 220 L158 204 Q198 220 203 280Z';
          details = path('M82 205 L111 222 L100 245 L72 280 L47 280Z','#d6a56a') +
            path('M158 205 L129 222 L140 245 L168 280 L193 280Z',color) +
            line('M70 226 L163 280',gold,9) +
            path('M83 238 L111 238 L111 262 L83 262Z',color,'stroke="#f8fafc" stroke-width="2"') +
            path('M137 238 L164 238 L164 262 L137 262Z',color,'stroke="#f8fafc" stroke-width="2"') +
            circle(120,238,4,gold) + circle(120,254,4,gold);
          break;
        case 'f06': // Detective blazer
          body = 'M30 280 Q37 220 78 202 L120 222 L162 202 Q203 220 210 280Z';
          details = path('M78 203 L114 219 L103 248 L79 280 L48 280Z','#64748b') +
            path('M162 203 L126 219 L137 248 L161 280 L192 280Z','#475569') +
            path('M105 218 L120 244 L135 218 L127 280 L113 280Z',white) +
            circle(91,251,7,gold,'stroke="#f8fafc" stroke-width="2"') +
            line('M65 268 Q120 254 175 268',gold,3);
          break;
        case 'f07': // Musician stage jacket
          body = 'M32 280 Q39 220 80 203 L120 220 L160 203 Q201 220 208 280Z';
          details = path('M80 204 L112 220 L97 252 L70 280 L43 280Z','#202b3d') +
            path('M160 204 L128 220 L143 252 L170 280 L197 280Z','#202b3d') +
            path('M101 219 L120 246 L139 219 L132 280 L108 280Z',color) +
            line('M80 218 L101 242 M160 218 L139 242',gold,4) +
            star(91,253,7,gold) + star(149,253,7,blue) +
            line('M110 270h20',white,2);
          break;
        case 'f08': // Designer long tunic
          body = 'M42 280 Q48 220 84 205 L120 220 L156 205 Q192 220 198 280Z';
          details = path('M84 205 L120 224 L156 205 L170 280 L70 280Z',color) +
            path('M110 222 L120 240 L130 222',white) +
            line('M78 228 Q120 242 162 228',gold,3) +
            line('M76 272h88 M82 263h76',gold,2) +
            path('M155 211 Q183 229 176 268',blue,'stroke="#7dd3fc" stroke-width="9"') +
            line('M160 220 Q179 238 171 257',white,2);
          break;
        case 'f09': // Tech hoodie
          body = 'M38 280 Q43 221 83 203 L120 223 L157 203 Q197 221 202 280Z';
          details = line('M83 207 Q120 259 157 207', '#1e293b', 10) +
            path('M82 248 Q120 236 158 248 L163 280 L77 280Z',color,'stroke="#1e293b" stroke-width="3"') +
            line('M105 213l-5 27 M135 213l5 27',white,2) +
            line('M120 252v25', '#1e293b', 3) +
            circle(120,263,3,blue) + circle(105,270,2,mint) + circle(135,270,2,mint);
          break;
        case 'f10': // Royal cape / gown
          body = 'M21 280 Q29 216 76 198 L120 222 L164 198 Q211 216 219 280Z';
          details = path('M76 199 L120 225 L164 199 L183 280 L57 280Z',color) +
            path('M76 199 L120 225 L101 253 L52 280 L35 280Z','#243b63') +
            path('M164 199 L120 225 L139 253 L188 280 L205 280Z','#243b63') +
            path('M107 224 L120 244 L133 224 L128 280 L112 280Z',gold) +
            line('M55 268 Q120 250 185 268',gold,3) +
            circle(120,253,7,'#ef4444','stroke="#f8fafc" stroke-width="2"');
          break;
        case 'f01':
        default: // Student cardigan
          body = 'M43 280 Q48 222 86 206 L120 222 L154 206 Q192 222 197 280Z';
          details = path('M86 206 L120 229 L154 206 L144 225 L120 243 L96 225Z',white) +
            path('M112 230 L128 230 L134 271 L120 280 L106 271Z','#dc2626') +
            path('M79 242 L103 242 L103 265 L79 265Z',color,'stroke="#f8fafc" stroke-width="2"') +
            line('M84 249h14 M84 256h14',white,2);
      }
    }
    return {body:path(body,color),details};
  }

  function identitySignature(config) {
    const id = config.characterStyle;
    const cx = 120 + ((parseInt(id.slice(1),10)%3)-1)*2;
    const gold = '#f5c451';
    const white = '#f8fafc';
    const dark = '#273449';
    const mint = '#6ee7b7';
    const isFemale = config.gender === 'female';
    const marks = {
      m01: '',
      m02: '<g>' + circle(178,76,8,'#e0f2fe','stroke="#38bdf8" stroke-width="3"') + line('M172 76h12 M178 70v12','#38bdf8',2) + '</g>',
      m03: line('M57 87 Q'+cx+' 67 183 87', '#ef4444', 11) + line('M61 89 Q'+cx+' 75 179 89',white,2),
      m04: star(64,77,13,'#f59e0b') + circle(64,77,3,white),
      m05: path('M53 72 Q'+cx+' 12 187 72 L177 86 Q'+cx+' 40 63 86Z','#b77943') + line('M176 78l13 8',gold,4),
      m06: '<path d="M174 94l-10 9m10-9-2 12" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>',
      m07: line('M51 121 Q42 44 '+cx+' 42 Q198 44 189 121',dark,8) + circle(53,126,10,dark) + circle(187,126,10,dark) + circle(53,126,4,'#94a3b8') + circle(187,126,4,'#94a3b8'),
      m08: path('M73 68 Q65 49 82 43 Q84 22 103 28 Q120 9 137 28 Q158 20 160 44 Q177 50 167 69Z',white,'stroke="#cbd5e1" stroke-width="3"') + line('M68 69h103',white,7),
      m09: circle(188,147,9,dark,'stroke="#94a3b8" stroke-width="3"') + circle(188,147,3,mint),
      m10: path('M72 68 L86 40 L105 58 L120 25 L135 58 L154 40 L168 68Z',gold,'stroke="#b7791f" stroke-width="3"') + line('M76 69h88',gold,4),
      f01: '<path d="M63 72q-18-15-27 0 9 19 27 4 18 15 27-4-9-15-27 0Z" fill="#f472b6" stroke="#9d174d" stroke-width="2"/>' + circle(63,74,4,white),
      f02: '<g>' + circle(177,76,8,'#e0f2fe','stroke="#38bdf8" stroke-width="3"') + line('M171 76h12 M177 70v12','#38bdf8',2) + '</g>',
      f03: line('M57 87 Q'+cx+' 67 183 87', '#ec4899', 11) + line('M61 89 Q'+cx+' 75 179 89',white,2),
      f04: circle(65,76,10,'#fb7185') + circle(65,76,4,gold) + circle(55,76,5,'#fda4af') + circle(75,76,5,'#fda4af') + circle(65,66,5,'#fda4af') + circle(65,86,5,'#fda4af'),
      f05: path('M53 72 Q'+cx+' 12 187 72 L177 86 Q'+cx+' 40 63 86Z','#b77943') + line('M176 78l13 8',gold,4),
      f06: '<circle cx="177" cy="119" r="13" fill="none" stroke="'+gold+'" stroke-width="3"/><path d="M190 119h8" stroke="'+gold+'" stroke-width="3"/>',
      f07: line('M51 121 Q42 44 '+cx+' 42 Q198 44 189 121',dark,8) + circle(53,126,10,dark) + circle(187,126,10,dark) + circle(53,126,4,'#94a3b8') + circle(187,126,4,'#94a3b8'),
      f08: '<path d="M175 63q15 7 6 22-15 0-16-12Z" fill="'+gold+'" stroke="#b7791f" stroke-width="2"/>' + star(176,76,6,white),
      f09: circle(188,147,9,dark,'stroke="#94a3b8" stroke-width="3"') + circle(188,147,3,mint),
      f10: path('M72 68 L86 40 L105 58 L120 25 L135 58 L154 40 L168 68Z',gold,'stroke="#b7791f" stroke-width="3"') + line('M76 69h88',gold,4)
    };
    return (marks[id] || '') + (isFemale && id === 'f08' ? line('M164 87q16 9 11 24',gold,2) : '');
  }

  api.normalize = normalize;
  api.getOptionsForField = (field,input) => {
    const config = normalize(input || {});
    if (field === 'outfitStyle') return optionsForGender(config.gender);
    if (field === 'characterStyle') {
      const prefix = config.gender === 'female' ? 'f' : 'm';
      const names = config.gender === 'female' ? femaleNames : maleNames;
      return ids(prefix).map((value,i) => ({value,label:names[i]}));
    }
    return originalOptions(field,input);
  };
  api.choices.characterStyle = [
    ...ids('m').map((value,i)=>({value,label:'পুরুষ · '+maleNames[i]})),
    ...ids('f').map((value,i)=>({value,label:'নারী · '+femaleNames[i]}))
  ];
  api.choices.outfitStyle = [
    ...optionsForGender('male'),
    ...optionsForGender('female')
  ];
  api.defaultConfig = seed => normalize(originalDefaultConfig(seed));
  api.randomize = seed => normalize(originalRandomize(seed));

  api.render = input => {
    const config = normalize(input || {});
    // Keep the old saved clothingType value for compatibility, but use a
    // neutral neckline underneath the new independent outfit layer.
    const renderConfig = Object.assign({},config,{
      clothingType: config.gender === 'female' ? 'shirtScoopNeck' : 'shirtCrewNeck'
    });
    const data = originalRender(renderConfig);
    const prefix = 'data:image/svg+xml;charset=utf-8,';
    if (typeof data !== 'string' || !data.startsWith(prefix)) return data;
    try {
      let svg = decodeURIComponent(data.slice(prefix.length));
      const metadata = '<metadata id="mat-avatar-config">' +
        JSON.stringify(config).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&apos;') +
        '</metadata>';
      svg = svg.replace(/<metadata id="mat-avatar-config">[\s\S]*?<\/metadata>/,metadata);

      const outfit = buildOutfit(config);
      const shirtPattern = /<path d="M45 280 Q50 222 88 207 L\d+ 222 L152 207 Q190 222 195 280Z" fill="#[0-9a-f]{6}"\/>/i;
      if (shirtPattern.test(svg)) svg = svg.replace(shirtPattern,outfit.body);

      // Remove the old generic neckline; each wardrobe design supplies its own.
      svg = svg.replace(/<path d="M(?:102 214 L120 238 L138 214|94 210 Q120 238 146 210)" fill="none" stroke="#fff" stroke-width="5" opacity=".8"\/>/i,'');
      svg = svg.replace('</svg>',outfit.details + '</svg>');

      // Character signature remains attached to the identity, not to clothing.
      svg = svg.replace('<g class="eyes">',identitySignature(config) + '<g class="eyes">');
      return prefix + encodeURIComponent(svg).replace(/'/g,'%27').replace(/\(/g,'%28').replace(/\)/g,'%29');
    } catch (error) {
      console.warn('[Avatar wardrobe] Falling back to base portrait:',error);
      return data;
    }
  };

  api.configFromAvatar = source => {
    try {
      const raw = String(source || '').replace(/#mat-(?:default|custom)-avatar$/i,'');
      const prefix = 'data:image/svg+xml;charset=utf-8,';
      if (raw.startsWith(prefix)) {
        const svgText = decodeURIComponent(raw.slice(prefix.length));
        const match = svgText.match(/<metadata id="mat-avatar-config">([\s\S]*?)<\/metadata>/);
        if (match) {
          const encoded = match[1].replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
          return normalize(JSON.parse(encoded));
        }
      }
      return originalConfigFromAvatar(source);
    } catch (_) {
      return originalConfigFromAvatar(source);
    }
  };

  api.wardrobeV1 = true;
})();