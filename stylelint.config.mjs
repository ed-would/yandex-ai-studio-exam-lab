export default {
  extends: ['stylelint-config-recommended'],
  rules: {
    // Базовые стили, оформление и адаптивные правила намеренно дополняют одни и те же селекторы.
    'no-duplicate-selectors': null,
    // Компоненты используют общие элементы, но не требуют общего порядка специфичности.
    'no-descending-specificity': null,
  },
};
