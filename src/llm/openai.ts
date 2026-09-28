import OpenAI from "openai";
import { ProviderError, type Provider } from "./types";

function make(id: "openai" | "openai_compatible"): Provider {
  return {
    id,
    async *streamChat(cred, req) {
      const client = new OpenAI({
        // Local servers such as Ollama accept any key.
        apiKey: cred.apiKey || "not-needed",
        baseURL: cred.baseUrl || undefined,
        maxRetries: 1,
      });
      try {
        const stream = await client.chat.completions.create(
          {
            model: req.model,
            stream: true,
            messages: [{ role: "system", content: req.system }, ...req.messages],
            // OpenAI's own API uses max_completion_tokens; many compatible
            // servers only understand the older max_tokens.
            ...(id === "openai" ? { max_completion_tokens: 16000 } : { max_tokens: 4096 }),
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
export const openaiCompatibleProvider = make("openai_compatible");
