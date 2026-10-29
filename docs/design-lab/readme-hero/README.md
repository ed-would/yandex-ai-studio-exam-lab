# Исходник текущего hero

Баннер пересоздан через встроенный ImageGen 29 октября 2026. Подпись набрана в одну строку: от **Yandex AI Studio**. Фирменный знак Yandex AI Studio и слова «на платформе» убраны.

- [generated.png](generated.png): исходный сведённый PNG 1820×864, без отдельных текстовых слоёв.
- [prompt.txt](prompt.txt): точный промпт пересоздания.
- [provenance.json](provenance.json): размеры, SHA-256, происхождение и параметры экспорта.
- [Готовый hero](../../../assets/readme/hero.jpg): JPEG 1600×760 для README.
- [Архив оригиналов](../archive/2026-10-29-banners/README.md): прежний hero и материалы social preview без изменения байтов.

Повторный экспорт:

```bash
sips -z 760 1600 -s format jpeg -s formatOptions 92 docs/design-lab/readme-hero/generated.png --out assets/readme/hero.jpg
```

Для нового изменения текста используйте raw-растр или архивный оригинал как референс ImageGen, обновите промпт и метаданные, затем проверьте все надписи в экспорте. Промпт сохраняет задание, но не является редактируемым макетом.
