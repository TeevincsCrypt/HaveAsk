import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider, Loading } from './components/ui.jsx';
import { AuthWalletProvider } from './wallet.jsx';
import { api } from './api.js';
import './styles.css';

function Root() {
  const [meta, setMeta] = useState(null);
  useEffect(() => { api('/meta').then((m) => setMeta({ ...m, fetchedAt: Date.now() })).catch(() => setMeta({ error: true })); }, []);
  if (!meta) return <Loading />;
  return (
    <AuthWalletProvider meta={meta}>
      <BrowserRouter>
        <ToastProvider>
          <App initialMeta={meta} />
        </ToastProvider>
      </BrowserRouter>
    </AuthWalletProvider>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
