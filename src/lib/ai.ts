import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";
import { TCHOUMI_SYSTEM_PROMPT } from "./systemPrompt";

export function formatFriendlyErrorMessage(rawError: any): string {
  let msg = typeof rawError === "string" ? rawError : rawError?.message || JSON.stringify(rawError);
  
  // Recursively unwrap JSON errors if nested
  for (let i = 0; i < 3; i++) {
    if (msg.includes('{"error"') || msg.includes('"code":') || (msg.trim().startsWith('{') && msg.trim().endsWith('}'))) {
      try {
        const match = msg.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed?.error?.message) {
            msg = parsed.error.message;
          } else if (parsed?.message) {
            msg = parsed.message;
          }
        }
      } catch {
        break;
      }
    }
  }

  if (msg.includes("503") || msg.includes("overloaded") || msg.includes("high traffic") || msg.includes("Service Unavailable")) {
    return "Les serveurs Gemini de Google connaissent actuellement un pic de trafic temporaire (erreur 503). Cliquez sur 'Réessayer' ci-dessous pour relancer la réponse instantanément.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("Quota exceeded")) {
    return "Limite de requêtes atteinte temporairement sur l'API (quota gratuit). Veuillez patienter quelques secondes puis cliquer sur 'Réessayer'.";
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid") || msg.includes("forbidden") || msg.includes("403")) {
    return "Clé d'API Gemini invalide ou non autorisée. Vérifiez que la clé commence par AIzaSy... et est bien enregistrée dans les paramètres.";
  }
  return msg;
}

export async function callGeminiStream(
  messages: Message[],
  apiKey: string,
  modelName: string = "gemini-2.5-flash",
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  customInstructions?: string
): Promise<string> {
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // Collect all potential API keys (from explicit param, build-time env, import.meta.env)
  const candidateKeys = [
    apiKey,
    (import.meta as any).env?.VITE_GEMINI_API_KEY,
    (import.meta as any).env?.GEMINI_API_KEY,
    typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "",
    typeof process !== "undefined" ? process.env.VITE_GEMINI_API_KEY : "",
  ]
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .map(k => k.trim())
    .filter((k, i, arr) => arr.indexOf(k) === i);

  if (candidateKeys.length === 0) {
    throw new Error("Clé API Gemini introuvable. Veuillez renseigner votre clé API dans les paramètres ou dans le fichier .env (GEMINI_API_KEY=AIzaSy...).");
  }

  // Clean and sanitize requested model name
  let targetModel = "gemini-2.5-flash";
  if (
    modelName &&
    !modelName.includes("2.0") &&
    !modelName.includes("1.5") &&
    !modelName.includes("2.5-pro") &&
    !modelName.includes("3.0")
  ) {
    targetModel = modelName;
  }

  // Fallback models in priority order (ultra-reliable, active and lightweight models)
  const fallbackModels = [
    targetModel,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  // Keep last 16 conversation messages to keep tokens lightweight, ultra-fast and prevent quota exhaustion (429)
  const recentMessages = messages.length > 16 ? messages.slice(-16) : messages;

  const contents = recentMessages.map(m => {
    const parts: any[] = [];
    if (m.attachments && m.attachments.length > 0) {
      for (const att of m.attachments) {
        const rawBase64 = att.base64 || (att.dataUrl && att.dataUrl.includes(',') ? att.dataUrl.split(',')[1] : undefined);
        const mime = att.mimeType || att.type || 'image/jpeg';
        if (rawBase64 && mime.startsWith('image/')) {
          parts.push({
            inlineData: {
              data: rawBase64,
              mimeType: mime
            }
          });
        }
      }
    }

    if (m.content && m.content.trim()) {
      parts.push({ text: m.content });
    } else if (parts.length === 0) {
      parts.push({ text: " " });
    }

    return {
      role: m.role === 'user' ? 'user' : 'model',
      parts
    };
  });

  const instruction = customInstructions
    ? `${TCHOUMI_SYSTEM_PROMPT}\n\nInstructions supplémentaires de l'utilisateur:\n${customInstructions}`
    : TCHOUMI_SYSTEM_PROMPT;

  let lastClientError: any = null;

  for (const currentKey of candidateKeys) {
    for (const currentModel of fallbackModels) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal?.aborted) {
          throw new Error("Generation aborted");
        }

        try {
          if (attempt > 0) {
            // Exponential backoff for 503 or temporary network hiccups
            await sleep(500 * Math.pow(2, attempt));
          }

          // 1. Try GoogleGenAI SDK Stream
          try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const response = await ai.models.generateContentStream({
              model: currentModel,
              contents: contents as any,
              config: {
                systemInstruction: instruction,
                temperature: 0.7,
              }
            });
            
            let fullText = "";
            for await (const chunk of response) {
              if (signal?.aborted) {
                throw new Error("Generation aborted");
              }
              const chunkText = chunk.text || "";
              fullText += chunkText;
              onChunk(fullText);
            }
            
            if (fullText.trim()) {
              return fullText;
            }
          } catch (sdkErr: any) {
            if (sdkErr.message === "Generation aborted" || signal?.aborted) {
              throw new Error("Generation aborted");
            }
            
            // Check if 503 or 429 to retry
            const sdkErrStr = String(sdkErr?.message || sdkErr);
            if ((sdkErrStr.includes("503") || sdkErrStr.includes("overloaded")) && attempt < 2) {
              continue; // Retry with next attempt in backoff
            }

            // Fallback directly to Google REST endpoint
            const restHeaders: Record<string, string> = {
              "Content-Type": "application/json",
            };

            if (currentKey.startsWith("AQ.") || currentKey.startsWith("ya29.")) {
              restHeaders["Authorization"] = `Bearer ${currentKey}`;
              restHeaders["x-goog-api-key"] = currentKey;
            } else {
              restHeaders["x-goog-api-key"] = currentKey;
            }

            const restUrl = currentKey.startsWith("AQ.") || currentKey.startsWith("ya29.")
              ? `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`
              : `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(currentKey)}`;

            const restRes = await fetch(restUrl, {
              method: "POST",
              headers: restHeaders,
              body: JSON.stringify({
                system_instruction: {
                  parts: [{ text: instruction }]
                },
                contents,
                generationConfig: {
                  temperature: 0.7
                }
              }),
              signal
            });

            if (!restRes.ok) {
              const errBody = await restRes.text();
              throw new Error(errBody || `HTTP ${restRes.status}`);
            }

            const restData = await restRes.json();
            const textResponse = restData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
            if (textResponse.trim()) {
              onChunk(textResponse);
              return textResponse;
            }
          }
        } catch (error: any) {
          if (error.message === "Generation aborted" || signal?.aborted) {
            throw new Error("Generation aborted");
          }
          lastClientError = error;
          console.warn(`[Tchoumi AI] Modèle ${currentModel} (tentative ${attempt + 1}):`, error?.message || error);
          
          const errStr = String(error?.message || error);
          // If 429 quota or 503 overload on this attempt, retry or switch model
          if (errStr.includes("503") || errStr.includes("overloaded")) {
            if (attempt < 2) {
              continue; // try again with backoff
            } else {
              break; // switch to next lighter fallback model
            }
          }
          if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
            break; // Try next fallback model
          }
        }
      }
    }
  }

  throw new Error(formatFriendlyErrorMessage(lastClientError));
}

export async function generateImage(
  prompt: string,
  apiKey?: string
): Promise<string> {
  let cleanPrompt = prompt
    .replace(/^.*?(peux-tu\s+|pouvez-vous\s+|veuillez\s+|s'il te plaît\s+|stp\s+)?(génère|genere|générer|generer|crée|cree|créer|creer|dessine|dessiner|peins|peindre|illustre|illustrer|fais|faire|produis|produire|affiche|afficher|generate|draw|create|make|render)\s*(moi|nous|me|us)?\s*(une?\s+image|un\s+visuel|une\s+illustration|une?\s+photo|un\s+dessin|un\s+portrait|un\s+tableau|un\s+rendu|an\s+image|a\s+picture|a\s+photo|an\s+illustration)?\s*(de|d'|du|des|d'un|d'une|pour|sur|avec|about|of|showing)?\s*/i, '')
    .trim();

  if (!cleanPrompt || cleanPrompt.length < 2) {
    cleanPrompt = prompt;
  }

  if (prompt.includes('"action"') && prompt.includes('"action_input"')) {
    try {
      const parsed = JSON.parse(prompt);
      if (parsed.action_input) {
        if (typeof parsed.action_input === 'string') {
          try {
            const inner = JSON.parse(parsed.action_input);
            if (inner.prompt) cleanPrompt = inner.prompt;
          } catch {
            cleanPrompt = parsed.action_input;
          }
        } else if (parsed.action_input.prompt) {
          cleanPrompt = parsed.action_input.prompt;
        }
      }
    } catch {
      // ignore
    }
  }

  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&seed=${seed}`;
}
