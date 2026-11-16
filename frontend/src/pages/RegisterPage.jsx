import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import api from '../services/api'

function getErrorMessage(error) {
  const detail = error.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(' ')
  if (typeof detail === 'string') {
    if (/mongo|database|atlas|connection/i.test(detail)) {
      return 'Account registration is temporarily unavailable. Please try again later.'
    }
    return detail
  }
  return 'We could not create your account. Please try again.'
}

function passwordStrength(password) {
  const checks = [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ]
  return checks.filter(Boolean).length
}

const strengthLabels = ['Enter a password', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong']
const strengthColors = ['bg-slate-200', 'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-600', 'bg-emerald-600']

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    password: '',
    confirm_password: '',
    accept_terms: false,
  })
  const [showPasswords, setShowPasswords] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const redirectTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(redirectTimer.current), [])

  const handleChange = (event) => {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (form.password !== form.confirm_password) {
      setError('Your passwords do not match.')
      return
    }
    if (new TextEncoder().encode(form.password).length > 72) {
      setError('Password must be no more than 72 bytes.')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/auth/register', {
        ...form,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim() || null,
      })
      setSuccess('Your account has been created. Redirecting you to sign in…')
      redirectTimer.current = window.setTimeout(
        () => navigate('/login', { replace: true, state: { registered: true } }),
        1100,
      )
    } catch (registrationError) {
      setError(getErrorMessage(registrationError))
    } finally {
      setLoading(false)
    }
  }

  const strength = passwordStrength(form.password)
  const passwordInput = (name, label, autocomplete) => (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <span className="relative mt-2 block">
        <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type={showPasswords ? 'text' : 'password'}
          name={name}
          autoComplete={autocomplete}
          required
          minLength={8}
          maxLength={72}
          value={form[name]}
          onChange={handleChange}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
          placeholder={name === 'password' ? 'At least 8 characters' : 'Enter password again'}
        />
        {name === 'password' && (
          <button type="button" onClick={() => setShowPasswords((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={showPasswords ? 'Hide password' : 'Show password'}>
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </span>
    </label>
  )

  return (
    <AuthLayout>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Create your account</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">A healthier way to stay informed</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Set up your private Personal Health Assistant workspace.</p>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <span className="relative mt-2 block">
            <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="full_name" autoComplete="name" required minLength={1} maxLength={120} value={form.full_name} onChange={handleChange} className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" placeholder="Your full name" />
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Email address
          <span className="relative mt-2 block">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="email" name="email" autoComplete="email" required maxLength={254} value={form.email} onChange={handleChange} className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" placeholder="you@example.com" />
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Phone number <span className="font-normal text-slate-400">(optional)</span>
          <span className="relative mt-2 block">
            <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="tel" name="phone_number" autoComplete="tel" maxLength={32} value={form.phone_number} onChange={handleChange} className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" placeholder="+1 555 0100" />
          </span>
        </label>

        {passwordInput('password', 'Password', 'new-password')}
        {form.password && (
          <div aria-live="polite">
            <div className="flex gap-1.5" aria-hidden="true">
              {strengthColors.slice(1).map((color, index) => (
                <span key={color} className={`h-1.5 flex-1 rounded-full ${strength >= index + 1 ? color : 'bg-slate-200'}`} />
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Password strength: {strengthLabels[strength]}</p>
          </div>
        )}
        {passwordInput('confirm_password', 'Confirm password', 'new-password')}

        <label className="flex items-start gap-2.5 pt-1 text-sm leading-5 text-slate-600">
          <input type="checkbox" name="accept_terms" checked={form.accept_terms} onChange={handleChange} required className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-teal-700" />
          <span>I agree to the Terms and Conditions and understand this service provides educational health information.</span>
        </label>

        <button type="submit" disabled={loading || Boolean(success)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-wait disabled:opacity-70">
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-teal-700 hover:text-teal-900">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
