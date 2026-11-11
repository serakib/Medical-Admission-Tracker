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

Keep new static SVG artwork in this folder. Put character/pet illustrations in `pets/` and other shared site graphics directly in `public/assets/`.

See [ASSET-CREDITS.md](./ASSET-CREDITS.md) and [ATTRIBUTION.md](./ATTRIBUTION.md) for artwork credits and license requirements.
