# Avatar SVG Parts Library

প্রতিটি category-তে Avatar Builder-এর individual editable SVG asset রাখা আছে। কোনো component-কে পুরো avatar thumbnail দিয়ে প্রতিস্থাপন করা হয় না।

## Category folders

- [`base/`](./base/) — Face/body foundation
- [`hair/`](./hair/) — Hairstyles
- [`headwear/`](./headwear/) — Hats, hijab, turban
- [`eyes/`](./eyes/) — Eye expressions
- [`eyebrows/`](./eyebrows/) — Eyebrow shapes
- [`nose/`](./nose/) — Nose
- [`mouths/`](./mouths/) — Mouth expressions
- [`facial-hair/`](./facial-hair/) — Beard and moustache
- [`clothing/`](./clothing/) — Outfits
- [`clothing-graphics/`](./clothing-graphics/) — Clothing prints
- [`accessories/`](./accessories/) — Glasses and face accessories
- [`pets/`](./pets/) — Companion illustrations

## Complete character presets

[`characters/`](./characters/) contains 20 standalone editable character SVGs: M01–M10 and F01–F10।

## Live local renderer

- Avatar Builder local `js/avataaars-local-definition.js` এবং local renderer ব্যবহার করে।
- Renderer `scripts/data/avataaars-style-definition.json` থেকে SVG তৈরি করে; নতুন avatar generate করতে DiceBear image API call করে না।
- আগের DiceBear URL থেকে saved config পড়ার compatibility রাখা হয়েছে।
- Local SVG data URL-এ avatar configuration metadata থাকে; face motion local SVG-তেও কাজ করে।

## Automatic asset manifest

`scripts/generate-avatar-asset-manifest.mjs` `public/assets/`-এর সব SVG recursively scan করে `asset-manifest.json` তৈরি করে। GitHub Pages deployment workflow-তে generator চালানো হয়।

- নতুন SVG যোগ করলে পরবর্তী deployment-এ manifest-এ auto-detect হবে।
- SVG delete করলে পরবর্তী deployment-এ manifest থেকে বাদ যাবে।
- নতুন component variant runtime-এ যোগ করতে source definition ও generator mapping-ও update করতে হবে।

## Editing workflow

1. সংশ্লিষ্ট category folder-এর README পড়ো।
2. SVG সরাসরি code editor বা vector editor দিয়ে edit করো।
3. Official component definition বদলালে `scripts/data/avataaars-style-definition.json` edit করে `node scripts/generate-avatar-svg-parts.mjs --write` চালাও।
4. Browser renderer data update করতে `node scripts/generate-avatar-browser-definition.mjs` চালাও।
5. Asset list sync করতে `node scripts/generate-avatar-asset-manifest.mjs` চালাও।

Source/license: [asset credits](../ASSET-CREDITS.md) এবং [attribution](../ATTRIBUTION.md)।
