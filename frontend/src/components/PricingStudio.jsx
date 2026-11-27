import { useEffect, useState } from 'react'
import { ArrowRight, Check, MapPin, Minus, Plus, ShieldCheck, Sparkles } from 'lucide-react'

const LOADING_STEPS = [
  'Encoding 29 CatBoost signals...',
  'Deduplicating Haversine comps...',
]

function Stepper({ label, value, min, max, step = 1, onChange, format }) {
  const dec = () => onChange(Math.max(min, Number((value - step).toFixed(2))))
  const inc = () => onChange(Math.min(max, Number((value + step).toFixed(2))))

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E8E3D9] bg-[#FAF8F4] px-3 py-2">
      <span className="font-mono-label text-[10px] font-medium uppercase tracking-wider text-[#7A756C]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E0DAD0] bg-white text-[#141413] transition hover:border-[#141413] disabled:opacity-35 cursor-pointer"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-[2.1rem] text-center font-mono-label text-xs font-semibold text-[#141413]">
          {format ? format(value) : value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E0DAD0] bg-white text-[#141413] transition hover:border-[#141413] disabled:opacity-35 cursor-pointer"
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function RadialPriceGauge({ price, loading, loadingStep }) {
  const size = 216
  const stroke = 11
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = Math.min(0.92, Math.max(0.18, (price || 0) / 850))
  const dashOffset = circumference * (1 - ratio)

  if (loading) {
    return (
      <div
        className="relative mx-auto flex h-[216px] w-[216px] items-center justify-center"
        data-testid="predict-orbital-loader"
      >
        {/* Outer static track */}
        <svg width={size} height={size} className="absolute inset-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#EFECE5"
            strokeWidth={stroke}
          />
        </svg>
        {/* Animated rotating terracotta orbital ring */}
        <svg
          width={size}
          height={size}
          className="estiance-orbit-spin absolute inset-0"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#D96B38"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.28} ${circumference * 0.72}`}
          />
          <circle
            cx={size / 2}
            cy={stroke / 2}
            r={5}
            fill="#141413"
          />
        </svg>
        <div className="relative flex max-w-[155px] flex-col items-center justify-center text-center">
          <span className="inline-block h-2 w-2 rounded-full bg-[#D96B38] animate-pulse" />
          <span className="mt-2 font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#D96B38]">
            CALIBRATING
          </span>
          <span className="mt-1.5 font-mono-label text-[11px] leading-snug text-[#141413]">
            {loadingStep}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative mx-auto flex h-[216px] w-[216px] items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EFECE5"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#D96B38"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono-label text-[10px] font-medium uppercase tracking-[0.14em] text-[#7A756C]">
          Recommended ADR
        </span>
        <span className="mt-1 font-sans text-4xl font-bold tracking-tight text-[#141413]">
          ${price != null ? Math.round(price).toLocaleString() : '—'}
        </span>
        <span className="font-mono-label text-xs text-[#7A756C]">/ night</span>
      </div>
    </div>
  )
}

function formatSignedUsd(val) {
  if (val == null) return '—'
  const sign = val >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(val).toFixed(2)}`
}

function formatSpecs(comp) {
  const guests = `${comp.accommodates} ${comp.accommodates === 1 ? 'guest' : 'guests'}`
  const br = comp.bedrooms != null ? `${comp.bedrooms}BR` : '—BR'
  const ba = comp.bathrooms != null ? `${comp.bathrooms}BA` : '—BA'
  return `${guests} · ${br} · ${ba}`
}

export default function PricingStudio({
  meta,
  form,
  onUpdateForm,
  onToggleAmenity,
  onPredict,
  isDirty,
  prediction,
  loading,
  error,
  onViewAllComps,
}) {
  const [loadingStepIdx, setLoadingStepIdx] = useState(0)

  useEffect(() => {
    if (!loading) {
      setLoadingStepIdx(0)
      return
    }
    const id = setInterval(() => {
      setLoadingStepIdx((prev) => (prev + 1) % LOADING_STEPS.length)
    }, 340)
    return () => clearInterval(id)
  }, [loading])

  const boroughs = meta?.boroughs || []
  const hoods = meta?.borough_to_neighbourhoods?.[form.borough] || []
  const roomTypes = meta?.room_types || []
  const propertyTypes = meta?.property_types || []

  const activeAmenityCount = Object.values(form.amenities || {}).filter(Boolean).length
  const amenityDeltas = prediction?.amenity_deltas || []
  const breakdown = prediction?.counterfactual_breakdown
  const topComps = (prediction?.comps || []).slice(0, 5)
  const compsMeta = prediction?.comps_meta
  const fair = prediction?.fair_range
  const valSummary = meta?.validation_summary

  const rangeSpan = fair ? Math.max(1, fair.high - fair.low) : 1
  const markerPct = fair
    ? Math.min(92, Math.max(8, ((prediction.predicted_price - fair.low) / rangeSpan) * 100))
    : 50

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-6 sm:px-6">
      {/* Editorial Hero Header */}
      <div className="flex flex-col justify-between gap-4 pb-6 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D96B38]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#D96B38]" />
            <span>
              LIVE {meta?.best_model?.toUpperCase() || 'CATBOOST'} INFERENCE · {meta?.feature_count ?? 29}-FEATURE WHAT-IF SIMULATOR
            </span>
          </div>
          <h1 className="mt-1.5 font-serif-display text-4xl leading-[1.03] tracking-tight text-[#141413] sm:text-5xl">
            Data-driven nightly pricing.{' '}
            <span className="italic text-[#5C5953]">Grounded in local comps.</span>
          </h1>
        </div>

        {/* Subject Location Card */}
        <div className="w-full max-w-sm rounded-2xl border border-[#E8E3D9] bg-white p-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F2EC] text-[#141413]">
                <MapPin className="h-4 w-4 text-[#D96B38]" />
              </div>
              <div>
                <div className="font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]">
                  {form.borough} Cluster
                </div>
                <div className="text-sm font-semibold text-[#141413]">{form.neighbourhood}</div>
              </div>
            </div>
            <span className="font-mono-label text-[10px] text-[#7A756C]">
              {prediction?.subject
                ? `${prediction.subject.dist_midtown_km} km to Midtown`
                : 'Midtown dist'}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#141413] px-3 py-1.5 font-mono-label text-[10px] uppercase tracking-wider text-[#F5F2EC]">
            <span>{form.room_type}</span>
            <span>{form.accommodates} Guests</span>
            <span>Min {form.min_nights}d</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Card 01: Control Surface */}
      <section className="rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] sm:p-7">
        <div className="flex flex-col justify-between gap-4 border-b border-[#EFECE5] pb-5 lg:flex-row lg:items-center">
          <div>
            <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
              01 / SHAPE THE OUTCOME & WHAT-IF SIMULATOR
            </div>
            <h2 className="mt-1 font-serif-display text-3xl leading-tight text-[#141413]">
              Move one thing. Watch everything respond.
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stepper
              label="Guests"
              value={form.accommodates}
              min={1}
              max={16}
              onChange={(v) => onUpdateForm('accommodates', v)}
            />
            <Stepper
              label="Bedrooms"
              value={form.bedrooms}
              min={0}
              max={15}
              onChange={(v) => onUpdateForm('bedrooms', v)}
            />
            <Stepper
              label="Beds"
              value={form.beds}
              min={0}
              max={20}
              onChange={(v) => onUpdateForm('beds', v)}
            />
            <Stepper
              label="Baths"
              value={form.bathrooms}
              min={0.5}
              max={10}
              step={0.5}
              format={(v) => v.toFixed(1)}
              onChange={(v) => onUpdateForm('bathrooms', v)}
            />
          </div>
        </div>

        {/* Borough / Neighbourhood & Room / Property Selectors */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#EFECE5] bg-[#FAF8F4] p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono-label text-[10px] font-semibold uppercase tracking-wider text-[#7A756C]">
                Borough & Neighbourhood Calibration
              </span>
              <span className="font-mono-label text-[10px] text-[#7A756C]">
                {hoods.length} Submarkets
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {boroughs.map((b) => {
                const active = form.borough === b
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => onUpdateForm('borough', b)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                      active
                        ? 'bg-[#D96B38] text-white shadow-sm'
                        : 'border border-[#E8E3D9] bg-white text-[#141413] hover:border-[#141413]'
                    }`}
                  >
                    {b}
                  </button>
                )
              })}
            </div>

            <div className="mt-3">
              <label
                htmlFor="neighbourhood-select"
                className="mb-1 block font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]"
              >
                Neighbourhood
              </label>
              <select
                id="neighbourhood-select"
                value={form.neighbourhood}
                onChange={(e) => onUpdateForm('neighbourhood', e.target.value)}
                className="w-full rounded-xl border border-[#E0DAD0] bg-white px-3 py-2 text-sm font-medium text-[#141413] outline-none focus:border-[#D96B38]"
              >
                {hoods.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-[#EFECE5] bg-[#FAF8F4] p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono-label text-[10px] font-semibold uppercase tracking-wider text-[#7A756C]">
                Structural Layout & Room Type
              </span>
              <span className="font-mono-label text-[10px] text-[#7A756C]">
                {form.min_nights >= 30 ? 'NYC LL18 (30+d)' : 'Short-Term (<30d)'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {roomTypes.map((rt) => {
                const active = form.room_type === rt
                return (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => onUpdateForm('room_type', rt)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                      active
                        ? 'bg-[#D96B38] text-white shadow-sm'
                        : 'border border-[#E8E3D9] bg-white text-[#141413] hover:border-[#141413]'
                    }`}
                  >
                    {rt}
                  </button>
                )
              })}
            </div>

            <div className="mt-3">
              <label
                htmlFor="property-type-select"
                className="mb-1 block font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]"
              >
                Property Type
              </label>
              <select
                id="property-type-select"
                value={form.property_type}
                onChange={(e) => onUpdateForm('property_type', e.target.value)}
                className="w-full rounded-xl border border-[#E0DAD0] bg-white px-3 py-2 text-sm font-medium text-[#141413] outline-none focus:border-[#D96B38]"
              >
                {propertyTypes.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 10 Real Amenity Cards with Counterfactual $/nt Deltas */}
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
              MODEL AMENITY FEATURES (COUNTERFACTUAL MARGINAL DELTA)
            </span>
            <span className="rounded-full border border-[#E9A686] bg-[#FDF3EE] px-3 py-1 font-mono-label text-[11px] font-semibold text-[#D96B38]">
              {activeAmenityCount} Active Amenities
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {(amenityDeltas.length > 0
              ? amenityDeltas
              : (meta?.amenity_definitions || []).map((a) => ({
                  key: a.key,
                  label: a.label,
                  category: a.category,
                  enabled: Boolean(form.amenities?.[a.key]),
                  delta_usd: null,
                }))
            ).map((item, idx) => {
              const active = Boolean(form.amenities?.[item.key])
              const deltaPositive = item.delta_usd != null && item.delta_usd >= 0
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleAmenity(item.key)}
                  className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                    active
                      ? 'border-[#D96B38] bg-[#FDF6F2] shadow-sm'
                      : 'border-[#E8E3D9] bg-white hover:border-[#C9C2B6]'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-mono-label text-[10px] text-[#7A756C]">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="rounded-md bg-[#F5F2EC] px-1.5 py-0.5 font-mono-label text-[9px] uppercase tracking-wider text-[#6B675E]">
                      {item.category}
                    </span>
                  </div>

                  <div className="my-2 text-sm font-semibold text-[#141413]">{item.label}</div>

                  <div className="flex w-full items-center justify-between">
                    <span
                      className={`font-mono-label text-xs font-semibold ${
                        item.delta_usd == null
                          ? 'text-[#7A756C]'
                          : deltaPositive
                            ? 'text-[#D96B38]'
                            : 'text-[#6B675E]'
                      }`}
                    >
                      {item.delta_usd != null ? `${formatSignedUsd(item.delta_usd)} / nt` : '—'}
                    </span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${
                        active
                          ? 'bg-[#D96B38] text-white'
                          : 'border border-[#D5CFC3] bg-white text-[#7A756C]'
                      }`}
                    >
                      {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Bottom Controls + Explicit Predict CTA Row */}
        <div className="mt-7 border-t border-[#EFECE5] pt-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
            {/* Total Amenity Count */}
            <div className="rounded-2xl border border-[#EFECE5] bg-[#FAF8F4] px-4 py-3.5 lg:col-span-6">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-mono-label text-[10px] font-semibold uppercase tracking-wider text-[#7A756C]">
                  TOTAL AMENITY COUNT (CATALOG SIGNAL)
                </span>
                <span className="font-mono-label text-xs font-semibold text-[#141413]">
                  {form.amenity_count} amenities
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={form.amenity_count}
                onChange={(e) => onUpdateForm('amenity_count', Number(e.target.value))}
                className="estiance-slider w-full"
                aria-label="Total Amenity Count"
              />
            </div>

            {/* Minimum Stay Policy */}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#EFECE5] bg-[#FAF8F4] px-4 py-3.5 lg:col-span-6">
              <div>
                <div className="font-mono-label text-[10px] font-semibold uppercase tracking-wider text-[#7A756C]">
                  Minimum Stay Policy
                </div>
                <div className="mt-0.5 text-sm font-semibold text-[#141413]">
                  {form.min_nights} {form.min_nights === 1 ? 'Night' : 'Nights'}{' '}
                  <span className="font-normal text-[#6B675E]">
                    ({form.min_nights >= 30 ? 'LL18 Compliant' : 'Short-Term'})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateForm('min_nights', Math.max(1, form.min_nights - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E0DAD0] bg-white text-[#141413] hover:border-[#141413] cursor-pointer"
                  aria-label="Decrease minimum nights"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.min_nights}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(365, Number(e.target.value) || 1))
                    onUpdateForm('min_nights', val)
                  }}
                  className="w-16 rounded-xl border border-[#E0DAD0] bg-white px-2 py-1.5 text-center font-mono-label text-xs font-semibold text-[#141413]"
                  aria-label="Minimum nights"
                />
                <button
                  type="button"
                  onClick={() => onUpdateForm('min_nights', Math.min(365, form.min_nights + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E0DAD0] bg-white text-[#141413] hover:border-[#141413] cursor-pointer"
                  aria-label="Increase minimum nights"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Explicit Predict Action Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {isDirty && !loading && (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-[#E9A686] bg-[#FDF3EE] px-3.5 py-1.5 font-mono-label text-[11px] font-medium text-[#B85223]"
                data-testid="dirty-indicator"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#D96B38]" />
                Inputs modified · Click Predict to update
              </span>
            )}
            <button
              type="button"
              onClick={onPredict}
              disabled={loading}
              className="inline-flex items-center gap-2.5 rounded-xl bg-[#D96B38] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#c55d2d] disabled:cursor-not-allowed disabled:opacity-65 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>{loading ? 'Predicting...' : 'Predict Nightly Rate'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Bottom 2-Column Results Grid */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Card 02: Recommended Nightly Rate Radial Card */}
        <div className="flex flex-col justify-between rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-4">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
              02 / TONIGHT&apos;S RATE ORBIT
            </span>
            <span className="rounded-md border border-[#E9A686] bg-[#FDF3EE] px-2 py-0.5 font-mono-label text-[10px] font-semibold text-[#D96B38]">
              {loading ? 'INFERENCE...' : isDirty ? 'STALE · CLICK PREDICT' : 'LIVE MODEL'}
            </span>
          </div>

          <div className="my-6">
            <RadialPriceGauge
              price={prediction?.predicted_price}
              loading={loading}
              loadingStep={LOADING_STEPS[loadingStepIdx]}
            />
          </div>

          {/* Read-Only Calibrated Fair Range Meter */}
          <div className={`transition-opacity duration-300 ${loading ? 'opacity-45' : 'opacity-100'}`}>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-mono-label text-sm font-semibold text-[#141413]">
                  ${fair ? Math.round(fair.low).toLocaleString() : '—'}
                </div>
                <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                  FAIR FLOOR
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono-label text-sm font-semibold text-[#141413]">
                  ${fair ? Math.round(fair.high).toLocaleString() : '—'}
                </div>
                <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                  FAIR CEILING
                </div>
              </div>
            </div>

            {/* Minimalist Calibrated Range Meter (strictly contained, no floating pill) */}
            <div
              className="relative mt-3 flex h-4 w-full items-center"
              role="meter"
              aria-label="Calibrated fair range meter"
              aria-valuenow={prediction?.predicted_price ?? 0}
              aria-valuemin={fair?.low ?? 0}
              aria-valuemax={fair?.high ?? 0}
            >
              <div className="relative h-[6px] w-full rounded-full bg-[#ECE7DD]">
                <div
                  className="absolute inset-y-0 rounded-full bg-[#D96B38]/25"
                  style={{ left: '6%', right: '6%' }}
                />
              </div>
              <div
                className="absolute top-1/2 h-[14px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D96B38] ring-2 ring-white shadow-sm transition-all duration-500 ease-out"
                style={{ left: `${markerPct}%` }}
                data-testid="range-meter-tick"
                title={prediction?.predicted_price != null ? `Predicted: $${Math.round(prediction.predicted_price)}` : undefined}
              />
            </div>

            <div className="mt-3 text-center font-mono-label text-[10px] text-[#7A756C]">
              {fair?.calibrated_coverage_pct != null
                ? `Empirical holdout interval · ${fair.calibrated_coverage_pct.toFixed(1)}% coverage`
                : 'Empirical holdout interval'}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#EFECE5] pt-4">
              <div>
                <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                  Comp Median
                </div>
                <div className="font-mono-label text-sm font-semibold text-[#141413]">
                  ${compsMeta ? Math.round(compsMeta.comp_median_price).toLocaleString() : '—'} / nt
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                  Holdout Metrics
                </div>
                <div className="font-mono-label text-xs font-semibold text-[#141413]">
                  R² {valSummary?.holdout_r2?.toFixed(3) ?? '—'} · MdAPE {valSummary?.holdout_mdape_pct?.toFixed(1) ?? '—'}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 03: Counterfactual Breakdown + Editorial Ranked Top 5 Comps Table */}
        <div className="flex flex-col justify-between rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                03 / NEIGHBOR GRAVITY & COUNTERFACTUAL BREAKDOWN
              </div>
              <h2 className="mt-1 font-serif-display text-3xl leading-tight text-[#141413]">
                {compsMeta ? `${compsMeta.unique_pool_count} unique hosts.` : 'Local comps.'} Zero duplicates.
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E3D9] bg-[#FAF8F4] px-3 py-1.5 font-mono-label text-[11px] font-medium text-[#141413]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#D96B38]" />
                <span>{compsMeta?.tier_used || 'Tiered Haversine'}</span>
              </div>
              <button
                type="button"
                onClick={onViewAllComps}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#141413] bg-[#141413] px-3.5 py-1.5 font-mono-label text-[11px] font-medium text-white transition hover:bg-[#D96B38] hover:border-[#D96B38] cursor-pointer"
              >
                <span>View all comps</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 space-y-4" data-testid="comps-skeleton-loader">
              {/* Shimmer 4 breakdown boxes */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="rounded-xl border border-[#EFECE5] bg-[#FAF8F4] p-3">
                    <div className="estiance-shimmer h-2.5 w-20 rounded" />
                    <div className="estiance-shimmer mt-2.5 h-5 w-16 rounded" />
                    <div className="estiance-shimmer mt-3 h-1 w-full rounded-full" />
                  </div>
                ))}
              </div>
              {/* Shimmer 5 ranked comp rows */}
              <div className="overflow-hidden rounded-2xl border border-[#EFECE5]">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4 border-b border-[#EFECE5] px-4 py-3.5 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="estiance-shimmer h-6 w-7 rounded-md" />
                      <div>
                        <div className="estiance-shimmer h-3.5 w-52 rounded" />
                        <div className="estiance-shimmer mt-1.5 h-2.5 w-36 rounded" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="estiance-shimmer h-5 w-20 rounded-full" />
                      <div className="estiance-shimmer h-5 w-16 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="transition-opacity duration-300">
              {/* 4 Real Counterfactual Attribution Mini-Cards */}
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-[#EFECE5] bg-[#FAF8F4] p-3">
                  <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                    {prediction?.subject?.borough || form.borough} Base
                  </div>
                  <div className="mt-1 font-mono-label text-base font-bold text-[#141413]">
                    ${breakdown ? Math.round(breakdown.borough_baseline_usd).toLocaleString() : '—'}
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-[#E8E3D9]">
                    <div className="h-1 w-2/3 rounded-full bg-[#141413]" />
                  </div>
                </div>

                <div className="rounded-xl border border-[#EFECE5] bg-[#FAF8F4] p-3">
                  <div className="truncate font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                    {prediction?.subject?.neighbourhood || form.neighbourhood}
                  </div>
                  <div className="mt-1 font-mono-label text-base font-bold text-[#D96B38]">
                    {breakdown ? formatSignedUsd(breakdown.neighbourhood_delta_usd) : '—'}
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-[#E8E3D9]">
                    <div className="h-1 w-1/2 rounded-full bg-[#D96B38]" />
                  </div>
                </div>

                <div className="rounded-xl border border-[#EFECE5] bg-[#FAF8F4] p-3">
                  <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                    Capacity & Layout
                  </div>
                  <div className="mt-1 font-mono-label text-base font-bold text-[#141413]">
                    {breakdown ? formatSignedUsd(breakdown.capacity_layout_delta_usd) : '—'}
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-[#E8E3D9]">
                    <div className="h-1 w-1/2 rounded-full bg-[#141413]" />
                  </div>
                </div>

                <div className="rounded-xl border border-[#EFECE5] bg-[#FAF8F4] p-3">
                  <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#7A756C]">
                    Active Amenities
                  </div>
                  <div className="mt-1 font-mono-label text-base font-bold text-[#D96B38]">
                    {breakdown ? formatSignedUsd(breakdown.active_amenities_delta_usd) : '—'}
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-[#E8E3D9]">
                    <div className="h-1 w-3/5 rounded-full bg-[#D96B38]" />
                  </div>
                </div>
              </div>

              {/* Ranked Top 5 Host-Deduplicated Comparable Listings */}
              <div className="mt-4 overflow-hidden rounded-2xl border border-[#E8E3D9] bg-[#FAF8F4]/50">
                <div className="flex items-center justify-between border-b border-[#E8E3D9] bg-[#FAF8F4] px-4 py-2.5">
                  <span className="font-mono-label text-[10px] font-semibold uppercase tracking-wider text-[#7A756C]">
                    TOP 5 HOST-DEDUPLICATED COMPARABLES
                  </span>
                  <span className="font-mono-label text-[10px] text-[#7A756C]">
                    {compsMeta ? `${compsMeta.hidden_duplicates} multi-unit duplicates suppressed` : ''}
                  </span>
                </div>

                <div className="divide-y divide-[#EFECE5] bg-white">
                  {topComps.map((comp, idx) => {
                    const pred = prediction?.predicted_price || 0
                    const pctDiff = pred > 0 ? ((comp.price_num - pred) / pred) * 100 : 0
                    const pctSign = pctDiff >= 0 ? '+' : ''
                    return (
                      <div
                        key={comp.id}
                        className="flex flex-col justify-between gap-2.5 px-4 py-3 transition hover:bg-[#FAF8F4]/70 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-[#141413] font-mono-label text-[11px] font-semibold text-white">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#141413]">
                              {comp.name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono-label text-[11px] text-[#6B675E]">
                              <span>
                                {comp.neighbourhood} · {comp.geo_km.toFixed(2)} km
                              </span>
                              <span className="text-[#C9C2B6]">|</span>
                              <span>{formatSpecs(comp)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                          <span className="rounded-full border border-[#E9A686] bg-[#FDF3EE] px-2.5 py-0.5 font-mono-label text-[11px] font-semibold text-[#D96B38]">
                            {comp.similarity_pct.toFixed(1)}% match
                          </span>
                          <div className="min-w-[96px] text-right">
                            <div className="font-mono-label text-sm font-bold text-[#141413]">
                              ${Math.round(comp.price_num).toLocaleString()}
                              <span className="text-[11px] font-normal text-[#7A756C]"> / nt</span>
                            </div>
                            <div
                              className={`font-mono-label text-[10px] font-medium ${
                                pctDiff >= 0 ? 'text-[#D96B38]' : 'text-[#5C5953]'
                              }`}
                            >
                              {pctSign}
                              {pctDiff.toFixed(1)}% vs pred
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {topComps.length === 0 && (
                    <div className="px-4 py-6 text-center font-mono-label text-xs text-[#7A756C]">
                      No comparable listings returned.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
