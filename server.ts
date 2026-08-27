import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parsing with support for image base64 attachments
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// System Prompt for Tchoumi IA
const TCHOUMI_SYSTEM_PROMPT = `Tu es Tchoumi IA, une intelligence artificielle avancée conçue pour transformer l’apprentissage, l’innovation et le développement technologique en Afrique et dans le monde.
Nom : Tchoumi IA
Version : 3.0
Origine : Afrique (Cameroun)
Langue principale : Français
Créateur : Tchoumi Chilic Vitrice (Né le 06 Juin 2004 à Tonga, Cameroun. Fondateur & PDG de Vitronix Life, diplômé AIMT).
Mission : Réduire la fracture numérique, accompagner les étudiants, chercheurs, développeurs et professionnels avec excellence et précision.`;

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: Date.now(),
    hasServerKey: !!process.env.GEMINI_API_KEY
  });
});

// API Config Check (Allows client to know if server key is available)
app.get("/api/config", (req, res) => {
  res.json({
    hasServerApiKey: !!process.env.GEMINI_API_KEY,
    defaultModel: "gemini-2.5-flash",
  });
});

// Helper for cleaning error message
function getFriendlyErrorMessage(err: any): string {
  const errMsg = err?.message || String(err || "");
  if (errMsg.includes("503") || errMsg.includes("overloaded") || errMsg.includes("Service Unavailable")) {
    return "Les serveurs du modèle IA sont actuellement très sollicités (erreur 503). Une tentative avec un modèle alternatif est recommandée.";
  }
  if (errMsg.includes("429") || errMsg.includes("Resource has been exhausted") || errMsg.includes("quota")) {
    return "Limite de requêtes temporairement atteinte (quota Gemini). Veuillez patienter quelques secondes avant de réessayer.";
  }
  if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
    return "La clé d'API Gemini n'est pas valide ou a été révoquée. Veuillez vérifier votre clé d'API dans les paramètres.";
  }
  return errMsg;
}

// API Chat Endpoint with Server-Sent Events (SSE) Streaming & Fallback handling
app.post("/api/chat", async (req, res) => {
  const { messages, apiKey, model, customInstructions } = req.body;

  const keyToUse = apiKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!keyToUse) {
    return res.status(400).json({
      error: "Clé API Gemini non configurée sur le serveur. Veuillez configurer GEMINI_API_KEY dans votre fichier .env ou dans les paramètres de l'application."
    });
  }

  // Determine models list to try in order (primary, then robust active models)
  let requestedModel = model || "gemini-2.5-flash";
  if (
    requestedModel.includes("2.0") ||
    requestedModel.includes("1.5") ||
    requestedModel.includes("3-flash-preview") ||
    requestedModel.includes("3.0")
  ) {
    requestedModel = "gemini-2.5-flash";
  }

  const fallbackModels = [
    requestedModel,
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-flash-latest",
  ].filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

  // Prepare Gemini contents payload
  const contents = (messages || []).map((m: any) => {
    const parts: any[] = [];

    if (m.attachments && Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        const rawBase64 = att.base64 || (att.dataUrl && att.dataUrl.includes(",") ? att.dataUrl.split(",")[1] : undefined);
        const mime = att.mimeType || att.type || "image/jpeg";
        if (rawBase64 && mime.startsWith("image/")) {
          parts.push({
            inlineData: {
              data: rawBase64,
              mimeType: mime,
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
      role: m.role === "user" ? "user" : "model",
      parts,
    };
  });

  const fullInstruction = customInstructions
    ? `${TCHOUMI_SYSTEM_PROMPT}\n\nInstructions personnalisées de l'utilisateur :\n${customInstructions}`
    : TCHOUMI_SYSTEM_PROMPT;

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let streamedSuccessfully = false;
  let lastError: any = null;
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  for (const currentModel of fallbackModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(600 * attempt);
        }

        const ai = new GoogleGenAI({ apiKey: keyToUse });
        
        const responseStream = await ai.models.generateContentStream({
          model: currentModel,
          contents: contents as any,
          config: {
            systemInstruction: fullInstruction,
            temperature: 0.7,
          },
        });

        for await (const chunk of responseStream) {
          const chunkText = chunk.text || "";
          if (chunkText) {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        }

        streamedSuccessfully = true;
        res.write(`data: [DONE]\n\n`);
        res.end();
        break; // Exit loop on success
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini] Attempt ${attempt + 1} with model '${currentModel}' failed:`, err?.message || err);
        const errStr = String(err?.message || err);
        if (errStr.includes("503") || errStr.includes("overloaded") || errStr.includes("Service Unavailable")) {
          await sleep(800);
          continue;
        } else {
          break;
        }
      }
    }
    if (streamedSuccessfully) break;
  }

  if (!streamedSuccessfully) {
    const userFriendlyError = getFriendlyErrorMessage(lastError);
    res.write(`data: ${JSON.stringify({ error: userFriendlyError })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
});

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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Tchoumi IA Server listening on http://0.0.0.0:${PORT}`);
  });
}

setupViteOrStatic().catch((err) => {
  console.error("Failed to start server:", err);
});
