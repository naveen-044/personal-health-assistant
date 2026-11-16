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
  Check,
  House,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Settings,
  Trash2,
  UserCircle2,
  X,
} from 'lucide-react'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { ChatProvider, useChat } from './context/ChatContext'

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
  return (
    <ChatProvider>
      <Outlet />
    </ChatProvider>
  )
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return user ? <Navigate to="/" replace /> : children
}

function AppShell() {
  const { user, logout } = useAuth()
  const {
    conversations,
    activeConversationId,
    loadingHistory,
    selectConversation,
    startNewChat,
    renameConversation,
    deleteConversation,
    editingConvId,
    setEditingConvId,
    editTitleText,
    setEditTitleText,
  } = useChat()

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
            `flex items-center gap-3 rounded-xl px-3 py-2 text-xs sm:text-sm font-medium transition ${
              isActive
                ? 'bg-teal-50 text-teal-800 font-semibold ring-1 ring-teal-200'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0 text-teal-700" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )

  const renderSidebarContent = (onItemClick) => (
    <div className="flex flex-col h-full overflow-hidden p-3.5">
      {/* Brand Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-300 mb-3">
        <Link
          to="/"
          onClick={onItemClick}
          className="flex items-center gap-2.5 truncate"
        >
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

        {onItemClick ? (
          <button
            type="button"
            onClick={onItemClick}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* "+ New Chat" Button */}
      <button
        type="button"
        onClick={() => {
          startNewChat()
          if (onItemClick) onItemClick()
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-3.5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition mb-3"
      >
        <Plus className="h-4 w-4" />
        <span>New Chat</span>
      </button>

      {/* Main Navigation */}
      <div className="shrink-0">{renderNavLinks(onItemClick)}</div>

      {/* Single Unified Chat History Section */}
      <div className="mt-3.5 border-t border-slate-300 pt-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-teal-700" />
            Chat History
          </span>
          {conversations.length > 0 && (
            <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded-full border border-teal-200">
              {conversations.length}
            </span>
          )}
        </div>

        <div className="overflow-y-auto space-y-1 pr-1 flex-1">
          {loadingHistory ? (
            <div className="py-3 text-center text-xs text-slate-400">
              <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-700/20 border-t-teal-700" />
              Loading history…
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">No chats yet</p>
          ) : (
            conversations.map((conv) => {
              const isActive =
                isChatRoute && conv.conversation_id === activeConversationId
              const isEditing = editingConvId === conv.conversation_id

              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => {
                    if (!isEditing) {
                      selectConversation(conv)
                      if (onItemClick) onItemClick()
                    }
                  }}
                  className={`group flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition cursor-pointer border ${
                    isActive
                      ? 'bg-teal-50 border-teal-300 text-teal-950 font-semibold shadow-xs'
                      : 'border-transparent text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  {isEditing ? (
                    <div
                      className="flex items-center gap-1 w-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editTitleText}
                        onChange={(e) => setEditTitleText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')
                            renameConversation(
                              conv.conversation_id,
                              editTitleText,
                            )
                          if (e.key === 'Escape') setEditingConvId(null)
                        }}
                        autoFocus
                        className="flex-1 rounded-lg border border-teal-400 bg-white px-2 py-1 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          renameConversation(
                            conv.conversation_id,
                            editTitleText,
                          )
                        }}
                        className="rounded-md p-1 text-teal-700 hover:bg-teal-100"
                        title="Save title"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingConvId(null)
                        }}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-200"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 truncate">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                        <span className="truncate">
                          {conv.title || 'Consultation'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingConvId(conv.conversation_id)
                            setEditTitleText(conv.title || 'Untitled Chat')
                          }}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                          title="Edit chat name"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteConversation(conv.conversation_id)
                          }}
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition"
                          title="Delete chat"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* User Account & Sign Out footer */}
      <div className="border-t border-slate-300 pt-3 mt-auto shrink-0">
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-2.5 mb-2">
          <p className="truncate text-xs font-semibold text-slate-800">
            {user?.full_name || 'Health User'}
          </p>
          <p className="truncate text-[11px] text-slate-500">{user?.email || ''}</p>
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
  )

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-100/60 text-slate-800">
      {/* Desktop Single Sidebar (Docked left) */}
      <aside
        className={`hidden md:flex flex-col justify-between border-r border-slate-300 bg-white transition-all duration-200 ease-in-out ${
          sidebarOpen ? 'w-64 lg:w-72' : 'w-0 border-r-0 overflow-hidden'
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Single Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 sm:w-80 flex-col justify-between bg-white shadow-xl">
            {renderSidebarContent(() => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Main View Area */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Top Minimal Navigation Bar with crisp stroke */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-300 bg-white px-3 md:px-4">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="hidden md:inline-flex rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition border border-slate-200"
                title="Open sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex md:hidden rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
              title="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link to="/" className="flex items-center gap-2 md:hidden">
              <img src="/logo.png" alt="PHA" className="h-6 w-6 object-contain" />
              <span className="text-xs font-bold text-slate-900">
                Personal Health Assistant
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            >
              <UserCircle2 className="h-4 w-4 text-teal-700" />
              <span className="hidden sm:inline truncate max-w-32">
                {user?.full_name || 'Profile'}
              </span>
            </Link>
          </div>
        </header>

        {/* Page Content Container with crisp borders and clean padding */}
        <main
          className={`flex-1 min-w-0 ${
            isChatRoute
              ? 'h-[calc(100dvh-3rem)] overflow-hidden p-1 sm:p-3'
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
