# Avatar SVG Parts Library

এই folder-এর **SVG file-গুলোই Avatar Builder-এর actual artwork source**। Character preview, Hair, Eyes, Eyebrows, Nose, Mouth, Beard, Clothes, Glasses ও Headwear—প্রতিটি component তার নিজের SVG file থেকে নেওয়া হয়। Artwork redraw বা substitute করা হয় না।

## Category folders

- [`base/`](./base/) — Face/body foundation
- [`characters/`](./characters/) — Full Male/Female HSC student character cards
- [`hair/`](./hair/) — Hairstyle
- [`headwear/`](./headwear/) — Hat, hijab, turban
- [`eyes/`](./eyes/) — Eye artwork
- [`eyebrows/`](./eyebrows/) — Eyebrow artwork
- [`nose/`](./nose/) — Nose
- [`mouths/`](./mouths/) — Mouth/expression
- [`facial-hair/`](./facial-hair/) — Beard/moustache
- [`clothing/`](./clothing/) — Outfit
- [`clothing-graphics/`](./clothing-graphics/) — Shirt graphics
- [`accessories/`](./accessories/) — Glasses/accessories
- [`pets/`](../pets/) — Optional companion SVGs

## How the live Preview uses the files

1. GitHub Pages deployment `public/assets/avatar/` এবং `public/assets/pets/`-এর SVG scan করে exact source text `public/assets/asset-manifest.json`-এ রাখে। Website favicon ও Font Awesome icon sprite এই Avatar manifest-এ ঢোকে না।
2. The browser loads that manifest and builds each avatar from the original SVG component files.
3. Each component uses its own official `viewBox` and Avataaars canvas position; fill colors are supplied through the SVG custom properties.
4. The same manifest also supplies the option-card artwork and character thumbnails.
5. Removed files disappear from the next deployment's manifest and are no longer offered as selectable parts.

## Add or remove an SVG

- `public/assets/avatar/` বা `public/assets/pets/`-এর সঠিক category folder-এ SVG যোগ করো। Its filename becomes the option ID.
- Delete an SVG to remove that option on the next GitHub Pages deployment.
- Keep SVG `viewBox` and artwork coordinates intact. Components are placed using the official 280×280 Avataaars canvas.
- For a new component category, the renderer must have a canvas placement/layer mapping before it can appear in the composed character. A file being detected in the manifest alone does not determine where an unknown category belongs.

## Integrity check

The GitHub validation workflow runs:

```bash
node scripts/generate-avatar-svg-parts.mjs --check
```

This checks existing official component SVG geometry against the pinned vector source at `scripts/data/avataaars-style-definition.json`. Use `--write` only when deliberately regenerating official component artwork from that source.

Artwork credits and license notes: [ASSET-CREDITS.md](../ASSET-CREDITS.md) and [ATTRIBUTION.md](../ATTRIBUTION.md).
