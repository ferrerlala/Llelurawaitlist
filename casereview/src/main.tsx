import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { HOSTED } from './lib/hosted.ts';

const Router = HOSTED ? MemoryRouter : BrowserRouter;
import './index.css';
import { App } from './App.tsx';
import { AppProvider } from './app/AppContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AppProvider>
        <App />
      </AppProvider>
    </Router>
  </StrictMode>,
);
