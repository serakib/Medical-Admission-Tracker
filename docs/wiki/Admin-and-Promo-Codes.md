# 🛠️ Admin & Promo Codes

এই page maintainer এবং অনুমোদিত Admin-দের জন্য। সাধারণ শিক্ষার্থীর জন্য Admin action প্রযোজ্য নয়।

## Role separation

- **Student:** Practice, profile ও student-facing feature ব্যবহার করে।
- **Admin:** অনুমোদিত administrative feature ব্যবহার করে।
- **Super Admin:** master-level configuration নিয়ন্ত্রণ করে।

Admin action backend-এ verified session এবং server-side permission check দিয়ে validate হয়। UI-তে button লুকানো থাকাই security boundary নয়।

## Promo Code management

System-এ promo configuration-এর ধরন:
- Public/global promo configuration।
- Registered member-specific override।
- Admin-only master promo configuration।

Super Admin master configuration-এ shared Admin-only promo code, PB reward per redemption, period limit এবং enabled state নিয়ন্ত্রণ করতে পারে।

Available period: Daily, Weekly, Monthly, Unlimited। Configured count 0 হলে count limit unlimited হিসেবে ধরা হয়।

Per-Admin override থাকলে সেটি shared master default-এর ওপর priority পায়।

## Important safeguards

- Redemption validation ও PB credit backend-এ হতে হবে।
- একই request duplicate হলে reward যেন একাধিকবার না দেওয়া হয়।
- Super Admin-only save action backend-এ root identity verify করবে।
- Script Properties-এ থাকা secrets বা private identifiers public code/documentation-এ কপি করা যাবে না।
- Admin action test করার সময় production student data পরিবর্তন কোরো না।

## Deployment note

Promo code backend update GitHub-এ commit করলেই live Apps Script update হয় না। Updated source existing Apps Script project-এ বসিয়ে new Web App version deploy করতে হয়।

বিস্তারিত [Apps Script deployment guide](https://github.com/serakib/Medical-Admission-Tracker/blob/main/apps-script/README.md)।
