import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './index.css';
import './components/TopBar/TopBar.css';
import './components/Sidebar/Sidebar.css';
import './components/ContentArea/ItemCard.css';
import './components/ContentArea/ContentArea.css';
import './components/ContextMenu/ContextMenu.css';
import './components/Settings/Settings.css';
import './components/DropImportDialog/DropImportDialog.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
