import { memo, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  Info,
  KeyRound,
  Sparkles,
  X,
} from 'lucide-react'

export const MODEL_OPTIONS = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'Medium',
    status: 'active',
    description: 'High-speed multimodal AI with medicine recognition and prescription analysis.',
  },
  {
    id: 'claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6 (Thinking)',
    tag: 'Notice',
    status: 'notice',
    description: 'Anthropic Claude reasoning preview. Requires enterprise configuration.',
  },
  {
    id: 'claude-opus-4.6',
    name: 'Claude Opus 4.6 (Thinking)',
    tag: 'Notice',
    status: 'notice',
    description: 'Anthropic Claude Opus preview. Requires enterprise configuration.',
  },
  {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B (Medium)',
    tag: 'Notice',
    status: 'active_default',
    description: 'Default RAG Knowledge Base powered by Groq and indexed medical library.',
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    tag: 'Unavailable',
    status: 'unavailable',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    tag: 'Unavailable',
    status: 'unavailable',
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    tag: 'Unavailable',
    status: 'unavailable',
  },
]

export const UsageModal = memo(function UsageModal({
  isOpen,
  onClose,
  usage,
  customApiKey,
  onSaveApiKey,
}) {
  const [apiKeyInput, setApiKeyInput] = useState(customApiKey || '')
  const [showKey, setShowKey] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  useEffect(() => {
    setApiKeyInput(customApiKey || '')
  }, [customApiKey, isOpen])

  if (!isOpen) return null

  const used = usage?.used || 0
  const limit = usage?.limit || 20
  const remaining = usage?.remaining !== undefined ? usage.remaining : Math.max(0, limit - used)
  const percent = Math.min(100, Math.round((used / limit) * 100))

  const handleSave = () => {
    onSaveApiKey(apiKeyInput.trim())
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Gemini API Usage</h3>
              <p className="text-xs text-slate-500">Daily generation limit &amp; keys</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Daily limit progress bar */}
        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600">Daily Gemini Limit</span>
            <span className="text-teal-700">
              {used} / {limit} used today
            </span>
          </div>

          <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
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

          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>{remaining} generations remaining</span>
            <span>Resets daily at 00:00 UTC</span>
          </div>
        </div>

        {/* Custom API Key input */}
        <div className="mt-5 space-y-3">
          <label className="block text-xs font-semibold text-slate-700">
            Custom Google Gemini API Key (Optional)
          </label>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Want unlimited queries? Provide your own Google AI key. It is saved securely in your browser and bypasses the shared 20/day cap.
          </p>

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-10 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:text-teal-900 underline"
            >
              <span>Get free Gemini API Key</span>
              <ExternalLink className="h-3 w-3" />
            </a>

            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition"
            >
              {savedSuccess ? 'Saved ✓' : 'Save Key'}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Close
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
  customApiKey,
  onSaveApiKey,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUsageOpen, setIsUsageOpen] = useState(false)
  const [noticeMessage, setNoticeMessage] = useState('')
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

  const handleOptionClick = (option) => {
    if (option.status === 'unavailable') {
      return
    }

    if (option.status === 'notice') {
      setNoticeMessage(
        `${option.name} is a preview model. Switch to Gemini 3.8 Flash or GPT-OSS for active health assistance.`
      )
      setTimeout(() => setNoticeMessage(''), 3500)
      return
    }

    onSelectModel(option.id)
    setIsOpen(false)
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Pill Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
        title="Select AI model"
      >
        <Sparkles className="h-3.5 w-3.5 text-teal-600" />
        <span className="font-semibold text-slate-800">{selectedModel.name}</span>
        {selectedModel.tag && (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {selectedModel.tag}
          </span>
        )}
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>

      {/* Dropdown Menu matching uploaded image */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 origin-bottom-left rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl ring-1 ring-black/5 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3 pt-2 pb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Model
            </span>
          </div>

          {noticeMessage && (
            <div className="mx-2 mb-2 rounded-xl bg-amber-50 p-2 text-[11px] font-medium text-amber-800 leading-snug">
              {noticeMessage}
            </div>
          )}

          <div className="space-y-0.5">
            {MODEL_OPTIONS.map((option) => {
              const isSelected = option.id === selectedModel.id
              const isUnavailable = option.status === 'unavailable'

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOptionClick(option)}
                  disabled={isUnavailable}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                    isUnavailable
                      ? 'cursor-not-allowed opacity-40 text-slate-400'
                      : isSelected
                      ? 'bg-slate-50 font-semibold text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{option.name}</span>
                    {option.tag && (
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          isUnavailable
                            ? 'bg-slate-100 text-slate-400'
                            : option.tag === 'Notice'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {option.tag}
                        {(option.tag === 'Notice' || isUnavailable) && (
                          <Info className="h-2.5 w-2.5 opacity-70" />
                        )}
                      </span>
                    )}
                  </div>

                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-teal-700" />
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
              <Gauge className="h-4 w-4 text-slate-500" />
              <span>View Usage</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[11px] font-medium text-teal-700">
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
        customApiKey={customApiKey}
        onSaveApiKey={onSaveApiKey}
      />
    </div>
  )
})
