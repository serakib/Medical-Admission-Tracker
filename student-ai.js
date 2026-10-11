```javascript
const STUDENT_AI_API = "medical-admission-tracker.asrafuldcg.workers.dev/chat";

async function askStudentAI(messages) {
  try {
    const response = await fetch(STUDENT_AI_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: messages
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.reply) {
      throw new Error("AI response পাওয়া যায়নি");
    }

    return data.reply;
  } catch (error) {
    console.error("Student AI error:", error);
    throw new Error(
      "AI এখন কাজ করছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।"
    );
  }
}
```
