import { useEffect, useState } from 'preact/hooks';

export type Theme = 'light' | 'dark';

export function useTheme(): Theme {
  const read = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const update = () => setTheme(read());
    window.addEventListener('trainer-theme-change', update);
    update();
    return () => window.removeEventListener('trainer-theme-change', update);
  }, []);
  return theme;
}
