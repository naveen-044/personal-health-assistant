import { memo, useState } from 'react'
import { Check, Copy, ExternalLink, FileText } from 'lucide-react'

// Render inline markdown: bold (**text**), inline code (`code`), and links ([text](url))
export const InlineMarkdownParser = memo(function InlineMarkdownParser({ text }) {
  if (!text) return null

  // Pattern matches: [text](url), **bold**, or `code`
  const regex = /(\[.*?\]\(https?:\/\/[^\s)]+\)|\*\*.*?\*\*|`[^`]+`)/g
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null

        // Check for Markdown Link: [Title](https://...)
        const linkMatch = part.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/)
        if (linkMatch) {
          const [, linkText, linkUrl] = linkMatch
          return (
            <a
              key={index}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 transition hover:text-teal-900 hover:decoration-teal-600"
              title={linkUrl}
            >
              <span>{linkText}</span>
              <ExternalLink className="inline h-3 w-3 shrink-0 opacity-70" />
            </a>
          )
        }

        // Check for **Bold**
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          return (
            <strong key={index} className="font-semibold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          )
        }

        // Check for `inline code`
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <code
              key={index}
              className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-teal-800 ring-1 ring-slate-200"
            >
              {part.slice(1, -1)}
            </code>
          )
        }

        return <span key={index}>{part}</span>
      })}
    </>
  )
})

// Styled Snippet Box: White for text/prescriptions, Highlight color code for programs
export const SnippetBox = memo(function SnippetBox({ title, content }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lang = (title || '').toLowerCase().trim()
  const isProgramCode = [
    'json',
    'python',
    'py',
    'javascript',
    'js',
    'typescript',
    'ts',
    'bash',
    'sh',
    'sql',
    'html',
    'css',
    'code',
  ].includes(lang)

  const displayTitle = (
    title || (isProgramCode ? 'Code' : 'Clinical Prescription / Notes')
  )
    .trim()
    .toUpperCase()

  return (
    <div
      className={`my-3 overflow-hidden rounded-xl border shadow-xs ${
        isProgramCode
          ? 'border-slate-800 bg-slate-900 text-teal-300'
          : 'border-slate-300 bg-white text-slate-800'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-3.5 py-2 text-xs ${
          isProgramCode
            ? 'border-slate-800 bg-slate-950/90 text-teal-400'
            : 'border-slate-300 bg-slate-50 text-teal-800'
        }`}
      >
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span>{displayTitle}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
            isProgramCode
              ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Copy snippet to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-600 font-semibold">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 opacity-70" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre
        className={`overflow-x-auto p-3.5 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text [-webkit-overflow-scrolling:touch] ${
          isProgramCode ? 'text-slate-200' : 'text-slate-800 bg-white'
        }`}
      >
        {content}
      </pre>
    </div>
  )
})

// Comprehensive Formatted Message Renderer
export const FormattedMessage = memo(function FormattedMessage({ content }) {
  if (!content) return null

  const lines = content.split('\n')
  const blocks = []
  let tableBuffer = []
  let snippetBuffer = []
  let snippetLang = ''
  let inSnippet = false

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      blocks.push({ type: 'table', rows: [...tableBuffer] })
      tableBuffer = []
    }
  }

  const flushSnippet = () => {
    if (inSnippet) {
      blocks.push({
        type: 'snippet',
        lang: snippetLang,
        code: snippetBuffer.join('\n'),
      })
      snippetBuffer = []
      snippetLang = ''
      inSnippet = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // Handle fenced code / snippet blocks: ```prescription or ```
    if (trimmed.startsWith('```')) {
      if (inSnippet) {
        flushSnippet()
      } else {
        flushTable()
        inSnippet = true
        snippetLang = trimmed.slice(3).trim() || 'Snippet'
        snippetBuffer = []
      }
      continue
    }

    if (inSnippet) {
      snippetBuffer.push(rawLine)
      continue
    }

    // Detect markdown table rows: | col | col |
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      const isSeparator = /^\|[\s-:]+\|[\s-:]+\|?/.test(trimmed)
      if (!isSeparator) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim())
        tableBuffer.push(cells)
      }
      continue
    }

    flushTable()

    if (!trimmed) {
      blocks.push({ type: 'space' })
    } else if (trimmed.startsWith('#### ')) {
      blocks.push({ type: 'h4', text: trimmed.replace(/^####\s+/, '') })
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.replace(/^###\s+/, '') })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.replace(/^##\s+/, '') })
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.replace(/^#\s+/, '') })
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'quote', text: trimmed.replace(/^>\s+/, '') })
    } else if (/^\d+\.\s+/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
      blocks.push({
        type: 'numbered',
        number: numMatch ? numMatch[1] : '1',
        text: numMatch ? numMatch[2] : trimmed,
      })
    } else if (/^[-•*]\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-•*]\s+/, '') })
    } else {
      blocks.push({ type: 'p', text: trimmed })
    }
  }

  flushTable()
  flushSnippet()

  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-800">
      {blocks.map((block, idx) => {
        if (block.type === 'space') {
          return <div key={idx} className="h-1" />
        }

        if (block.type === 'snippet') {
          return <SnippetBox key={idx} title={block.lang} content={block.code} />
        }

        if (block.type === 'quote') {
          return (
            <div
              key={idx}
              className="my-2 rounded-xl border-l-4 border-teal-600 bg-teal-50/70 p-3 text-xs font-medium leading-relaxed text-teal-950"
            >
              <InlineMarkdownParser text={block.text} />
            </div>
          )
        }

        if (block.type === 'h1' || block.type === 'h2') {
          return (
            <h3
              key={idx}
              className="pt-2.5 pb-0.5 text-base font-bold tracking-tight text-slate-900"
            >
              <InlineMarkdownParser text={block.text} />
            </h3>
          )
        }

        if (block.type === 'h3' || block.type === 'h4') {
          return (
            <h4
              key={idx}
              className="pt-2 pb-0.5 text-[14px] font-semibold text-slate-900"
            >
              <InlineMarkdownParser text={block.text} />
            </h4>
          )
        }

        if (block.type === 'table') {
          if (block.rows.length === 0) return null
          const header = block.rows[0]
          const bodyRows = block.rows.slice(1)

          return (
            <div
              key={idx}
              className="my-3 max-w-full overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-xs [-webkit-overflow-scrolling:touch]"
            >
              <table className="min-w-full divide-y divide-slate-300 text-left text-xs">
                {header && (
                  <thead className="bg-slate-100/90 font-semibold text-slate-800">
                    <tr>
                      {header.map((col, colIdx) => (
                        <th key={colIdx} className="px-3.5 py-2.5 whitespace-nowrap border-b border-slate-300">
                          <InlineMarkdownParser text={col} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
                  {bodyRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-50 transition border-b border-slate-200 last:border-b-0">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-3.5 py-2.5 align-top">
                          <InlineMarkdownParser text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        if (block.type === 'numbered') {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1 text-slate-700">
              <span className="flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-full bg-teal-100 text-[11px] font-bold text-teal-800">
                {block.number}
              </span>
              <span className="flex-1 leading-relaxed">
                <InlineMarkdownParser text={block.text} />
              </span>
            </div>
          )
        }

        if (block.type === 'bullet') {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 text-slate-700">
              <span className="select-none font-bold leading-5 text-teal-600">
                •
              </span>
              <span className="flex-1 leading-relaxed">
                <InlineMarkdownParser text={block.text} />
              </span>
            </div>
          )
        }

        return (
          <p key={idx} className="text-slate-700 leading-relaxed">
            <InlineMarkdownParser text={block.text} />
          </p>
        )
      })}
    </div>
  )
})
