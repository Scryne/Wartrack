import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useMapStore } from '../stores/useMapStore';
import type { Pin } from '../types';
import { ApiKeyError, apiFetch } from '../lib/api';
import { showToast } from './Toast';
import { PIN_COLOR } from '../panels/mapPanel/mapUtils';

const CATEGORIES: Array<{ id: Pin['category']; label: string }> = [
  { id: 'strike', label: 'Taarruz' },
  { id: 'movement', label: 'Hareket' },
  { id: 'nuclear', label: 'Nükleer' },
  { id: 'naval', label: 'Deniz' },
  { id: 'air', label: 'Hava' },
  { id: 'info', label: 'Bilgi' }
];

interface PinDrawerProps {
  draftLatLng: [number, number] | null;
  setDraftLatLng: (value: [number, number] | null) => void;
  setPinMode: (value: boolean) => void;
}

function PinDrawer({ draftLatLng, setDraftLatLng, setPinMode }: PinDrawerProps) {
  const pinDrawerOpen = useMapStore((s) => s.pinDrawerOpen);
  const editingPin = useMapStore((s) => s.editingPin);
  const addPin = useMapStore((s) => s.addPin);
  const updatePin = useMapStore((s) => s.updatePin);
  const closeDrawer = useMapStore((s) => s.closeDrawer);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Pin['category']>('info');
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (!pinDrawerOpen) return;
    setTitleError(false);
    if (editingPin) {
      setTitle(editingPin.title);
      setDescription(editingPin.description ?? '');
      setCategory(editingPin.category);
      return;
    }
    setTitle('');
    setDescription('');
    setCategory('info');
  }, [pinDrawerOpen, editingPin]);

  const onClose = () => {
    closeDrawer();
    setDraftLatLng(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }

    setSaving(true);
    try {
      if (editingPin) {
        await updatePin(editingPin.id, { title: title.trim(), description: description.trim(), category });
        closeDrawer();
        showToast('İşaret güncellendi', 'success');
        return;
      }

      if (!draftLatLng) return;
      const res = await apiFetch('/api/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: draftLatLng[0],
          lng: draftLatLng[1],
          title: title.trim(),
          description: description.trim(),
          category
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pin = (await res.json()) as Pin;
      addPin(pin);
      setTitle('');
      setDescription('');
      setCategory('info');
      setDraftLatLng(null);
      setPinMode(false);
      closeDrawer();
      showToast('İşaret haritaya eklendi', 'success');
    } catch (err) {
      // A missing or wrong key already raised its own toast in apiFetch.
      if (!(err instanceof ApiKeyError)) {
        showToast('İşaret kaydedilemedi. Sunucu bağlantısını kontrol edip tekrar deneyin.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const position = editingPin ? ([editingPin.lat, editingPin.lng] as [number, number]) : draftLatLng;

  return (
    <aside className="wt-brief wt-pin-drawer" data-open={pinDrawerOpen} aria-hidden={!pinDrawerOpen} aria-labelledby="wt-pin-title">
      <header className="wt-brief-header">
        <h2 id="wt-pin-title" className="wt-brief-title">
          {editingPin ? 'İşareti düzenle' : 'Yeni işaret'}
        </h2>
        <button type="button" className="btn-ghost wt-icon-button" onClick={onClose} aria-label="Kapat" tabIndex={pinDrawerOpen ? 0 : -1}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>

      <form
        className="wt-brief-body wt-pin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <p className="wt-settings-hint">
          {position
            ? `Konum: ${position[0].toFixed(4)}, ${position[1].toFixed(4)}`
            : 'Konum seçmek için haritada bir noktaya tıklayın.'}
        </p>

        <label className="wt-field">
          <span className="wt-field-label">Başlık</span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) setTitleError(false);
            }}
            placeholder="Ör. Hayfa limanı, hava savunma aktivitesi"
            aria-invalid={titleError}
            aria-describedby={titleError ? 'wt-pin-title-error' : undefined}
            tabIndex={pinDrawerOpen ? 0 : -1}
          />
          {titleError ? (
            <span id="wt-pin-title-error" className="wt-field-error">
              Başlık gerekli: işaret haritada bu adla görünür.
            </span>
          ) : null}
        </label>

        <label className="wt-field">
          <span className="wt-field-label">Not (isteğe bağlı)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kaynak, saat veya gözlem ayrıntısı"
            rows={4}
            tabIndex={pinDrawerOpen ? 0 : -1}
          />
        </label>

        <fieldset className="wt-field">
          <legend className="wt-field-label">Tür</legend>
          <div className="wt-pin-categories" role="radiogroup" aria-label="İşaret türü">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={category === item.id}
                className="wt-legend-item"
                onClick={() => setCategory(item.id)}
                tabIndex={pinDrawerOpen ? 0 : -1}
              >
                <span className="wt-legend-swatch wt-legend-diamond" style={{ '--marker-color': PIN_COLOR[item.id] } as React.CSSProperties} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn-primary" disabled={saving || (!editingPin && !draftLatLng)} tabIndex={pinDrawerOpen ? 0 : -1}>
          {saving ? 'Kaydediliyor…' : editingPin ? 'Değişiklikleri kaydet' : 'İşareti kaydet'}
        </button>
      </form>
    </aside>
  );
}

export default PinDrawer;
