(function () {
  'use strict';
  if (window.MedAvatarCreator) return;

  const choices = {
    skin: [
      { value: '#f7d7c4', label: 'Light' }, { value: '#eab99a', label: 'Warm' },
      { value: '#ce8f6b', label: 'Tan' }, { value: '#a96749', label: 'Brown' },
      { value: '#75452f', label: 'Deep' }
    ],
    hairStyle: [
      { value: 'short', label: 'Short' }, { value: 'curly', label: 'Curly' },
      { value: 'long', label: 'Long' }, { value: 'bob', label: 'Bob' },
      { value: 'bun', label: 'Bun' }, { value: 'hijab', label: 'Hijab' }
    ],
    hairColor: [
      { value: '#211a19', label: 'Black' }, { value: '#493025', label: 'Brown' },
      { value: '#8b542d', label: 'Chestnut' }, { value: '#d39a42', label: 'Golden' },
      { value: '#343c58', label: 'Blue-black' }, { value: '#6a426d', label: 'Violet' }
    ],
    outfit: [
      { value: 'hoodie', label: 'Hoodie' }, { value: 'school', label: 'School' },
      { value: 'coat', label: 'Lab coat' }, { value: 'sweater', label: 'Sweater' }
    ],
    outfitColor: [
      { value: '#2563eb', label: 'Blue' }, { value: '#0f766e', label: 'Teal' },
      { value: '#7c3aed', label: 'Purple' }, { value: '#dc6b42', label: 'Coral' },
      { value: '#374151', label: 'Charcoal' }, { value: '#db2777', label: 'Pink' }
    ],
    accessory: [
      { value: 'none', label: 'None' }, { value: 'glasses', label: 'Glasses' },
      { value: 'headphones', label: 'Headphones' }, { value: 'flower', label: 'Flower' }
    ],
    background: [
      { value: '#dbeafe', label: 'Sky' }, { value: '#dcfce7', label: 'Mint' },
      { value: '#fce7f3', label: 'Rose' }, { value: '#fef3c7', label: 'Sun' },
      { value: '#ede9fe', label: 'Lavender' }, { value: '#d1fae5', label: 'Aqua' }
    ]
  };

  const defaultConfig = seed => {
    const text = String(seed == null ? 'student' : seed);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    const pick = (key, offset) => choices[key][(Math.abs(hash + offset * 2654435761) >>> 0) % choices[key].length].value;
    return {
      skin: pick('skin', 1), hairStyle: pick('hairStyle', 2), hairColor: pick('hairColor', 3),
      outfit: pick('outfit', 4), outfitColor: pick('outfitColor', 5),
      accessory: pick('accessory', 6), background: pick('background', 7)
    };
  };

  const normalize = config => {
    const result = {};
    Object.keys(choices).forEach(key => {
      const allowed = choices[key].map(item => item.value);
      result[key] = config && allowed.includes(config[key]) ? config[key] : choices[key][0].value;
    });
    return result;
  };

  const render = input => {
    const c = normalize(input);
    const skinShadow = c.skin === '#75452f' ? '#593321' : c.skin === '#a96749' ? '#92583e' : '#c98970';
    const hair = c.hairColor;
    const hairBack = c.hairStyle === 'long'
      ? '<path d="M55 73Q39 92 46 145L73 151L77 91Z" fill="' + hair + '"/><path d="M201 73Q217 92 210 145L183 151L179 91Z" fill="' + hair + '"/>'
      : c.hairStyle === 'hijab'
      ? '<path d="M48 78Q40 12 128 12Q216 12 208 78L222 150Q128 190 34 150Z" fill="' + hair + '"/><path d="M54 76Q128 8 202 76L191 115Q128 151 65 115Z" fill="' + hair + '" opacity=".92"/>'
      : c.hairStyle === 'bun'
      ? '<circle cx="128" cy="37" r="30" fill="' + hair + '"/><path d="M51 83Q38 24 128 22Q218 24 205 83L194 137L62 137Z" fill="' + hair + '"/>'
      : '<path d="M48 82Q40 20 128 18Q216 20 208 82L194 119L62 119Z" fill="' + hair + '"/>';
    let hairFront = '';
    if (c.hairStyle === 'short') hairFront = '<path d="M60 76Q62 22 128 24Q194 22 196 76Q171 54 150 61Q115 38 88 69Z" fill="' + hair + '"/>';
    if (c.hairStyle === 'curly') hairFront = '<g fill="' + hair + '"><circle cx="72" cy="58" r="23"/><circle cx="96" cy="38" r="25"/><circle cx="126" cy="32" r="25"/><circle cx="158" cy="39" r="25"/><circle cx="184" cy="59" r="22"/><path d="M58 66Q128 42 198 66L190 82Q128 61 66 83Z"/></g>';
    if (c.hairStyle === 'long') hairFront = '<path d="M53 82Q54 17 128 19Q202 17 203 82Q171 61 148 65Q107 45 78 80Z" fill="' + hair + '"/>';
    if (c.hairStyle === 'bob') hairFront = '<path d="M48 91Q39 16 128 18Q217 16 208 91L192 127Q176 103 181 75Q128 51 75 75Q80 103 64 127Z" fill="' + hair + '"/>';
    if (c.hairStyle === 'bun') hairFront = '<path d="M54 82Q61 20 128 22Q195 20 202 82Q164 54 128 61Q91 54 54 82Z" fill="' + hair + '"/>';
    if (c.hairStyle === 'hijab') hairFront = '<path d="M48 88Q42 19 128 18Q214 19 208 88Q184 64 177 57Q128 92 79 57Q72 64 48 88Z" fill="' + hair + '"/>';
    const outfit = c.outfit === 'coat'
      ? '<path d="M42 256Q49 174 91 165L128 184L165 165Q207 174 214 256Z" fill="#f8fafc"/><path d="M91 165L128 202L165 165L149 256H107Z" fill="' + c.outfitColor + '"/><path d="M91 165L111 256M165 165L145 256" stroke="#cbd5e1" stroke-width="4"/>'
      : c.outfit === 'school'
      ? '<path d="M42 256Q49 174 91 165L128 184L165 165Q207 174 214 256Z" fill="#f8fafc"/><path d="M91 165L128 204L165 165L151 256H105Z" fill="' + c.outfitColor + '"/><path d="M91 165L111 190L128 184L145 190L165 165" fill="#fff"/><path d="M119 192L128 204L137 192L133 241H123Z" fill="#dc3545"/>'
      : c.outfit === 'sweater'
      ? '<path d="M42 256Q49 174 91 165L128 184L165 165Q207 174 214 256Z" fill="' + c.outfitColor + '"/><path d="M95 171Q128 207 161 171" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="7"/>'
      : '<path d="M42 256Q49 174 91 165L128 184L165 165Q207 174 214 256Z" fill="' + c.outfitColor + '"/><path d="M76 180L96 165L128 191L160 165L180 180" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="5"/><path d="M104 194L128 211L152 194" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="4"/>';
    let accessory = '';
    if (c.accessory === 'glasses') accessory = '<g fill="none" stroke="#263244" stroke-width="5"><rect x="72" y="91" width="43" height="28" rx="11"/><rect x="141" y="91" width="43" height="28" rx="11"/><path d="M115 103Q128 96 141 103M72 101L60 96M184 101L196 96"/></g>';
    if (c.accessory === 'headphones') accessory = '<path d="M55 99V86Q55 27 128 27Q201 27 201 86V99" fill="none" stroke="#273449" stroke-width="12"/><rect x="48" y="91" width="19" height="45" rx="9" fill="#273449"/><rect x="189" y="91" width="19" height="45" rx="9" fill="#273449"/>';
    if (c.accessory === 'flower') accessory = '<g><circle cx="183" cy="59" r="9" fill="#fff"/><circle cx="171" cy="50" r="8" fill="#fff"/><circle cx="195" cy="48" r="8" fill="#fff"/><circle cx="194" cy="69" r="8" fill="#fff"/><circle cx="171" cy="69" r="8" fill="#fff"/><circle cx="183" cy="59" r="6" fill="#f5b942"/></g>';
    const face = '<ellipse cx="128" cy="105" rx="59" ry="70" fill="' + c.skin + '"/><path d="M77 112Q84 165 128 169Q172 165 179 112" fill="none" stroke="' + skinShadow + '" stroke-opacity=".22" stroke-width="3"/><ellipse cx="105" cy="104" rx="6" ry="9" fill="#292321"/><ellipse cx="151" cy="104" rx="6" ry="9" fill="#292321"/><circle cx="107" cy="101" r="2" fill="#fff"/><circle cx="153" cy="101" r="2" fill="#fff"/><path d="M120 126Q128 132 136 126" fill="none" stroke="' + skinShadow + '" stroke-width="3" stroke-linecap="round"/><path d="M111 144Q128 157 145 144" fill="none" stroke="#a4484a" stroke-width="4" stroke-linecap="round"/><ellipse cx="86" cy="128" rx="11" ry="6" fill="#e98d83" opacity=".25"/><ellipse cx="170" cy="128" rx="11" ry="6" fill="#e98d83" opacity=".25"/>';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" data-avatar-config="' + encodeURIComponent(JSON.stringify(c)) + '" viewBox="0 0 256 256"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + c.background + '"/><stop offset="1" stop-color="#ffffff"/></linearGradient><linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".14"/><stop offset="1" stop-color="#111827" stop-opacity=".12"/></linearGradient></defs><circle cx="128" cy="128" r="126" fill="url(#bg)"/><circle cx="128" cy="128" r="111" fill="#fff" opacity=".18"/><path d="M40 256Q45 181 93 164L128 188L163 164Q211 181 216 256Z" fill="#0f172a" opacity=".08"/><path d="M105 151H151V184Q128 203 105 184Z" fill="' + c.skin + '"/>' + outfit + '<path d="M91 165L128 190L165 165" fill="none" stroke="url(#shirt)" stroke-width="6"/>' + hairBack + face + hairFront + accessory + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  const randomize = seed => {
    const text = String(seed == null ? Math.random() : seed);
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return Object.keys(choices).reduce((config, key, index) => {
      const list = choices[key];
      const randomIndex = Math.floor(Math.random() * list.length);
      config[key] = list[(randomIndex + ((hash >>> 0) + index) % list.length) % list.length].value;
      return config;
    }, {});
  };

  const configFromAvatar = source => {
    try {
      const clean = String(source || '').replace(/#mat-(?:default|custom)-avatar$/i, '');
      if (!/^data:image\/svg\+xml;charset=utf-8,/i.test(clean)) return null;
      const encoded = clean.slice(clean.indexOf(',') + 1);
      const svg = decodeURIComponent(encoded);
      const match = svg.match(/data-avatar-config="([^"]+)"/);
      return match ? normalize(JSON.parse(decodeURIComponent(match[1]))) : null;
    } catch (_) { return null; }
  };
  window.MedAvatarCreator = { choices, defaultConfig, normalize, render, randomize, configFromAvatar, isAvatar: value => /^data:image\/svg\+xml;charset=utf-8,%3Csvg/i.test(String(value || '')) };
})();