import { useMemo, useState } from "react"
import "./training-calculator.css"

type StatKey = "strength" | "defense" | "speed" | "dexterity"
type TabKey = "session" | "happy" | "energy" | "enhancers" | "projection"

type GymPreset = {
  id: string
  name: string
  energy: number
  dots: Record<StatKey, number | null>
  note?: string
}

const STAT_OPTIONS: Array<{ value: StatKey; label: string }> = [
  { value: "strength", label: "Strength" },
  { value: "defense", label: "Defense" },
  { value: "speed", label: "Speed" },
  { value: "dexterity", label: "Dexterity" },
]

const GYMS: GymPreset[] = [
  { id: "premier", name: "Premier Fitness", energy: 5, dots: { strength: 2, defense: 2, speed: 2, dexterity: 2 } },
  { id: "average", name: "Average Joes", energy: 5, dots: { strength: 2.4, defense: 2.8, speed: 2.4, dexterity: 2.4 } },
  { id: "woodys", name: "Woody's Workout", energy: 5, dots: { strength: 2.8, defense: 3, speed: 3.2, dexterity: 2.8 } },
  { id: "beach", name: "Beach Bods", energy: 5, dots: { strength: 3.2, defense: 3.2, speed: 3.2, dexterity: null } },
  { id: "silver", name: "Silver Gym", energy: 5, dots: { strength: 3.4, defense: 3.4, speed: 3.6, dexterity: 3.2 } },
  { id: "pour-femme", name: "Pour Femme", energy: 5, dots: { strength: 3.4, defense: 3.6, speed: 3.6, dexterity: 3.8 } },
  { id: "davies", name: "Davies Den", energy: 5, dots: { strength: 3.7, defense: 3.7, speed: null, dexterity: 3.7 } },
  { id: "global", name: "Global Gym", energy: 5, dots: { strength: 4, defense: 4, speed: 4, dexterity: 4 } },
  { id: "knuckle", name: "Knuckle Heads", energy: 10, dots: { strength: 4.8, defense: 4, speed: 4.4, dexterity: 4.2 } },
  { id: "pioneer", name: "Pioneer Fitness", energy: 10, dots: { strength: 4.4, defense: 4.8, speed: 4.5, dexterity: 4.4 } },
  { id: "anabolic", name: "Anabolic Anomalies", energy: 10, dots: { strength: 5, defense: 5.2, speed: 4.5, dexterity: 4.5 } },
  { id: "core", name: "Core", energy: 10, dots: { strength: 5, defense: 5, speed: 5.2, dexterity: 5 } },
  { id: "racing", name: "Racing Fitness", energy: 10, dots: { strength: 5, defense: 4.8, speed: 5.4, dexterity: 5.2 } },
  { id: "complete-cardio", name: "Complete Cardio", energy: 10, dots: { strength: 5.5, defense: 5.5, speed: 5.8, dexterity: 5.2 } },
  { id: "legs", name: "Legs, Bums and Tums", energy: 10, dots: { strength: null, defense: 5.6, speed: 5.6, dexterity: 5.8 } },
  { id: "deep-burn", name: "Deep Burn", energy: 10, dots: { strength: 6, defense: 6, speed: 6, dexterity: 6 } },
  { id: "apollo", name: "Apollo Gym", energy: 10, dots: { strength: 6, defense: 6.4, speed: 6.2, dexterity: 6.2 } },
  { id: "gun-shop", name: "Gun Shop", energy: 10, dots: { strength: 6.6, defense: 6.2, speed: 6.4, dexterity: 6.2 } },
  { id: "force", name: "Force Training", energy: 10, dots: { strength: 6.4, defense: 6.4, speed: 6.6, dexterity: 6.8 } },
  { id: "cha-chas", name: "Cha Cha's", energy: 10, dots: { strength: 6.4, defense: 6.8, speed: 6.4, dexterity: 7 } },
  { id: "atlas", name: "Atlas", energy: 10, dots: { strength: 7, defense: 6.4, speed: 6.4, dexterity: 6.6 } },
  { id: "last-round", name: "Last Round", energy: 10, dots: { strength: 6.8, defense: 7, speed: 6.6, dexterity: 6.6 } },
  { id: "edge", name: "The Edge", energy: 10, dots: { strength: 6.8, defense: 7, speed: 7, dexterity: 6.8 } },
  { id: "georges", name: "George's", energy: 10, dots: { strength: 7.3, defense: 7.3, speed: 7.3, dexterity: 7.3 } },
  { id: "balboas", name: "Balboas Gym", energy: 25, dots: { strength: null, defense: 7.5, speed: null, dexterity: 7.5 }, note: "Requires Cha Cha's and Defense + Dexterity 25% above Strength + Speed." },
  { id: "frontline", name: "Frontline Fitness", energy: 25, dots: { strength: 7.5, defense: null, speed: 7.5, dexterity: null }, note: "Requires Cha Cha's and Strength + Speed 25% above Dexterity + Defense." },
  { id: "gym-3000", name: "Gym 3000", energy: 50, dots: { strength: 8, defense: null, speed: null, dexterity: null }, note: "Requires George's and Strength 25% above your second-highest stat." },
  { id: "isoyamas", name: "Mr. Isoyama's", energy: 50, dots: { strength: null, defense: 8, speed: null, dexterity: null }, note: "Requires George's and Defense 25% above your second-highest stat." },
  { id: "total-rebound", name: "Total Rebound", energy: 50, dots: { strength: null, defense: null, speed: 8, dexterity: null }, note: "Requires George's and Speed 25% above your second-highest stat." },
  { id: "elites", name: "Elites", energy: 50, dots: { strength: null, defense: null, speed: null, dexterity: 8 }, note: "Requires George's and Dexterity 25% above your second-highest stat." },
  { id: "ssl", name: "Sports Science Lab", energy: 25, dots: { strength: 9, defense: 9, speed: 9, dexterity: 9 }, note: "Requires Last Round and no more than 150 Xanax + Ecstasy taken in total." },
  { id: "fight-club", name: "Fight Club", energy: 10, dots: { strength: 10, defense: 10, speed: 10, dexterity: 10 }, note: "Membership is invite-only." },
  { id: "crims", name: "Crims Gym (Jail)", energy: 5, dots: { strength: 3.4, defense: 4.5, speed: 3.4, dexterity: null }, note: "Available only while in jail." },
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
const SE_GAIN_CAP = 5_000_000_000_000

function safeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, safeNumber(value, min)))
}
function fmt(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits, minimumFractionDigits: 0 })
}
function money(value: number): string {
  return "$" + fmt(value)
}

type SessionResult = {
  trains: number
  energyUsed: number
  statGain: number
  endingStat: number
  endingHappy: number
  averageGain: number
}
function estimateGymSession({
  stat,
  happy,
  energy,
  dots,
  energyPerTrain,
  modifier,
  happyLossRate,
}: {
  stat: number
  happy: number
  energy: number
  dots: number
  energyPerTrain: number
  modifier: number
  happyLossRate: number
}): SessionResult {
  const stepEnergy = Math.max(1, Math.floor(energyPerTrain))
  const trains = Math.max(0, Math.floor(Math.max(0, energy) / stepEnergy))
  let currentStat = Math.max(0, stat)
  let currentHappy = clamp(happy, 0, HAPPY_CAP)
  let statGain = 0

  for (let index = 0; index < trains; index++) {
    const adjustedHappy = currentHappy + 250
    const perEnergy =
      (3.480061091e-7 * Math.log(adjustedHappy) + 3.091619094e-6) * currentStat
      + 6.82775184551527e-5 * adjustedHappy
      - 0.0301431777
    const gain = Math.max(0, modifier * dots * stepEnergy * perEnergy)
    currentStat += gain
    statGain += gain
    currentHappy = Math.max(0, currentHappy - stepEnergy * happyLossRate)
  }

  const energyUsed = trains * stepEnergy
  return {
    trains,
    energyUsed,
    statGain,
    endingStat: currentStat,
    endingHappy: currentHappy,
    averageGain: trains ? statGain / trains : 0,
  }
}

type NumberFieldProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
  suffix?: string
  testId?: string
}
function NumberField({ label, value, onChange, min = 0, max, step = 1, hint, suffix, testId }: NumberFieldProps) {
  return (
    <label className="tc-field">
      <span>{label}</span>
      <span className="tc-input-wrap">
        <input
          data-testid={testId}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event => onChange(clamp(Number(event.target.value), min, max ?? Number.MAX_SAFE_INTEGER))}
        />
        {suffix && <small>{suffix}</small>}
      </span>
      {hint && <small className="tc-hint">{hint}</small>}
    </label>
  )
}
function Metric({ label, value, detail, tone = "violet" }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <article className={"tc-metric tc-metric-" + tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  )
}
function Panel({ title, eyebrow, description, children }: { title: string; eyebrow?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="tc-panel">
      {(eyebrow || title || description) && (
        <header className="tc-panel-heading">
          {eyebrow && <span>{eyebrow}</span>}
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

type TrainingCalculatorProps = {
  playerName: string
  onNavigate: (path: string) => void
}

export function TrainingCalculatorWorkspace({ playerName, onNavigate }: TrainingCalculatorProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("session")
  const [stat, setStat] = useState<StatKey>("strength")
  const [gymId, setGymId] = useState("gun-shop")
  const [customDots, setCustomDots] = useState(7.3)
  const [customEnergyPerTrain, setCustomEnergyPerTrain] = useState(10)
  const [statValue, setStatValue] = useState(1_000_000)
  const [modifier, setModifier] = useState(1)
  const [happyLossPercent, setHappyLossPercent] = useState(50)

  const [currentHappy, setCurrentHappy] = useState(5_025)
  const [happyCap, setHappyCap] = useState(5_025)
  const [ecstasy, setEcstasy] = useState(false)
  const [dvdCount, setDvdCount] = useState(0)
  const [dvdHappy, setDvdHappy] = useState(2_500)
  const [otherHappy, setOtherHappy] = useState(0)

  const [currentEnergy, setCurrentEnergy] = useState(150)
  const [energyCapacity, setEnergyCapacity] = useState(150)
  const [xanaxCount, setXanaxCount] = useState(0)
  const [canId, setCanId] = useState("munster")
  const [canCount, setCanCount] = useState(0)
  const [factionVoracity, setFactionVoracity] = useState(false)
  const [canBook, setCanBook] = useState(false)
  const [canEvent, setCanEvent] = useState(false)
  const [fhcCount, setFhcCount] = useState(0)
  const [pointRefills, setPointRefills] = useState(0)
  const [otherEnergy, setOtherEnergy] = useState(0)

  const [xanaxPrice, setXanaxPrice] = useState(0)
  const [canPrice, setCanPrice] = useState(0)
  const [fhcPrice, setFhcPrice] = useState(0)
  const [refillPrice, setRefillPrice] = useState(0)
  const [seQuantity, setSeQuantity] = useState(1)
  const [sePrice, setSePrice] = useState(0)

  const [projectionDays, setProjectionDays] = useState(30)
  const [dailyEnergy, setDailyEnergy] = useState(480)

  const selectedGym = GYMS.find(gym => gym.id === gymId) ?? GYMS[0]
  const selectedDrink = ENERGY_DRINKS.find(drink => drink.id === canId) ?? ENERGY_DRINKS[3]
  const dots = gymId === "custom" ? customDots : (selectedGym.dots[stat] ?? 0)
  const energyPerTrain = gymId === "custom" ? customEnergyPerTrain : selectedGym.energy
  const happyLossRate = happyLossPercent / 100
  const canMultiplier = (factionVoracity ? 1.5 : 1) * (canBook ? 2 : 1) * (canEvent ? 2 : 1)

  const energyPlan = useMemo(() => {
    const energyFromXanax = xanaxCount * 250
    const energyFromCans = canCount * selectedDrink.energy * canMultiplier
    const energyFromFhcs = fhcCount * energyCapacity
    const energyFromRefills = pointRefills * energyCapacity
    const total = Math.max(0, currentEnergy + energyFromXanax + energyFromCans + energyFromFhcs + energyFromRefills + otherEnergy)
    const boosterHours = canCount * 2 + fhcCount * 6
    const priced = [
      [xanaxCount, xanaxPrice],
      [canCount, canPrice],
      [fhcCount, fhcPrice],
      [pointRefills, refillPrice],
    ].every(([quantity, price]) => quantity === 0 || price > 0)
    const totalCost = xanaxCount * xanaxPrice + canCount * canPrice + fhcCount * fhcPrice + pointRefills * refillPrice
    return { total, energyFromXanax, energyFromCans, energyFromFhcs, energyFromRefills, boosterHours, priced, totalCost }
  }, [xanaxCount, canCount, selectedDrink.energy, canMultiplier, fhcCount, pointRefills, energyCapacity, currentEnergy, otherEnergy, xanaxPrice, canPrice, fhcPrice, refillPrice])

  const happyPlan = useMemo(() => {
    const beforeEcstasy = Math.max(0, currentHappy + xanaxCount * 75)
    const doubled = ecstasy ? beforeEcstasy * 2 : beforeEcstasy
    const afterBoosters = doubled + fhcCount * 500 + dvdCount * dvdHappy + otherHappy
    return {
      beforeEcstasy,
      afterBoosters,
      finalHappy: clamp(afterBoosters, 0, HAPPY_CAP),
      shortfall: Math.max(0, HAPPY_CAP - afterBoosters),
      capped: afterBoosters > HAPPY_CAP,
    }
  }, [currentHappy, xanaxCount, ecstasy, fhcCount, dvdCount, dvdHappy, otherHappy])

  const normalSession = useMemo(() => estimateGymSession({
    stat: statValue,
    happy: currentHappy,
    energy: energyPlan.total,
    dots,
    energyPerTrain,
    modifier,
    happyLossRate,
  }), [statValue, currentHappy, energyPlan.total, dots, energyPerTrain, modifier, happyLossRate])

  const jumpSession = useMemo(() => estimateGymSession({
    stat: statValue,
    happy: happyPlan.finalHappy,
    energy: energyPlan.total,
    dots,
    energyPerTrain,
    modifier,
    happyLossRate,
  }), [statValue, happyPlan.finalHappy, energyPlan.total, dots, energyPerTrain, modifier, happyLossRate])

  const enhancerEstimate = useMemo(() => {
    let current = Math.max(0, statValue)
    let totalGain = 0
    let cappedEnhancers = 0
    for (let index = 0; index < seQuantity; index++) {
      const gain = Math.min(current * 0.01, SE_GAIN_CAP)
      if (gain <= 0) break
      current += gain
      totalGain += gain
      if (gain >= SE_GAIN_CAP) cappedEnhancers++
    }
    return { totalGain, finalStat: current, cost: seQuantity * sePrice, costPerPoint: totalGain > 0 && sePrice > 0 ? (seQuantity * sePrice) / totalGain : null, cappedEnhancers }
  }, [statValue, seQuantity, sePrice])

  const gymCostPerPoint = energyPlan.priced && normalSession.statGain > 0
    ? energyPlan.totalCost / normalSession.statGain
    : null
  const enhancerIsCheaper = gymCostPerPoint !== null && enhancerEstimate.costPerPoint !== null
    ? enhancerEstimate.costPerPoint < gymCostPerPoint
    : null

  const projection = useMemo(() => {
    let totalGain = 0
    let currentStat = Math.max(0, statValue)
    let currentHappyForDay = clamp(happyCap, 0, HAPPY_CAP)
    const energyPerDay = Math.max(0, dailyEnergy)
    for (let day = 0; day < projectionDays; day++) {
      const result = estimateGymSession({
        stat: currentStat,
        happy: currentHappyForDay,
        energy: energyPerDay,
        dots,
        energyPerTrain,
        modifier,
        happyLossRate,
      })
      totalGain += result.statGain
      currentStat = result.endingStat
      currentHappyForDay = clamp(result.endingHappy + 480, 0, happyCap)
    }
    return { totalGain, finalStat: currentStat, finalHappy: currentHappyForDay, energyTotal: energyPerDay * projectionDays }
  }, [statValue, happyCap, dailyEnergy, projectionDays, dots, energyPerTrain, modifier, happyLossRate])

  const selectedStatLabel = STAT_OPTIONS.find(option => option.value === stat)?.label ?? "Strength"
  const trainCount = jumpSession.trains
  const jumpDelta = jumpSession.statGain - normalSession.statGain
  const allTabs: Array<{ id: TabKey; label: string; short: string }> = [
    { id: "session", label: "Train session", short: "SESSION" },
    { id: "happy", label: "99K happy jump", short: "HAPPY JUMP" },
    { id: "energy", label: "Energy & cans", short: "ENERGY" },
    { id: "enhancers", label: "Stat enhancers", short: "SEs" },
    { id: "projection", label: "Long-term plan", short: "PROJECTION" },
  ]

  return (
    <main className="training-calculator-page">
      <header className="tc-topbar">
        <button type="button" className="tc-back-link" onClick={() => onNavigate("/")}>← Portal home</button>
        <div className="tc-user"><span className="tc-user-avatar">{playerName.slice(0, 2).toUpperCase() || "NF"}</span><span>{playerName || "Faction member"}</span></div>
      </header>

      <section className="tc-hero">
        <div className="tc-hero-copy">
          <span className="tc-eyebrow">NAUGHTY FAMILY · PERSONAL TRAINING LAB</span>
          <h1>Train with a <em>plan.</em></h1>
          <p>Model gym gains, build a 99,999 happy jump, price your energy, and compare gym training against Stat Enhancers. Your inputs stay in this browser.</p>
        </div>
        <div className="tc-hero-stats">
          <span>ACTIVE MODEL</span>
          <strong>{selectedStatLabel}</strong>
          <small>{selectedGym.name === "Custom" ? "Custom gym" : selectedGym.name} · {dots > 0 ? dots.toFixed(1) + " dots" : "stat unavailable"} · {energyPerTrain}E / train</small>
        </div>
      </section>

      <nav className="tc-tabs" aria-label="Training calculator sections">
        {allTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            data-testid={"training-tab-" + tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.short}</span>{tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "session" && (
        <div className="tc-layout">
          <Panel title="Your training setup" eyebrow="01 · INPUTS" description="Choose the stat and gym you will actually use. All bonuses are combined into one multiplier.">
            <div className="tc-form-grid">
              <label className="tc-field"><span>Battle stat</span><select value={stat} onChange={event => setStat(event.target.value as StatKey)}>{STAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="tc-field"><span>Gym</span><select value={gymId} onChange={event => setGymId(event.target.value)}><option value="custom">Custom gym / manual dots</option>{GYMS.map(gym => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></label>
              <NumberField label="Current stat" value={statValue} onChange={setStatValue} step={1000} testId="training-stat-value" />
              {gymId === "custom" ? (
                <>
                  <NumberField label="Gym dots" value={customDots} onChange={setCustomDots} min={0} max={10} step={0.1} />
                  <NumberField label="Energy per train" value={customEnergyPerTrain} onChange={setCustomEnergyPerTrain} min={1} max={100} />
                </>
              ) : (
                <div className="tc-readout-field"><span>Selected gym gain</span><strong>{dots > 0 ? dots.toFixed(1) + " dots" : "Unavailable for " + selectedStatLabel}</strong><small>{selectedGym.energy} energy per completed train</small></div>
              )}
              <NumberField label="Total gym-gain modifier" value={modifier} onChange={setModifier} min={0} max={10} step={0.01} hint="1.15 means +15% total gym gains." />
              <NumberField label="Happy lost per energy" value={happyLossPercent} onChange={setHappyLossPercent} min={40} max={60} suffix="%" hint="Torn's documented range is 40–60%; 50% is the midpoint." />
              <NumberField label="Starting happiness" value={currentHappy} onChange={setCurrentHappy} min={0} max={HAPPY_CAP} />
              <NumberField label="Usable energy" value={energyPlan.total} onChange={() => setActiveTab("energy")} min={0} hint="Calculated from your Energy & cans tab. Select this field to edit the supply plan." />
            </div>
            {selectedGym.note && <p className="tc-inline-note"><strong>Gym requirement:</strong> {selectedGym.note}</p>}
            {gymId !== "custom" && dots <= 0 && <p className="tc-inline-warning">This gym does not train {selectedStatLabel}. Choose another gym or use a custom setup.</p>}
            <div className="tc-formula-note"><strong>Model:</strong> Current Torn Wiki gym-gain equation, applied train-by-train so changing stat and happiness are reflected after every train. Estimates are not Torn's guaranteed displayed gains.</div>
          </Panel>

          <div className="tc-results-column">
            <Panel title="Session forecast" eyebrow="02 · RESULTS" description="Projected output using your current happiness and the energy in your plan.">
              <div className="tc-metric-grid">
                <Metric label="Projected stat gain" value={"+" + fmt(normalSession.statGain, 2)} tone="green" />
                <Metric label="Completed trains" value={fmt(normalSession.trains)} detail={fmt(normalSession.energyUsed) + " energy used"} tone="violet" />
                <Metric label="Average per train" value={"+" + fmt(normalSession.averageGain, 2)} tone="blue" />
                <Metric label="Ending happiness" value={fmt(normalSession.endingHappy)} detail={"Starts at " + fmt(currentHappy)} tone="amber" />
              </div>
              <div className="tc-result-total"><span>Projected ending {selectedStatLabel.toLowerCase()}</span><strong>{fmt(normalSession.endingStat, 2)}</strong></div>
              <button type="button" className="tc-primary-button" onClick={() => setActiveTab("happy")}>Compare a 99K happy jump <span>→</span></button>
            </Panel>

            <Panel title="Gym gain conditions" eyebrow="MODEL CHECK">
              <div className="tc-condition-list">
                <div><span>Gym gain</span><strong>{dots > 0 ? dots.toFixed(1) + " dots" : "No access"}</strong></div>
                <div><span>Energy per train</span><strong>{energyPerTrain}E</strong></div>
                <div><span>Modifier</span><strong>×{modifier.toFixed(3)}</strong></div>
                <div><span>Happy-loss assumption</span><strong>{happyLossPercent}% / energy</strong></div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "happy" && (
        <div className="tc-layout">
          <Panel title="Build your happy jump" eyebrow="03 · HAPPINESS STACK" description="Choose the items in your jump. Xanax and FHC counts are shared with your Energy & cans plan.">
            <div className="tc-form-grid">
              <NumberField label="Starting happiness" value={currentHappy} onChange={setCurrentHappy} min={0} max={HAPPY_CAP} />
              <label className="tc-check-field"><input type="checkbox" checked={ecstasy} onChange={event => setEcstasy(event.target.checked)} /><span><strong>Use Ecstasy</strong><small>Doubles the happiness you have before adding the flat happy items below.</small></span></label>
              <NumberField label="Erotic DVDs" value={dvdCount} onChange={setDvdCount} min={0} max={100} />
              <label className="tc-field"><span>Happy per DVD</span><select value={dvdHappy} onChange={event => setDvdHappy(Number(event.target.value))}><option value={2500}>2,500 · standard</option><option value={5000}>5,000 · 10★ Adult Novelties</option></select><small className="tc-hint">Use the value that applies to your company special.</small></label>
              <NumberField label="Other flat happiness" value={otherHappy} onChange={setOtherHappy} min={0} max={HAPPY_CAP} hint="Candy, job specials, LSD, Shrooms or other boosts after Ecstasy." />
              <div className="tc-readout-field"><span>From your energy plan</span><strong>{fmt(xanaxCount)} Xanax · {fmt(fhcCount)} FHC</strong><small>+75 happy per Xanax · +500 per FHC</small></div>
            </div>
            <div className="tc-formula-note">Order assumed: starting happiness → Xanax happiness → Ecstasy doubles current happiness → FHC, DVDs and other flat boosts. The result is capped at 99,999. Time the jump around Torn's 15-minute happiness reset.</div>
          </Panel>
          <div className="tc-results-column">
            <Panel title="99,999 jump result" eyebrow="04 · JUMP OUTPUT">
              <div className="tc-happy-meter"><div className="tc-happy-meter-top"><span>Projected jump happiness</span><strong>{fmt(happyPlan.finalHappy)}</strong></div><div className="tc-meter-track"><i style={{ width: (happyPlan.finalHappy / HAPPY_CAP * 100) + "%" }} /></div><div className="tc-happy-meter-foot"><span>0</span><span>99,999 maximum</span></div></div>
              <div className="tc-metric-grid">
                <Metric label="Happy to reach cap" value={happyPlan.shortfall ? fmt(happyPlan.shortfall) : "Ready"} detail={happyPlan.capped ? "Extra happy is above the cap" : "Additional happy required"} tone={happyPlan.shortfall ? "amber" : "green"} />
                <Metric label="Projected jump gain" value={"+" + fmt(jumpSession.statGain, 2)} tone="green" />
                <Metric label="Gain vs current happy" value={(jumpDelta >= 0 ? "+" : "") + fmt(jumpDelta, 2)} detail="Additional stat from the jump" tone="violet" />
                <Metric label="Training capacity" value={fmt(trainCount) + " trains"} detail={fmt(jumpSession.energyUsed) + " energy used"} tone="blue" />
              </div>
              <div className="tc-compare-row"><div><span>Normal-happy session</span><strong>+{fmt(normalSession.statGain, 2)}</strong></div><div><span>Happy-jump session</span><strong>+{fmt(jumpSession.statGain, 2)}</strong></div></div>
              <button type="button" className="tc-secondary-button" onClick={() => setActiveTab("energy")}>Adjust energy and cans →</button>
            </Panel>
            <p className="tc-caution">99K is a ceiling, not a promise that every listed item will be available. Booster, drug and energy cooldowns, company specials, and the happiness reset clock still apply.</p>
          </div>
        </div>
      )}

      {activeTab === "energy" && (
        <div className="tc-layout">
          <Panel title="Build your energy supply" eyebrow="05 · ENERGY INPUTS" description="Mix your current bar, Xanax, energy drinks, FHCs, refills and any other energy source.">
            <div className="tc-form-grid">
              <NumberField label="Current energy" value={currentEnergy} onChange={setCurrentEnergy} min={0} max={10_000} />
              <NumberField label="Energy bar capacity" value={energyCapacity} onChange={setEnergyCapacity} min={1} max={1_000} hint="Used for each full FHC or point refill. Standard / donator bars differ." />
              <NumberField label="Xanax used for this plan" value={xanaxCount} onChange={setXanaxCount} min={0} max={20} hint="250 energy and 75 happiness each, provided no overdose." />
              <label className="tc-field"><span>Energy drink</span><select value={canId} onChange={event => setCanId(event.target.value)}>{ENERGY_DRINKS.map(drink => <option key={drink.id} value={drink.id}>{drink.name} · {drink.energy} base E</option>)}</select></label>
              <NumberField label="Energy drinks" value={canCount} onChange={setCanCount} min={0} max={100} />
              <NumberField label="Feathery Hotel Coupons" value={fhcCount} onChange={setFhcCount} min={0} max={20} hint="Full energy refill +500 happiness +6h booster cooldown each." />
              <NumberField label="Point / other full refills" value={pointRefills} onChange={setPointRefills} min={0} max={20} hint="Assumes the energy bar is spent down before each refill." />
              <NumberField label="Other energy" value={otherEnergy} onChange={setOtherEnergy} min={0} max={10_000} hint="Green Easter Eggs, company specials, MSC, event rewards, etc." />
            </div>
            <div className="tc-toggle-list">
              <label><input type="checkbox" checked={factionVoracity} onChange={event => setFactionVoracity(event.target.checked)} /><span><strong>Faction Energy Drink Voracity</strong><small>×1.5 drink effect</small></span></label>
              <label><input type="checkbox" checked={canBook} onChange={event => setCanBook(event.target.checked)} /><span><strong>Fuelling Your Way to Failure book</strong><small>×2 drink effect</small></span></label>
              <label><input type="checkbox" checked={canEvent} onChange={event => setCanEvent(event.target.checked)} /><span><strong>Active event drink multiplier</strong><small>×2 drink effect when applicable</small></span></label>
            </div>
            <div className="tc-formula-note">Drink bonuses multiply. Torn lists a 2-hour booster cooldown per energy drink and 6 hours per FHC. Check your own active cooldown reductions before planning a daily quantity.</div>
          </Panel>
          <div className="tc-results-column">
            <Panel title="Energy available to train" eyebrow="06 · SUPPLY SUMMARY">
              <div className="tc-energy-total"><strong>{fmt(energyPlan.total)}</strong><span>total energy</span></div>
              <div className="tc-condition-list">
                <div><span>Current energy</span><strong>{fmt(currentEnergy)}</strong></div>
                <div><span>Xanax</span><strong>+{fmt(energyPlan.energyFromXanax)}</strong></div>
                <div><span>{selectedDrink.name}</span><strong>+{fmt(energyPlan.energyFromCans, 1)}</strong></div>
                <div><span>FHC refills</span><strong>+{fmt(energyPlan.energyFromFhcs)}</strong></div>
                <div><span>Point / other refills</span><strong>+{fmt(energyPlan.energyFromRefills)}</strong></div>
                <div><span>Other energy</span><strong>+{fmt(otherEnergy)}</strong></div>
                <div><span>Energy drinks + FHC cooldown</span><strong>+{fmt(energyPlan.boosterHours, 1)}h</strong></div>
              </div>
              <div className="tc-compare-row"><div><span>Full {energyPerTrain}E trains</span><strong>{fmt(Math.floor(energyPlan.total / energyPerTrain))}</strong></div><div><span>Unused remainder</span><strong>{fmt(energyPlan.total % energyPerTrain)}E</strong></div></div>
              <button type="button" className="tc-secondary-button" onClick={() => setActiveTab("session")}>See gym-gain forecast →</button>
            </Panel>
            <Panel title="Market cost inputs" eyebrow="07 · OPTIONAL PRICES" description="Prices are intentionally manual because Torn market values move. Leave a price at zero when you do not use that item.">
              <div className="tc-form-grid">
                <NumberField label="Xanax price" value={xanaxPrice} onChange={setXanaxPrice} min={0} step={1000} />
                <NumberField label="Selected can price" value={canPrice} onChange={setCanPrice} min={0} step={1000} />
                <NumberField label="FHC price" value={fhcPrice} onChange={setFhcPrice} min={0} step={1000} />
                <NumberField label="Refill opportunity cost" value={refillPrice} onChange={setRefillPrice} min={0} step={1000} hint="Optional cost of a point refill or other refill." />
              </div>
              <div className="tc-cost-total"><span>Known consumable cost</span><strong>{money(energyPlan.totalCost)}</strong></div>
              {!energyPlan.priced && <p className="tc-inline-warning">Add a market price for each consumable you selected to enable an accurate cost-per-stat comparison.</p>}
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "enhancers" && (
        <div className="tc-layout">
          <Panel title="Stat Enhancer calculator" eyebrow="08 · DIRECT STAT GAINS" description="Model the permanent 1% item increase for the selected battle stat.">
            <div className="tc-form-grid">
              <div className="tc-readout-field"><span>Selected stat</span><strong>{selectedStatLabel}</strong><small>Change the stat selector in Train Session to switch SE type.</small></div>
              <div className="tc-readout-field"><span>Current stat</span><strong>{fmt(statValue)}</strong><small>Shared with the gym-gain model.</small></div>
              <NumberField label="Number of Stat Enhancers" value={seQuantity} onChange={setSeQuantity} min={0} max={1000} />
              <NumberField label="Price per SE" value={sePrice} onChange={setSePrice} min={0} step={100_000} hint="Enter the current market or negotiated price." />
            </div>
            <div className="tc-formula-note">This estimate applies successive 1% increases to the updated stat value. Each item gain is capped at 5 trillion. It does not predict item-use failures, addiction or cooldown timing.</div>
          </Panel>
          <div className="tc-results-column">
            <Panel title="SE outcome" eyebrow="09 · ENHANCER OUTPUT">
              <div className="tc-metric-grid">
                <Metric label="Estimated stat gain" value={"+" + fmt(enhancerEstimate.totalGain, 2)} tone="green" />
                <Metric label="Ending stat" value={fmt(enhancerEstimate.finalStat, 2)} tone="violet" />
                <Metric label="Total SE cost" value={money(enhancerEstimate.cost)} tone="amber" />
                <Metric label="Cost per stat point" value={enhancerEstimate.costPerPoint === null ? "Add SE price" : money(enhancerEstimate.costPerPoint)} tone="blue" />
              </div>
              {enhancerEstimate.cappedEnhancers > 0 && <p className="tc-inline-warning">{enhancerEstimate.cappedEnhancers} enhancer gain(s) reached the per-item 5T cap.</p>}
            </Panel>
            <Panel title="Gym vs SE cost efficiency" eyebrow="10 · BREAK-EVEN">
              {gymCostPerPoint === null || enhancerEstimate.costPerPoint === null ? (
                <p className="tc-muted">Enter prices for the Xanax, cans, FHCs / refills and SEs used in your plan to compare cost per stat point.</p>
              ) : (
                <>
                  <div className="tc-compare-row"><div><span>Gym cost / stat point</span><strong>{money(gymCostPerPoint)}</strong></div><div><span>SE cost / stat point</span><strong>{money(enhancerEstimate.costPerPoint)}</strong></div></div>
                  <p className={enhancerIsCheaper ? "tc-inline-warning" : "tc-inline-success"}>{enhancerIsCheaper ? "At these prices, SEs are cheaper per estimated stat point." : "At these prices, the configured gym session is cheaper per estimated stat point."}</p>
                </>
              )}
              <p className="tc-muted">This comparison only includes the prices you entered. It does not value free natural energy or the opportunity cost of energy, booster cooldowns or drug cooldowns unless you include them.</p>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "projection" && (
        <div className="tc-layout">
          <Panel title="Repeatable training plan" eyebrow="11 · LONG-TERM MODEL" description="Project a sustainable daily energy allocation using your current stat, gym and modifier. This is not a one-off 99K jump repeated every day.">
            <div className="tc-form-grid">
              <NumberField label="Energy trained per day" value={dailyEnergy} onChange={setDailyEnergy} min={0} max={20_000} step={10} />
              <NumberField label="Projection length" value={projectionDays} onChange={setProjectionDays} min={1} max={3650} suffix="days" />
              <NumberField label="Sustainable happy ceiling" value={happyCap} onChange={setHappyCap} min={0} max={HAPPY_CAP} />
              <div className="tc-readout-field"><span>Daily happy regeneration</span><strong>+480</strong><small>Wiki baseline: 5 happiness every 15 minutes.</small></div>
            </div>
            <div className="tc-formula-note">Each day is simulated train-by-train. Remaining happiness receives up to 480 regeneration before the next day, capped at your entered sustainable happy ceiling. This does not model timed Ecstasy, FHC or 99K jump windows.</div>
          </Panel>
          <div className="tc-results-column">
            <Panel title="Projection outcome" eyebrow="12 · LONG-TERM OUTPUT">
              <div className="tc-metric-grid">
                <Metric label="Total projected gain" value={"+" + fmt(projection.totalGain, 2)} tone="green" />
                <Metric label="Ending stat" value={fmt(projection.finalStat, 2)} tone="violet" />
                <Metric label="Energy trained" value={fmt(projection.energyTotal)} tone="blue" />
                <Metric label="Final happiness" value={fmt(projection.finalHappy)} tone="amber" />
              </div>
              <div className="tc-result-total"><span>Average stat gain per day</span><strong>{fmt(projectionDays ? projection.totalGain / projectionDays : 0, 2)}</strong></div>
            </Panel>
          </div>
        </div>
      )}

      <footer className="tc-footer">
        <span>TRAINING CALCULATOR · NAUGHTY FAMILY</span>
        <span>Estimates only · confirm Torn values in-game before spending</span>
        <button type="button" onClick={() => onNavigate("/")}>Back to workspaces ↑</button>
      </footer>
    </main>
  )
}
