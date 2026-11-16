import { memo, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Gauge,
  RotateCcw,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react'
import api from '../services/api'

export const MODEL_OPTIONS = [
  {
    id: 'pha-0.1.1',
    name: 'PHA 0.1.1',
    tag: 'Unlimited',
    icon: Stethoscope,
    description: 'Personal Health Assistant Clinical Intelligence System. Unlimited generations, evidence tables & prescription transcription.',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: '20/Day',
    icon: Sparkles,
    description: 'High-speed multimodal AI for medicine analysis & general clinical queries.',
  },
]

export const UsageModal = memo(function UsageModal({
  isOpen,
  onClose,
  usage,
}) {
  if (!isOpen) return null

  const used = usage?.used || 0
  const limit = usage?.limit || 20
  const remaining = usage?.remaining !== undefined ? usage.remaining : Math.max(0, limit - used)
  const percent = Math.min(100, Math.round((used / limit) * 100))

  const formattedDate = (() => {
    if (usage?.date && /^\d{2}-\d{2}-\d{4}$/.test(usage.date)) {
      return usage.date
    }
    const d = new Date()
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}-${month}-${year}`
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl border border-slate-300 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Daily Generation Quota</h3>
              <p className="text-[11px] text-slate-500">20 prompts per user per day • Auto-resets at 00:00 UTC</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* PHA 0.1.1 Unlimited Banner */}
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-[11px] leading-relaxed text-emerald-950">
          <div className="flex items-center gap-1.5 font-bold text-emerald-900 mb-1">
            <Stethoscope className="h-4 w-4 text-emerald-700" />
            <span>PHA 0.1.1 Clinical Model: Unlimited</span>
          </div>
          <p className="text-emerald-800">
            Enjoy <strong>unlimited free generations</strong> with zero daily limits when using the <strong>PHA 0.1.1</strong> Clinical Intelligence Engine.
          </p>
        </div>

        {/* Gemini Daily limit progress bar */}
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600">Gemini 3.8 Flash Quota</span>
            <span className="text-teal-800">
              {used} / {limit} today
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all duration-500 ${
                percent >= 90
                  ? 'bg-rose-500'
                  : percent >= 70
                  ? 'bg-amber-500'
                  : 'bg-teal-600'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>{remaining} remaining ({formattedDate})</span>
            <span>Resets daily at 00:00 UTC</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
})

export const ModelSelector = memo(function ModelSelector({
  selectedModelId,
  onSelectModel,
  usage,
  onResetUsage,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUsageOpen, setIsUsageOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedModel =
    MODEL_OPTIONS.find((m) => m.id === selectedModelId) || MODEL_OPTIONS[0]
  const SelectedIcon = selectedModel.icon || Sparkles

  const handleOptionClick = (option) => {
    onSelectModel(option.id)
    setIsOpen(false)
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Pill Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
        title="Select AI model"
      >
        <SelectedIcon className="h-3.5 w-3.5 text-teal-600" />
        <span className="font-semibold text-slate-800">{selectedModel.name}</span>
        {selectedModel.tag && (
          <span className="rounded-md bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
            {selectedModel.tag}
          </span>
        )}
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>

      {/* Dropdown Menu (Only Gemini 3.8 Flash and PHA 0.1.1) */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 origin-bottom-left rounded-2xl border border-slate-300 bg-white p-1.5 shadow-xl z-40 animate-in fade-in duration-100">
          <div className="px-3 pt-2 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Select AI Model
            </span>
          </div>

          <div className="space-y-1">
            {MODEL_OPTIONS.map((option) => {
              const isSelected = option.id === selectedModel.id
              const OptionIcon = option.icon

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOptionClick(option)}
                  className={`flex w-full items-start justify-between rounded-xl p-2.5 text-left text-xs transition ${
                    isSelected
                      ? 'bg-teal-50/70 text-slate-900 ring-1 ring-teal-200/80 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5 truncate">
                    <OptionIcon className="h-4 w-4 mt-0.5 shrink-0 text-teal-700" />
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900 truncate">
                          {option.name}
                        </span>
                        <span className="rounded-md bg-white border border-slate-200 px-1.5 py-0.2 text-[10px] font-medium text-teal-800">
                          {option.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
                        {option.description}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-teal-700 mt-0.5 ml-1" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="my-1.5 border-t border-slate-100" />

          {/* View Usage item */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              setIsUsageOpen(true)
            }}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-teal-700" />
              <span>Daily Usage Quota</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <span className="text-[11px] font-semibold text-teal-700">
                {usage ? `${usage.used || 0}/${usage.limit || 20}` : ''}
              </span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </button>
        </div>
      )}

      {/* Usage Modal */}
      <UsageModal
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        usage={usage}
        onResetUsage={onResetUsage}
      />
    </div>
  )
})
