import type { ReactNode } from "react"

export type WorkspaceTabItem = {
  key: string
  label: ReactNode
  disabled?: boolean
  testId?: string
}

type WorkspaceTabsProps = {
  items: WorkspaceTabItem[]
  activeKey: string
  onChange: (key: string) => void
  ariaLabel: string
  className: string
  activeClassName?: string
}

export function WorkspaceTabs({
  items,
  activeKey,
  onChange,
  ariaLabel,
  className,
  activeClassName = "active",
}: WorkspaceTabsProps) {
  return (
    <nav className={className} aria-label={ariaLabel}>
      {items.map(item => {
        const selected = item.key === activeKey
        return (
          <button
            key={item.key}
            type="button"
            data-testid={item.testId}
            className={selected ? activeClassName : ""}
            aria-current={selected ? "page" : undefined}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

type WorkspaceHeaderProps = {
  brandSubtitle: string
  onNavigate: (path: string) => void
  returnLabel?: string
  className?: string
  rightContent?: ReactNode
}

export function WorkspaceHeader({
  brandSubtitle,
  onNavigate,
  returnLabel = "← Return to portal",
  className = "",
  rightContent,
}: WorkspaceHeaderProps) {
  return (
    <header className={["module-topbar", className].filter(Boolean).join(" ")}>
      <a
        className="portal-brand"
        href="/"
        onClick={event => {
          event.preventDefault()
          onNavigate("/")
        }}
      >
        <span className="portal-brand-mark">NF</span>
        <span>
          <strong>NAUGHTY FAMILY</strong>
          <small>{brandSubtitle}</small>
        </span>
      </a>
      {rightContent ?? (
        <button type="button" onClick={() => onNavigate("/")}>
          {returnLabel}
        </button>
      )}
    </header>
  )
}

type MetricCardProps = {
  label: ReactNode
  value: ReactNode
  detail: ReactNode
  className?: string
}

export function MetricCard({ label, value, detail, className = "" }: MetricCardProps) {
  return (
    <article className={className}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

type StatusBadgeProps = {
  children: ReactNode
  className?: string
}

export function StatusBadge({ children, className = "" }: StatusBadgeProps) {
  return (
    <span className={["workspace-status-badge", className].filter(Boolean).join(" ")}>
      {children}
    </span>
  )
}

type DataTableFrameProps = {
  children: ReactNode
  className?: string
  ariaLabel: string
}

export function DataTableFrame({ children, className = "", ariaLabel }: DataTableFrameProps) {
  return (
    <div
      className={["workspace-table-frame", className].filter(Boolean).join(" ")}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {children}
    </div>
  )
}

type EmptyStateProps = {
  title: ReactNode
  description: ReactNode
  className?: string
}

export function EmptyState({ title, description, className = "" }: EmptyStateProps) {
  return (
    <div className={["workspace-empty-state", className].filter(Boolean).join(" ")}>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

type ActionButtonProps = {
  children: ReactNode
  onClick: () => void
  className?: string
  disabled?: boolean
  ariaLabel?: string
  title?: string
}

export function ActionButton({
  children,
  onClick,
  className = "",
  disabled = false,
  ariaLabel,
  title,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  )
}
