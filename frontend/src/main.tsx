import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@phosphor-icons/web/regular/style.css'
import '@phosphor-icons/web/fill/style.css'
import './nocturne.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
