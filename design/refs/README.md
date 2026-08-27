# Referans Notları ve Tasarım Yönü (design/refs/README.md)

Bu dosya, Wartrack Tactical Intelligence Dashboard için belirlenen profesyonel görsel yönü ve taklit edilecek bileşen anatomilerini belgeler.

---

## 1. Seçilen Görsel Yön: *Sleek Modern Defense & Tactical Intelligence*
- **Karakter:** Palantir Foundry / Anduril Lattice / Linear seviyesinde cerrahi netlik, nötr koyu katmanlar, düşük görsel gürültü.
- **Yasaklar:** Mor-pembe gradientler, oyuncaklı parıltılar, gereksiz glassmorphism, karmaşık neon efektleri.
- **Aksan:** Tek bir taktik aksan (Cyan `#00D2FF` veya Precision Amber `#F59E0B`) + semantik durum renkleri (Tehdit 1-5).

---

## 2. Referans Mimarisi (Neyi Alıyoruz / Neyi Almıyoruz)

### Ref 1: `01-palantir-foundry-c2` (Operasyonel Harita ve C2 Düzeni)
- **ALIYORUZ:** Harita ile paneller arasındaki 1px sakin ayırıcı çizgiler, harita üzerinde yüzen mikro-araç çubukları (DrawToolbar, Legend), yüksek kontrastlı koyu kartografik zemin.
- **ALMIYORUZ:** Çok karmaşık GIS menüleri.

### Ref 2: `02-anduril-threat-matrix` (Tehdit Ölçer ve KPI Anatomisi)
- **ALIYORUZ:** Tehdit skoru anatomisi (etiket → büyük skor → hız/itici etkenler), 5 kademeli renk skalası (Defcon/Tehdit seviyesi), kompakt sparkline/bar gösterimi.
- **ALMIYORUZ:** Sayfa genelinde agresif kırmızı tonlar.

### Ref 3: `03-linear-dark-surface` (Yüzey ve Tipografi Hiyerarşisi)
- **ALIYORUZ:** 3 seviyeli koyu yüzey katmanları (void `#090C10` → surface `#121721` → sunken `#182030`), 36px kontrol yüksekliği, 8px/6px radius tutarlılığı.
- **ALMIYORUZ:** Yumuşak/pazarlamacı geniş boşluklar (taktik yoğunluk korunacak).

### Ref 4: `04-sentinel-event-stream` (Canlı Akış ve Olay Kartları)
- **ALIYORUZ:** FeedCard ve EventLog anatomisi (kaynak ikonu + zaman + teyit rozeti + coğrafi etiket + başlık), 22px durum rozetleri, seçili öğe vurgusu.
- **ALMIYORUZ:** Zebra çizgileri ve rastgele renkli etiketler.

### Ref 5: `05-raycast-command-palette` (Komut Paleti ve Modallar)
- **ALIYORUZ:** Cmd+K arama girdi anatomisi, klavye kısayol tuşları (`kbd`), kategori başlıkları (11px/600/+0.06em), temiz backdrop blur (2px).
- **ALMIYORUZ:** Aşırı büyük modal gölgeleri.
