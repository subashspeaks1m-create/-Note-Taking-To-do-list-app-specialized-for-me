import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/today.css';
import './styles/pages.css';
import './styles/work.css';
import './styles/visions.css';
import './styles/calendar.css';
import './styles/journal.css';
import './styles/insights.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
