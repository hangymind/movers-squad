import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeoHuntMap, GeoHuntSnippet } from '../types'
import { decodeTiledGid, selectLowDetailLayers, tiledFlipTransform } from '../lib/geoHunt'
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
  lowDetail?: boolean
  ariaLabel: string
  onMarkerChange?: (point: { x: number; y: number }) => void
}

interface PointerPosition { x: number; y: number }

export function GeoHuntMapCanvas({ map, snippet, marker, resultMarkers = [], interactive = false, lowDetail = false, ariaLabel, onMarkerChange }: GeoHuntMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [assetsRevision, setAssetsRevision] = useState(0)
  const loadedImagesRef = useRef(new Map<string, HTMLImageElement>())
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)
  const pointersRef = useRef(new Map<number, PointerPosition>())
  const pinchRef = useRef<{ distance: number; zoom: number; center: PointerPosition; offset: PointerPosition } | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const cameraFrameRef = useRef<number | null>(null)
  const pendingOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const source = snippet ?? map
  const layers = source.layers
  const mapWidth = source.width
  const mapHeight = source.height

  const usedGids = useMemo(() => {
    if (lowDetail) return []
    const gids = new Set<number>()
    for (const layer of layers) for (const raw of layer.data) {
      const gid = decodeTiledGid(raw).gid
      if (gid) gids.add(gid)
    }
    return [...gids]
  }, [layers, lowDetail])

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
    if (cameraFrameRef.current !== null) window.cancelAnimationFrame(cameraFrameRef.current)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !interactive) return
    const stopPageScroll = (event: WheelEvent) => event.preventDefault()
    canvas.addEventListener('wheel', stopPageScroll, { passive: false })
    return () => canvas.removeEventListener('wheel', stopPageScroll)
  }, [interactive])

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
    if (resultMarkers.length < 2 || size.width <= 1 || size.height <= 1) return
    if (cameraFrameRef.current !== null) window.cancelAnimationFrame(cameraFrameRef.current)
    const xs = resultMarkers.map((item) => item.x)
    const ys = resultMarkers.map((item) => item.y)
    const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    const spanX = Math.max(.08, Math.max(...xs) - Math.min(...xs))
    const spanY = Math.max(.08, Math.max(...ys) - Math.min(...ys))
    const base = Math.min(size.width / mapWidth, size.height / mapHeight)
    const targetZoom = Math.max(1, Math.min(6, Math.min(size.width * .68 / (spanX * mapWidth * base), size.height * .68 / (spanY * mapHeight * base))))
    const scale = base * targetZoom
    const targetOffset = {
      x: size.width / 2 - center.x * mapWidth * scale - (size.width - mapWidth * scale) / 2,
      y: size.height / 2 - center.y * mapHeight * scale - (size.height - mapHeight * scale) / 2,
    }
    const startZoom = zoom
    const startOffset = offset
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const startedAt = performance.now()
    const duration = reduceMotion ? 1 : 900
    const animate = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setZoom(startZoom + (targetZoom - startZoom) * eased)
      setOffset({
        x: startOffset.x + (targetOffset.x - startOffset.x) * eased,
        y: startOffset.y + (targetOffset.y - startOffset.y) * eased,
      })
      if (progress < 1) cameraFrameRef.current = window.requestAnimationFrame(animate)
      else cameraFrameRef.current = null
    }
    cameraFrameRef.current = window.requestAnimationFrame(animate)
    return () => {
      if (cameraFrameRef.current !== null) window.cancelAnimationFrame(cameraFrameRef.current)
      cameraFrameRef.current = null
    }
    // The marker set is the camera cue; current camera values are intentionally captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapHeight, mapWidth, resultMarkers, size.height, size.width])

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
    context.fillStyle = lowDetail ? '#08111f' : map.backgroundColor || '#1EA761'
    context.fillRect(0, 0, size.width, size.height)
    context.imageSmoothingEnabled = true

    const startX = Math.max(0, Math.floor(-transform.x / transform.scale) - 1)
    const startY = Math.max(0, Math.floor(-transform.y / transform.scale) - 1)
    const endX = Math.min(mapWidth, Math.ceil((size.width - transform.x) / transform.scale) + 1)
    const endY = Math.min(mapHeight, Math.ceil((size.height - transform.y) / transform.scale) + 1)
    if (lowDetail) {
      selectLowDetailLayers(layers).forEach((layer, layerIndex) => {
        context.fillStyle = layerIndex % 2 === 0 ? '#8d9baa' : '#657486'
        for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
          if (!decodeTiledGid(layer.data[y * mapWidth + x] >>> 0).gid) continue
          context.fillRect(
            transform.x + x * transform.scale,
            transform.y + y * transform.scale,
            Math.ceil(transform.scale + 0.25),
            Math.ceil(transform.scale + 0.25),
          )
        }
      })
    } else {
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
  }, [assetsRevision, layers, lowDetail, map.backgroundColor, map.tiles, mapHeight, mapWidth, marker, resultMarkers, size, transform])

  const pointFromEvent = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, ((clientX - rect.left) - transform.x) / (mapWidth * transform.scale))),
      y: Math.max(0, Math.min(1, ((clientY - rect.top) - transform.y) / (mapHeight * transform.scale))),
    }
  }

  return <canvas
    ref={canvasRef}
    className={`geo-map-canvas${interactive ? ' is-interactive' : ''}${lowDetail ? ' is-low-detail' : ''}`}
    role="img"
    aria-label={ariaLabel}
    tabIndex={interactive ? 0 : -1}
    onPointerDown={(event) => {
      if (!interactive) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointersRef.current.size === 2) {
        const [first, second] = [...pointersRef.current.values()]
        pinchRef.current = {
          distance: Math.hypot(second.x - first.x, second.y - first.y),
          zoom,
          center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
          offset,
        }
        dragRef.current = null
        return
      }
      dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, moved: false }
    }}
    onPointerMove={(event) => {
      if (!interactive || !pointersRef.current.has(event.pointerId)) return
      event.preventDefault()
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointersRef.current.size >= 2 && pinchRef.current) {
        const [first, second] = [...pointersRef.current.values()]
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
        const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
        setZoom(Math.max(1, Math.min(8, pinchRef.current.zoom * distance / Math.max(1, pinchRef.current.distance))))
        setOffset({
          x: pinchRef.current.offset.x + center.x - pinchRef.current.center.x,
          y: pinchRef.current.offset.y + center.y - pinchRef.current.center.y,
        })
        return
      }
      const drag = dragRef.current
      if (!drag) return
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
      pointersRef.current.delete(event.pointerId)
      if (pointersRef.current.size < 2) pinchRef.current = null
      dragRef.current = null
      if (interactive && drag && !drag.moved) onMarkerChange?.(pointFromEvent(event.clientX, event.clientY))
    }}
    onPointerCancel={(event) => {
      pointersRef.current.delete(event.pointerId)
      if (pointersRef.current.size < 2) pinchRef.current = null
      dragRef.current = null
    }}
    onWheel={(event) => {
      if (!interactive) return
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
