function MediaPanel() {
  return (
    <section className="panel">
      <div className="panel-header" style={{ height: 32, minHeight: 32, padding: '0 12px' }}>
        <span className="panel-title" style={{ fontFamily: 'var(--font-display)', fontSize: 12 }}>
          ▶ CANLI YAYIN
        </span>
        <a
          href="https://www.youtube.com/watch?v=4E-iFtUM2kk"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            textDecoration: 'none'
          }}
        >
          YouTube'da Aç ↗
        </a>
      </div>

      <iframe
        width="100%"
        height="calc(100% - 32px)"
        style={{ width: '100%', height: 'calc(100% - 32px)', border: 'none', display: 'block' }}
        src="https://www.youtube.com/embed/4E-iFtUM2kk?rel=0&modestbranding=1&iv_load_policy=3"
        title="WARTRACKER YouTube"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        allowFullScreen
      />
    </section>
  );
}

export default MediaPanel;
