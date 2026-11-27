import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../api'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Check, Copy, ShieldCheck } from 'lucide-react'

function ValidationTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-xl border border-[#E8E3D9] bg-[#141413] px-3 py-2 text-xs text-white shadow-lg">
      <div className="font-mono-label text-[10px] text-[#A8A39B]">{label}</div>
      <div className="mt-0.5 font-mono-label text-xs font-semibold text-white">
        {payload[0].value}
        {suffix}
      </div>
    </div>
  )
}

export default function ModelValidation({ onValidationDataChange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadValidation() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/api/validation`)
        if (!res.ok) throw new Error(`GET /api/validation failed (${res.status})`)
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          onValidationDataChange?.(json)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadValidation()
    return () => {
      cancelled = true
    }
  }, [onValidationDataChange])

  const featureData = useMemo(() => {
    if (!data?.feature_importances) return []
    return [...data.feature_importances].slice(0, 10).reverse()
  }, [data])

  const residualData = useMemo(() => {
    if (!data?.residual_bins) return []
    return data.residual_bins.map((b) => ({
      ...b,
      label: b.mid >= 0 ? `+${b.mid.toFixed(2)}` : b.mid.toFixed(2),
    }))
  }, [data])

  const meanBinLabel = useMemo(() => {
    if (!residualData.length || data?.residual_hist?.mean == null) return null
    const meanVal = data.residual_hist.mean
    let best = residualData[0]
    let bestDiff = Infinity
    for (const b of residualData) {
      const diff = Math.abs(b.mid - meanVal)
      if (diff < bestDiff) {
        bestDiff = diff
        best = b
      }
    }
    return best?.label || null
  }, [data, residualData])

  const handleCopySnippet = async () => {
    if (!data?.inference_snippet) return
    try {
      await navigator.clipboard.writeText(data.inference_snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback textarea copy
      const ta = document.createElement('textarea')
      ta.value = data.inference_snippet
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const funnel = data?.data_funnel
  const leaderboard = data?.cv_leaderboard || []

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-6 sm:px-6">
      {/* Editorial Hero Header */}
      <div className="flex flex-col justify-between gap-4 pb-6 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D96B38]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#D96B38]" />
            <span>HOST-ISOLATED {data?.model_name?.toUpperCase() || 'CATBOOST'} REGRESSION · AUDITABLE METRICS</span>
          </div>
          <h1 className="mt-1.5 font-serif-display text-4xl leading-[1.03] tracking-tight text-[#141413] sm:text-5xl">
            {data?.feature_count ?? 29} signals.{' '}
            <span className="italic text-[#5C5953]">Zero host leakage.</span>
          </h1>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            Target: {data?.target_transform || 'log1p(price)'} · {data?.cv_folds ?? 5}-Fold GroupKFold by host_id
          </div>
        </div>

        {/* Ground Truth Corpus Card */}
        <div className="w-full max-w-sm rounded-2xl border border-[#E8E3D9] bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]">
              Ground Truth Corpus
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FAF8F4] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-[#141413]">
              <ShieldCheck className="h-3 w-3 text-[#D96B38]" /> STRICT
            </span>
          </div>
          <div className="mt-1.5 font-mono-label text-xs font-semibold text-[#141413]">
            {funnel
              ? `${funnel.unique_hosts.toLocaleString()} hosts · ${funnel.cleaned_rows.toLocaleString()} listings`
              : 'Loading corpus...'}
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#141413] px-3 py-1.5 font-mono-label text-[10px] uppercase tracking-wider text-[#F5F2EC]">
            <span>Train/Holdout Isolation</span>
            <span className="text-[#D96B38]">
              {funnel ? `${funnel.host_overlap_pct.toFixed(2)}% LEAK` : '0.00% LEAK'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Top 4 Validation KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
              01 / GROUPKFOLD CV RMSE
            </span>
            <span className="rounded-full bg-[#FAF8F4] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-[#6B675E]">
              {data?.cv_folds ?? 5} FOLDS
            </span>
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            ${data ? data.cv_log_rmse.toFixed(2) : '—'}
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            5-Fold GroupKFold mean RMSE ($)
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
              02 / HOLDOUT R²
            </span>
            <span className="rounded-full bg-[#FDF3EE] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-[#D96B38]">
              HOLDOUT
            </span>
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            {data ? data.holdout_r2.toFixed(4) : '—'}
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#D96B38]">
            {funnel ? `${funnel.host_overlap_pct.toFixed(2)}% host leakage verified` : '0.00% host overlap'}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E8E3D9] bg-white p-5 shadow-[0_2px_12px_rgba(20,20,19,0.03)]">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#7A756C]">
              03 / MEDIAN ABS % ERROR
            </span>
            <span className="rounded-full bg-[#FAF8F4] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-[#6B675E]">
              ROBUST
            </span>
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-[#141413]">
            {data ? `${data.holdout_mdape_pct.toFixed(2)}%` : '—'}
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#7A756C]">
            Holdout MAE: ${data ? data.holdout_mae_usd.toFixed(2) : '—'}
          </div>
        </div>

        {/* Dark Calibrated Coverage Card */}
        <div className="rounded-[20px] bg-[#141413] p-5 text-[#F5F2EC] shadow-md">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-[10px] uppercase tracking-[0.1em] text-[#A8A39B]">
              04 / CALIBRATED COVERAGE
            </span>
            <span className="rounded-full bg-[#D96B38] px-2 py-0.5 font-mono-label text-[9px] font-semibold text-white">
              EMPIRICAL
            </span>
          </div>
          <div className="mt-2 font-sans text-3xl font-bold tracking-tight text-white">
            {data ? `${data.calibrated_coverage_pct.toFixed(1)}%` : '—'}
          </div>
          <div className="mt-2 font-mono-label text-[11px] text-[#D96B38]">
            {data
              ? `Multipliers: ${data.fair_range_low_mult}× to ${data.fair_range_high_mult}×`
              : 'Calibrated holdout interval'}
          </div>
        </div>
      </section>

      {/* Row 1 Charts: Global Feature Importance + Holdout Residual Histogram */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 05 / Global Feature Importance */}
        <div className="rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                05 / GLOBAL ATTRIBUTION
              </div>
              <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
                Top 10 Feature Importance (%)
              </h2>
            </div>
            <span className="rounded-full bg-[#FDF3EE] px-2.5 py-1 font-mono-label text-[10px] font-semibold text-[#D96B38]">
              CatBoost Split Gain
            </span>
          </div>

          <div className="mt-4 h-[300px] w-full">
            {loading ? (
              <div className="estiance-shimmer h-full w-full rounded-2xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={featureData}
                  layout="vertical"
                  margin={{ top: 6, right: 20, left: 24, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE5" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: '#E8E3D9' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="feature"
                    width={140}
                    tick={{ fontSize: 10, fill: '#141413', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ValidationTooltip suffix="%" />} />
                  <Bar dataKey="pct" fill="#D96B38" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 06 / Holdout Residual Distribution (Log Space) */}
        <div className="rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                06 / CALIBRATION RESIDUALS
              </div>
              <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
                Holdout Residual Distribution (Log Space)
              </h2>
            </div>
            <span className="rounded-full bg-[#FAF8F4] px-2.5 py-1 font-mono-label text-[10px] font-semibold text-[#141413]">
              Mean μ = {data?.residual_hist ? data.residual_hist.mean.toFixed(4) : '—'}
            </span>
          </div>

          <div className="mt-4 h-[300px] w-full">
            {loading ? (
              <div className="estiance-shimmer h-full w-full rounded-2xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={residualData} margin={{ top: 18, right: 12, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE5" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: '#E8E3D9' }}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#7A756C', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ValidationTooltip suffix=" listings" />} />
                  {meanBinLabel && (
                    <ReferenceLine
                      x={meanBinLabel}
                      stroke="#D96B38"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{
                        value: `μ=${data.residual_hist.mean}`,
                        position: 'top',
                        fill: '#D96B38',
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono',
                      }}
                    />
                  )}
                  <Bar dataKey="count" fill="#141413" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Row 2: 8-Model CV Leaderboard Table + Joblib Inference Snippet */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 07 / 8-Model Host-Grouped CV Leaderboard */}
        <div className="rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                07 / BENCHMARK AUDIT
              </div>
              <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
                8-Model Host-Grouped CV Leaderboard
              </h2>
            </div>
            <span className="font-mono-label text-[10px] text-[#7A756C]">
              5-Fold GroupKFold · Sorted by CV RMSE
            </span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-[#EFECE5]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E8E3D9] bg-[#FAF8F4] font-mono-label text-[10px] uppercase tracking-wider text-[#7A756C]">
                  <th className="px-3.5 py-2.5">Rank</th>
                  <th className="px-3.5 py-2.5">Model</th>
                  <th className="px-3.5 py-2.5 text-right">CV MAE ($)</th>
                  <th className="px-3.5 py-2.5 text-right">CV RMSE ($)</th>
                  <th className="px-3.5 py-2.5 text-right">CV R²</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE5] text-xs">
                {leaderboard.map((row, idx) => {
                  const isBest = row.Model === (data?.model_name || 'CatBoost')
                  return (
                    <tr
                      key={row.Model}
                      className={isBest ? 'bg-[#FDF6F2]' : 'bg-white hover:bg-[#FAF8F4]/70'}
                    >
                      <td className="px-3.5 py-2.5 font-mono-label text-[11px] font-semibold text-[#7A756C]">
                        #{idx + 1}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-[#141413]">
                        <div className="flex items-center gap-2">
                          <span>{row.Model}</span>
                          {isBest && (
                            <span className="rounded-full bg-[#D96B38] px-2 py-0.5 font-mono-label text-[9px] font-semibold uppercase text-white">
                              Selected
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono-label text-[#141413]">
                        ${row['CV MAE Mean ($)']?.toFixed(2)}{' '}
                        <span className="text-[10px] text-[#7A756C]">
                          ±{row['CV MAE Std ($)']?.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono-label font-semibold text-[#141413]">
                        ${row['CV RMSE Mean ($)']?.toFixed(2)}{' '}
                        <span className="text-[10px] font-normal text-[#7A756C]">
                          ±{row['CV RMSE Std ($)']?.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono-label font-semibold text-[#D96B38]">
                        {row['CV R2 Mean']?.toFixed(4)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 08 / Production Joblib Inference Snippet */}
        <div className="flex flex-col justify-between rounded-[22px] border border-[#E8E3D9] bg-white p-6 shadow-[0_2px_12px_rgba(20,20,19,0.03)] lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-mono-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
                  08 / RUNTIME INTEGRATION
                </div>
                <h2 className="mt-1 font-serif-display text-2xl text-[#141413]">
                  Joblib Inference Snippet
                </h2>
              </div>

              <button
                type="button"
                onClick={handleCopySnippet}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E0DAD0] bg-[#FAF8F4] px-3 py-1.5 font-mono-label text-[11px] font-semibold text-[#141413] transition hover:border-[#141413] cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#D96B38]" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button>
            </div>

            <pre className="mt-4 overflow-x-auto rounded-2xl bg-[#141413] p-4 font-mono-label text-[11px] leading-relaxed text-[#F5F2EC]">
              <code>{data?.inference_snippet || '# Loading snippet...'}</code>
            </pre>
          </div>

          <div className="mt-4 rounded-xl border border-[#EFECE5] bg-[#FAF8F4] px-3.5 py-2.5 font-mono-label text-[11px] text-[#6B675E]">
            Loads <code className="text-[#141413]">artifacts_ml/best_price_model.joblib</code> with the scikit-learn <code className="text-[#141413]">_RemainderColsList</code> patch and applies <code className="text-[#141413]">expm1</code> inversion.
          </div>
        </div>
      </section>
    </main>
  )
}
