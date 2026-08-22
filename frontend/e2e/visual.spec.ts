import { expect, test } from '@playwright/test'

test('login screen is stable on desktop and mobile', async ({ browser }) => {
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '登录组队大厅' })).toBeVisible()
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible()

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyHeight: document.body.getBoundingClientRect().height,
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
    expect(metrics.bodyHeight).toBeGreaterThan(300)
    const interaction = await page.evaluate(() => {
      const plainText = document.querySelector('h2')
      const input = document.querySelector('input')
      const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(contextMenu)
      return {
        plainTextSelection: plainText ? getComputedStyle(plainText).userSelect : '',
        inputSelection: input ? getComputedStyle(input).userSelect : '',
        contextMenuPrevented: contextMenu.defaultPrevented,
      }
    })
    expect(interaction.plainTextSelection).toBe('none')
    expect(interaction.inputSelection).toBe('text')
    expect(interaction.contextMenuPrevented).toBe(true)
    await page.screenshot({ path: `test-results/login-${name}.png`, fullPage: true })
    await context.close()
  }
})

const unverifiedUser = {
  id: 7, florrId: 'Long_Florr_Player_7788', level: 42, avatarUrl: null, isAdmin: false, isBanned: false,
  isFlorrVerified: false,
  florrBinding: { id: null, status: 'unbound', submittedAt: null, reviewedAt: null, rejectionReason: null, resultUnread: false },
}
const screenshot = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
}

test('binding prompt and upload page fit desktop and mobile', async ({ browser }) => {
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.route('**/api/user', (route) => route.fulfill({ json: { data: unverifiedUser } }))
    await page.route('**/api/teams', (route) => route.fulfill({ json: { data: [] } }))
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '绑定 Florr 账户' })).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: `test-results/binding-prompt-${name}.png`, fullPage: true })

    await page.getByRole('button', { name: '暂时忽略' }).click()
    await expect(page.getByRole('heading', { name: '绑定 Florr 账户' })).toBeHidden()
    await page.getByRole('button', { name: '发布招募' }).first().click()
    await expect(page.getByRole('heading', { name: '绑定 Florr 账户' })).toBeVisible()
    await page.getByRole('button', { name: '去绑定' }).click()
    await expect(page.getByRole('heading', { name: '验证游戏账户' })).toBeVisible()
    await expect(page.getByText('Long_Florr_Player_7788')).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: `test-results/binding-page-${name}.png`, fullPage: true })
    await context.close()
  }
})

test('admin approval and image resources remain usable on desktop and mobile', async ({ browser }) => {
  const admin = { ...unverifiedUser, id: 1, florrId: 'Xyiw46_', isAdmin: true, isFlorrVerified: true, florrBinding: { ...unverifiedUser.florrBinding, status: 'approved' } }
  const application = { id: 12, status: 'pending', user: { id: 7, florrId: 'Long_Florr_Player_7788' }, screenshotMime: 'image/png', screenshotSize: 2345678, hasImage: true, rejectionReason: null, submittedAt: new Date().toISOString(), reviewedAt: null, resultUnread: false }
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/user') return route.fulfill({ json: { data: admin } })
      if (path.endsWith('/image')) return route.fulfill({ status: 200, contentType: 'image/png', body: screenshot })
      if (path === '/api/admin/florr-bindings') return route.fulfill({ json: { data: [application], meta: { total: 1, current_page: 1, last_page: 1 } } })
      if (path === '/api/admin/florr-images') return route.fulfill({ json: { data: [{ ...application, status: 'approved', reviewedAt: new Date().toISOString() }], meta: { total: 1, current_page: 1, last_page: 1 } } })
      return route.fulfill({ json: { data: [] } })
    })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: '待审批申请' })).toBeVisible()
    await expect(page.getByText('用户 ID').first()).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: `test-results/admin-bindings-${name}.png`, fullPage: true })

    await page.getByRole('button', { name: '图片资源' }).click()
    await expect(page.getByText('全选当前页')).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: `test-results/admin-images-${name}.png`, fullPage: true })
    await context.close()
  }
})
