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
    <nav className="flex gap-1 p-1 glass rounded-xl mb-6 w-fit">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={[
            'px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
            active === t.id
              ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(124,106,245,0.4)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
