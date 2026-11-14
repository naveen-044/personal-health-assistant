import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, UploadCloud, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import api from '../services/api'

export default function LibraryPage() {
  const [documents, setDocuments] = useState([])
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const fileInputRef = useRef(null)

  const loadDocuments = useCallback(async () => {
    try {
      const response = await api.get('/api/documents')
      setDocuments(response.data.documents || [])
    } catch (error) {
      console.error('Failed to load documents:', error)
      setErrorMessage('Could not load documents from server.')
    }
  }, [])

  useEffect(() => {
    let active = true
    api.get('/api/documents')
      .then((response) => {
        if (active) {
          setDocuments(response.data.documents || [])
        }
      })
      .catch((error) => {
        if (active) {
          console.error('Failed to load documents:', error)
          setErrorMessage('Could not load documents from server.')
        }
      })

    return () => {
      active = false
    }
  }, [])

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!file) return

    setUploading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await api.post('/api/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setSuccessMessage(response.data?.message || 'Document uploaded and indexed successfully.')
      await loadDocuments()
    } catch (error) {
      console.error('Upload error:', error)
      const detail = error.response?.data?.detail
      setErrorMessage(typeof detail === 'string' ? detail : 'Failed to upload document. Please ensure it is a valid health PDF or TXT file.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (documentId) => {
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await api.delete(`/api/documents/${documentId}`)
      setSuccessMessage('Document removed successfully.')
      await loadDocuments()
    } catch (error) {
      console.error('Delete error:', error)
      const detail = error.response?.data?.detail
      setErrorMessage(typeof detail === 'string' ? detail : 'Failed to delete document.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-semibold text-slate-800">Document library</h2>
        <p className="mt-1 text-slate-600">Upload permitted public health documents for retrieval and citation.</p>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="block w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          />
          <button
            type="submit"
            disabled={!file || uploading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
            No documents uploaded yet.
          </div>
        ) : null}

        {documents.map((document) => (
          <div key={document.document_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-50 p-2 text-brand-700"><FileText className="h-4 w-4" /></div>
                <div>
                  <h3 className="font-semibold text-slate-800">{document.filename}</h3>
                  <p className="mt-1 text-sm text-slate-500">{document.status}</p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(document.document_id)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-rose-600"
                title="Delete document"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
