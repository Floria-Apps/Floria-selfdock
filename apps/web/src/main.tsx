import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@m3e/web/theme';
import '@fontsource-variable/roboto-flex/opsz.css';
import './ui/registerIcons';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Could not start Floria SelfDock: the "#root" element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
