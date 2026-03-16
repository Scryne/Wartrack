import { useEffect, useState } from 'react';
import { useMapStore } from '../stores/useMapStore';
import type { Pin } from '../types';

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

  useEffect(() => {
    if (!pinDrawerOpen) return;
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
    if (!title.trim()) return;

    try {
      if (editingPin) {
        await updatePin(editingPin.id, {
          title: title.trim(),
          description: description.trim(),
          category
        });
        closeDrawer();
        return;
      }

      if (!draftLatLng) return;
      const res = await fetch('/api/pins', {
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
      if (!res.ok) throw new Error('pin create failed');
      const pin = (await res.json()) as Pin;
      addPin(pin);
      setTitle('');
      setDescription('');
      setCategory('info');
      setDraftLatLng(null);
      setPinMode(false);
      closeDrawer();
    } catch {
      return;
    }
  };

  return (
    <aside
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: 280,
        zIndex: 'var(--z-map-panels)',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-strong)',
        transition: 'transform 0.2s ease-out',
        transform: pinDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div className="panel-header" style={{ background: 'transparent' }}>
        <span className="panel-title">{editingPin ? 'PINI DUZENLE' : 'YENI PIN'}</span>
        <button className="btn-ghost" onClick={onClose}>
          x
        </button>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Baslik"
          style={{
            height: 30,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            padding: '0 9px',
            borderRadius: 'var(--radius-sm)'
          }}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Aciklama"
          rows={4}
          style={{
            resize: 'none',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            padding: 9,
            borderRadius: 'var(--radius-sm)'
          }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {['strike', 'movement', 'nuclear', 'naval', 'air', 'info'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item as Pin['category'])}
              style={{
                border: '1px solid var(--border)',
                background: category === item ? 'var(--accent-dim)' : 'transparent',
                color: category === item ? 'var(--accent)' : 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 6px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                cursor: 'pointer'
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          style={{
            height: 32,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'var(--accent)',
            color: '#001018',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          {editingPin ? 'PINI GUNCELLE' : 'PIN KAYDET'}
        </button>
      </div>
    </aside>
  );
}

export default PinDrawer;
