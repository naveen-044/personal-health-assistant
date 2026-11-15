import axios from 'axios'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL
export const API_BASE_URL = rawBaseUrl
  ? rawBaseUrl.replace(/\/+$/, '')
  : (import.meta.env.DEV ? 'http://127.0.0.1:8001' : '')

let accessToken = null
let refreshRequest = null

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

export function setAccessToken(value) {
  accessToken = value
}

export function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = axios.post(
      `${API_BASE_URL}/api/auth/refresh`,
      {},
      { withCredentials: true },
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
