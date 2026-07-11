import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { AccessProvider } from './access/AccessContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AccessProvider>
        <App />
      </AccessProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
