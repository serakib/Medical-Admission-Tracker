# Assets

Static image and illustration files used by the website.

## SVG files

| File | Purpose |
|---|---|
| [favicon.svg](./favicon.svg) | Browser tab icon and site icon |
| [pets/bear.svg](./pets/bear.svg) | Bear pet illustration |
| [pets/white-bear.svg](./pets/white-bear.svg) | White bear pet illustration |
| [pets/cat.svg](./pets/cat.svg) | Cat pet illustration |
| [pets/chick.svg](./pets/chick.svg) | Chick pet illustration |

## Folder layout

```text
public/assets/
├── favicon.svg
├── pets/
│   ├── README.md
│   ├── bear.svg
│   ├── white-bear.svg
│   ├── cat.svg
│   └── chick.svg
├── ASSET-CREDITS.md
├── ATTRIBUTION.md
└── README.md
```

## Referencing assets

From files in the repository root, use paths beginning with `./public/assets/`.

Example:

```html
<img src="./public/assets/pets/cat.svg" alt="Cat">
```

## Avatar artwork and licensing

The main student portrait is generated at runtime by the avatar renderer in `js/avatar-creator-extended.js`; the pet SVGs in `pets/` are optional companion artwork, not the main character.

- [Asset credits](./ASSET-CREDITS.md)
- [Attribution and license notes](./ATTRIBUTION.md)
- [Pet SVG guide](./pets/README.md)

When adding or modifying an asset, verify its source and license, test its rendering, and update the relevant credit/attribution file. Do not place secrets or private user data in this public folder.
