const PRESETS = ['#cc3333', '#e87820', '#44aa44', '#3355cc', '#9944cc']

interface Props {
  value: string
  onChange: (hex: string) => void
}

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent"
        title="色を選択"
      />
      <div className="flex gap-1.5">
        {PRESETS.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            title={c}
            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: value === c ? 'white' : 'transparent',
            }}
          />
        ))}
      </div>
    </div>
  )
}
