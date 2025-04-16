import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { store } from './store';

/**
 * HashRouter, not BrowserRouter.
 *
 * GitHub Pages serves static files with no server-side rewrite, so a request
 * for /history returns its 404 page rather than index.html -- the app works
 * until someone refreshes or deep-links, then breaks. HashRouter keeps the
 * route after a '#', which never reaches the server. The usual workaround
 * (copying index.html to 404.html) is a hack that costs a redirect and loses
 * the referrer; behind CloudFront this would instead be an error-page rule,
 * and BrowserRouter would be fine.
 */
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <App />
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
