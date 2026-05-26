interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <nav className="flex gap-1">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={[
            'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
            active === t.id
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'text-slate-500 hover:text-slate-200 dark:hover:text-slate-200 hover:bg-white/5',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
