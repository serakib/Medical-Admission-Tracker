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

## Live Builder integration

বর্তমান repository-তে Avatar Builder-এর জন্য ১০০টির বেশি আলাদা SVG part রাখা আছে। Builder manifest থেকে প্রতিটি category-র asset path পড়ে Hair, Eyes, Eyebrows, Nose, Mouth, Facial Hair, Accessories, Headwear, Clothing এবং Pet-এর option card-এ সংশ্লিষ্ট original SVG-টি আলাদাভাবে দেখায়।

- প্রতিটি SVG নিজের rectangular preview card-এ থাকে; পুরো avatar-কে thumbnail হিসেবে ব্যবহার করা হয় না।
- Selected card-এ green border দেখা যায়।
- Manifest build-এর সময় পুরো public/assets folder scan হয়; নতুন SVG যোগ বা মুছে দিলে পরবর্তী deployment-এ option list স্বয়ংক্রিয়ভাবে sync হয়।
- Original SVG file, viewBox এবং artwork অপরিবর্তিত থাকে। Card-এ SVG-কে image হিসেবে দেখানো হয়; artwork redraw বা recolor করা হয় না।
- সম্পূর্ণ character-এর live preview ও saved-avatar format আগের renderer দিয়েই চলতে থাকে, যাতে পুরোনো saved avatar compatibility নষ্ট না হয়।

## Editing and credits

SVG text editor বা vector editor দিয়ে edit করা যায়। Original artwork source/license যাচাই করে [asset credits](../ASSET-CREDITS.md) এবং [attribution](../ATTRIBUTION.md) update করো।

## HSC student avatar direction

- Builder-এর ২০টি starting preset (১০টি ছেলে, ১০টি মেয়ে) HSC শিক্ষার্থীর ১৬–১৮ বছর বয়সের profile হিসেবে configured।
- পুরোনো saved profile-এ adult/mature age value থাকলেও Builder এখন HSC age profile-এ normalize করে।
- Preset-এ beard/moustache default নেই; HSC student mode-এ facial-hair control-ও দেখানো হয় না।
- Default outfit blazer-and-shirt; অন্য preset-এ hoodie, shirt ও sweater-এর মতো student-friendly casual পোশাক রাখা হয়েছে।
- Avatar artwork stylized cartoon, তাই বয়সকে photorealistically মাপার দাবি করা হচ্ছে না; লক্ষ্য হলো mature/adult styling বাদ দিয়ে student-appropriate look রাখা।
