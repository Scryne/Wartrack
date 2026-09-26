import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { WORKSPACES } from "../data/workspaces";
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
  const setActiveWorkspace = useMapStore((s) => s.setActiveWorkspace);
  const { markAllRead } = useEventStore();
  const setOpen = useSettingsStore((s) => s.setOpen);

  const downloadSitRep = useCallback(async () => {
    try {
      showToast("Durum raporu hazırlanıyor…", "info");
      const res = await apiFetch("/api/events/sitrep?hours=24&format=markdown");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();

      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wartracker-durum-raporu-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("Durum raporu indirildi.", "success");
    } catch {
      showToast("Rapor indirilemedi. Sunucu bağlantısını kontrol edin.", "error");
    }
  }, []);

  const copySitRep = useCallback(async () => {
    try {
      showToast("Durum raporu alınıyor…", "info");
      const res = await apiFetch("/api/events/sitrep?hours=24&format=markdown");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();
      await navigator.clipboard.writeText(markdown);
      showToast("Durum raporu panoya kopyalandı.", "success");
    } catch {
      showToast("Panoya kopyalanamadı. Tarayıcı izni gerekebilir.", "error");
    }
  }, []);

  return useMemo(
    () => [
      {
        id: "sitrep-download",
        label: "Son 24 saatin durum raporunu indir (.md)",
        category: "Rapor",
        action: () => { void downloadSitRep(); },
      },
      {
        id: "sitrep-copy",
        label: "Son 24 saatin durum raporunu panoya kopyala",
        category: "Rapor",
        action: () => { void copySitRep(); },
      },
      // Same list the map's theatre tabs use, so both stay in step.
      ...WORKSPACES.map((ws) => ({
        id: `ws-${ws.id}`,
        label: `Haritada ${ws.name} bölgesine git`,
        category: "Harita",
        action: () => setActiveWorkspace(ws.id),
      })),
      {
        id: "tool-pin",
        label: "Haritaya işaret koy",
        category: "Harita",
        action: () => {
          window.dispatchEvent(new CustomEvent("wartracker:add-pin"));
        },
      },
      {
        id: "feed-all",
        label: "Tüm haber kategorilerini göster",
        category: "Haber akışı",
        action: () => setTab("all"),
      },
      {
        id: "feed-refresh",
        label: "Kaynakları şimdi tara",
        category: "Haber akışı",
        action: () => { void refresh(); },
      },
      {
        id: "tool-clear-events",
        label: "Kritik olayları okundu işaretle",
        category: "Sistem",
        action: () => markAllRead(),
      },
      {
        id: "tool-test-sound",
        label: "Uyarı sesini dene",
        category: "Sistem",
        action: () => {
          playTacticalPulse("critical");
          showToast("Deneme sesi çalındı.", "info");
        },
      },
      {
        id: "tool-settings",
        label: "Ayarları aç",
        category: "Sistem",
        action: () => setOpen(true),
      },
    ],
    [setTab, refresh, setActiveWorkspace, markAllRead, setOpen, downloadSitRep, copySitRep]
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
  const activeId = flatList[selectedIdx] ? `wt-cmd-${flatList[selectedIdx].id}` : undefined;

  return (
    <div
      className="wt-palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wt-palette" role="dialog" aria-modal="true" aria-label="Komut paleti" onKeyDown={handleKeyDown}>
        <label className="wt-palette-search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Komut ara</span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="wt-palette-list"
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            placeholder="Komut yazın: rapor, harita, tara…"
          />
          <kbd className="wt-kbd">Esc</kbd>
        </label>

        <div id="wt-palette-list" className="wt-palette-list" role="listbox" aria-label="Komutlar">
          {flatList.length === 0 ? (
            <p className="wt-palette-empty">"{query}" ile eşleşen komut yok.</p>
          ) : (
            Array.from(grouped.entries()).map(([category, cmds]) => (
              <div key={category} role="group" aria-label={category}>
                <p className="wt-palette-group wt-eyebrow">{category}</p>
                {cmds.map((cmd) => {
                  const idx = flatIdx++;
                  const isSelected = idx === selectedIdx;
                  return (
                    <button
                      key={cmd.id}
                      id={`wt-cmd-${cmd.id}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={-1}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={cn("wt-palette-item", isSelected && "wt-palette-item-active")}
                    >
                      {cmd.label}
                      {isSelected ? <CornerDownLeft size={13} strokeWidth={1.75} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <p className="wt-palette-foot">
          <kbd className="wt-kbd">↑</kbd> <kbd className="wt-kbd">↓</kbd> seç · <kbd className="wt-kbd">Enter</kbd> çalıştır ·{" "}
          <kbd className="wt-kbd">Ctrl</kbd> <kbd className="wt-kbd">K</kbd> aç
        </p>
      </div>
    </div>
  );
}

export default CommandPalette;
