import { useState, useEffect } from 'react'

interface Session {
  id: string
  title: string | null
  created_at: string
  ended_at: string | null
  summary: string | null
  patterns: string[] | null
  message_count: number | null
  first_message_preview: string | null
}

interface SessionSidebarProps {
  isOpen: boolean
  onClose: () => void
  onSelectSession: (session: Session) => void
  onNewSession: () => void
  currentSessionId: string | null
  refreshKey?: number
}

export default function SessionSidebar({
  isOpen,
  onClose,
  onSelectSession,
  onNewSession,
  currentSessionId,
  refreshKey,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  // Refresh when refreshKey changes (e.g., after ending a session)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      loadSessions()
    }
  }, [refreshKey])

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions/')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-ink-900/80 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-80 bg-ink-800 z-50 flex flex-col border-r border-ink-700/50 animate-slide-up">
        {/* Header */}
        <div className="h-14 border-b border-ink-700/50 flex items-center justify-between px-5">
          <h2 className="font-display text-parchment-100 text-lg">Sessions</h2>
          <button
            onClick={onClose}
            className="text-parchment-300 hover:text-parchment-100 transition-colors p-1"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New session button */}
        <div className="p-4">
          <button
            onClick={() => {
              onNewSession()
              onClose()
            }}
            className="w-full py-3 px-4 border border-ember-400/60 text-ember-400
                       rounded-lg hover:bg-ember-400/10
                       transition-colors duration-200 text-sm font-medium tracking-wide"
          >
            + Begin New Session
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {sessions.length === 0 ? (
            <p className="text-parchment-300/50 text-sm text-center py-12 font-body">
              No previous sessions
            </p>
          ) : (
            <div className="space-y-1">
              {sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session)}
                  className={`w-full text-left p-4 rounded-lg transition-all duration-200 group ${
                    session.id === currentSessionId
                      ? 'bg-ink-700'
                      : 'hover:bg-ink-700/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-parchment-100 text-sm font-medium truncate flex-1">
                      {session.title
                        || (session.first_message_preview
                          ? (session.first_message_preview.length > 40
                              ? session.first_message_preview.slice(0, 40) + '...'
                              : session.first_message_preview)
                          : 'New Session')}
                    </p>
                    <span className="text-parchment-300/40 text-xs whitespace-nowrap">
                      {formatDate(session.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1.5">
                    {session.message_count != null && session.message_count > 0 && (
                      <span className="text-parchment-300/30 text-xs">
                        {session.message_count} message{session.message_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {session.ended_at && (
                      <span className="text-parchment-300/20 text-xs">
                        &middot; ended
                      </span>
                    )}
                  </div>

                  {session.summary && (
                    <p className="text-parchment-300/60 text-xs mt-2 line-clamp-2 leading-relaxed">
                      {session.summary}
                    </p>
                  )}

                  {session.patterns && session.patterns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {session.patterns.slice(0, 3).map(pattern => (
                        <span
                          key={pattern}
                          className="text-xs px-2 py-0.5 bg-ink-900/50 rounded
                                     text-parchment-300/60 border border-ink-600/50"
                        >
                          {pattern.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
