import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from './api'
import Navbar from './components/Navbar'
import PricingStudio from './components/PricingStudio'
import CompsDossier from './components/CompsDossier'
import MarketAnalytics from './components/MarketAnalytics'
import ModelValidation from './components/ModelValidation'
import ProofFooter from './components/ProofFooter'

function buildInitialAmenities(meta, roomType) {
  const map = {}
  ;(meta?.amenity_definitions || []).forEach((item) => {
    if (item.key === 'amen_kitchen') {
      map[item.key] = roomType === 'Entire home/apt' ? 1 : 0
    } else {
      map[item.key] = item.default_enabled ? 1 : 0
    }
  })
  return map
}

function downloadCsv(filename, headers, rows) {
  const escapeCsv = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [activeTab, setActiveTab] = useState('studio')
  const [meta, setMeta] = useState(null)
  const [metaError, setMetaError] = useState(null)
  const [draftForm, setDraftForm] = useState(null)
  const [lastPredictedForm, setLastPredictedForm] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [predictLoading, setPredictLoading] = useState(false)
  const [predictError, setPredictError] = useState(null)

  const [dossierData, setDossierData] = useState(null)
  const [marketData, setMarketData] = useState(null)
  const [validationData, setValidationData] = useState(null)
  const requestSeqRef = useRef(0)

  const runPredict = useCallback(async (payloadForm, { minDelayMs = 650 } = {}) => {
    if (!payloadForm) return
    const seq = ++requestSeqRef.current
    setPredictLoading(true)
    setPredictError(null)
    const snapshot = JSON.parse(JSON.stringify(payloadForm))

    try {
      const fetchPromise = fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...snapshot,
          top_k: 8,
          dedup_host: true,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`POST /api/predict failed (${res.status}): ${errText}`)
        }
        return res.json()
      })

      const delayPromise =
        minDelayMs > 0
          ? new Promise((resolve) => setTimeout(resolve, minDelayMs))
          : Promise.resolve()

      const [data] = await Promise.all([fetchPromise, delayPromise])
      if (seq === requestSeqRef.current) {
        setPrediction(data)
        setLastPredictedForm(snapshot)
      }
    } catch (err) {
      if (seq === requestSeqRef.current) {
        setPredictError(err.message)
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setPredictLoading(false)
      }
    }
  }, [])

  // Load metadata once and trigger one initial prediction on mount
  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      try {
        const res = await fetch(`${API_BASE}/api/meta`)
        if (!res.ok) throw new Error(`GET /api/meta failed (${res.status})`)
        const data = await res.json()
        if (cancelled) return

        const defaultBorough = data.boroughs.includes('Manhattan')
          ? 'Manhattan'
          : data.boroughs[0]
        const hoods = data.borough_to_neighbourhoods[defaultBorough] || []
        const defaultHood = hoods.includes('Midtown') ? 'Midtown' : hoods[0]
        const defaultRoom = data.room_types.includes('Entire home/apt')
          ? 'Entire home/apt'
          : data.room_types[0]
        const defaultProp = data.property_types.includes('Entire rental unit')
          ? 'Entire rental unit'
          : data.property_types[0]

        const initialForm = {
          borough: defaultBorough,
          neighbourhood: defaultHood,
          room_type: defaultRoom,
          property_type: defaultProp,
          accommodates: 2,
          bedrooms: 1,
          beds: 1,
          bathrooms: 1.0,
          min_nights: Math.round(data.defaults?.minimum_nights ?? 30),
          amenity_count: Math.round(data.defaults?.amenity_count ?? 31),
          amenities: buildInitialAmenities(data, defaultRoom),
        }

        setMeta(data)
        setDraftForm(initialForm)
        runPredict(initialForm, { minDelayMs: 0 })
      } catch (err) {
        if (!cancelled) setMetaError(err.message)
      }
    }
    loadMeta()
    return () => {
      cancelled = true
    }
  }, [runPredict])

  const handleUpdateForm = useCallback(
    (key, value) => {
      setDraftForm((prev) => {
        if (!prev) return prev
        if (key === 'borough') {
          const nextHoods = meta?.borough_to_neighbourhoods?.[value] || []
          const nextHood = nextHoods.includes(prev.neighbourhood)
            ? prev.neighbourhood
            : nextHoods[0] || ''
          return { ...prev, borough: value, neighbourhood: nextHood }
        }
        return { ...prev, [key]: value }
      })
    },
    [meta]
  )

  const handleToggleAmenity = useCallback((amenKey) => {
    setDraftForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        amenities: {
          ...prev.amenities,
          [amenKey]: prev.amenities[amenKey] ? 0 : 1,
        },
      }
    })
  }, [])

  const isDirty = useMemo(() => {
    if (!draftForm || !lastPredictedForm) return false
    return JSON.stringify(draftForm) !== JSON.stringify(lastPredictedForm)
  }, [draftForm, lastPredictedForm])

  const handlePredictClick = useCallback(() => {
    if (!draftForm || predictLoading) return
    runPredict(draftForm, { minDelayMs: 680 })
  }, [draftForm, predictLoading, runPredict])

  const currentCoords = useMemo(() => {
    if (!meta || !draftForm) return null
    return meta.hood_coords?.[draftForm.borough]?.[draftForm.neighbourhood] || null
  }, [meta, draftForm])

  const exportCompsList = useCallback((sourceData, prefix) => {
    if (!sourceData?.comps?.length) return
    const headers = [
      'estiance_predicted_rate',
      'fair_range_low',
      'fair_range_high',
      'comp_id',
      'host_id',
      'name',
      'borough',
      'neighbourhood',
      'room_type',
      'property_type',
      'accommodates',
      'bedrooms',
      'beds',
      'bathrooms',
      'amenity_count',
      'price_num',
      'geo_km',
      'similarity_pct',
      'latitude',
      'longitude',
    ]
    const rows = sourceData.comps.map((c) => [
      sourceData.predicted_price,
      sourceData.fair_range.low,
      sourceData.fair_range.high,
      c.id,
      c.host_id,
      c.name,
      c.borough,
      c.neighbourhood,
      c.room_type,
      c.property_type,
      c.accommodates,
      c.bedrooms,
      c.beds,
      c.bathrooms,
      c.amenity_count,
      c.price_num,
      c.geo_km,
      c.similarity_pct,
      c.latitude,
      c.longitude,
    ])
    const hoodSlug = (sourceData.subject?.neighbourhood || 'nyc')
      .toLowerCase()
      .replace(/\s+/g, '_')
    downloadCsv(`estiance_${hoodSlug}_${prefix}.csv`, headers, rows)
  }, [])

  const handleExportDossierCsv = useCallback(() => {
    exportCompsList(dossierData || prediction, 'comps_dossier')
  }, [dossierData, prediction, exportCompsList])

  const handleFooterExport = useCallback(() => {
    if (activeTab === 'studio') {
      exportCompsList(prediction, 'pricing')
    } else if (activeTab === 'comps') {
      exportCompsList(dossierData || prediction, 'comps_dossier')
    } else if (activeTab === 'market' && marketData) {
      const headers = ['section', 'label', 'value', 'secondary', 'count']
      const q = marketData.quantiles
      const rows = [
        ['quantile', 'P25', q.p25, 'USD', marketData.listing_count],
        ['quantile', 'P50 (Median)', q.p50, 'USD', marketData.listing_count],
        ['quantile', 'P75', q.p75, 'USD', marketData.listing_count],
        ['quantile', 'P90', q.p90, 'USD', marketData.listing_count],
        ['quantile', 'Mean', q.mean, 'USD', marketData.listing_count],
        ...marketData.room_type_medians.map((r) => [
          'room_type',
          r.room_type,
          r.median_price,
          `mean=${r.mean_price}`,
          r.count,
        ]),
        ...marketData.capacity_curve.map((c) => [
          'capacity',
          `${c.accommodates}_guests`,
          c.median_price,
          `per_guest=${c.price_per_guest}`,
          c.count,
        ]),
      ]
      const hoodSlug = marketData.neighbourhood.toLowerCase().replace(/\s+/g, '_')
      downloadCsv(`estiance_${hoodSlug}_market.csv`, headers, rows)
    } else if (activeTab === 'validation' && validationData?.cv_leaderboard?.length) {
      const headers = [
        'Model',
        'CV MAE Mean ($)',
        'CV MAE Std ($)',
        'CV RMSE Mean ($)',
        'CV RMSE Std ($)',
        'CV R2 Mean',
      ]
      const rows = validationData.cv_leaderboard.map((r) =>
        headers.map((h) => r[h])
      )
      downloadCsv('estiance_cv_leaderboard.csv', headers, rows)
    }
  }, [activeTab, prediction, dossierData, marketData, validationData, exportCompsList])

  const footerExportConfig = useMemo(() => {
    if (activeTab === 'studio') {
      return {
        label: 'Export Pricing & Comps (.csv)',
        canExport: Boolean(prediction?.comps?.length),
      }
    }
    if (activeTab === 'comps') {
      return {
        label: 'Export Clean Comps Dossier (.csv)',
        canExport: Boolean((dossierData || prediction)?.comps?.length),
      }
    }
    if (activeTab === 'market') {
      return {
        label: 'Export Market Intelligence (.csv)',
        canExport: Boolean(marketData),
      }
    }
    return {
      label: 'Export CV Leaderboard (.csv)',
      canExport: Boolean(validationData?.cv_leaderboard?.length),
    }
  }, [activeTab, prediction, dossierData, marketData, validationData])

  if (metaError) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="font-serif-display text-3xl text-[#141413]">Backend Connection Error</h1>
        <p className="mt-2 text-sm text-red-700">{metaError}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F2EC] text-[#141413]">
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        meta={meta}
        borough={draftForm?.borough || 'Manhattan'}
        neighbourhood={draftForm?.neighbourhood || 'Midtown'}
        coords={currentCoords}
      />

      {!draftForm ? (
        <main className="mx-auto max-w-[1320px] px-4 pt-10 sm:px-6">
          <div className="rounded-[22px] border border-[#E8E3D9] bg-white p-10 text-center">
            <div className="font-mono-label text-xs uppercase tracking-widest text-[#7A756C]">
              Loading CatBoost Engine &amp; 21,515 NYC Listings...
            </div>
          </div>
        </main>
      ) : activeTab === 'studio' ? (
        <PricingStudio
          meta={meta}
          form={draftForm}
          onUpdateForm={handleUpdateForm}
          onToggleAmenity={handleToggleAmenity}
          onPredict={handlePredictClick}
          isDirty={isDirty}
          prediction={prediction}
          loading={predictLoading}
          error={predictError}
          onViewAllComps={() => setActiveTab('comps')}
        />
      ) : activeTab === 'comps' ? (
        <CompsDossier
          form={draftForm}
          basePrediction={prediction}
          onDossierDataChange={setDossierData}
          onExportCsv={handleExportDossierCsv}
        />
      ) : activeTab === 'market' ? (
        <MarketAnalytics form={draftForm} onMarketDataChange={setMarketData} />
      ) : (
        <ModelValidation onValidationDataChange={setValidationData} />
      )}

      <ProofFooter
        meta={meta}
        onExportCsv={handleFooterExport}
        exportLabel={footerExportConfig.label}
        canExport={footerExportConfig.canExport}
      />
    </div>
  )
}
