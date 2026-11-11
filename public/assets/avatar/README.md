# Avatar SVG Parts

Each file in this folder is an individual editable SVG component extracted from the official DiceBear Avataaars style definition.

| Folder | Contents |
|---|---|
| [base/](./base/) | Face and body foundation |
| [hair/](./hair/) | Individual hairstyles |
| [headwear/](./headwear/) | Hats, hijab, turban and winter hats |
| [eyes/](./eyes/) | Eye expressions |
| [eyebrows/](./eyebrows/) | Eyebrow shapes |
| [nose/](./nose/) | Nose artwork |
| [mouths/](./mouths/) | Mouth expressions |
| [facial-hair/](./facial-hair/) | Beard and moustache variants |
| [clothing/](./clothing/) | Outfit variants |
| [clothing-graphics/](./clothing-graphics/) | Optional shirt graphics |
| [accessories/](./accessories/) | Glasses and face accessories |

## Editing

Every SVG is a standalone vector component in its own local coordinate system. Edit paths and shapes directly in an SVG-capable editor or text editor. Colorable fills use CSS variables such as `--avatar-hair`, `--avatar-skin`, and `--avatar-clothes`, with a fallback color.

The Avataaars style definition controls how the components are positioned and layered. The current app renderer and saved avatar URL format are intentionally unchanged for compatibility; this folder provides the individual local SVG source parts for editing.

Artwork: Avataaars by Pablo Stanley. The parts were extracted from the official DiceBear style definition. See [ASSET-CREDITS.md](../ASSET-CREDITS.md).
