/**
 * Medical Admission Tracker — Student Support API
 * Cloudflare Worker (Module syntax)
 *
 * Required Worker Secret:
 *   OPENAI_API_KEY
 *
 * Optional Worker Variable:
 *   ALLOWED_ORIGINS = https://serakib.github.io
 *   OPENAI_MODEL = gpt-5-mini
 *
 * Routes:
 *   GET  /health
 *   GET  /chat
 *   POST /chat
 *   POST /
 */

const DEFAULT_ORIGINS = ["https://serakib.github.io"];
const DEFAULT_MODEL = "gpt-5-mini";
const MAX_MESSAGES = 10;
const MAX_CHARS_PER_MESSAGE = 3000;
const MAX_OUTPUT_TOKENS = 800;

const SYSTEM_INSTRUCTIONS = `
You are Student Guide, a practical and caring Bangladeshi student-support assistant.
Reply in natural Bangla by default and understand Banglish.
Help with HSC and medical admission study planning, revision, time management,
motivation, exam pressure, and career planning. Give specific, realistic next steps.
Never invent current admission dates, eligibility rules, results, or circular details.
Recommend official notices when information needs verification.
Do not diagnose or prescribe medication.
Never ask for passwords, phone numbers, exact addresses, roll numbers, or sensitive information.
If a student is in immediate danger, encourage them to contact a trusted adult
and local emergency services.
Keep replies readable, respectful, and supportive.
`.trim();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function getCors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "").trim();
  const allowedOrigins = configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
  const allowed = Boolean(origin) && allowedOrigins.includes(origin);

  const headers = allowed
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      }
    : {};

  return { origin, allowed, headers };
}

function missingSecretResponse(corsHeaders) {
  return json(
    {
      ok: false,
      error: "OPENAI_API_KEY is missing from this Worker environment.",
      hint: "Add OPENAI_API_KEY as a Secret to the exact environment being tested (Production or Preview), then deploy the change.",
    },
    503,
    corsHeaders,
  );
}

function getOutputText(data) {
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type !== "message" || item?.role !== "assistant") continue;
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }
  return parts.join("").trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const cors = getCors(request, env);
    const isChatPath = path === "/" || path === "/chat";
    const isHealthPath = path === "/health";
    const corsHeaders = cors.headers;

    if (method === "OPTIONS") {
      if (!cors.allowed) {
        return json(
          {
            ok: false,
            error: "Origin not allowed. Check ALLOWED_ORIGINS in this environment.",
          },
          403,
        );
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.headers.get("Origin") && !cors.allowed) {
      return json(
        {
          ok: false,
          error: "Origin not allowed. Add the exact website origin to ALLOWED_ORIGINS.",
        },
        403,
      );
    }

    // Health check never returns the Secret itself, only whether it is available.
    if (isHealthPath && method === "GET") {
      const configured = typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.trim().length > 0;
      return json(
        {
          ok: true,
          service: "Medical Admission Tracker Student Support",
          configured,
          model: env.OPENAI_MODEL || DEFAULT_MODEL,
          environmentHint: configured
            ? "OPENAI_API_KEY is available to this Worker version."
            : "OPENAI_API_KEY is not available to this Worker version. Check Production/Preview settings and deploy the configuration.",
        },
        200,
        corsHeaders,
      );
    }

    if (isChatPath && method === "GET") {
      const configured = typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.trim().length > 0;
      return json(
        {
          ok: true,
          service: "Student Guide API",
          message: "API is online. Send a POST request to /chat to use the assistant.",
          chatEndpoint: "/chat",
          configured,
        },
        200,
        corsHeaders,
      );
    }

    if (!isChatPath) {
      return json({ ok: false, error: "Endpoint not found." }, 404, corsHeaders);
    }

    if (method !== "POST") {
      return json(
        { ok: false, error: "Method not allowed. Use POST." },
        405,
        { ...corsHeaders, Allow: "GET, POST, OPTIONS" },
      );
    }

    const apiKey = typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : "";
    if (!apiKey) return missingSecretResponse(corsHeaders);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON request body." }, 400, corsHeaders);
    }

    if (
      !body ||
      !Array.isArray(body.messages) ||
      body.messages.length < 1 ||
      body.messages.length > MAX_MESSAGES
    ) {
      return json(
        { ok: false, error: `Send between 1 and ${MAX_MESSAGES} messages.` },
        400,
        corsHeaders,
      );
    }

    const messages = [];
    for (const item of body.messages) {
      if (
        !item ||
        !["user", "assistant"].includes(item.role) ||
        typeof item.content !== "string"
      ) {
        return json(
          { ok: false, error: "Invalid message format. Each message needs a role and string content." },
          400,
          corsHeaders,
        );
      }

      const content = item.content.trim();
      if (!content || content.length > MAX_CHARS_PER_MESSAGE) {
        return json(
          { ok: false, error: `Each message must contain 1–${MAX_CHARS_PER_MESSAGE} characters.` },
          400,
          corsHeaders,
        );
      }
      messages.push({ role: item.role, content });
    }

    if (messages[messages.length - 1].role !== "user") {
      return json(
        { ok: false, error: "The last message must be from the student." },
        400,
        corsHeaders,
      );
    }

    try {
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || DEFAULT_MODEL,
          instructions: SYSTEM_INSTRUCTIONS,
          input: messages,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
        }),
      });

      const data = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        // Do not log or return the API key. The upstream error message is safe to inspect.
        const upstreamMessage = typeof data?.error?.message === "string"
          ? data.error.message
          : "No detailed error message returned.";
        console.error("OpenAI API error", {
          status: upstream.status,
          type: data?.error?.type || null,
          code: data?.error?.code || null,
          message: upstreamMessage,
        });

        if (upstream.status === 401) {
          return json(
            { ok: false, error: "OpenAI authentication failed. Check that OPENAI_API_KEY is a valid API key." },
            502,
            corsHeaders,
          );
        }
        if (upstream.status === 429) {
          return json(
            { ok: false, error: "OpenAI usage limit or rate limit reached. Check API billing, quota, and usage limits." },
            502,
            corsHeaders,
          );
        }
        if (upstream.status === 400) {
          return json(
            { ok: false, error: `OpenAI rejected the request: ${upstreamMessage}` },
            502,
            corsHeaders,
          );
        }
        return json(
          { ok: false, error: `OpenAI returned HTTP ${upstream.status}. Check the Worker logs for details.` },
          502,
          corsHeaders,
        );
      }

      const reply = getOutputText(data);
      if (!reply) {
        console.error("OpenAI returned no assistant text.");
        return json(
          { ok: false, error: "AI returned an empty response. Please try again." },
          502,
          corsHeaders,
        );
      }

      // student-ai.js expects data.reply to be a string.
      return json({ ok: true, reply }, 200, corsHeaders);
    } catch (error) {
      console.error("Worker request failed:", error instanceof Error ? error.message : String(error));
      return json(
        { ok: false, error: "Could not connect to the AI service. Try again and check Worker logs if it continues." },
        502,
        corsHeaders,
      );
    }
  },
};
