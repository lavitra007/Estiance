import { Download } from 'lucide-react'

export default function ProofFooter({ meta, onExportCsv, exportLabel = 'Export Pricing & Comps (.csv)', canExport = false }) {
  const val = meta?.validation_summary
  const coverage = val?.calibrated_coverage_pct != null ? `${val.calibrated_coverage_pct.toFixed(1)}%` : '—'
  const r2 = val?.holdout_r2 != null ? val.holdout_r2.toFixed(4) : '—'
  const listings = meta?.catalog_count != null ? meta.catalog_count.toLocaleString() : '—'

  return (
    <footer className="mx-auto mt-8 max-w-[1320px] px-4 pb-8 sm:px-6">
      <div className="flex flex-col justify-between gap-5 rounded-[20px] bg-[#141413] px-6 py-5 text-[#F5F2EC] lg:flex-row lg:items-center">
        <div>
          <div className="font-mono-label text-[10px] uppercase tracking-[0.14em] text-[#A8A39B]">
            THE PROOF
          </div>
          <div className="font-serif-display text-2xl leading-tight text-white">
            {meta?.feature_count ?? 29} signals. Zero host leakage.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
            <div className="font-mono-label text-base font-semibold text-white sm:text-lg">
              {coverage}
            </div>
            <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#A8A39B]">
              Calibrated Coverage
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
            <div className="font-mono-label text-base font-semibold text-white sm:text-lg">
              {r2}
            </div>
            <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#A8A39B]">
              Holdout R² (0% Leak)
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
            <div className="font-mono-label text-base font-semibold text-white sm:text-lg">
              {listings}
            </div>
            <div className="font-mono-label text-[9px] uppercase tracking-wider text-[#A8A39B]">
              Validated NYC Listings
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onExportCsv}
          disabled={!canExport}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D96B38] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[#c55d2d] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
        >
          <Download className="h-4 w-4" />
          <span>{exportLabel}</span>
        </button>
      </div>
    </footer>
  )
}
