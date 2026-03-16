import type { Server as SocketIOServer } from "socket.io";
import {
  getUnsummarized,
  summarizeArticle,
} from "../services/summarize.service";
import { getBooleanSetting } from "../services/settings.service";

export async function runSummarizeJob(io?: SocketIOServer): Promise<void> {
  const autoSummarize = getBooleanSetting("ai.autoSummarize", true);
  if (!autoSummarize) {
    console.warn("[AI] Otomatik özetleme ayarlardan kapalı");
    return;
  }

  const articles = getUnsummarized(20);

  if (articles.length === 0) {
    console.warn("[AI] Özetlenecek makale yok");
    return;
  }

  let ollamaCount = 0;
  let geminiCount = 0;
  let total = 0;

  for (const article of articles) {
    const text = `${article.title}\n${article.description ?? ""}`;

    try {
      const result = await summarizeArticle(article.id, text);

      if (result.model === "ollama") ollamaCount++;
      else if (result.model === "gemini") geminiCount++;

      if (result.model !== "none") {
        total++;

        // Emit per-article summarized event
        if (io) {
          io.emit("article:summarized", {
            id: article.id,
            aiSummary: result.summary,
            model: result.model,
          });
        }
      }
    } catch (err) {
      console.error(`[AI] Makale #${article.id} özetlenemedi:`, err);
    }
  }

  // Emit stats update after batch
  if (total > 0 && io) {
    io.emit("stats:update");
  }

  console.warn(`[AI] ${total} makale özetlendi (Ollama: ${ollamaCount}, Gemini: ${geminiCount})`);
}
