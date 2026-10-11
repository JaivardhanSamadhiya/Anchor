import { createAssistantHandler } from './handler.ts';

// Supabase injects the Auth URL/key. GEMINI_API_KEY is an Edge Function secret,
// never a PUBLIC_* build setting or a source-controlled configuration value.
Deno.serve(
  createAssistantHandler({
    supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
    authPublicKey:
      Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '',
    geminiKey: Deno.env.get('GEMINI_API_KEY'),
    model: Deno.env.get('GEMINI_MODEL'),
    allowedOrigins: Deno.env
      .get('ANCHOR_ALLOWED_ORIGINS')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  }),
);
