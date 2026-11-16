import axios from 'axios'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL
export const API_BASE_URL = rawBaseUrl
  ? rawBaseUrl.replace(/\/+$/, '')
  : (import.meta.env.DEV ? 'http://127.0.0.1:8001' : '')

let accessToken =
  typeof window !== 'undefined'
    ? localStorage.getItem('pha_access_token')
    : null
let refreshRequest = null

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

export function setAccessToken(value) {
  accessToken = value
  if (typeof window !== 'undefined') {
    if (value) {
      localStorage.setItem('pha_access_token', value)
    } else {
      localStorage.removeItem('pha_access_token')
    }
  }
}

export function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = axios.post(
      `${API_BASE_URL}/api/auth/refresh`,
      {},
      { withCredentials: true, timeout: 5000 },
    ).then((response) => {
      setAccessToken(response.data.access_token)
      return response.data
    }).finally(() => {
      refreshRequest = null
    })
  }
  return refreshRequest
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config
    const authEndpoint = /^\/?api\/auth\/(login|register|refresh|logout)(?:\/|$)/.test(request?.url || '')
    if (error.response?.status !== 401 || !request || request._authRetry || authEndpoint) {
      return Promise.reject(error)
    }

    request._authRetry = true
    try {
      await refreshAccessToken()
      return api(request)
    } catch (refreshError) {
      setAccessToken(null)
      window.dispatchEvent(new Event('auth:expired'))
      return Promise.reject(refreshError)
    }
  },
)

export default api
