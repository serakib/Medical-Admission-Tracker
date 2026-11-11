# 🏆 Points, Ranks & Leaderboards

Platform-এ একাধিক progress metric রয়েছে। এগুলো এক জিনিস নয়।

| Metric | ব্যবহার |
|---|---|
| XP | Learning/profile progression |
| RP | Rank progression ও leaderboard scoring |
| Total RP | Lifetime earned RP |
| PB | আলাদা reward wallet; eligible হলে convert করা যায় |
| Streak | নিয়মিত daily activity tracking |

## RP calculation

Backend submitted correct/wrong count থেকে negative-marking-adjusted score পুনরায় হিসাব করে:

**finalScore = max(0, correct − 0.25 × wrong)**

তারপর RP:

**RP = max(0, round(finalScore × 5))**

একটি attempt ID একবারই reward পায়। Browser-এর পাঠানো XP/RP/PB amount authoritative নয়।

## PB

Backend documentation অনুযায়ী অন্তত 30 প্রশ্নের exam-এ weighted performance অনুযায়ী PB দেওয়া হয়। 40% পর্যন্ত score-এ PB নেই; 40%-এর ওপরে progressive band multiplier ব্যবহার হয়। PB আলাদা wallet-এ থাকে এবং নির্ধারিত সময়ের মধ্যে convert করা যায়।

Exact calculation ও expiry behaviour: [Medical API documentation](https://github.com/serakib/Medical-Admission-Tracker/blob/main/docs/guides/GLOBAL_LEADERBOARD_API.md#rewards-and-rank-progression)।

## Leaderboard periods

- **All Time:** Lifetime Total RP।
- **Weekly:** বর্তমান Saturday–Friday week-এ earned RP, Asia/Dhaka timezone অনুযায়ী।
- **Monthly:** Website-এ available হলে month-based progress।
- **Friends:** Friends list-এর মধ্যে comparison।

Weekly RP reset হলে lifetime Total RP মুছে যায় না। Current RP, weekly RP এবং lifetime Total RP আলাদা করে বুঝতে হবে।

## Rank changes

Rank progression এবং weekly review backend-এ পরিচালিত হয়। Local browser data-কে rank calculation-এর source of truth ধরা হয় না।

## Sync delay

Internet বা API response দেরি হলে cached leaderboard দেখা যেতে পারে। Refresh করে আবার দেখো। Exam reward sync সমস্যা হলে একই attempt বারবার submit না করে Exam History যাচাই করো।
