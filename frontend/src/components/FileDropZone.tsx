import { useRef, useState, useCallback } from 'react'

export interface AttachedFile {
  file: File
  documentId?: string
  uploading: boolean
  error?: string
}

interface FileDropZoneProps {
  onFileAttached: (file: File) => void
  attachedFile: AttachedFile | null
  onFileRemoved: () => void
  children: React.ReactNode
  disabled?: boolean
}

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.markdown']
const MAX_SIZE = 1_000_000 // 1MB

function validateFile(file: File): string | null {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return 'Only .txt and .md files are supported'
  }
  if (file.size > MAX_SIZE) {
    return 'File too large (max 1MB)'
  }
  return null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileDropZone({
  onFileAttached,
  attachedFile,
  onFileRemoved,
  children,
  disabled,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return
      dragCounter.current++
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true)
      }
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      dragCounter.current = 0

      if (disabled) return

      const files = e.dataTransfer.files
      if (files.length === 0) return

      const file = files[0]
      const error = validateFile(file)
      if (error) {
        alert(error)
        return
      }
      onFileAttached(file)
    },
    [disabled, onFileAttached]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      const file = files[0]
      const error = validateFile(file)
      if (error) {
        alert(error)
        return
      }
      onFileAttached(file)
      // Reset input so same file can be re-selected
      e.target.value = ''
    },
    [onFileAttached]
  )

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.markdown"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center
                        bg-ink-900/90 border-2 border-dashed border-ember-400/60 rounded-lg
                        backdrop-blur-sm">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto mb-2 text-ember-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-ember-300 text-sm font-medium">Drop your file here</p>
            <p className="text-parchment-300/50 text-xs mt-1">.txt or .md files</p>
          </div>
        </div>
      )}

      {/* File preview chip */}
      {attachedFile && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2
                        bg-ink-800 border border-ink-600 rounded-lg animate-fade-in">
          <svg className="w-4 h-4 text-parchment-300/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-parchment-200 text-sm truncate flex-1">
            {attachedFile.file.name}
          </span>
          <span className="text-parchment-300/50 text-xs flex-shrink-0">
            {formatFileSize(attachedFile.file.size)}
          </span>
          {attachedFile.uploading && (
            <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse flex-shrink-0" />
          )}
          {attachedFile.error && (
            <span className="text-red-400 text-xs flex-shrink-0">{attachedFile.error}</span>
          )}
          <button
            onClick={onFileRemoved}
            className="text-parchment-300/50 hover:text-ember-400 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Attach button exposed for parent to position */}
      <div className="relative">
        {children}
        {!disabled && (
          <button
            onClick={openFilePicker}
            className="absolute left-3 bottom-3 p-2
                       text-parchment-300/50 hover:text-ember-400
                       transition-colors duration-200"
            aria-label="Attach file"
            title="Attach a text or markdown file"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
