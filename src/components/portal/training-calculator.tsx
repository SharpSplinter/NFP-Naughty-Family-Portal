import { type ReactNode, useEffect, useMemo, useState } from "react"
import "./training-calculator.css"

type StatKey = "strength" | "defense" | "speed" | "dexterity"
type TabKey = "session" | "happy" | "energy" | "enhancers" | "projection"
type GymPreset = { id: string; name: string; energyCost: number; dots: Record<StatKey, number | null>; note?: string; available?: boolean }
type MarketPrice = { itemId: string; name: string; averagePrice: number | null; cacheTimestamp: number | null; fetchedAt: number }
type EnergyBar = { current: number; maximum: number; increment: number; interval: number; tickTime: number; fullTime: number } | null
type LiveData = {
  fetchedAt: string
  battleStats: Record<StatKey, number | null> & { total: number | null }
  perks: Record<string, string[]>
  gym: { id: string; name: string; unlockedGyms: Array<{ id: string; name: string; available: boolean }> } | null
  gyms: GymPreset[]
  gymModifiers: Record<StatKey, { multiplier: number; bonuses: string[] }>
  bars: { energy: EnergyBar; happy: EnergyBar }
  refills: { energy?: boolean; special_count?: number }
  cooldowns: { booster?: number; drug?: number }
  pointsAverageCost: number | null
  items: {
    xanax: MarketPrice | null
    energyDrinks: Record<string, MarketPrice | null>
    fhc: MarketPrice | null
    eroticDvd: MarketPrice | null
    yellowEgg: MarketPrice | null
    poisonMistletoe: MarketPrice | null
    statEnhancers: Record<StatKey, MarketPrice | null>
  }
  marketUpdatedAt: number
  errors: Record<string, string>
}
type TrainRow = { train: number; statBefore: number; happyBefore: number; gain: number; statAfter: number; happyAfter: number; energy: number }
type SessionResult = { trains: number; energyUsed: number; statGain: number; endingStat: number; endingHappy: number; averageGain: number; rows: TrainRow[] }
type HistoryLog = { logId: string; timestamp: number; title: string; category?: string; record?: Record<string, unknown> }
type HistoryData = { collectionEnabled?: boolean; connected?: boolean; totalLogs?: number; logs?: HistoryLog[]; error?: string }

const STAT_OPTIONS: Array<{ value: StatKey; label: string }> = [
  { value: "strength", label: "Strength" },
  { value: "defense", label: "Defense" },
  { value: "speed", label: "Speed" },
  { value: "dexterity", label: "Dexterity" },
]
const FALLBACK_GYMS: GymPreset[] = [
  { id: "premier", name: "Premier Fitness", energyCost: 5, dots: { strength: 2, defense: 2, speed: 2, dexterity: 2 } },
  { id: "average", name: "Average Joes", energyCost: 5, dots: { strength: 2.4, defense: 2.8, speed: 2.4, dexterity: 2.4 } },
  { id: "woodys", name: "Woody's Workout", energyCost: 5, dots: { strength: 2.8, defense: 3, speed: 3.2, dexterity: 2.8 } },
  { id: "global", name: "Global Gym", energyCost: 5, dots: { strength: 4, defense: 4, speed: 4, dexterity: 4 } },
  { id: "deep-burn", name: "Deep Burn", energyCost: 10, dots: { strength: 6, defense: 6, speed: 6, dexterity: 6 } },
  { id: "gun-shop", name: "Gun Shop", energyCost: 10, dots: { strength: 6.6, defense: 6.2, speed: 6.4, dexterity: 6.2 } },
  { id: "force", name: "Force Training", energyCost: 10, dots: { strength: 6.4, defense: 6.4, speed: 6.6, dexterity: 6.8 } },
  { id: "georges", name: "George's", energyCost: 10, dots: { strength: 7.3, defense: 7.3, speed: 7.3, dexterity: 7.3 } },
  { id: "balboas", name: "Balboas Gym", energyCost: 25, dots: { strength: null, defense: 7.5, speed: null, dexterity: 7.5 } },
  { id: "frontline", name: "Frontline Fitness", energyCost: 25, dots: { strength: 7.5, defense: null, speed: 7.5, dexterity: null } },
  { id: "gym-3000", name: "Gym 3000", energyCost: 50, dots: { strength: 8, defense: null, speed: null, dexterity: null } },
  { id: "isoyamas", name: "Mr. Isoyama's", energyCost: 50, dots: { strength: null, defense: 8, speed: null, dexterity: null } },
  { id: "total-rebound", name: "Total Rebound", energyCost: 50, dots: { strength: null, defense: null, speed: 8, dexterity: null } },
  { id: "elites", name: "Elites", energyCost: 50, dots: { strength: null, defense: null, speed: null, dexterity: 8 } },
  { id: "ssl", name: "Sports Science Lab", energyCost: 25, dots: { strength: 9, defense: 9, speed: 9, dexterity: 9 } },
  { id: "fight-club", name: "Fight Club", energyCost: 10, dots: { strength: 10, defense: 10, speed: 10, dexterity: 10 } },
]
const ENERGY_DRINKS = [
  { id: "goose", name: "Goose Juice", energy: 5 },
  { id: "damp", name: "Damp Valley", energy: 10 },
  { id: "croco", name: "Crocozade", energy: 15 },
  { id: "munster", name: "Munster", energy: 20 },
  { id: "santa", name: "Santa Shooters", energy: 20 },
  { id: "red-cow", name: "Red Cow", energy: 25 },
  { id: "rudolph", name: "Rockstar Rudolph", energy: 25 },
  { id: "taurine", name: "Taurine Elite", energy: 30 },
  { id: "x-mass", name: "X-MASS", energy: 30 },
]
const HAPPY_CAP = 99_999
const ENERGY_HARD_CAP = 1_000
const SE_GAIN_CAP = 5_000_000_000_000
const MAX_STAT_INPUT = Number.MAX_SAFE_INTEGER

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(numeric) ? numeric : fallback
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
function fmt(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : "—"
}
function money(value: number | null | undefined): string {
  return value && value > 0 ? "$" + fmt(value) : "Not listed"
}
function normalizeBook(value: string): string {
  const key = value.toLowerCase()
  if (key.includes("fuelling your way to failure")) return "fuelling"
  if (key.includes("higher daddy")) return "higher-daddy"
  if (key.includes("ugly energy")) return "ugly-energy"
  if (key.includes("self control is for losers")) return "self-control"
  return ""
}
function activeBookChoice(data: LiveData | null): string {
  const books = data?.perks?.book || []
  for (const book of books) {
    const match = normalizeBook(book)
    if (match) return match
  }
  return "none"
}
function activeHasBook(data: LiveData | null, bookId: string): boolean {
  return (data?.perks?.book || []).some(book => normalizeBook(book) === bookId)
}
function getNaturalEnergy(bar: EnergyBar, waitHours: number, regenMultiplier: number): number {
  if (!bar || waitHours <= 0) return 0
  const current = Math.max(0, safeNumber(bar.current))
  const maximum = Math.max(0, safeNumber(bar.maximum))
  if (current >= maximum) return 0
  const increment = Math.max(1, safeNumber(bar.increment, 5))
  const interval = Math.max(1, safeNumber(bar.interval, 600)) / Math.max(0.01, regenMultiplier)
  const untilNext = clamp(safeNumber(bar.tickTime, interval), 0, interval)
  const waitSeconds = Math.max(0, waitHours * 3600)
  const ticks = waitSeconds < untilNext ? 0 : 1 + Math.floor((waitSeconds - untilNext) / interval)
  return Math.min(maximum - current, ticks * increment)
}
function estimateGymSession({
  stat, happy, energy, dots, energyPerTrain, modifier, happyLossRate,
}: {
  stat: number; happy: number; energy: number; dots: number; energyPerTrain: number; modifier: number; happyLossRate: number
}): SessionResult {
  const stepEnergy = Math.max(1, Math.floor(energyPerTrain))
  const trains = Math.min(200, Math.max(0, Math.floor(Math.max(0, energy) / stepEnergy)))
  let currentStat = Math.max(0, stat)
  let currentHappy = clamp(happy, 0, HAPPY_CAP)
  let statGain = 0
  const rows: TrainRow[] = []
  for (let index = 0; index < trains; index++) {
    const statBefore = currentStat
    const happyBefore = currentHappy
    const adjustedHappy = currentHappy + 250
    const perEnergy =
      (3.480061091e-7 * Math.log(adjustedHappy) + 3.091619094e-6) * currentStat
      + 6.82775184551527e-5 * adjustedHappy
      - 0.0301431777
    const gain = Math.max(0, modifier * dots * stepEnergy * perEnergy)
    currentStat += gain
    statGain += gain
    currentHappy = Math.max(0, currentHappy - stepEnergy * happyLossRate)
    rows.push({ train: index + 1, statBefore, happyBefore, gain, statAfter: currentStat, happyAfter: currentHappy, energy: stepEnergy })
  }
  const energyUsed = trains * stepEnergy
  return { trains, energyUsed, statGain, endingStat: currentStat, endingHappy: currentHappy, averageGain: trains ? statGain / trains : 0, rows }
}
type NumberFieldProps = {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number
  step?: number; hint?: string; suffix?: string; testId?: string
}
function NumberField({ label, value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, hint, suffix, testId }: NumberFieldProps) {
  return (
    <label className="tc-field">
      <span>{label}</span>
      <span className="tc-input-wrap">
        <input data-testid={testId} type="number" min={min} max={max} step={step}
          value={value === 0 ? "" : value}
          onChange={event => {
            const raw = event.target.value
            onChange(raw === "" ? 0 : clamp(Number(raw), min, max))
          }} />
        {suffix && <small>{suffix}</small>}
      </span>
      {hint && <small className="tc-hint">{hint}</small>}
    </label>
  )
}
function TextNumberField({ label, value, fallbackValue, onChange, max = MAX_STAT_INPUT, hint, testId }: {
  label: string; value: string; fallbackValue: number | null; onChange: (value: string) => void; max?: number; hint?: string; testId?: string
}) {
  return (
    <label className="tc-field">
      <span>{label}</span>
      <input data-testid={testId} type="number" min="0" max={max}
        value={value !== "" ? value : fallbackValue === null ? "" : fallbackValue}
        placeholder="Use live Torn value"
        onChange={event => onChange(event.target.value === "" ? "" : String(clamp(Number(event.target.value), 0, max)))} />
      {hint && <small className="tc-hint">{hint}</small>}
    </label>
  )
}
function PriceField({ label, value, autoValue, onChange, hint, testId }: {
  label: string; value: string; autoValue: number | null; onChange: (value: string) => void; hint?: string; testId?: string
}) {
  const displayed = value !== "" ? value : autoValue && autoValue > 0 ? String(autoValue) : ""
  return (
    <label className="tc-field">
      <span>{label}</span>
      <span className="tc-input-wrap">
        <input data-testid={testId} type="number" min="0" max={MAX_STAT_INPUT} step="1000"
          value={displayed} placeholder="Live market price unavailable"
          onChange={event => onChange(event.target.value)} />
      </span>
      {hint && <small className="tc-hint">{hint}</small>}
      {value !== "" && <small className="tc-hint">Manual override. Clear to return to the live Item Market average.</small>}
    </label>
  )
}
function Metric({ label, value, detail, tone = "violet" }: { label: string; value: string; detail?: string; tone?: string }) {
  return <article className={"tc-metric tc-metric-" + tone}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>
}
function Panel({ title, eyebrow, description, children }: { title: string; eyebrow?: string; description?: string; children: ReactNode }) {
  return (
    <section className="tc-panel">
      {(eyebrow || title || description) && <header className="tc-panel-heading">
        {eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}
      </header>}
      {children}
    </section>
  )
}
function getBar(data: LiveData | null, kind: "energy" | "happy"): EnergyBar {
  return data?.bars?.[kind] || null
}
function getPrice(override: string, market: MarketPrice | null | undefined): number {
  if (override.trim() !== "") return Math.max(0, safeNumber(override))
  return Math.max(0, safeNumber(market?.averagePrice))
}
function marketPrice(market: MarketPrice | null | undefined): number | null {
  return market?.averagePrice && market.averagePrice > 0 ? market.averagePrice : null
}
function prettyDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Date unavailable"
}
function shortLogDetails(log: HistoryLog): string {
  const record = log.record || {}
  const details = record.details && typeof record.details === "object" ? record.details as Record<string, unknown> : {}
  const title = typeof details.title === "string" ? details.title : log.title
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {}
  const params = record.params && typeof record.params === "object" ? record.params as Record<string, unknown> : {}
  const merged = { ...params, ...data }
  const stat = Object.keys(merged).find(key => ["strength", "defense", "speed", "dexterity"].includes(key.toLowerCase()))
  const statName = stat ? stat[0].toUpperCase() + stat.slice(1) : ""
  const energyValue = merged.energy_used ?? merged.energy ?? merged.amount
  const energy = typeof energyValue === "number" ? fmt(energyValue) + "E" : ""
  return [title, statName, energy].filter(Boolean).join(" · ")
}

type TrainingCalculatorProps = { playerName: string; apiBase: string; sessionToken: string; onNavigate: (path: string) => void }

export function TrainingCalculatorWorkspace({ playerName, apiBase, sessionToken, onNavigate }: TrainingCalculatorProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("session")
  const [selectedStat, setSelectedStat] = useState<StatKey>("strength")
  const [selectedGymId, setSelectedGymId] = useState("")
  const [liveData, setLiveData] = useState<LiveData | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [apiError, setApiError] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [manualStats, setManualStats] = useState<Record<StatKey, string>>({ strength: "", defense: "", speed: "", dexterity: "" })
  const [manualHappy, setManualHappy] = useState("")
  const [manualEnergy, setManualEnergy] = useState("")
  const [manualModifier, setManualModifier] = useState("")
  const [manualModifierEnabled, setManualModifierEnabled] = useState(false)
  const [happyLossPercent, setHappyLossPercent] = useState(50)
  const [waitHours, setWaitHours] = useState(0)
  const [xanaxCount, setXanaxCount] = useState(0)
  const [fhcCount, setFhcCount] = useState(0)
  const [canId, setCanId] = useState("munster")
  const [canCount, setCanCount] = useState(0)
  const [greenEggCount, setGreenEggCount] = useState(0)
  const [pointRefillIncluded, setPointRefillIncluded] = useState(false)
  const [otherEnergy, setOtherEnergy] = useState(0)
  const [bookChoice, setBookChoice] = useState("auto")
  const [factionVoracity, setFactionVoracity] = useState(false)
  const [dvdCount, setDvdCount] = useState(0)
  const [dvdHappy, setDvdHappy] = useState(2500)
  const [yellowEggCount, setYellowEggCount] = useState(0)
  const [mistletoeCount, setMistletoeCount] = useState(0)
  const [mistletoeTargetHappy, setMistletoeTargetHappy] = useState(99999)
  const [otherHappy, setOtherHappy] = useState(0)
  const [ecstasy, setEcstasy] = useState(false)
  const [seQuantity, setSeQuantity] = useState(1)
  const [seTargetStat, setSeTargetStat] = useState<StatKey>("strength")
  const [projectionDays, setProjectionDays] = useState(30)
  const [dailyEnergyOverride, setDailyEnergyOverride] = useState("")
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    const base = apiBase.replace(/\/+$/, "")
    setLoading(true)
    setApiError("")
    fetch(base + "/api/me/training-calculator", { headers: { Authorization: "Bearer " + sessionToken }, signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not load live Torn training data.")
        return payload as LiveData
      })
      .then(payload => {
        if (controller.signal.aborted) return
        setLiveData(payload)
        if (payload.gym?.id) setSelectedGymId(current => current || payload.gym!.id)
        if (payload.bars?.happy?.current !== undefined) setManualHappy(current => current || "")
        if (payload.errors?.battleStats && !Object.values(payload.battleStats || {}).some(value => typeof value === "number")) {
          setApiError("Torn could not return your battle stats. Check that your saved API key includes User → Battlestats.")
        }
      })
      .catch(error => { if (!controller.signal.aborted) setApiError(error instanceof Error ? error.message : "Live Torn data could not be loaded.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    fetch(base + "/api/me/gym-training/history", { headers: { Authorization: "Bearer " + sessionToken }, signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Training history is unavailable.")
        return payload as HistoryData
      })
      .then(payload => { if (!controller.signal.aborted) setHistory(payload) })
      .catch(error => { if (!controller.signal.aborted) setHistory({ error: error instanceof Error ? error.message : "Training history is unavailable." }) })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false) })
    return () => controller.abort()
  }, [apiBase, sessionToken, refreshKey])

  const activeBook = bookChoice === "auto" ? activeBookChoice(liveData) : bookChoice
  const energyBar = getBar(liveData, "energy")
  const happyBar = getBar(liveData, "happy")
  const currentEnergyFromApi = energyBar ? safeNumber(energyBar.current) : 0
  const currentHappyFromApi = happyBar ? safeNumber(happyBar.current) : 5025
  const currentEnergy = manualEnergy.trim() === "" ? currentEnergyFromApi : clamp(safeNumber(manualEnergy), 0, ENERGY_HARD_CAP)
  const startingHappy = manualHappy.trim() === "" ? currentHappyFromApi : clamp(safeNumber(manualHappy), 0, HAPPY_CAP)
  const activeGym = liveData?.gyms?.find(gym => String(gym.id) === String(liveData.gym?.id)) || null
  const gyms = liveData?.gyms?.length ? liveData.gyms : FALLBACK_GYMS
  const gymId = selectedGymId || String(liveData?.gym?.id || "gun-shop")
  const selectedGym = gyms.find(gym => String(gym.id) === gymId) || activeGym || FALLBACK_GYMS.find(gym => gym.id === "gun-shop")!
  const liveStatValue = liveData?.battleStats?.[selectedStat] ?? null
  const statOverride = manualStats[selectedStat]
  const currentStat = statOverride.trim() === "" ? safeNumber(liveStatValue) : Math.max(0, safeNumber(statOverride))
  const autoModifier = liveData?.gymModifiers?.[selectedStat]?.multiplier || 1
  const effectiveModifier = manualModifierEnabled && manualModifier.trim() !== "" ? clamp(safeNumber(manualModifier), 0, 100) : autoModifier
  const liveStatSource = statOverride.trim() === "" && liveStatValue !== null ? "Live Torn API" : "Manual scenario"
  const selectedDots = safeNumber(selectedGym.dots[selectedStat])
  const activeVoracity = (liveData?.perks?.faction || []).some(value => /voracity/i.test(value))
  const voracityEnabled = factionVoracity || activeVoracity
  const drink = ENERGY_DRINKS.find(item => item.id === canId) || ENERGY_DRINKS[3]
  const activeSelfControl = activeHasBook(liveData, "self-control")
  const cooldownFactor = activeBook === "self-control" && !activeSelfControl ? 0.5 : 1
  const cooldownCapHours = voracityEnabled ? 48 : 24
  const currentBoosterCooldownHours = Math.max(0, safeNumber(liveData?.cooldowns?.booster) / 3600)
  const boosterBudgetHours = Math.max(0, cooldownCapHours - currentBoosterCooldownHours)
  const barMaximumBase = Math.max(0, safeNumber(energyBar?.maximum, 150) - (activeHasBook(liveData, "ugly-energy") ? 100 : 0))
  const refillBarMaximum = activeBook === "ugly-energy" && !activeHasBook(liveData, "ugly-energy")
    ? barMaximumBase + 100
    : Math.max(0, safeNumber(energyBar?.maximum, 150))
  const regenMultiplier = activeBook === "higher-daddy" && !activeHasBook(liveData, "higher-daddy") ? 1.2 : 1
  const naturalEnergy = getNaturalEnergy(energyBar, waitHours, regenMultiplier)
  const energyAfterNatural = Math.min(refillBarMaximum, currentEnergy + naturalEnergy)
  const drinkMultiplier = (voracityEnabled ? 1.5 : 1) * (activeBook === "fuelling" ? 2 : 1)
  const energyFromCans = canCount * drink.energy * drinkMultiplier
  const pointRefillAvailable = liveData?.refills?.energy === true
  const pointRefillCount = pointRefillIncluded && pointRefillAvailable ? 1 : 0
  const energyFromRefills = pointRefillCount * refillBarMaximum
  const energyFromFhcs = fhcCount * refillBarMaximum
  const energyFromXanax = xanaxCount * 250
  const energyFromGreenEggs = greenEggCount * 500
  const usableEnergy = energyAfterNatural + energyFromRefills + energyFromFhcs + energyFromXanax + energyFromCans + energyFromGreenEggs + otherEnergy
  const energySourceTotal = currentEnergy + naturalEnergy + energyFromRefills + energyFromFhcs + energyFromXanax + energyFromCans + energyFromGreenEggs + otherEnergy
  const cooldownUsedHours = cooldownFactor * (canCount * 2 + (fhcCount + greenEggCount) * 6 + (dvdCount + yellowEggCount + seQuantity) * 6)
  const cooldownRemainingHours = Math.max(0, boosterBudgetHours - cooldownUsedHours)
  const boosterBudgetDescription = fmt(Math.max(0, boosterBudgetHours)) + "h available before planned items"
  const maximumXanax = 4
  const maximumCanCount = Math.min(24, Math.max(0, Math.floor(Math.max(0, boosterBudgetHours / (2 * cooldownFactor)))))
  const maximumFhcCount = Math.min(8, Math.max(0, Math.floor(boosterBudgetHours / (6 * cooldownFactor))))
  const maximumDvdCount = Math.min(8, Math.max(0, Math.floor(boosterBudgetHours / (6 * cooldownFactor))))
  const maximumYellowEggCount = Math.min(8, Math.max(0, Math.floor(boosterBudgetHours / (6 * cooldownFactor))))
  const targetHappy = clamp(mistletoeTargetHappy, 0, HAPPY_CAP)
  const maximumMistletoeCount = targetHappy > 1 ? Math.min(50, Math.ceil(Math.log(1 / targetHappy) / Math.log(0.75) * -1)) : 0
  const maxSeByCooldown = Math.min(8, Math.max(0, Math.floor(boosterBudgetHours / (6 * cooldownFactor))))
  const maxPointRefill = pointRefillAvailable ? 1 : 0

  const xanaxPrice = getPrice(priceOverrides.xanax || "", liveData?.items?.xanax)
  const canPrice = getPrice(priceOverrides.can || "", liveData?.items?.energyDrinks?.[canId])
  const fhcPrice = getPrice(priceOverrides.fhc || "", liveData?.items?.fhc)
  const dvdPrice = getPrice(priceOverrides.dvd || "", liveData?.items?.eroticDvd)
  const yellowEggPrice = getPrice(priceOverrides.yellowEgg || "", liveData?.items?.yellowEgg)
  const mistletoePrice = getPrice(priceOverrides.mistletoe || "", liveData?.items?.poisonMistletoe)
  const pointPrice = (liveData?.pointsAverageCost || 0) * 25
  const pointRefillCost = pointRefillCount * pointPrice
  const energyConsumableCost = xanaxCount * xanaxPrice + canCount * canPrice + fhcCount * fhcPrice + greenEggCount * 0 + pointRefillCost
  const happyConsumableCost = dvdCount * dvdPrice + yellowEggCount * yellowEggPrice + mistletoeCount * mistletoePrice
  const totalEnergyPlanCost = energyConsumableCost + happyConsumableCost

  const happyJump = useMemo(() => {
    let value = clamp(startingHappy, 0, HAPPY_CAP)
    value = Math.min(HAPPY_CAP, value + xanaxCount * 75)
    value = Math.min(HAPPY_CAP, value + fhcCount * 500)
    value = Math.min(HAPPY_CAP, value + dvdCount * dvdHappy)
    value = Math.min(HAPPY_CAP, value + yellowEggCount * 10000)
    let target = clamp(targetHappy, 0, HAPPY_CAP)
    let mistletoeGain = 0
    for (let index = 0; index < mistletoeCount; index++) {
      const transfer = target * 0.25
      target -= transfer
      mistletoeGain += transfer
      value = Math.min(HAPPY_CAP, value + transfer)
    }
    value = Math.min(HAPPY_CAP, value + otherHappy)
    const beforeEcstasy = value
    const finalHappy = ecstasy ? Math.min(HAPPY_CAP, beforeEcstasy * 2) : beforeEcstasy
    return { beforeEcstasy, finalHappy, mistletoeGain, targetRemaining: target }
  }, [startingHappy, xanaxCount, fhcCount, dvdCount, dvdHappy, yellowEggCount, mistletoeCount, targetHappy, otherHappy, ecstasy])

  const session = useMemo(() => estimateGymSession({
    stat: currentStat, happy: startingHappy, energy: usableEnergy, dots: selectedDots,
    energyPerTrain: selectedGym.energyCost, modifier: effectiveModifier, happyLossRate: happyLossPercent / 100,
  }), [currentStat, startingHappy, usableEnergy, selectedDots, selectedGym.energyCost, effectiveModifier, happyLossPercent])
  const oneTrain = useMemo(() => estimateGymSession({
    stat: currentStat, happy: startingHappy, energy: selectedGym.energyCost, dots: selectedDots,
    energyPerTrain: selectedGym.energyCost, modifier: effectiveModifier, happyLossRate: happyLossPercent / 100,
  }), [currentStat, startingHappy, selectedDots, selectedGym.energyCost, effectiveModifier, happyLossPercent])
  const happySession = useMemo(() => estimateGymSession({
    stat: currentStat, happy: happyJump.finalHappy, energy: usableEnergy, dots: selectedDots,
    energyPerTrain: selectedGym.energyCost, modifier: effectiveModifier, happyLossRate: happyLossPercent / 100,
  }), [currentStat, happyJump.finalHappy, usableEnergy, selectedDots, selectedGym.energyCost, effectiveModifier, happyLossPercent])
  const conservativeSession = useMemo(() => estimateGymSession({
    stat: currentStat, happy: startingHappy, energy: usableEnergy, dots: selectedDots,
    energyPerTrain: selectedGym.energyCost, modifier: effectiveModifier, happyLossRate: 0.6,
  }), [currentStat, startingHappy, usableEnergy, selectedDots, selectedGym.energyCost, effectiveModifier])
  const optimisticSession = useMemo(() => estimateGymSession({
    stat: currentStat, happy: startingHappy, energy: usableEnergy, dots: selectedDots,
    energyPerTrain: selectedGym.energyCost, modifier: effectiveModifier, happyLossRate: 0.4,
  }), [currentStat, startingHappy, usableEnergy, selectedDots, selectedGym.energyCost, effectiveModifier])

  const selectedSePrice = getPrice(priceOverrides.se || "", liveData?.items?.statEnhancers?.[seTargetStat])
  const seCalculation = useMemo(() => {
    let value = currentStat
    let gain = 0
    const count = Math.min(Math.max(0, seQuantity), maxSeByCooldown)
    for (let index = 0; index < count; index++) {
      const increase = Math.min(value * 0.01, SE_GAIN_CAP)
      value += increase
      gain += increase
    }
    return { count, gain, endingStat: value, cost: count * selectedSePrice, perEnhancer: count > 0 ? gain / count : Math.min(value * 0.01, SE_GAIN_CAP) }
  }, [currentStat, seQuantity, maxSeByCooldown, selectedSePrice])

  const naturalEnergyPerDay = energyBar
    ? Math.max(0, safeNumber(energyBar.increment, 5) * 86400 / Math.max(1, safeNumber(energyBar.interval, 600)) * regenMultiplier)
    : 480
  const naturalHappyPerDay = happyBar
    ? Math.max(0, safeNumber(happyBar.increment, 5) * 86400 / Math.max(1, safeNumber(happyBar.interval, 900)))
    : 480
  const dailyEnergyDefault = Math.round(naturalEnergyPerDay + (pointRefillAvailable ? refillBarMaximum : 0))
  const dailyEnergy = dailyEnergyOverride.trim() === "" ? dailyEnergyDefault : clamp(safeNumber(dailyEnergyOverride), 0, 100000)
  const projection = useMemo(() => {
    let stat = currentStat
    let happy = startingHappy
    let totalGain = 0
    const days = clamp(projectionDays, 1, 3650)
    for (let day = 0; day < days; day++) {
      const result = estimateGymSession({
        stat, happy, energy: dailyEnergy, dots: selectedDots,
        energyPerTrain: selectedGym.energyCost, modifier: effectiveModifier, happyLossRate: happyLossPercent / 100,
      })
      stat = result.endingStat
      happy = Math.min(HAPPY_CAP, happy + naturalHappyPerDay - result.trains * selectedGym.energyCost * happyLossPercent / 100)
      totalGain += result.statGain
    }
    return { stat, totalGain, energy: dailyEnergy * days, days }
  }, [currentStat, startingHappy, projectionDays, dailyEnergy, selectedDots, selectedGym.energyCost, effectiveModifier, happyLossPercent, naturalHappyPerDay])

  const currentStatLabel = STAT_OPTIONS.find(option => option.value === selectedStat)?.label || "Strength"
  const modifierBonuses = liveData?.gymModifiers?.[selectedStat]?.bonuses || []
  const currentMarketTimestamp = liveData?.marketUpdatedAt ? new Date(liveData.marketUpdatedAt * 1000).toLocaleString() : ""
  const logRows = history?.logs || []
  const historyConnected = history?.connected === true
  const canRefresh = !loading && Boolean(apiBase && sessionToken)
  const setPriceOverride = (key: string, value: string) => setPriceOverrides(current => ({ ...current, [key]: value }))

  return (
    <div className="training-calculator-page">
      <div className="tc-topbar">
        <button className="tc-back-link" onClick={() => onNavigate("/")}>← Back to Naughty Family Portal</button>
        <div className="tc-user"><span className="tc-user-avatar">{playerName.slice(0, 1).toUpperCase()}</span><span>{playerName}</span></div>
      </div>
      <header className="tc-hero">
        <div className="tc-hero-copy">
          <span className="tc-eyebrow">TORN TRAINING INTELLIGENCE</span>
          <h1>Train with a <em>plan.</em></h1>
          <p>Live battle stats, gym and perk modifiers, energy timing, consumable prices and historical training activity in one place. Estimates only. Nothing is used in-game on your behalf.</p>
        </div>
        <div className="tc-hero-stats">
          <span>LIVE TORN CONNECTION</span>
          <strong>{loading ? "Syncing profile…" : liveData ? "Connected · " + currentStatLabel : "Manual planning mode"}</strong>
          <small>{liveData?.fetchedAt ? "Updated " + new Date(liveData.fetchedAt).toLocaleTimeString() : apiError || "Connect your Torn key to load live values."}</small>
          <button className="tc-refresh-button" onClick={() => setRefreshKey(value => value + 1)} disabled={!canRefresh}>↻ Refresh live data</button>
        </div>
      </header>

      <section className="tc-profile-strip" aria-label="Live battle stats">
        {STAT_OPTIONS.map(option => {
          const amount = liveData?.battleStats?.[option.value]
          return <button type="button" key={option.value} className={"tc-profile-stat" + (selectedStat === option.value ? " is-selected" : "")}
            onClick={() => setSelectedStat(option.value)}>
            <span>{option.label}</span><strong>{amount === null || amount === undefined ? "—" : fmt(amount)}</strong>
            <small>{liveData ? "Live Torn stat" : "Awaiting API"}</small>
          </button>
        })}
        <div className="tc-profile-stat tc-profile-gym"><span>Active gym</span><strong>{liveData?.gym?.name || "Not synced"}</strong><small>{selectedGym.name} selected for this plan</small></div>
      </section>
      {apiError && <div className="tc-inline-warning" role="status">{apiError} Manual values remain editable while the connection is repaired.</div>}

      <nav className="tc-tabs" aria-label="Training calculator sections">
        {[
          ["session", "01", "Gym trains"],
          ["energy", "02", "Energy supply"],
          ["happy", "03", "99K Happy Jump"],
          ["enhancers", "04", "Stat enhancers"],
          ["projection", "05", "Long-term plan"],
        ].map(([key, number, label]) => (
          <button key={key} type="button" data-testid={"training-tab-" + key} className={activeTab === key ? "is-active" : ""}
            onClick={() => setActiveTab(key as TabKey)}><span>{number}</span>{label}</button>
        ))}
      </nav>

      {activeTab === "session" && <main className="tc-layout">
        <div className="tc-results-column">
          <Panel title="Your training setup" eyebrow="LIVE PROFILE + SCENARIO" description="Battle stats default to Torn's current values. Enter a different value to model a what-if scenario.">
            <div className="tc-form-grid">
              <label className="tc-field"><span>Battle stat</span><select data-testid="training-stat-select" value={selectedStat} onChange={event => setSelectedStat(event.target.value as StatKey)}>
                {STAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
              <label className="tc-field"><span>Gym</span><select data-testid="training-gym-select" value={gymId} onChange={event => setSelectedGymId(event.target.value)}>
                {gyms.map(gym => <option key={gym.id} value={gym.id}>{gym.name}{liveData?.gym?.id === String(gym.id) ? " · Active" : ""}</option>)}
              </select><small className="tc-hint">Defaults to your active Torn gym. Only gyms available to your account are listed.</small></label>
              <TextNumberField label={currentStatLabel + " battle stat"} value={statOverride} fallbackValue={liveStatValue}
                onChange={value => setManualStats(current => ({ ...current, [selectedStat]: value }))}
                hint={liveStatSource + ". Clear the field to restore the live API value."} testId="training-stat-value" />
              <div className="tc-readout-field"><span>Selected gym efficiency</span><strong>{selectedDots ? fmt(selectedDots, 2) + " dots" : "Unavailable"}</strong><small>{fmt(selectedGym.energyCost)} energy per individual train</small></div>
              <div className="tc-readout-field"><span>Automatic gym-gain modifier</span><strong>{fmt(autoModifier, 4)}×</strong><small>Calculated from current /user/perks bonuses for {currentStatLabel.toLowerCase()}</small></div>
              <label className="tc-check-field"><input type="checkbox" checked={manualModifierEnabled} onChange={event => setManualModifierEnabled(event.target.checked)} />
                <span><strong>Override API gym modifier</strong><small>Leave off to use the live modifier calculated from Torn perks.</small></span>
              </label>
              {manualModifierEnabled && <NumberField label="Manual gym-gain modifier" value={safeNumber(manualModifier)} onChange={value => setManualModifier(value === 0 ? "" : String(value))}
                min={0} max={100} step={0.0001} hint={"Maximum 100×. Live API modifier is " + fmt(autoModifier, 4) + "×."} />}
              <TextNumberField label="Starting happiness" value={manualHappy} fallbackValue={happyBar ? happyBar.current : 5025}
                onChange={setManualHappy} max={HAPPY_CAP} hint="Live from your Torn bars. A cleared field returns to your current API value." testId="training-session-happy" />
              <NumberField label="Happy lost per energy" value={happyLossPercent} onChange={setHappyLossPercent} min={40} max={60} step={1}
                suffix="%" hint="Torn's current best-estimate range is 40–60%. Default 50%; adjust for a conservative or optimistic model." />
            </div>
            {modifierBonuses.length > 0 && <div className="tc-inline-note"><strong>Live perk sources:</strong> {modifierBonuses.join(" · ")}</div>}
            {selectedGym.note && <div className="tc-inline-note">{selectedGym.note}</div>}
            <div className="tc-inline-note"><strong>Training math:</strong> Each row applies the current stat and remaining happiness to the next train. Gym gains are estimates and can differ slightly from Torn's result.</div>
          </Panel>
          <Panel title="Current perk inputs" eyebrow="AUTOMATIC MODIFIERS" description="The API's active books, education and other named perks are read on refresh.">
            <div className="tc-condition-list">
              <div><span>Live modifier for {currentStatLabel}</span><strong>{fmt(autoModifier, 4)}×</strong></div>
              <div><span>Current active books</span><strong>{(liveData?.perks?.book || []).length ? liveData!.perks.book.join(", ") : "None returned"}</strong></div>
              <div><span>Faction gym perks</span><strong>{(liveData?.perks?.faction || []).filter(value => /gym|training|steadfast/i.test(value)).join(", ") || "No gym bonus returned"}</strong></div>
              <div><span>Education gym perks</span><strong>{(liveData?.perks?.education || []).filter(value => /sports science|strength and conditioning|physiological testing|human movement|bio mechanical/i.test(value)).join(", ") || "No matching course returned"}</strong></div>
            </div>
            <p className="tc-muted">The modifier is built as the product of applicable percentage bonuses, not added as a flat stat amount. Unknown perks are not guessed.</p>
          </Panel>
        </div>
        <aside className="tc-results-column">
          <Panel title="Session forecast" eyebrow="LIVE STAT + ENERGY PLAN" description="Your train count is based on the usable energy plan, including natural regeneration and sequential full-bar refills.">
            <div className="tc-metric-grid">
              <Metric label="Projected stat gain" value={"+" + fmt(session.statGain, 2)} detail={session.trains + " individual trains"} tone="green" />
              <Metric label="First 1× train" value={"+" + fmt(oneTrain.statGain, 2)} detail={fmt(selectedGym.energyCost) + "E · " + currentStatLabel} tone="blue" />
              <Metric label="Usable training energy" value={fmt(usableEnergy) + "E"} detail="Total energy spent through the planned sequence" />
              <Metric label="Energy per train" value={fmt(selectedGym.energyCost) + "E"} detail={fmt(session.energyUsed) + "E actually used"} />
            </div>
            <div className="tc-compare-row">
              <div><span>Conservative · 60% happy loss</span><strong>+{fmt(conservativeSession.statGain, 2)}</strong></div>
              <div><span>Optimistic · 40% happy loss</span><strong>+{fmt(optimisticSession.statGain, 2)}</strong></div>
            </div>
            <div className="tc-result-total"><span>Projected ending {currentStatLabel.toLowerCase()}</span><strong>{fmt(session.endingStat, 2)}</strong></div>
            <div className="tc-result-total"><span>Happiness after planned trains</span><strong>{fmt(session.endingHappy, 0)}</strong></div>
          </Panel>
          <Panel title="Individual 1× train breakdown" eyebrow="STEP-BY-STEP GAINS" description="Each row recalculates using the stat and happiness left by the prior train.">
            {session.rows.length ? <div className="tc-train-table-scroll" role="region" aria-label="Individual gym train stat gains" tabIndex={0}>
              <table className="tc-train-table"><thead><tr><th>Train</th><th>Happy</th><th>Gain</th><th>Stat after</th></tr></thead>
                <tbody>{session.rows.map(row => <tr key={row.train}><td>#{row.train}</td><td>{fmt(row.happyBefore)}</td><td>+{fmt(row.gain, 2)}</td><td>{fmt(row.statAfter, 2)}</td></tr>)}</tbody>
              </table>
            </div> : <p className="tc-muted">Add usable energy in the Energy Supply tab to see each individual train.</p>}
          </Panel>
        </aside>
      </main>}

      {activeTab === "energy" && <main className="tc-layout">
        <div className="tc-results-column">
          <Panel title="Build your usable energy plan" eyebrow="NATURAL ENERGY + CONSUMABLES" description="Choose the book you will use, then enter the quantities of Xanax, FHCs and energy drinks. Refill items assume you train down before each full-bar refill.">
            <div className="tc-form-grid">
              <label className="tc-field"><span>Book for this training plan</span><select data-testid="training-book-choice" value={bookChoice} onChange={event => setBookChoice(event.target.value)}>
                <option value="auto">Use active book from API</option><option value="none">No energy book</option>
                <option value="fuelling">Fuelling Your Way to Failure · 2× drink energy</option>
                <option value="higher-daddy">Higher Daddy, Higher! · +20% natural energy</option>
                <option value="ugly-energy">Ugly Energy · +100 refill/bar capacity</option>
                <option value="self-control">Self Control Is for Losers · ½ booster cooldown</option>
              </select><small className="tc-hint">Auto detects your active book from /user/perks. Pick a future book to model a planned jump.</small></label>
              <NumberField label="Hours until you train" value={waitHours} onChange={setWaitHours} min={0} max={168} step={0.25}
                hint="Maximum 168 hours. Natural energy is calculated from your live bar tick and remaining time to its next tick." suffix="hours" />
              <TextNumberField label="Current energy" value={manualEnergy} fallbackValue={energyBar ? energyBar.current : null}
                onChange={setManualEnergy} max={ENERGY_HARD_CAP} hint="Live Torn bar value. Maximum energy held at once is 1,000." testId="training-current-energy" />
              <div className="tc-readout-field"><span>Natural energy by training time</span><strong>+{fmt(naturalEnergy)}E</strong><small>{energyBar ? fmt(energyBar.increment) + "E every " + fmt(energyBar.interval / 60, 2) + " minutes" : "Waiting for live bar data"}</small></div>
              <NumberField label="Xanax for this train" value={xanaxCount} onChange={setXanaxCount} min={0} max={maximumXanax}
                hint={"Maximum " + maximumXanax + " doses in a 1,000E Xanax stack. Each gives +250E and +75 happy; overdose risk is not modeled."} testId="training-xanax-count" />
              <NumberField label="Feathery Hotel Coupons" value={fhcCount} onChange={setFhcCount} min={0} max={maximumFhcCount}
                hint={"Maximum " + maximumFhcCount + " at the remaining booster-cooldown budget. Each refills the bar to " + fmt(refillBarMaximum) + "E and gives +500 happy."} testId="training-fhc-count" />
              <label className="tc-field"><span>Energy drink</span><select data-testid="training-can-type" value={canId} onChange={event => setCanId(event.target.value)}>
                {ENERGY_DRINKS.map(item => <option key={item.id} value={item.id}>{item.name} · {item.energy}E</option>)}
              </select></label>
              <NumberField label="Energy drinks" value={canCount} onChange={setCanCount} min={0} max={maximumCanCount}
                hint={"Maximum " + maximumCanCount + " before using other booster items. Voracity ×1.5 and Fuelling ×2 apply to base energy."} testId="training-can-count" />
              <NumberField label="Green Easter Eggs" value={greenEggCount} onChange={setGreenEggCount} min={0} max={maximumYellowEggCount}
                hint={"Each gives +500E and adds 6 hours of booster cooldown. Maximum " + maximumYellowEggCount + " at the current cooldown budget."} testId="training-green-egg-count" />
              <NumberField label="Other energy sources" value={otherEnergy} onChange={setOtherEnergy} min={0} max={100000}
                hint="Manual addition for energy not listed above. Maximum 100,000E per plan." />
              <label className="tc-check-field"><input type="checkbox" checked={pointRefillIncluded} disabled={!pointRefillAvailable}
                onChange={event => setPointRefillIncluded(event.target.checked)} />
                <span><strong>Include daily 25-point energy refill</strong><small>{pointRefillAvailable ? "Available now. Refills the bar to " + fmt(refillBarMaximum) + "E." : "Torn reports this daily energy refill as unavailable or already used."}</small></span>
              </label>
              <label className="tc-check-field"><input type="checkbox" checked={factionVoracity || activeVoracity} disabled={activeVoracity}
                onChange={event => setFactionVoracity(event.target.checked)} />
                <span><strong>Faction Voracity</strong><small>{activeVoracity ? "Detected from your live faction perks." : "Scenario toggle. Increases energy drinks by 50% and may extend the booster cooldown budget."}</small></span>
              </label>
            </div>
            <div className="tc-inline-note"><strong>Supply order modeled:</strong> natural energy → current bar → point refill / FHC full-bar refills → Xanax and energy drinks. Full-bar refills assume you train down before each refill. Torn's 1,000E limit is the amount you can hold at once, not a limit on total energy spent after sequential refills.</div>
            <div className="tc-form-grid tc-price-grid">
              <PriceField label="Xanax · live Item Market average" value={priceOverrides.xanax || ""} autoValue={marketPrice(liveData?.items?.xanax)} onChange={value => setPriceOverride("xanax", value)} hint={liveData?.items?.xanax?.name || "Live price not returned"} testId="training-xanax-price" />
              <PriceField label={drink.name + " · live Item Market average"} value={priceOverrides.can || ""} autoValue={marketPrice(liveData?.items?.energyDrinks?.[canId])} onChange={value => setPriceOverride("can", value)} hint={liveData?.items?.energyDrinks?.[canId]?.name || "Live price not returned"} testId="training-can-price" />
              <PriceField label="Feathery Hotel Coupon · live Item Market average" value={priceOverrides.fhc || ""} autoValue={marketPrice(liveData?.items?.fhc)} onChange={value => setPriceOverride("fhc", value)} hint={liveData?.items?.fhc?.name || "Live price not returned"} testId="training-fhc-price" />
            </div>
          </Panel>
        </div>
        <aside className="tc-results-column">
          <Panel title="Usable energy forecast" eyebrow="SEQUENTIAL ENERGY BUDGET" description="Total training energy across the planned refills and consumables.">
            <div className="tc-energy-total"><strong>{fmt(usableEnergy)}</strong><span>usable energy for this training plan</span></div>
            <div className="tc-condition-list">
              <div><span>Current energy + natural regen</span><strong>{fmt(energyAfterNatural)}E</strong></div>
              <div><span>Daily point refill</span><strong>{fmt(energyFromRefills)}E</strong></div>
              <div><span>FHC full-bar refills</span><strong>{fmt(energyFromFhcs)}E</strong></div>
              <div><span>Xanax</span><strong>{fmt(energyFromXanax)}E</strong></div>
              <div><span>Energy drinks</span><strong>{fmt(energyFromCans, 1)}E</strong></div>
              <div><span>Green Easter Eggs</span><strong>{fmt(energyFromGreenEggs)}E</strong></div>
              <div><span>Other energy</span><strong>{fmt(otherEnergy)}E</strong></div>
            </div>
            <div className="tc-result-total"><span>Maximum held at once</span><strong>{fmt(ENERGY_HARD_CAP)}E</strong></div>
            <div className="tc-result-total"><span>Booster cooldown left after plan</span><strong>{fmt(cooldownRemainingHours, 1)}h</strong></div>
            <div className="tc-result-total"><span>Planned supply cost</span><strong>{money(totalEnergyPlanCost)}</strong></div>
            <div className="tc-inline-note"><strong>Point refill estimate:</strong> {liveData?.pointsAverageCost ? "25 points × " + money(liveData.pointsAverageCost) + " average cost per point = " + money(pointPrice) + "." : "Torn's points_average_cost is not available; refill cost is omitted."}</div>
            {liveData?.marketUpdatedAt ? <p className="tc-muted">Item Market cache timestamp: {currentMarketTimestamp}. Prices are Torn's market average, not guaranteed purchase quotes.</p> : <p className="tc-muted">Item Market prices appear here when the public Torn key and market selections are available.</p>}
          </Panel>
          <Panel title="Energy rules in this plan" eyebrow="AUTOMATIC GAME LIMITS">
            <div className="tc-condition-list">
              <div><span>Energy held hard cap</span><strong>1,000E</strong></div>
              <div><span>Current bar maximum</span><strong>{fmt(refillBarMaximum)}E</strong></div>
              <div><span>Natural energy in selected wait</span><strong>+{fmt(naturalEnergy)}E</strong></div>
              <div><span>Cooldown budget remaining</span><strong>{fmt(boosterBudgetHours, 1)}h</strong></div>
              <div><span>Drug cooldown reported</span><strong>{fmt(safeNumber(liveData?.cooldowns?.drug) / 3600, 1)}h</strong></div>
            </div>
            <p className="tc-muted">Energy drinks and stat boosters share the booster cooldown. The planner subtracts existing cooldown and the items selected for this plan.</p>
          </Panel>
        </aside>
      </main>}

      {activeTab === "happy" && <main className="tc-layout">
        <div className="tc-results-column">
          <Panel title="99K Happy Jump sequence" eyebrow="ITEM ORDER MATTERS" description="All happiness items are applied before Ecstasy. Ecstasy is the final consumable immediately before gym training.">
            <div className="tc-happy-meter">
              <div className="tc-happy-meter-top"><span>Projected happiness before training</span><strong>{fmt(happyJump.finalHappy)}</strong></div>
              <div className="tc-meter-track"><i style={{ width: (happyJump.finalHappy / HAPPY_CAP * 100) + "%" }} /></div>
              <div className="tc-happy-meter-foot"><span>0 happy</span><span>99,999 maximum</span></div>
            </div>
            <div className="tc-form-grid">
              <TextNumberField label="Starting happiness" value={manualHappy} fallbackValue={happyBar ? happyBar.current : 5025}
                onChange={setManualHappy} max={HAPPY_CAP} hint="Automatically uses your live Torn happy bar." testId="training-current-happy" />
              <div className="tc-readout-field"><span>Xanax planned</span><strong>{fmt(xanaxCount)} × +75 happy</strong><small>Quantity comes from Energy Supply.</small></div>
              <div className="tc-readout-field"><span>FHC planned</span><strong>{fmt(fhcCount)} × +500 happy</strong><small>Quantity comes from Energy Supply.</small></div>
              <NumberField label="Erotic DVDs" value={dvdCount} onChange={setDvdCount} min={0} max={maximumDvdCount}
                hint={"Maximum " + maximumDvdCount + " at the current booster-cooldown budget. Each gives " + fmt(dvdHappy) + " happy."} testId="training-dvd-count" />
              <label className="tc-field"><span>Happy per Erotic DVD</span><select data-testid="training-dvd-happy" value={String(dvdHappy)} onChange={event => setDvdHappy(Number(event.target.value))}>
                <option value="2500">2,500 · standard</option><option value="5000">5,000 · 10★ Adult Novelties</option>
              </select></label>
              <NumberField label="Yellow Easter Eggs" value={yellowEggCount} onChange={setYellowEggCount} min={0} max={maximumYellowEggCount}
                hint={"Each adds +10,000 happy and 6h booster cooldown. Maximum " + maximumYellowEggCount + " by remaining cooldown."} testId="training-yellow-egg-count" />
              <NumberField label="Poison Mistletoe uses" value={mistletoeCount} onChange={setMistletoeCount} min={0} max={maximumMistletoeCount}
                hint={"Maximum " + maximumMistletoeCount + " from the target's current happy. Each use transfers 25% of their remaining happy."} testId="training-mistletoe-count" />
              <NumberField label="Target's current happiness" value={targetHappy} onChange={setMistletoeTargetHappy} min={0} max={HAPPY_CAP}
                hint="Required to estimate Poison Mistletoe. Each use reduces the target's remaining happy by 25%." testId="training-mistletoe-target" />
              <NumberField label="Other flat happiness" value={otherHappy} onChange={setOtherHappy} min={0} max={HAPPY_CAP}
                hint="Optional manual value for other confirmed happy sources. Maximum 99,999." testId="training-other-happy" />
              <label className="tc-check-field"><input type="checkbox" data-testid="training-ecstasy" checked={ecstasy} onChange={event => setEcstasy(event.target.checked)} />
                <span><strong>Use Ecstasy last</strong><small>Doubles the accumulated happiness, capped at 99,999. Wait for the Xanax drug cooldown to clear before taking Ecstasy.</small></span>
              </label>
            </div>
            <div className="tc-inline-note"><strong>Sequence:</strong> Xanax → FHC → Erotic DVDs → Yellow Easter Eggs → Poison Mistletoe → other happy → Ecstasy → train. This planner does not assume drug cooldowns can be bypassed.</div>
            <div className="tc-form-grid tc-price-grid">
              <PriceField label="Erotic DVD · live Item Market average" value={priceOverrides.dvd || ""} autoValue={marketPrice(liveData?.items?.eroticDvd)} onChange={value => setPriceOverride("dvd", value)} hint={liveData?.items?.eroticDvd?.name || "Live market price not returned"} testId="training-dvd-price" />
              <PriceField label="Yellow Easter Egg · live Item Market average" value={priceOverrides.yellowEgg || ""} autoValue={marketPrice(liveData?.items?.yellowEgg)} onChange={value => setPriceOverride("yellowEgg", value)} hint={liveData?.items?.yellowEgg?.name || "If untradeable, no market listing exists."} testId="training-yellow-egg-price" />
              <PriceField label="Poison Mistletoe · live Item Market average" value={priceOverrides.mistletoe || ""} autoValue={marketPrice(liveData?.items?.poisonMistletoe)} onChange={value => setPriceOverride("mistletoe", value)} hint={liveData?.items?.poisonMistletoe?.name || "Live market price not returned"} />
            </div>
          </Panel>
        </div>
        <aside className="tc-results-column">
          <Panel title="Happy jump forecast" eyebrow="PRE-TRAIN RESULT">
            <div className="tc-metric-grid">
              <Metric label="After all happiness items" value={fmt(happyJump.beforeEcstasy)} detail="Before Ecstasy" tone="blue" />
              <Metric label="After Ecstasy" value={fmt(happyJump.finalHappy)} detail="Hard cap 99,999" tone="green" />
              <Metric label="Happiness from mistletoe" value={"+" + fmt(happyJump.mistletoeGain)} detail={"Target left with " + fmt(happyJump.targetRemaining)} />
              <Metric label="Projected stat gain" value={"+" + fmt(happySession.statGain, 2)} detail={happySession.trains + " trains from your energy plan"} tone="green" />
            </div>
            <div className="tc-result-total"><span>Happy used as the first training input</span><strong>{fmt(happyJump.finalHappy)}</strong></div>
            <p className="tc-muted">The happy bar also regenerates naturally at the rate shown by your live Torn bars. This estimate uses the entered starting happy, not a guessed default when live data is present.</p>
          </Panel>
          <Panel title="Jump checklist" eyebrow="BEFORE YOU TRAIN">
            <div className="tc-condition-list">
              <div><span>All Xanax doses used first</span><strong>{xanaxCount} planned</strong></div>
              <div><span>Booster items before Ecstasy</span><strong>{fmt(fhcCount + dvdCount + yellowEggCount + mistletoeCount)} planned</strong></div>
              <div><span>Ecstasy is last consumable</span><strong>{ecstasy ? "Included" : "Not included"}</strong></div>
              <div><span>Happy cap reached</span><strong>{happyJump.finalHappy >= HAPPY_CAP ? "Yes" : "Not yet"}</strong></div>
            </div>
            <p className="tc-muted">Ecstasy itself causes drug cooldown. Timing between Xanax and Ecstasy matters; do not treat the item order as permission to ignore Torn's drug cooldown.</p>
          </Panel>
        </aside>
      </main>}

      {activeTab === "enhancers" && <main className="tc-layout">
        <div className="tc-results-column">
          <Panel title="Permanent Stat Enhancers" eyebrow="LIVE MARKET + 1% STAT INCREASE" description="Torn's four Stat Enhancers permanently increase one battle stat by 1% each. Every use adds 6 hours of booster cooldown.">
            <div className="tc-form-grid">
              <label className="tc-field"><span>Stat to enhance</span><select value={seTargetStat} onChange={event => setSeTargetStat(event.target.value as StatKey)}>
                {STAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
              <NumberField label="Number of Stat Enhancers" value={seQuantity} onChange={setSeQuantity} min={0} max={maxSeByCooldown}
                hint={"Maximum " + maxSeByCooldown + " by your remaining booster-cooldown capacity. The gain from each individual SE is capped at 5 trillion."} testId="training-se-quantity" />
              <TextNumberField label={STAT_OPTIONS.find(option => option.value === seTargetStat)?.label + " battle stat"} value={manualStats[seTargetStat]} fallbackValue={liveData?.battleStats?.[seTargetStat] ?? null}
                onChange={value => setManualStats(current => ({ ...current, [seTargetStat]: value }))} hint="Uses the live battle stat unless you override it." />
              <PriceField label="Selected Stat Enhancer · live Item Market average" value={priceOverrides.se || ""} autoValue={marketPrice(liveData?.items?.statEnhancers?.[seTargetStat])}
                onChange={value => setPriceOverride("se", value)} hint={liveData?.items?.statEnhancers?.[seTargetStat]?.name || "Live market price not returned"} testId="training-se-price" />
            </div>
            <div className="tc-inline-note">The model applies each 1% increase sequentially, then caps each enhancer's individual gain at 5 trillion. No legacy 50M battle-stat cap is applied.</div>
          </Panel>
        </div>
        <aside className="tc-results-column">
          <Panel title="Stat enhancer forecast" eyebrow="PERMANENT STAT GAIN">
            <div className="tc-metric-grid">
              <Metric label="Projected stat gain" value={"+" + fmt(seCalculation.gain, 2)} detail={seCalculation.count + " Stat Enhancers"} tone="green" />
              <Metric label="Gain per enhancer" value={"+" + fmt(seCalculation.perEnhancer, 2)} detail="1% of current stat, max 5T per SE" />
              <Metric label="Total market cost" value={money(seCalculation.cost)} detail={money(selectedSePrice) + " each"} tone="amber" />
              <Metric label="Booster cooldown added" value={fmt(seCalculation.count * 6)} detail="Hours before Self Control modifiers" />
            </div>
            <div className="tc-result-total"><span>Projected ending {STAT_OPTIONS.find(option => option.value === seTargetStat)?.label.toLowerCase()}</span><strong>{fmt(seCalculation.endingStat, 2)}</strong></div>
            <div className="tc-inline-note"><strong>Item mapping:</strong> Dumbbells → Strength · Boxing Gloves → Defense · Skateboard → Speed · Parachute → Dexterity.</div>
          </Panel>
          <Panel title="Other permanent training" eyebrow="WHAT THE CALCULATOR COVERS">
            <div className="tc-condition-list">
              <div><span>Gym training</span><strong>Included · live dots + perks</strong></div>
              <div><span>Stat Enhancers</span><strong>Included · live market</strong></div>
              <div><span>Education and gym-gain books</span><strong>Included in API modifier</strong></div>
              <div><span>Temporary combat drug effects</span><strong>Not counted as permanent growth</strong></div>
            </div>
            <p className="tc-muted">Passive battle-stat education bonuses and company/job special stat awards are not treated as ordinary gym trains. They can be layered into a custom scenario when you know the resulting stat change.</p>
          </Panel>
        </aside>
      </main>}

      {activeTab === "projection" && <main className="tc-layout">
        <div className="tc-results-column">
          <Panel title="Long-term training plan" eyebrow="LIVE REGEN + DAILY REFILL" description="The default daily energy budget uses your API energy regeneration rate plus the daily refill when Torn reports it is available. Override it for a custom routine.">
            <div className="tc-form-grid">
              <label className="tc-field"><span>Projection stat</span><select value={selectedStat} onChange={event => setSelectedStat(event.target.value as StatKey)}>
                {STAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
              <NumberField label="Projection days" value={projectionDays} onChange={setProjectionDays} min={1} max={3650} hint="Maximum 3,650 days (10 years)." testId="training-projection-days" />
              <NumberField label="Daily training energy" value={dailyEnergy} onChange={value => setDailyEnergyOverride(value === 0 ? "" : String(value))} min={0} max={100000}
                hint={"Auto: " + fmt(naturalEnergyPerDay) + "E natural regeneration" + (pointRefillAvailable ? " + " + fmt(refillBarMaximum) + "E daily refill" : "") + ". Maximum 100,000E/day."} testId="training-daily-energy" />
              <div className="tc-readout-field"><span>Natural happy regeneration</span><strong>+{fmt(naturalHappyPerDay)} / day</strong><small>Calculated from your live happy bar interval.</small></div>
            </div>
            <div className="tc-inline-note">Daily projection is based on the selected gym, battle stat, live perk modifier and assumed happy loss. It does not assume a 99K happy jump every day. Set a daily energy amount that is sustainable for your chosen supplies.</div>
          </Panel>
        </div>
        <aside className="tc-results-column">
          <Panel title="Projected training progress" eyebrow="COMPOUNDED DAILY MODEL">
            <div className="tc-metric-grid">
              <Metric label="Projected stat gain" value={"+" + fmt(projection.totalGain, 2)} detail={projection.days + " training days"} tone="green" />
              <Metric label="Projected ending stat" value={fmt(projection.stat, 2)} detail={currentStatLabel + " scenario"} />
              <Metric label="Total energy trained" value={fmt(projection.energy) + "E"} detail={fmt(dailyEnergy) + "E/day"} tone="blue" />
              <Metric label="Energy regenerated daily" value={fmt(naturalEnergyPerDay) + "E"} detail="Natural energy estimate from API bars" />
            </div>
          </Panel>
          <Panel title="Projection assumptions" eyebrow="TRANSPARENT INPUTS">
            <div className="tc-condition-list">
              <div><span>Current battle stat source</span><strong>{liveStatSource}</strong></div>
              <div><span>Current gym</span><strong>{selectedGym.name}</strong></div>
              <div><span>Gym gain modifier</span><strong>{fmt(effectiveModifier, 4)}×</strong></div>
              <div><span>Happy loss assumption</span><strong>{happyLossPercent}% / train energy</strong></div>
            </div>
          </Panel>
        </aside>
      </main>}

      <section className="tc-history-panel">
        <div className="tc-history-heading"><div><span>YOUR TORN ACTIVITY</span><h2>Gym training history</h2></div><span>{historyLoading ? "Syncing…" : historyConnected ? fmt(history?.totalLogs || logRows.length) + " records collected" : "Not connected"}</span></div>
        {historyLoading ? <p className="tc-muted">Loading your saved gym-training history…</p> : historyConnected && logRows.length > 0 ? (
          <div className="tc-log-list">{logRows.slice(0, 6).map(log => <div className="tc-log-row" key={log.logId}>
            <span>{prettyDate(log.timestamp)}</span><strong>{shortLogDetails(log)}</strong><small>Log #{log.logId}</small>
          </div>)}</div>
        ) : historyConnected ? <p className="tc-muted">Your log collection is connected. No gym-training records have been collected yet.</p> : (
          <div className="tc-history-empty"><p>{history?.error || (history?.collectionEnabled ? "Your main portal consent is enabled, but Gym Training history still needs its User → Log key connection." : "Gym-training history is private. Enable historical collection and connect a key with User → Log access in Account Settings.")}</p>
            <button className="tc-secondary-button" onClick={() => onNavigate("/settings")}>Open Account Settings →</button>
          </div>
        )}
      </section>
      {liveData?.errors && Object.keys(liveData.errors).length > 0 && <details className="tc-data-warnings"><summary>Live data fields that could not be refreshed ({Object.keys(liveData.errors).length})</summary>
        {Object.entries(liveData.errors).map(([key, message]) => <p key={key}><strong>{key}:</strong> {message}</p>)}
      </details>}
      <footer className="tc-footer"><span>NAUGHTY FAMILY · TRAINING CALCULATOR · TORN API-POWERED</span><span>Estimates only · never sends training actions to Torn</span></footer>
    </div>
  )

  function setDailyEnergyOverrideNumber(value: number) {
    setDailyEnergyOverride(String(value))
  }
}
