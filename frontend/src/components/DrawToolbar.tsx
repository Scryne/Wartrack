import { useMemo } from 'react';
import { Circle, Pencil, RectangleHorizontal, Slash, Trash2, X } from 'lucide-react';
import { useDrawStore, type DrawTool } from '../stores/useDrawStore';
import { tokenColor } from '../lib/tokens';

const TOOLS: Array<{ id: Exclude<DrawTool, 'none'>; Icon: typeof Pencil; label: string }> = [
  { id: 'pen', Icon: Pencil, label: 'Serbest çizim' },
  { id: 'line', Icon: Slash, label: 'Düz çizgi' },
  { id: 'circle', Icon: Circle, label: 'Daire alan' },
  { id: 'rectangle', Icon: RectangleHorizontal, label: 'Dikdörtgen alan' }
];

const SWATCHES = [
  { token: '--color-chart-1', name: 'Kırmızı' },
  { token: '--color-chart-2', name: 'Kehribar' },
  { token: '--color-chart-4', name: 'Mavi' },
  { token: '--color-chart-5', name: 'Yeşil' }
] as const;

function DrawToolbar() {
  const active = useDrawStore((s) => s.active);
  const tool = useDrawStore((s) => s.tool);
  const color = useDrawStore((s) => s.color);
  const setTool = useDrawStore((s) => s.setTool);
  const setColor = useDrawStore((s) => s.setColor);
  // Resolved once per mount: Leaflet needs concrete colours for SVG strokes.
  const swatches = useMemo(() => SWATCHES.map((s) => ({ ...s, value: tokenColor(s.token) })), []);

  if (!active) return null;

  return (
    <div className="wt-map-control wt-draw" role="toolbar" aria-label="Çizim" aria-orientation="vertical">
      <div className="wt-draw-head">
        <span className="wt-eyebrow">Çizim</span>
        <button
          type="button"
          className="wt-map-tool wt-draw-close"
          aria-label="Çizim araçlarını kapat"
          onClick={() => useDrawStore.getState().toggle()}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      {TOOLS.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          className="wt-map-tool"
          aria-pressed={tool === id}
          aria-label={label}
          title={label}
          onClick={() => setTool(id)}
        >
          <Icon size={16} strokeWidth={1.75} />
        </button>
      ))}

      <span className="wt-map-tools-divider" aria-hidden="true" />

      <div className="wt-draw-swatches" role="radiogroup" aria-label="Çizgi rengi">
        {swatches.map((swatch) => (
          <button
            key={swatch.token}
            type="button"
            role="radio"
            aria-checked={color.toLowerCase() === swatch.value.toLowerCase()}
            aria-label={swatch.name}
            title={swatch.name}
            className="wt-draw-swatch"
            style={{ background: `var(${swatch.token})` }}
            onClick={() => setColor(swatch.value)}
          />
        ))}
      </div>

      <span className="wt-map-tools-divider" aria-hidden="true" />

      <button
        type="button"
        className="wt-map-tool wt-draw-clear"
        aria-label="Tüm çizimleri sil"
        title="Tüm çizimleri sil"
        onClick={() => useDrawStore.getState().clearAll()}
      >
        <Trash2 size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export default DrawToolbar;
