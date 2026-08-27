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

type SettingsTab = 'general' | 'intelligence' | 'security' | 'diagnostics';

function SettingsModal() {
  const { open, rssInterval, autoSummarize, aiModel, threatSound, setOpen, update } = useSettingsStore();
  const { keywords, addKeyword, removeKeyword } = useWatchlistStore();
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [watchInput, setWatchInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [healthData, setHealthData] = useState<{
    ok: boolean;
    uptimeSeconds?: number;
    database?: { ok: boolean; latencyMs: number };
    memory?: { rssMb: number; heapUsedMb: number };
    backups?: { total: number; lastBackupAt: string | null };
  } | null>(null);

  const refreshDiagnostics = () => {
    void apiFetch('/api/diagnostics')
      .then((r) => r.json())
      .then((data) => setHealthData(data))
      .catch(() => setHealthData(null));
  };

  useEffect(() => {
    if (!open) return;
    refreshDiagnostics();
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
      if (!(err instanceof ApiKeyError)) {
        showToast('Ayarlar kaydedilemedi', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const createSnapshot = async () => {
    setBackingUp(true);
    try {
      const res = await apiFetch('/api/backup/create', { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      playTacticalPulse('ping');
      showToast(`Yedek oluşturuldu (${(data.sizeBytes / 1024).toFixed(1)} KB)`, 'success');
      refreshDiagnostics();
    } catch (err) {
      if (!(err instanceof ApiKeyError)) {
        const msg = err instanceof Error ? err.message : 'Yedek oluşturulamadı';
        showToast(msg, 'error');
      }
    } finally {
      setBackingUp(false);
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
          width: 520,
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
        {/* Header */}
        <div
          style={{
            height: 42,
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: 'var(--bg-elevated)'
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 2 }}>AYARLAR</span>
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-void)',
            padding: '4px 8px',
            gap: 4
          }}
        >
          <button
            type="button"
            className={activeTab === 'general' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setActiveTab('general')}
            style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 8px' }}
          >
            ⚙ GENEL
          </button>
          <button
            type="button"
            className={activeTab === 'intelligence' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setActiveTab('intelligence')}
            style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 8px' }}
          >
            ◈ İSTİHBARAT
          </button>
          <button
            type="button"
            className={activeTab === 'security' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setActiveTab('security')}
            style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 8px' }}
          >
            🔒 GÜVENLİK
          </button>
          <button
            type="button"
            className={activeTab === 'diagnostics' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setActiveTab('diagnostics')}
            style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 8px' }}
          >
            📊 TEŞHİS & YEDEK
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'general' && (
            <>
              <Section title="VERİ VE TARAMA SIKLIĞI">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>RSS Tarama Aralığı</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[5, 10, 15, 30].map((v) => {
                      const active = rssInterval === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => update({ rssInterval: v as 5 | 10 | 15 | 30 })}
                          className={active ? 'btn-primary' : 'btn-ghost'}
                          style={{
                            padding: '4px 8px',
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)'
                          }}
                        >
                          {v}dk
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Section>

              <Section title="YAPAY ZEKA SAĞLAYICISI">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={aiModel === 'ollama'}
                      onChange={() => update({ aiModel: 'ollama' })}
                    />
                    Ollama (Yerel Model — llama3.2:3b)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={aiModel === 'gemini'}
                      onChange={() => update({ aiModel: 'gemini' })}
                    />
                    Google Gemini 2.0 Flash (Bulut)
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Otomatik Türkçe Özetleme</span>
                  <Toggle checked={autoSummarize} onChange={(v) => update({ autoSummarize: v })} />
                </div>
              </Section>

              <Section title="SESLİ TAKTİK BİLDİRİMLER">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Tehdit ve kritik olay sesleri (Web Audio Synth)
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
            </>
          )}

          {activeTab === 'intelligence' && (
            <>
              <Section title="İZLEME KELİMELERİ (WATCHLIST)">
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Başlıklarında bu kelimeler geçen haberler öncelikli işaretlenir ve üst çubukta sayılır.
                </span>
                <input
                  type="text"
                  value={watchInput}
                  onChange={(e) => setWatchInput(e.target.value)}
                  placeholder="Natanz, Rafah, Hürmüz, Balistik..."
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
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    Henüz izleme kelimesi eklenmedi.
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
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="AKIŞ İŞLEMLERİ">
                <button className="btn-ghost" onClick={() => void clearFeedCache()} style={{ border: '1px solid var(--border)', textAlign: 'left' }}>
                  🔄 Haber Akışlarını Yeniden Tara ve Güncelle
                </button>
              </Section>
            </>
          )}

          {activeTab === 'security' && (
            <Section title="API SHARED SECRET KİMLİK DOĞRULAMA">
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Yazma işlemleri (pin ekleme, ayar değiştirme, yedekleme) ve Socket.IO canlı akışı için paylaşılan sır anahtarı gereklidir.
                Sunucudaki <code>API_SHARED_SECRET</code> değeriyle birebir eşleşmelidir.
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="64 karakterlik API anahtarı"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="API anahtarı"
                  style={{
                    flex: 1,
                    height: 32,
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
                  aria-label={showApiKey ? 'Anahtarı gizle' : 'Anahtarı göster'}
                  style={{ border: '1px solid var(--border)', minWidth: 36 }}
                >
                  {showApiKey ? '🙈' : '👁'}
                </button>
              </div>
              {!apiKey ? (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)' }}>
                  ⚠ Anahtar girilmedi — yazma ve soket işlemleri sunucu tarafından reddedilecek.
                </span>
              ) : (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>
                  ✓ API Anahtarı kayıtlı.
                </span>
              )}
            </Section>
          )}

          {activeTab === 'diagnostics' && (
            <>
              <Section title="SİSTEM TEŞHİS & GÖZLEMLENEBİLİRLİK">
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
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Mevcut DB Yedekleri:</span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {typeof healthData?.backups?.total === 'number' ? `${healthData.backups.total} snapshot` : '--'}
                    </span>
                  </div>
                </div>
              </Section>

              <Section title="VERİTABANI & FELAKET KURTARMA">
                <button
                  className="btn-ghost"
                  onClick={() => void createSnapshot()}
                  disabled={backingUp}
                  style={{
                    border: '1px solid rgba(0,170,255,0.35)',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <span>💾</span>
                  <span>{backingUp ? 'Yedek Alınıyor...' : 'Anlık Veritabanı Yedeği Al (Snapshot)'}</span>
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => void clearAllPins()}
                  style={{ border: '1px solid rgba(255,59,59,0.35)', color: 'var(--red)', textAlign: 'center' }}
                >
                  Tüm Taktik Pinleri Sil
                </button>
              </Section>
            </>
          )}

          {/* Footer Save button */}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              width: '100%',
              height: 36,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              color: '#001018',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: 1,
              marginTop: 4
            }}
          >
            {saving ? 'KAYDEDİLİYOR...' : 'KAYDET VE KAPAT'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;

