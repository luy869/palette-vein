import type { Image } from '../types'

interface Props {
  image: Image
  onFeedback: (id: number, kind: 'like' | 'skip') => void
}

export function ImageCard({ image, onFeedback }: Props) {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', background: '#111', position: 'relative' }}>
      <img
        src={image.thumb_url}
        alt={image.wallhaven_id}
        style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
        loading="lazy"
      />
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.7)',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#aaa', fontSize: 12 }}>
          {image.width}×{image.height}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onFeedback(image.id, 'like')}
            style={{ padding: '4px 16px', cursor: 'pointer', borderRadius: 4, border: 'none', background: '#2ecc71', color: '#fff', fontWeight: 'bold' }}
          >
            いいね
          </button>
          <button
            onClick={() => onFeedback(image.id, 'skip')}
            style={{ padding: '4px 16px', cursor: 'pointer', borderRadius: 4, border: 'none', background: '#555', color: '#fff' }}
          >
            スキップ
          </button>
        </div>
      </div>
    </div>
  )
}
