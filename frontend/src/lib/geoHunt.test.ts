import { describe, expect, it } from 'vitest'
import { decodeGeoHuntMap, decodeTiledGid, experienceProgress, secondsRemaining, tiledFlipTransform } from './geoHunt'

describe('geo hunt helpers', () => {
  it('decodes Tiled flip flags without changing the gid', () => {
    expect(decodeTiledGid(0xe0000005)).toEqual({ gid: 5, flipHorizontal: true, flipVertical: true, flipDiagonal: true })
  })

  it.each([
    [false, false, false, [1, 0, 0, 1, 0, 0]],
    [true, false, false, [-1, 0, 0, 1, 1, 0]],
    [false, true, false, [1, 0, 0, -1, 0, 1]],
    [true, true, false, [-1, 0, 0, -1, 1, 1]],
    [false, false, true, [0, 1, 1, 0, 0, 0]],
    [true, false, true, [0, 1, -1, 0, 1, 0]],
    [false, true, true, [0, -1, 1, 0, 0, 1]],
    [true, true, true, [0, -1, -1, 0, 1, 1]],
  ] as const)('builds the Tiled affine transform for h=%s v=%s d=%s', (horizontal, vertical, diagonal, expected) => {
    expect(Object.values(tiledFlipTransform(horizontal, vertical, diagonal))).toEqual(expected)
  })

  it('calculates bounded level progress', () => {
    expect(experienceProgress({ level: 2, experience: 150, experienceIntoLevel: 50, experienceForNextLevel: 200, wins: 1, losses: 0, matchesPlayed: 1 })).toBe(25)
    expect(experienceProgress(undefined)).toBe(0)
  })

  it('rounds countdown up and never returns a negative value', () => {
    expect(secondsRemaining('2026-08-25T00:00:10.100Z', Date.parse('2026-08-25T00:00:00Z'))).toBe(11)
    expect(secondsRemaining('2026-08-25T00:00:00Z', Date.parse('2026-08-25T00:00:01Z'))).toBe(0)
  })

  it('decodes compact gzip map layers', async () => {
    const map = await decodeGeoHuntMap({
      key: 'compact', width: 2, height: 2, tileWidth: 256, tileHeight: 256, backgroundColor: '#1EA761', tiles: {},
      layers: [{ name: 'ground', encoding: 'base64-gzip-u32le', data: 'H4sIAAAAAAAACmNkYGBgA2JGBoYGIMUAACjPotAQAAAA' }],
    })

    expect(map.layers[0].data).toEqual([1, 6, 0x80000001, 0])
  })
})
