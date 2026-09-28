import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type Provider } from "./types";

export const anthropicProvider: Provider = {
  id: "anthropic",
  async *streamChat(cred, req) {
    const client = new Anthropic({ apiKey: cred.apiKey, baseURL: cred.baseUrl || undefined, maxRetries: 1 });
    try {
      const stream = client.messages.stream(
        {
          model: req.model,
          max_tokens: 16000,
          system: req.system,
          messages: req.messages,
        },
        { signal: req.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        yield "\n\nSorry, I can't help with that. Is there something else I can do for you?";
      }
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw new ProviderError(err.message, err.status);
      throw err;
    }
  },
};
