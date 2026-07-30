import { useState } from 'react'
import type { SavedPack, SavedRadarRun } from '../types'

interface Props {
  items: SavedPack[]
  radarRuns: SavedRadarRun[]
  onOpen: (item: SavedPack) => void
  onDelete: (id: string) => void
  onImport: (file: File) => void
  onOpenRadar: (run: SavedRadarRun) => void
  onDeleteRadar: (id: string) => void
}

type HistTab = 'packs' | 'radar'

export default function HistoryPanel({
  items,
  radarRuns,
  onOpen,
  onDelete,
  onImport,
  onOpenRadar,
  onDeleteRadar,
}: Props) {
  const [tab, setTab] = useState<HistTab>('packs')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('packs')}
            className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === 'packs' ? 'bg-board text-chalk' : 'border border-board/10 text-muted'
            }`}
          >
            Study packs · {items.length}
          </button>
          <button
            type="button"
            onClick={() => setTab('radar')}
            className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === 'radar' ? 'bg-board text-chalk' : 'border border-board/10 text-muted'
            }`}
          >
            Radar maps · {radarRuns.length}
          </button>
        </div>
        {tab === 'packs' && (
          <label className="cursor-pointer rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board hover:bg-mist">
            Import
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>

      {tab === 'packs' && (
        <>
          <p className="text-sm text-muted">
            {items.length === 0
              ? 'No packs yet. Digitize a board or notebook, then reopen anytime.'
              : `${items.length} pack${items.length === 1 ? '' : 's'} on this device. Used by Topic Radar coverage.`}
          </p>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-board/15 bg-mist/40 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-board">Nothing saved yet</p>
              <p className="mt-1 text-xs text-muted">
                Import a .boardsnap.json or create a study pack.
              </p>
            </div>
          ) : (
            <div
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {items.map((item) => (
                <article
                  key={item.id}
                  className="w-[min(100%,260px)] shrink-0 snap-start rounded-2xl border border-board/10 bg-mist/30 p-3 sm:w-[260px]"
                >
                  {item.thumbnails?.[0] ? (
                    <img
                      src={item.thumbnails[0]}
                      alt=""
                      className="mb-3 h-32 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="mb-3 flex h-32 w-full items-center justify-center rounded-xl bg-board/90 font-display text-lg font-bold text-chalk">
                      Pack
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="block w-full truncate text-left font-display text-base font-bold text-board hover:text-accent-dark"
                  >
                    {item.title}
                  </button>
                  <p className="mt-1 truncate text-xs text-muted">
                    {new Date(item.savedAt).toLocaleString()}
                    {item.subject ? ` · ${item.subject}` : ''}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      className="flex-1 rounded-full bg-accent-dark px-3 py-2 text-xs font-semibold text-white"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="rounded-full border border-board/15 px-3 py-2 text-xs font-semibold text-red-600/90 hover:bg-white"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'radar' && (
        <>
          <p className="text-sm text-muted">
            {radarRuns.length === 0
              ? 'No Radar maps yet. Run Topic Radar on a past paper to save one.'
              : `${radarRuns.length} Radar map${radarRuns.length === 1 ? '' : 's'}. Not used for study coverage.`}
          </p>

          {radarRuns.length === 0 ? (
            <div className="rounded-2xl border border-board/15 bg-mist/40 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-board">No Radar maps</p>
              <p className="mt-1 text-xs text-muted">Maps and practice stay here, separate from packs.</p>
            </div>
          ) : (
            <div
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {radarRuns.map((run) => {
                const mcq = run.result.practice_quiz?.length ?? 0
                const wr = run.result.practice_written?.length ?? 0
                const sol = run.result.previous_questions?.length ?? 0
                return (
                  <article
                    key={run.id}
                    className="w-[min(100%,260px)] shrink-0 snap-start rounded-2xl border border-board/10 bg-mist/30 p-3 sm:w-[260px]"
                  >
                    <div className="mb-3 flex h-24 w-full items-center justify-center rounded-xl bg-board/90 font-display text-lg font-bold text-accent">
                      Radar
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenRadar(run)}
                      className="block w-full truncate text-left font-display text-base font-bold text-board hover:text-accent-dark"
                    >
                      {run.title}
                    </button>
                    <p className="mt-1 truncate text-xs text-muted">
                      {new Date(run.savedAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {mcq} MCQ · {wr} written · {sol} solved
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenRadar(run)}
                        className="flex-1 rounded-full bg-accent-dark px-3 py-2 text-xs font-semibold text-white"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRadar(run.id)}
                        className="rounded-full border border-board/15 px-3 py-2 text-xs font-semibold text-red-600/90 hover:bg-white"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
