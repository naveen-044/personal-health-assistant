import axios from 'axios'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL
export const API_BASE_URL = rawBaseUrl
  ? rawBaseUrl.replace(/\/+$/, '')
  : (import.meta.env.DEV ? 'http://127.0.0.1:8001' : '')

const getUserId = () => {
  if (typeof window === 'undefined') return 'demo-user'
  const stored = localStorage.getItem('health-assistant-user')
  if (stored) return stored
  const defaultUser = 'demo-user'
  localStorage.setItem('health-assistant-user', defaultUser)
  return defaultUser
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-User-Id': getUserId(),
  },
})

export const setActiveUser = (value) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('health-assistant-user', value)
  }
  api.defaults.headers['X-User-Id'] = value
}

export default api
