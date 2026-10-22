import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './styles/shell.css'
import './styles/stage.css'
import './styles/cards.css'
import './styles/settings.css'
import './styles/about.css'
import './styles/colophon.css'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore registration failures */
    })
  })
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {
        /* ignore cleanup failures */
      })
  })
}
