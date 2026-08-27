import type { GeoHuntMap, GeoHuntMapPayload, GeoHuntProfile, GeoHuntTileLayer } from '../types'

export const GID_MASK = 0x0fffffff
export const FLIP_H = 0x80000000
export const FLIP_V = 0x40000000
export const FLIP_D = 0x20000000

export function decodeTiledGid(value: number) {
  const raw = value >>> 0
  return {
    gid: raw & GID_MASK,
    flipHorizontal: (raw & FLIP_H) !== 0,
    flipVertical: (raw & FLIP_V) !== 0,
    flipDiagonal: (raw & FLIP_D) !== 0,
  }
}

const LOW_DETAIL_HIDDEN_LAYERS = /^(?:bg|background|grass|sand|pavement|water|dirt|grate_bg|shortcut)$/i
const LOW_DETAIL_ALWAYS_HIDDEN_LAYERS = /^(?:bg|background|shortcut)$/i

export function selectLowDetailLayers(layers: GeoHuntTileLayer[]) {
  const structures = layers.filter((layer) => !LOW_DETAIL_HIDDEN_LAYERS.test(layer.name) && layer.data.some((gid) => decodeTiledGid(gid).gid > 0))
  if (structures.length > 0) return structures
  return layers.filter((layer) => !LOW_DETAIL_ALWAYS_HIDDEN_LAYERS.test(layer.name) && layer.data.some((gid) => decodeTiledGid(gid).gid > 0))
}

export function tiledFlipTransform(flipHorizontal: boolean, flipVertical: boolean, flipDiagonal: boolean) {
  const point = (sourceX: number, sourceY: number) => {
    let x = flipDiagonal ? sourceY : sourceX
    let y = flipDiagonal ? sourceX : sourceY
    if (flipHorizontal) x = 1 - x
    if (flipVertical) y = 1 - y
    return { x, y }
  }
  const origin = point(0, 0)
  const xAxis = point(1, 0)
  const yAxis = point(0, 1)

  return {
    a: xAxis.x - origin.x,
    b: xAxis.y - origin.y,
    c: yAxis.x - origin.x,
    d: yAxis.y - origin.y,
    e: origin.x,
    f: origin.y,
  }
}

export function experienceProgress(profile: GeoHuntProfile | undefined): number {
  if (!profile) return 0
  return Math.min(100, Math.max(0, (profile.experienceIntoLevel / Math.max(1, profile.experienceForNextLevel)) * 100))
}

export function secondsRemaining(deadline: string | undefined, now: number): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000))
}

export async function decodeGeoHuntMap(payload: GeoHuntMapPayload, onProgress?: (progress: number) => void): Promise<GeoHuntMap> {
  const layers: GeoHuntTileLayer[] = []
  for (const [index, layer] of payload.layers.entries()) {
    if (!('encoding' in layer)) {
      layers.push(layer)
      onProgress?.((index + 1) / payload.layers.length)
      continue
    }
    const compressed = Uint8Array.from(atob(layer.data), (character) => character.charCodeAt(0))
    const compressedStream = new Response(compressed).body
    if (!compressedStream) throw new Error('Streaming decompression is unavailable')
    const stream = compressedStream.pipeThrough(new DecompressionStream('gzip'))
    const buffer = await new Response(stream).arrayBuffer()
    if (buffer.byteLength !== payload.width * payload.height * 4) {
      throw new Error(`Invalid Geo Hunt layer size for ${payload.key}`)
    }
    const view = new DataView(buffer)
    const data = new Array<number>(buffer.byteLength / 4)
    for (let index = 0; index < data.length; index++) data[index] = view.getUint32(index * 4, true)
    layers.push({ name: layer.name, data })
    onProgress?.((index + 1) / payload.layers.length)
  }

  return { ...payload, layers }
}
