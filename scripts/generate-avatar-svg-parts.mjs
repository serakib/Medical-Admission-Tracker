import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFINITION_PATH = path.join(ROOT, 'scripts/data/avataaars-style-definition.json');
const ASSET_ROOT = path.join(ROOT, 'public/assets/avatar');
const DEFINITION = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
const COLOR_FALLBACKS = {
  skin: '#edb98a',
  hair: '#2c1b18',
  clothes: '#2563eb',
  accessories: '#262e33',
  facialHair: '#2c1b18',
  hat: '#dc2626'
};
const COMPONENT_FOLDERS = {
  accessories: 'accessories',
  clothes: 'clothing',
  clothesGraphic: 'clothing-graphics',
  eyebrows: 'eyebrows',
  eyes: 'eyes',
  facialHair: 'facial-hair',
  mouth: 'mouths',
  nose: 'nose'
};
const HEADWEAR = new Set(['hat', 'hijab', 'turban', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04']);
const SHAPE_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'use']);

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attributeValue(value) {
  if (value && typeof value === 'object' && value.type === 'color') {
    const name = String(value.name || '');
    const fallback = COLOR_FALLBACKS[name] || '#000000';
    return `var(--avatar-${name}, ${fallback})`;
  }
  return String(value);
}

function renderElement(element) {
  if (!element || element.type === 'component') return '';
  const name = String(element.name || '');
  if (!/^[A-Za-z][A-Za-z0-9:-]*$/.test(name)) throw new Error('Unsafe SVG element name: ' + name);
  const attrs = Object.entries(element.attributes || {})
    .map(([key, value]) => ` ${key}="${escapeXml(attributeValue(value))}"`)
    .join('');
  const children = (element.children || []).map(renderElement).join('');
  if (!children && !['title', 'desc', 'text'].includes(name)) return `<${name}${attrs}/>`;
  return `<${name}${attrs}>${children}</${name}>`;
}

function componentFolder(name, variant) {
  if (name === 'top') return HEADWEAR.has(variant) ? 'headwear' : 'hair';
  const folder = COMPONENT_FOLDERS[name];
  if (!folder) throw new Error('No SVG folder mapping for component: ' + name);
  return folder;
}

function componentSvg(name, variant, component) {
  const elements = (component.variants[variant].elements || [])
    .filter(element => element.type !== 'component')
    .map(renderElement).join('\n');
  const width = component.width;
  const height = component.height;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- ${name} / ${variant}; Avataaars by Pablo Stanley. Source: scripts/data/avataaars-style-definition.json. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none" role="img" aria-label="${escapeXml(name + ' / ' + variant)}">`,
    elements,
    '</svg>',
    ''
  ].join('\n');
}

function baseSvg() {
  const elements = DEFINITION.canvas.elements
    .filter(element => element.type === 'element')
    .map(renderElement).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Avataaars face and body base; Avataaars by Pablo Stanley. -->',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DEFINITION.canvas.width} ${DEFINITION.canvas.height}" width="${DEFINITION.canvas.width}" height="${DEFINITION.canvas.height}" fill="none" role="img" aria-label="Avataaars face and body base">`,
    elements,
    '</svg>',
    ''
  ].join('\n');
}

function officialFiles() {
  const files = new Map();
  files.set(path.join(ASSET_ROOT, 'base/face-and-body.svg'), baseSvg());
  for (const [name, component] of Object.entries(DEFINITION.components)) {
    for (const variant of Object.keys(component.variants || {})) {
      const folder = componentFolder(name, variant);
      const destination = path.join(ASSET_ROOT, folder, variant + '.svg');
      files.set(destination, componentSvg(name, variant, component));
    }
  }
  return files;
}

function collectExpectedShapes(nodes, result = []) {
  for (const node of nodes || []) {
    if (node.type === 'element' && SHAPE_TAGS.has(node.name)) {
      const attrs = node.attributes || {};
      result.push({
        tag: node.name,
        geometry: Object.fromEntries(['d','points','cx','cy','r','rx','ry','x','y','width','height','x1','x2','y1','y2'].filter(key => attrs[key] != null).map(key => [key, String(attrs[key])]))
      });
    }
    if (node.children) collectExpectedShapes(node.children, result);
  }
  return result;
}

function collectLocalShapes(source) {
  const result = [];
  const re = /<(path|circle|ellipse|rect|line|polyline|polygon|text|use)\b([^>]*)>/g;
  let match;
  while ((match = re.exec(source))) {
    const attrs = {};
    for (const part of match[2].matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g)) attrs[part[1]] = part[2];
    const geometry = {};
    for (const key of ['d','points','cx','cy','r','rx','ry','x','y','width','height','x1','x2','y1','y2']) {
      if (attrs[key] != null) geometry[key] = attrs[key];
    }
    result.push({ tag: match[1], geometry });
  }
  return result;
}

function expectedFor(filePath, componentName, variantName, component) {
  if (componentName === 'base') return collectExpectedShapes(DEFINITION.canvas.elements);
  return collectExpectedShapes(component.variants[variantName].elements);
}

function checkFile(filePath, expectedShapes) {
  if (!fs.existsSync(filePath)) return { skipped: true };
  const source = fs.readFileSync(filePath, 'utf8');
  const localBox = source.match(/viewBox=["']([^"']+)["']/i)?.[1] || '';
  const expected = expectedShapes;
  const local = collectLocalShapes(source);
  const same = JSON.stringify(local) === JSON.stringify(expected);
  return { same, localBox, localCount: local.length, expectedCount: expected.length };
}

const files = officialFiles();
const onlyArg = process.argv.find(arg => arg.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',').filter(Boolean)) : null;
const write = process.argv.includes('--write');
const check = process.argv.includes('--check') || !write;
const errors = [];
let written = 0;
let checked = 0;

for (const [destination, content] of files) {
  const relative = path.relative(ASSET_ROOT, destination).split(path.sep).join('/');
  if (only && !only.has(relative)) continue;
  if (write) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
    written++;
    continue;
  }
  if (!fs.existsSync(destination)) {
    if (relative === 'base/face-and-body.svg') errors.push({ file: relative, missing: true, required: true });
    continue; // Optional deleted variants disappear from the manifest; the base is mandatory.
  }
  let expectedShapes;
  if (relative === 'base/face-and-body.svg') {
    expectedShapes = collectExpectedShapes(DEFINITION.canvas.elements);
  } else {
    const [folder, filename] = [path.dirname(relative), path.basename(relative, '.svg')];
    const componentName = Object.entries(COMPONENT_FOLDERS).find(([, value]) => value === folder)?.[0]
      || (folder === 'hair' || folder === 'headwear' ? 'top' : null);
    const component = componentName && DEFINITION.components[componentName];
    if (!component || !component.variants[filename]) continue;
    expectedShapes = collectExpectedShapes(component.variants[filename].elements);
  }
  checked++;
  const result = checkFile(destination, expectedShapes);
  if (!result.same) errors.push({ file: relative, localShapes: result.localCount, expectedShapes: result.expectedCount });
}

if (write) {
  console.log(`Generated ${written} official Avataaars SVG components.`);
} else {
  console.log(`Checked ${checked} existing official SVG components.`);
  if (errors.length) {
    console.error('SVG source mismatch:', JSON.stringify(errors, null, 2));
    process.exitCode = 1;
  } else {
    console.log('All existing official SVG components match the pinned vector source.');
  }
}
