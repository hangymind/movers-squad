import { describe, expect, it } from 'vitest'
import type { GeoHuntTileLayer } from '../types'
import { selectLowDetailLayers } from '../lib/geoHunt'

const layer = (name: string, data: number[]): GeoHuntTileLayer => ({ name, data })

describe('selectLowDetailLayers', () => {
  it('keeps structural layers and removes background layers', () => {
    const selected = selectLowDetailLayers([
      layer('bg', [1, 1]),
      layer('water', [0, 2]),
      layer('walls', [3, 0]),
    ])

    expect(selected.map((item) => item.name)).toEqual(['walls'])
  })

  it('falls back to terrain when a map has no separate structural layer', () => {
    const selected = selectLowDetailLayers([
      layer('background', [1, 1]),
      layer('dirt', [0, 2]),
    ])

    expect(selected.map((item) => item.name)).toEqual(['dirt'])
  })
})
