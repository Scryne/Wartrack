# DURUM — Wartrack — coğrafi olay izleme panosu

> **Ne bu dosya:** sertifika değil **envanter**. 2026-08-27 denetiminde ölçülen gerçek durum.
> "Çalışmıyor" yazan satır kusur değil, kayıt. Kapanış standardı:
> `ScryneOS/🎯 100-Command-Center/Kapanis-Standardi.md`

**Ölçüm tarihi:** 2026-08-27
**Tek cümle:** Backend 231, frontend 55 test geçiyor ve frontend derleniyor. Sağlıklı; 33 dosya commit edilmemişti.

## Ne çalışıyor

- **Backend: 231 test geçti** (22 dosya).
- **Frontend: 55 test geçti** (9 dosya) · **derleme başarılı**
  (MapPanel, FeedPanel, MediaPanel, ThreatMeter, EventLog ayrı chunk'lara bölünmüş).
- Yığın: TypeScript backend (ts-node-dev) + Vite frontend. `pnpm` kullanıyor.
- `DESIGN.md` v1.4 mevcut.

## Ne çalışmıyor / doğrulanmadı

- **`npm test` watch modunda takılıyor** — `backend/package.json`'da `test: "vitest"`,
  CI'de veya betikte kullanılırsa sonsuza kadar bekler. Doğrusu `test:run`.
  Bu denetimde 15 dakika boyunca çıktı üretmedi, iptal edildi.
- Uçtan uca çalıştırma denenmedi (`start.ps1` PowerShell betiği).

## Ne yarım

- 33 dosyada commit edilmemiş değişiklik vardı — backend rotaları, auth, yedekleme
  servisi, testler, frontend paketleri — bu denetimde commit edildi. Gerekçeleri kayıtlı değil.
- Portföy engeli kayıtlı: içerik denetimi gerekiyor (ekran görüntüsü öncesi).

## Sonraki adım

`test` script'ini `vitest run` yap, sonra `start.ps1` ile uçtan uca bir kez ayağa kaldır.
