import { useState, useEffect } from 'react'

interface Session {
  id: string
  title: string | null
  created_at: string
  ended_at: string | null
  summary: string | null
  patterns: string[] | null
}

interface PatternCount {
  pattern: string
  count: number
}

export default function ProgressView() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [patternCounts, setPatternCounts] = useState<PatternCount[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const res = await fetch('/api/sessions/')
      if (res.ok) {
        const data: Session[] = await res.json()
        setSessions(data)

        const counts: Record<string, number> = {}
        data.forEach(session => {
          session.patterns?.forEach(pattern => {
            counts[pattern] = (counts[pattern] || 0) + 1
          })
        })

        const sorted = Object.entries(counts)
          .map(([pattern, count]) => ({ pattern, count }))
          .sort((a, b) => b.count - a.count)

        setPatternCounts(sorted)
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }

  const completedSessions = sessions.filter(s => s.ended_at)

  return (
    <div className="p-8 max-w-2xl mx-auto animate-fade-in">
      <h2 className="font-display text-2xl text-parchment-100 mb-8">Your Progress</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="bg-ink-800 border border-ink-700/50 rounded-lg p-5">
          <p className="text-parchment-300/60 text-xs uppercase tracking-wider mb-1">Total Sessions</p>
          <p className="text-3xl font-display text-parchment-100">{sessions.length}</p>
        </div>
        <div className="bg-ink-800 border border-ink-700/50 rounded-lg p-5">
          <p className="text-parchment-300/60 text-xs uppercase tracking-wider mb-1">Completed</p>
          <p className="text-3xl font-display text-parchment-100">{completedSessions.length}</p>
        </div>
      </div>

      {/* Pattern frequency */}
      <div className="bg-ink-800 border border-ink-700/50 rounded-lg p-6 mb-8">
        <h3 className="text-parchment-100 font-display text-lg mb-5">Patterns Identified</h3>
        {patternCounts.length === 0 ? (
          <p className="text-parchment-300/50 text-sm">No patterns identified yet</p>
        ) : (
          <div className="space-y-4">
            {patternCounts.map(({ pattern, count }) => (
              <div key={pattern}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-parchment-200 capitalize">{pattern.replace('_', ' ')}</span>
                  <span className="text-parchment-300/50">{count} sessions</span>
                </div>
                <div className="h-1.5 bg-ink-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-ember-500 to-ember-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((count / sessions.length) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent insights */}
      <div className="bg-ink-800 border border-ink-700/50 rounded-lg p-6">
        <h3 className="text-parchment-100 font-display text-lg mb-5">Recent Insights</h3>
        {completedSessions.length === 0 ? (
          <p className="text-parchment-300/50 text-sm">Complete a session to see insights</p>
        ) : (
          <div className="space-y-5">
            {completedSessions.slice(0, 5).map(session => (
              <div key={session.id} className="border-l-2 border-ember-400/60 pl-4">
                <p className="text-parchment-200 text-sm leading-relaxed">{session.summary}</p>
                <p className="text-parchment-300/40 text-xs mt-2">
                  {new Date(session.ended_at!).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
