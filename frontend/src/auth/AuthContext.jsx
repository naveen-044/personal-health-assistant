import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { refreshAccessToken, setAccessToken } from '../services/api'
import { AuthContext } from './AuthContextValue'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const handleExpired = () => {
      setAccessToken(null)
      setUser(null)
    }
    window.addEventListener('auth:expired', handleExpired)

    refreshAccessToken()
      .then((session) => {
        if (active) setUser(session.user)
      })
      .catch(() => {
        setAccessToken(null)
        if (active) setUser(null)
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
    setAccessToken(response.data.access_token)
    setUser(response.data.user)
    return response.data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
