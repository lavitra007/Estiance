import { MapPin } from 'lucide-react'

const TABS = [
  { id: 'studio', label: 'Pricing Studio' },
  { id: 'comps', label: 'Comps Dossier' },
  { id: 'market', label: 'Market Analytics' },
  { id: 'validation', label: 'Model Validation' },
]

export default function Navbar({
  activeTab,
  onSelectTab,
  meta,
  borough,
  neighbourhood,
  coords,
}) {
  const latStr = coords ? `${coords.latitude.toFixed(4)}°N` : '—'
  const lonStr = coords ? `${Math.abs(coords.longitude).toFixed(4)}°W` : '—'

  return (
    <header className="sticky top-3 z-40 mx-auto max-w-[1320px] px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-full bg-[#141413] px-4 py-2.5 text-[#F5F2EC] shadow-lg shadow-black/10">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white font-serif-display text-lg font-semibold leading-none text-[#141413]">
              e
            </span>
            <span className="font-mono-label text-xs font-semibold tracking-[0.16em] text-white">
              ESTIANCE
            </span>
          </div>
          <span className="hidden rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono-label text-[10px] uppercase tracking-wider text-[#A8A39B] lg:inline-block">
            {meta ? `${meta.best_model} · ${meta.catalog_count.toLocaleString()} NYC Listings` : 'Loading Engine...'}
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Primary sections">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#D96B38] text-white shadow-sm'
                    : 'text-[#A8A39B] hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* Live Subject Coordinate Telemetry (real catalog centroid, zero decorative avatars) */}
        <div className="hidden items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 md:flex">
          <MapPin className="h-3.5 w-3.5 text-[#D96B38]" />
          <span className="text-xs font-medium text-white">
            {neighbourhood}, {borough}
          </span>
          <span className="font-mono-label text-[10px] text-[#A8A39B]">
            {latStr} · {lonStr}
          </span>
        </div>
      </div>
    </header>
  )
}
