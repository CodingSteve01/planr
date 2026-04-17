import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { I18nProvider, ThemeProvider } from './i18n.jsx';
import './App.css';

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <I18nProvider>
      <App />
    </I18nProvider>
  </ThemeProvider>
);
