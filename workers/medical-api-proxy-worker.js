/**
 * Medical Admission Tracker API proxy.
 * Deploy as a NEW Cloudflare Worker. Do not replace the Student Support/AI Worker.
 * Google Apps Script + Sheets remains the data backend.
 */
const GAS_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbycNshXdkJCyqGIJfN4iEZOe1nDv-RQh9n9r7iKuTUiroJu_ey6enWt2X1ILlEgrtreuQ/exec';
const ALLOWED_ORIGINS = new Set(['https://serakib.github.io']);
const MAX_BODY_BYTES = 100 * 1024;
const ALLOWED_ACTIONS = new Set([
  'health', 'createGuest', 'guestCreate', 'registerUser', 'signup', 'login',
  'profile', 'getProfile', 'updateProfile', 'saveProfile',
  'leaderboard', 'getLeaderboard', 'submitExam', 'recordExam', 'gameEnd'
]);

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ success:false, error:'Origin not allowed.' }, 403, '');
    const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
    if (request.method === 'OPTIONS') {
      if (!allowOrigin) return jsonResponse({ success:false, error:'Origin not allowed.' }, 403, '');
      return new Response(null, { status:204, headers:corsHeaders(allowOrigin) });
    }

    const url = new URL(request.url);
    if (request.method === 'GET') {
      const action = url.pathname.endsWith('/health') ? 'health' : (url.searchParams.get('action') || 'health');
      if (!['health','leaderboard','getLeaderboard'].includes(action)) {
        return jsonResponse({ success:false, error:'GET action not allowed.' }, 400, allowOrigin);
      }
      const upstream = new URL(GAS_BACKEND_URL);
      upstream.searchParams.set('action', action);
      if (action !== 'health') upstream.searchParams.set('period', url.searchParams.get('period') === 'weekly' ? 'weekly' : 'all-time');
      return forward(upstream.toString(), { method:'GET', headers:{ Accept:'application/json' } }, allowOrigin, action === 'health');
    }
    if (request.method !== 'POST') return jsonResponse({ success:false, error:'Use GET or POST.' }, 405, allowOrigin);

    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) return jsonResponse({ success:false, error:'Request body is too large.' }, 413, allowOrigin);
    let bodyText = '';
    let payload = {};
    try {
      bodyText = await request.text();
      if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) return jsonResponse({ success:false, error:'Request body is too large.' }, 413, allowOrigin);
      payload = JSON.parse(bodyText || '{}');
    } catch (_) {
      return jsonResponse({ success:false, error:'Request body must be valid JSON.' }, 400, allowOrigin);
    }
    const action = String(payload && payload.action || '').trim();
    if (!ALLOWED_ACTIONS.has(action)) return jsonResponse({ success:false, error:'Action not allowed.' }, 400, allowOrigin);
    // Never retry Guest creation after an ambiguous response; it may already have created a row.
    return forward(GAS_BACKEND_URL, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8', Accept:'application/json,text/plain,*/*' },
      body:bodyText
    }, allowOrigin, action === 'createGuest' || action === 'guestCreate');
  }
};

async function forward(url, init, origin, noRetry) {
  const attempts = noRetry ? 1 : 2;
  let lastError = 'Apps Script returned a non-JSON response.';
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, redirect:'follow' });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch (_) {
        lastError = 'Apps Script did not return JSON (HTTP ' + response.status + ').';
        if (attempt + 1 < attempts) continue;
        return jsonResponse({ success:false, error:lastError, retryable:true }, 502, origin);
      }
      if (!response.ok) {
        lastError = 'Apps Script returned HTTP ' + response.status + '.';
        if (attempt + 1 < attempts) continue;
        return jsonResponse({ success:false, error:lastError, retryable:true }, 502, origin);
      }
      return jsonResponse(data, 200, origin);
    } catch (error) {
      lastError = String(error && error.message || error || 'Network error');
      if (attempt + 1 < attempts) continue;
      return jsonResponse({ success:false, error:'Apps Script connection failed: ' + lastError, retryable:true }, 502, origin);
    }
  }
  return jsonResponse({ success:false, error:lastError, retryable:true }, 502, origin);
}

function corsHeaders(origin) {
  const headers = new Headers({
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Max-Age':'86400',
    'Cache-Control':'no-store',
    'Vary':'Origin'
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(value, status, origin) {
  const headers = corsHeaders(origin || '');
  headers.set('Content-Type','application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}
