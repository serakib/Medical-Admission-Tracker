# 🧪 Exam Modes & Scoring

## Available exam modes

### 🎲 Random Mixed Test
বিভিন্ন Subject থেকে random প্রশ্ন নিয়ে practice করা যায়। available setting অনুযায়ী subject নির্বাচনও করা যায়।

### 📋 Full Model Test
Medical Admission পরীক্ষার আদলে timed model test।

### 📅 Previous Year Questions
বিগত বছরের available প্রশ্ন Year অনুযায়ী পড়া বা quiz হিসেবে solve করা যায়।

### ✏️ Practice Exam
নিজের প্রয়োজন অনুযায়ী available exam type ও question count নির্বাচন করে practice।

### 🧠 Practice Lab
Timed exam-এর বাইরে নিজের গতিতে প্রশ্ন solve ও answer review করার জায়গা।

## Website-এ প্রদর্শিত scoring

| Response | Marks |
|---|---:|
| Correct | +1.00 |
| Wrong | −0.25 |
| Unanswered | 0.00 |

Backend-এর score calculation-এ negative-marking-adjusted final score ব্যবহৃত হয়:

**finalScore = max(0, correct − 0.25 × wrong)**

Committed exam attempt থেকে backend RP হিসাব করে। Browser থেকে পাঠানো reward amount-কে authoritative হিসেবে ধরা হয় না।

## Website-এ প্রদর্শিত subject distribution

| Subject | Marks |
|---|---:|
| Biology | 30 |
| Chemistry | 25 |
| Physics | 20 |
| English | 15 |
| General Knowledge | 10 |
| **Total** | **100** |

Website guideline-এ 100 MCQ, 60 minutes এবং passing score 40-ও প্রদর্শিত আছে।

> **খুব গুরুত্বপূর্ণ:** এগুলো website-এ প্রদর্শিত guideline। Admission authority-এর নিয়ম, marks distribution, exam duration ও passing criteria শিক্ষাবর্ষ অনুযায়ী পরিবর্তিত হতে পারে। পরীক্ষার আগে সর্বশেষ official circular যাচাই করবে।

## Result review
1. Total score ও percentage দেখো।
2. Correct, wrong এবং unanswered count মিলিয়ে দেখো।
3. ভুল প্রশ্ন ও explanation review করো।
4. যে Subject-এ দুর্বলতা আছে, সেই Subject-এর practice করো।

Submit সমস্যা হলে একই exam বারবার submit কোরো না। আগে Result, Profile ও Exam History refresh করে দেখো। সমস্যা থাকলে [Bug Report](https://github.com/serakib/Medical-Admission-Tracker/issues/new?template=bug_report.yml) জমা দাও।
