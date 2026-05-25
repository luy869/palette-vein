export interface Image {
  id: number
  wallhaven_id: string
  url: string
  thumb_url: string
  width: number
  height: number
  ratio: number
  views: number
  favorites: number
  fetched_at: string
}

export interface RecommendItem {
  image: Image
  score: number
  source: 'similar' | 'explore'
  reason_image_ids: number[]
}

export interface RecommendResponse {
  mode: 'similar' | 'toplist'
  items: RecommendItem[]
  reason_images_lookup: Image[]
}
