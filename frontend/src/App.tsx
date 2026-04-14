import { useEffect, useState } from 'react'
import ChatWindow from './components/ChatWindow'
import IntakeFlow from './components/IntakeFlow'
import SessionSidebar from './components/SessionSidebar'
import TranscriptProcessor from './components/TranscriptProcessor'

interface Session {
  id: string
  title: string | null
  created_at: string
  ended_at: string | null
  summary: string | null
  patterns: string[] | null
}

type ProfileState = 'loading' | 'missing' | 'ready'

function App() {
  const [profileState, setProfileState] = useState<ProfileState>('loading')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showTranscriptProcessor, setShowTranscriptProcessor] = useState(false)
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0)
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null)

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const res = await fetch('/api/profile/status')
        if (!res.ok) throw new Error('profile check failed')
        const data = await res.json()
        setProfileState(data.exists ? 'ready' : 'missing')
      } catch (err) {
        console.error('Failed to check profile status:', err)
        setProfileState('missing')
      }
    }
    checkProfile()
  }, [])

  const handleIntakeComplete = () => {
    setProfileState('ready')
  }

  const handleNewSession = () => {
    setCurrentSessionId(null)
    setPendingDocumentId(null)
  }

  const handleSelectSession = (session: Session) => {
    setCurrentSessionId(session.id)
    setSidebarOpen(false)
    setPendingDocumentId(null)
  }

  const handleSessionEnded = () => {
    setSidebarRefreshKey(prev => prev + 1)
  }

  const handleTranscriptComplete = (result: {
    documentId: string
    sessionId: string
    labeledContent: string
    filename: string
  }) => {
    setCurrentSessionId(result.sessionId)
    setPendingDocumentId(result.documentId)
    setShowTranscriptProcessor(false)
    setSidebarRefreshKey(prev => prev + 1)
  }

  if (profileState === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-ink-900">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" />
          <span
            className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle"
            style={{ animationDelay: '0.2s' }}
          />
          <span
            className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle"
            style={{ animationDelay: '0.4s' }}
          />
        </div>
      </div>
    )
  }

  if (profileState === 'missing') {
    return (
      <div className="h-full flex bg-ink-900">
        <div className="flex-1 flex flex-col min-h-0">
          <header className="h-14 border-b border-ink-700/50 flex items-center px-6 gap-5">
            <h1 className="font-display text-parchment-100 text-lg tracking-wide">
              TherapyCoach
            </h1>
          </header>
          <IntakeFlow onComplete={handleIntakeComplete} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-ink-900">
      <SessionSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        currentSessionId={currentSessionId}
        refreshKey={sidebarRefreshKey}
      />

      <div className="flex-1 flex flex-col min-h-0">
        <header className="h-14 border-b border-ink-700/50 flex items-center px-6 gap-5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-parchment-300 hover:text-parchment-100 transition-colors duration-200"
            aria-label="Open sessions"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="font-display text-parchment-100 text-lg tracking-wide">
            TherapyCoach
          </h1>
          <div className="flex-1" />
          <button
            onClick={() => setShowTranscriptProcessor(!showTranscriptProcessor)}
            className={`flex items-center gap-2 text-xs transition-colors duration-200
                       ${showTranscriptProcessor
                         ? 'text-ember-400'
                         : 'text-parchment-300/60 hover:text-parchment-200'}`}
            title="Process a group session transcript"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="hidden sm:inline">Process Transcript</span>
          </button>
        </header>

        {showTranscriptProcessor ? (
          <TranscriptProcessor
            onComplete={handleTranscriptComplete}
            onClose={() => setShowTranscriptProcessor(false)}
            sessionId={currentSessionId}
          />
        ) : (
          <ChatWindow
            sessionId={currentSessionId}
            onSessionCreated={setCurrentSessionId}
            onSessionEnded={handleSessionEnded}
            pendingDocumentId={pendingDocumentId}
            onPendingDocumentConsumed={() => setPendingDocumentId(null)}
          />
        )}
      </div>
    </div>
  )
}

export default App
