import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadPage } from './pages/lazy';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/varpas.css';
import './styles/app.css';

loadPage(location.pathname).finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
