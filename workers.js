export default {
  async fetch(request, env, ctx) {
    // CORS Headers যা GitHub Pages (বা যেকোনো ডোমেইন) থেকে কল এলাউ করবে
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // ১. ব্রাউজারের Preflight (OPTIONS) রিকোয়েস্ট হ্যান্ডেল করা
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // ২. শুধুমাত্র POST রিকোয়েস্ট গ্রহণ করা
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Only POST requests are allowed.' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const { message } = await request.json();

      if (!message) {
        return new Response(
          JSON.stringify({ error: 'Message field is required.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Gemini 1.5 Flash API Call
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

      const systemPrompt = "তুমি শিক্ষার্থীদের দৈনন্দিন জীবনের নানা সমস্যা (যেমন: পড়াশোনার মানসিক চাপ, কেরিয়ার নির্দেশনামূলক বিষয়, সময় ব্যবস্থাপনা) সমাধানে সাহায্যকারী একজন বন্ধুসুলভ এবং অভিজ্ঞ কৃত্রিম বুদ্ধিমত্তা। সহজ ও সুন্দর বাংলায় বাস্তবিক পরামর্শ দাও।";

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nশিক্ষার্থীর সমস্যা: ${message}` }],
            },
          ],
        }),
      });

      const data = await geminiResponse.json();

      // Gemini API response
      const reply =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        'কোনো উত্তর পাওয়া যায়নি, অনুগ্রহ করে আবার চেষ্টা করুন।';

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Internal Server Error: ' + err.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
