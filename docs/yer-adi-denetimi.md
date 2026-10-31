# Yer adı denetimi (özetler)

Yerel 4B özetleyici (gemma3:4b) yer adlarını sese göre çeviriyordu: Hormuz → "Humus" (Humus, Suriye'deki Homs'tur),
Tehran → "Tahir" / "Tahribat", Houthi → "Hüsemi", Ürdün'deki kilise saldırısı → "Mekke'deki kilise", Hürmüz →
"Kızıldeniz Boğazı". Dil denetimi bunları yakalamaz: çıktı Türkçedir.

## Ne yapıldı

1. **Sözlük (asıl düzeltme):** haberde geçen yer ve kurum adlarının Türkçe yazımı istemin sonuna eklenir
   (`backend/src/lib/placeNames.ts`, `withPlaceGlossary`).
2. **İstem:** 6. kuraldaki `Örnek: "İsrail hava kuvvetleri..."` kaldırıldı. qwen3:8b denemesinde model bu örneği
   taklit edip habersiz hava saldırıları uyduruyordu.
3. **Denetim:** özetteki yerlerin kaynaktakilerle aynı olup olmadığı TypeSafe Noul ile sorulur (`jev-1.14.0`, eşik
   0,3). Altında kalan özet reddedilir, katı istemle bir kez daha denenir; o da geçmezse yazılmaz (sonraki turda
   yeniden denenir). Anahtar yoksa ya da denetim çalışmazsa özet engellenmez.

## Ölçüm (2026-10-31, 60 gerçek bölge haberi)

| Çalıştırma | Denetimin 0,6 altına düşürdüğü | Gözle |
|---|---|---|
| gemma3:4b, sözlüksüz | 11 | Humus, Tahir, Tahribat, Hüsemi, Mekke, Kızıldeniz Boğazı |
| gemma3:4b, sözlüklü | 4 | kaba yer hatası yok; kalan 4 doğru yer, zayıf özet |
| qwen3:8b, sözlüklü | 5 | haberde olmayan "İsrail hava kuvvetleri" saldırıları uyduruyor → kullanılmadı |

Sentetik 20 çift (doğru / yanlış yer): 20/20; doğrular ≥ 0,83, bozuklar ≤ 0,08. Ses benzeri ince hatalar
("Tahir", 0,53) denetimden güvenilir biçimde geçmeyebilir; bu yüzden asıl düzeltme sözlüktür.

## Bilinen sınır

4B model zaman zaman habere küçük ayrıntılar ekliyor (ör. "askerlerin kaybıyla sonuçlanan"). Denetim yalnız yerleri
sorar; içerik sadakati daha büyük bir modeli ya da ayrı bir doğrulama sorusunu gerektirir. Özetin altında kaynak
başlığı her zaman görünür.
