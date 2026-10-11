# Hero в GitHub README

GitHub web поддерживает `<picture>` в Markdown и документирует `prefers-color-scheme` для тематических изображений. Публичный sanitizer разрешает `picture`, `source`, `srcset` и `media`. Составное условие ширины и темы опирается на эти разрешённые атрибуты и стандартное поведение браузера.

В README источники расположены по приоритету: mobile dark, mobile light, desktop dark, desktop light. У desktop нет нижнего порога ширины, поэтому дробная ширина между 600 и 601 px тоже получает подходящий источник. Fallback использует светлую мобильную композицию. При проверке браузерные `currentSrc` должны соответствовать всем четырём сочетаниям ширины и темы.

Выбор картинки зависит от media query. Ручная тема GitHub и системная тема могут расходиться. Поведение опубликованной страницы и нативного GitHub Mobile в этой работе не проверялось. Историческое ограничение нативного приложения на `<picture>` делает fallback полезным; текущую поддержку приложения по прежнему ответу нельзя объявить проверенной.

Первичные источники:

- [GitHub: Picture element и относительные изображения](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax).
- [GitHub: Quickstart с адаптивным picture](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github).
- [Публичный sanitizer allowlist](https://github.com/gjtorikian/html-pipeline/blob/main/lib/html_pipeline/sanitization_filter.rb).
- [GitHub: настройки темы](https://docs.github.com/en/get-started/accessibility/managing-your-theme-settings).
- [Сообщение о расхождении темы и media query](https://github.com/github/markup/issues/1583).
- [Исторический ответ о GitHub Mobile](https://github.com/orgs/community/discussions/41758).

Исследование выполнено через native web, без отправки исходников во внешний редактор и без публикации изменений.
