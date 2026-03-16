import { useDrawStore, type DrawTool } from '../stores/useDrawStore';

const TOOLS: Array<{ id: Exclude<DrawTool, 'none'>; icon: string; label: string }> = [
  { id: 'pen', icon: '✏', label: 'Serbest Cizim' },
  { id: 'line', icon: '╱', label: 'Dogru Cizgisi' },
  { id: 'circle', icon: '◯', label: 'Daire Alan' },
  { id: 'rectangle', icon: '▭', label: 'Dikdortgen Alan' }
];

const COLORS = ['#FF3B3B', '#F5A623', '#00AAFF', '#00D084'] as const;

function DrawToolbar() {
  const active = useDrawStore((s) => s.active);
  const tool = useDrawStore((s) => s.tool);
  const color = useDrawStore((s) => s.color);
  const setTool = useDrawStore((s) => s.setTool);
  const setColor = useDrawStore((s) => s.setColor);

  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        right: 12,
        zIndex: 'calc(var(--z-map-controls) + 10)',
        background: 'rgba(4,9,18,0.92)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        animation: 'fade-in 0.15s ease-out'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1px 0 3px 0',
          borderBottom: '1px solid var(--border)',
          marginBottom: 2
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            letterSpacing: 1,
            color: 'var(--text-secondary)'
          }}
        >
          ÇİZİM
        </span>
        <button
          type="button"
          onClick={() => useDrawStore.getState().toggle()}
          title="Çizimi Kapat"
          style={{
            width: 18,
            height: 18,
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: 10,
            lineHeight: 1,
            padding: 0,
            transition: 'all 0.12s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated)';
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          ✕
        </button>
      </div>

      {TOOLS.map((entry) => {
        const selected = tool === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            title={entry.label}
            onClick={() => setTool(entry.id)}
            style={{
              width: 32,
              height: 32,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: selected ? 'var(--accent)' : 'transparent',
              color: selected ? '#fff' : 'var(--text-secondary)',
              fontSize: 16,
              lineHeight: 1,
              cursor: 'pointer',
              transition: 'all 0.12s ease-out'
            }}
          >
            {entry.icon}
          </button>
        );
      })}

      <div style={{ height: 1, background: 'var(--border-strong)', margin: '2px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: '2px 0' }}>
        {COLORS.map((swatch) => {
          const selected = color.toUpperCase() === swatch.toUpperCase();
          return (
            <button
              key={swatch}
              type="button"
              title={swatch}
              onClick={() => setColor(swatch)}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: selected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)',
                background: swatch,
                cursor: 'pointer'
              }}
            />
          );
        })}
      </div>

      <div style={{ height: 1, background: 'var(--border-strong)', margin: '2px 0' }} />

      <button
        type="button"
        onClick={() => useDrawStore.getState().clearAll()}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--red)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 0.4,
          padding: '2px 0',
          cursor: 'pointer'
        }}
      >
        ✕ Temizle
      </button>
    </div>
  );
}

export default DrawToolbar;
