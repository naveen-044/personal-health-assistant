import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../auth/useAuth'
import api from '../services/api'

function getErrorMessage(error) {
  const detail = error.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(' ')
  if (typeof detail === 'string') {
    if (/mongo|database|atlas|connection/i.test(detail)) {
      return 'Service is temporarily unavailable. Please try again later.'
    }
    return detail
  }
  return error.message || 'An unexpected error occurred. Please try again.'
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Sign In states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    location.state?.registered
      ? 'Your account is ready. Sign in to continue.'
      : location.state?.logoutMessage || '',
  )

  // Forgot Password multi-step states: 'signin' | 'forgot_step1' | 'forgot_step2'
  const [mode, setMode] = useState('signin')
  const [forgotEmail, setForgotEmail] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [loadingCaptcha, setLoadingCaptcha] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Fetch fresh CAPTCHA challenge
  const fetchCaptcha = async () => {
    setLoadingCaptcha(true)
    setCaptchaInput('')
    try {
      const response = await api.get('/api/auth/captcha')
      setCaptchaId(response.data.captcha_id)
      setCaptchaImage(response.data.captcha_image)
    } catch (err) {
      console.error('Failed to load CAPTCHA:', err)
      setForgotError('Unable to load CAPTCHA challenge. Please refresh.')
    } finally {
      setLoadingCaptcha(false)
    }
  }

  // Handle opening Forgot Password mode
  const handleOpenForgotPassword = () => {
    setForgotEmail(email.trim())
    setForgotError('')
    setMode('forgot_step1')
    fetchCaptcha()
  }

  // Normal Sign In submit
  const handleSignInSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      await login({ email: email.trim(), password, remember_me: rememberMe })
      navigate('/', { replace: true })
    } catch (loginError) {
      setError(getErrorMessage(loginError))
    } finally {
      setLoading(false)
    }
  }

  // Forgot Password Step 1: Verify Email & Captcha
  const handleVerifyCaptchaSubmit = async (event) => {
    event.preventDefault()
    setForgotError('')

    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.')
      return
    }
    if (!captchaInput.trim()) {
      setForgotError('Please enter the security CAPTCHA characters.')
      return
    }

    setForgotLoading(true)
    try {
      const response = await api.post('/api/auth/forgot-password/verify', {
        email: forgotEmail.trim(),
        captcha_id: captchaId,
        captcha_text: captchaInput.trim(),
      })

      if (response.data?.reset_token) {
        setResetToken(response.data.reset_token)
        setMode('forgot_step2')
        setForgotError('')
      }
    } catch (err) {
      setForgotError(getErrorMessage(err))
      // Reload a fresh CAPTCHA after failure
      fetchCaptcha()
    } finally {
      setForgotLoading(false)
    }
  }

  // Forgot Password Step 2: Save New Password
  const handleResetPasswordSubmit = async (event) => {
    event.preventDefault()
    setForgotError('')

    if (newPassword.length < 8) {
      setForgotError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match. Please re-enter.')
      return
    }

    setForgotLoading(true)
    try {
      const response = await api.post('/api/auth/reset-password', {
        email: forgotEmail.trim(),
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })

      // Password updated successfully! Switch back to login
      setEmail(forgotEmail.trim())
      setPassword('')
      setMode('signin')
      setNotice(
        response.data?.message ||
          'Your password has been reset successfully! You can now sign in with your new password.',
      )
      // Reset forgot states
      setForgotEmail('')
      setCaptchaInput('')
      setResetToken('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setForgotError(getErrorMessage(err))
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <AuthLayout>
      {/* =========================================================================
          MODE 1: SIGN IN VIEW
          ========================================================================= */}
      {mode === 'signin' && (
        <>
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
              Welcome back
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Continue to your personal health workspace.
            </p>
          </div>

          {notice && (
            <div
              role="status"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-2xs"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {error}
            </p>
          )}

          <form className="space-y-5" onSubmit={handleSignInSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <span className="relative mt-2 block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  placeholder="you@example.com"
                />
              </span>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <span className="relative mt-2 block">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="inline-flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-teal-700"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={handleOpenForgotPassword}
                className="font-medium text-teal-700 transition hover:text-teal-900"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-wait disabled:opacity-70"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-600">
            New to Personal Health Assistant?{' '}
            <Link to="/register" className="font-semibold text-teal-700 hover:text-teal-900">
              Create a new account
            </Link>
          </p>
        </>
      )}

      {/* =========================================================================
          MODE 2: FORGOT PASSWORD - STEP 1 (EMAIL + CAPTCHA)
          ========================================================================= */}
      {mode === 'forgot_step1' && (
        <>
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setForgotError('')
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 transition mb-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign in
            </button>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Forgot your password?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Enter your registered email address and solve the security CAPTCHA to continue.
            </p>
          </div>

          {forgotError && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {forgotError}
            </p>
          )}

          <form className="space-y-5" onSubmit={handleVerifyCaptchaSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Registered email address
              <span className="relative mt-2 block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  name="forgot_email"
                  required
                  autoFocus
                  maxLength={254}
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  placeholder="you@example.com"
                />
              </span>
            </label>

            {/* CAPTCHA Challenge Card */}
            <div className="rounded-2xl border border-slate-300 bg-slate-50/70 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Security CAPTCHA
                </span>
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  disabled={loadingCaptcha}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 transition"
                  title="Generate a new challenge code"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCaptcha ? 'animate-spin' : ''}`} />
                  <span>Refresh Code</span>
                </button>
              </div>

              {/* CAPTCHA Display */}
              <div className="flex items-center justify-center p-1">
                {captchaImage ? (
                  <img
                    src={captchaImage}
                    alt="Security CAPTCHA code"
                    className="h-12 w-44 rounded-xl border border-slate-300 bg-white shadow-xs select-none object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-44 items-center justify-center rounded-xl border border-slate-300 bg-white text-xs text-slate-400">
                    Loading CAPTCHA…
                  </div>
                )}
              </div>

              {/* Captcha Input */}
              <label className="block text-xs font-medium text-slate-700">
                Enter the characters shown above:
                <input
                  type="text"
                  required
                  autoComplete="off"
                  spellCheck="false"
                  maxLength={8}
                  value={captchaInput}
                  onChange={(event) => setCaptchaInput(event.target.value.toUpperCase())}
                  placeholder="e.g. 7X9K2"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-center text-base font-mono font-bold tracking-widest text-slate-900 uppercase outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 shadow-2xs"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={forgotLoading || !captchaInput.trim() || !forgotEmail.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {forgotLoading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {forgotLoading ? 'Verifying CAPTCHA…' : 'Verify & Continue'}
            </button>
          </form>
        </>
      )}

      {/* =========================================================================
          MODE 3: FORGOT PASSWORD - STEP 2 (ENTER & SAVE NEW PASSWORD)
          ========================================================================= */}
      {mode === 'forgot_step2' && (
        <>
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setForgotError('')
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 transition mb-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Cancel
            </button>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Set new password
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Identity verified for <strong className="text-slate-800">{forgotEmail}</strong>.
              Enter your new password below.
            </p>
          </div>

          {forgotError && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {forgotError}
            </p>
          )}

          <form className="space-y-5" onSubmit={handleResetPasswordSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              New Password
              <span className="relative mt-2 block">
                <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  minLength={8}
                  maxLength={72}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Confirm New Password
              <span className="relative mt-2 block">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  maxLength={72}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  placeholder="Re-enter your new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={forgotLoading || !newPassword || !confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {forgotLoading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {forgotLoading ? 'Saving new password…' : 'Save New Password'}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
