import { useState, useCallback } from 'react'
import type { Image } from '../types'

// useImageModal はグリッド単位で拡大モーダルの状態を一元管理する。
// カードは open(id) を呼ぶだけで、前後ナビゲーションはグリッドが持つ一覧から行う。
// 位置は index で保持しつつ open は id 起点にすることで、
// 無限スクロールで一覧が伸びても（末尾追加なら）開いている位置がずれない。
export function useImageModal(images: Image[]) {
  const [index, setIndex] = useState<number | null>(null)

  const open = useCallback(
    (id: number) => {
      const i = images.findIndex(im => im.id === id)
      if (i >= 0) setIndex(i)
    },
    [images],
  )

  const close = useCallback(() => setIndex(null), [])

  const prev = useCallback(() => {
    setIndex(i => (i != null && i > 0 ? i - 1 : i))
  }, [])

  const next = useCallback(() => {
    setIndex(i => (i != null && i < images.length - 1 ? i + 1 : i))
  }, [images.length])

  const image = index != null && index >= 0 ? images[index] ?? null : null

  return {
    image,
    index,
    total: images.length,
    open,
    close,
    prev,
    next,
    hasPrev: index != null && index > 0,
    hasNext: index != null && index < images.length - 1,
  }
}
