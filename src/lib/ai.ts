import { Message } from "../types";

export function formatFriendlyErrorMessage(rawError: unknown): string {
  let msg =
    typeof rawError === "string"
      ? rawError
      : rawError instanceof Error
        ? rawError.message
        : JSON.stringify(rawError);

  // Recursively unwrap JSON errors if nested
  for (let i = 0; i < 3; i++) {
    if (
      msg.includes('{"error"') ||
      msg.includes('"code":') ||
      (msg.trim().startsWith("{") && msg.trim().endsWith("}"))
    ) {
      try {
        const match = msg.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed?.error?.message) {
            msg = parsed.error.message;
          } else if (typeof parsed?.error === "string") {
            msg = parsed.error;
          } else if (parsed?.message) {
            msg = parsed.message;
          }
        }
      } catch {
        break;
      }
    }
  }

  if (
    msg.startsWith("Votre clé API Gemini") ||
    msg.startsWith("Cette clé API Gemini") ||
    msg.startsWith("La clé API Gemini") ||
    msg.startsWith("Accès refusé par l'API Gemini") ||
    msg.startsWith("Clé API Gemini non configurée") ||
    msg.startsWith("Le modèle Gemini") ||
    msg.startsWith("Limite de requêtes") ||
    msg.startsWith("Le service d'image") ||
    msg.startsWith("Le générateur d'images") ||
    msg.startsWith("Impossible de générer") ||
    msg.startsWith("Délai dépassé lors de la génération")
  ) {
    return msg;
  }

  if (
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("high traffic") ||
    msg.includes("Service Unavailable")
  ) {
    return "Les serveurs Gemini de Google connaissent actuellement un pic de trafic temporaire (erreur 503). Cliquez sur 'Réessayer' ci-dessous pour relancer la réponse instantanément.";
  }
  if (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota") ||
    msg.includes("Quota exceeded")
  ) {
    return "Limite de requêtes atteinte temporairement sur l'API (quota). Veuillez patienter quelques secondes puis cliquer sur 'Réessayer'.";
  }
  if (
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API key not valid") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("403")
  ) {
    return "Accès refusé par l'API Gemini : vérifiez que GEMINI_API_KEY dans votre .env ou Settings > Secrets est valide et sans restriction HTTP Referrer.";
  }
  if (
    msg.includes("no longer available") ||
    msg.includes("NOT_FOUND") ||
    msg.includes("404")
  ) {
    return "Le modèle demandé est en cours de mise à jour. Veuillez réessayer.";
  }
  return msg;
}

export interface GeminiStreamResult {
  text: string;
  thoughts: string;
}

export async function callGeminiStream(
  messages: Message[],
  modelName: string = "gemini-4-hydrogen",
  onChunk: (text: string, thoughts?: string) => void,
  signal?: AbortSignal,
  customInstructions?: string
): Promise<GeminiStreamResult> {
  // Keep last 16 conversation messages to keep payload lightweight, fast and consistent
  const recentMessages = messages.length > 16 ? messages.slice(-16) : messages;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: recentMessages,
      model: modelName,
      customInstructions,
    }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = `Erreur serveur (${response.status})`;
    try {
      const errData = await response.json();
      if (errData?.error) {
        errorMessage = errData.error;
      }
    } catch {
      try {
        const errText = await response.text();
        if (errText) errorMessage = errText;
      } catch {
        // ignore
      }
    }
    throw new Error(formatFriendlyErrorMessage(errorMessage));
  }

  if (!response.body) {
    throw new Error("Flux de réponse indisponible depuis le serveur.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sseAccumulated = "";
  let thoughtsAccumulated = "";

  const processEventBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      let parsed: { text?: string; thought?: string; error?: string } | null = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // ignore incomplete/malformed non-JSON chunks
      }

      if (parsed?.error) {
        throw new Error(parsed.error);
      }
      if (parsed?.thought) {
        thoughtsAccumulated += parsed.thought;
        onChunk(sseAccumulated, thoughtsAccumulated);
      }
      if (parsed?.text) {
        sseAccumulated += parsed.text;
        onChunk(sseAccumulated, thoughtsAccumulated);
      }
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error("Generation aborted");
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        processEventBlock(block);
      }
    }

    if (buffer.trim()) {
      processEventBlock(buffer);
    }
  } catch (err: unknown) {
    if (
      signal?.aborted ||
      (err instanceof Error &&
        (err.name === "AbortError" || err.message === "Generation aborted"))
    ) {
      throw new Error("Generation aborted");
    }
    throw new Error(formatFriendlyErrorMessage(err));
  }

  if (!sseAccumulated.trim()) {
    throw new Error("Aucune réponse reçue du modèle.");
  }

  return { text: sseAccumulated, thoughts: thoughtsAccumulated };
}

export interface GenerateImageOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions
): Promise<string> {
  if (options?.signal?.aborted) {
    throw new Error("Generation aborted");
  }

  let cleanPrompt = prompt
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^\/(image|imagine)\s*/i, "")
    .replace(
      /^.*?(peux-tu\s+|pouvez-vous\s+|veuillez\s+|s'il te plaît\s+|stp\s+|je veux\s+|j'aimerais\s+)?(me\s+|nous\s+)?(g[eéèê]n[eéèê]re|g[eéèê]n[eéèê]rer|cr[eéèê]e|cr[eéèê]er|dessine|dessiner|peins|peindre|illustre|illustrer|fais|faire|fait|produis|produire|r[eé]alise|realiser|affiche|afficher|montre|montrer|donne|donner|imagine|imaginer|generate|draw|paint|create|make|render|design|show)\s*(-moi|-nous|moi|nous|me|us)?\s*(une?\s+image|un\s+visuel|une\s+illustration|une?\s+photo|un\s+dessin|un\s+portrait|un\s+tableau(?:\s+d'art)?|une\s+peinture|un\s+rendu|un\s+logo|une\s+affiche|un\s+poster|une\s+banni[eè]re|un\s+fond\s+d'écran|un\s+wallpaper|an\s+image|a\s+picture|a\s+photo|an\s+illustration|an\s+artwork|a\s+logo)?\s*(de|d'|du|des|d'un|d'une|pour|sur|avec|about|of|showing)?\s*/i,
      ""
    )
    .trim();

  if (!cleanPrompt || cleanPrompt.length < 2) {
    cleanPrompt = prompt.trim();
  }

  if (prompt.includes('"action"') && prompt.includes('"action_input"')) {
    try {
      const parsed = JSON.parse(prompt);
      if (parsed.action_input) {
        if (typeof parsed.action_input === "string") {
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
  const imageUrl = `/api/image/render?prompt=${encodedPrompt}&seed=${seed}`;

  const onProgress = options?.onProgress;
  let currentPct = 4;
  onProgress?.(currentPct);

  const startedAt = Date.now();
  const progressTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const simulated = Math.min(95, Math.max(4, Math.round(96 * (1 - Math.exp(-elapsed / 4200)))));
    if (simulated > currentPct) {
      currentPct = simulated;
      onProgress?.(currentPct);
    }
  }, 160);

  try {
    const response = await fetch(imageUrl, {
      signal: options?.signal,
    });

    if (!response.ok) {
      let errMsg = `Le générateur d'images a répondu avec l'erreur ${response.status}.`;
      try {
        const errData = await response.json();
        if (errData?.error) {
          errMsg = String(errData.error);
        }
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(errMsg);
    }

    const contentLengthHeader = response.headers.get("content-length");
    const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;

    if (response.body && totalBytes > 0) {
      const reader = response.body.getReader();
      let receivedBytes = 0;
      while (true) {
        if (options?.signal?.aborted) {
          throw new Error("Generation aborted");
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.byteLength;
          const downloadPct = Math.min(
            99,
            Math.max(currentPct, Math.round(75 + (receivedBytes / totalBytes) * 24))
          );
          if (downloadPct > currentPct) {
            currentPct = downloadPct;
            onProgress?.(currentPct);
          }
        }
      }
    } else {
      await response.blob();
    }

    window.clearInterval(progressTimer);
    onProgress?.(100);
    await new Promise((r) => window.setTimeout(r, 180));
    return imageUrl;
  } catch (err) {
    window.clearInterval(progressTimer);
    if (
      options?.signal?.aborted ||
      (err instanceof Error &&
        (err.name === "AbortError" || err.message === "Generation aborted"))
    ) {
      throw new Error("Generation aborted");
    }
    throw err;
  }
}
