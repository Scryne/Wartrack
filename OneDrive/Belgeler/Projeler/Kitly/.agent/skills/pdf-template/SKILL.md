# .agent/skills/pdf-template/SKILL.md

## PDF Şablon Skill'i
Bu skill çalıştığında:
1. src/components/kit-templates/ klasörüne bak
2. Mevcut şablon yapısını incele (MinimalTemplate.tsx'e bak)
3. Yeni şablonu aynı KitTemplateProps interface'i kullanarak oluştur
4. CSS: sadece inline style kullan (Tailwind PDF'de çalışmaz)
5. Fontlar: Inter veya Arial (system font, CDN gerekmez)
6. Sayfa boyutu: width 794px, minHeight 1123px (A4)
