import { useEffect, useState } from "react"

export type ChartRange = "30" | "90" | "180" | "365" | "all"
export type ChartSeries = { label: string; values: { label: string; value: number | null }[] }

export function ChartRangeSelect({ label, value, onChange }: { label: string; value: ChartRange; onChange: (value: ChartRange) => void }) {
  return <label className="chart-range-select"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as ChartRange)}>
    <option value="30">1 month</option>
    <option value="90">3 months</option>
    <option value="180">6 months</option>
    <option value="365">12 months</option>
    <option value="all">All available history</option>
  </select></label>
}

export function filterChartSeriesByRange(series: ChartSeries[], rangeDays: ChartRange, now = Date.now()): ChartSeries[] {
  if (rangeDays === "all") return series
  const cutoff = now - Number(rangeDays) * 86400000
  return series.map((item) => ({
    ...item,
    values: item.values.filter((point) => {
      const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(point.label) ? `${point.label}T00:00:00Z` : point.label)
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now
    }),
  }))
}

export function buildIntegerAxis(values: number[], maxTicks = 5): { min: number; max: number; ticks: number[] } | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (!finite.length) return null

  let min = Math.floor(Math.min(...finite))
  let max = Math.ceil(Math.max(...finite))
  if (min === max) {
    min -= 1
    max += 1
  }

  const rawStep = (max - min) / Math.max(1, maxTicks - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalizedStep = rawStep / magnitude
  const niceFactor = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 2.5 ? 2.5 : normalizedStep <= 5 ? 5 : 10
  const step = Math.max(1, Math.ceil(niceFactor * magnitude))
  const ticks: number[] = []
  for (let tick = min; tick <= max; tick += step) ticks.push(tick)
  if (ticks[ticks.length - 1] !== max) ticks.push(max)
  return { min, max, ticks }
}

export function chartDateTickIndices(days: string[], rangeDays: ChartRange): number[] {
  if (rangeDays !== "all" && Number(rangeDays) <= 30) return days.map((_, index) => index)
  const seenWeeks = new Set<string>()
  return days.flatMap((day, index) => {
    const date = new Date(`${day}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return []
    date.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const weekKey = date.toISOString().slice(0, 10)
    if (seenWeeks.has(weekKey)) return []
    seenWeeks.add(weekKey)
    return [index]
  })
}
export type SnapshotHistoryPoint = { day: string; period: number; capturedAt: number; dailyIncome: number | null; weeklyIncome: number | null; dailyProfit: number | null; weeklyProfit: number | null; rating: number | null; companyRank: number | null; companyRankTotal: number | null; stockQuantity: number | null; stockValue: number | null; averageEmployeeEfficiency: number | null }
export type SnapshotHistoryCompany = { companyId: string; name: string; typeName: string; typeId: number; history: SnapshotHistoryPoint[] }
export type SnapshotMetric = "dailyIncome" | "weeklyIncome" | "dailyProfit" | "weeklyProfit" | "stockQuantity" | "stockValue" | "rating" | "companyRank"
export type OfficialCompanyHistoryPoint = {
  day: string
  reportedWeeklyProfit?: number | null
  weeklyProfitSource?: "reconstructed" | "reported" | "incomplete"
} & Partial<Record<SnapshotMetric, number | null>>
export function importedHistorySeries(companies: SnapshotHistoryCompany[], metric: SnapshotMetric): ChartSeries[] {
  const days = Array.from(new Set(companies.flatMap((company) => company.history.map((point) => point.day)))).sort()
  return companies.map((company) => ({ label: company.name, values: days.map((day) => {
    const point = company.history.find((item) => item.day === day)
    const value = point?.[metric]
    return { label: day, value: typeof value === "number" && Number.isFinite(value) ? value : null }
  }) }))
}

export function LineChart({
  title,
  series,
  money = false,
  invertY = false,
  rangeDays = "30",
  xAxisLabel = "Day",
  yAxisLabel,
  integerYAxis = false,
}: {
  title: string
  series: ChartSeries[]
  money?: boolean
  invertY?: boolean
  rangeDays?: ChartRange
  xAxisLabel?: string
  yAxisLabel?: string
  integerYAxis?: boolean
}) {
  const [selectedPoint, setSelectedPoint] = useState<{ series: string; label: string; value: number; x: number; y: number } | null>(null)
  useEffect(() => setSelectedPoint(null), [rangeDays])

  const visibleSeries = filterChartSeriesByRange(series, rangeDays)
  const days = Array.from(new Set(visibleSeries.flatMap((item) => item.values.map((point) => point.label)))).sort()
  const values = visibleSeries.flatMap((item) => item.values.map((point) => point.value).filter((value): value is number => value !== null && Number.isFinite(value)))
  if (!values.length) return <section className="panel chart-panel"><div className="panel-heading"><h2>{title}</h2></div><div className="empty-state">No recorded values in this date range. Choose a longer range or refresh the company history.</div></section>

  const width = 900, height = 320, left = 112, right = 28, top = 28, bottom = 76
  const axisY = height - bottom
  const min = Math.min(...values), max = Math.max(...values)
  const integerScale = integerYAxis ? buildIntegerAxis(values) : null
  const axisMin = integerScale?.min ?? min
  const axisMax = integerScale?.max ?? max
  const range = axisMax - axisMin || 1
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, days.length - 1)
  const y = (value: number) => top + (invertY ? value - axisMin : axisMax - value) * (axisY - top) / range
  const yTicks = integerScale?.ticks ?? Array.from({ length: 5 }, (_, index) => invertY ? min + index / 4 * (max - min) : max - index / 4 * (max - min))
  const valueLabel = (value: number) => money
    ? formatMoney(value)
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  const selectedX = selectedPoint ? Math.max(left + 60, Math.min(width - right - 60, selectedPoint.x)) : 0
  const selectedY = selectedPoint ? Math.max(top + 12, selectedPoint.y - 16) : 0
  const weeklyTicks = rangeDays === "all" || Number(rangeDays) > 30
  const tickIndices = chartDateTickIndices(days, rangeDays)
  const xTickLabel = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return day
    if (weeklyTicks) date.setUTCDate(date.getUTCDate() - date.getUTCDay())
    const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).replace(".", "").slice(0, 3)
    return `${month} ${date.getUTCDate()}`
  }

  return <section className="panel chart-panel">
    <div className="panel-heading">
      <div><h2>{title}</h2><p>{rangeDays === "all" ? "All available history" : `Last ${rangeDays} days`} · {weeklyTicks ? "weekly" : "daily"} date ticks · UTC</p></div>
      <div className="chart-legend">{visibleSeries.map((item, index) => <span key={item.label}><i className={`chart-key chart-key-${index % 3}`} />{item.label}</span>)}</div>
    </div>
    <div className="chart-scroll">
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={title}>
        {yTicks.map((tickValue, index) => {
          const yy = y(tickValue)
          return <g key={index}>
            <line x1={left} x2={width - right} y1={yy} y2={yy} className="chart-grid" />
            <line x1={left - 5} x2={left} y1={yy} y2={yy} className="chart-axis-tick" />
            <text x={left - 10} y={yy + 4} textAnchor="end" className="chart-label">{valueLabel(tickValue)}</text>
          </g>
        })}
        <line x1={left} x2={left} y1={top} y2={axisY} className="chart-axis" />
        <line x1={left} x2={width - right} y1={axisY} y2={axisY} className="chart-axis" />
        <text x={26} y={(top + axisY) / 2} textAnchor="middle" transform={`rotate(-90 26 ${(top + axisY) / 2})`} className="chart-axis-title">{yAxisLabel || title}</text>
        {tickIndices.map((index, tickIndex) => {
          const tickX = x(index)
          const day = days[index]
          const labelEvery = days.length > 240 ? 4 : days.length > 120 ? 2 : 1
          const showLabel = !weeklyTicks || tickIndex === 0 || tickIndex === tickIndices.length - 1 || tickIndex % labelEvery === 0
          return <g key={day}>
            <line x1={tickX} x2={tickX} y1={axisY} y2={axisY + (showLabel ? 5 : 3)} className="chart-axis-tick" />
            {showLabel && <text x={tickX} y={axisY + 18} textAnchor="middle" className="chart-label chart-date-tick"><title>{day}</title>{xTickLabel(day)}</text>}
          </g>
        })}
        {visibleSeries.map((item, index) => {
          const byDay = new Map(item.values.map((point) => [point.label, point.value]))
          const points = days.flatMap((day, dayIndex) => {
            const value = byDay.get(day)
            return value === null || value === undefined ? [] : [`${x(dayIndex)},${y(value)}`]
          }).join(" ")
          return <g key={item.label}>
            <polyline points={points} className={`chart-line chart-line-${index % 3}`} />
            {days.map((day, dayIndex) => {
              const value = byDay.get(day)
              if (value === null || value === undefined) return null
              const px = x(dayIndex), py = y(value)
              return <circle
                key={`${day}-${dayIndex}`}
                cx={px}
                cy={py}
                r={selectedPoint?.series === item.label && selectedPoint.label === day ? 5 : 3.5}
                className={`chart-point chart-line-${index % 3}`}
                role="button"
                tabIndex={0}
                aria-label={`${item.label}, ${day}: ${valueLabel(value)}`}
                onClick={() => setSelectedPoint({ series: item.label, label: day, value, x: px, y: py })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setSelectedPoint({ series: item.label, label: day, value, x: px, y: py })
                  }
                }}
              ><title>{`${item.label} · ${day}: ${valueLabel(value)}`}</title></circle>
            })}
          </g>
        })}
        {selectedPoint && <g className="chart-selected-value" aria-live="polite">
          <rect x={selectedX - 60} y={selectedY - 28} width="120" height="44" rx="6" />
          <text x={selectedX} y={selectedY - 11} textAnchor="middle">{selectedPoint.label}</text>
          <text x={selectedX} y={selectedY + 5} textAnchor="middle">{valueLabel(selectedPoint.value)}</text>
        </g>}
        <text x={(left + width - right) / 2} y={height - 8} textAnchor="middle" className="chart-axis-title">{weeklyTicks ? "Week beginning (UTC)" : xAxisLabel}</text>
      </svg>
    </div>
    <p className="chart-interaction-hint">Select any point to view its exact date and value.</p>
  </section>
}
export function stockInventoryValue(stock: unknown): number | null {
  if (!stock || typeof stock !== "object") return null
  const values: number[] = []
  const visit = (value: unknown, depth: number) => { if (!value || typeof value !== "object" || depth > 6) return; if (Array.isArray(value)) { value.forEach((item) => visit(item, depth+1)); return } const row=value as Record<string,unknown>; const qty=[row.in_stock,row.quantity,row.amount].find((n)=>typeof n==="number"&&Number.isFinite(n)) as number|undefined; const cost=[row.cost,row.unit_cost,row.cost_per_unit].find((n)=>typeof n==="number"&&Number.isFinite(n)) as number|undefined; if(qty!==undefined&&cost!==undefined)values.push(Math.max(0,qty)*Math.max(0,cost)); for(const [key,child] of Object.entries(row))if(!["in_stock","quantity","amount","cost","unit_cost","cost_per_unit"].includes(key))visit(child,depth+1) }
  visit(stock,0); return values.length ? values.reduce((sum,value)=>sum+value,0) : null
}

function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

type CompareHistoryPoint = { day: string; dailyIncome: number | null; weeklyIncome: number | null; dailyProfit: number | null; weeklyProfit?: number | null; stockQuantity: number | null; stock: unknown }
type CompareData = { director: { companyName: string; directorName: string; dailyIncome: number | null; weeklyIncome: number | null }; history: CompareHistoryPoint[] }
type ChartResult = { model?: { company: { name: string } }; incomeHistory?: { fetchedAt: string; dailyIncome: number | null }[] } | null
type ChartModel = { company: { name: string; dailyIncome: number | null; weeklyIncome: number | null } }

export function buildChartSeriesFor(metric: SnapshotMetric, currentChartCompany: SnapshotHistoryCompany | undefined, ownCompareData: CompareData | null, result: ChartResult | null, model: ChartModel | undefined, selectedComparePlayerId: string, compareData: CompareData | null, currentRank: number | null, currentRating: number | null, officialHistory: OfficialCompanyHistoryPoint[] = []): ChartSeries[] {
    const ownValues = new Map<string, number | null>()
    currentChartCompany?.history.forEach((point) => ownValues.set(point.day, point[metric]))
    ownCompareData?.history.forEach((point) => {
      let value: number | null = null
      if (metric === "stockValue") value = stockInventoryValue(point.stock)
      else if (metric === "rating" || metric === "companyRank") value = null
      else value = point[metric] ?? null
      if (value !== null) ownValues.set(point.day, value)
    })
    if (metric === "dailyIncome") (result?.incomeHistory ?? []).forEach((point) => {
      if (point.dailyIncome === null) return
      const day = new Date(new Date(point.fetchedAt).getTime() - 18 * 3600000).toISOString().slice(0, 10)
      ownValues.set(day, point.dailyIncome)
    })
    const currentDay = new Date(Date.now() - 18 * 3600000).toISOString().slice(0, 10)
    if (metric === "rating" && currentRating !== null) ownValues.set(currentDay, currentRating)
    if (metric === "companyRank" && currentRank !== null) ownValues.set(currentDay, currentRank)
    if ((metric === "dailyIncome" || metric === "weeklyIncome") && model) {
      const currentValue = metric === "dailyIncome" ? model.company.dailyIncome : model.company.weeklyIncome
      if (currentValue !== null) ownValues.set(new Date(Date.now() - 18 * 3600000).toISOString().slice(0, 10), currentValue)
    }
    officialHistory.forEach((point) => {
      if (!Object.prototype.hasOwnProperty.call(point, metric)) return
      const value = metric === "weeklyProfit" && point.weeklyProfit == null
        ? point.reportedWeeklyProfit
        : point[metric]
      ownValues.set(point.day, typeof value === "number" && Number.isFinite(value) ? value : null)
    })
    const series: ChartSeries[] = [{ label: model?.company.name || result?.model?.company.name || currentChartCompany?.name || "Selected company", values: Array.from(ownValues, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)) }]
    if (selectedComparePlayerId && compareData) {
      const peerByDay = new Map<string, number | null>(compareData.history.map((point) => {
        let value: number | null = null
        if (metric === "stockValue") value = stockInventoryValue(point.stock)
        else if (metric === "rating" || metric === "companyRank") value = null
        else value = point[metric] ?? null
        return [point.day, value]
      }))
      if (metric === "dailyIncome" || metric === "weeklyIncome") {
        const currentIncome = metric === "dailyIncome" ? compareData.director.dailyIncome : compareData.director.weeklyIncome
        if (currentIncome !== null && currentIncome !== undefined) peerByDay.set(new Date(Date.now() - 18 * 3600000).toISOString().slice(0, 10), currentIncome)
      }
      series.push({ label: `${compareData.director.companyName} · ${compareData.director.directorName}`, values: Array.from(peerByDay, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)) })
    }
    return series
}
