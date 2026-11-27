import { useEffect, useState } from 'react'
import { AlertTriangle, Download, MapPin, Minus, Plus, ShieldCheck } from 'lucide-react'
import { API_BASE } from '../api'

function formatSpecs(comp) {
  const guests = `${comp.accommodates} ${comp.accommodates === 1 ? 'guest' : 'guests'}`
  const br = comp.bedrooms != null ? `${comp.bedrooms}BR` : '—BR'
  const ba = comp.bathrooms != null ? `${comp.bathrooms}BA` : '—BA'
  return `${guests} · ${br} · ${ba}`
}

export default function CompsDossier({
  form,
  basePrediction,
  onDossierDataChange,
  onExportCsv,
}) {
  const [dedupHost, setDedupHost] = useState(true)
  const [radiusKm, setRadiusKm] = useState(2.0)
  const [minGuests, setMinGuests] = useState(form.accommodates)
  const [topK, setTopK] = useState(9)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Sync guest filter when Tab 1's guest count changes
  useEffect(() => {
    setMinGuests(form.accommodates)
  }, [form.accommodates])

  useEffect(() => {
    let cancelled = false
    async function fetchDossier() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/api/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            accommodates: minGuests,
            top_k: topK,
            max_radius_km: radiusKm,
            dedup_host: dedupHost,
          }),
        })
        if (!res.ok) {
          throw new Error(`POST /api/predict failed (${res.status})`)
        }
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          onDossierDataChange?.(json)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDossier()
    return () => {
      cancelled = true
    }
  }, [
    form.borough,
    form.neighbourhood,
    form.room_type,
    form.property_type,
    form.bedrooms,
    form.beds,
    form.bathrooms,
    form.min_nights,
    form.amenity_count,
    form.amenities,
    dedupHost,
    radiusKm,
    minGuests,
    topK,
    onDossierDataChange,
  ])

  const comps = data?.comps || []
  const compsMeta = data?.comps_meta
  const referencePred = basePrediction?.predicted_price ?? data?.predicted_price ?? 0
  const isSparseWarning =
    compsMeta &&
    (String(compsMeta.tier_used || '').toLowerCase().includes('fallback') ||
      compsMeta.unique_pool_count < 5)

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-6 sm:px-6">
      {/* Editorial Hero Header */}
      <div className="flex flex-col justify-between gap-4 pb-6 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D96B38]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#D96B38]" />
            <span>
              GEOSPATIAL NEIGHBORHOOD INTEL · {compsMeta ? `${compsMeta.unique_pool_count} UNIQUE HOSTS IN POOL` : 'HOST-DEDUPLICATED'}
            </span>
          </div>
          <h1 className="mt-1.5 font-serif-display text-4xl leading-[1.03] tracking-tight text-[#141413] sm:text-5xl">
            {form.neighbourhood} Comps.{' '}
            <span className="italic text-[#5C5953]">No duplicates.</span>
          </h1>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-[#E8E3D9] bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F2EC]">
                <MapPin className="h-4 w-4 text-[#D96B38]" />
              </div>
              <div>
                <div className="font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]">
                  Subject Filter Target
                </div>
                <div className="text-sm font-semibold text-[#141413]">
                  {form.neighbourhood}, {form.borough}
                </div>
              </div>
            </div>
            <span className="font-mono-label text-xs font-semibold text-[#D96B38]">
              {referencePred ? `$${Math.round(referencePred)}/nt` : '—'}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#141413] px-3 py-1.5 font-mono-label text-[10px] uppercase tracking-wider text-[#F5F2EC]">
            <span>{form.room_type}</span>
            <span>{minGuests} Guests</span>
            <span>{radiusKm.toFixed(2)} km</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Top 4 Real KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
              01 / AVG COMP RATE
            </span>
            <span className="rounded-full bg-[#FDF3EE] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-[#D96B38]">
              ACTIVE
            </span>
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            ${compsMeta ? Math.round(compsMeta.comp_avg_price).toLocaleString() : '—'}
            <span className="ml-1 text-sm font-normal text-[#7A756C]">/ nt</span>
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            {compsMeta
              ? `Spread: $${Math.round(compsMeta.comp_min_price)} to $${Math.round(compsMeta.comp_max_price)}`
              : 'Loading spread...'}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
              02 / MEDIAN DISTANCE
            </span>
            <span className="rounded-full bg-[#FAF8F4] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-[#6B675E]">
              HAVERSINE
            </span>
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            {compsMeta ? compsMeta.comp_median_distance_km.toFixed(2) : '—'}
            <span className="ml-1 text-sm font-normal text-[#7A756C]">km</span>
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            Radius filter: ≤ {radiusKm.toFixed(2)} km
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
              03 / UNIQUE HOST RATIO
            </span>
            <span className="rounded-full bg-[#FAF8F4] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-[#6B675E]">
              RATIO
            </span>
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            {compsMeta ? `${compsMeta.dedup_ratio_pct.toFixed(1)}%` : '—'}
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            {compsMeta
              ? `${compsMeta.unique_pool_count} unique / ${compsMeta.raw_pool_count} raw units`
              : 'Analyzing hosts...'}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
              04 / FILTER POSTURE
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono-label text-[9px] font-semibold ${
                dedupHost ? 'bg-[#FDF3EE] text-[#D96B38]' : 'bg-[#FAF8F4] text-[#6B675E]'
              }`}
            >
              {dedupHost ? 'ENFORCED' : 'RAW POOL'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 font-sans text-xl font-bold tracking-tight text-[#141413]">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#D96B38]" />
            <span>{dedupHost ? 'Deduplication Active' : 'Raw Unfiltered Pool'}</span>
          </div>
          <div className="mt-2.5 font-mono-label text-[11px] text-[#7A756C]">
            {compsMeta
              ? dedupHost
                ? `${compsMeta.hidden_duplicates} multi-listing units hidden`
                : `${compsMeta.hidden_duplicates} duplicate host units in pool`
              : 'Checking host collisions...'}
          </div>
        </div>
      </section>

      {/* Sparse-Comp Uncertainty Warning Badge */}
      {isSparseWarning && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E9A686] bg-[#FDF3EE] px-4 py-3"
          data-testid="sparse-comp-warning"
        >
          <div className="flex items-center gap-2.5 text-sm text-[#9A3F18]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#D96B38]" />
            <span>
              <strong>Sparse-Comp Uncertainty:</strong> Only{' '}
              <strong>{compsMeta.unique_pool_count}</strong> unique hosts matched ({compsMeta.tier_used}). Consider widening the proximity radius or adjusting guest capacity.
            </span>
          </div>
          <span className="rounded-full bg-white px-2.5 py-0.5 font-mono-label text-[10px] font-semibold uppercase text-[#D96B38]">
            {compsMeta.tier_used}
          </span>
        </div>
      )}

      {/* Working Filter Bar */}
      <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[#E8E3D9] bg-white p-4 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setDedupHost((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
              dedupHost
                ? 'bg-[#D96B38] text-white shadow-sm'
                : 'border border-[#E0DAD0] bg-[#FAF8F4] text-[#141413] hover:border-[#141413]'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${dedupHost ? 'bg-white' : 'bg-[#7A756C]'}`} />
            <span>Max 1 Listing / Host (Deduped)</span>
          </button>

          {/* Min Guests Stepper */}
          <div className="flex items-center gap-2.5 rounded-full border border-[#E8E3D9] bg-[#FAF8F4] px-3.5 py-1.5">
            <span className="font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]">
              Target Guests
            </span>
            <button
              type="button"
              onClick={() => setMinGuests((g) => Math.max(1, g - 1))}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-[#E0DAD0] bg-white text-[#141413] hover:border-[#141413] cursor-pointer"
              aria-label="Decrease target guests"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[1.2rem] text-center font-mono-label text-xs font-semibold text-[#141413]">
              {minGuests}
            </span>
            <button
              type="button"
              onClick={() => setMinGuests((g) => Math.min(16, g + 1))}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-[#E0DAD0] bg-white text-[#141413] hover:border-[#141413] cursor-pointer"
              aria-label="Increase target guests"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Comps Count Selector (6 / 9 / 12) */}
          <div className="flex items-center gap-1 rounded-full border border-[#E8E3D9] bg-[#FAF8F4] p-1">
            <span className="px-2 font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]">
              Show
            </span>
            {[6, 9, 12].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setTopK(count)}
                className={`rounded-full px-2.5 py-1 font-mono-label text-xs font-semibold transition cursor-pointer ${
                  topK === count
                    ? 'bg-[#141413] text-white'
                    : 'text-[#6B675E] hover:text-[#141413]'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Proximity Radius Slider + CSV Button */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 rounded-full border border-[#E8E3D9] bg-[#FAF8F4] px-4 py-1.5">
            <span className="font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]">
              Radius
            </span>
            <input
              type="range"
              min={0.5}
              max={5.0}
              step={0.25}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="estiance-slider w-28"
              aria-label="Proximity Radius km"
            />
            <span className="min-w-[3.4rem] text-right font-mono-label text-xs font-semibold text-[#141413]">
              {radiusKm.toFixed(2)} km
            </span>
            <span className="rounded-full bg-[#FDF3EE] px-2 py-0.5 font-mono-label text-[10px] font-semibold text-[#D96B38]">
              {comps.length} comps
            </span>
          </div>

          <button
            type="button"
            onClick={onExportCsv}
            disabled={!comps.length}
            className="inline-flex items-center gap-2 rounded-full bg-[#141413] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#D96B38] disabled:opacity-45 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Clean Comps Dossier (.csv)</span>
          </button>
        </div>
      </section>

      {/* 3-Column Typographic Comp Cards Grid (zero stock photos) */}
      <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading && comps.length === 0
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="rounded-[20px] border border-[#E8E3D9] bg-white p-5"
              >
                <div className="estiance-shimmer h-5 w-24 rounded-full" />
                <div className="estiance-shimmer mt-4 h-5 w-3/4 rounded" />
                <div className="estiance-shimmer mt-2 h-3.5 w-1/2 rounded" />
                <div className="estiance-shimmer mt-6 h-12 w-full rounded-xl" />
              </div>
            ))
          : comps.map((comp, idx) => {
              const pctDiff =
                referencePred > 0 ? ((comp.price_num - referencePred) / referencePred) * 100 : 0
              const pctSign = pctDiff >= 0 ? '+' : ''
              return (
                <article
                  key={`${comp.id}-${idx}`}
                  className="flex flex-col justify-between rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)] transition hover:border-[#D96B38]/60"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#141413] px-2.5 py-1 font-mono-label text-[10px] font-semibold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#D96B38]" />
                        {comp.similarity_pct.toFixed(1)}% Match
                      </span>
                      <span className="rounded-full border border-[#E8E3D9] bg-[#FAF8F4] px-2.5 py-0.5 font-mono-label text-[10px] text-[#6B675E]">
                        {comp.room_type}
                      </span>
                    </div>

                    <div className="mt-3.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[#141413]">
                          {comp.name}
                        </h3>
                        <div className="mt-1 font-mono-label text-[11px] text-[#6B675E]">
                          {comp.neighbourhood} · Host #{comp.host_id}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="font-sans text-xl font-bold text-[#141413]">
                          ${Math.round(comp.price_num).toLocaleString()}
                          <span className="text-xs font-normal text-[#7A756C]">/nt</span>
                        </div>
                        <div
                          className={`mt-0.5 inline-block rounded px-1.5 py-0.5 font-mono-label text-[10px] font-semibold ${
                            pctDiff >= 0
                              ? 'bg-[#FDF3EE] text-[#D96B38]'
                              : 'bg-[#F5F2EC] text-[#5C5953]'
                          }`}
                        >
                          {pctSign}
                          {pctDiff.toFixed(1)}% vs pred
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-[#FAF8F4] px-2 py-1 font-mono-label text-[10px] text-[#5C5953]">
                        {formatSpecs(comp)}
                      </span>
                      <span className="rounded-md bg-[#FAF8F4] px-2 py-1 font-mono-label text-[10px] text-[#5C5953]">
                        {comp.property_type}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#EFECE5] pt-3">
                    <div>
                      <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                        Distance
                      </div>
                      <div className="font-mono-label text-xs font-semibold text-[#141413]">
                        {comp.geo_km.toFixed(2)} km
                      </div>
                    </div>
                    <div>
                      <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                        Amenities
                      </div>
                      <div className="font-mono-label text-xs font-semibold text-[#141413]">
                        {comp.amenity_count} items
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                        Listing ID
                      </div>
                      <div className="truncate font-mono-label text-[11px] font-medium text-[#6B675E]">
                        #{String(comp.id).slice(-6)}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
      </section>
    </main>
  )
}
