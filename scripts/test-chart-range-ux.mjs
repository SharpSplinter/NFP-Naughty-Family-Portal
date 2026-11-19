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
assert.ok(chart.includes("export function buildIntegerAxis"))
assert.ok(chart.includes("const integerScale = integerYAxis ? buildIntegerAxis(values) : null"))
assert.ok(chart.includes("const yTicks = integerScale?.ticks"))
assert.ok(chart.includes('toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })'))
assert.ok(chart.includes("slice(0, 3)"), "X-axis month names should be exactly three letters.")
const helperSignature = "export function buildIntegerAxis(values: number[], maxTicks = 5): { min: number; max: number; ticks: number[] } | null {"
const helperStart = chart.indexOf(helperSignature)
assert.notEqual(helperStart, -1)
const bodyStart = helperStart + helperSignature.length - 1
let depth = 0
let helperEnd = -1
for (let index = bodyStart; index < chart.length; index += 1) {
  if (chart[index] === "{") depth += 1
  if (chart[index] === "}") {
    depth -= 1
    if (depth === 0) { helperEnd = index + 1; break }
  }
}
assert.notEqual(helperEnd, -1, "Integer axis helper should have a complete body.")
const executableHelper = chart.slice(helperStart, helperEnd)
  .replace(helperSignature, "function buildIntegerAxis(values, maxTicks = 5) {")
  .replace("const ticks: number[] = []", "const ticks = []")
const buildIntegerAxis = new Function(executableHelper + "; return buildIntegerAxis;")()
for (const sample of [[1, 2, 3, 4, 5], [3.5, 4.5], [12.2, 12.7], [1, 10], [1, 250, 9876]]) {
  const scale = buildIntegerAxis(sample)
  assert.ok(scale)
  assert.ok(scale.ticks.every(Number.isInteger), `Y-axis ticks should all be whole numbers: ${scale.ticks}`)
  assert.ok(scale.min <= Math.min(...sample))
  assert.ok(scale.max >= Math.max(...sample))
}

assert.ok(chartsPage.includes('useState<ChartRange>("30")'), "Company Charts should default to one month.")
assert.ok(chartsPage.includes('<ChartRangeSelect label="Chart date range"'))
assert.ok(chartsPage.includes('<LineChart title="Star-rating history" integerYAxis series={chartSeriesFor("rating")}'))
assert.ok(!chartsPage.includes('<LineChart title="Star-rating history" invertY'), "Higher star ratings must plot higher on the graph.")
assert.ok(chartsPage.includes('<LineChart title="Global company ranking · same company type" integerYAxis invertY'), "Rank 1 should remain at the top of the ranking chart.")
assert.equal(count(chartsPage, "rangeDays={chartRange}"), 7, "All seven Company Charts graphs must use the shared range.")
assert.ok(chartsPage.includes('yAxisLabel="Daily income"'))
assert.ok(chartsPage.includes('yAxisLabel="Company rank (lower is better)"'))
assert.ok(chartsPage.includes('title="Star-rating history" integerYAxis'))
assert.ok(chartsPage.includes('title="Global company ranking · same company type" integerYAxis invertY'))

assert.ok(trendsPage.includes('useState<ChartRange>("30")'), "Historical Trends should default to one month.")
assert.ok(trendsPage.includes('<ChartRangeSelect label="History window"'))
assert.ok(trendsPage.includes("rangeDays={trendDays}"))
assert.ok(trendsPage.includes('yAxisLabel="Daily income"'))
assert.ok(trendsPage.includes('<LineChart title="Star-rating history" integerYAxis'), "Historical Trends star rating should also use whole-number axis ticks.")
assert.ok(trendsPage.includes('title="Star-rating history" integerYAxis'))
assert.equal(count(trendsPage, "rangeDays={trendDays}"), 7, "Executive and all six Historical Trends graphs must use the shared range.")

console.log("PASS chart range defaults to one month on both chart pages")
console.log("PASS all chart families share the selected date range")
console.log("PASS daily x-axis ticks switch to weekly ticks beyond one month")
console.log("PASS SVG axes have labeled values, axis titles, and tick marks")
console.log("PASS higher star ratings plot upward while rank 1 stays at the top")
