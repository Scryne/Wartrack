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
  summary: {
    title: "SON 6 SAATİN ÖZETİ",
    fallback: "Özet metni henüz oluşturulmadı."
  },
  critical: {
    title: "KRİTİK GELİŞME",
    fallback: "Kritik düzeyde olay tespit edilmedi."
  },
  trend: {
    title: "TREND ANALİZİ",
    fallback: "Trend analizi için yeterli veri bulunmuyor."
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

  return (
    <aside
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        height: "100%",
        width: 380,
        maxWidth: "100%",
        zIndex: 'var(--z-map-panels)',
        background: "rgba(4,9,18,0.97)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderLeft: "1px solid var(--border-strong)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease-out",
        display: "flex",
        flexDirection: "column",
        pointerEvents: open ? "auto" : "none"
      }}
    >
      <div
        style={{
          height: 42,
          flexShrink: 0,
          borderBottom: "1px solid var(--border)",
          padding: "0 10px 0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: 1.2 }}>🤖 AI DURUM ÖZETİ</span>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "3px 6px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              color: "#A78BFA",
              textTransform: "uppercase",
              letterSpacing: 0.6
            }}
          >
            {model || "--"}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 22,
              height: 22,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: "22px"
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column" }}>
        {loading ? (
          <div
            style={{
              flex: 1,
              minHeight: 220,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.2)",
                borderTopColor: "var(--accent)",
                animation: "spin 0.75s linear infinite"
              }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", letterSpacing: 0.4 }}>
              Analiz ediliyor...
            </span>
          </div>
        ) : (
          <>
            {sections.map((section) => (
              <div
                key={section.key}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: 12,
                  marginBottom: 10
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 13,
                    letterSpacing: 1,
                    color: "var(--accent)",
                    marginBottom: 6
                  }}
                >
                  {section.title}
                </div>

                {section.bullets.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 15, color: "var(--text-primary)", fontSize: 12, lineHeight: 1.55 }}>
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}

                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.55, marginTop: 6 }}>
                    {paragraph}
                  </p>
                ))}

                {section.bullets.length === 0 && section.paragraphs.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>{SECTION_META[section.key].fallback}</p>
                ) : null}
              </div>
            ))}

            <div style={{ marginTop: "auto", paddingTop: 4 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
                Oluşturulma: {generatedText} · {model || "-"}
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                style={{
                  width: "100%",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: loading ? "var(--text-muted)" : "var(--text-secondary)",
                  borderRadius: "var(--radius-sm)",
                  height: 30,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: 0.6,
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? "Analiz Ediliyor..." : "Yeniden Analiz Et"}
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

export default AiBriefPanel;
