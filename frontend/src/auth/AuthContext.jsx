import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { refreshAccessToken, setAccessToken } from '../services/api'
import { AuthContext } from './AuthContextValue'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem('pha_user')
          : null
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  // If we already have a saved user session in localStorage, do not block with full-screen spinner
  const [loading, setLoading] = useState(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        !localStorage.getItem('pha_user') &&
        !localStorage.getItem('pha_access_token')
      )
    } catch {
      return false
    }
  })

  useEffect(() => {
    let active = true
    const handleExpired = () => {
      setAccessToken(null)
      setUser(null)
      try {
        localStorage.removeItem('pha_user')
        localStorage.removeItem('pha_access_token')
      } catch {}
    }
    window.addEventListener('auth:expired', handleExpired)

    // Attempt background session refresh
    refreshAccessToken()
      .then((session) => {
        if (active && session?.user) {
          setUser(session.user)
          try {
            localStorage.setItem('pha_user', JSON.stringify(session.user))
          } catch {}
        }
      })
      .catch((err) => {
        // Do not force logout on refresh failure if we already have a stored token/user
        console.debug('Session background check note:', err?.message || err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      window.removeEventListener('auth:expired', handleExpired)
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const response = await api.post('/api/auth/login', credentials)
    const token = response.data.access_token
    const userData = response.data.user
    setAccessToken(token)
    setUser(userData)
    try {
      localStorage.setItem('pha_user', JSON.stringify(userData))
    } catch {}
    return userData
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch (e) {
      console.debug('Logout request error:', e)
    } finally {
      setAccessToken(null)
      setUser(null)
      try {
        localStorage.removeItem('pha_user')
        localStorage.removeItem('pha_access_token')
      } catch {}
    }
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout, setUser }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
