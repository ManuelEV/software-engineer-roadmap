import { Suspense, lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { Home } from './pages/Home'
import { UnitPage } from './pages/UnitPage'
import { NotFound } from './pages/NotFound'

// Topic pages pull in the MDX components, code highlighting and diagrams: load them on demand.
const TopicPage = lazy(() => import('./pages/TopicPage').then((m) => ({ default: m.TopicPage })))

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: ':unit', element: <UnitPage /> },
      {
        path: ':unit/:slug',
        element: (
          <Suspense fallback={<div className="route-loading" role="status" aria-label="Cargando" />}>
            <TopicPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])
