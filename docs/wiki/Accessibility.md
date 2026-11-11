# ♿ Accessibility

Medical Admission Pro-এর interface যেন বিভিন্ন device, input method এবং assistive technology ব্যবহারকারী শিক্ষার্থীদের জন্য সহজবোধ্য হয়—এটাই লক্ষ্য।

পূর্ণ development guideline ও checklist: [ACCESSIBILITY.md](../guides/ACCESSIBILITY.md)।

## User tips

- Browser zoom ব্যবহার করে text বড় করতে পারো।
- Keyboard ব্যবহার করে interactive control-এ যাওয়ার সময় focus indicator দেখো।
- Dark theme-এ text বা icon স্পষ্ট দেখা যাচ্ছে কি না পরীক্ষা করো।
- Motion কমাতে device/browser-এর reduced-motion preference enable করতে পারো, যেখানে supported।
- Bangla text cut বা overlap হলে screenshot-এ personal information ঢেকে report করো।

## Contributor checklist

- Semantic HTML ও meaningful heading।
- Keyboard-operable controls এবং visible focus।
- Form label ও understandable error feedback।
- Text contrast এবং colour ছাড়া state বোঝার ব্যবস্থা।
- Reduced-motion support।
- Narrow viewport ও 200% zoom-এ usable layout।
- Image/chart/canvas-এর text alternative।

Accessibility issue জানাতে [Accessibility Report](https://github.com/serakib/Medical-Admission-Tracker/issues/new?template=accessibility_report.yml) ব্যবহার করো।
