# WARTRACKER — Portföy Brifingi

> Bu dosya veri çıkarma çıktısıdır, pazarlama metni değildir. Her sayının yanında
> kaynağı vardır. Kaynağı olmayan hiçbir sayı yazılmamıştır.
>
> Çıkarma tarihi: 2026-08-09. Ölçümler bu tarihte çalışan komutlardan alınmıştır.

---

## 1. Künye

**Ne yapar**
Açık kaynak haber akışlarını dakikalar içinde toplayıp coğrafi konuma bağlayan,
olay şiddeti puanlayan ve Türkçe durum özeti üreten tek ekranlı bir izleme panosu.

**Kimin için**
Tek operatör. Koddan çıkan kanıt: kullanıcı hesabı, oturum, rol veya kiracı (tenant)
kavramı hiç yok; yetkilendirme tek bir paylaşılan sırla yapılıyor
(`backend/src/lib/auth.ts:6-14`, "This is a single-operator dashboard, so there are
deliberately no accounts, sessions or tokens"). Arayüz dili ve tüm AI çıktısı Türkçe;
kaynak akışları İngilizce. Konu alanı İran–İsrail hattına sabitlenmiş
(`backend/src/services/summarize.service.ts:8`, `backend/src/routes/brief.ts:43-47`,
`backend/src/lib/geoExtract.ts:1-47`).

**Çalışma dönemi**
Git geçmişi üç commit'ten ibaret:

| Commit | Tarih | Mesaj |
| --- | --- | --- |
| `2b52bce` | 2026-02-22 | chore: initial commit - project setup |
| `a641213` | 2026-03-16 | feat: publish Wartracker as open-source project |
| `e252040` | 2026-03-16 | fix: move project files to repository root |

Kaynak: `git log --reverse --format="%H|%ad|%s" --date=iso`.

**Önemli uyarı — geçmiş kodu temsil etmiyor.** Bugünkü kodun büyük kısmı hiç
commit'lenmemiş durumda: 39 izlenen dosyada `1552 ekleme, 400 silme`
(`git diff --stat`) ve 15 izlenmeyen yeni dosya
(`git ls-files --others --exclude-standard`), aralarında `auth.ts`, `rateLimit.ts`,
`time.ts` ve dört backend test dosyası var. Bu dosyaların dosya sistemi değiştirme
tarihleri 2026-08-06 ile 2026-08-08 arasında (`ls -la`). Yani commit'lenmiş dönem
Şubat–Mart 2026, fiilen çalışılan ikinci dönem Ağustos 2026 başı; arada yaklaşık
dört buçuk aylık bir boşluk var. Dosya tarihleri OneDrive senkronizasyonuyla
değişebileceği için bunu *commit kanıtı değil, dosya sistemi kanıtı* olarak
işaretliyorum.

**Rol**
Tek geliştirici. `git shortlog -sne --all` çıktısı: `3  Your Name <you@example.com>`.
Bu, git yapılandırılmadan atılmış commit'lerin varsayılan kimliği — gerçek isim
değil. `LICENSE` dosyası telif sahibini "Berkay Karaca" olarak veriyor. Başka
katkıda bulunan yok.

**Yığın** (mimariyi belirleyenler; manifest'teki her bağımlılık değil)

1. **TypeScript** — hem backend hem frontend, `strict` derleme (`tsconfig.json` × 2)
2. **Express 4 + Socket.IO 4** — REST + tek yönlü canlı yayın (`backend/src/index.ts`)
3. **better-sqlite3 (senkron) + SQLite WAL** — tek dosya veritabanı (`backend/src/db/index.ts`)
4. **Elle yazılmış sürümlü migration katmanı** — `schema_migrations` tablosu, 4 migration (`backend/src/db/migrate.ts`)
5. **rss-parser + elle yazılmış devre kesici (circuit breaker)** — 15 kaynak (`backend/src/services/rss.service.ts`)
6. **React 18 + Vite 5 + Zustand 4** — 11 store, `lazy`/`Suspense` ile bölünmüş paneller (`frontend/src/App.tsx:14-16`)
7. **Leaflet + react-leaflet** — Carto dark basemap (`frontend/src/panels/MapPanel.tsx:330`)
8. **Ollama (yerel) + Google Gemini (bulut)** — sıralı deneme, ikisi de başarısız olursa kural tabanlı Türkçe yedek (`backend/src/services/summarize.service.ts:346-373`)

**Satır ve dosya sayısı**
`node_modules`, `dist`, `.git`, `pnpm-lock.yaml` hariç:

| Bölüm | Satır | Komut |
| --- | --- | --- |
| `backend/src` (.ts) | 3.542 | `find backend/src -name "*.ts" \| xargs wc -l` |
| `backend/test` (.ts) | 878 | `find backend/test -name "*.ts" \| xargs wc -l` |
| `frontend/src` (.ts/.tsx/.css, test hariç) | 5.701 | `find frontend/src ... \| xargs wc -l` |
| `frontend` testleri | 430 | `find frontend/src -path "*__tests__*" ... \| xargs wc -l` |
| **Toplam** | **10.551** | |

Kaynak dosya sayısı: **99** (`.ts/.tsx/.js/.css/.html/.json/.md/.ps1/.yaml`, lock
dosyaları hariç). Git'in izlediği dosya: 97 (`git ls-files | wc -l`).

En büyük beş dosya (`wc -l`): `MapPanel.tsx` 563, `summarize.service.ts` 491,
`rss.service.ts` 418, `SettingsModal.tsx` 400, `brief.ts` 388.

**Commit sayısı**
3 (`git rev-list --count HEAD`).

---

## 2. Durum

### `geliştirme`

**Gerekçe:** Uygulama uçtan uca çalışıyor ve gerçek veri üretiyor, ancak dağıtım
yolu hiç yok ve kodun çoğunluğu sürüm kontrolüne alınmamış durumda.

**Ölçülebilir ayrıntılar:**

- **101/101 test geçiyor.** Backend 75/75 (5 dosya), frontend 26/26 (6 dosya).
  Komut: `pnpm --dir backend test:run` → `Tests 75 passed (75)`,
  `pnpm --dir frontend test:run` → `Tests 26 passed (26)`.
- **Derleme temiz.** `pnpm build` hatasız tamamlanıyor: `tsc -p tsconfig.json`
  (backend) ve `tsc && vite build` (frontend, 981 modül, `✓ built in 2.38s`).
- **Veri toplama gerçekten çalışıyor.** Yereldeki `wartracker.db` içinde 443 makale,
  69 olay, 160 AI özeti var ve **15 kaynağın 15'i de** makale döndürmüş
  (`SELECT source, COUNT(*) FROM articles GROUP BY source`: War on the Rocks 50,
  Iran Int'l 50, Haaretz EN 50, Guardian 45, BBC 36 … ISW 10).
- **`TODO`/`FIXME`/`HACK` sayısı: 0** (`grep -rn` üzerinden `backend/src` +
  `frontend/src`). Yarım kalmış modül işareti yok.
- **Eksik olanlar:** Dockerfile yok, CI yapılandırması yok (`.github` dizini yok),
  üretim dağıtım betiği yok — tek başlatma yolu Windows'a bağlı `start.ps1`.
  Kapsam (coverage) raporu üretilmiyor.
- **Kullanılmayan yollar:** `pins` ve `bookmarks` tabloları yerel veritabanında boş
  (0 satır), yani bu iki akış gerçek kullanımda hiç egzersiz edilmemiş — sadece
  testlerde.
- **AI'nin varsayılanı kapalı.** `BRIEF_MODEL_ENABLED=0` (`.env.example`), yani kutudan
  çıktığı haliyle durum özeti modele hiç gitmiyor, kural tabanlı şablon dönüyor
  (`backend/src/routes/brief.ts:331-335`).

`prototip` değil, çünkü test paketi, migration sistemi, kimlik doğrulama ve hız
sınırlama var. `GA öncesi` değil, çünkü dağıtım hikâyesi, CI'ı ve çok kullanıcı
modeli yok; ayrıca çalışan kodun çoğu commit'lenmemiş.

---

## 3. Problem

**README'nin söylediği** (`README.md:3-4`): "gerçek zamanlı çatışma istihbaratı
panosu" — canlı olay akışları, harita katmanları, tehdit puanlaması ve AI destekli
brifing üretimini "tek operasyonel görünümde" birleştiriyor.

**Kodun doğruladığı ve daralttığı:** README genel bir "çatışma istihbaratı" aracı
tarif ediyor; kod ise **İran–İsrail hattına sabit kodlanmış**. Kanıtlar:

- Özetleme sistem promptu: "Sen İran-İsrail çatışmasını takip eden askeri bir analist
  asistanısın… Haber İran-İsrail çatışmasıyla alakasızsa: sadece 'Bölgesel çatışmayla
  doğrudan ilgisi yok.' yaz." (`summarize.service.ts:8-20`)
- Konum sözlüğü 46 anahtardan oluşuyor ve tamamı İsrail, İran, Levant, Körfez ve
  çevresi (`geoExtract.ts:1-47`).
- Brifing alaka düzeyi regex'i aynı coğrafyayı sayıyor (`brief.ts:44`).
- Harita katmanları İran ve İsrail nükleer tesisleri ile hava savunma sistemleri
  (`frontend/src/data/nuclearSites.ts`, `samSystems.ts`).

**Ayrışma:** README daha geniş bir iddiada bulunuyor, kod dar ve tek tiyatroya özel.
**Güncel olan koddur** — README'nin kimlik doğrulama bölümü (`README.md:106-146`)
henüz commit'lenmemiş `auth.ts` dosyasını tarif ettiğine göre README yakın zamanda
güncellenmiş; yani bu genellik README'nin eskiliğinden değil, kasıtlı bir tanıtım
dilinden geliyor. Portföyde dar tanımı kullanmak daha doğru.

**Kodun ima ettiği acı** (README'de yazılı bir problem tanımı yok, bu çıkarımdır):
15 ayrı yayıncının akışını manuel takip eden biri, aynı olayı farklı güvenilirlikteki
kaynaklardan tekrar tekrar okuyor, hangisinin ne kadar sağlam olduğunu her seferinde
kendi kafasında tartıyor ve hiçbirinde konum bilgisi hazır gelmiyor. Kod bu üç işi de
otomatikleştiriyor: kaynak taban puanı + tazelik + spekülatif dil tespiti ile
güvenilirlik skoru (`reliability.service.ts`), anahtar kelime → 1-5 şiddet eşlemesi
(`events.ts:9-14`) ve metinden koordinat çıkarımı.

---

## 4. Sistem

### Ana bileşenler ve sorumluluk sınırları

| Bileşen | Sorumluluk | Sınır ihlali var mı |
| --- | --- | --- |
| `services/rss.service.ts` | 15 kaynaktan çekme, devre kesici, yedek URL, HTML-yerine-feed tespiti, makale yazma, 7 günden eski kayıtları silme | **Evet.** Çekme + kalıcılık + temizlik + metrik + konum zenginleştirme tek dosyada (418 satır). |
| `db/migrate.ts` | Sürümlü şema ve veri göçleri, `schema_migrations` kaydı | Temiz. |
| `routes/events.ts` | Olay CRUD + makalelerden otomatik olay çıkarımı (`autoExtractEvents`) | Kısmen. Rota katmanı iş mantığı (şiddet tespiti, toplu çıkarım) barındırıyor; `jobs/index.ts` bir rota dosyasından fonksiyon import ediyor. |
| `services/summarize.service.ts` | Kuyruk, hız sınırlama, iki sağlayıcı, dil doğrulama, kural tabanlı yedek, DB yazma | **Evet.** 491 satır; kuyruk altyapısı, sağlayıcı istemcileri ve SQL hazır ifadeleri aynı modülde. |
| `routes/brief.ts` | 6 saatlik pencere özeti: skorlama, kural tabanlı brifing üretici, 90 sn önbellek, model çağrısı | Kısmen — kendi kural motorunu (`buildRuleBasedBrief`, ~70 satır karar ağacı) içeriyor. |
| `lib/auth.ts` | Yazma isteklerinde paylaşılan sır doğrulaması, sabit zamanlı karşılaştırma | Temiz, 93 satır. |
| `lib/rateLimit.ts` | IP başına sabit pencere hız sınırı | Temiz, 61 satır. |
| `frontend/src/stores/*` | 11 Zustand store: feed, event, map, draw, layer, overlay, settings, auth, bookmark, watchlist, connection | Temiz ayrım. |
| `frontend/src/panels/MapPanel.tsx` | Harita, katmanlar, çizim, pin etkileşimi, brifing paneli barındırma | **Evet.** 563 satır, projedeki en büyük dosya. |

### Veri akışı

1. **Girdi:** `node-cron` her 10 saniyede tetikleniyor, ayarlanabilir aralık kapısından
   geçiyor (varsayılan 5 dk, `jobs/index.ts:89-96`), 15 RSS kaynağı `Promise.allSettled`
   ile paralel çekiliyor; başarısızlar 1 sn sonra bir kez daha deneniyor.
2. **Zenginleştirme:** Her makale için başlık+açıklama metninden `extractGeoFromText`
   ile koordinat aranıyor. Yazım tek transaction'da `INSERT OR IGNORE` (guid UNIQUE).
3. **Durma:** SQLite (`wartracker.db`, WAL modu). Tablolar: `articles`, `events`,
   `pins`, `bookmarks`, `settings`, `schema_migrations`. Makaleler 7 gün sonra siliniyor
   (`rss.service.ts:155`).
4. **Türetme:** `autoExtractEvents` son 2 günün henüz olaya bağlanmamış makalelerini
   tarıyor, anahtar kelime → şiddet eşlemesi uyguluyor, şiddet ≥ 3 olanları `events`
   tablosuna yazıyor. Ayrı bir cron, özetlenmemiş makaleleri özetleme kuyruğuna alıyor
   (dakikada 10 jeton limiti).
5. **Çıkış:** REST (`GET` açık, `POST/PUT/PATCH/DELETE` sırla korumalı) + Socket.IO
   üzerinden 12 olay yayını (`article:new`, `event:new`, `threat:update`,
   `stats:update`, `feed:refreshed`, `settings:updated`, `pin:*`,
   `article:summarized`, `jobs:heartbeat`, `init`). Socket tek yönlü — istemci
   sunucuya hiçbir şey göndermiyor (`README.md:132-136`).

### Dış bağımlılıklar

- **15 RSS kaynağı** — BBC, Guardian, Al Jazeera, CBS, NPR, France24, DW, Ynetnews,
  Jerusalem Post, Iran Int'l, Middle East Eye, Haaretz, Defense One, War on the Rocks, ISW
- **Ollama** — yerelde `http://localhost:11434`, varsayılan model `llama3.2:3b` (opsiyonel)
- **Google Gemini** — `gemini-2.0-flash` (özetleme) ve `gemini-1.5-flash` (brifing);
  API anahtarı yoksa sessizce atlanıyor (opsiyonel, ücretli)
- **Carto dark basemap** — `basemaps.cartocdn.com` harita döşemeleri
- **YouTube** — sabit kodlanmış tek bir video gömülü (`MediaPanel.tsx:27`)
- **SQLite** — kütüphane olarak gömülü, ayrı sunucu yok

### Diyagram kutuları (9 adet, sınırda)

```
1. RSS Kaynakları (15, dış)      →  2. Toplama Servisi (devre kesici, yedek URL)
2. Toplama Servisi               →  3. Konum Sözlüğü (46 anahtar)
2. Toplama Servisi               →  4. SQLite (WAL)
4. SQLite                        ↔  5. Olay Çıkarıcı (anahtar kelime → şiddet 1-5)
4. SQLite                        ↔  6. Özet Kuyruğu (10/dk hız limiti)
6. Özet Kuyruğu                  →  7. AI Sağlayıcıları (Ollama / Gemini, dış)
4. SQLite                        →  8. Express API + Socket.IO
8. Express API + Socket.IO       →  9. React Panosu (harita / akış / brifing)
```

Kural tabanlı yedek özetleyici 6 ve 7 arasında bir dal, ayrı kutu hak etmiyor.

---

## 5. Kritik kararlar

### Karar 1 — Senkron SQLite, ayrı veritabanı sunucusu yerine

- **Seçim:** `better-sqlite3` ile tek dosyalık SQLite, WAL modu, senkron API
  (`backend/src/db/index.ts`). Tüm sorgular çağrıldıkları anda blokluyor.
- **Alternatif:** PostgreSQL + bir bağlantı havuzu ve asenkron sürücü. Konteyner
  kurulumu ve gerçek eşzamanlılık gelirdi.
- **Gerekçe:** Tek operatörlük, tek süreçli bir uygulama. Senkron API `db.transaction()`
  ile toplu yazmayı önemsizleştiriyor (`rss.service.ts:133-153`,
  `events.ts:228-260`) ve async/await yayılımını tamamen ortadan kaldırıyor.
  Kurulum "dosyayı aç"tan ibaret.
- **Bedel:** Ağır DB işi Node olay döngüsünü blokluyor ve bu kodda açıkça
  belgelenmiş: `clearInvalidSummaries` "N satırı senkron olarak yeniden doğruluyor,
  olay döngüsünü — ve dolayısıyla her socket'i — süre boyunca blokluyor"
  (`jobs/index.ts:14-19`). Çözüm mimari değil, takvim: fonksiyon her AI turunda
  çalışırken saatte bire indirilmiş. Ayrıca hız sınırlayıcı süreç içi olduğu için
  (`lib/rateLimit.ts:5-8`) yatay ölçekleme yolu kapalı.

### Karar 2 — Sadece yazma işlemlerinde paylaşılan sır; okumalar tamamen açık

- **Seçim:** Tek bir `API_SHARED_SECRET`, `X-API-Key` başlığıyla, yalnızca
  `POST/PUT/PATCH/DELETE` üzerinde. Sunucu sır yoksa veya 16 karakterden kısaysa
  **açılmayı reddediyor** (`lib/auth.ts:44-60`, `index.ts:34-39`). Karşılaştırma
  SHA-256 sonrası `timingSafeEqual` ile sabit zamanlı.
- **Alternatif:** Kullanıcı hesapları + oturum/JWT, ya da OS düzeyinde tek kullanıcı
  varsayıp hiç kimlik doğrulaması koymamak.
- **Gerekçe:** Sunucu LAN ve mobil erişim için `0.0.0.0`'a bağlanıyor. Yazma uçları
  yıkıcı olanlar ve maliyet doğuranlar (Gemini çağrısı); okuma uçlarını kapatmak
  panonun ilk açılışını bozardı, karşılığında hiçbir şey korumazdı — veriler zaten
  kamuya açık haber başlıkları.
- **Bedel:** Denetim izi yok, kullanıcı ayrımı yok, sır iptali yok — sızarsa tek
  çare herkesin elindeki değeri değiştirmek. Trafik düz HTTP, yani güvenilmeyen ağda
  anahtar hat üzerinde görünür (`README.md:129-131`). Anahtar tarayıcıda
  `localStorage`'da duruyor, yani her XSS anahtarı da alır. Socket.IO akışı hiç
  korumasız.

### Karar 3 — Model başarısız olduğunda kural tabanlı Türkçe metin üretimi

- **Seçim:** Özetleme önce Ollama'yı, sonra Gemini'yi deniyor; ikisi de başarısız
  olursa `buildRuleBasedSummary` elle yazılmış dört regex bayrağıyla hazır bir Türkçe
  cümle döndürüyor (`summarize.service.ts:284-312`). Brifing tarafında aynı yaklaşım
  ~70 satırlık bir karar ağacına dönüşüyor (`brief.ts:178-245`) ve
  `BRIEF_MODEL_ENABLED=0` varsayılanıyla **kutudan çıkan tek yol bu**.
- **Alternatif:** Model başarısız olduğunda hata döndürmek ve arayüzde "özet
  üretilemedi" göstermek.
- **Gerekçe:** Panonun her zaman dolu görünmesi isteniyor; ayrıca model çıktısının
  Türkçe olmayan script döndürmesi somut bir sorun olmuş (migration 4 tam da bozuk
  özetleri temizlemek için var) ve deterministik yedek bu riski kapatıyor.
- **Bedel:** Kullanıcı, "AI özeti" etiketiyle aslında dört `if` bloğundan çıkmış sabit
  bir cümle okuyor — "Kaynak habere göre bölgesel güvenlik ortamı dalgalı seyrediyor"
  gibi. Cevap alanı `model: "rule"` ile dürüst ama arayüzde bu ayrım görünür değil.
  Varsayılan yapılandırmada brifing paneli hiçbir zaman modele gitmiyor, yani
  projenin en gösterişli özelliği kutudan çıktığı haliyle kapalı. Ek olarak bu karar
  ağacı bakım borcu: yeni bir konu türü her eklendiğinde elle şablon yazmak gerekiyor.

### Karar 4 — Elle yazılmış 46 girişlik konum sözlüğü, coğrafi kodlama servisi yerine

- **Seçim:** `GEO_MAP` sabiti — 46 yer adı → koordinat eşlemesi; metinde alt dize
  araması, en uzun anahtar önce (`geoExtract.ts:49-51`, "tel aviv" > "israel").
- **Alternatif:** Bir varlık tanıma (NER) modeli + Nominatim/Photon gibi bir
  coğrafi kodlama servisi.
- **Gerekçe:** Sıfır ağ çağrısı, sıfır kota, sıfır gecikme; 15 kaynağın tamamı zaten
  tek bir tiyatroyu kapsıyor, dolayısıyla 46 anahtar kapsamın büyük kısmını görüyor.
  Sıralama modül yüklenirken bir kez yapılıyor, her çağrıda değil.
- **Bedel:** Sözlük dışındaki hiçbir yer haritada görünmüyor — Ukrayna, Sudan, Tayvan
  içeren bir haber koordinatsız kalıyor ve haritada hiç yer almıyor. Alt dize eşleşmesi
  bağlam görmüyor: `gulf` anahtarı "Gulf of Mexico" veya "Persian Gulf War"
  başlıklarını da Basra Körfezi'ne oturtur, `strait` her zaman Hürmüz'ü döndürür.
  Aynı ülkenin farklı şehirlerindeki iki haber, ikisi de yalnızca ülke adını geçiriyorsa
  tam olarak aynı noktaya iğneleniyor — ki bu, aşağıdaki 6. bölümdeki hatanın
  doğrudan sebebi.

---

## 6. Zorlandığım yer

**Kaynak notu, en başta:** Commit geçmişi üç commit'ten ibaret ve üçü de "kurulum /
yayınla / dosyaları taşı" mesajlı — yani **bu bölümün kanıtı commit karmaları
değil**, kodun içine bırakılmış geçmiş anlatan yorumlar ve commit'lenmemiş çalışma
ağacındaki `git diff`. Prompt commit karması istiyor; veremiyorum, çünkü bu düzeltmeler
henüz commit'lenmemiş durumda (`git status`: 39 değişmiş dosya). Dosya:satır referansı
verdim, hepsi doğrulanabilir.

### Birincil olay — birbirini büyüten iki rastgeleleştirme katmanı

**Nasıl fark edildi**
Haritadaki iğneler haberin anlattığı yerde değildi. Aynı ingest iki kez çalıştırıldığında
aynı makale farklı koordinata düşüyordu — yani sistem deterministik değildi, ki bu
tek başına bir haritalama aracında kabul edilemez bir davranış.

**Kök sebep**
İki ayrı yerde, birbirinden habersiz, aynı kozmetik problemi çözmeye çalışan iki
rastgeleleştirme vardı:

1. `extractGeoFromText` sözlükten dönen koordinata **±0,6° rastgele sapma**
   ekliyordu — tek başına ~66 km yer değiştirme
   (`backend/src/lib/geoExtract.ts:53-60` içindeki yorum bunu kayda geçiriyor).
2. `rss.service.ts` içindeki bir `resolveConflict()` geçişi, mevcut bir koordinatın
   0,3° yakınındaki **her koordinatı ikinci kez rastgeleleştiriyordu**
   (`backend/src/services/rss.service.ts:316-320`).

İkisi üst üste binince toplam kayma **~150 km**'ye çıkıyordu. Asıl problem şuydu:
her ikisi de gerçek bir soruna cevap veriyordu — 4. karardaki bedel, yani aynı
ülkeyi anan iki haberin tam olarak aynı noktaya oturması ve iğnelerin üst üste
yığılması. Yanlış varsayım, "iğneler çakışıyorsa saklanan koordinatı oynat" idi.
Görsel çakışma bir *sunum* problemi, veri problemi değil.

`resolveConflict()`'in ikinci bir kusuru daha vardı: çakışma kümesini kendi kendine
kirletiyordu — `INSERT OR IGNORE` tarafından zaten atılacak olan makaleleri de
karşılaştırma kümesine alıyor, dolayısıyla veritabanına hiç girmemiş kayıtlar
yüzünden gerçek kayıtları oynatıyordu.

**Nasıl çözüldü**
Her iki rastgeleleştirme de tamamen kaldırıldı. `extractGeoFromText` artık sözlüğün
verdiği koordinatı olduğu gibi döndürüyor (`geoExtract.ts:61-69`), `resolveConflict()`
silindi ve yerine `saveArticles` içine kararın gerekçesini açıklayan bir yorum
bırakıldı. Çakışma çözümü, ait olduğu yere — harita katmanına — taşındı.

**Sonrasında ne değişti**
Ingest deterministik hale geldi: aynı girdi her zaman aynı satırı üretiyor, bu da
`geoExtract`'ı test edilebilir kıldı (`backend/test/geoExtract.test.ts`, commit'lenmemiş
yeni dosya). Kodda kalıcı bir kural oluştu ve yorum olarak yazıldı: *"Visual de-overlap
belongs in the map layer, not in the stored record."*

### İkincil olay — modül kapsamında çalışan yıkıcı SQL

Aynı sınıftan, ayrıca anlatmaya değer bir hata: iki ayrı yıkıcı `DELETE`/`UPDATE`
ifadesi modül kapsamında duruyordu, yani **her import'ta** — her sunucu açılışında ve
`ts-node-dev` her yeniden doğduğunda — yeniden çalışıyordu.

- `routes/events.ts`: `DELETE FROM events WHERE severity < 3` (bkz. `events.ts:36-37`)
- `services/summarize.service.ts`: bozuk AI özetlerini temizleyen `UPDATE`
  (bkz. `summarize.service.ts:391-393`)

İkincisi daha sinsiydi: filtresi `LENGTH(aiSummary) < 20` koşulunu da içerdiği için
**her yeniden başlatmada meşru kısa özetleri de siliyordu** — özetler görünüp
kayboluyordu. Üstelik orijinal filtre `LIKE '%\u00%'` yazılmıştı, `ESCAPE` yan
tümcesi olmadan; bu da düz bir ters bölü dizisini de eşleştiriyordu.

Çözüm: ikisi de sürümlü migration'a taşındı (migration 3 ve 4,
`db/migrate.ts:229-263`), `LIKE` yerine niyeti açık eden `instr()` kullanıldı ve
`migrate.ts:4-11`'e kural yazıldı: *"Nothing destructive may live at module scope in
a route or service file."* Bu, `schema_migrations` tablosunun ve 294 satırlık
`backend/test/migrations.test.ts` dosyasının doğuş sebebi.

### Diğer adaylar (kısaca, hepsi kod yorumlarında kayıtlı)

- **Yalan söyleyen metrik.** `feed_success_rate`, aslında devre kesicisi kapalı olan
  kaynakların oranını ölçüyordu; kesici üst üste 3 hatadan önce açılmadığı için, her
  çekmede başarısız olan bir kaynak varken bile %100 gösteriyordu
  (`rss.service.ts:112-121`). Gerçek deneme/başarı sayaçları eklendi, eski metrik
  dürüst adıyla `feed_circuit_closed_rate` olarak korundu.
- **Sıkışan kuyruk.** `processing` bayrağı `try/finally` olmadan yönetiliyordu; herhangi
  bir istisna bayrağı sonsuza dek `true` bırakıyor, sonraki her `enqueue` baştaki
  guard'da dönüyor, kuyruk hiç boşalmıyor ve bekleyen tüm promise'ler asılı kalıyordu
  (`summarize.service.ts:105-108`).
- **200 OK dönen HTML.** Iran Int'l'ın `/en/rss` adresi RSS yerine SPA kabuğunu 200 ile
  döndürüyordu; XML ayrıştırıcı "Attribute without value" gibi mesajlar üretiyor, bu da
  yanlış URL yerine bozuk feed izlenimi veriyordu. `isHtmlPayload()` önek tespiti
  eklendi (`rss.service.ts:235-251`). Content-type'a değil öneke bakılıyor, çünkü
  bazı çalışan feed'ler `text/html` olarak sunuluyor.
- **Çürüyen kaynaklar.** Reuters (alan adı emekli), AP News (401), Times of Israel
  (Cloudflare JS challenge) tamamen çıkarılıp yerlerine CBS, NPR ve Ynetnews kondu;
  her biri `rss.service.ts:16-55` içinde gerekçesiyle belgeli. Güvenilirlik taban
  puanları da buna göre düşürüldü (`reliability.service.ts:18-34`).

---

## 7. Ekran görüntüsü hazırlığı

### Yerelde ayağa kalkıyor mu?

```powershell
# 1. Bağımlılıklar (ikisi ayrı workspace, ayrı lock dosyası)
pnpm --dir frontend install
pnpm --dir backend install

# 2. Ortam dosyası
Copy-Item .env.example .env

# 3. Sır üret ve .env içindeki API_SHARED_SECRET değerini değiştir
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Her iki servisi başlat (Windows / PowerShell)
pnpm dev            # start.ps1 → frontend :5173, backend :3001

# 5. Tarayıcıda http://localhost:5173 → ⚙ Ayarlar → GUVENLIK → API anahtarı
#    alanına 3. adımdaki değeri yapıştır. Bu yapılmadan okumalar çalışır,
#    her yazma 401 döner.
```

**Bu oturumda ne denendi:** `pnpm build` (her iki uygulama, hatasız),
`pnpm --dir backend test:run` (75/75), `pnpm --dir frontend test:run` (26/26).
**Dev sunucularını bu oturumda ayağa kaldırmadım** — ekran görüntüsü almadım.
Ancak uygulama bu makinede yakın zamanda çalışmış: `wartracker.db` içinde 15
kaynağın tamamından 443 makale ve 160 üretilmiş AI özeti var, `wartracker.db-wal`
dosyasının değiştirilme tarihi 2026-08-08. Yani ingest hattının çalıştığı
gözlemsel olarak kanıtlı, benim tarafımdan bu oturumda çalıştırılarak değil.

### Ön koşullar

| Koşul | Olmadan ne olur |
| --- | --- |
| Node 18+ | `fetch` global'i gerekli (`rss.service.ts:212`) — daha eskisinde çöker |
| pnpm 10+ | `packageManager: pnpm@10.30.3` (root `package.json`) |
| **`API_SHARED_SECRET`, ≥16 karakter** | **Backend hiç açılmıyor.** `[FATAL]` yazıp `process.exit(1)` (`index.ts:34-39`) |
| :3001 ve :5173 boş | `EADDRINUSE` → backend `process.exit(1)` (`index.ts:110-117`) |
| İnternet erişimi | RSS boş kalır; ayrıca harita döşemeleri (Carto) ve YouTube gömülüsü yüklenmez |
| PowerShell | `pnpm dev` yalnızca `start.ps1` üzerinden; Linux/macOS'ta iki servisi elle başlatmak gerekir |
| Ollama (opsiyonel) | Yoksa özetleme Gemini'ye, o da yoksa kural tabanlı şablona düşer — uygulama çalışmaya devam eder |
| Gemini anahtarı (opsiyonel) | Yoksa sessizce atlanır (`summarize.service.ts:349`) |
| Veritabanı göçü | Elle adım **yok** — bağlantı açılırken otomatik çalışıyor (`db/index.ts:24`) |

### Demo veri var mı?

**Seed betiği, fixture veya örnek veri dosyası yok.** (`grep -rln "seed\|fixture"`
yalnızca alakasız iki eşleşme döndürüyor.) Ama pratikte buna gerek yok:

- **Makaleler ve olaylar kendiliğinden doluyor.** İlk RSS taraması sunucu açılır açılmaz
  `setImmediate` ile başlıyor (`jobs/index.ts:110-123`), yani ilk ekran görüntüsü
  için dolu bir akış **1-2 dakika** içinde hazır. Gözlem: 443 makale / 69 olay.
- **AI özetleri ~30 saniye sonra** başlıyor ve dakikada 10 jetonla ilerliyor, yani
  100 özet için ~10 dakika beklemek gerekiyor. Gerçekçi bir "SummaryTicker" görüntüsü
  için sunucuyu 15 dakika çalışır bırakmak yeterli.
- **`pins` ve `bookmarks` boş** (0 satır). Bu iki ekran için elle 5-10 kayıt oluşturmak
  gerekiyor — harita üzerinden tıklayarak, ~5 dakikalık iş. Alternatif: `POST /api/pins`
  ile birkaç curl çağrısı.
- **Tehdit seviyesi eşiği:** göstergenin 1'in üzerine çıkması için son 1 saatte
  şiddet ≥ 4 olay gerekiyor (`index.ts:93-98`). Doğal veriyle her zaman
  gerçekleşmeyebilir; yüksek seviyeli bir gösterge isteniyorsa `POST /api/events` ile
  `severity: 5` birkaç kayıt eklemek gerekir.

### Ekran görüntüsü alınabilecek ekranlar

Uygulama tek sayfa; "rota" yok, panel ve overlay var.

1. **Ana görünüm — harita + akış + brifing (varsayılan ekran)**
   Ürünün tek iddiası bu: 15 kaynak, coğrafi konum, olay şiddeti ve canlı sayaçlar tek
   ekranda. Sol tarafta Leaflet haritası (%2,2 genişlik payı), sağda canlı yayın ve
   haber akışı, altta özet şeridi (`App.tsx:159-222`).

2. **Harita, nükleer tesis ve hava savunma katmanları açık**
   `useLayerStore` üzerinden `nuclear` ve `sam` katmanları
   (`frontend/src/data/nuclearSites.ts` 7 tesis, `samSystems.ts` 6 sistem, yarıçap
   halkalarıyla). Katmanlı harita mantığının en görünür kanıtı — ancak 9. bölümdeki
   çerçeveleme uyarısını okuyun.

3. **Haber kartı, güvenilirlik skoru açılmış halde**
   `FeedCard.tsx` (255 satır) + `reliability.service.ts`. Skorun *nasıl* hesaplandığını
   gösteren sinyal listesi ("Kaynak taban puanı: 79", "Zaman tazeliği katkısı: +16",
   "Metinde spekülatif ifade sinyali var") — projenin "sadece skor değil, gerekçe de
   veriyorum" iddiasını kanıtlayan tek ekran.

4. **AI durum özeti paneli (`AiBriefPanel.tsx`, 273 satır)**
   Üç sabit başlıklı çıktı: SON 6 SAATİN ÖZETİ / KRİTİK GELİŞME / TREND ANALİZİ.
   **Uyarı:** `BRIEF_MODEL_ENABLED=1` yapılmadan bu panel kural tabanlı şablon
   gösterir. Ekran görüntüsünü "AI çıktısı" diye sunacaksanız modeli açıp gerçek
   çıktı almak, ya da başlığı dürüst tutmak gerekir.

5. **Komut paleti (Ctrl+K veya Shift+P)**
   `CommandPalette.tsx`, 251 satır. Klavye öncelikli operatör arayüzü iddiasının
   kanıtı (`App.tsx:131-149`).

6. **Durum çubuğu + tehdit göstergesi (`StatusBar.tsx` 253 satır, `ThreatMeter.tsx`)**
   Socket bağlantı durumu, canlı sayaçlar, 1-5 tehdit seviyesi. Gerçek zamanlılık
   iddiasını gösteren ekran; ideali kısa bir GIF, çünkü değer socket üzerinden
   kendiliğinden güncelleniyor.

**Kaçınılması gereken ekran:** Ayarlar modalı (`SettingsModal.tsx`) — GUVENLIK
sekmesinde API anahtarı alanı var. Ya hiç çekmeyin ya da alanı boş bırakıp öyle çekin.

### Gerçek veri riski

- **Kişisel veri riski: yok.** Veritabanında yalnızca kamuya açık haber başlıkları,
  açıklamalar, bağlantılar ve kaynak adları var. Müşteri, kullanıcı hesabı veya
  kimliklendirilebilir kişi kaydı hiç yok — `pins` ve `bookmarks` zaten boş.
- **Bunun yerine dikkat edilmesi gerekenler:**
  - Ekranda görünecek her başlık üçüncü taraf yayıncılara ait (BBC, Guardian, Haaretz…).
    Ekran görüntüsünde kaynak adlarıyla birlikte görünmeleri normal, ama alıntı
    niteliğinde.
  - Yanına `severity: 5` / "kritik" etiketi ve güvenilirlik puanı iliştirilmiş
    olacak — bu etiketler **benim sistemimin çıkarımı**, yayıncının değil. Ekran
    görüntüsü altyazısında bunu belirtmek gerekiyor.
  - AI özetleri canlı bir savaş hakkında **model tarafından üretilmiş Türkçe
    iddialar**. Ekran görüntüsü, yanlış veya kışkırtıcı bir cümleyi kalıcılaştırabilir.
    Yayına almadan önce görünen her özeti tek tek okuyun.
  - Gömülü YouTube yayını (`MediaPanel.tsx:27`, sabit video kimliği) — o kanalın o
    anda ne yayınladığı kontrolünüzde değil. Ekran görüntüsü almadan önce ne
    gösterdiğini kontrol edin.

---

## 8. Ölçülebilir ne varsa

| Ölçüm | Değer | Kanıt |
| --- | --- | --- |
| Backend testleri | 75/75 geçiyor, 5 dosya | `pnpm --dir backend test:run` → `Test Files 5 passed (5) / Tests 75 passed (75)`, süre 1,07 sn |
| Frontend testleri | 26/26 geçiyor, 6 dosya | `pnpm --dir frontend test:run` → `Test Files 6 passed (6) / Tests 26 passed (26)`, süre 5,31 sn |
| Toplam test | 101/101 | yukarıdaki iki komut |
| Test kodu oranı | 1.308 / 10.551 satır ≈ %12,4 | `wc -l` (bkz. 1. bölüm tablosu) |
| Derleme | Başarılı, hatasız | `pnpm build` → `tsc` (backend) + `✓ 981 modules transformed` (frontend) |
| Üretim bundle | vendor 339,27 kB (gzip 104,07 kB), index 41,26 kB (gzip 13,95 kB), MapPanel 35,13 kB (gzip 10,66 kB), CSS 29,25 kB (gzip 9,94 kB) | `vite build` çıktısı |
| Derleme süresi | 2,38 sn (frontend) | `✓ built in 2.38s` |
| Yapılandırılmış kaynak | 15 RSS akışı | `RSS_SOURCES` dizisi, `rss.service.ts:16-55` |
| **Fiilen veri döndüren kaynak** | **15/15** | `SELECT source, COUNT(*) FROM articles GROUP BY source` — 15 satır dönüyor |
| Toplanmış makale | 443 | `SELECT COUNT(*) FROM articles` (yerel `wartracker.db`) |
| Türetilmiş olay | 69 | `SELECT COUNT(*) FROM events` |
| Üretilmiş AI özeti | 160 (443'ün %36'sı) | `SELECT COUNT(*) FROM articles WHERE aiSummary IS NOT NULL AND aiSummary != ''` |
| Uygulanmış migration | 4 | `SELECT COUNT(*) FROM schema_migrations` |
| `TODO`/`FIXME`/`HACK` | 0 | `grep -rn "TODO\|FIXME\|HACK" backend/src frontend/src \| wc -l` |
| Zustand store | 11 | `ls frontend/src/stores/use*.ts` |
| Socket olay türü | 12 | `grep -n "socket.on(" frontend/src/hooks/useSocket.ts` |
| API ucu | 24 | `grep -rn "router.(get\|post\|put\|patch\|delete)(" backend/src/routes/` |
| Hız sınırlı uç | 4 | `grep -rn "rateLimit(" backend/src/routes/` |
| Commit sayısı | 3 | `git rev-list --count HEAD` |
| Commit'lenmemiş değişiklik | 39 dosyada +1.552 / −400, ayrıca 15 yeni dosya | `git diff --stat`, `git ls-files --others --exclude-standard` |

**Kanıtı olmadığı için yazılmayanlar:** test kapsam yüzdesi (coverage yapılandırması
yok), istek gecikmesi / throughput (ölçüm yapılmamış), bellek kullanımı, kullanıcı
sayısı, CI durumu (CI yok), çalışma süresi/uptime.

---

## 9. Yayına çıkarma engelleri

**Ticari kısıt yok.** Müşteri işi değil, NDA işareti yok, kurum içi bilgi yok.
Lisans MIT (`LICENSE`, telif: Berkay Karaca, 2026). Bağımlılıkların hepsi izinli
lisanslı (React, Express, Leaflet vb.). Aşağıdakiler yayına çıkmadan önce **karar
vermeniz gereken** noktalar:

### 1. `.env.example` içinde gerçek görünümlü bir sır commit'lenmiş — `[GİZLİ]` biçimli

`.env.example` dosyasında `API_SHARED_SECRET` alanı 64 karakterlik bir onaltılık
değerle **dolu** olarak repoda duruyor. Dosyadaki yorum bunun "repoya commit'lenmiş
tek kullanımlık bir yer tutucu" olduğunu söylüyor ve README de değiştirilmesini
istiyor. Yani muhtemelen gerçek bir sır değil.

**Ama:** GitHub secret scanning, TruffleHog ve benzeri araçlar bunu sızmış kimlik
bilgisi olarak işaretler; ayrıca projeyi klonlayan biri dosyayı olduğu gibi kullanıp
herkesin bildiği bir sırla çalıştırabilir. **Önerim:** yayından önce değeri boşaltın
(`API_SHARED_SECRET=`) veya `<buraya-uretilen-degeri-yapistirin>` gibi açıkça
yer tutucu olan bir metinle değiştirin. Bu değeri bu brifinge kopyalamadım.

### 2. Yerelde bir `.env` dosyası var — repoya girmemeli

Proje kökünde `.env` mevcut ve içinde 8 değişken tanımlı (test çalıştırmasındaki
`dotenv` çıktısı: `injecting env (8) from ..\.env`). `.gitignore` bunu doğru şekilde
dışlıyor. İçeriğini okumadım ve buraya yazmadım. Gemini anahtarı gibi gerçek bir
kimlik bilgisi içeriyorsa **ekran görüntüsünde terminal penceresi de görünmemeli.**

Aynı şekilde `wartracker.db`, `wartracker.db-wal`, `wartracker.db-shm` ve
`wartracker.test.db` yerelde duruyor, `.gitignore` tarafından dışlanmış — repoya
yanlışlıkla eklenmediğini yayından önce bir kez daha doğrulayın.

### 3. Git commit kimliği yapılandırılmamış

Üç commit'in de yazarı `Your Name <you@example.com>`. `LICENSE` ise "Berkay Karaca"
diyor. Public bir repoda bu tutarsızlık göze çarpar. Yayından önce ya
`git commit --amend` / `filter-repo` ile düzeltin ya da olduğu gibi bırakmaya
bilinçli karar verin. (Not: `you@example.com` gerçek bir adres değil, sızıntı değil.)

### 4. Alan konusu — çerçeveleme kararı sizin

Proje, İran ve İsrail'deki **nükleer tesislerin ve hava savunma sistemlerinin
koordinatlarını** haritada gösteriyor (`nuclearSites.ts`: Natanz, Fordow, Buşehr,
Arak, Dimona, Soreq — 7 kayıt; `samSystems.ts`: S-300, Arrow-3, Iron Dome
konuşlanmaları — 6 kayıt, menzil halkalarıyla). Ayrıca haberleri otomatik olarak
"kritik" etiketiyle 1-5 şiddet ölçeğinde puanlıyor.

Değerlendirmem: bu veriler açık kaynak seviyesinde ve hassas değil. Nükleer tesis
koordinatları IAEA raporlarından ve haritalardan herkesçe bilinen konumlar; hava
savunma girdileri ise virgülden sonra tek haneye yuvarlanmış (`lat: 35.7, lng: 51.3`)
ve `sam1`…`sam6` gibi jenerik kimlikler taşıyor — yani temsili/illüstratif,
istihbari değil. Sızdırılmış veri işareti yok.

**Yine de:** portföyünüzü inceleyen biri "askeri hedefleme aracı" izlenimi
edinebilir. Vaka çalışmasında bunun bir **haber toplama ve görselleştirme** çalışması
olduğunu, katman verisinin açık kaynak ve yaklaşık olduğunu açıkça yazmanızı
öneriyorum. Bu bir engel değil, çerçeveleme kararı — ama sizin kararınız.

### 5. Ekran görüntülerinde model çıktısı yayınlamış olacaksınız

AI özetleri ve durum brifingleri, doğrulanmamış haber akışından üretilmiş, canlı bir
çatışma hakkındaki Türkçe iddialardır. Model yanlış, taraflı veya kışkırtıcı bir cümle
üretebilir ve ekran görüntüsü onu kalıcılaştırır — üstelik sizin sitenizde, sizin
adınıza. Yayınlanacak her ekran görüntüsündeki her özet cümlesini tek tek okuyun.
(Sistem bunu kısmen öngörüyor: `AI_SAFE_MODE` ve `AI_LANG_GUARD` bayrakları,
`languageGuard.ts` doğrulaması ve migration 4'ün temizliği bu riski azaltmak için var
— ama içerik doğruluğunu değil, dil/format uygunluğunu denetliyorlar.)

### 6. Üçüncü taraf içerik ekranda görünecek

- **Haber metinleri:** BBC, Guardian, Al Jazeera, Haaretz, Jerusalem Post, Iran Int'l
  ve diğerlerinin başlık ve açıklamaları veritabanında saklanıyor (7 gün sonra
  siliniyor, `rss.service.ts:155`) ve arayüzde gösteriliyor. Ekran görüntüsü için
  alıntı kapsamında sorun görmüyorum; kaynak adları zaten arayüzde görünür durumda.
- **Gömülü YouTube yayını:** `MediaPanel.tsx:27` sabit bir video kimliği gömüyor.
  O kanalın ekran görüntüsü anında ne yayınladığı sizin kontrolünüzde değil ve zamanla
  değişir. Portföy görselleri için bu paneli kırpmayı veya statik bir yer tutucuyla
  değiştirmeyi düşünün.

### 7. Güvenlik duruşunun dürüst anlatılması

README güvenlik sınırlarını açıkça yazıyor (düz HTTP, `localStorage`'daki anahtar,
korumasız socket akışı — `README.md:121-136`). Bu iyi; vaka çalışmasında da aynı
dürüstlükte kalın. "Güvenli" gibi bir kelime kullanmayın: bu, tek operatörlük bir
LAN aracının tehdit modeline uygun tasarlanmış bir yetkilendirme, internete açılacak
bir sistemin güvenlik modeli değil.

---

## Portföy oturumuna notlar

Bu brifingin **doldurmadığı** alanlar (kasıtlı — proje kodundan bilinemezler):
`slug`, `featured`, `order`, `diagram`, `cover`, `updated`.

Bu brifingin doldurduğu alanlar için öneriler:

- `title`: WARTRACKER
- `tagline`: (dar tanımı kullanın, README'nin genel dilini değil)
- `period`: 2026-02 → 2026-03 commit'li, 2026-08 commit'siz — 1. bölümdeki uyarıyı okuyun
- `role`: Tek geliştirici
- `stack`: 1. bölümdeki 8 maddelik liste
- `status`: `geliştirme`
- `statusDetail`: "101/101 test geçiyor, derleme temiz, 15/15 kaynak veri döndürüyor;
  dağıtım yolu ve CI yok, kodun çoğu commit'lenmemiş."

**6. bölüm için uyarı:** Prompt commit karması istiyordu, veremedim — geçmiş üç
commit'ten ibaret ve düzeltmeler commit'lenmemiş çalışma ağacında duruyor. Anlattığım
olayların kanıtı kod yorumları ve dosya:satır referansları. `ADAY YOK` yazmadım çünkü
adaylar somut ve doğrulanabilir; ama bunları sözlü olarak da anlatmak isterseniz,
koordinat sapması hikâyesi (birincil olay) portföy metni için en güçlü olanı.
