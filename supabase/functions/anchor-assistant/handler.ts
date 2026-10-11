import {
  GEMINI_SYSTEM_INSTRUCTION,
  geminiPrompt,
  normalizeGeminiResponse,
  parseAssistantRequest,
  sourceGuidance,
  sourcesForRequest,
} from './program-policy.ts';

export interface AssistantConfiguration {
  supabaseUrl: string;
  authPublicKey: string;
  geminiKey?: string;
  model?: string;
  allowedOrigins?: string[];
}
type Fetcher = typeof fetch;
const DEFAULT_ORIGIN = 'https://jaivardhansamadhiya.github.io';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const REQUEST_BYTES = 4096;
const RESPONSE_BYTES = 64 * 1024;

// Bound streams, including chunked requests without Content-Length. Return
// no request body or provider error text to logs or clients.
async function boundedText(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
): Promise<string> {
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new Error('size_limit');
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

const parsedJson = async (
  response: Response,
  maximum = RESPONSE_BYTES,
): Promise<Record<string, unknown>> => {
  const result: unknown = JSON.parse(await boundedText(response.body, maximum));
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('invalid_response');
  return result as Record<string, unknown>;
};

/** Factory keeps transport testable without the Deno runtime or any real key. */
export function createAssistantHandler(
  configuration: AssistantConfiguration,
  send: Fetcher = fetch,
) {
  const origins = new Set(configuration.allowedOrigins || [DEFAULT_ORIGIN]);
  const model = /^gemini-[a-z0-9.-]+$/.test(configuration.model || '')
    ? configuration.model!
    : DEFAULT_MODEL;
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const cors: Record<string, string> = {
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-max-age': '600',
      vary: 'Origin',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    };
    if (origin && origins.has(origin)) cors['access-control-allow-origin'] = origin;
    const respond = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, ...extra, 'content-type': 'application/json; charset=utf-8' },
      });
    if (origin && !origins.has(origin)) return respond(403, { error: 'origin_not_allowed' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST')
      return respond(405, { error: 'method_not_allowed' }, { allow: 'POST, OPTIONS' });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || ''))
      return respond(415, { error: 'json_required' });
    const length = Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > REQUEST_BYTES)
      return respond(413, { error: 'request_too_large' });

    let input;
    try {
      input = parseAssistantRequest(JSON.parse(await boundedText(request.body, REQUEST_BYTES)));
    } catch (error) {
      return respond(error instanceof Error && error.message === 'size_limit' ? 413 : 400, {
        error: 'invalid_public_topic',
      });
    }
    if (!input)
      return respond(400, {
        error: 'invalid_public_topic',
        message:
          'Only public program topics are accepted. Do not send personal questions, notice contents, files, or account details.',
      });
    const authorization = request.headers.get('authorization') || '';
    if (
      authorization.length > 4096 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)
    )
      return respond(401, { error: 'sign_in_required' });
    let base: URL;
    try {
      base = new URL(configuration.supabaseUrl);
      if (base.protocol !== 'https:' || !configuration.authPublicKey)
        throw new Error('not_configured');
    } catch {
      return respond(503, { error: 'service_not_configured' });
    }
    const authHeaders = {
      authorization,
      apikey: configuration.authPublicKey,
      'content-type': 'application/json',
    };
    try {
      // The gateway can run with verify_jwt=false for modern signing keys;
      // Supabase Auth independently verifies the exact caller token here.
      const auth = await send(new URL('/auth/v1/user', base), {
        headers: authHeaders,
        signal: AbortSignal.timeout(7000),
      });
      if (!auth.ok) return respond(401, { error: 'sign_in_required' });
      const user = await parsedJson(auth, 16 * 1024);
      if (
        typeof user.id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(user.id) ||
        user.is_anonymous === true
      )
        return respond(401, { error: 'sign_in_required' });
    } catch {
      return respond(503, { error: 'authentication_unavailable' });
    }

    // Missing Gemini configuration is explicit. Local source guidance still
    // works and is never labeled as a model-generated response.
    if (!configuration.geminiKey)
      return respond(
        200,
        sourceGuidance(
          input,
          'Anchor AI is not configured. This answer uses the saved official-source guide.',
        ),
      );
    try {
      const quota = await send(new URL('/rest/v1/rpc/anchor_assistant_consume_quota', base), {
        method: 'POST',
        headers: authHeaders,
        body: '{}',
        signal: AbortSignal.timeout(7000),
      });
      if (!quota.ok) return respond(503, { error: 'quota_unavailable' });
      const allowance = await parsedJson(quota, 4096);
      if (allowance.allowed !== true) {
        const retry = Math.min(3600, Math.max(1, Number(allowance.retryAfterSeconds) || 60));
        return respond(
          429,
          { error: 'assistant_rate_limit', retryAfterSeconds: retry },
          { 'retry-after': String(retry) },
        );
      }
    } catch {
      return respond(503, { error: 'quota_unavailable' });
    }

    try {
      const sourceIds = sourcesForRequest(input).map((item) => item.id);
      const generated = await send(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          // Header authentication supports current standard and AQ auth keys.
          // The key never appears in a URL, browser asset, or response.
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': configuration.geminiKey,
          },
          signal: AbortSignal.timeout(22000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }] },
            contents: [{ role: 'user', parts: [{ text: geminiPrompt(input) }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1400,
              responseMimeType: 'application/json',
              responseJsonSchema: {
                type: 'object',
                properties: {
                  answer: { type: 'string' },
                  citationIds: {
                    type: 'array',
                    items: { type: 'string', ...(sourceIds.length ? { enum: sourceIds } : {}) },
                  },
                  navigationPage: {
                    type: 'string',
                    enum: ['overview', 'notices', 'plan', 'calendar', 'support', 'forms'],
                  },
                },
                required: ['answer', 'citationIds', 'navigationPage'],
                additionalProperties: false,
              },
            },
          }),
        },
      );
      if (!generated.ok)
        return respond(
          200,
          sourceGuidance(
            input,
            'Anchor AI is temporarily unavailable. This answer uses the saved official-source guide.',
          ),
        );
      const payload = await parsedJson(generated);
      const candidates = payload.candidates;
      if (!Array.isArray(candidates) || candidates.length !== 1) throw new Error('no_answer');
      const candidate = candidates[0] as {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
      };
      if (candidate.finishReason !== 'STOP') throw new Error('incomplete_answer');
      const parts = candidate.content?.parts;
      const text = Array.isArray(parts)
        ? parts
            .filter((part) => typeof part.text === 'string' && !part.thought)
            .map((part) => part.text)
            .join('')
        : '';
      const answer = normalizeGeminiResponse(JSON.parse(text), input);
      if (!answer) throw new Error('invalid_answer');
      return respond(200, answer);
    } catch {
      return respond(
        200,
        sourceGuidance(
          input,
          'Anchor AI could not provide a checked response. This answer uses the saved official-source guide.',
        ),
      );
    }
  };
}
