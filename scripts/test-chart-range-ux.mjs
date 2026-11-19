import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const chart = readFileSync(new URL("../src/components/floor/chart-utils.tsx", import.meta.url), "utf8")
const chartsPage = readFileSync(new URL("../src/components/floor/floor-app.tsx", import.meta.url), "utf8")
const trendsPage = readFileSync(new URL("../src/components/floor/insights-workspace.tsx", import.meta.url), "utf8")

const count = (source, text) => source.split(text).length - 1

assert.ok(chart.includes('export type ChartRange = "30" | "90" | "180" | "365" | "all"'))
assert.ok(chart.includes('<option value="30">1 month</option>'))
assert.ok(chart.includes('export function filterChartSeriesByRange'))
assert.ok(chart.includes('if (rangeDays === "all") return series'))
assert.ok(chart.includes("timestamp >= cutoff && timestamp <= now"))
assert.ok(chart.includes("export function chartDateTickIndices"))
assert.ok(chart.includes("date.getUTCDay()"), "Long-range ticks should align to the Sunday reporting week.")
assert.ok(chart.includes('const weeklyTicks = rangeDays === "all" || Number(rangeDays) > 30'))
assert.ok(chart.includes('className="chart-axis-title"'))
assert.ok(chart.includes('className="chart-axis"'))
assert.ok(chart.includes('className="chart-axis-tick"'))
assert.ok(chart.includes("filterChartSeriesByRange(series, rangeDays)"))

assert.ok(chartsPage.includes('useState<ChartRange>("30")'), "Company Charts should default to one month.")
assert.ok(chartsPage.includes('<ChartRangeSelect label="Chart date range"'))
assert.ok(chartsPage.includes('<LineChart title="Star-rating history" series={chartSeriesFor("rating")}'))
assert.ok(!chartsPage.includes('<LineChart title="Star-rating history" invertY'), "Higher star ratings must plot higher on the graph.")
assert.ok(chartsPage.includes('<LineChart title="Global company ranking · same company type" invertY'), "Rank 1 should remain at the top of the ranking chart.")
assert.equal(count(chartsPage, "rangeDays={chartRange}"), 7, "All seven Company Charts graphs must use the shared range.")
assert.ok(chartsPage.includes('yAxisLabel="Daily income"'))
assert.ok(chartsPage.includes('yAxisLabel="Company rank (lower is better)"'))

assert.ok(trendsPage.includes('useState<ChartRange>("30")'), "Historical Trends should default to one month.")
assert.ok(trendsPage.includes('<ChartRangeSelect label="History window"'))
assert.ok(trendsPage.includes("rangeDays={trendDays}"))
assert.ok(trendsPage.includes('yAxisLabel="Daily income"'))
assert.equal(count(trendsPage, "rangeDays={trendDays}"), 7, "Executive and all six Historical Trends graphs must use the shared range.")

console.log("PASS chart range defaults to one month on both chart pages")
console.log("PASS all chart families share the selected date range")
console.log("PASS daily x-axis ticks switch to weekly ticks beyond one month")
console.log("PASS SVG axes have labeled values, axis titles, and tick marks")
console.log("PASS higher star ratings plot upward while rank 1 stays at the top")
