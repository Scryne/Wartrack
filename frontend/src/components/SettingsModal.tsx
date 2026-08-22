import { useEffect, useState, type ReactNode } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import { showToast } from './Toast';
import { ApiKeyError, apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/useAuthStore';
import { playTacticalPulse } from '../lib/audio';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 20,
        borderRadius: 20,
        border: '1px solid var(--border-strong)',
        background: checked ? 'var(--accent)' : 'var(--bg-elevated)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.12s'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: checked ? '#000' : 'var(--text-secondary)',
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          transition: 'all 0.12s'
        }}
      />
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: 1.5
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function SettingsModal() {
  const { open, rssInterval, autoSummarize, aiModel, threatSound, setOpen, update } = useSettingsStore();
  const { keywords, addKeyword, removeKeyword } = useWatchlistStore();
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const [saving, setSaving] = useState(false);
  const [watchInput, setWatchInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [healthData, setHealthData] = useState<{
    ok: boolean;
    uptimeSeconds?: number;
    database?: { ok: boolean; latencyMs: number };
    memory?: { rssMb: number; heapUsedMb: number };
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    void apiFetch('/api/diagnostics')
      .then((r) => r.json())
      .then((data) => setHealthData(data))
      .catch(() => setHealthData(null));
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        'rss.interval': String(rssInterval),
        'ai.autoSummarize': String(autoSummarize),
        'ai.model': aiModel,
        'threat.sound': String(threatSound)
      };
      const res = await apiFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOpen(false);
      showToast('Ayarlar kaydedildi', 'success');
    } catch (err) {
      // apiFetch already toasts a specific message for 401; don't stack a
      // second, vaguer one on top of it.
      if (!(err instanceof ApiKeyError)) {
        showToast('Ayarlar kaydedilemedi', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const clearFeedCache = async () => {
    try {
      await apiFetch('/api/feed/refresh', { method: 'POST' });
      showToast('Feed yenilemesi tetiklendi', 'info');
    } catch {
      showToast('Feed yenilenemedi', 'error');
    }
  };

  const clearAllPins = async () => {
    if (!window.confirm('Tum pinler silinecek. Emin misiniz?')) return;
    try {
      const pins = await apiFetch('/api/pins').then((r) => r.json());
      await Promise.all(
        (pins as Array<{ id: number }>).map((pin) =>
          apiFetch(`/api/pins/${pin.id}`, { method: 'DELETE' })
        )
      );
      showToast('Tum pinler silindi', 'success');
    } catch {
      showToast('Pinler silinemedi', 'error');
    }
  };

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-overlay)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxHeight: '90vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            height: 40,
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px'
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 2 }}>AYARLAR</span>
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            x
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Section title="GUVENLIK">
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Yazma islemleri (pin, ayar, yenileme) icin paylasilan anahtar gerekir.
              Sunucudaki <code>API_SHARED_SECRET</code> degeriyle ayni olmali.
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API anahtari"
                autoComplete="off"
                spellCheck={false}
                aria-label="API anahtari"
                style={{
                  flex: 1,
                  height: 30,
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${apiKey ? 'rgba(0,208,132,0.35)' : 'rgba(255,59,59,0.35)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '0 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? 'Anahtari gizle' : 'Anahtari goster'}
                style={{ border: '1px solid var(--border)', minWidth: 34 }}
              >
                {showApiKey ? '🙈' : '👁'}
              </button>
            </div>
            {!apiKey ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)' }}>
                Anahtar girilmedi — yazma islemleri reddedilecek.
              </span>
            ) : null}
          </Section>

          <Section title="VERI">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>RSS Yenileme</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[5, 10, 15, 30].map((v) => {
                  const active = rssInterval === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => update({ rssInterval: v as 5 | 10 | 15 | 30 })}
                      className={active ? '' : 'btn-ghost'}
                      style={
                        active
                          ? {
                              border: '1px solid rgba(0,170,255,0.35)',
                              background: 'var(--accent-dim)',
                              color: 'var(--accent)',
                              padding: '5px 10px',
                              borderRadius: 'var(--radius-sm)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              cursor: 'pointer'
                            }
                          : undefined
                      }
                    >
                      {v}dk
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="AI">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <input
                  type="radio"
                  checked={aiModel === 'ollama'}
                  onChange={() => update({ aiModel: 'ollama' })}
                />
                Ollama (Lokal)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <input
                  type="radio"
                  checked={aiModel === 'gemini'}
                  onChange={() => update({ aiModel: 'gemini' })}
                />
                Gemini Flash
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Otomatik ozetleme</span>
              <Toggle checked={autoSummarize} onChange={(v) => update({ autoSummarize: v })} />
            </div>
          </Section>

          <Section title="BILDIRIM">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Tehdit sesi (severity 4+ olayda alarm)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    playTacticalPulse('critical');
                    showToast('Taktik alarm sesi çalındı', 'info');
                  }}
                  className="btn-ghost"
                  style={{ fontSize: 10, padding: '3px 8px', border: '1px solid var(--border)' }}
                >
                  🔊 Test Et
                </button>
                <Toggle checked={threatSound} onChange={(v) => update({ threatSound: v })} />
              </div>
            </div>
          </Section>

          <Section title="SISTEM TESHIS & GOZLEMLENEBILIRLIK">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '10px 12px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Backend Durumu:</span>
                <span style={{ color: healthData?.ok ? 'var(--green)' : 'var(--red)' }}>
                  {healthData ? (healthData.ok ? '✓ ÇALIŞIYOR' : '✕ HATA') : '...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>SQLite Gecikmesi:</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {typeof healthData?.database?.latencyMs === 'number' ? `${healthData.database.latencyMs} ms` : '--'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Uptime:</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {typeof healthData?.uptimeSeconds === 'number' ? `${Math.floor(healthData.uptimeSeconds / 60)} dk` : '--'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Bellek (Heap / RSS):</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {healthData?.memory ? `${healthData.memory.heapUsedMb} MB / ${healthData.memory.rssMb} MB` : '--'}
                </span>
              </div>
            </div>
          </Section>

          <Section title="VERITABANI & BAKIM">
            <button className="btn-ghost" onClick={() => void clearFeedCache()} style={{ border: '1px solid var(--border)' }}>
              Feed Onbellek Temizle
            </button>
            <button
              className="btn-ghost"
              onClick={() => void clearAllPins()}
              style={{ border: '1px solid rgba(255,59,59,0.35)', color: 'var(--red)' }}
            >
              Tum Pinleri Sil
            </button>
          </Section>

          <Section title="IZLEME LISTESI">
            <input
              type="text"
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              placeholder="Natanz, Rafah, Hormuz..."
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const value = watchInput.trim();
                if (!value) return;
                addKeyword(value);
                setWatchInput('');
              }}
              style={{
                width: '100%',
                height: 30,
                background: 'var(--bg-elevated)',
                border: '1px solid rgba(245,166,35,0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '0 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />

            {keywords.length === 0 ? (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-muted)'
                }}
              >
                Henuz izleme kelimesi eklenmedi.
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {keywords.map((keyword) => (
                  <span
                    key={keyword}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 24,
                      padding: '0 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(245,166,35,0.45)',
                      background: 'rgba(245,166,35,0.1)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: '#F5A623'
                    }}
                  >
                    <span>{keyword}</span>
                    <button
                      type="button"
                      onClick={() => removeKeyword(keyword)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#F5A623',
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 1,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)'
                      }}
                      aria-label={`${keyword} kaldir`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Section>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              width: '100%',
              height: 34,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              color: '#001018',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: 1
            }}
          >
            {saving ? 'KAYDEDILIYOR...' : 'KAYDET'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
