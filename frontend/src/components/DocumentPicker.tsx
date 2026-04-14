import { useState, useEffect } from 'react'

interface DocumentItem {
  id: string
  filename: string
  size_bytes: number
  summary: string | null
  uploaded_at: string
  session_id: string | null
}

interface DocumentPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (doc: DocumentItem) => void
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentPicker({ isOpen, onClose, onSelect }: DocumentPickerProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [viewingDoc, setViewingDoc] = useState<DocumentItem | null>(null)
  const [viewContent, setViewContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadDocuments()
      setViewingDoc(null)
      setViewContent(null)
    }
  }, [isOpen])

  const loadDocuments = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/documents/')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const viewDocument = async (doc: DocumentItem) => {
    setViewingDoc(doc)
    setLoadingContent(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}/content`)
      if (res.ok) {
        const data = await res.json()
        setViewContent(data.content)
      }
    } catch (err) {
      console.error('Failed to load document content:', err)
      setViewContent('[Failed to load content]')
    } finally {
      setLoadingContent(false)
    }
  }

  if (!isOpen) return null

  // ---- Viewing a document's full content ----
  if (viewingDoc) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div
          className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative w-full max-w-2xl max-h-[85vh] mx-4 mb-4 sm:mb-0
                        bg-ink-800 border border-ink-600 rounded-xl
                        flex flex-col animate-slide-up overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-600/50">
            <button
              onClick={() => { setViewingDoc(null); setViewContent(null) }}
              className="text-parchment-300/50 hover:text-parchment-100 transition-colors"
              aria-label="Back to documents"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-parchment-100 text-base truncate">
                {viewingDoc.filename}
              </h3>
              <p className="text-parchment-300/40 text-xs">
                {formatDate(viewingDoc.uploaded_at)} &middot; {formatSize(viewingDoc.size_bytes)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-parchment-300/50 hover:text-parchment-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loadingContent ? (
              <div className="flex items-center justify-center py-12">
                <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" />
                <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle ml-1" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle ml-1" style={{ animationDelay: '0.4s' }} />
              </div>
            ) : (
              <pre className="text-parchment-200 text-sm whitespace-pre-wrap font-body leading-relaxed">
                {viewContent}
              </pre>
            )}
          </div>

          {/* Footer: attach button */}
          <div className="border-t border-ink-600/50 px-5 py-3">
            <button
              onClick={() => { onSelect(viewingDoc); onClose() }}
              className="w-full py-2.5 px-4 bg-ember-500 hover:bg-ember-400 rounded-lg
                         text-ink-900 font-medium text-sm
                         transition-colors duration-200"
            >
              Attach to Message
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Document list ----
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[70vh] mx-4 mb-4 sm:mb-0
                      bg-ink-800 border border-ink-600 rounded-xl
                      flex flex-col animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-600/50">
          <h3 className="font-display text-parchment-100 text-base">Documents</h3>
          <button
            onClick={onClose}
            className="text-parchment-300/50 hover:text-parchment-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" />
              <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle ml-1" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle ml-1" style={{ animationDelay: '0.4s' }} />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-parchment-300/50 text-sm">No documents yet</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-600/30">
              {documents.map(doc => (
                <div
                  key={doc.id}
                  className="px-5 py-4 hover:bg-ink-700/50 transition-colors duration-150"
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-4 h-4 mt-0.5 text-parchment-300/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-parchment-100 text-sm truncate">
                        {doc.filename}
                      </p>
                      {doc.summary && (
                        <p className="text-parchment-300/60 text-xs mt-1 line-clamp-2 leading-relaxed">
                          {doc.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-parchment-300/30 text-xs">
                          {formatDate(doc.uploaded_at)}
                        </span>
                        <span className="text-parchment-300/30 text-xs">
                          {formatSize(doc.size_bytes)}
                        </span>
                        <span className="flex-1" />
                        <button
                          onClick={() => viewDocument(doc)}
                          className="text-parchment-300/50 hover:text-parchment-100 text-xs
                                     transition-colors duration-150"
                        >
                          View
                        </button>
                        <button
                          onClick={() => { onSelect(doc); onClose() }}
                          className="text-ember-400 hover:text-ember-300 text-xs font-medium
                                     transition-colors duration-150"
                        >
                          Attach
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
