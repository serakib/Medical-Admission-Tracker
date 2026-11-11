# Avatar SVG Parts Library

এই folder-এর subfolder-গুলোতে Avatar Builder-এর editable SVG parts রাখার নির্ধারিত জায়গা আছে। **SVG artwork-কে reference-এর মতো হুবহু ব্যবহার করতে হবে**—কোনো replacement illustration, redraw বা অপ্রয়োজনীয় recolor নয়।

## Category folders

| Folder | SVG type |
|---|---|
| `base/` | Face ও body foundation |
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

## Automatic discovery

GitHub Pages deployment-এর আগে `scripts/generate-avatar-asset-manifest.mjs` পুরো `public/assets/` folder scan করে `public/assets/asset-manifest.json` তৈরি করে।

- কোনো category folder-এ নতুন `.svg` যোগ করলে পরবর্তী deployment-এ manifest-এ auto-detect হবে।
- SVG delete করলে পরবর্তী deployment-এ manifest থেকে বাদ যাবে।
- SVG-এর original path অক্ষত থাকবে; manifest শুধু file list ও path রাখে।
- Pet SVG manifest থেকে Avatar Builder-এর Pet choices-এ auto-load হয়।

## Important current status

এই category folder-গুলো repository-তে আছে, কিন্তু বর্তমানে এগুলোর মধ্যে character-part SVG file নেই। তাই এই মুহূর্তে এগুলোতে নতুন SVG যোগ না করলে Face/Hair/Eyes/Clothes-এর actual local asset দিয়ে preview তৈরি হবে না। Manifest নতুন file শনাক্ত করবে; নতুন character-part category-কে live Builder control ও SVG layer position-এর সঙ্গে connect করার implementation আলাদা কাজ।

বর্তমান character renderer-এর existing behavior ও saved avatar compatibility অকারণে বদলাবে না। SVG files যোগ হলে তাদের viewBox, coordinate alignment, gender compatibility এবং layering পরীক্ষা করে তবেই preview-তে বসাতে হবে।

## Editing and credits

SVG text editor বা vector editor দিয়ে edit করা যায়। Original artwork source/license যাচাই করে [asset credits](../ASSET-CREDITS.md) এবং [attribution](../ATTRIBUTION.md) update করো।
