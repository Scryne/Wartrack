# .agent/skills/supabase-migration/SKILL.md

## Supabase Migration Skill'i
Bu skill çalıştığında:
1. supabase/migrations/ klasörüne bak
2. Yeni migration için yyyymmddhhmmss_description.sql formatında isim üret
3. Migration dosyasına yaz: açıklayıcı yorum + SQL komutları
4. Her tablo için ROW LEVEL SECURITY ENABLE ve CREATE POLICY ekle
5. `npx supabase db push` komutunu çalıştır
6. Hata varsa SQL sözdizimini düzelt
