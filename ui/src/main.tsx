import { render } from 'solid-js/web';
import App from './App';

try {
  const saved = localStorage.getItem('banana-theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
} catch {
  /* ignore */
}

render(() => <App />, document.getElementById('root')!);
