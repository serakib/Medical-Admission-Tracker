# Maintenance Scripts

এই folder-এ repository maintenance ও automated validation/build helper script রাখা হয়।

## Files

| Script | কাজ |
|---|---|
| `generate-avatar-asset-manifest.mjs` | `public/assets/`-এর সব SVG scan করে deployment-এর সময় `public/assets/asset-manifest.json` তৈরি করে। |

## SVG manifest workflow

GitHub Pages workflow (`.github/workflows/static.yml`) Pages artifact upload করার আগে generator চালায়। ফলে `public/assets/`-এ SVG add বা remove করে `main` branch-এ push করলে পরবর্তী deployment-এ manifest স্বয়ংক্রিয়ভাবে নতুন file list দিয়ে তৈরি হয়।

Manifest-এ original SVG path থাকে; SVG artwork edit বা convert করা হয় না।

## Local check

Node.js 22 ব্যবহার করে repository root থেকে চালাও:

```bash
node scripts/generate-avatar-asset-manifest.mjs
```

এতে `public/assets/asset-manifest.json` তৈরি হবে। Generated manifest deployment artifact-এর অংশ; আলাদা করে commit করা বাধ্যতামূলক নয়।
