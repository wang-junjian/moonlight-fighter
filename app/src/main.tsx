import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// The app is served from different roots depending on where it is deployed:
// "/" locally / in Docker, "/moonlight-fighter/" on GitHub Pages (project site).
// Deriving the basename from the document URL keeps the router working under a
// sub-path without hardcoding the repository name; without it, "/" would never
// match and a directly-opened project-site URL would render an empty page.
const basename =
  new URL(document.baseURI).pathname
    .replace(/\/[^/]*\.html?$/, '/')
    .replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
