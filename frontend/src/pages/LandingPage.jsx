import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Stethoscope, Database, MessageSquareHeart } from 'lucide-react'

const highlights = [
  { icon: Stethoscope, title: 'General guidance', description: 'Educational, context-grounded answers for high-level health questions.' },
  { icon: Database, title: 'Trusted archive', description: 'Indexed documents are used as the evidence source for every response.' },
  { icon: ShieldCheck, title: 'Safety-first', description: 'The assistant helps identify emergency symptoms and recommends clinical support.' },
]

export default function LandingPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 to-teal-50 p-8 shadow-soft ring-1 ring-slate-200 md:p-12">
        <div className="grid gap-8 md:grid-cols-[1.5fr_0.9fr] md:items-center">
          <div className="space-y-5">
            <span className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
              Medical information assistant
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Ask questions. Review evidence. Stay informed.
            </h1>
            <p className="max-w-xl text-lg text-slate-600">
              A personal health assistance chatbot built to answer general health questions with source-grounded support and safety guidance.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/chat" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-medium text-white transition hover:bg-brand-700">
                Start a chat <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/documents" className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 transition hover:border-slate-400">
                View medical library
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-soft">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-brand-100 p-2 text-brand-700"><MessageSquareHeart className="h-5 w-5" /></div>
                <div>
                  <p className="text-sm text-slate-500">Conversation</p>
                  <p className="font-semibold text-slate-800">Health guidance</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Live</span>
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-brand-50 p-3">"What symptoms suggest a possible migraine?"</div>
              <div className="rounded-2xl bg-slate-100 p-3 ml-8">"I can explain common warning signs and when to seek urgent care."</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {highlights.map(({ icon: Icon, title, description }) => (
          <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 inline-flex rounded-xl bg-brand-50 p-3 text-brand-600"><Icon className="h-5 w-5" /></div>
            <h2 className="mb-2 text-lg font-semibold text-slate-800">{title}</h2>
            <p className="text-slate-600">{description}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
