import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html, Icon } from './ui.js';

const MOBILE_QUERY = '(max-width: 820px), (hover: none) and (pointer: coarse)';

export function SelectField({ label, value, options, onChange }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const native = useRef(null);
  const list = useRef(null);
  const isOpen = useRef(false);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const active = useRef(selected);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selected);
  const [placement, setPlacement] = useState({ above: false, height: 320 });

  const activate = (index) => {
    active.current = index;
    setActiveIndex(index);
  };
  const close = (commit = false) => {
    if (!isOpen.current) return;
    isOpen.current = false;
    setOpen(false);
    search.current.text = '';
    if (commit && options[active.current].value !== value) onChange(options[active.current].value);
  };
  const show = (index = selected) => {
    const rect = trigger.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const desired = Math.min(320, options.length * 44 + 12);
    const flip = below < desired && above > below;
    setPlacement({ above: flip, height: Math.max(0, Math.min(320, (flip ? above : below) - 8)) });
    activate(index);
    isOpen.current = true;
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current.contains(event.target)) close(true);
    };
    const resize = () => {
      close();
      if (document.activeElement === trigger.current && window.matchMedia(MOBILE_QUERY).matches) {
        native.current.focus({ preventScroll: true });
      }
    };
    const media = window.matchMedia(MOBILE_QUERY);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', resize);
    media.addEventListener('change', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', resize);
      media.removeEventListener('change', resize);
    };
  }, [open, value, options, onChange]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = list.current;
    const option = menu.children[activeIndex];
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
    }
  }, [open, activeIndex]);

  const onKeyDown = (event) => {
    const key = event.key;
    if (event.ctrlKey || event.metaKey) return;
    if (key === 'Tab') {
      close(true);
      return;
    }
    if (key === 'Escape') {
      if (isOpen.current) event.preventDefault();
      close();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (isOpen.current) close(true);
      else show();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (event.altKey) {
        if (key === 'ArrowUp') close(true);
        else if (!isOpen.current) show();
      } else if (!isOpen.current) show(key === 'ArrowUp' ? 0 : selected);
      else activate(Math.max(0, Math.min(options.length - 1, active.current + (key === 'ArrowDown' ? 1 : -1))));
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      const index = key === 'Home' ? 0 : options.length - 1;
      if (isOpen.current) activate(index);
      else show(index);
    } else if (key.length === 1 && !event.altKey) {
      event.preventDefault();
      const char = key.toLocaleLowerCase('ru-RU');
      const now = Date.now();
      const text = now - search.current.time > 700 ? char : search.current.text + char;
      search.current = { text, time: now };
      const repeated = [...text].every((letter) => letter === char);
      const prefix = repeated ? char : text;
      const start = text.length === 1 || repeated ? (isOpen.current ? active.current : selected) + 1 : 0;
      for (let step = 0; step < options.length; step++) {
        const index = (start + step) % options.length;
        if (options[index].label.toLocaleLowerCase('ru-RU').startsWith(prefix)) {
          if (isOpen.current) activate(index);
          else show(index);
          break;
        }
      }
    }
  };

  return html`<div class="select-field adaptive-select" ref=${root}>
    <select class="select-native" aria-label=${label} value=${value} ref=${native} onChange=${(event) => onChange(event.currentTarget.value)}>
      ${options.map((option) => html`<option key=${option.value} value=${option.value}>${option.label}</option>`)}
    </select>
    <div class="select-desktop">
      <button type="button" class="select-trigger" role="combobox" aria-label=${label} aria-haspopup="listbox" aria-expanded=${open} aria-controls=${open ? `${id}-list` : undefined} aria-activedescendant=${open ? `${id}-option-${activeIndex}` : undefined} ref=${trigger} onKeyDown=${onKeyDown} onBlur=${(
        event,
      ) => {
        if (!root.current.contains(event.relatedTarget)) {
          // CSS может скрыть кнопку раньше события resize. Это смена интерфейса, а не подтверждение выбора.
          if (window.matchMedia(MOBILE_QUERY).matches) {
            close();
            native.current.focus({ preventScroll: true });
          } else close(true);
        }
      }} onClick=${() => {
        trigger.current.focus({ preventScroll: true });
        if (isOpen.current) close();
        else {
          search.current.text = '';
          show();
        }
      }}><span>${options[selected].label}</span><${Icon} name="chevron" size=${17}/></button>
      ${
        open &&
        html`<div class=${`select-menu ${placement.above ? 'opens-above' : ''}`} id=${`${id}-list`} role="listbox" aria-label=${label} style=${{ maxHeight: `${placement.height}px` }} ref=${list}>
        ${options.map(
          (option, index) =>
            html`<div key=${option.value} id=${`${id}-option-${index}`} class="select-option" role="option" aria-selected=${index === activeIndex} data-active=${index === activeIndex} onPointerMove=${() => activate(index)} onPointerDown=${(event) => event.preventDefault()} onClick=${() => {
              activate(index);
              close(true);
              trigger.current.focus({ preventScroll: true });
            }}><span>${option.label}</span>${option.value === value && html`<${Icon} name="check" size=${17}/>`}</div>`,
        )}
      </div>`
      }
    </div>
  </div>`;
}
