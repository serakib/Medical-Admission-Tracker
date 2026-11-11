import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'scripts/data/avataaars-style-definition.json');
const output = path.join(root, 'js/avatar/avataaars-local-definition.js');
const definition = JSON.parse(fs.readFileSync(source, 'utf8'));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, '/* Generated from scripts/data/avataaars-style-definition.json. */\nwindow.MedAvatarSvgDefinition = ' + JSON.stringify(definition) + ';\n');
console.log('Generated js/avatar/avataaars-local-definition.js from the local Avataaars source definition.');
