
/**
 * Medical Admission Tracker — Student Support API
 *
 * Cloudflare Worker secrets:
 *   OPENAI_API_KEY  (Secret, required)
 *
 * Variables:
 *   ALLOWED_ORIGINS (optional, comma-separated)
 *   OPENAI_MODEL    (optional, default: gpt-5-mini)
 *
 * Endpoints:
 *   GET  /health
 *   GET  /chat
 *   POST /chat
 *   POST /
 */

const SYSTEM_INSTRUCTIONS = `
You are Student Guide, a practical and caring Bangladeshi student-support assistant.
Reply in natural Bangla by default and understand Banglish.
Help with HSC and medical admission study planning, revision, time management,
motivation, exam pressure, and career planning.
Give specific, realistic next steps.
Never invent current admission dates, eligibility rules, results, or circular details.
Recommend official notices when information needs verification.
Do not diagnose or prescribe medication.
Never ask for passwords, phone numbers, exact addresses, roll numbers, or sensitive information.
If a student is in immediate danger, encourage them to contact a trusted adult
and local emergency services.
Keep replies readable, respectful, and supportive.
`;

const DEFAULT_ORIGINS = [
  "https://serakib.github.io"
];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function getCors(request, env) {
  const origin = request.headers.get("Origin") || "";

  const configured = String(env.ALLOWED_ORIGINS || "").trim();

  const allowedOrigins = configured
    ? configured.split(",").map(x => x.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;

  const allowed = origin !== "" && allowedOrigins.includes(origin);

  const headers = allowed
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }
    : {};

  return { allowed, headers };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = getCors(request, env);

    const isChatPath = path === "/" || path === "/chat";
    const isHealthPath = path === "/health";

    // Handle CORS preflight.
    if (method === "OPTIONS") {
      if (!cors.allowed) {
        return json({
          ok: false,
          error: "Origin not allowed. Check ALLOWED_ORIGINS."
        }, 403);
      }

      return new Response(null, {
        status: 204,
        headers: cors.headers
      });
    }

    // Health check.
    if (isHealthPath && method === "GET") {
      return json({
        ok: true,
        service: "Medical Admission Tracker Student Support",
        configured: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || "gpt-5-mini"
      }, 200, cors.headers);
    }

    // Browser-friendly status page for the API endpoint.
    if (isChatPath && method === "GET") {
      return json({
        ok: true,
        service: "Student Guide API",
        message: "API is online. Send a POST request to /chat to use the assistant.",
        chatEndpoint: "/chat",
        configured: Boolean(env.OPENAI_API_KEY)
      }, 200, cors.headers);
    }

    if (!isChatPath) {
      return json({
        ok: false,
        error: "Endpoint not found."
      }, 404, cors.headers);
    }

    if (method !== "POST") {
      return json({
        ok: false,
        error: "Method not allowed. Use POST."
      }, 405, {
        ...cors.headers,
        "Allow": "GET, POST, OPTIONS"
      });
    }

    // Browser requests must come from an allowed origin.
    if (request.headers.get("Origin") && !cors.allowed) {
      return json({
        ok: false,
        error: "Origin not allowed. Add your website origin to ALLOWED_ORIGINS."
      }, 403);
    }

    if (!env.OPENAI_API_KEY) {
      return json({
        ok: false,
        error: "OPENAI_API_KEY is missing. Configure it in Worker Secrets."
      }, 503, cors.headers);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "Invalid JSON request body."
      }, 400, cors.headers);
    }

    if (
      !body ||
      !Array.isArray(body.messages) ||
      body.messages.length < 1 ||
      body.messages.length > 10
    ) {
      return json({
        ok: false,
        error: "Send between 1 and 10 messages."
      }, 400, cors.headers);
    }

    const messages = [];

    for (const item of body.messages) {
      if (
        !item ||
        !["user", "assistant"].includes(item.role) ||
        typeof item.content !== "string"
      ) {
        return json({
          ok: false,
          error: "Invalid message format. Each message needs role and content."
        }, 400, cors.headers);
      }

      const content = item.content.trim();

      if (!content || content.length > 3000) {
        return json({
          ok: false,
          error: "Each message must contain 1–3000 characters."
        }, 400, cors.headers);
      }

      messages.push({
        role: item.role,
        content
      });
    }

    if (messages[messages.length - 1].role !== "user") {
      return json({
        ok: false,
        error: "The last message must be from the student."
      }, 400, cors.headers);
    }

    try {
      const upstream = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: env.OPENAI_MODEL || "gpt-5-mini",
            instructions: SYSTEM_INSTRUCTIONS,
            input: messages,
            max_output_tokens: 800,
            store: false
          })
        }
      );

      const data = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        // Diagnostic details appear in Cloudflare Worker logs.
        console.error("OpenAI API error:", upstream.status, data);

        if (upstream.status === 429) {
          return json({
            ok: false,
            error: "AI usage limit reached. Check API quota and billing."
          }, 502, cors.headers);
        }

        if (upstream.status === 401) {
          return json({
            ok: false,
            error: "OpenAI API authentication failed. Check OPENAI_API_KEY."
          }, 502, cors.headers);
        }

        if (upstream.status === 400) {
          return json({
            ok: false,
            error: "OpenAI rejected the request. Check the model and request settings."
          }, 502, cors.headers);
        }

        return json({
          ok: false,
          error: "OpenAI service error. Check Worker logs for details."
        }, 502, cors.headers);
      }

      let reply = "";

      for (const item of data.output || []) {
        if (item.type !== "message" || item.role !== "assistant") {
          continue;
        }

        for (const part of item.content || []) {
          if (
            part.type === "output_text" &&
            typeof part.text === "string"
          ) {
            reply += part.text;
          }
        }
      }

      if (!reply.trim()) {
        console.error("OpenAI returned no assistant text.");

        return json({
          ok: false,
          error: "AI returned an empty response. Please try again."
        }, 502, cors.headers);
      }

      return json({
        ok: true,
        reply: reply.trim()
      }, 200, cors.headers);

    } catch (error) {
      console.error("Worker request failed:", error);

      return json({
        ok: false,
        error: "Could not connect to the AI service. Check Worker logs."
      }, 502, cors.headers);
    }
  }
};
