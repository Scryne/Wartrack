import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CAT_COLOR, PIN_COLOR } from '../panels/mapPanel/mapUtils';

interface LegendItem {
  key: string;
  label: string;
  color: string;
  shape: 'dot' | 'diamond';
}

// Each entry draws the marker it filters, so the legend reads as the map does.
const NEWS_ITEMS: LegendItem[] = [
  { key: 'haber', label: 'Haber', color: CAT_COLOR.haber, shape: 'dot' },
  { key: 'bölge', label: 'Bölge kaynağı', color: CAT_COLOR['bölge'], shape: 'dot' },
  { key: 'savunma', label: 'Savunma', color: CAT_COLOR.savunma, shape: 'dot' },
  { key: 'analiz', label: 'Analiz', color: CAT_COLOR.analiz, shape: 'dot' }
];

const PIN_ITEMS: LegendItem[] = [
  { key: 'strike', label: 'Taarruz', color: PIN_COLOR.strike, shape: 'diamond' },
  { key: 'movement', label: 'Hareket', color: PIN_COLOR.movement, shape: 'diamond' },
  { key: 'nuclear', label: 'Nükleer', color: PIN_COLOR.nuclear, shape: 'diamond' },
  { key: 'naval', label: 'Deniz', color: PIN_COLOR.naval, shape: 'diamond' },
  { key: 'air', label: 'Hava', color: PIN_COLOR.air, shape: 'diamond' },
  { key: 'info', label: 'Bilgi', color: PIN_COLOR.info, shape: 'diamond' }
];

const STATES = [
  { label: 'Kritik başlık', color: 'var(--color-danger)' },
  { label: 'İzlenen kelime', color: 'var(--color-warning)' },
  { label: 'Kaydedilen', color: 'var(--color-accent)' }
];

interface MapLegendProps {
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
  onHover: (key: string | null) => void;
}

function Swatch({ color, shape }: { color: string; shape: 'dot' | 'diamond' | 'ring' }) {
  return <span className={`wt-legend-swatch wt-legend-${shape}`} style={{ '--marker-color': color } as React.CSSProperties} aria-hidden="true" />;
}

function MapLegend({ selectedKeys, onToggle, onReset, onHover }: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const selectedCount = selectedKeys.length;

  const renderGroup = (title: string, items: LegendItem[]) => (
    <div className="wt-legend-group">
      <p className="wt-eyebrow">{title}</p>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="wt-legend-item"
          aria-pressed={selectedKeys.includes(item.key)}
          onClick={() => onToggle(item.key)}
          onMouseEnter={() => onHover(item.key)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(item.key)}
          onBlur={() => onHover(null)}
        >
          <Swatch color={item.color} shape={item.shape} />
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="wt-map-control wt-legend" data-open={open}>
      <div className="wt-legend-head">
        <button type="button" className="wt-legend-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Lejant
          {selectedCount > 0 ? <span className="wt-count">{selectedCount} filtre</span> : null}
          {open ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronUp size={14} strokeWidth={1.75} />}
        </button>
        {open && selectedCount > 0 ? (
          <button type="button" className="btn-ghost" onClick={onReset}>
            Filtreleri temizle
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="wt-legend-body">
          <p className="wt-legend-hint">Bir kategoriye basınca harita yalnız onu gösterir.</p>
          {renderGroup('Haberler', NEWS_ITEMS)}
          {renderGroup('Elle konan işaretler', PIN_ITEMS)}
          <div className="wt-legend-group">
            <p className="wt-eyebrow">Vurgular</p>
            {STATES.map((state) => (
              <span key={state.label} className="wt-legend-item wt-legend-static">
                <Swatch color={state.color} shape="ring" />
                {state.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MapLegend;
