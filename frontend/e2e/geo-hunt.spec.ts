import { expect, test } from '@playwright/test'

const user = {
  id: 7, florrId: 'Map_Player_07', level: 42, avatarUrl: null, isAdmin: false, isBanned: false,
  isFlorrVerified: true, reverbKey: 'test-key',
  florrBinding: { id: 1, status: 'approved', submittedAt: null, reviewedAt: null, rejectionReason: null, resultUnread: false },
  geoHuntProfile: { level: 3, experience: 420, experienceIntoLevel: 120, experienceForNextLevel: 300, wins: 8, losses: 4, matchesPlayed: 12 },
}
const opponent = { ...user, id: 8, florrId: 'Map_Player_08' }
const profile = user.geoHuntProfile
const map = {
  key: 'garden', width: 8, height: 8, tileWidth: 512, tileHeight: 512, backgroundColor: '#1EA761',
  layers: [{ name: 'grass', encoding: 'base64-gzip-u32le', data: 'H4sIAAAAAAAACmNkYGBgI4AZh7EaADD/rDoAAQAA' }],
  tiles: {
    '1': { imageUrl: '/geo-hunt-assets/tiles/desert_c_0.svg', width: 256, height: 256 },
    '6': { imageUrl: '/geo-hunt-assets/tiles/grass_c_0.svg', width: 256, height: 256 },
  },
}
const snippet = { width: 3, height: 3, layers: [{ name: 'grass', data: [1, 6, 6, 6, 1, 6, 6, 6, 1] }] }

test('geo hunt lobby and duel render on desktop and mobile', async ({ browser }) => {
  test.setTimeout(120_000)
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 900 },
    mobile320: { width: 320, height: 700 },
    mobile375: { width: 375, height: 812 },
    mobile414: { width: 414, height: 896 },
    tablet768: { width: 768, height: 1024 },
  })) {
    let matchStatus: 'playing' | 'finished' = 'playing'
    let roomStatus: 'waiting' | 'finished' = 'waiting'
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/user') return route.fulfill({ json: { data: user } })
      if (path === '/api/geo-hunt/lobby') return route.fulfill({ json: { data: { profile, queued: false, queueCount: 2, currentMatchId: null, currentRoomCode: null, publicRooms: [] } } })
      if (path === '/api/geo-hunt/maps/garden') return route.fulfill({ json: { data: map } })
      if (path === '/api/geo-hunt/rooms/ABC234') return route.fulfill({ json: { data: {
        id: 61, code: 'ABC234', name: null, mode: 'private', host: { id: user.id, florrId: user.florrId }, playerCount: 2, maxPlayers: 4,
        status: roomStatus, createdAt: new Date().toISOString(), stateVersion: roomStatus === 'waiting' ? 1 : 2, hostId: user.id,
        players: [{ user, seat: 1 }, { user: opponent, seat: 2 }],
      } } })
      if (path === '/api/geo-hunt/matches/61' || path === '/api/geo-hunt/matches/61/heartbeat') return route.fulfill({ json: { data: {
        id: 61, status: 'finished', mode: 'private', roomCode: 'ABC234', roomName: null, maxPlayers: 4, hostId: user.id, stateVersion: 2,
        self: { user, hp: 6000, connected: true, xpAwarded: 0, seat: 1, eliminated: false, placement: null },
        opponent: { user: opponent, hp: 6000, connected: true, xpAwarded: 0, seat: 2, eliminated: false, placement: null },
        players: [{ user, hp: 6000, connected: true, xpAwarded: 0, seat: 1, eliminated: false, placement: null }, { user: opponent, hp: 6000, connected: true, xpAwarded: 0, seat: 2, eliminated: false, placement: null }],
        round: null, winnerId: null, endedReason: 'admin_closed', finishedAt: new Date().toISOString(), profile,
      } } })
      if (path === '/api/geo-hunt/matches/51' || path === '/api/geo-hunt/matches/51/heartbeat') return route.fulfill({ json: { data: {
        id: 51, status: matchStatus, mode: 'ranked_1v1', roomCode: null, roomName: null, maxPlayers: 2, hostId: null, stateVersion: matchStatus === 'playing' ? 1 : 2,
        self: { user, hp: matchStatus === 'playing' ? 6000 : 2500, connected: true, xpAwarded: matchStatus === 'finished' ? 100 : 0, seat: 1, eliminated: false, placement: matchStatus === 'finished' ? 1 : null },
        opponent: { user: opponent, hp: matchStatus === 'playing' ? 6000 : 0, connected: true, xpAwarded: 40, seat: 2, eliminated: matchStatus === 'finished', placement: matchStatus === 'finished' ? 2 : null },
        players: [{ user, hp: matchStatus === 'playing' ? 6000 : 2500, connected: true, xpAwarded: matchStatus === 'finished' ? 100 : 0, seat: 1, eliminated: false, placement: matchStatus === 'finished' ? 1 : null }, { user: opponent, hp: matchStatus === 'playing' ? 6000 : 0, connected: true, xpAwarded: 40, seat: 2, eliminated: matchStatus === 'finished', placement: matchStatus === 'finished' ? 2 : null }],
        round: { id: 91, number: 3, mapKey: 'garden', multiplier: 1, deadlineAt: new Date(Date.now() + 60_000).toISOString(), firstGuessAt: null, revealUntil: null, submitted: false, submittedCount: 0, requiredGuesses: 2, snippet, result: null },
        winnerId: matchStatus === 'finished' ? user.id : null, endedReason: matchStatus === 'finished' ? 'knockout' : null, finishedAt: matchStatus === 'finished' ? new Date().toISOString() : null, profile,
      } } })
      return route.fulfill({ json: { data: null } })
    })

    await page.goto('/geo-hunt')
    await expect(page.getByRole('heading', { name: '图寻' })).toBeVisible()
    await expect(page.getByRole('button', { name: '开始匹配' })).toBeVisible()
    await expect(page.getByText('Lv.3')).toBeVisible()
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true)
    await page.screenshot({ path: `test-results/geo-hunt-lobby-${name}.png`, fullPage: true })

    await page.goto('/geo-hunt/rooms/ABC234')
    await expect(page.getByRole('heading', { name: '私人对局' })).toBeVisible()
    await expect(page.getByLabel('房间码已隐藏')).toHaveText('••••••')
    await expect(page.getByText('ABC234', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '显示房间码' }).click()
    await expect(page.getByLabel('房间码 ABC234')).toHaveText('ABC234')
    await page.getByRole('button', { name: '隐藏房间码' }).click()
    await expect(page.getByLabel('房间码已隐藏')).toBeVisible()
    await expect(page.getByRole('button', { name: '开始对局' })).toBeEnabled()
    await expect(page).toHaveTitle('私人对局 | 图寻 | Movers Squad')
    await page.screenshot({ path: `test-results/geo-hunt-room-${name}.png`, fullPage: true })

    roomStatus = 'finished'
    await page.reload()
    await expect(page).toHaveURL(/\/geo-hunt\/matches\/61$/)
    await expect(page.getByRole('heading', { name: '房间已由管理员关闭' })).toBeVisible()

    await page.goto('/geo-hunt/matches/51')
    await expect(page.getByRole('heading', { name: '这是哪里？' })).toBeVisible()
    await page.getByRole('button', { name: '开始定位' }).click()
    const canvas = page.getByRole('img', { name: '可拖动、缩放并选择落点的完整地图' })
    await expect(canvas).toBeVisible()
    const stageRatio = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return (rect.width * rect.height) / (window.innerWidth * window.innerHeight)
    })
    expect(stageRatio).toBeGreaterThan(.7)
    const scrollBeforeWheel = await page.evaluate(() => window.scrollY)
    await canvas.hover()
    await page.mouse.wheel(0, 480)
    await expect(page.evaluate(() => window.scrollY)).resolves.toBe(scrollBeforeWheel)
    await page.screenshot({ path: `test-results/geo-hunt-match-${name}.png`, fullPage: true })
    await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => {
      const context2d = element.getContext('2d')
      if (!context2d || element.width < 2 || element.height < 2) return 0
      const colors = new Set<string>()
      for (let y = 0; y < element.height; y += Math.max(1, Math.floor(element.height / 10))) for (let x = 0; x < element.width; x += Math.max(1, Math.floor(element.width / 10))) {
        colors.add([...context2d.getImageData(x, y, 1, 1).data].join(','))
      }
      return colors.size
    })).toBeGreaterThan(2)
    await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => {
      const pixels = element.getContext('2d')?.getImageData(0, 0, element.width, element.height).data
      if (!pixels) return 0
      let green = 0
      for (let index = 0; index < pixels.length; index += 16) if (pixels[index] === 30 && pixels[index + 1] === 167 && pixels[index + 2] === 97) green++
      return green
    })).toBeGreaterThan(0)
    await canvas.click({ position: { x: 120, y: 120 } })
    await expect(page.getByText('落点已选择')).toBeVisible()
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true)

    matchStatus = 'finished'
    await page.reload()
    await expect(page.getByRole('heading', { name: '对决胜利' })).toBeVisible()
    await expect(page.getByText('+100 XP')).toBeVisible()
    await context.close()
  }
})

test('four-player public room renders round results and final ranking', async ({ browser }) => {
  test.setTimeout(90_000)
  const admin = { ...user, isAdmin: true, florrId: 'Room_Admin' }
  const users = [admin, opponent, { ...user, id: 9, florrId: 'Map_Player_09' }, { ...user, id: 10, florrId: 'Map_Player_10' }]
  const hp = [4200, 3100, 900, 0]
  const placements: Array<number | null> = [null, null, null, 4]
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    let phase: 'playing' | 'reveal' | 'finished' = 'playing'
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/user') return route.fulfill({ json: { data: admin } })
      if (path === '/api/geo-hunt/maps/garden') return route.fulfill({ json: { data: map } })
      if (path === '/api/geo-hunt/matches/71' || path === '/api/geo-hunt/matches/71/heartbeat') {
        const finished = phase === 'finished'
        const reveal = phase !== 'playing'
        const players = users.map((currentUser, index) => ({
          user: currentUser,
          hp: finished ? [2800, 0, 0, 0][index] : reveal ? [4200, 3100, 0, 0][index] : hp[index],
          connected: true,
          xpAwarded: 0,
          seat: index + 1,
          eliminated: finished ? index > 0 : reveal ? index >= 2 : index === 3,
          placement: finished ? index + 1 : placements[index],
        }))
        return route.fulfill({ json: { data: {
          id: 71, status: phase, mode: 'admin_public', roomCode: 'PUB789', roomName: '周末八方图战', maxPlayers: 4,
          hostId: admin.id, stateVersion: reveal ? 3 : 2, self: players[0], players, opponent: players[1],
          round: {
            id: 101, number: 5, mapKey: 'garden', multiplier: 1.5,
            deadlineAt: new Date(Date.now() + 60_000).toISOString(), firstGuessAt: null,
            revealUntil: reveal ? new Date(Date.now() + 8_000).toISOString() : null,
            submitted: reveal, submittedCount: reveal ? 3 : 1, requiredGuesses: 3, snippet,
            result: reveal ? {
              target: { x: 0.5, y: 0.5 }, damage: 3100, damagedUserId: null,
              guesses: users.slice(0, 3).map((currentUser, index) => ({
                userId: currentUser.id, x: [0.5, 0.45, 0.1][index], y: [0.5, 0.48, 0.12][index],
                distanceTiles: [0, 0.43, 4.4][index], score: [5000, 4700, 1800][index], timedOut: false,
                damageTaken: [0, 450, 3100][index], hpAfter: [4200, 3100, 0][index],
              })),
            } : null,
          },
          winnerId: finished ? admin.id : null, endedReason: finished ? 'knockout' : null,
          finishedAt: finished ? new Date().toISOString() : null, profile,
        } } })
      }
      return route.fulfill({ json: { data: null } })
    })

    await page.goto('/geo-hunt/matches/71')
    await expect(page.getByRole('main').getByText('周末八方图战', { exact: true })).toBeVisible()
    await expect(page).toHaveTitle('周末八方图战 | 图寻 | Movers Squad')
    await page.getByRole('button', { name: '开始定位' }).click()
    await page.getByRole('button', { name: '查看玩家状态' }).click()
    await expect(page.getByText('Map_Player_10')).toBeVisible()
    await expect(page.getByText('已淘汰')).toBeVisible()
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true)
    await page.screenshot({ path: `test-results/geo-hunt-multiplayer-${name}.png`, fullPage: true })
    await page.getByRole('button', { name: '关闭玩家窗口' }).click()

    phase = 'reveal'
    if (name === 'desktop') {
      await expect(page.getByRole('heading', { name: 'Map_Player_09 已淘汰' })).toBeVisible({ timeout: 12_000 })
      await expect(page.getByText('-3100 HP', { exact: true })).toBeVisible()
      await expect(page.getByText('你的落点距离正确位置更远，因此受到本回合伤害。')).toBeVisible()
      await page.getByRole('button', { name: '查看结果' }).click()
    } else {
      await page.reload()
    }
    await expect(page.getByText('5,000 分')).toBeVisible()
    await expect(page.getByText('1,800 分')).toBeVisible()
    await expect(page.getByText(/-3100 HP/)).toBeVisible()
    const resultCanvas = page.getByRole('img', { name: '可拖动、缩放并选择落点的完整地图' })
    await expect.poll(async () => resultCanvas.evaluate((element: HTMLCanvasElement) => {
      const context2d = element.getContext('2d')
      if (!context2d || element.width < 2 || element.height < 2) return 0
      const colors = new Set<string>()
      for (let y = 0; y < element.height; y += Math.max(1, Math.floor(element.height / 10))) for (let x = 0; x < element.width; x += Math.max(1, Math.floor(element.width / 10))) {
        colors.add([...context2d.getImageData(x, y, 1, 1).data].join(','))
      }
      return colors.size
    })).toBeGreaterThan(2)
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true)
    await page.screenshot({ path: `test-results/geo-hunt-multiplayer-result-${name}.png`, fullPage: true })

    phase = 'finished'
    await page.reload()
    await expect(page.getByRole('heading', { name: '对决胜利' })).toBeVisible()
    await expect(page.getByText('#1')).toBeVisible()
    await expect(page.getByText('#4')).toBeVisible()
    await expect(page.getByRole('button', { name: '再次匹配' })).toHaveCount(0)
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true)
    await page.screenshot({ path: `test-results/geo-hunt-multiplayer-finished-${name}.png`, fullPage: true })
    await context.close()
  }
})
