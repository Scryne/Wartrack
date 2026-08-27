DESIGN.md dosyasını baştan sona oku, sonra design/refs/ klasöründeki
tüm görselleri ve README.md notlarını incele.

GÖREV: $ARGUMENTS sayfasını tasarla ve kodla.
Sayfanın tek işi: <birincil_is>
Kullanıcı: <kim, hangi ortamda>

ÇALIŞMA SIRASI — bu sırayı bozma:

1. PLAN (kod yazma):
   - Bu sayfa hangi soruyu 5 saniyede cevaplamalı?
   - Bilgi hiyerarşisi: 1. seviye / 2. seviye / 3. seviye ne?
   - ASCII wireframe çiz.
   - Kullanılacak token'ları listele (renk, spacing, tipografi).
   - "Signature": bu sayfayı akılda kalıcı yapacak TEK öğe ne?
   - Bu planı bana göster ve ONAY BEKLE.

2. ÖZ-ELEŞTİRİ (onaydan önce, kendin yap):
   Planındaki her kararı sor: "Bu kararı herhangi bir dashboard için
   de verir miydim?" Evet ise o kararı değiştir ve neyi neden
   değiştirdiğini yaz.

3. KOD:
   - shadcn MCP ile bileşen YAPISINI al, STİLİNİ DESIGN.md'den ver.
   - Gerçekçi Türkçe mock veri kullan (lorem ipsum yasak).
   - 5 durumu da kodla: dolu / boş / filtre-boş / yükleniyor / hata.

4. GÖRSEL DOĞRULAMA (Bölüm 14):
   - chrome-devtools MCP ile 375/768/1440/1920 screenshot al.
   - Her birini incele, en az 3 kusur bul, yaz.
   - Bölüm 13 yasak listesini madde madde geç.
   - Düzelt, tekrar screenshot al. EN AZ 2 TUR.

5. Bölüm 15 DoD kontrol listesini doldur ve bana göster.
