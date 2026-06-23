import { useCallback, useRef, useState, type ReactNode } from 'react'

interface FileDropzoneProps {
  accept: string
  /** Extensions used for validation, e.g. ['.xlsx', '.csv']. */
  extensions: string[]
  /** Single-file callback (used when `multiple` is false/unset). */
  onFile?: (file: File) => void
  /** Multi-file callback (used when `multiple` is true). */
  onFiles?: (files: File[]) => void
  /** Allow selecting/dropping several files at once. */
  multiple?: boolean
  disabled?: boolean
  busy?: boolean
  children: (state: { dragging: boolean; busy: boolean }) => ReactNode
  className?: string
}

/** A self-contained dashed dropzone with drag state + validation. */
export function FileDropzone({
  accept,
  extensions,
  onFile,
  onFiles,
  multiple = false,
  disabled,
  busy = false,
  children,
  className = '',
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const accepted = Array.from(fileList).filter((f) =>
        extensions.some((ext) => f.name.toLowerCase().endsWith(ext)),
      )
      if (accepted.length === 0) return
      if (multiple) {
        onFiles?.(accepted)
      } else {
        onFile?.(accepted[0])
      }
    },
    [extensions, multiple, onFile, onFiles],
  )

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handle(e.dataTransfer.files)
      }}
      className={[
        'group relative block w-full rounded-2xl border-2 border-dashed text-left transition-all duration-300',
        dragging
          ? 'border-accent bg-accent/5 shadow-glow'
          : 'border-white/10 bg-surface-850/60 hover:border-accent/40 hover:bg-surface-800/60',
        disabled || busy ? 'cursor-wait opacity-70' : 'cursor-pointer',
        className,
      ].join(' ')}
    >
      {children({ dragging, busy })}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ''
        }}
      />
    </button>
  )
}
