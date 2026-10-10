import { handleAnchorRequest } from './anchor-api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleAnchorRequest(request, env);
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/sw.js') {
      headers.set('Cache-Control', 'no-cache');
    }
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  },
};
