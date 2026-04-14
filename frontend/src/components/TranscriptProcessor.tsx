import { useState, useRef, useCallback } from 'react'

interface Utterance {
  speaker: string
  text: string
  start: number
  end: number
}

interface SpeakerInfo {
  name: string
  role: string
}

interface ProcessResult {
  documentId: string
  sessionId: string
  labeledContent: string
  filename: string
}

interface TranscriptProcessorProps {
  onComplete: (result: ProcessResult) => void
  onClose: () => void
  sessionId: string | null
}

type Step = 'upload' | 'processing' | 'map-speakers' | 'done'

const ALLOWED_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.mp4', '.flac', '.ogg', '.webm']

export default function TranscriptProcessor({ onComplete, onClose, sessionId }: TranscriptProcessorProps) {
  const [step, setStep] = useState<Step>('upload')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [expectedSpeakers, setExpectedSpeakers] = useState(3)
  const [error, setError] = useState<string | null>(null)

  // Diarization results
  const [speakers, setSpeakers] = useState<string[]>([])
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [speakerMapping, setSpeakerMapping] = useState<Record<string, SpeakerInfo>>({})

  // Final result
  const [result, setResult] = useState<ProcessResult | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  // --- File handling ---

  const validateAudioFile = (file: File): string | null => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    }
    if (file.size > 200_000_000) {
      return 'File too large (max 200MB)'
    }
    return null
  }

  const handleFileLoad = useCallback((file: File) => {
    const err = validateAudioFile(file)
    if (err) {
      setError(err)
      return
    }
    setAudioFile(file)
    setError(null)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileLoad(file)
    e.target.value = ''
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items?.length > 0) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0
    const file = e.dataTransfer.files[0]
    if (file) handleFileLoad(file)
  }, [handleFileLoad])

  // --- Step 1 → 2: Process audio ---

  const processAudio = async () => {
    if (!audioFile) return

    setStep('processing')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', audioFile)
      formData.append('expected_speakers', expectedSpeakers.toString())

      const res = await fetch('/api/transcripts/diarize', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Diarization failed')
      }

      const data = await res.json()
      setSpeakers(data.speakers)
      setUtterances(data.utterances)

      // Initialize empty mapping for each speaker
      const mapping: Record<string, SpeakerInfo> = {}
      for (const s of data.speakers) {
        mapping[s] = { name: '', role: '' }
      }
      setSpeakerMapping(mapping)

      setStep('map-speakers')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setStep('upload')
    }
  }

  // --- Step 3 → 4: Save with names ---

  const saveTranscript = async () => {
    const allNamed = speakers.every(s => speakerMapping[s]?.name.trim())
    if (!allNamed) {
      setError('Please name all speakers')
      return
    }

    setError(null)

    try {
      const mappingPayload: Record<string, { name: string; role: string | null }> = {}
      for (const s of speakers) {
        mappingPayload[s] = {
          name: speakerMapping[s].name.trim(),
          role: speakerMapping[s].role.trim() || null,
        }
      }

      const res = await fetch('/api/transcripts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterances,
          speaker_mapping: mappingPayload,
          filename: audioFile?.name.replace(/\.[^.]+$/, '.md') || 'transcript.md',
          session_id: sessionId,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Save failed')
      }

      const data = await res.json()
      const processResult: ProcessResult = {
        documentId: data.document.id,
        sessionId: data.session_id,
        labeledContent: data.labeled_content,
        filename: data.document.filename,
      }
      setResult(processResult)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  // --- Helper: get sample quotes for a speaker ---

  const getSpeakerSamples = (speakerLabel: string, maxSamples: number = 3): string[] => {
    return utterances
      .filter(u => u.speaker === speakerLabel)
      .slice(0, maxSamples)
      .map(u => u.text.length > 150 ? u.text.substring(0, 150) + '...' : u.text)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // =========================================================
  //  STEP 4: Done — show result
  // =========================================================
  if (step === 'done' && result) {
    return (
      <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 bg-sage-400 rounded-full" />
              <h2 className="font-display text-parchment-100 text-xl">
                Transcript Ready
              </h2>
            </div>

            <p className="text-parchment-300 text-sm mb-6">
              {speakers.length} speakers identified and labeled in{' '}
              <span className="text-parchment-200">{audioFile?.name}</span>
            </p>

            <div className="bg-ink-800 border border-ink-600 rounded-lg p-5 max-h-[60vh] overflow-y-auto">
              <pre className="text-parchment-200 text-sm whitespace-pre-wrap font-body leading-relaxed">
                {result.labeledContent}
              </pre>
            </div>
          </div>
        </div>

        <div className="border-t border-ink-700/50 bg-ink-900/80 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-6 py-5 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-ink-600 rounded-lg
                         text-parchment-300 hover:text-parchment-100 hover:border-ink-600/80
                         text-sm transition-colors duration-200"
            >
              Close
            </button>
            <button
              onClick={() => onComplete(result)}
              className="flex-1 py-3 px-4 bg-ember-500 hover:bg-ember-400 rounded-lg
                         text-ink-900 font-medium text-sm
                         transition-colors duration-200"
            >
              Open in Chat
            </button>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================
  //  STEP 3: Map speakers
  // =========================================================
  if (step === 'map-speakers') {
    return (
      <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
            <div>
              <h2 className="font-display text-parchment-100 text-xl mb-2">
                Identify Speakers
              </h2>
              <p className="text-parchment-300 text-sm">
                We found {speakers.length} speakers. Read the sample quotes to identify who's who,
                then fill in their names.
              </p>
            </div>

            {speakers.map((speakerLabel) => {
              const samples = getSpeakerSamples(speakerLabel)
              const count = utterances.filter(u => u.speaker === speakerLabel).length

              return (
                <div
                  key={speakerLabel}
                  className="bg-ink-800 border border-ink-600 rounded-lg p-5 space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono px-2 py-0.5 bg-ink-700 rounded text-parchment-300/60">
                      Speaker {speakerLabel}
                    </span>
                    <span className="text-parchment-300/40 text-xs">
                      {count} utterances
                    </span>
                  </div>

                  {/* Sample quotes */}
                  <div className="space-y-2">
                    {samples.map((quote, i) => (
                      <p key={i} className="text-parchment-200/70 text-sm italic pl-3 border-l-2 border-ink-600">
                        "{quote}"
                      </p>
                    ))}
                  </div>

                  {/* Name & Role inputs */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Name (e.g., Maria)"
                      value={speakerMapping[speakerLabel]?.name || ''}
                      onChange={(e) =>
                        setSpeakerMapping(prev => ({
                          ...prev,
                          [speakerLabel]: { ...prev[speakerLabel], name: e.target.value },
                        }))
                      }
                      className="flex-1 bg-ink-900 border border-ink-600 rounded-lg px-3 py-2.5
                                 text-parchment-100 placeholder-parchment-300/30 text-sm
                                 focus:outline-none focus:border-ember-400/60
                                 transition-colors duration-200"
                    />
                    <input
                      type="text"
                      placeholder="Role (e.g., Therapist)"
                      value={speakerMapping[speakerLabel]?.role || ''}
                      onChange={(e) =>
                        setSpeakerMapping(prev => ({
                          ...prev,
                          [speakerLabel]: { ...prev[speakerLabel], role: e.target.value },
                        }))
                      }
                      className="flex-1 bg-ink-900 border border-ink-600 rounded-lg px-3 py-2.5
                                 text-parchment-100 placeholder-parchment-300/30 text-sm
                                 focus:outline-none focus:border-ember-400/60
                                 transition-colors duration-200"
                    />
                  </div>
                </div>
              )
            })}

            {error && (
              <div className="p-3 bg-ember-600/10 border border-ember-500/30 rounded-lg">
                <p className="text-ember-400 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-ink-700/50 bg-ink-900/80 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-6 py-5 flex gap-3">
            <button
              onClick={() => { setStep('upload'); setError(null) }}
              className="flex-1 py-3 px-4 border border-ink-600 rounded-lg
                         text-parchment-300 hover:text-parchment-100 hover:border-ink-600/80
                         text-sm transition-colors duration-200"
            >
              Back
            </button>
            <button
              onClick={saveTranscript}
              disabled={!speakers.every(s => speakerMapping[s]?.name.trim())}
              className="flex-1 py-3 px-4 bg-ember-500 hover:bg-ember-400 rounded-lg
                         text-ink-900 font-medium text-sm
                         disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors duration-200"
            >
              Save Transcript
            </button>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================
  //  STEP 2: Processing (loading state)
  // =========================================================
  if (step === 'processing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
        <div className="text-center space-y-6 max-w-sm">
          <div className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" />
            <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" style={{ animationDelay: '0.2s' }} />
            <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" style={{ animationDelay: '0.4s' }} />
          </div>
          <p className="font-display text-parchment-100 text-xl">
            Transcribing & identifying speakers...
          </p>
          <p className="text-parchment-300 text-sm leading-relaxed">
            Listening to the audio and identifying {expectedSpeakers} distinct voices.
            This typically takes 2-5 minutes for a full session.
          </p>
          {audioFile && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <svg className="w-4 h-4 text-parchment-300/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
              </svg>
              <span className="text-parchment-300/40 text-xs">
                {audioFile.name} ({formatFileSize(audioFile.size)})
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // =========================================================
  //  STEP 1: Upload audio
  // =========================================================
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          <div>
            <h2 className="font-display text-parchment-100 text-2xl mb-2">
              Process Session Recording
            </h2>
            <p className="text-parchment-300 text-sm">
              Upload an audio recording and we'll transcribe it with speaker labels
              using voice identification.
            </p>
          </div>

          {/* Audio file upload */}
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
            onDrop={handleDrop}
            className="relative"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(',')}
              className="hidden"
              onChange={handleInputChange}
            />

            {audioFile ? (
              <div className="bg-ink-800 border border-ink-600 rounded-lg p-4 animate-fade-in">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-sage-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-parchment-100 text-sm truncate">{audioFile.name}</p>
                    <p className="text-parchment-300/50 text-xs">{formatFileSize(audioFile.size)}</p>
                  </div>
                  <button
                    onClick={() => setAudioFile(null)}
                    className="text-parchment-300/50 hover:text-ember-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-lg p-8 text-center
                           transition-colors duration-200
                           ${isDragging
                             ? 'border-ember-400/60 bg-ink-800/50'
                             : 'border-ink-600 hover:border-ink-600/80 bg-ink-800/30'}`}
              >
                <svg className="w-8 h-8 mx-auto mb-3 text-parchment-300/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                </svg>
                <p className="text-parchment-200 text-sm font-medium mb-1">
                  {isDragging ? 'Drop your audio file here' : 'Upload session recording'}
                </p>
                <p className="text-parchment-300/50 text-xs">
                  Drag and drop or click to browse (.m4a, .mp3, .wav)
                </p>
              </button>
            )}
          </div>

          {/* Expected speakers */}
          <div>
            <label className="block text-parchment-100 text-sm font-medium mb-2">
              Number of speakers
            </label>
            <div className="flex items-center gap-3">
              {[2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setExpectedSpeakers(n)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors duration-200
                    ${expectedSpeakers === n
                      ? 'bg-ember-500 text-ink-900'
                      : 'bg-ink-800 border border-ink-600 text-parchment-300 hover:border-ink-600/80'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-parchment-300/40 text-xs mt-2">
              How many people are in this recording?
            </p>
          </div>

          {error && (
            <div className="p-3 bg-ember-600/10 border border-ember-500/30 rounded-lg animate-fade-in">
              <p className="text-ember-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-ink-700/50 bg-ink-900/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-ink-600 rounded-lg
                       text-parchment-300 hover:text-parchment-100 hover:border-ink-600/80
                       text-sm transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={processAudio}
            disabled={!audioFile}
            className="flex-1 py-3 px-4 bg-ember-500 hover:bg-ember-400 rounded-lg
                       text-ink-900 font-medium text-sm
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-colors duration-200"
          >
            Process Audio
          </button>
        </div>
      </div>
    </div>
  )
}
