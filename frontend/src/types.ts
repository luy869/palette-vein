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
  colors?: string[]
}

export interface User {
  id: number
  email: string
  is_admin: boolean
  created_at: string
}

export interface ConceptTag {
  en: string    // CLIP 検索用の英語句
  ja: string    // 表示用の日本語ラベル
  weight: number // [0,1] セット内の相対的な強度
}

export interface ProfileTagsResponse {
  cold_start?: boolean
  warming_up?: boolean
  tags: ConceptTag[]
  clusters: { share: number; tags: ConceptTag[] }[]
}

export interface RecommendItem {
  image: Image
  score: number
  source: 'similar' | 'explore'
  reason_image_ids: number[]
  reason_tags?: ConceptTag[]
}

export interface RecommendResponse {
  mode: 'similar' | 'toplist'
  items: RecommendItem[]
  reason_images_lookup: Image[]
}
