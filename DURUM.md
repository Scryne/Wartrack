# DURUM — Wartrack

> Envanter, sertifika değil. Ölçüm tarihi: 2026-09-26.

**Tek cümle:** Uçtan uca çalışıyor. 15 kaynaktan haber toplanıyor, bölgeye bağlanıp olaya çevriliyor,
tehdit seviyesi gerekçesiyle hesaplanıyor, haberler yerel modelle Türkçe özetleniyor ve durum özeti
üretiliyor; testler, lint, tip denetimi, Linux CI ve Lighthouse (erişilebilirlik 97) yeşil.

## Ne çalışıyor (ölçüldü)

- **Testler:** backend 242 (23 dosya), frontend 54. Testler geçici bir veritabanı ve geçici yedek
  dizini kullanır; `test/isolation.test.ts` bunun bozulmasını yakalar.
- **CI:** yeşil. 2026-08-22'den beri kırmızıydı (Linux'ta yol ayırıcısı, ağa çıkan test, zamanlamaya
  bağlı test); 2026-09-26'da düzeltildi, Node 22 ve güncel action sürümlerine taşındı.
- **Toplama:** 15/15 kaynak, bir turda ~430 haber, ~25 sn. Bölgeye bağlanan haberler olaya dönüşür.
- **Yerel AI:** Ollama `gemma3:4b`, RTX 4060'ta haber başına ~2 sn, durum özeti ~15 sn.
- **Lighthouse (üretim derlemesi, masaüstü):** performans 86–92 (en büyük boyama harita karosu, dış
  sunucu gecikmesine bağlı), erişilebilirlik 97, en iyi uygulamalar 96, CLS 0,02.

## Bu denetimde bulunan ve kapatılanlar

| Bulgu | Etki | Düzeltme |
|---|---|---|
| Testler `.env`'deki canlı `wartracker.db`'yi açıp `DELETE FROM` çalıştırıyordu | Her test koşusu gerçek haber ve olayları siliyordu | Vitest ortamı geçici DB ve yedek dizinine yönlendirildi; koruma testi eklendi |
| API testleri gerçek `backups/` dizinine yedek yazıyordu | Rotasyon operatörün yedeklerini budayabiliyordu (tek gerçek yedek bir koşu uzaklıktaydı) | Aynı izolasyon; `backups/` depodan çıkarıldı |
| Her yedeğin yanında `-wal/-shm` artığı kalıyordu | Rotasyonun silmediği birikim, depoya işlenen dosyalar | Anlık görüntü `journal_mode=DELETE` tek dosya; eski artıklar temizleniyor |
| SSRF denetimi ve istek adı iki kez çözüyordu | Yavaş DNS'te libuv havuzu doldu, 15 kaynağın hiçbiri çekilemedi; denetim ile bağlantı arasında DNS rebinding açığı | `undici` Agent + bağlantı anında adres denetleyen `guardedLookup` (tek sorgu, açık kapandı) |
| Olaylar haberin okunduğu anla tarihleniyordu | Bir ay kapalı kalan pano ilk turda eski haberleri "son 1 saat" sayıp 5 · KRİTİK gösterdi | Olay zamanı = haberin yayın zamanı (şimdiden ileri olamaz) |
| Kural tabanlı yedek 5 kalıp cümleyi "AI özeti" diye yazıyordu | Bilim haberinin altında "bölgesel güvenlik ortamı dalgalı" | Model yoksa özet yazılmıyor; mevcut kalıp cümleler göçle silindi |
| Durum özetinin "Kritik gelişme / Trend" bölümleri modelin yorumuydu | Kayıtlı 5/5 olayın yanında "kritik olay yok" | Bu iki bölüm ölçümden; model yalnız özet maddelerini yazar |
| CARTO haritası artık anahtar istiyor | Harita boştu ("API KEY REQUIRED") | Esri World Dark Gray (anahtarsız), atıf görünür |
| 8 canlı yayından 4'ü ölü, 2'si yanlış etiketli | Varsayılan yayın açılmıyordu | Kanal bazlı gömme, güncel kimlikler, `youtube-nocookie.com` |
| Üç ayrı tehdit hesabı ve üç ayrı etiket takımı | Başlık "5", panel "0 kritik olay" | Tek kaynak: sunucudaki açıklanabilir analiz |
| Anahtar kelimeyle şiddet: "camel race intercepted" = füze olayı | Yanlış kritik olaylar | Olay yalnız bölgeye bağlanan haberden; "intercept" yalnız mühimmatla birlikte |
| Jerusalem Post yerel saati "GMT" diye yayınlıyor | Haberler 2-3 saat ileri tarihli, akışın tepesine yapışıyordu | Yayın zamanı şimdiden ileri olamaz |

Arayüz: emoji ikonlar lucide'e, ham renkler token'a taşındı; `--accent` hiç tanımlı değildi (Kaydet
düğmesi görünmüyordu); ayarlar erişilebilir diyalog oldu; boş/hata durumları ayrıldı; mobil düzen
kaydırılabilir hale geldi. Kayıt: [`design/decisions.md`](design/decisions.md).

## Bilinen sınırlar

- **Bölge süzgeci coğrafidir, konu değildir.** İsrail'de geçen bir müzikal eleştirisi "bölge" sayılır.
  Konu ilgisi anlamsal bir sınıflandırma ister (aday: TypeSafe); şimdilik yok.
- **4B yerel model** ara sıra yer adını çevirirken hata yapar ("Hürmüz" yerine "Humus"). Dil
  denetimi yabancı sözcükleri yakalar, anlam hatasını yakalamaz. Kaynağı panelde yazılıdır.
- **Canlı yayın kimlikleri eskir.** Al Jazeera EN ve DW kanal bazlı gömme ile kendini günceller;
  diğerleri sabit kimliktir, "YouTube'da aç" bağlantısı her zaman kanalın canlı sayfasına gider.
- **Tek operatör, tek düğüm.** SQLite (WAL) tek yazıcıdır; çok kullanıcılı kurulum için tasarlanmadı.

## Yerel çalıştırma notu

`BRIEF_MODEL_ENABLED=1` ve çalışan bir Ollama (`ollama pull gemma3:4b`) durum özetini modelle üretir;
yoksa aynı özet sayımlardan kurulur. Dışarı mesaj gönderen bir kanal yok.
