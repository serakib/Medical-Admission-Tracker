export default {
  async fetch(request, env, ctx) {
    // CORS Headers (আপনার ওয়েবসাইট থেকে রিকোয়েস্ট অ্যালাউ করার জন্য)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://serakib.github.io", // চাইলে আপনার সাইটের লিংক বসাতে পারেন: "https://serakib.github.io"
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight (OPTIONS) রিকোয়েস্ট হ্যান্ডেল করা
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // শুধু POST রিকোয়েস্ট গ্রহণ করা হবে
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST requests allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { prompt } = await request.json();

      if (!prompt) {
        return new Response(JSON.stringify({ error: "Prompt is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Cloudflare Environment Variable থেকে Gemini API Key নেওয়া
      const apiKey = env.GEMINI_API_KEY;

      if (!apiKey) {
        return new Response(JSON.stringify({ error: "API Key not configured in Worker" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Gemini API-তে রিকোয়েস্ট পাঠানো
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await geminiResponse.json();

      // উত্তরটি আপনার ওয়েবসাইটে ফেরত পাঠানো
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
