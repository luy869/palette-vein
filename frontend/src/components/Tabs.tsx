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
    <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontWeight: active === t.id ? 700 : 400,
            background: active === t.id ? '#7c6af5' : '#2e2e2e',
            color: '#eee',
            fontSize: 14,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
