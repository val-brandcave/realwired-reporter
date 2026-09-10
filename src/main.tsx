import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

/**
 * The library, the brand, then the faces. This order.
 *
 * `fonts.css` used to be omitted here, because it carried Geist, Inter and
 * Schibsted Grotesk and none of Reporter's three. It now bundles all six
 * families, so the app loads no type of its own and makes no external request
 * for it.
 */
import '@realwired/ui/styles.css';
import '@realwired/ui/themes/reporter.css';
import '@realwired/ui/fonts.css';

import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
