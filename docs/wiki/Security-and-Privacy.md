# 🔐 Security & Privacy

Student account, exam progress এবং backend configuration সুরক্ষিত রাখা গুরুত্বপূর্ণ।

## Security policy

Project-এর vulnerability reporting rules: [SECURITY.md](https://github.com/serakib/Medical-Admission-Tracker/blob/main/.github/SECURITY.md)।

সাধারণ bug বা feature request public Issue Form-এ দেওয়া যায়। কিন্তু suspected security vulnerability public issue, discussion, pull request বা screenshot-এ প্রকাশ কোরো না।

## কীভাবে vulnerability report করবে

1. Repository-র Security page-এ Report a vulnerability option থাকলে সেটি দিয়ে private report জমা দাও।
2. Option না থাকলে maintainer-এর GitHub profile/contact route দিয়ে privately যোগাযোগ করো।
3. Report-এ affected page/API, impact, safe reproduction summary এবং relevant timestamp দাও।
4. অন্যের account, private student data বা live service-এর ক্ষতি হয় এমন পরীক্ষা কোরো না।
5. Maintainer-এর সঙ্গে coordinated disclosure বজায় রাখো।

## Private vulnerability reporting

GitHub-এর Private Vulnerability Reporting একটি repository setting; এটি SECURITY.md থেকে আলাদা এবং আলাদাভাবে enable করতে হয়। Maintainer চাইলে Settings → Code security and analysis → Private vulnerability reporting থেকে এটি চালু করতে পারেন।

GitHub help: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately

## Sensitive information

কখনো public repository-তে commit কোরো না:
- Firebase service-account private key
- Telegram bot token
- API secret বা access token
- Private spreadsheet data/export
- Student password, email verification code বা private profile data
- Production environment credentials

Public frontend-এর configuration-এ কোনো value থাকলে সেটি public ধরে design করতে হবে। Secret রাখার জায়গা হলো protected backend configuration, যেমন Apps Script Script Properties।

## Data handling

- Private Google Sheets public share কোরো না।
- Firestore Security Rules-এ user-specific access enforce করো।
- Admin/Super Admin permission backend-এ verify করো।
- Browser থেকে পাঠানো score/reward amount সরাসরি trust কোরো না।
- Screenshot, issue বা log share করার আগে personal information redact করো।

## Published Security Advisories

Repository page-এ “There aren't any published security advisories” দেখানো মানে এই repository-এর জন্য বর্তমানে কোনো **publicly published** advisory নেই। এটি নিজে থেকে কোনো vulnerability আছে বা নেই—কোনোটাই প্রমাণ করে না। Draft/private report public advisory list-এ দেখা যায় না।

শুধু প্রকৃত, যাচাই করা vulnerability থাকলে fix ও disclosure process শেষে advisory publish করা উচিত। শুধু section পূরণ করার জন্য fake advisory তৈরি করা ঠিক নয়।

## Related references

- [Repository Security Policy](https://github.com/serakib/Medical-Admission-Tracker/blob/main/.github/SECURITY.md)
- [GitHub Security Advisories](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)
