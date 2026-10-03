import OpenAI from "openai";
import { GROQ_BASE_URL, resolveGroqModel } from "./groq-models";
import { ProviderError, type Provider } from "./types";

function make(id: "openai" | "groq" | "openai_compatible"): Provider {
  return {
    id,
    async *streamChat(cred, req) {
      const baseURL = cred.baseUrl || (id === "groq" ? GROQ_BASE_URL : undefined);
      const client = new OpenAI({
        // Local servers such as Ollama accept any key.
        apiKey: cred.apiKey || "not-needed",
        baseURL,
        maxRetries: 1,
      });
      const model = id === "groq" ? await resolveGroqModel(req.model, cred.apiKey, baseURL) : req.model;
      try {
        const stream = await client.chat.completions.create(
          {
            model,
            stream: true,
            messages: [{ role: "system", content: req.system }, ...req.messages],
            // OpenAI and Groq use max_completion_tokens; many compatible
            // servers only understand the older max_tokens.
            ...(id === "openai_compatible" ? { max_tokens: 4096 } : { max_completion_tokens: id === "groq" ? 8192 : 16000 }),
          },
          { signal: req.signal },
        );
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) yield text;
        }
      } catch (err) {
        if (err instanceof OpenAI.APIError) throw new ProviderError(err.message, err.status);
        throw err;
      }
    },
  };
}

export const openaiProvider = make("openai");
export const groqProvider = make("groq");
export const openaiCompatibleProvider = make("openai_compatible");
