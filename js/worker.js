/* Cloudflare Worker backend for Medical Admission Tracker Student Life Support.
 * Configure secrets/variables in Cloudflare Worker settings:
 *   OPENAI_API_KEY (Secret)
 *   ALLOWED_ORIGINS = https://serakib.github.io
 *   OPENAI_MODEL (optional, e.g. gpt-5-mini)
 * This worker accepts POST /chat and POST / for compatibility.
 */
const SYSTEM_INSTRUCTIONS = `You are Student Guide, a practical and caring Bangladeshi student-support assistant. Reply in natural Bangla by default, and understand Banglish. Help with HSC and medical admission study planning, revision, time management, motivation, exam pressure, and career planning. Give specific and realistic next steps rather than generic slogans. Do not invent current admission dates, eligibility rules, results or circular information; direct the student to official notices and say when something needs verification. You are not a doctor, therapist, lawyer or school official. Do not diagnose, prescribe medication, or ask for passwords, phone numbers, exact addresses, roll numbers or sensitive information. If a student appears to be in immediate danger, calmly encourage them to go to a trusted adult now and contact local emergency help. Keep replies readable and supportive.`;

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {})
  });
}
function getCors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const ok = !!origin && allowed.includes(origin);
  return { origin, ok, headers: ok ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  } : {} };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = getCors(request, env);
    if (request.method === 'OPTIONS') {
      if (!cors.ok) return json({ error: 'Origin is not allowed. Configure ALLOWED_ORIGINS.' }, 403);
      return new Response(null, { status: 204, headers: cors.headers });
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'Medical Admission Tracker Student Support', configured: !!env.OPENAI_API_KEY }, 200, cors.ok ? cors.headers : {});
    }
    if (!['/', '/chat'].includes(url.pathname) || request.method !== 'POST') {
      return json({ error: 'Not found. Send POST to /chat.' }, 404, cors.headers);
    }
    if (!cors.ok) return json({ error: 'Origin is not allowed. ALLOWED_ORIGINS should include https://serakib.github.io.' }, 403);
    if (!env.OPENAI_API_KEY) return json({ error: 'Worker is missing the OPENAI_API_KEY secret.' }, 503, cors.headers);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400, cors.headers); }
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 10) {
      return json({ error: 'Send between 1 and 10 messages.' }, 400, cors.headers);
    }
    const messages = [];
    for (const item of body.messages) {
      if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
        return json({ error: 'Invalid message format.' }, 400, cors.headers);
      }
      const content = item.content.trim();
      if (!content || content.length > 3000) return json({ error: 'Each message must contain 1–3000 characters.' }, 400, cors.headers);
      messages.push({ role: item.role, content });
    }
    if (messages[messages.length - 1].role !== 'user') return json({ error: 'The last message must be from the student.' }, 400, cors.headers);
    try {
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-5-mini', instructions: SYSTEM_INSTRUCTIONS, input: messages, max_output_tokens: 800, store: false })
      });
      if (!upstream.ok) return json({ error: upstream.status === 429 ? 'AI usage limit reached. Please try again later.' : 'AI service could not complete the request. Check API account, model and billing settings.' }, 502, cors.headers);
      const data = await upstream.json();
      let reply = '';
      for (const item of (data.output || [])) {
        if (item.type === 'message' && item.role === 'assistant') {
          for (const part of (item.content || [])) if (part.type === 'output_text' && typeof part.text === 'string') reply += part.text;
        }
      }
      if (!reply.trim()) return json({ error: 'AI returned an empty response. Please retry.' }, 502, cors.headers);
      return json({ reply: reply.trim() }, 200, cors.headers);
    } catch (_) {
      return json({ error: 'Could not connect to AI service. Please retry later.' }, 502, cors.headers);
    }
  }
};
