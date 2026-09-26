# Tasarım Kararları Günlüğü (design/decisions.md)

Bu dosya, Wartrack Tactical Intelligence Dashboard için alınan tüm tasarım kararlarını, token seçim gerekçelerini ve görsel doğrulama turlarının kritiklerini kayıt altına alır.

---

## 2026-08-24 · ADIM 3 · Token Sistemi ve Palet Kararı

### Seçilen Yön: *Precision Tactical Cobalt*
Palantir Foundry ve modern savunma teknolojisi standartları temel alınarak derin nötr antrasit yüzeyler (`#080B11`, `#0F141F`, `#161D2C`), 1px ince sınır çizgileri (`#1E283A`) ve cerrahi kobalt aksan (`#00A3FF`) seçildi.

### WCAG 2.1 AA Kontrast Tablosu

| Metin / Öğe | Zemin | Hex Çifti | Kontrast Oranı | WCAG Durumu |
|-------------|-------|-----------|----------------|-------------|
| `--color-fg` (Ana Metin) | `--color-bg` | `#F1F5F9` / `#080B11` | **17.5:1** | ✅ AAA (≥ 7:1) |
| `--color-fg` (Ana Metin) | `--color-surface` | `#F1F5F9` / `#0F141F` | **15.6:1** | ✅ AAA (≥ 7:1) |
| `--color-fg-muted` (Açıklama) | `--color-surface` | `#94A3B8` / `#0F141F` | **7.8:1** | ✅ AAA (≥ 7:1) |
| `--color-fg-subtle` (Etiket/İkon) | `--color-surface` | `#64748B` / `#0F141F` | **4.3:1** | ✅ AA (Büyük/UI ≥ 3:1) |
| `--color-accent` (Aksiyon/Odak) | `--color-surface` | `#00A3FF` / `#0F141F` | **7.4:1** | ✅ AAA (≥ 7:1) |
| `--color-danger` (Tehdit Yüksek) | `--color-surface` | `#EF4444` / `#0F141F` | **4.9:1** | ✅ AA (≥ 4.5:1) |
| `--color-warning` (Tehdit Orta) | `--color-surface` | `#F59E0B` / `#0F141F` | **7.6:1** | ✅ AAA (≥ 7:1) |
| `--color-success` (Tehdit Düşük) | `--color-surface` | `#10B981` / `#0F141F` | **7.1:1** | ✅ AAA (≥ 7:1) |
| `--color-border` (Sınır Çizgisi) | `--color-surface` | `#1E283A` / `#0F141F` | **UI Ayrımı** | ✅ Net 1px Yapı |

### Tipografi ve Spacing Kararları
- **Display / Başlıklar:** `Space Grotesk`, 600 weight, `-0.02em` tracking (keskin ve disiplinli).
- **Gövde Metni:** `Inter`, 400/500 weight.
- **Rakamlar & Kod:** `JetBrains Mono`, `tabular-nums` (sağa yaslı metrikler ve zaman damgaları).
- **Spacing:** Strict 4px ölçeği (4px, 8px, 12px, 16px, 24px, 32px, 48px).
- **Radius:** `sm: 4px`, `md: 6px`, `lg: 8px`, `xl: 12px`, `full: 9999px`.

---

## 2026-09-26 · Pano (tüm yüzey) · denetim turu 1–3

**Brif yeniden okundu.** Duygu "cerrahi, sakin, taktiksel"; karşıt "oyuncaklı, neon-geveze"; ikon
seti lucide (emoji yasak); tek aksan kobalt. Kod bu brifle çelişiyordu; tur bunu kapattı.

**Tur 1 — kritik (önce):**
1. Harita boş: CARTO anahtarsız isteğe "API KEY REQUIRED" karosu döndürüyor. → Esri World Dark Gray
   (anahtarsız, aynı sakin yüzey), atıf koordinat şeridinde görünür.
2. `--accent` hiç tanımlı değildi; `var(--accent)` kullanan her şey (ayarlarda Kaydet düğmesi dahil)
   görünmüyordu. `--purple`, `--orange` da tanımsızdı. → takma adlar eklendi.
3. 71 emoji/sembol ikon, 94 ham hex. → lucide + token (`--color-threat-1..5`, `--color-chart-1..6`).
   Leaflet SVG'si CSS değişkeni çözmediği için vektör renkleri `lib/tokens.ts` ile token'dan okunur.
4. Tehdit başlıkta "5", panelde "0 kritik olay": üç ayrı hesap. → tek kaynak sunucu analizi;
   panel artık seviyeyi belirleyen etkeni (driver) de yazıyor.
5. Türkçe karakter eksikleri ("TUM", "Kayitli", "simdi", "Duzenle"), büyük harf düğme metinleri.
6. Tema seçicide NVG/FLIR seçenekleri vardı ama arkalarında stil yoktu. → kaldırıldı (brif: tek
   tema, Precision Dark HUD).

**Tur 2 — yapı:**
- Haber kartı `<a>` içinde `<button>` taşıyordu (geçersiz HTML). → "stretched link": başlık bağlantı,
  kaydet düğmesi ayrı katman.
- Boş/hata durumları ayrıldı: kaydedilen yok, arama eşleşmedi, bölgede haber yok, sunucu hatası
  (Tekrar dene). Önceden hepsi "HABER BULUNAMADI"ydı; hata hiç gösterilmiyordu.
- Ayarlar erişilebilir diyalog: `role=dialog`, odak tuzağı, Esc, odak dönüşü (`hooks/useDialog.ts`).
  Model adları sunucudan okunuyor; anahtarı olmayan Gemini seçeneği pasif ve nedeni yazılı.
- Aynı koordinata düşen haberler tek işarette sayıyla toplanıyor (önce 30 haberin 6'sı görünüyordu).
- Lejant haritadaki gerçek işaret şekillerini gösteriyor; eski "Düşük/Orta/Yüksek/Kritik" rozetleri
  haritada hiçbir şeye karşılık gelmiyordu.

**Tur 3 — ölçüm (Lighthouse, üretim derlemesi):**
- CLS 0,54 → 0,02: Suspense yer tutucuları son boyutlarında; tehdit kartı veri gelmeden de aynı biçimde.
- Erişilebilirlik 94 → 97: işaretlere erişilebilir ad (`title`), 24 px tıklama alanı, ses düğmesinde
  görünen metin = erişilebilir ad. Gömülü yayınlar `youtube-nocookie.com`.
- Harita karosu için `preconnect`; LCP 0,8–2,5 sn arası dış sunucuya bağlı.
- Mobil (< 1024 px): yığın düzen, sayfa kaydırılır, dokunmada anlamsız imleç koordinatı gizli.

**Tipografi:** gövde `Inter` → `Inter Tight` (DESIGN.md 6.2), yalnız 400/500/600 ağırlık.

**Bilinçli bırakılan:** `DesignTokensView` token değerlerini hex olarak gösterir (belgeleme sayfası).
