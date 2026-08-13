import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import DesktopSetupGate from './components/DesktopSetupGate'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <DesktopSetupGate>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DesktopSetupGate>
    </AppErrorBoundary>
  </React.StrictMode>,
)
