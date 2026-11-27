import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../api'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MapPin } from 'lucide-react'

function EditorialTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-xl border border-[#E8E3D9] bg-[#141413] px-3 py-2 text-xs text-white shadow-lg">
      <div className="font-mono-label text-[10px] text-[#A8A39B]">{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx} className="mt-0.5 font-mono-label text-xs font-semibold text-white">
          {valueFormatter ? valueFormatter(entry) : `${entry.name}: ${entry.value}`}
        </div>
      ))}
    </div>
  )
}

export default function MarketAnalytics({ form, onMarketDataChange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadMarket() {
      setLoading(true)
      setError(null)
      try {
        const url = `${API_BASE}/api/market/${encodeURIComponent(form.neighbourhood)}?borough=${encodeURIComponent(form.borough)}`
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`GET /api/market failed (${res.status})`)
        }
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          onMarketDataChange?.(json)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadMarket()
    return () => {
      cancelled = true
    }
  }, [form.neighbourhood, form.borough, onMarketDataChange])

  const histogramData = useMemo(() => {
    if (!data?.histogram) return []
    return data.histogram.map((b) => ({
      ...b,
      label: `$${Math.round(b.mid)}`,
    }))
  }, [data])

  const p50BinLabel = useMemo(() => {
    if (!data?.histogram?.length || !data?.quantiles) return null
    const p50 = data.quantiles.p50
    let best = histogramData[0]
    let bestDiff = Infinity
    for (const b of histogramData) {
      const diff = Math.abs(b.mid - p50)
      if (diff < bestDiff) {
        bestDiff = diff
        best = b
      }
    }
    return best?.label || null
  }, [data, histogramData])

  const capacityData = useMemo(() => {
    if (!data?.capacity_curve) return []
    return data.capacity_curve.map((c) => ({
      ...c,
      label: `${c.accommodates}G`,
    }))
  }, [data])

  const q = data?.quantiles
  const seg = data?.host_segmentation

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-6 sm:px-6">
      {/* Editorial Hero Header */}
      <div className="flex flex-col justify-between gap-4 pb-6 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D96B38]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#D96B38]" />
            <span>SUBMARKET LENS · INSIDE AIRBNB NYC</span>
          </div>
          <h1 className="mt-1.5 font-serif-display text-4xl leading-[1.03] tracking-tight text-[#141413] sm:text-5xl">
            {form.neighbourhood}.{' '}
            <span className="italic text-[#5C5953]">Rate Intelligence.</span>
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
                  Active Submarket
                </div>
                <div className="text-sm font-semibold text-[#141413]">
                  {data?.neighbourhood || form.neighbourhood}, {data?.borough || form.borough}
                </div>
              </div>
            </div>
            <span className="font-mono-label text-xs font-semibold text-[#141413]">
              {data ? `${data.listing_count.toLocaleString()} listings` : '—'}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#141413] px-3 py-1.5 font-mono-label text-[10px] uppercase tracking-wider text-[#F5F2EC]">
            <span>P25: ${q ? Math.round(q.p25) : '—'}</span>
            <span>P50: ${q ? Math.round(q.p50) : '—'}</span>
            <span>P90: ${q ? Math.round(q.p90) : '—'}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Top 4 Quantile KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
            01 / MEDIAN RATE (P50)
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            ${q ? Math.round(q.p50).toLocaleString() : '—'}
            <span className="ml-1 text-sm font-normal text-[#7A756C]">/ nt</span>
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            P25 Floor: ${q ? Math.round(q.p25).toLocaleString() : '—'} / night
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
            02 / TOP QUARTILE (P75)
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            ${q ? Math.round(q.p75).toLocaleString() : '—'}
            <span className="ml-1 text-sm font-normal text-[#7A756C]">/ nt</span>
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            P90 Ceiling: ${q ? Math.round(q.p90).toLocaleString() : '—'} / night
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
            03 / ACTIVE LISTINGS
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            {data ? data.listing_count.toLocaleString() : '—'}
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            Mean Rate: ${q ? Math.round(q.mean).toLocaleString() : '—'} / night
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
            04 / DISTRIBUTION SKEW
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#D96B38]">
            {q ? q.skew.toFixed(2) : '—'}
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            Std Dev: ${q ? Math.round(q.std).toLocaleString() : '—'} / night
          </div>
        </div>
      </section>

      {/* Row 1 Charts: Histogram + Room Type Median Comparison */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 01 / Nightly Rate Distribution */}
        <div className="rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                01 / NIGHTLY RATE DISTRIBUTION
              </div>
              <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
                Empirical Price Histogram
              </h2>
            </div>
            <span className="rounded-full border border-[#E8E3D9] bg-[#FAF8F4] px-3 py-1 font-mono-label text-[10px] font-semibold text-[#141413]">
              Median P50 = ${q ? Math.round(q.p50) : '—'}
            </span>
          </div>

          <div className="mt-4 h-[270px] w-full">
            {loading && !histogramData.length ? (
              <div className="estiance-shimmer h-full w-full rounded-2xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogramData} margin={{ top: 18, right: 12, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE5" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: '#E8E3D9' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={
                      <EditorialTooltip
                        valueFormatter={(e) =>
                          `${e.value} listings (${Math.round(e.payload.bin_start)}–$${Math.round(e.payload.bin_end)})`
                        }
                      />
                    }
                  />
                  {p50BinLabel && (
                    <ReferenceLine
                      x={p50BinLabel}
                      stroke="#141413"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{
                        value: `P50 $${Math.round(q.p50)}`,
                        position: 'top',
                        fill: '#141413',
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono',
                      }}
                    />
                  )}
                  <Bar dataKey="count" fill="#D96B38" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 02 / Room Type Median Comparison */}
        <div className="rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-5">
          <div>
            <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
              02 / ROOM TYPE MEDIAN COMPARISON
            </div>
            <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
              Category Rate Structure
            </h2>
          </div>

          <div className="mt-4 h-[270px] w-full">
            {loading && !data?.room_type_medians?.length ? (
              <div className="estiance-shimmer h-full w-full rounded-2xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.room_type_medians || []}
                  margin={{ top: 18, right: 12, left: -8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE5" vertical={false} />
                  <XAxis
                    dataKey="room_type"
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: '#E8E3D9' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={
                      <EditorialTooltip
                        valueFormatter={(e) =>
                          `Median $${Math.round(e.value)}/nt (${e.payload.count} listings)`
                        }
                      />
                    }
                  />
                  <Bar dataKey="median_price" fill="#141413" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Row 2: Price-per-Guest Scaling Curve + Host Operator Segmentation */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 03 / Price-per-Guest Scaling Curve */}
        <div className="rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                03 / CAPACITY SCALING ECONOMICS
              </div>
              <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
                Median Rate &amp; Price-per-Guest Curve (1–8 Guests)
              </h2>
            </div>
            <div className="flex items-center gap-3 font-mono-label text-[10px]">
              <span className="flex items-center gap-1.5 text-[#D96B38]">
                <span className="h-2 w-2 rounded-full bg-[#D96B38]" /> Median $/nt
              </span>
              <span className="flex items-center gap-1.5 text-[#141413]">
                <span className="h-2 w-2 rounded-full bg-[#141413]" /> $/Guest
              </span>
            </div>
          </div>

          <div className="mt-4 h-[250px] w-full">
            {loading && !capacityData.length ? (
              <div className="estiance-shimmer h-full w-full rounded-2xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={capacityData} margin={{ top: 14, right: 16, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE5" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: '#E8E3D9' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={
                      <EditorialTooltip
                        valueFormatter={(e) =>
                          `${e.name === 'median_price' ? 'Median Rate' : 'Price / Guest'}: $${Math.round(e.value)} (${e.payload.count} units)`
                        }
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="median_price"
                    stroke="#D96B38"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#D96B38', strokeWidth: 2, stroke: '#FFFFFF' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price_per_guest"
                    stroke="#141413"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3.5, fill: '#141413', strokeWidth: 1.5, stroke: '#FFFFFF' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 04 / Host Operator Segmentation */}
        <div className="flex flex-col justify-between rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                04 / HOST OPERATOR SEGMENTATION
              </span>
              <span className="rounded-full bg-[#FAF8F4] px-2.5 py-0.5 font-mono-label text-[10px] font-semibold text-[#141413]">
                {seg ? `${seg.total_hosts.toLocaleString()} Unique Hosts` : '—'}
              </span>
            </div>
            <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
              Single-Listing vs. Multi-Unit Operators
            </h2>

            {/* Two-tone proportional bar */}
            <div className="mt-5">
              <div className="mb-2 flex justify-between font-mono-label text-xs font-semibold">
                <span className="text-[#D96B38]">
                  Single-Listing: {seg ? `${seg.single_host_pct.toFixed(1)}%` : '—'}
                </span>
                <span className="text-[#141413]">
                  Multi-Unit (2+): {seg ? `${seg.multi_host_pct.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[#EFECE5]">
                <div
                  className="bg-[#D96B38] transition-all duration-500"
                  style={{ width: `${seg?.single_host_pct ?? 50}%` }}
                />
                <div
                  className="bg-[#141413] transition-all duration-500"
                  style={{ width: `${seg?.multi_host_pct ?? 50}%` }}
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#EFECE5] bg-[#FAF8F4] p-3.5">
                <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                  Single-Listing Hosts
                </div>
                <div className="mt-1 font-sans text-xl font-bold text-[#141413]">
                  {seg ? seg.single_listing_hosts.toLocaleString() : '—'}
                </div>
                <div className="mt-1 font-mono-label text-[10px] text-[#6B675E]">
                  {seg ? `${seg.single_listings_count} units · Med $${Math.round(seg.single_median_price)}` : '—'}
                </div>
              </div>

              <div className="rounded-2xl border border-[#EFECE5] bg-[#FAF8F4] p-3.5">
                <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                  Multi-Unit Operators
                </div>
                <div className="mt-1 font-sans text-xl font-bold text-[#141413]">
                  {seg ? seg.multi_unit_hosts.toLocaleString() : '—'}
                </div>
                <div className="mt-1 font-mono-label text-[10px] text-[#6B675E]">
                  {seg ? `${seg.multi_listings_count} units · Med $${Math.round(seg.multi_median_price)}` : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#EFECE5] bg-[#FAF8F4] px-3.5 py-2.5 font-mono-label text-[11px] leading-relaxed text-[#6B675E]">
            All counts and medians computed directly from the {data ? data.listing_count.toLocaleString() : '—'} catalog listings in {data?.neighbourhood || form.neighbourhood}.
          </div>
        </div>
      </section>
    </main>
  )
}
