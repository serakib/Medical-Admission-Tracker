# Character Preset SVGs

Avatar Builder-এর সম্পূর্ণ character preset-গুলোর আলাদা SVG entry point এখানে রাখা হয়েছে।

- `m01.svg`–`m10.svg`: পুরুষ Character Preset
- `f01.svg`–`f10.svg`: নারী Character Preset

প্রতিটি ফাইল 512×512 SVG এবং বর্তমান Avatar Builder-এর একই DiceBear Avataaars 10.x preset configuration ব্যবহার করে। **নোট:** এই SVG ফাইলগুলোতে artwork DiceBear API থেকে load হয়; তাই এগুলো self-contained/offline vector নয় এবং network access প্রয়োজন। মূল editable component SVG-গুলো পাশের category folder-গুলোতে আছে।

নতুন preset যোগ করলে `js/avatar-creator-extended.js`-এর `characterPresets` তালিকার সঙ্গে মিলিয়ে SVG যোগ করতে হবে। Deployment-এ `scripts/generate-avatar-asset-manifest.mjs` এগুলো স্বয়ংক্রিয়ভাবে manifest-এ অন্তর্ভুক্ত করবে।
