# Avatar Pet SVGs

এই folder-এ Avatar Builder-এর optional pet companion SVG artwork রাখা হয়।

## Files

| File | Companion |
|---|---|
| `cat.svg` | Cat |
| `bear.svg` | Bear |
| `white-bear.svg` | White Bear |
| `chick.svg` | Chick |

## How the app uses them

Pet asset path-গুলো `js/avatar-creator-extended.js`-এর `assetPaths.pets` mapping-এ নির্ধারিত। নতুন pet যোগ করলে:

1. SVG file এই folder-এ রাখো।
2. `assetPaths.pets` mapping-এ একটি unique key ও relative path যোগ করো।
3. Avatar configuration-এর pet choices-এ একই key যোগ করো।
4. Preview-তে position, size, layering এবং mobile rendering পরীক্ষা করো।

## Credits and license

প্রতিটি artwork-এর উৎস ও license যাচাই করো। বিস্তারিত:

- [Asset credits](../ASSET-CREDITS.md)
- [Attribution](../ATTRIBUTION.md)

License যাচাই ছাড়া বাইরের কোনো SVG এখানে যোগ কোরো না।
