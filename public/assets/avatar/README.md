# Avatar SVG Parts Library

এই folder-এর subfolder-গুলোতে Avatar Builder-এর editable, আলাদা SVG parts রাখা আছে। কোনো SVG-কে অন্য SVG দিয়ে পুনরায় আঁকা, duplicate করা বা UI-তে বিকল্প generated SVG হিসেবে দেখানো যাবে না।

## Category folders

| Folder | SVG type |
|---|---|
| `base/` | Face ও body foundation |
| `characters/` | সম্পূর্ণ character preset |
| `hair/` | Hairstyle |
| `headwear/` | Hat, hijab, turban ও winter hat |
| `eyes/` | Eye artwork |
| `eyebrows/` | Eyebrow artwork |
| `nose/` | Nose |
| `mouths/` | Mouth/expression |
| `facial-hair/` | Beard ও moustache |
| `clothing/` | Outfit |
| `clothing-graphics/` | Shirt graphic |
| `accessories/` | Glasses ও accessories |

## Avatar Builder display rules

- যে option-এর matching SVG আছে, তার card-এ **সেই original file-টাই** একবার `<img src="...svg">` দিয়ে দেখানো হবে।
- Card-এ full avatar generate করে individual part-এর বিকল্প বানানো যাবে না।
- কোনো setting-এর নিজস্ব SVG নেই (যেমন gender বা age range), সেটি text-only option হবে।
- Color option থাকবে সরাসরি color swatch; সেটির জন্য আলাদা SVG তৈরি করা হবে না।
- কোনো category-তে original artwork না থাকলে সেটি generated placeholder দিয়ে পূরণ করা হবে না।
- Selected card-এ সবুজ outline থাকবে। Asset panel-এর option area scroll করবে, category strip ও confirm footer স্থির থাকবে।
- Live portrait-এ pet নির্বাচিত হলে pet-এর original SVG আলাদা asset হিসেবে দেখানো হবে; pet-কে avatar-এর ভিতরে আরেকটি SVG দিয়ে redraw করা হবে না।

## Automatic discovery

GitHub Pages deployment-এর আগে `scripts/generate-avatar-asset-manifest.mjs` পুরো `public/assets/` folder scan করে `public/assets/asset-manifest.json` তৈরি করে।

- কোনো category folder-এ নতুন `.svg` যোগ করলে পরবর্তী deployment-এ manifest-এ auto-detect হবে।
- SVG delete করলে পরবর্তী deployment-এ manifest থেকে বাদ যাবে।
- SVG-এর original path অক্ষত থাকবে; manifest শুধু file list ও path রাখে।
- Pet SVG manifest থেকে Avatar Builder-এর Pet choices-এ auto-load হয়।
- নতুন category যোগ করলে তার folder mapping ও option field logic-ও code-এ যুক্ত করতে হবে; শুধু file add করলেই নতুন UI category তৈরি হবে না।

## Editing and credits

SVG text editor বা vector editor দিয়ে edit করা যায়। Original artwork source/license যাচাই করে [asset credits](../ASSET-CREDITS.md) এবং [attribution](../ATTRIBUTION.md) update করো।
