import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

// ---------------------------------------------------------------------------
// Data: the three JSON files copied from the research pipeline
// ---------------------------------------------------------------------------
import rawData from '../data/real-estate-data.json'     // metros, cheap-proxy dragnet (incl. deep-dive + mega-project enrich)
import finalData from '../data/real-estate-final.json'  // top-18 composite / deep-dive
import brrrData from '../data/real-estate-brrr.json'    // BRRR underwrite

// ---------------------------------------------------------------------------
// Weighted scoring model. Defaults match the framework: weights sum to 100.
// ---------------------------------------------------------------------------
const CRITERIA = [
  { key: 'cash_flow',        label: 'Cash-flow ratio (net-per-door / 1% test)',  def: 18, metric: m => m.metricCashFlow },
  { key: 'landlord',         label: 'Landlord-friendly state',                   def: 13, metric: m => m.landlord_friendly },
  { key: 'vacancy_yield',    label: 'Vacancy-adjusted yield',                    def: 11, metric: m => m.metricVacancyYield },
  { key: 'rental_vac',       label: 'Rental vacancy % (tight = good)',           def: 8,  metric: m => m.metricRentVac },
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
  { key: 'mega',             label: 'Mega-project $ (planned infra)',            def: 5,  metric: m => m.metricMega },
]

const DEFAULTS = Object.fromEntries(CRITERIA.map(c => [c.key, c.def]))

// ---------------------------------------------------------------------------
// Metric normalization (higher = better), computed over a metro population
// ---------------------------------------------------------------------------
const median = arr => {
  const v = [...arr].sort((a, b) => a - b)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

function normalize(values, invert = false) {
  const clean = values.filter(v => v != null && !Number.isNaN(v))
  if (clean.length === 0) return values.map(() => 0.5)
  const med = median(clean)
  const filled = values.map(v => (v == null || Number.isNaN(v)) ? med : v)
  const lo = Math.min(...filled)
  const hi = Math.max(...filled)
  const range = hi - lo
  if (range === 0) return filled.map(() => 0.5)
  const normed = filled.map(v => (v - lo) / range)
  return invert ? normed.map(v => 1 - v) : normed
}

// ---------------------------------------------------------------------------
// Build an enriched metro row with raw data, deep-dive overrides, display
// fields (unified across naming conventions) and live-scored composite.
// ---------------------------------------------------------------------------
function buildMetros() {
  const finalByKey = new Map()
  for (const r of finalData) finalByKey.set(`${r.city}|${r.state}`, r)
  const brrrByKey = new Map()
  for (const r of brrrData) brrrByKey.set(`${r.city}|${r.state}`, r)

  const metros = rawData.map(m => ({ ...m }))

  const rent = metros.map(m => m.median_monthly_rent)
  const price = metros.map(m => m.median_home_price)
  const vacancy = metros.map(m => m.vacancy_rate_pct !== null ? m.vacancy_rate_pct : 10)

  const grossYields  = metros.map((_, i) => rent[i] && price[i] ? rent[i]*12/price[i]*100 : null)
  const vacancyYields= metros.map((_, i) => rent[i] && price[i] ? rent[i]*12*(1-vacancy[i]/100)/price[i]*100 : null)
  const rentPrices   = metros.map((_, i) => rent[i] && price[i] ? price[i]/(rent[i]*12) : null)
  const popGrowths   = metros.map(m => m.pop_growth_5yr_pct)
  const renters      = metros.map(m => m.renter_pct)
  const rentVacs     = metros.map(m => m.vacancy_rate_pct)
  const internets    = metros.map(m => m.internet_speed_mbps)
  const taxes        = metros.map(m => m.property_tax_rate_pct)
  const megas        = metros.map(m => m.megaproject_usd_b ?? 0)

  const buyBelows   = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).buy_below)
  const unknowns    = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).unknown)
  const apprs       = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).appr5)
  const priceIncomes= metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).pir)
  const rentGrowths = metros.map(m => (finalByKey.get(`${m.city}|${m.state}`) || {}).rent_growth)

  const N = {
    cashFlow:    normalize(grossYields),
    vacancyYield:normalize(vacancyYields),
    rentPrice:   normalize(rentPrices, true),
    popGrowth:   normalize(popGrowths),
    renter:      normalize(renters),
    rentVac:     normalize(rentVacs, true),   // invert: LOW rental vacancy = tight demand = good
    internet:    normalize(internets),
    tax:         normalize(taxes, true),
    buyBelow:    normalize(buyBelows),
    unknown:     normalize(unknowns),
    appr:        normalize(apprs),
    priceIncome: normalize(priceIncomes, true),
    rentGrowth:  normalize(rentGrowths),
    mega:        normalize(megas),
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
      metricRentVac: N.rentVac[i],
      metricInternet: N.internet[i],
      metricRentGrowth: N.rentGrowth[i],
      metricTax: N.tax[i],
      metricClimate: finalRow ? finalRow.clim : 0.5,
      metricMega: N.mega[i],
      grossYield: grossYields[i],
      vacancyYield: vacancyYields[i],
      rentPrice: rentPrices[i],
      brrrNetMonthly: brrrRow ? brrrRow.net_monthly_after_debt : null,

      // ---- display fields (best available across raw / KY-enrich / top-18) ----
      dispRentalVac: m.vacancy_rate_pct ?? null,
      dispTotalVac:  m.total_vacancy_pct ?? null,
      dispRenter:    m.renter_pct ?? null,
      dispPop:       m.pop_growth_5yr_pct ?? null,
      dispLandlord:  m.landlord_friendly ?? (finalRow ? finalRow.landlord : null),
      dispInternet:  m.internet_speed_mbps ?? null,
      dispTax:       m.property_tax_rate_pct ?? (finalRow ? finalRow.tax : null),
      dispPir:       m.price_income_ratio ?? (finalRow ? finalRow.pir : null),
      dispRentPrice: rentPrices[i],   // derived on-page: price / (monthly_rent * 12)
      dispUnknown:   m.unknownness ?? (finalRow ? finalRow.unknown : null),
      dispBuyBelow:  m.buy_below_market_pct ?? (finalRow ? finalRow.buy_below : null),
      dispDom:       m.days_on_market ?? (finalRow ? finalRow.dom : null),
      dispAppr5:     m.appreciation_5yr_pct ?? (finalRow ? finalRow.appr5 : null),
      dispEmp:       m.employment_diversity ?? (finalRow ? finalRow.emp : null),
      dispClim:      m.climate_risk ?? (finalRow ? finalRow.clim : null),
      dispRentGrowth: finalRow ? finalRow.rent_growth : null,
      // planned mega-project (dollar value + name); shown only when a real project exists
      dispMegaName:  m.megaproject || null,
      dispMegaUsdB:  (m.megaproject_usd_b != null && m.megaproject_bump) ? m.megaproject_usd_b : null,
    }
  })
}

const METROS = buildMetros()

function scoreMetro(metro, weights) {
  let s = 0
  for (const c of CRITERIA) s += weights[c.key] * c.metric(metro)
  return s
}

function computeScores(weights) {
  return METROS.map(m => ({ ...m, composite: scoreMetro(m, weights) }))
}

// ---------------------------------------------------------------------------
// Column sort: a raw numeric accessor per column key. Clicking a numeric
// header's arrows sorts the whole table by that column (nulls last).
// ---------------------------------------------------------------------------
const SORT_VAL = {
  price: m => m.median_home_price,
  rent: m => m.median_monthly_rent,
  gross: m => m.grossYield,
  vac_yield: m => m.vacancyYield,
  net: m => m.brrrNetMonthly,
  rental_vac: m => m.dispRentalVac,
  total_vac: m => m.dispTotalVac,
  renter: m => m.dispRenter,
  pop: m => m.dispPop,
  landlord: m => m.dispLandlord,
  internet: m => m.dispInternet,
  tax: m => m.dispTax,
  pir: m => m.dispPir,
  rent_price: m => m.dispRentPrice,
  unknown: m => m.dispUnknown,
  buy_below: m => m.dispBuyBelow,
  dom: m => m.dispDom,
  appr5: m => m.dispAppr5,
  emp: m => m.dispEmp,
  climate: m => m.dispClim,
  mega: m => m.dispMegaUsdB,
  score: m => m.composite,
}

function sortRows(rows, key, dir) {
  const get = SORT_VAL[key]
  if (!get) return rows
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b)
    const an = va == null || Number.isNaN(va), bn = vb == null || Number.isNaN(vb)
    if (an && bn) return 0
    if (an) return 1       // nulls always last
    if (bn) return -1
    return dir * (va - vb)
  })
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
const fmt = (v, p = 0) => v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: p })
const FMT_MONEY = v => v === null || v === undefined ? '—' : '$' + v.toLocaleString('en-US')
const pct1 = v => (v == null || Number.isNaN(v)) ? '—' : v.toFixed(1) + '%'
const signed = v => (v == null || Number.isNaN(v)) ? '—' : (v > 0 ? '+' + v.toFixed(1) : v.toFixed(1)) + '%'

function MegaValue({ m }) {
  if (m.dispMegaUsdB == null) return '—'
  const b = m.dispMegaUsdB
  const label = b >= 1
    ? '$' + b.toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'B'
    : '$' + (b * 1000).toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'M'
  return (
    <span className="mega-cell">
      <b className="mega-val">{label}</b>
      {m.dispMegaName ? <span className="mega-name" title={m.dispMegaName}>{m.dispMegaName}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Column model: drives both the table and the visibility dropdown.
// `fixed` columns (identity) always render; everything else is toggleable.
// ---------------------------------------------------------------------------
const COLUMNS = [
  { key: 'rank',        header: '#',               fixed: true, num: true,  render: (m, i) => <span className="dim">{i + 1}</span> },
  { key: 'city',        header: 'City',            fixed: true, render: m => <strong>{m.city}</strong> },
  { key: 'state',       header: 'St',              fixed: true, render: m => m.state },
  { key: 'score',       header: 'Score',           num: true,  render: m => <strong>{fmt(m.composite, 1)}</strong> },
  { key: 'price',       header: 'Price',           num: true,  render: m => FMT_MONEY(m.median_home_price) },
  { key: 'rent',        header: 'Rent',            num: true,  render: m => FMT_MONEY(m.median_monthly_rent) },
  { key: 'gross',       header: 'Gross Yield',     num: true,  render: m => pct1(m.grossYield) },
  { key: 'vac_yield',   header: 'Vac-Yield',       num: true,  render: m => pct1(m.vacancyYield) },
  { key: 'net',         header: 'Net $/door',      num: true,  render: m => FMT_MONEY(m.brrrNetMonthly) },
  { key: 'rental_vac',  header: 'Rental Vac %',    num: true,  render: m => pct1(m.dispRentalVac) },
  { key: 'total_vac',   header: 'Total Vac %',     num: true,  render: m => pct1(m.dispTotalVac) },
  { key: 'renter',      header: 'Renter %',        num: true,  render: m => pct1(m.dispRenter) },
  { key: 'pop',         header: 'Pop Gr 5yr %',    num: true,  render: m => signed(m.dispPop) },
  { key: 'landlord',    header: 'Landlord',        num: true,  render: m => fmt(m.dispLandlord, 2) },
  { key: 'internet',    header: 'Internet Mbps',   num: true,  render: m => fmt(m.dispInternet, 0) },
  { key: 'tax',         header: 'Tax %',           num: true,  render: m => pct1(m.dispTax) },
  { key: 'pir',         header: 'P/I',             num: true,  render: m => fmt(m.dispPir, 1) },
  { key: 'rent_price',  header: 'Rent/Price',      num: true,  render: m => fmt(m.dispRentPrice, 2) },
  { key: 'unknown',     header: 'Unknown-ness',    num: true,  render: m => fmt(m.dispUnknown, 2) },
  { key: 'buy_below',   header: 'Buy-below %',     num: true,  render: m => pct1(m.dispBuyBelow) },
  { key: 'dom',         header: 'Days on Mkt',     num: true,  render: m => fmt(m.dispDom, 0) },
  { key: 'appr5',       header: 'Appr 5yr %',      num: true,  render: m => pct1(m.dispAppr5) },
  { key: 'emp',         header: 'Emp Diversity',   num: true,  render: m => fmt(m.dispEmp, 2) },
  { key: 'climate',     header: 'Climate risk',    num: true,  render: m => fmt(m.dispClim, 2) },
  { key: 'mega',        header: 'Mega Project $',  render: m => <MegaValue m={m} /> },
]

const METRO_COUNT = METROS.length
const TOGGLE_KEYS = COLUMNS.filter(c => !c.fixed).map(c => c.key)

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
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

function ColumnToggle({ visible, toggleColumn, setAll }) {
  const [open, setOpen] = useState(false)
  const allOn = TOGGLE_KEYS.every(k => visible.includes(k))
  const toggleables = COLUMNS.filter(c => !c.fixed)
  return (
    <div className="col-toggle">
      <button className="col-toggle-btn" onClick={() => setOpen(o => !o)}>
        Columns <span className="col-count">{visible.length}/{toggleables.length}</span> ▾
      </button>
      {open && (
        <div className="col-panel">
          <label className="col-all">
            <input type="checkbox" checked={allOn} onChange={e => setAll(e.target.checked)} />
            {allOn ? 'Deselect all' : 'Select all'}
          </label>
          <div className="col-list">
            {toggleables.map(c => (
              <label key={c.key} className="col-item">
                <input type="checkbox" checked={visible.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                {c.header}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetroTable({ metros, columns, sortKey, sortDir, onSort }) {
  return (
    <div className="table-scroll">
      <table className="metro-table">
        <thead>
          <tr>
            {columns.map(c => {
              const sortable = !!SORT_VAL[c.key]
              const active = sortKey === c.key
              return (
                <th key={c.key}
                    className={(c.num ? 'num ' : '') + (sortable ? 'sortable' : '') + (active ? ' active' : '')}
                    onClick={sortable ? () => onSort(c.key) : undefined}
                    title={sortable ? 'Sort by ' + c.header : undefined}>
                  <span className="th-label">{c.header}</span>
                  {sortable && <span className="sort-arrows">{active ? (sortDir === 1 ? '▲' : '▼') : '↕'}</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {metros.map((m, i) => (
            <tr key={`${m.city}-${m.state}-${i}`}>
              {columns.map(c => <td key={c.key} className={c.num ? 'num' : ''}>{c.render(m, i)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
// Aggregate list of all data sources used across the dataset (shown at footer).
const SOURCES = [
  'US Census Bureau — American Community Survey 5-yr 2020-2024: B25002 (total vacancy), B25003 (renter share, tagged per metro), B25004 (rental vacancy)',
  'HUD Comprehensive Housing Market Analysis (CHMA) — rental-vacancy cross-check',
  'Freddie Mac Primary Mortgage Market Survey (PMMS) — 30-yr rate for the BRRR refi',
  'Zillow Home Value Index & Observed Rent Index — median price / median rent',
  'Redfin & Realtor.com — days-on-market and gross-yield market data',
  'Federal Reserve Economic Data (FRED) / Census — price-to-income, tenure',
  'FCC National Broadband Map — internet speeds',
  'NOAA / FEMA — climate & disaster exposure',
  'Company/agency announcements (KY): U.S. DOE (Paducah American Energy Hub), Toyota TMMK, Ford Energy/Glendale, Canadian Solar e-STORAGE, Tate/Kingspan, Ascend Elements, KY data-center tracker — confirmed planned mega-project dollar values',
]

function App() {
  const [weights, setWeights] = useState({ ...DEFAULTS })
  const [stateFilter, setStateFilter] = useState('ALL')
  const [metroFilter, setMetroFilter] = useState('')
  const [limit, setLimit] = useState(50)
  const [visible, setVisible] = useState([...TOGGLE_KEYS])
  const [sort, setSort] = useState({ key: null, dir: 1 })

  const scored = computeScores(weights)
  scored.sort((a, b) => b.composite - a.composite)

  const stateList = [...new Set(METROS.map(m => m.state))].sort()
  let view = scored
  if (stateFilter !== 'ALL') view = view.filter(m => m.state === stateFilter)
  if (metroFilter === 'final') {
    const finalKeys = new Set(finalData.map(r => `${r.city}|${r.state}`))
    view = view.filter(m => finalKeys.has(`${m.city}|${m.state}`))
  }
  if (sort.key) view = sortRows(view, sort.key, sort.dir)
  view = view.slice(0, limit)

  const onWeight = (k, v) => setWeights(prev => ({ ...prev, [k]: v }))
  const toggleColumn = k => setVisible(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  const setAll = checked => setVisible(checked ? [...TOGGLE_KEYS] : [])
  const onSort = key => setSort(prev => {
    if (prev.key !== key) return { key, dir: 1 }      // first click: ascending
    if (prev.dir === 1) return { key, dir: -1 }        // second: descending
    return { key: null, dir: 1 }                        // third: clear (back to weighted composite)
  })
  const columns = COLUMNS.filter(c => c.fixed || visible.includes(c.key))

  return (
    <div className="app">
      <header className="hero">
        <h1>Hidden Markets <span className="accent">· Real Estate Research</span></h1>
        <p className="sub">
          {METRO_COUNT} US metros · live-weighted composite scoring · drag criterion weights to re-sort · pick your own columns
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
                {[25, 50, 100, METRO_COUNT].map(n => <option key={n} value={n}>{n === METRO_COUNT ? 'All' : n}</option>)}
              </select>
            </label>
            <ColumnToggle visible={visible} toggleColumn={toggleColumn} setAll={setAll} />
            <span className="count">{view.length} shown</span>
          </div>

          <MetroTable metros={view} columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />

          {view.length === 0 && <p className="empty">No metros match the current filters.</p>}
        </main>
      </div>

      <footer className="footer">
        <div>
          Data snapshot 2026-10-01 · {CRITERIA.length} weighted criteria (incl. Mega-project $) · BRRR underwrite 75% LTV / 6.66% 30-yr<br/>
          Derived values are computed on-page from base data: Gross/Vacancy-adjusted yield = rent·12/price (×(1−vacancy)); Rent-to-price = price/(rent×12).
        </div>
        <div className="sources-label">Sources used in total:</div>
        <ul className="sources">{SOURCES.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </footer>
    </div>
  )
}

const container = document.getElementById('root')
if (container) createRoot(container).render(<App />)