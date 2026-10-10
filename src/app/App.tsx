import { createBrowserRouter, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ToastProvider } from '../components/Toasts';
import { ClockProvider } from '../date/clock';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { CharacterPage } from '../features/character/CharacterPage';
import { InsightsPage } from '../features/insights/InsightsPage';
import { JournalPage } from '../features/journal/JournalPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TodayPage } from '../features/today/TodayPage';
import { VisionsPage } from '../features/visions/VisionsPage';
import { StorageProvider } from '../storage/StorageProvider';
import { AppShell } from './AppShell';
import { DisplayPrefsProvider } from './displayPrefs';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'visions', element: <VisionsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'journal', element: <JournalPage /> },
      { path: 'character', element: <CharacterPage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/**
 * Normal builds use real URLs. Sandboxed review previews can't own the URL bar,
 * so `VITE_ROUTER=memory` keeps navigation in memory instead.
 */
const router = import.meta.env.VITE_ROUTER === 'memory' ? createMemoryRouter(routes) : createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.startsWith('/') ? import.meta.env.BASE_URL : '/' });

export function App() {
  return (
    <ClockProvider>
      <DisplayPrefsProvider>
        <StorageProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </StorageProvider>
      </DisplayPrefsProvider>
    </ClockProvider>
  );
}
