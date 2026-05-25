import type { RecommendItem, Image } from '../types'
import { postFeedback } from '../api/client'

interface RecommendCardProps {
  item: RecommendItem
  reasonImages: Map<number, Image>
  onFeedback: () => void
}

export function RecommendCard({ item, reasonImages, onFeedback }: RecommendCardProps) {
  const { image, source, reason_image_ids } = item

  async function handleFeedback(kind: 'like' | 'skip') {
    await postFeedback(image.id, kind)
    onFeedback()
  }

  return (
    <div style={{ background: '#2a2a2a', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ position: 'relative' }}>
        <img
          src={image.thumb_url}
          alt={image.wallhaven_id}
          style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
          loading="lazy"
        />
        {source === 'explore' && (
          <span style={{
            position: 'absolute', top: 6, right: 6,
            background: 'rgba(0,0,0,0.6)', color: '#aaa',
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
          }}>
            explore
          </span>
        )}
      </div>

      {source === 'similar' && reason_image_ids.length > 0 && (
        <div style={{ padding: '6px 8px', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}>because:</span>
          {reason_image_ids.map(rid => {
            const r = reasonImages.get(rid)
            if (!r) return null
            return (
              <img
                key={rid}
                src={r.thumb_url}
                alt={r.wallhaven_id}
                title={r.wallhaven_id}
                style={{ width: 36, height: 24, objectFit: 'cover', borderRadius: 3 }}
              />
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '8px' }}>
        <button
          onClick={() => handleFeedback('like')}
          style={{ flex: 1, padding: '6px 0', background: '#4a3f9e', border: 'none', borderRadius: 4, color: '#eee', cursor: 'pointer' }}
        >
          ♥
        </button>
        <button
          onClick={() => handleFeedback('skip')}
          style={{ flex: 1, padding: '6px 0', background: '#3a3a3a', border: 'none', borderRadius: 4, color: '#aaa', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
