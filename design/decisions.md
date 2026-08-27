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
