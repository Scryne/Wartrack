import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { useFeedStore } from "../stores/useFeedStore";
import { useMapStore } from "../stores/useMapStore";
import { useEventStore } from "../stores/useEventStore";
import { useSettingsStore } from "../stores/useSettingsStore";

import { showToast } from "./Toast";
import { apiFetch } from "../lib/api";
import { playTacticalPulse } from "../lib/audio";

/* ───────────────── COMMAND DEFINITIONS ───────────────── */

interface Command {
  id: string;
  label: string;
  category: string;
  action: () => void;
}

function useCommands(): Command[] {
  const { setTab, refresh } = useFeedStore();
  const { setMapView } = useMapStore();
  const { markAllRead } = useEventStore();
  const setOpen = useSettingsStore((s) => s.setOpen);

  const downloadSitRep = useCallback(async () => {
    try {
      showToast("SitRep raporu hazırlanıyor...", "info");
      const res = await apiFetch("/api/events/sitrep?hours=24&format=markdown");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();

      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `WARTRACKER-SITREP-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("SitRep raporu indirildi.", "success");
    } catch {
      showToast("SitRep indirilemedi.", "error");
    }
  }, []);

  const copySitRep = useCallback(async () => {
    try {
      showToast("SitRep alınıyor...", "info");
      const res = await apiFetch("/api/events/sitrep?hours=24&format=markdown");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();
      await navigator.clipboard.writeText(markdown);
      showToast("SitRep panoya kopyalandı.", "success");
    } catch {
      showToast("Panoya kopyalanamadı.", "error");
    }
  }, []);

  return useMemo(
    () => [
      // RAPOR & İSTİHBARAT
      {
        id: "sitrep-download",
        label: "Operasyonel SitRep Raporunu İndir (.md)",
        category: "İSTİHBARAT & RAPOR",
        action: () => { void downloadSitRep(); },
      },
      {
        id: "sitrep-copy",
        label: "SitRep Raporunu Panoya Kopyala",
        category: "İSTİHBARAT & RAPOR",
        action: () => { void copySitRep(); },
      },

      // WORKSPACE
      {
        id: "ws-iran",
        label: "İran·İsrail tiyatrosuna git",
        category: "HARİTA GÖRÜNÜMÜ",
        action: () => setMapView([32.5, 51], 5),
      },
      {
        id: "ws-kizildeniz",
        label: "Kızıldeniz & Bab el-Mandeb hattına git",
        category: "HARİTA GÖRÜNÜMÜ",
        action: () => setMapView([15, 42], 6),
      },
      {
        id: "ws-suriye",
        label: "Suriye & Levant hattına git",
        category: "HARİTA GÖRÜNÜMÜ",
        action: () => setMapView([35, 38], 7),
      },

      // FEED
      {
        id: "feed-all",
        label: "Tüm haberleri göster",
        category: "HABER AKIŞI",
        action: () => setTab("all"),
      },
      {
        id: "feed-refresh",
        label: "Feed'i şimdi yenile",
        category: "HABER AKIŞI",
        action: () => { void refresh(); },
      },

      // ARAÇLAR & ALARMLAR
      {
        id: "tool-test-sound",
        label: "Taktik Tehdit Alarmını Test Et (Ses)",
        category: "ARAÇLAR & SİSTEM",
        action: () => {
          playTacticalPulse("critical");
          showToast("Taktik alarm sesi çalındı.", "info");
        },
      },
      {
        id: "tool-pin",
        label: "Yeni taktik pin ekle",
        category: "ARAÇLAR & SİSTEM",
        action: () => {
          window.dispatchEvent(new CustomEvent("wartracker:add-pin"));
        },
      },
      {
        id: "tool-settings",
        label: "Ayarlar ve Sistem Teşhisi panelini aç",
        category: "ARAÇLAR & SİSTEM",
        action: () => setOpen(true),
      },
      {
        id: "tool-clear-events",
        label: "Olay loglarını okundu olarak işaretle",
        category: "ARAÇLAR & SİSTEM",
        action: () => markAllRead(),
      },
    ],
    [setTab, refresh, setMapView, markAllRead, setOpen, downloadSitRep, copySitRep]
  );
}

/* ───────────────── COMMAND PALETTE ───────────────── */

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const commands = useCommands();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter commands
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      const list = map.get(cmd.category) || [];
      list.push(cmd);
      map.set(cmd.category, list);
    }
    return map;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const result: Command[] = [];
    for (const cmds of grouped.values()) {
      result.push(...cmds);
    }
    return result;
  }, [grouped]);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Clamp selectedIdx
  useEffect(() => {
    if (selectedIdx >= flatList.length) {
      setSelectedIdx(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, selectedIdx]);

  const executeCommand = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatList[selectedIdx]) executeCommand(flatList[selectedIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [flatList, selectedIdx, executeCommand, onClose]
  );

  if (!open) return null;

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[700] flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border-default bg-bg-2 shadow-2xl"
        style={{ maxHeight: "400px" }}
        onKeyDown={handleKeyDown}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border-default px-4 py-3">
          <span className="text-text-3">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            placeholder="Komut ara..."
            className="flex-1 bg-transparent font-mono text-sm text-text-1 outline-none placeholder:text-text-3"
          />
          <kbd className="rounded border border-border-dim px-1.5 py-0.5 font-mono text-[10px] text-text-3">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {flatList.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-text-3">
              Sonuç bulunamadı
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, cmds]) => (
              <div key={category}>
                <div className="sticky top-0 bg-bg-2 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const idx = flatIdx++;
                  const isSelected = idx === selectedIdx;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-accent/15 text-accent"
                          : "text-text-2 hover:bg-bg-3"
                      )}
                    >
                      <span className="text-text-3">→</span>
                      {cmd.label}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
