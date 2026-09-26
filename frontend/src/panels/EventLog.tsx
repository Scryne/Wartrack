import { useEffect } from 'react';
import { useEventStore } from '../stores/useEventStore';
import { parseTimestamp } from '../lib/time';
import { severityColor } from '../lib/threat';

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
  const { events, unreadCount, loading, fetchEvents, markAllRead } = useEventStore();
  const visibleEvents = events.filter((event) => Number(event.severity) >= 3);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return (
    <section className="panel" aria-labelledby="wt-events-title">
      <div className="panel-header">
        <div className="wt-panel-heading">
          <h2 id="wt-events-title" className="panel-title">
            Kritik olaylar
          </h2>
          {unreadCount > 0 ? (
            <span className="wt-count wt-count-alert" aria-label={`${unreadCount} okunmamış olay`}>
              {unreadCount} yeni
            </span>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <button type="button" className="btn-ghost" onClick={markAllRead}>
            Okundu işaretle
          </button>
        ) : null}
      </div>

      <p className="wt-events-hint">Şiddet 3 ve üzeri, bölgeye bağlanan haberlerden çıkarılan olaylar.</p>

      <ol className="wt-event-list" aria-busy={loading}>
        {loading && visibleEvents.length === 0
          ? [1, 2, 3, 4, 5].map((key) => <li key={key} className="wt-event wt-skeleton" aria-hidden="true" />)
          : null}

        {!loading && visibleEvents.length === 0 ? (
          <li className="wt-empty">
            <p className="wt-empty-title">Son 2 günde kritik olay yok</p>
            <p className="wt-empty-body">Şiddet 3 ve üzeri bir olay çıkarıldığında burada ve haritada görünür.</p>
          </li>
        ) : null}

        {visibleEvents.map((event) => (
          <li key={event.id} className="wt-event">
            <span
              className="wt-event-severity"
              style={{ color: severityColor(event.severity), borderColor: severityColor(event.severity) }}
              title={`Şiddet ${event.severity}/5`}
            >
              {event.severity}
            </span>
            <span className="wt-event-title" title={event.title}>
              {event.title}
            </span>
            <span className="wt-event-source">{event.source}</span>
            <time className="wt-event-time" dateTime={event.createdAt}>
              {shortTime(event.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default EventLog;
