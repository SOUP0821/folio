import { createRoot } from 'react-dom/client'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/literata/400.css'
import '@fontsource/literata/400-italic.css'
import '@fontsource/literata/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import { App } from './App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Folio could not find its window.')

createRoot(root).render(<App />)
