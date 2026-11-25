import express from "express";
import http from "http";
import path from "path";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { TCHOUMI_SYSTEM_PROMPT } from "./src/lib/systemPrompt";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

// Body parsing with support for image/file base64 attachments
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const ALLOWED_MODELS = new Set(["gemini-4-hydrogen", "gemini-3.1-flash-lite"]);

function getServerGeminiApiKey(): string {
  const raw =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: getServerGeminiApiKey(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function createGeminiLiveClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: getServerGeminiApiKey(),
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    hasServerKey: !!getServerGeminiApiKey(),
  });
});

// API Config Check (Allows client to know if server key is available)
app.get("/api/config", (_req, res) => {
  res.json({
    hasServerApiKey: !!getServerGeminiApiKey(),
    defaultModel: "gemini-4-hydrogen",
  });
});

function extractInnerErrorDetail(errMsg: string): string {
  let msg = errMsg;
  for (let i = 0; i < 3; i++) {
    const match = msg.match(/\{[\s\S]*\}/);
    if (!match) break;
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed?.error?.message) {
        msg = String(parsed.error.message);
      } else if (parsed?.message) {
        msg = String(parsed.message);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return msg.replace(/key=[^&\s"']+/gi, "key=REDACTED").replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza...REDACTED").trim();
}

// Helper for cleaning error messages
function getFriendlyErrorMessage(err: unknown): string {
  const errMsg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err || "");

  const innerDetail = extractInnerErrorDetail(errMsg);
  const shortDetail = innerDetail && innerDetail.length <= 220 ? ` (${innerDetail})` : "";

  if (
    errMsg.includes("503") ||
    errMsg.includes("overloaded") ||
    errMsg.includes("high demand") ||
    errMsg.includes("Service Unavailable")
  ) {
    return "Les serveurs Gemini de Google connaissent actuellement un pic de trafic temporaire (erreur 503). Cliquez sur 'Réessayer' pour relancer la réponse.";
  }
  if (
    errMsg.includes("429") ||
    errMsg.includes("RESOURCE_EXHAUSTED") ||
    errMsg.includes("quota") ||
    errMsg.includes("Quota exceeded")
  ) {
    return `Limite de requêtes temporairement atteinte (quota Gemini)${shortDetail}. Veuillez patienter quelques secondes avant de réessayer.`;
  }
  const lowerMsg = `${errMsg} ${innerDetail}`.toLowerCase();
  if (lowerMsg.includes("leaked") || lowerMsg.includes("reported as leaked")) {
    return "Cette clé API Gemini a été bloquée par Google car elle a été détectée comme exposée publiquement. Créez une nouvelle clé sur aistudio.google.com/apikey et utilisez uniquement GEMINI_API_KEY=... dans votre .env.";
  }
  if (lowerMsg.includes("referer") || lowerMsg.includes("referrer")) {
    return "Votre clé API Gemini est restreinte par site web (HTTP Referrer), ce qui bloque les appels serveur. Supprimez la restriction HTTP Referrer dans Google Cloud Console ou utilisez une clé dédiée serveur dans GEMINI_API_KEY.";
  }
  if (errMsg.includes("API_KEY_INVALID") || lowerMsg.includes("api key not valid")) {
    return `La clé API Gemini (GEMINI_API_KEY) est invalide${shortDetail}. Vérifiez sa valeur dans votre fichier .env ou dans Settings > Secrets.`;
  }
  if (
    errMsg.includes("PERMISSION_DENIED") ||
    lowerMsg.includes("permission denied") ||
    errMsg.includes("403")
  ) {
    return `Accès refusé par l'API Gemini${shortDetail}. Vérifiez que 'Generative Language API' est activée sur le projet Google Cloud associé à cette clé ou créez une nouvelle clé dans un nouveau projet sur aistudio.google.com/apikey.`;
  }
  if (errMsg.includes("NOT_FOUND") || errMsg.includes("404")) {
    return `Le modèle Gemini demandé est introuvable ou indisponible${shortDetail}. Veuillez réessayer.`;
  }
  return innerDetail || errMsg || "Une erreur inattendue est survenue lors de la génération.";
}

// API Chat Endpoint with Server-Sent Events (SSE) Streaming & Fallback handling
app.post("/api/chat", async (req, res) => {
  const apiKey = getServerGeminiApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error:
        "Clé API Gemini non configurée sur le serveur. Ajoutez GEMINI_API_KEY=... dans votre fichier .env (en local) ou dans Settings > Secrets.",
    });
  }

  const { messages, model, customInstructions } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "Requête invalide : la liste des messages est requise.",
    });
  }

  const requestedModel =
    typeof model === "string" && ALLOWED_MODELS.has(model)
      ? model
      : "gemini-4-hydrogen";

  const fallbackModels = [
    requestedModel,
    "gemini-4-hydrogen",
    "gemini-3.1-flash-lite",
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  // Keep last 16 messages to match app behavior and stay within payload/token budgets
  const recentMessages = messages.slice(-16);

  const contents = recentMessages.map((m: any) => {
    const parts: any[] = [];

    if (m?.attachments && Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (!att || typeof att !== "object") continue;
        const rawBase64 =
          typeof att.base64 === "string"
            ? att.base64
            : typeof att.dataUrl === "string" && att.dataUrl.includes(",")
              ? att.dataUrl.split(",")[1]
              : undefined;
        const mime = String(att.mimeType || att.type || "image/jpeg");

        if (rawBase64) {
          if (
            mime.startsWith("image/") ||
            mime === "application/pdf" ||
            mime.startsWith("audio/") ||
            mime.startsWith("video/")
          ) {
            parts.push({
              inlineData: {
                data: rawBase64,
                mimeType: mime,
              },
            });
          } else if (mime.startsWith("text/")) {
            try {
              const decodedText = Buffer.from(rawBase64, "base64").toString(
                "utf-8"
              );
              if (decodedText.trim()) {
                parts.push({
                  text: `[Fichier joint : ${String(att.name || "document.txt")}]\n${decodedText}`,
                });
              }
            } catch {
              // ignore malformed text base64
            }
          }
        }
      }
    }

    if (typeof m?.content === "string" && m.content.trim()) {
      parts.push({ text: m.content });
    } else if (parts.length === 0) {
      parts.push({ text: " " });
    }

    return {
      role: m?.role === "user" ? "user" : "model",
      parts,
    };
  });

  const sanitizedCustomInstructions =
    typeof customInstructions === "string"
      ? customInstructions.trim().slice(0, 4000)
      : "";

  const fullInstruction = sanitizedCustomInstructions
    ? `${TCHOUMI_SYSTEM_PROMPT}\n\nInstructions supplémentaires de l'utilisateur :\n${sanitizedCustomInstructions}`
    : TCHOUMI_SYSTEM_PROMPT;

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let isClientClosed = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      isClientClosed = true;
    }
  });

  let streamedSuccessfully = false;
  let lastError: unknown = null;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const ai = createGeminiClient();

  for (const currentModel of fallbackModels) {
    if (isClientClosed) break;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (isClientClosed) break;

      try {
        if (attempt > 0) {
          await sleep(600 * Math.pow(2, attempt));
        }

        const responseStream = await ai.models.generateContentStream({
          model: currentModel,
          contents,
          config: {
            systemInstruction: fullInstruction,
            ...(currentModel === "gemini-4-hydrogen"
              ? { thinkingConfig: { includeThoughts: true } }
              : {}),
          },
        });

        let receivedAnyText = false;
        for await (const chunk of responseStream) {
          if (isClientClosed) break;

          const parts = chunk.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts) && parts.length > 0) {
            for (const part of parts) {
              const partText = part?.text ?? "";
              if (!partText) continue;
              if (part.thought) {
                res.write(`data: ${JSON.stringify({ thought: partText })}\n\n`);
              } else {
                receivedAnyText = true;
                res.write(`data: ${JSON.stringify({ text: partText })}\n\n`);
              }
            }
          } else {
            const chunkText = chunk.text ?? "";
            if (chunkText) {
              receivedAnyText = true;
              res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
            }
          }
        }

        if (isClientClosed) {
          if (!res.writableEnded) res.end();
          return;
        }

        if (!receivedAnyText) {
          throw new Error("Empty response from model");
        }

        streamedSuccessfully = true;
        res.write(`data: [DONE]\n\n`);
        res.end();
        break;
      } catch (err: unknown) {
        lastError = err;
        const errStr = String(err instanceof Error ? err.message : err);
        console.warn(
          `[Gemini] Attempt ${attempt + 1} with model '${currentModel}' failed:`,
          errStr
        );

        if (
          errStr.includes("503") ||
          errStr.includes("overloaded") ||
          errStr.includes("high demand") ||
          errStr.includes("Service Unavailable")
        ) {
          await sleep(800);
          continue;
        }

        if (
          errStr.includes("API_KEY_INVALID") ||
          errStr.includes("API key not valid") ||
          errStr.includes("PERMISSION_DENIED") ||
          errStr.includes("403")
        ) {
          break;
        }

        break;
      }
    }

    if (streamedSuccessfully) break;
    const lastErrStr = String(lastError instanceof Error ? lastError.message : lastError);
    if (
      lastErrStr.includes("API_KEY_INVALID") ||
      lastErrStr.includes("API key not valid") ||
      lastErrStr.includes("PERMISSION_DENIED") ||
      lastErrStr.includes("403")
    ) {
      break;
    }
  }

  if (!streamedSuccessfully && !isClientClosed && !res.writableEnded) {
    const userFriendlyError = getFriendlyErrorMessage(lastError);
    res.write(`data: ${JSON.stringify({ error: userFriendlyError })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
});

const LIVE_ALLOWED_VOICES = new Set(["Zephyr", "Puck", "Charon", "Kore", "Fenrir"]);

function setupLiveVoiceWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", (clientWs: WebSocket) => {
    let session: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null = null;
    let isClosing = false;
    let started = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const cleanup = () => {
      if (isClosing) return;
      isClosing = true;
      if (session) {
        try {
          session.close();
        } catch {
          // ignore close errors
        }
        session = null;
      }
    };

    const startLiveSession = async (opts: {
      voice?: string;
      language?: string;
      customInstructions?: string;
    }) => {
      if (started || isClosing) return;
      started = true;

      const apiKey = getServerGeminiApiKey();
      if (!apiKey) {
        safeSend({
          type: "error",
          message:
            "Clé API Gemini non configurée sur le serveur. Ajoutez GEMINI_API_KEY=... dans votre fichier .env (en local) ou dans Settings > Secrets.",
        });
        clientWs.close();
        return;
      }

      const voiceName =
        typeof opts.voice === "string" && LIVE_ALLOWED_VOICES.has(opts.voice)
          ? opts.voice
          : "Zephyr";

      const langHint =
        opts.language === "en"
          ? "Respond naturally, warmly, and concisely in spoken English unless the user speaks another language."
          : "Réponds naturellement, chaleureusement et de façon fluide à l'oral en français (sauf si l'utilisateur parle dans une autre langue). Fais des phrases naturelles adaptées à une conversation vocale en direct, sans balises Markdown complexes.";

      const customInst =
        typeof opts.customInstructions === "string" && opts.customInstructions.trim()
          ? `\n\nInstructions supplémentaires de l'utilisateur :\n${opts.customInstructions.trim().slice(0, 2000)}`
          : "";

      const systemInstruction = `${TCHOUMI_SYSTEM_PROMPT}\n\n[MODE CONVERSATION VOCALE EN DIRECT]\n${langHint}${customInst}`;

      let sentError = false;
      const sendErrorOnce = (raw: string) => {
        if (sentError || isClosing) return;
        sentError = true;
        safeSend({
          type: "error",
          message: getFriendlyErrorMessage(raw),
        });
      };

      try {
        const ai = createGeminiLiveClient();
        const liveSession = await ai.live.connect({
          model: "gemini-3.8-live",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              // Ready event is emitted once session assignment completes below
            },
            onmessage: (message: LiveServerMessage) => {
              if (isClosing) return;
              const content = message.serverContent;

              if (content?.inputTranscription?.text) {
                safeSend({
                  type: "inputTranscript",
                  text: content.inputTranscription.text,
                });
              }

              if (content?.outputTranscription?.text) {
                safeSend({
                  type: "outputTranscript",
                  text: content.outputTranscription.text,
                });
              }

              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  safeSend({
                    type: "audio",
                    data: part.inlineData.data,
                  });
                }
              }

              if (content?.interrupted) {
                safeSend({ type: "interrupted" });
              }

              if (content?.turnComplete) {
                safeSend({ type: "turnComplete" });
              }
            },
            onerror: (err: unknown) => {
              const errObj = err as { message?: string; error?: unknown };
              const rawMsg =
                errObj?.message ||
                (errObj?.error instanceof Error ? errObj.error.message : undefined) ||
                (typeof errObj?.error === "string" ? errObj.error : undefined);
              console.warn("[Gemini Live] Session error:", rawMsg || err);
              if (rawMsg) {
                sendErrorOnce(rawMsg);
              }
            },
            onclose: (event?: { code?: number; reason?: string }) => {
              const reason = event?.reason || "";
              const code = event?.code;
              console.warn(`[Gemini Live] Session closed (code=${code}):`, reason);
              if (!isClosing) {
                if (reason) {
                  sendErrorOnce(reason);
                } else if (!sentError) {
                  safeSend({ type: "closed", code });
                }
                cleanup();
              }
            },
          },
        });

        if (isClosing) {
          try {
            liveSession.close();
          } catch {
            // ignore
          }
          return;
        }

        session = liveSession;
        safeSend({ type: "ready", voice: voiceName });
      } catch (err: unknown) {
        const rawErr =
          err instanceof Error
            ? err.message
            : typeof (err as { message?: string })?.message === "string"
              ? (err as { message: string }).message
              : JSON.stringify(err || "");
        console.warn("[Gemini Live] Failed to connect:", rawErr);
        sendErrorOnce(rawErr);
        cleanup();
      }
    };

    clientWs.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "start") {
          void startLiveSession(msg);
        } else if (msg?.type === "audio" && typeof msg.data === "string" && session) {
          session.sendRealtimeInput({
            audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (msg?.type === "text" && typeof msg.text === "string" && session) {
          session.sendRealtimeInput({ text: msg.text });
        }
      } catch {
        // ignore malformed client packets
      }
    });

    clientWs.on("close", () => {
      cleanup();
    });

    clientWs.on("error", () => {
      cleanup();
    });
  });
}

// Vite middleware in development vs Static serving in production
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = http.createServer(app);
  setupLiveVoiceWebSocket(server);

  server.listen(PORT, "0.0.0.0", () => {
    const key = getServerGeminiApiKey();
    const keyHint = key ? `configured (ends with ...${key.slice(-4)})` : "missing";
    console.log(`Tchoumi IA Server listening on http://0.0.0.0:${PORT} | GEMINI_API_KEY: ${keyHint}`);
  });
}

setupViteOrStatic().catch((err) => {
  console.error("Failed to start server:", err);
});
