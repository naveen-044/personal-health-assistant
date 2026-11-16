import { lazy, Suspense, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  BookOpenText,
  House,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserCircle2,
  X,
} from 'lucide-react'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const navItems = [
  { to: '/', label: 'Home', icon: House },
  { to: '/chat', label: 'Chat Assistant', icon: MessageSquareText },
  { to: '/documents', label: 'Medical Library', icon: BookOpenText },
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

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center text-sm font-medium text-slate-500">
      <span className="mr-2.5 h-4 w-4 animate-spin rounded-full border-2 border-teal-700/20 border-t-teal-700" />
      Loading…
    </div>
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
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isChatRoute = location.pathname === '/chat'

  const handleLogout = async () => {
    let logoutMessage = ''
    try {
      await logout()
    } catch (error) {
      console.error('Unable to revoke the server session:', error)
      logoutMessage =
        'Your browser session was cleared, but the server could not confirm sign out. Please try again when the service is available.'
    } finally {
      navigate('/login', {
        replace: true,
        state: logoutMessage ? { logoutMessage } : null,
      })
    }
  }

  const renderNavLinks = (onItemClick) => (
    <nav className="space-y-1" aria-label="Main navigation">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onItemClick}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-medium transition ${
              isActive
                ? 'bg-teal-50 text-teal-800 font-semibold ring-1 ring-teal-100'
                : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0 text-teal-700" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50/50 text-slate-800">
      {/* Desktop Collapsible Sidebar (Docked left like ChatGPT / Gemini) */}
      <aside
        className={`hidden md:flex flex-col justify-between border-r border-slate-200 bg-white transition-all duration-200 ease-in-out ${
          sidebarOpen ? 'w-64' : 'w-0 border-r-0 overflow-hidden'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto p-3.5">
          {/* Logo & Brand Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-3">
            <Link to="/" className="flex items-center gap-2.5 truncate">
              <img
                src="/logo.png"
                alt="PHA Logo"
                className="h-8 w-8 shrink-0 rounded-lg object-contain"
              />
              <div className="truncate">
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 leading-tight">
                  Personal Health
                </p>
                <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight">
                  Assistant (PHA)
                </h1>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              title="Close sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation Items */}
          <div className="flex-1">{renderNavLinks()}</div>

          {/* User Account & Sign Out footer */}
          <div className="border-t border-slate-100 pt-3 mt-auto">
            <div className="rounded-xl bg-slate-50 p-2.5 mb-2">
              <p className="truncate text-xs font-semibold text-slate-800">
                {user.full_name || 'Health User'}
              </p>
              <p className="truncate text-[11px] text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-600" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 flex-col justify-between bg-white p-4 shadow-xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <img
                    src="/logo.png"
                    alt="PHA Logo"
                    className="h-8 w-8 rounded-lg object-contain"
                  />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 leading-tight">
                      Personal Health
                    </p>
                    <h1 className="text-sm font-bold text-slate-900 leading-tight">
                      Assistant
                    </h1>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {renderNavLinks(() => setMobileMenuOpen(false))}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="rounded-xl bg-slate-50 p-2.5 mb-2">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {user.full_name}
                </p>
                <p className="truncate text-[11px] text-slate-500">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-600" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main View Area */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Top Minimal Navigation Bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-3 md:px-4">
          <div className="flex items-center gap-2">
            {/* Desktop open button if collapsed */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="hidden md:inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                title="Open sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            {/* Mobile hamburger menu */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex md:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link to="/" className="flex items-center gap-2 md:hidden">
              <img src="/logo.png" alt="PHA" className="h-6 w-6 object-contain" />
              <span className="text-xs font-bold text-slate-900">Personal Health Assistant</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              <UserCircle2 className="h-4 w-4 text-teal-700" />
              <span className="hidden sm:inline truncate max-w-32">{user.full_name}</span>
            </Link>
          </div>
        </header>

        {/* Page Content Container */}
        <main
          className={`flex-1 min-w-0 ${
            isChatRoute
              ? 'h-[calc(100dvh-3rem)] overflow-hidden p-2 sm:p-3'
              : 'overflow-y-auto p-4 sm:p-6 max-w-5xl w-full mx-auto'
          }`}
        >
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestOnly>
                  <LoginPage />
                </GuestOnly>
              }
            />
            <Route
              path="/register"
              element={
                <GuestOnly>
                  <RegisterPage />
                </GuestOnly>
              }
            />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<LandingPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/documents" element={<LibraryPage />} />
                <Route
                  path="/library"
                  element={<Navigate to="/documents" replace />}
                />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
