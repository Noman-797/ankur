import { useCallback, useRef, useState } from 'react'

interface Props {
  files: File[]
  onFilesChange: (files: File[]) => void
  onSubmit: () => void
  onSample?: () => void
  sampleLoading?: boolean
  enhance: boolean
  onEnhanceChange: (v: boolean) => void
  submitting?: boolean
}

const MAX_FILES = 5

export default function UploadZone({
  files,
  onFilesChange,
  onSubmit,
  onSample,
  sampleLoading,
  enhance,
  onEnhanceChange,
  submitting,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return
      const incoming = Array.from(list).filter((f) => f.type.startsWith('image/'))
      const merged = [...files, ...incoming].slice(0, MAX_FILES)
      onFilesChange(merged)
    },
    [files, onFilesChange],
  )

  const removeAt = (i: number) => {
    onFilesChange(files.filter((_, idx) => idx !== i))
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  const openCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
    } catch {
      setCameraError('Camera permission denied or unavailable')
    }
  }

  const snapPhoto = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `board-cam-${Date.now()}.jpg`, { type: 'image/jpeg' })
        addFiles([file])
        stopCamera()
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div className="space-y-3">
      {/* Fixed-height drop zone — photos replace empty state, no page jump */}
      <div
        className={`relative flex h-[200px] flex-col overflow-hidden rounded-2xl border transition-colors sm:h-[220px] ${
          dragging
            ? 'border-accent bg-mist'
            : 'border-board/15 bg-mist/50 hover:border-accent-dark/50'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {files.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-4 py-4 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-board text-chalk">
              <span className="font-display text-xl font-bold leading-none">+</span>
            </span>
            <span className="font-display text-base font-bold text-board sm:text-lg">
              <span className="sm:hidden">Add board photos</span>
              <span className="hidden sm:inline">Drop board or notebook photos</span>
            </span>
            <span className="hidden text-xs text-muted sm:block">
              Up to {MAX_FILES} · JPG / PNG / WebP
            </span>
            <span className="rounded-full bg-accent-dark px-5 py-2 text-xs font-semibold text-white sm:text-sm">
              Choose photos
            </span>
          </button>
        ) : (
          <div className="flex h-full flex-col px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                Photos ({files.length}/{MAX_FILES})
              </p>
              {files.length < MAX_FILES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full border border-board/15 bg-white px-3 py-1 text-[11px] font-semibold text-board hover:bg-mist"
                >
                  Add more
                </button>
              )}
            </div>
            <div className="mt-2 flex min-h-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}-${f.size}`} className="relative h-[7.25rem] w-[7.25rem] shrink-0">
                  <img
                    src={URL.createObjectURL(f)}
                    alt={`Board ${i + 1}`}
                    className="h-full w-full rounded-xl border border-board/10 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-board text-sm font-bold text-chalk"
                  >
                    ×
                  </button>
                  <span className="absolute bottom-1 left-1 rounded bg-board/80 px-1.5 text-[10px] font-bold text-chalk">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openCamera()}
          className="min-h-11 flex-1 rounded-2xl border border-board/15 bg-white px-4 py-2.5 text-sm font-semibold text-board transition-colors hover:bg-mist"
        >
          Open camera
        </button>
        {onSample && (
          <button
            type="button"
            onClick={onSample}
            disabled={sampleLoading}
            className="min-h-11 flex-1 rounded-2xl border border-board/15 bg-white px-4 py-2.5 text-sm font-semibold text-board transition-colors hover:bg-mist disabled:opacity-60"
          >
            {sampleLoading ? 'Loading…' : 'Try sample'}
          </button>
        )}
      </div>

      {/* Always reserved — no jump when photos appear */}
      <label className="flex min-h-10 items-center gap-2.5 rounded-2xl border border-board/10 bg-white/70 px-3 py-2 text-sm text-board">
        <input
          type="checkbox"
          checked={enhance}
          onChange={(e) => onEnhanceChange(e.target.checked)}
          className="rounded border-board/30"
        />
        <span className="sm:hidden">Auto enhance before digitize</span>
        <span className="hidden sm:inline">Auto contrast / sharpen before digitize</span>
      </label>

      <button
        type="button"
        disabled={submitting || files.length === 0}
        onClick={onSubmit}
        className="min-h-12 w-full rounded-2xl bg-accent-dark px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {submitting
          ? 'Digitizing…'
          : files.length > 1
            ? `Digitize ${files.length} boards`
            : files.length === 1
              ? 'Digitize board'
              : 'Add photos to digitize'}
      </button>

      {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}

      {cameraOpen && (
        <div className="overflow-hidden rounded-2xl border border-board/15 bg-board">
          <video ref={videoRef} playsInline muted className="h-56 w-full object-cover sm:h-64" />
          <div className="flex gap-2 p-3">
            <button
              type="button"
              onClick={snapPhoto}
              className="flex-1 rounded-full bg-accent-dark px-4 py-2.5 text-sm font-semibold text-white"
            >
              Capture photo
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-chalk"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
