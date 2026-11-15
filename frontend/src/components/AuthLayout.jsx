import { Activity, HeartPulse, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AuthLayout({ children }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-sky-800 via-teal-700 to-emerald-700 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border border-white/10" />
          <div className="absolute -bottom-40 -left-36 h-[30rem] w-[30rem] rounded-full border border-white/10" />
          <Link to="/" className="relative inline-flex w-fit items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <HeartPulse className="h-7 w-7" />
            </span>
            <span>
              <span className="block text-lg font-semibold">Personal Health</span>
              <span className="block text-sm text-teal-100">Assistant</span>
            </span>
          </Link>

          <div className="relative max-w-lg py-16">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-teal-50 ring-1 ring-white/15">
              <Activity className="h-4 w-4" /> Evidence-informed health support
            </span>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              A clearer path to feeling informed.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-8 text-teal-50/90">
              Keep your health conversations and trusted resources together in one private space.
            </p>
            <div className="mt-9 flex items-center gap-3 text-sm text-teal-50">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              Your account and personal library are protected.
            </div>
          </div>

          <p className="relative text-xs text-teal-100/80">
            Educational information only. Not a substitute for professional medical advice.
          </p>
        </aside>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <HeartPulse className="h-5 w-5" />
              </span>
              Personal Health Assistant
            </Link>
            {children}
            <p className="mt-8 text-center text-xs leading-5 text-slate-500">
              Your account information is stored securely. Health guidance is educational and does not replace a clinician.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
