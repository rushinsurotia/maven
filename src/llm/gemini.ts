import { GoogleGenAI } from "@google/genai";
import { ProviderError, type Provider } from "./types";

export const geminiProvider: Provider = {
  id: "gemini",
  async *streamChat(cred, req) {
    const ai = new GoogleGenAI({ apiKey: cred.apiKey });
    try {
      const stream = await ai.models.generateContentStream({
        model: req.model,
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        config: { systemInstruction: req.system, abortSignal: req.signal },
      });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    } catch (err) {
      const status = typeof (err as { status?: unknown }).status === "number" ? (err as { status: number }).status : undefined;
      throw new ProviderError(err instanceof Error ? err.message : String(err), status);
    }
  },
};
