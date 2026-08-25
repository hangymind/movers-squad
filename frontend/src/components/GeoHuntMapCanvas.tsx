import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeoHuntMap, GeoHuntSnippet } from '../types'
import { decodeTiledGid, tiledFlipTransform } from '../lib/geoHunt'
const imageCache = new Map<string, Promise<HTMLImageElement>>()

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached) return cached

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error(`Unable to load map tile: ${url}`)), { once: true })
    image.src = url
  })
  imageCache.set(url, promise)
  promise.catch(() => imageCache.delete(url))
  return promise
}

interface Marker { x: number; y: number; color: string; label: string }
interface GeoHuntMapCanvasProps {
  map: GeoHuntMap
  snippet?: GeoHuntSnippet
  marker?: { x: number; y: number } | null
  resultMarkers?: Marker[]
  interactive?: boolean
  ariaLabel: string
  onMarkerChange?: (point: { x: number; y: number }) => void
}

export function GeoHuntMapCanvas({ map, snippet, marker, resultMarkers = [], interactive = false, ariaLabel, onMarkerChange }: GeoHuntMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [assetsRevision, setAssetsRevision] = useState(0)
  const loadedImagesRef = useRef(new Map<string, HTMLImageElement>())
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const pendingOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const source = snippet ?? map
  const layers = source.layers
  const mapWidth = source.width
  const mapHeight = source.height

  const usedGids = useMemo(() => {
    const gids = new Set<number>()
    for (const layer of layers) for (const raw of layer.data) {
      const gid = decodeTiledGid(raw).gid
      if (gid) gids.add(gid)
    }
    return [...gids]
  }, [layers])

  useEffect(() => {
    let cancelled = false
    let redrawFrame: number | null = null
    const scheduleRedraw = () => {
      if (redrawFrame !== null) return
      redrawFrame = window.requestAnimationFrame(() => {
        redrawFrame = null
        if (!cancelled) setAssetsRevision((value) => value + 1)
      })
    }
    const urls = [...new Set(usedGids
      .map((gid) => map.tiles[String(gid)]?.imageUrl)
      .filter((url): url is string => Boolean(url)))]

    Promise.allSettled(urls.map(async (url) => {
      const image = await loadImage(url)
      if (!cancelled) {
        loadedImagesRef.current.set(url, image)
        scheduleRedraw()
      }
    }))

    return () => {
      cancelled = true
      if (redrawFrame !== null) window.cancelAnimationFrame(redrawFrame)
    }
  }, [map.tiles, usedGids])

  useEffect(() => () => {
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.floor(entry.contentRect.width))
      const height = Math.max(1, Math.floor(entry.contentRect.height))
      setSize({ width, height })
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const transform = useMemo(() => {
    const base = Math.min(size.width / mapWidth, size.height / mapHeight)
    const scale = Math.max(0.01, base * zoom)
    return {
      scale,
      x: ((size.width - mapWidth * scale) / 2) + offset.x,
      y: ((size.height - mapHeight * scale) / 2) + offset.y,
    }
  }, [mapHeight, mapWidth, offset, size, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(size.width * ratio)
    canvas.height = Math.floor(size.height * ratio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, size.width, size.height)
    context.fillStyle = map.backgroundColor || '#1EA761'
    context.fillRect(0, 0, size.width, size.height)
    context.imageSmoothingEnabled = true

    const startX = Math.max(0, Math.floor(-transform.x / transform.scale) - 1)
    const startY = Math.max(0, Math.floor(-transform.y / transform.scale) - 1)
    const endX = Math.min(mapWidth, Math.ceil((size.width - transform.x) / transform.scale) + 1)
    const endY = Math.min(mapHeight, Math.ceil((size.height - transform.y) / transform.scale) + 1)
    for (const layer of layers) {
      for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
        const raw = layer.data[y * mapWidth + x] >>> 0
        const decoded = decodeTiledGid(raw)
        const gid = decoded.gid
        if (!gid) continue
        const tile = map.tiles[String(gid)]
        const image = tile ? loadedImagesRef.current.get(tile.imageUrl) : undefined
        if (!image?.complete || image.naturalWidth === 0) continue
        const px = transform.x + x * transform.scale
        const py = transform.y + y * transform.scale
        const flip = tiledFlipTransform(decoded.flipHorizontal, decoded.flipVertical, decoded.flipDiagonal)
        context.save()
        context.translate(px, py)
        context.transform(
          flip.a * transform.scale,
          flip.b * transform.scale,
          flip.c * transform.scale,
          flip.d * transform.scale,
          flip.e * transform.scale,
          flip.f * transform.scale,
        )
        context.drawImage(image, 0, 0, 1, 1)
        context.restore()
      }
    }

    const markers: Marker[] = [...resultMarkers]
    if (marker) markers.push({ ...marker, color: '#2f6edb', label: '你的落点' })
    for (const item of markers) {
      const x = transform.x + item.x * mapWidth * transform.scale
      const y = transform.y + item.y * mapHeight * transform.scale
      context.beginPath()
      context.arc(x, y, 8, 0, Math.PI * 2)
      context.fillStyle = item.color
      context.fill()
      context.lineWidth = 3
      context.strokeStyle = '#ffffff'
      context.stroke()
      context.font = '700 11px "Segoe UI", sans-serif'
      context.fillStyle = '#12213f'
      context.fillText(item.label, x + 12, y + 4)
    }
  }, [assetsRevision, layers, map.backgroundColor, map.tiles, mapHeight, mapWidth, marker, resultMarkers, size, transform])

  const pointFromEvent = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, ((clientX - rect.left) - transform.x) / (mapWidth * transform.scale))),
      y: Math.max(0, Math.min(1, ((clientY - rect.top) - transform.y) / (mapHeight * transform.scale))),
    }
  }

  return <canvas
    ref={canvasRef}
    className={`geo-map-canvas${interactive ? ' is-interactive' : ''}`}
    role="img"
    aria-label={ariaLabel}
    tabIndex={interactive ? 0 : -1}
    onPointerDown={(event) => {
      if (!interactive) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, moved: false }
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current
      if (!interactive || !drag) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true
      if (drag.moved) {
        pendingOffsetRef.current = { x: drag.ox + dx, y: drag.oy + dy }
        if (dragFrameRef.current === null) dragFrameRef.current = window.requestAnimationFrame(() => {
          dragFrameRef.current = null
          if (pendingOffsetRef.current) setOffset(pendingOffsetRef.current)
        })
      }
    }}
    onPointerUp={(event) => {
      const drag = dragRef.current
      dragRef.current = null
      if (interactive && drag && !drag.moved) onMarkerChange?.(pointFromEvent(event.clientX, event.clientY))
    }}
    onWheel={(event) => {
      if (!interactive) return
      event.preventDefault()
      setZoom((value) => Math.max(1, Math.min(8, value * (event.deltaY > 0 ? 0.88 : 1.14))))
    }}
    onKeyDown={(event) => {
      if (!interactive) return
      const delta = event.shiftKey ? 0.01 : 0.003
      const next = marker ?? { x: 0.5, y: 0.5 }
      if (event.key === 'ArrowLeft') onMarkerChange?.({ ...next, x: Math.max(0, next.x - delta) })
      else if (event.key === 'ArrowRight') onMarkerChange?.({ ...next, x: Math.min(1, next.x + delta) })
      else if (event.key === 'ArrowUp') onMarkerChange?.({ ...next, y: Math.max(0, next.y - delta) })
      else if (event.key === 'ArrowDown') onMarkerChange?.({ ...next, y: Math.min(1, next.y + delta) })
      else return
      event.preventDefault()
    }}
  />
}
