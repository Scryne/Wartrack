# Konu süzgeci

Gazetteer bir haberin **nerede** geçtiğini söyler, **ne hakkında** olduğunu söylemez. Tel Aviv'de bir müzikal
eleştirisi, Kudüs'te bir seçim anketi ve Bangkok'ta tutuklanan bir İsrailli aynı koordinatı alıyordu. Bu yüzden
bölgeye yerleşen her habere tek bir evet/hayır sorusu sorulur: *bu haber ana konusu itibarıyla bölgedeki silahlı
çatışma ve güvenlik durumu hakkında mı?* Soru TypeSafe System One modeline (Jev) gider, eşik kodda uygulanır
(`backend/src/services/relevance.service.ts`).

## Ölçüm (2026-10-31, `jev-1.14.0`)

| Örneklem | Etiketli | Yanlış kabul | Kaçırma | Not |
|---|---|---|---|---|
| Set 1 (soru tasarımı) | 83 (+17 belirsiz) | 0 | 0 (eşik 0,35) | 0,5'te 2 kaçırma, 0 yanlış kabul |
| Set 2 (sonradan, bağımsız) | 50 (+10 belirsiz) | 0 | 1 | kaçan: yaptırım kaçakçılığı ekonomisi |
| Canlı veritabanı | 192 bölge haberi | — | — | 105'i konu dışı (%55), bunlardan çıkmış 15 olay kaldırıldı |

Pozitiflerin en düşüğü 0,35, negatiflerin en yükseği 0,23 (set 1). Aynı soru Choice olarak (konu etiketleri arasından
seçim) 14 yanlış kabul verdi; kullanılmıyor. Ham veri: `docs/olcum/konu-suzgeci-2026-10-31.json`.

## Davranış

- `theatreScore` NULL = henüz sınıflanmadı = **bölgede sayılır**. Anahtar yoksa (`TYPESAFE_API_KEY`) ya da
  `THEATRE_CLASSIFIER=0` ise uygulama eski, yalnız gazetteer davranışına döner.
- Sınıflama her RSS turunda olay çıkarmadan önce koşar (en yeni 60 haber, 4 paralel). Başarısız çağrı satırı NULL
  bırakır, sonraki tur yeniden dener; RSS akışını durdurmaz.
- Konu dışı çıkan haberden daha önce çıkarılmış otomatik olay silinir; elle girilen olaya dokunulmaz.
- Model `jev-1.14.0`'a sabit; sürüm kalkarsa `jev-latest`'e geçip uyarı yazar. Her satır cevabı veren modeli
  `theatreModel`'da tutar. Sabit sürümün yaşadığını `ts.py kontrol` denetler.
- Anahtar yalnız arka uçta durur.
