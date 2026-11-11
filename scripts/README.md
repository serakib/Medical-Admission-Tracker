# Maintenance Scripts

এই folder-এ repository maintenance ও automated validation/build helper script রাখা হয়।

## Files

| Script | কাজ |
|---|---|
| `build-local-assets.mjs` | Tailwind CSS compile, Firebase compat SDK bundle এবং ব্যবহৃত Font Awesome SVG symbol sprite তৈরি করে। |
| `firebase-compat-entry.js` | Firebase compat modules-এর local browser bundle entry point। |
| `generate-avatar-browser-definition.mjs` | Local Avataaars source definition থেকে browser runtime data তৈরি করে। |
| `generate-avatar-asset-manifest.mjs` | `public/assets/avatar/` ও `public/assets/pets/`-এর SVG scan করে original content, path ও content hash-সহ deployment manifest তৈরি করে। |
| `generate-avatar-svg-parts.mjs` | Pinned Avataaars vector source থেকে official SVG component তৈরি বা `--check` দিয়ে existing component geometry যাচাই করে। |

## SVG manifest workflow

GitHub Pages workflow (`.github/workflows/static.yml`) Pages artifact upload করার আগে generator চালায়। ফলে এই দুই folder-এর category-তে SVG add, edit বা remove করে `main` branch-এ push করলে পরবর্তী deployment-এ manifest স্বয়ংক্রিয়ভাবে নতুন file list ও version hash দিয়ে তৈরি হয়।

Manifest-এ original SVG path ও source content থাকে; artwork redraw বা convert করা হয় না। Main Preview ও option thumbnail একই source content ব্যবহার করে।

GitHub validation workflow-তে `node scripts/generate-avatar-svg-parts.mjs --check` চালানো হয়। কোনো official SVG component-এর vector shape বদলে বা বাদ পড়ে গেলে এই check fail করবে।

## Local frontend build

Node.js 20+ ব্যবহার করে repository root থেকে pinned build dependency install করে চালাও:

```bash
npm install --no-save --no-package-lock tailwindcss@3.4.17 firebase@10.14.1 esbuild@0.28.2 @fortawesome/free-solid-svg-icons@6.4.0 @fortawesome/free-regular-svg-icons@6.4.0 @fortawesome/free-brands-svg-icons@6.4.0
node scripts/build-local-assets.mjs
node scripts/generate-avatar-browser-definition.mjs
node scripts/generate-avatar-asset-manifest.mjs
node scripts/generate-avatar-svg-parts.mjs --check
```

Build output (`css/tailwind.generated.css`, `js/vendor/firebase-compat.js`, `js/avatar/avataaars-local-definition.js`, `public/assets/icons/fontawesome.svg`) deployment-এর সময় generate হয়; এগুলো আলাদা করে commit করা বাধ্যতামূলক নয়.

## Local check

Node.js 22 ব্যবহার করে repository root থেকে চালাও:

```bash
node scripts/generate-avatar-asset-manifest.mjs
```

এতে `public/assets/asset-manifest.json` তৈরি হবে। Generated manifest deployment artifact-এর অংশ; আলাদা করে commit করা বাধ্যতামূলক নয়।
