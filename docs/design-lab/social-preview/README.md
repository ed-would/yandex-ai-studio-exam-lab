# Social preview для сайта

Единственный рабочий файл: [public/social-preview.jpg](../../../public/social-preview.jpg), JPEG 1280×640, 197 799 байт. Vite включает его в сборку сайта, а Open Graph и Twitter metadata используют адрес `social-preview.jpg`. Отдельного JPEG-дубля в дизайн-лабе нет.

Баннер обновлён через встроенный ImageGen 29 октября 2026. Под строкой «Подготовка к экзамену» расположена единая подпись слева: «Основы работы с ИИ» от **Yandex AI Studio**. Перед «от» обычный пробел, название бренда набрано жирным; логотип платформы не используется.

Исходный сведённый растр: [source/generated.png](source/generated.png), PNG 1774×887. [Точный промпт](source/prompt.txt) и [метаданные с SHA-256](source/provenance.json) сохранены рядом. Отдельных редактируемых текстовых слоёв у нового растра нет.

Оригиналы, прежняя HTML-композиция и остальные исходники перенесены без изменения байтов в [архив дизайн-лаба](../archive/2026-10-29-banners/README.md).

Версия с разнесёнными названием экзамена и подписью автора вместе с её исходниками сохранена в [отдельном архиве](../archive/2026-10-29-social-preview-spaced-caption/README.md).

Для повторного экспорта из raw-растра:

```bash
sips -z 640 1280 -s format jpeg -s formatOptions 92 docs/design-lab/social-preview/source/generated.png --out public/social-preview.jpg
```

Размер и вес соответствуют [рекомендациям GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview), проверенным 29 октября 2026. Загрузка в Settings → Social preview выполняется отдельно; настройки GitHub в этой задаче не изменялись.
