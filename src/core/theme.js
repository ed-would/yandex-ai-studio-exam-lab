import { useEffect, useState } from 'preact/hooks';

export function useTheme() {
  const read = () => document.documentElement.dataset.theme || 'light';
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const update = () => setTheme(read());
    window.addEventListener('trainer-theme-change', update);
    update();
    return () => window.removeEventListener('trainer-theme-change', update);
  }, []);
  return theme;
}
