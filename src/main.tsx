import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';
import { catchUnhandledErrors } from './problems/log';

// Anything nothing else catches goes to the problem log (Home → Problem reports).
catchUnhandledErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
