import { createRoot } from 'react-dom/client'
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/600.css'
import './styles/tokens.css'
import './styles/app.css'
import App from './App'
import './styles/dish.css'
import { AppProvider } from './app-context'
import { store } from './store'
import { copy } from './copy'
import { registerOffline } from './pwa/register'

createRoot(document.getElementById('root')!).render(<AppProvider><App /></AppProvider>)
void store.init().catch(() => { document.getElementById('root')!.textContent = copy.errors.open })
registerOffline()
addEventListener('pagehide', () => store.dispose())
