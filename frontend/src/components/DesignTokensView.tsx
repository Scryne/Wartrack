import React from 'react';
import { Shield, Radio, AlertTriangle, CheckCircle2, Clock, Terminal } from 'lucide-react';

interface DesignTokensViewProps {
  onClose?: () => void;
}

export const DesignTokensView: React.FC<DesignTokensViewProps> = ({ onClose }) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--color-bg)',
        color: 'var(--color-fg)',
        overflowY: 'auto',
        padding: 'var(--space-6)',
        fontFamily: 'var(--font-sans)'
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              WARTRACK — Design Token Sistemi
            </h1>
            <p style={{ color: 'var(--color-fg-muted)', fontSize: 13, marginTop: 4 }}>
              DESIGN.md v1.4 · Precision Tactical Cobalt Yönü · WCAG 2.1 AA Uyumlu
            </p>
          </div>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              Kapat (ESC)
            </button>
          )}
        </div>

        {/* 1. Yüzeyler ve Katmanlar */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            1. Yüzey ve Kenarlık Katmanları
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-fg-subtle)' }}>--color-bg (#080B11)</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Deep Void (Ana Zemin)</div>
            </div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-fg-subtle)' }}>--color-surface (#0F141F)</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Panel & Kart Zemini</div>
            </div>
            <div style={{ background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-fg-subtle)' }}>--color-surface-sunken (#161D2C)</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Başlık & Input Arkası</div>
            </div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-fg-subtle)' }}>--color-border-strong (#2E3D56)</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Vurgulu Ayırıcı Sınır</div>
            </div>
          </div>
        </section>

        {/* 2. Metin Hiyerarşisi ve Kontrast */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            2. Tipografi ve Metin Kontrastı
          </h2>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-fg)' }}>--color-fg: Başlık ve Kritik Değer Metni</span>
                <span style={{ fontSize: 12, color: 'var(--color-fg-subtle)', marginLeft: 12 }}>İ, ı, Ğ, ğ, Ş, ş, Ç, ç, Ö, ö, Ü, ü</span>
              </div>
              <span className="badge-status badge-status-success">15.6:1 AAA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 14, color: 'var(--color-fg-muted)' }}>--color-fg-muted: Açıklama, ikincil gövde metni ve olay detayları</span>
              <span className="badge-status badge-status-success">7.8:1 AAA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>--color-fg-subtle: Zaman damgaları, etiketler ve devre dışı durumlar</span>
              <span className="badge-status badge-status-warning">4.3:1 AA</span>
            </div>
          </div>
        </section>

        {/* 3. Aksan ve Durum Renkleri */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            3. Aksan ve Durum Rozetleri
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
            <button className="btn-primary">
              <Shield size={14} /> Taktik Aksan (--color-accent)
            </button>
            <button className="btn-secondary">
              <Terminal size={14} /> İkincil Buton (--color-surface)
            </button>
            <span className="badge-status badge-status-success">
              <CheckCircle2 size={12} /> Seviye 1: Düşük
            </span>
            <span className="badge-status badge-status-warning">
              <Radio size={12} /> Seviye 3: Orta
            </span>
            <span className="badge-status badge-status-danger">
              <AlertTriangle size={12} /> Seviye 5: Kritik
            </span>
            <span className="badge-status badge-status-neutral">
              <Clock size={12} /> Pasif / Teyitsiz
            </span>
          </div>
        </section>

        {/* 4. Segment Kontrolü ve Form Elemanları */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            4. Segment Kontrolü ve Kontrol Yükseklikleri
          </h2>
          <div style={{ maxWidth: 400 }}>
            <div className="segment-container">
              <button className="segment-item segment-item-active">◈ HABER AKIŞI</button>
              <button className="segment-item">⚡ KRİTİK OLAYLAR</button>
              <button className="segment-item">📊 METRİKLER</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
