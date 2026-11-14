import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import api from '../services/api'

const initialState = {
  name: '',
  age_range: '',
  allergies: '',
  conditions: '',
  medications: '',
  preferences: '',
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(initialState)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const fetchProfile = async () => {
      try {
        const response = await api.get('/api/profile')
        if (active) {
          setProfile({ ...initialState, ...response.data })
        }
      } catch (err) {
        if (active) {
          console.error(err)
        }
      }
    }
    fetchProfile()
    return () => {
      active = false
    }
  }, [])

  const handleChange = (event) => {
    setProfile((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await api.put('/api/profile', profile)
      setMessage('Profile saved successfully!')
    } catch (err) {
      console.error(err)
      setError('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">Health profile</h2>
        <p className="mt-1 text-slate-600">Optional details can help personalize the assistant without assuming any condition.</p>
      </div>

      {message && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Name
          <input name="name" value={profile.name} onChange={handleChange} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" placeholder="Preferred name" />
        </label>
        <label className="text-sm text-slate-700">
          Age range
          <input name="age_range" value={profile.age_range} onChange={handleChange} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" placeholder="e.g. 25-34" />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          Allergies
          <input name="allergies" value={profile.allergies} onChange={handleChange} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" placeholder="Optional" />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          Existing conditions
          <input name="conditions" value={profile.conditions} onChange={handleChange} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" placeholder="Optional" />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          Medications
          <input name="medications" value={profile.medications} onChange={handleChange} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" placeholder="Optional" />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          Preferences
          <textarea name="preferences" value={profile.preferences} onChange={handleChange} rows={3} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" placeholder="Lifestyle or health goals" />
        </label>
      </div>

      <div className="mt-6 flex justify-end">
        <button type="submit" className="rounded-xl bg-brand-600 px-5 py-3 font-medium text-white disabled:opacity-60" disabled={saving}>
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}
