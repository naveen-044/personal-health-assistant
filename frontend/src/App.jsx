import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BookOpenText, House, LogOut, MessageSquareText, Settings, UserCircle2 } from 'lucide-react'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import LandingPage from './pages/LandingPage'
import ChatPage from './pages/ChatPage'
import LibraryPage from './pages/LibraryPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'
import SettingsPage from './pages/SettingsPage'

const navItems = [
  { to: '/', label: 'Home', icon: House },
  { to: '/chat', label: 'Chat', icon: MessageSquareText },
  { to: '/documents', label: 'Library', icon: BookOpenText },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
      <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-teal-700/20 border-t-teal-700" />
      Restoring your secure session…
    </main>
  )
}

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return user ? <Navigate to="/" replace /> : children
}

function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const handleLogout = async () => {
    let logoutMessage = ''
    try {
      await logout()
    } catch (error) {
      console.error('Unable to revoke the server session:', error)
      logoutMessage = 'Your browser session was cleared, but the server could not confirm sign out. Please try again when the service is available.'
    } finally {
      navigate('/login', { replace: true, state: logoutMessage ? { logoutMessage } : null })
    }
  }

  const navClass = (isActive, compact = false) => `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-100'
      : `text-slate-600 hover:bg-slate-50 ${compact ? 'border border-slate-200' : ''}`
  }`

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <div className="mx-auto flex max-w-7xl gap-6 p-4 md:p-6">
        <aside className="hidden w-72 shrink-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft md:block">
          <Link to="/" className="mb-6 block px-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Personal Health</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Assistant</h1>
          </Link>
          <nav className="space-y-2" aria-label="Main navigation">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100' : 'text-slate-600 hover:bg-slate-50'
                }`
              }>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 border-t border-slate-100 px-3 pt-5">
            <p className="truncate text-sm font-semibold text-slate-800">{user.full_name}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
            <button type="button" onClick={handleLogout} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-rose-700">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="mb-6 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-soft md:hidden">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Link to="/" className="text-sm font-semibold text-slate-900">Personal Health Assistant</Link>
              <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
            <nav className="flex flex-wrap gap-2" aria-label="Main navigation">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => navClass(isActive, true)}>
                  <Icon className="h-4 w-4" /> {label}
                </NavLink>
              ))}
            </nav>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/documents" element={<LibraryPage />} />
              <Route path="/library" element={<Navigate to="/documents" replace />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
