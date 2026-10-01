import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

// ---------------------------------------------------------------------------
// Data: the three JSON files copied from the research pipeline
// ---------------------------------------------------------------------------
import rawData from '../data/real-estate-data.json'     // metros, cheap-proxy dragnet
import finalData from '../data/real-estate-final.json'  // top-18 composite
import brrrData from '../data/real-estate-brrr.json'    // BRRR underwrite

// ---------------------------------------------------------------------------
// Weighted scoring model. Defaults match the framework: weights sum to 100.
// Each weight is user-adjustable; metro scores recompute live.
// ---------------------------------------------------------------------------
const CRITERIA = [
  { key: 'cash_flow',        label: 'Cash-flow ratio (net-per-door / 1% test)',  def: 18, metric: m => m.metricCashFlow },
  { key: 'landlord',         label: 'Landlord-friendly state',                   def: 13, metric: m => m.landlord_friendly },
  { key: 'vacancy_yield',    label: 'Vacancy-adjusted yield',                    def: 11, metric: m => m.metricVacancyYield },
  { key: 'buy_below',        label: 'Buy-below-market room',                     def: 10, metric: m => m.metricBuyBelow },
  { key: 'unknown',          label: 'Unknown-ness score',                        def: 10, metric: m => m.metricUnknown },
  { key: 'rent_price',       label: 'Rent-to-price ratio',                       def: 8,  metric: m => m.metricRentPrice },
  { key: 'pop_growth',       label: 'Population growth (5-yr)',                  def: 7,  metric: m => m.metricPopGrowth },
  { key: 'appreciation',     label: 'Appreciation stability (5/10-yr)',          def: 5,  metric: m => m.metricAppr },
  { key: 'price_income',     label: 'Price-to-income (affordability)',           def: 4,  metric: m => m.metricPriceIncome },
  { key: 'tax_ins',          label: 'Tax + insurance per $100 rent',             def: 4,  metric: m => m.metricTax },
  { key: 'employ_div',       label: 'Employment diversity',                      def: 3,  metric: m => m.metricEmp },
  { key: 'renter',           label: 'Renter % (tenure)',                         def: 2,  metric: m => m.metricRenter },
  { key: 'internet',         label: 'Internet speed',                            def: 2,  metric: m => m.metricInternet },
  { key: 'rent_growth',      label: 'Rent-growth stability',                     def: 2,  metric: m => m.metricRentGrowth },
  { key: 'climate',          label: 'Climate/disaster exposure',                 def: 1,  metric: m => m.metricClimate },
]

// Default weights dict
const DEFAULTS = Object.fromEntries(CRITERIA.map(c => [c.key, c.def]))

// ---------------------------------------------------------------------------
// Metric normalization (higher = better), computed over a metro population
// ---------------------------------------------------------------------------
const median = arr => {
  const v = [...arr].sort((a, b) => a - b)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// Build a 0..1 normalized score for a metric from a list of raw values.
// Higher raw = better unless invert (e.g. price/rent, tax).
function normalize(values, invert = false) {
  const clean = values.filter(v => v != null && !Number.isNaN(v))
  if (clean.length === 0) return values.map(() => 0.5)
  const med = median(clean)
  // impute missing as median
  const filled = values.map(v => (v == null || Number.isNaN(v)) ? med : v)
  const lo = Math.min(...filled)
  const hi = Math.max(...filled)
  const range = hi - lo
  if (range === 0) return filled.map(() => 0.5)
  const normed = filled.map(v => (v - lo) / range)
  return invert ? normed.map(v => 1 - v) : normed
}

// ---------------------------------------------------------------------------
// Build an enriched metro row with both raw data and a live-scored composite.
// Uses the converted DRAGNET dataset (real-estate-data.json) which holds the
// metrics needed to compute every criterion. Deep-dive/final data (when present)
// overrides individual metrics so the top-18 reflect their ground-truth values.
// ---------------------------------------------------------------------------
// Build the full metro list once (enriching with override data keyed by city+state)
function buildMetros() {
  const finalByKey = new Map()
  for (const r of finalData) finalByKey.set(`${r.city}|${r.state}`, r)
  const brrrByKey = new Map()
  for (const r of brrrData) brrrByKey.set(`${r.city}|${r.state}`, r)

  const metros = rawData.map(m => ({ ...m }))

  // --- population-wide raw vectors (for normalization) ---
  const rent = metros.map(m => m.median_monthly_rent)
  const price = metros.map(m => m.median_home_price)
  const vacancy = metros.map(m => m.vacancy_rate_pct !== null ? m.vacancy_rate_pct : 10)

  const grossYields  = metros.map((_, i) => rent[i] && price[i] ? rent[i]*12/price[i]*100 : null)
  const vacancyYields= metros.map((_, i) => rent[i] && price[i] ? rent[i]*12*(1-vacancy[i]/100)/price[i]*100 : null)
  const rentPrices   = metros.map((_, i) => rent[i] && price[i] ? price[i]/(rent[i]*12) : null)
  const popGrowths   = metros.map(m => m.pop_growth_5yr_pct)
  const renters      = metros.map(m => m.renter_pct)
  const internets    = metros.map(m => m.internet_speed_mbps)
  const taxes        = metros.map(m => m.property_tax_rate_pct)

  const buyBelows   = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).buy_below)
  const unknowns    = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).unknown)
  const apprs       = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).appr5)
  const priceIncomes= metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).pir)
  const rentGrowths = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).rent_growth)

  // --- pre-normalized 0..1 vectors (higher = better); invert where lower is better ---
  const N = {
    cashFlow:    normalize(grossYields),
    vacancyYield:normalize(vacancyYields),
    rentPrice:   normalize(rentPrices, true),
    popGrowth:   normalize(popGrowths),
    renter:      normalize(renters),
    internet:    normalize(internets),
    tax:         normalize(taxes, true),
    buyBelow:    normalize(buyBelows),
    unknown:     normalize(unknowns),
    appr:        normalize(apprs),
    priceIncome: normalize(priceIncomes, true),
    rentGrowth:  normalize(rentGrowths),
  }

  return metros.map((m, i) => {
    const finalRow = finalByKey.get(`${m.city}|${m.state}`)
    const brrrRow  = brrrByKey.get(`${m.city}|${m.state}`)
    return {
      ...m,
      metricCashFlow: N.cashFlow[i],
      metricVacancyYield: N.vacancyYield[i],
      metricRentPrice: N.rentPrice[i],
      landlord_friendly: m.landlord_friendly,
      metricPopGrowth: N.popGrowth[i],
      metricBuyBelow: N.buyBelow[i],
      metricUnknown: N.unknown[i],
      metricAppr: N.appr[i],
      metricPriceIncome: N.priceIncome[i],
      metricEmp: finalRow ? finalRow.emp : 0.5,
      metricRenter: N.renter[i],
      metricInternet: N.internet[i],
      metricRentGrowth: N.rentGrowth[i],
      metricTax: N.tax[i],
      metricClimate: finalRow ? finalRow.clim : 0.5,
      grossYield: grossYields[i],
      vacancyYield: vacancyYields[i],
      rentPrice: rentPrices[i],
      brrrNetMonthly: brrrRow ? brrrRow.net_monthly_after_debt : null,
      buyPrice: brrrRow ? brrrRow.buy : null,
      appr5: finalRow ? finalRow.appr5 : null,
      pir: finalRow ? finalRow.pir : null,
    }
  })
}

const METROS = buildMetros()

// ---------------------------------------------------------------------------
// Scoring: given a weights dict, compute composite for every metro (0..100)
// ---------------------------------------------------------------------------
function scoreMetro(metro, weights) {
  let s = 0
  for (const c of CRITERIA) {
    const val = c.metric(metro)
    s += weights[c.key] * val
  }
  return s
}

function computeScores(weights) {
  return METROS.map(m => ({ ...m, composite: scoreMetro(m, weights) }))
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
const fmt = (v, p = 0) => v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: p })

const FMT_MONEY = v => v === null || v === undefined ? '—' : '$' + v.toLocaleString('en-US')

function WeightPanel({ weights, onWeight }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  return (
    <aside className="weights">
      <h2>Criteria Weights</h2>
      <p className="muted">Drag to adjust — the table re-sorts live. Weights sum to <b>{total}</b>.</p>
      {CRITERIA.map(c => (
        <div className="weight-item" key={c.key}>
          <div className="weight-head">
            <span className="weight-label">{c.label}</span>
            <input className="weight-num" type="number" min="0" max="50" step="1"
                   value={weights[c.key]}
                   onChange={e => onWeight(c.key, Math.max(0, parseInt(e.target.value || '0')))}
                   onBlur={e => onWeight(c.key, Math.max(0, parseInt(e.target.value || '0')))} />
          </div>
          <input type="range" className="weight-slider" min="0" max="40" step="1"
                 value={weights[c.key]}
                 onChange={e => onWeight(c.key, parseInt(e.target.value))} />
        </div>
      ))}
      <div className="weight-actions">
        <button onClick={() => Object.keys(weights).forEach(k => onWeight(k, DEFAULTS[k]))}>Reset to default</button>
      </div>
    </aside>
  )
}

function MetroTable({ metros, state }) {
  return (
    <table className="metro-table">
      <thead>
        <tr>
          <th>#</th>
          <th>City</th>
          <th>St</th>
          <th className="num">Score</th>
          <th className="num">Price</th>
          <th className="num">Rent</th>
          <th className="num">Gross Yield</th>
          <th className="num">Vac-Yield</th>
          <th className="num">Net $/door</th>
          <th className="num">Unknown</th>
          <th className="num">Appr 5yr</th>
          <th className="num">P/I</th>
        </tr>
      </thead>
      <tbody>
        {metros.map((m, i) => (
          <tr key={`${m.city}-${m.state}-${i}`}>
            <td className="dim">{i + 1}</td>
            <td className="strong">{m.city}</td>
            <td>{m.state}</td>
            <td className="num strong">{fmt(m.composite, 1)}</td>
            <td className="num">{FMT_MONEY(m.median_home_price)}</td>
            <td className="num">{FMT_MONEY(m.median_monthly_rent)}</td>
            <td className="num">{m.grossYield !== null ? m.grossYield.toFixed(1) + '%' : '—'}</td>
            <td className="num">{m.vacancyYield !== null ? m.vacancyYield.toFixed(1) + '%' : '—'}</td>
            <td className="num">{m.brrrNetMonthly !== null ? FMT_MONEY(m.brrrNetMonthly) : '—'}</td>
            <td className="num">{m.metricUnknown !== null ? fmt(m.metricUnknown, 2) : '—'}</td>
            <td className="num">{m.appr5 ? m.appr5.toFixed(1) + '%' : '—'}</td>
            <td className="num">{m.pir ? fmt(m.pir, 1) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function App() {
  const [weights, setWeights] = useState({ ...DEFAULTS })
  const [stateFilter, setStateFilter] = useState('ALL')
  const [metroFilter, setMetroFilter] = useState('')      // '' = all, 'final' = top18 only
  const [limit, setLimit] = useState(50)

  const scored = computeScores(weights)
  scored.sort((a, b) => b.composite - a.composite)

  // filters
  const stateList = [...new Set(METROS.map(m => m.state))].sort()

  let view = scored
  if (stateFilter !== 'ALL') view = view.filter(m => m.state === stateFilter)
  if (metroFilter === 'final') {
    const finalKeys = new Set(finalData.map(r => `${r.city}|${r.state}`))
    view = view.filter(m => finalKeys.has(`${m.city}|${m.state}`))
  }
  view = view.slice(0, limit)

  const onWeight = (k, v) => setWeights(prev => ({ ...prev, [k]: v }))

  return (
    <div className="app">
      <header className="hero">
        <h1>Hidden Markets <span className="accent">· Real Estate Research</span></h1>
        <p className="sub">
          214 US metros · live-weighted composite scoring · drag any criterion weight to re-sort
        </p>
      </header>

      <div className="layout">
        <WeightPanel weights={weights} onWeight={onWeight} />

        <main className="table-area">
          <div className="toolbar">
            <label className="muted">State
              <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
                <option value="ALL">All</option>
                {stateList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="muted">Scope
              <select value={metroFilter} onChange={e => setMetroFilter(e.target.value)}>
                <option value="">All metros</option>
                <option value="final">Top-18 deep-dive only</option>
              </select>
            </label>
            <label className="muted">Rows
              <select value={limit} onChange={e => setLimit(parseInt(e.target.value))}>
                {[25, 50, 100, 214].map(n => <option key={n} value={n}>{n === 214 ? 'All' : n}</option>)}
              </select>
            </label>
            <span className="count">{view.length} shown</span>
          </div>

          <MetroTable metros={view} state={stateFilter} />

          {view.length === 0 && <p className="empty">No metros match the current filters.</p>}
        </main>
      </div>

      <footer className="footer">
              Data snapshot 2026-09-29 · weighted composite (15 criteria, sum of weights) · BRRR underwrite at 75% LTV /  ️6.66% 30-yr
            </footer>
          </div>
        )
      }

      // Mount the app to the DOM (GitHub Pages static host expects self-mounting entry)
      const container = document.getElementById('root')
      if (container) createRoot(container).render(<App />)