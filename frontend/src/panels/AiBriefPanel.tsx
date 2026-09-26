import { useEffect } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { hasDisallowedScript, sanitizeTextOutput } from '../lib/textGuard';

interface BriefSection {
  key: "summary" | "critical" | "trend";
  title: string;
  bullets: string[];
  paragraphs: string[];
}

interface AiBriefPanelProps {
  open: boolean;
  loading: boolean;
  brief: string;
  model: string;
  generatedAt: string;
  onClose: () => void;
  onRefresh: () => void;
}

const SECTION_META: Record<BriefSection["key"], { title: string; fallback: string }> = {
  // Fallbacks describe the missing text, never the world: an empty section
  // used to read "Kritik düzeyde olay tespit edilmedi", a claim nobody made.
  summary: {
    title: "Son 6 saatin özeti",
    fallback: "Bu bölüm için metin gelmedi."
  },
  critical: {
    title: "Kritik gelişme",
    fallback: "Bu bölüm için metin gelmedi."
  },
  trend: {
    title: "Trend",
    fallback: "Bu bölüm için metin gelmedi."
  }
};

function headingToKey(title: string): BriefSection["key"] | null {
  const normalized = title
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

  if (normalized.includes("son 6 saatin ozeti")) return "summary";
  if (normalized.includes("kritik gelisme")) return "critical";
  if (normalized.includes("trend analizi")) return "trend";
  return null;
}

function parseBrief(markdown: string): BriefSection[] {
  const safeMarkdown = hasDisallowedScript(markdown) ? '' : sanitizeTextOutput(markdown);
  const lines = safeMarkdown.split("\n");
  const sectionMap = new Map<BriefSection["key"], BriefSection>();
  let current: BriefSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      const rawTitle = line.replace(/^##\s+/, "").trim();
      const key = headingToKey(rawTitle);
      if (!key) {
        current = null;
        continue;
      }

      const existing = sectionMap.get(key);
      if (existing) {
        current = existing;
        continue;
      }

      current = { key, title: SECTION_META[key].title, bullets: [], paragraphs: [] };
      sectionMap.set(key, current);
      continue;
    }

    if (!current) continue;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      current.bullets.push(line.slice(2).trim());
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      current.bullets.push(line.replace(/^\d+\.\s+/, "").trim());
      continue;
    }
    current.paragraphs.push(line);
  }

  const order: BriefSection["key"][] = ["summary", "critical", "trend"];
  return order.map((key) => sectionMap.get(key) ?? { key, title: SECTION_META[key].title, bullets: [], paragraphs: [] });
}

function AiBriefPanel({ open, loading, brief, model, generatedAt, onClose, onRefresh }: AiBriefPanelProps) {
  const sections = parseBrief(brief);
  const generatedText = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "--:--";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside className="wt-brief" data-open={open} aria-hidden={!open} aria-labelledby="wt-brief-title">
      <header className="wt-brief-header">
        <h2 id="wt-brief-title" className="wt-brief-title">
          <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" />
          Durum özeti
        </h2>
        <button type="button" className="btn-ghost wt-icon-button" onClick={onClose} aria-label="Durum özetini kapat" tabIndex={open ? 0 : -1}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>

      <div className="wt-brief-body" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <div className="wt-brief-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="wt-brief-section wt-skeleton" style={{ height: i === 0 ? 148 : 76 }} />
            ))}
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.key} className="wt-brief-section" data-kind={section.key}>
              <h3 className="wt-brief-section-title">{section.title}</h3>

              {/* Keyed by position, not content: model output can legitimately
                  repeat a line, and duplicate keys break reconciliation. */}
              {section.bullets.length > 0 ? (
                <ul className="wt-brief-list">
                  {section.bullets.map((item, idx) => (
                    <li key={`${section.key}-bullet-${idx}`}>{item}</li>
                  ))}
                </ul>
              ) : null}

              {section.paragraphs.map((paragraph, idx) => (
                <p key={`${section.key}-para-${idx}`} className="wt-brief-text">
                  {paragraph}
                </p>
              ))}

              {section.bullets.length === 0 && section.paragraphs.length === 0 ? (
                <p className="wt-brief-text wt-brief-text-muted">{SECTION_META[section.key].fallback}</p>
              ) : null}
            </section>
          ))
        )}
      </div>

      <footer className="wt-brief-footer">
        <span className="wt-brief-meta">
          {generatedText} · {model || "—"}
        </span>
        <button type="button" className="btn-secondary" onClick={onRefresh} disabled={loading} tabIndex={open ? 0 : -1}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          {loading ? "Hazırlanıyor…" : "Yenile"}
        </button>
      </footer>
    </aside>
  );
}

export default AiBriefPanel;
