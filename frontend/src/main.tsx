import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { FONT_SIZES, useUiPrefsStore } from './store/uiPrefs'

function Root() {
  const fontSizeKey = useUiPrefsStore((s) => s.fontSizeKey)
  return (
    <div style={{ fontSize: FONT_SIZES[fontSizeKey], height: '100%' }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
