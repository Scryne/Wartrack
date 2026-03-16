import { useMemo, useState } from 'react';

interface LegendItem {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  { key: 'strike', label: 'Taarruz', icon: '✹', color: '#FF3B3B', description: 'Hava/fuze/saldiri pinleri' },
  { key: 'movement', label: 'Hareket', icon: '➤', color: '#F5A623', description: 'Birlik veya ekipman hareketliligi' },
  { key: 'nuclear', label: 'Nukleer', icon: '☢', color: '#9B6DFF', description: 'Nukleer risk ve tesis baglantisi' },
  { key: 'naval', label: 'Deniz', icon: '⚓', color: '#00AAFF', description: 'Deniz kuvveti ve platformlar' },
  { key: 'air', label: 'Hava', icon: '✈', color: '#00D084', description: 'Hava unsuru pinleri' },
  { key: 'info', label: 'Bilgi', icon: '●', color: 'rgba(255,255,255,0.75)', description: 'Genel bilgilendirme pinleri' },
  { key: 'haber', label: 'Haber', icon: '◈', color: 'rgba(148,163,184,0.8)', description: 'Genel haber akisi' },
  { key: 'bölge', label: 'Bolge', icon: '▣', color: '#F5A623', description: 'Bolgesel kaynakli haber' },
  { key: 'savunma', label: 'Savunma', icon: '🛡', color: '#60A5FA', description: 'Savunma odakli icerik' },
  { key: 'analiz', label: 'Analiz', icon: '∆', color: '#A78BFA', description: 'Analiz ve degerlendirme icerigi' }
];

interface MapLegendProps {
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
  onHover: (key: string | null) => void;
}

function MapLegend({ selectedKeys, onToggle, onReset, onHover }: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const selectedCount = selectedKeys.length;
  const severityGuide = useMemo(
    () => [
      { label: 'Dusuk', color: '#00D084' },
      { label: 'Orta', color: '#F5A623' },
      { label: 'Yuksek', color: '#FF6B00' },
      { label: 'Kritik', color: '#FF3B3B' }
    ],
    []
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 40,
        zIndex: 420,
        width: open ? 264 : 'auto',
        background: 'rgba(2,5,10,0.8)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: open ? '1px solid var(--border)' : 'none' }}>
        <button type="button" className="btn-ghost" style={{ padding: '2px 6px', color: 'var(--text-primary)' }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Lejant -' : 'Lejant +'}
        </button>
        {open ? (
          <button type="button" className="btn-ghost" onClick={onReset} style={{ fontSize: 10 }}>
            Filtre sifirla {selectedCount > 0 ? `(${selectedCount})` : ''}
          </button>
        ) : null}
      </div>

      {open ? (
        <div style={{ padding: 10, display: 'grid', gap: 6 }}>
          {LEGEND_ITEMS.map((item) => {
            const active = selectedKeys.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onToggle(item.key)}
                onMouseEnter={() => onHover(item.key)}
                onMouseLeave={() => onHover(null)}
                style={{
                  width: '100%',
                  border: `1px solid ${active ? item.color : 'var(--border)'}`,
                  background: active ? `${item.color}1A` : 'rgba(255,255,255,0.01)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
                aria-label={`${item.label} pin filtresi`}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 11 }}>
                  <span style={{ color: item.color, minWidth: 14 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{item.description}</span>
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {severityGuide.map((item) => (
              <span key={item.label} style={{ border: `1px solid ${item.color}66`, color: item.color, fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 2 }}>
                {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MapLegend;
