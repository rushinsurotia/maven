import crypto from "node:crypto";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// Groq's catalogue changes often, so "auto" asks the account which models it
// can use and picks the first match from this preference list (general-purpose
// chat models first, small fast ones last).
const PREFERRED = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct", "qwen/qwen3-32b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
const NOT_CHAT = /whisper|tts|guard|embed|playai|orpheus|prompt-guard|compound/i;

const cache = new Map<string, { model: string; expires: number }>();

export async function resolveGroqModel(model: string | undefined, apiKey: string | undefined, baseUrl = GROQ_BASE_URL): Promise<string> {
  if (model && model !== "auto") return model;
  const cacheKey = crypto.createHash("sha256").update(`${baseUrl}|${apiKey}`).digest("hex");
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.model;

  let picked = PREFERRED[0];
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
      picked = PREFERRED.find((p) => ids.includes(p)) ?? ids.find((id) => !NOT_CHAT.test(id)) ?? picked;
    }
  } catch {
    /* fall back to the first preference; the chat call reports real errors */
  }
  cache.set(cacheKey, { model: picked, expires: Date.now() + 3600_000 });
  return picked;
}
