import { NavLink } from 'react-router-dom'

interface Tab {
  id: string
  label: string
  path: string
}

interface TabsProps {
  tabs: Tab[]
}

export function Tabs({ tabs }: TabsProps) {
  return (
    <nav className="flex gap-1">
      {tabs.map(t => (
        <NavLink
          key={t.id}
          to={t.path}
          className={({ isActive }) => [
            'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
            isActive
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'text-slate-500 hover:text-slate-200 dark:hover:text-slate-200 hover:bg-white/5',
          ].join(' ')}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
