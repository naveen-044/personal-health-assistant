import { BellRing, ShieldCheck, ServerCog } from 'lucide-react'
import { API_BASE_URL } from '../services/api'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="text-xl font-semibold text-slate-800">Safety and privacy</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><ShieldCheck className="h-4 w-4 text-brand-600" /> This assistant offers educational information and is not a medical diagnosis.</div>
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><BellRing className="h-4 w-4 text-brand-600" /> In emergencies, contact local emergency services or seek immediate clinical help.</div>
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><ServerCog className="h-4 w-4 text-brand-600" /> Backend providers, document uploads, and retrieval history remain separated from public datasets.</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h3 className="text-lg font-semibold text-slate-800">Application settings</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            API base URL
            <input value={API_BASE_URL || '(Same origin / Relative API)'} readOnly className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" />
          </label>
          <label className="text-sm text-slate-700">
            Current user
            <input value={localStorage.getItem('health-assistant-user') || 'demo-user'} readOnly className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5" />
          </label>
        </div>
      </div>
    </div>
  )
}
