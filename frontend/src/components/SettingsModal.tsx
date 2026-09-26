import { useEffect, useState, type ReactNode } from 'react';
import { Activity, Database, Eye, EyeOff, KeyRound, Play, RefreshCw, Save, Settings2, Trash2, X } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import { showToast } from './Toast';
import { ApiKeyError, apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/useAuthStore';
import { playTacticalPulse } from '../lib/audio';
import { useDialog } from '../hooks/useDialog';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="wt-switch" onClick={() => onChange(!checked)}>
      <span className="wt-switch-thumb" />
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="wt-settings-section">
      <h3 className="wt-eyebrow">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="wt-settings-row">
      <div className="wt-settings-row-text">
        <span>{label}</span>
        {hint ? <span className="wt-settings-hint">{hint}</span> : null}
      </div>
      <div className="wt-settings-row-control">{children}</div>
    </div>
  );
}

type SettingsTab = 'general' | 'intelligence' | 'security' | 'diagnostics';

const TABS: Array<{ id: SettingsTab; label: string; Icon: typeof Settings2 }> = [
  { id: 'general', label: 'Genel', Icon: Settings2 },
  { id: 'intelligence', label: 'İzleme', Icon: Eye },
  { id: 'security', label: 'Erişim', Icon: KeyRound },
  { id: 'diagnostics', label: 'Sistem ve yedek', Icon: Activity }
];

interface AiStatus {
  ollamaModel?: string;
  geminiModel?: string;
  geminiConfigured?: boolean;
}

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
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(open, () => setOpen(false));

  const refreshDiagnostics = () => {
    void apiFetch('/api/diagnostics')
      .then((r) => r.json())
      .then((data) => setHealthData(data))
      .catch(() => setHealthData(null));
  };

  useEffect(() => {
    if (!open) return;
    refreshDiagnostics();
    void apiFetch('/api/summarize/status')
      .then((r) => r.json())
      .then((data: AiStatus) => setAiStatus(data))
      .catch(() => setAiStatus(null));
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
      showToast(`Yedek alındı: ${(data.sizeBytes / 1024).toFixed(1)} KB, bütünlük denetimi geçti`, 'success');
      refreshDiagnostics();
    } catch (err) {
      if (!(err instanceof ApiKeyError)) {
        const msg = err instanceof Error ? `Yedek alınamadı: ${err.message}` : 'Yedek alınamadı';
        showToast(msg, 'error');
      }
    } finally {
      setBackingUp(false);
    }
  };

  const clearFeedCache = async () => {
    try {
      await apiFetch('/api/feed/refresh', { method: 'POST' });
      showToast('Kaynaklar taranıyor; yeni haberler birkaç saniye içinde düşer', 'info');
    } catch {
      showToast('Tarama başlatılamadı. Sunucu bağlantısını kontrol edin.', 'error');
    }
  };

  const clearAllPins = async () => {
    if (!window.confirm('Haritadaki tüm elle konan işaretler kalıcı olarak silinecek. Devam edilsin mi?')) return;
    try {
      const pins = await apiFetch('/api/pins').then((r) => r.json());
      await Promise.all(
        (pins as Array<{ id: number }>).map((pin) =>
          apiFetch(`/api/pins/${pin.id}`, { method: 'DELETE' })
        )
      );
      showToast('Tüm işaretler silindi', 'success');
    } catch {
      showToast('İşaretler silinemedi. Sunucu bağlantısını kontrol edin.', 'error');
    }
  };

  const ollamaLabel = aiStatus?.ollamaModel ? `Yerel model · ${aiStatus.ollamaModel}` : 'Yerel model (Ollama)';
  const geminiLabel = aiStatus?.geminiModel ? `Gemini · ${aiStatus.geminiModel}` : 'Gemini (bulut)';
  const geminiDisabled = aiStatus ? !aiStatus.geminiConfigured : false;

  return (
    <div className="wt-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="wt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wt-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wt-modal-header">
          <h2 id="wt-settings-title" className="wt-modal-title">
            Ayarlar
          </h2>
          <button type="button" className="btn-ghost wt-icon-button" aria-label="Ayarları kapat" onClick={() => setOpen(false)}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="wt-tabs wt-modal-tabs" role="tablist" aria-label="Ayar bölümleri">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className="wt-tab"
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="wt-modal-body" role="tabpanel">
          {activeTab === 'general' && (
            <>
              <Section title="Tarama">
                <Row label="Kaynak tarama aralığı" hint="15 haber kaynağı bu sıklıkla taranır.">
                  <div className="segment-container" role="radiogroup" aria-label="Tarama aralığı">
                    {[5, 10, 15, 30].map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={rssInterval === v}
                        className={`segment-item${rssInterval === v ? ' segment-item-active' : ''}`}
                        onClick={() => update({ rssInterval: v as 5 | 10 | 15 | 30 })}
                      >
                        {v} dk
                      </button>
                    ))}
                  </div>
                </Row>
              </Section>

              <Section title="Yapay zekâ">
                <div className="wt-radio-group" role="radiogroup" aria-label="Özet sağlayıcısı">
                  <label className="wt-radio">
                    <input type="radio" name="wt-ai" checked={aiModel === 'ollama'} onChange={() => update({ aiModel: 'ollama' })} />
                    <span>
                      {ollamaLabel}
                      <span className="wt-settings-hint">Bu bilgisayarda çalışır, veri dışarı çıkmaz.</span>
                    </span>
                  </label>
                  <label className="wt-radio" data-disabled={geminiDisabled}>
                    <input
                      type="radio"
                      name="wt-ai"
                      checked={aiModel === 'gemini'}
                      disabled={geminiDisabled}
                      onChange={() => update({ aiModel: 'gemini' })}
                    />
                    <span>
                      {geminiLabel}
                      <span className="wt-settings-hint">
                        {geminiDisabled ? 'Kullanmak için sunucuda GEMINI_API_KEY tanımlayın.' : 'Yerel model çalışmazsa yedek olarak da kullanılır.'}
                      </span>
                    </span>
                  </label>
                </div>
                <Row label="Yeni haberleri otomatik özetle" hint="Kapalıyken özet yalnız istenince üretilir.">
                  <Toggle label="Otomatik özet" checked={autoSummarize} onChange={(v) => update({ autoSummarize: v })} />
                </Row>
              </Section>

              <Section title="Sesli uyarı">
                <Row label="Kritik olayda ses çal" hint="Şiddet 3 ve üzeri olaylar ve seviye artışı.">
                  <button
                    type="button"
                    className="btn-secondary wt-btn-sm"
                    onClick={() => {
                      playTacticalPulse('critical');
                      showToast('Deneme sesi çalındı', 'info');
                    }}
                  >
                    <Play size={13} strokeWidth={1.75} aria-hidden="true" />
                    Dene
                  </button>
                  <Toggle label="Sesli uyarı" checked={threatSound} onChange={(v) => update({ threatSound: v })} />
                </Row>
              </Section>
            </>
          )}

          {activeTab === 'intelligence' && (
            <>
              <Section title="İzlenen kelimeler">
                <p className="wt-settings-hint">
                  Başlığında bu kelimeler geçen haberler listenin başına alınır, haritada halkayla işaretlenir ve üst çubukta sayılır.
                </p>
                <label className="wt-search">
                  <span className="sr-only">İzlenecek kelime</span>
                  <input
                    type="text"
                    value={watchInput}
                    onChange={(e) => setWatchInput(e.target.value)}
                    placeholder="Kelime yazıp Enter'a basın: Natanz, Hürmüz, Rafah"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      const value = watchInput.trim();
                      if (!value) return;
                      addKeyword(value);
                      setWatchInput('');
                    }}
                  />
                </label>

                {keywords.length === 0 ? (
                  <p className="wt-settings-hint">Henüz izlenen kelime yok.</p>
                ) : (
                  <ul className="wt-chips">
                    {keywords.map((keyword) => (
                      <li key={keyword} className="wt-chip">
                        {keyword}
                        <button type="button" onClick={() => removeKeyword(keyword)} aria-label={`${keyword} kelimesini kaldır`}>
                          <X size={12} strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Kaynaklar">
                <Row label="Tüm kaynakları şimdi tara" hint="Zamanlanmış taramayı beklemeden çalıştırır.">
                  <button type="button" className="btn-secondary wt-btn-sm" onClick={() => void clearFeedCache()}>
                    <RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
                    Tara
                  </button>
                </Row>
              </Section>
            </>
          )}

          {activeTab === 'security' && (
            <Section title="API anahtarı">
              <p className="wt-settings-hint">
                İşaret ekleme, ayar değiştirme, yedek alma ve canlı akış bu anahtarı ister. Sunucudaki <code>API_SHARED_SECRET</code> ile aynı olmalıdır;
                bu tarayıcıda saklanır, sunucuya ayar olarak yazılmaz.
              </p>
              <div className="wt-key-row">
                <label className="wt-search">
                  <span className="sr-only">API anahtarı</span>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="64 karakterlik anahtar"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="wt-key-status"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary wt-icon-button"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? 'Anahtarı gizle' : 'Anahtarı göster'}
                  aria-pressed={showApiKey}
                >
                  {showApiKey ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
                </button>
              </div>
              <p id="wt-key-status" className="wt-settings-status" data-ok={Boolean(apiKey)}>
                {apiKey
                  ? 'Anahtar kayıtlı.'
                  : 'Anahtar yok: yazma işlemleri ve canlı akış sunucu tarafından reddedilir.'}
              </p>
            </Section>
          )}

          {activeTab === 'diagnostics' && (
            <>
              <Section title="Sistem durumu">
                <dl className="wt-kv">
                  <div>
                    <dt>Sunucu</dt>
                    <dd data-tone={healthData ? (healthData.ok ? 'ok' : 'bad') : undefined}>
                      {healthData ? (healthData.ok ? 'Çalışıyor' : 'Hata') : 'Bekleniyor…'}
                    </dd>
                  </div>
                  <div>
                    <dt>Veritabanı gecikmesi</dt>
                    <dd>{typeof healthData?.database?.latencyMs === 'number' ? `${healthData.database.latencyMs} ms` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Çalışma süresi</dt>
                    <dd>{typeof healthData?.uptimeSeconds === 'number' ? `${Math.floor(healthData.uptimeSeconds / 60)} dk` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Bellek (heap / toplam)</dt>
                    <dd>{healthData?.memory ? `${healthData.memory.heapUsedMb} / ${healthData.memory.rssMb} MB` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Veritabanı yedekleri</dt>
                    <dd>{typeof healthData?.backups?.total === 'number' ? `${healthData.backups.total} adet` : '—'}</dd>
                  </div>
                </dl>
              </Section>

              <Section title="Yedek">
                <Row label="Veritabanının anlık yedeğini al" hint="Çalışırken alınır, bütünlüğü ve SHA-256 özeti doğrulanır.">
                  <button type="button" className="btn-secondary wt-btn-sm" onClick={() => void createSnapshot()} disabled={backingUp}>
                    <Database size={13} strokeWidth={1.75} aria-hidden="true" />
                    {backingUp ? 'Alınıyor…' : 'Yedek al'}
                  </button>
                </Row>
              </Section>

              <Section title="Tehlikeli bölge">
                <Row label="Tüm elle konan işaretleri sil" hint="Geri alınamaz. Haberlerden gelen noktalar etkilenmez.">
                  <button type="button" className="btn-secondary wt-btn-sm wt-btn-danger" onClick={() => void clearAllPins()}>
                    <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
                    İşaretleri sil
                  </button>
                </Row>
              </Section>
            </>
          )}
        </div>

        <footer className="wt-modal-footer">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Vazgeç
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
            <Save size={14} strokeWidth={1.75} aria-hidden="true" />
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default SettingsModal;
