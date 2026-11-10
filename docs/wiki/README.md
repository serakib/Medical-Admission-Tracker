# Medical Admission Pro — Wiki Source

এই folder-এ project Wiki-র জন্য সাজানো Markdown pages রাখা হয়েছে। প্রতিটি page আলাদা topic অনুযায়ী লেখা এবং Sidebar ও Footer source-ও included।

## Wiki pages

| Page | বিষয় |
|---|---|
| [Home](Home.md) | Project overview ও navigation |
| [Getting Started](Getting-Started.md) | শিক্ষার্থীদের শুরু করার নির্দেশনা |
| [Features](Features.md) | Platform-এর প্রধান সুবিধা |
| [Exam Modes & Scoring](Exam-Modes-and-Scoring.md) | পরীক্ষা, সময় ও নম্বর |
| [Question Bank](Question-Bank.md) | প্রশ্নের source, filter ও content guide |
| [Accounts & Profiles](Accounts-and-Profiles.md) | Guest, registered account ও profile |
| [Points, Ranks & Leaderboards](Points-Ranks-and-Leaderboards.md) | XP, RP, PB ও ranking |
| [Friends & Notifications](Friends-and-Notifications.md) | Friends ও in-site notification |
| [Admin & Promo Codes](Admin-and-Promo-Codes.md) | Admin role ও promo management |
| [Architecture & Data](Architecture-and-Data.md) | Frontend, Firebase, Apps Script ও Sheets |
| [Deployment & Operations](Deployment-and-Operations.md) | আলাদা deployment ও maintenance |
| [Security & Privacy](Security-and-Privacy.md) | নিরাপত্তা ও privacy |
| [Accessibility](Accessibility.md) | Accessible experience |
| [FAQ & Troubleshooting](FAQ-and-Troubleshooting.md) | সাধারণ সমস্যা ও সমাধান |
| [Support & Contributing](Support-and-Contributing.md) | Issue, contribution ও support |

## Actual GitHub Wiki-তে publish

Repository-র Wiki feature enabled। এই GitHub connection দিয়ে মূল repository-র files create/update করা যায়, কিন্তু আলাদা Wiki Git repository-তে page push করার সুবিধা নেই। তাই এই source bundle মূল repository-তে রাখা হয়েছে; এটি নিজে থেকে GitHub Wiki page publish করে না।

Actual Wiki publish করতে:

1. Repository-এর Wiki tab খুলে Create the first page নির্বাচন করো (page না থাকলে)।
2. Home.md-এর content প্রথম page হিসেবে paste করে Save Page করো।
3. বাকি Markdown files আলাদা Wiki page হিসেবে তৈরি করো; filename অনুযায়ী title দাও।
4. Sidebar ও Footer source-এর content যথাক্রমে Wiki sidebar ও footer page-এ বসাও।

GitHub-এর Wiki workflow: https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages
