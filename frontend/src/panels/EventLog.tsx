import { useEffect } from 'react';
import { useEventStore } from '../stores/useEventStore';
import { parseTimestamp } from '../lib/time';

function getSeverityColor(severity: string): string {
  const value = Number(severity);
  if (value >= 5) return 'var(--red)';
  if (value >= 4) return 'var(--amber)';
  if (value >= 3) return '#D97706';
  if (value >= 2) return 'var(--text-secondary)';
  return 'var(--text-muted)';
}

function shortTime(date: string): string {
  const parsed = parseTimestamp(date);
  if (!Number.isFinite(parsed)) return '--:--';

  return new Date(parsed).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function EventLog() {
  const { events, unreadCount, fetchEvents, markAllRead } = useEventStore();
  const visibleEvents = events.filter((event) => Number(event.severity) >= 3);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="panel-title">◈ OLAYLAR</span>
          {unreadCount > 0 ?
            <span
              style={{
                minWidth: 18,
                height: 18,
                borderRadius: 99,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 6px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                background: 'var(--red)',
                color: '#fff'
              }}
            >
              {unreadCount}
            </span>
          : null}
        </div>
        <button className="btn-ghost" onClick={markAllRead}>
          TEMIZLE
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visibleEvents.map((event) => (
          <div
            key={event.id}
            style={{
              height: 36,
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid var(--border)',
              animation: 'slide-down 0.2s'
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flexShrink: 0,
                background: getSeverityColor(event.severity),
                animation: Number(event.severity) === 5 ? 'blink-red 1.3s infinite' : 'none'
              }}
            />
            <span
              style={{
                flex: 1,
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {event.title}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
              {shortTime(event.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default EventLog;
