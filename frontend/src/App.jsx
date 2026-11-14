import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { BookOpenText, House, MessageSquareText, Settings, UserCircle2 } from 'lucide-react'
import LandingPage from './pages/LandingPage'
import ChatPage from './pages/ChatPage'
import LibraryPage from './pages/LibraryPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'

const navItems = [
  { to: '/', label: 'Home', icon: House },
  { to: '/chat', label: 'Chat', icon: MessageSquareText },
  { to: '/documents', label: 'Library', icon: BookOpenText },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function AppShell() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <div className="mx-auto flex max-w-7xl gap-6 p-4 md:p-6">
        <aside className="hidden w-72 shrink-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft md:block">
          <div className="mb-6 px-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Health assistant</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Personal care</h1>
          </div>
          <nav className="space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100' : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1">
          <header className="mb-6 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-soft md:hidden">
            <div className="flex flex-wrap gap-2">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" /> {label}
                </NavLink>
              ))}
            </div>
          </header>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/documents" element={<LibraryPage />} />
            <Route path="/library" element={<Navigate to="/documents" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
