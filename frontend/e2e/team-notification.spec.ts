import { expect, test, type BrowserContext } from '@playwright/test'

async function mockNotifications(context: BrowserContext) {
  await context.addInitScript(() => {
    class NotificationMock {
      static permission = 'granted'
      static requestPermission = async () => 'granted' as NotificationPermission
      onclick: (() => void) | null = null
      constructor(title: string, options?: NotificationOptions) {
        const notifications = (window as unknown as { __notifications?: Array<{ title: string; body?: string; icon?: string }> }).__notifications ??= []
        notifications.push({ title, body: options?.body, icon: options?.icon })
      }
      close() {}
    }
    Object.defineProperty(window, 'Notification', { value: NotificationMock, configurable: true })
  })
}

async function register(context: BrowserContext, username: string) {
  const page = await context.newPage()
  await page.goto('/register')
  await page.getByLabel('Florr ID').fill(`florr-${username}`)
  await page.getByLabel('密码', { exact: true }).fill('password123')
  await page.getByLabel('确认密码').fill('password123')
  await page.getByRole('button', { name: '创建账户' }).click()
  await expect(page.getByRole('heading', { name: '组队大厅' })).toBeVisible()
  return page
}

test('existing member receives a system notification when another user joins', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const joinerContext = await browser.newContext()
  await mockNotifications(ownerContext)
  await mockNotifications(joinerContext)
  const suffix = Date.now().toString(36)

  const ownerPage = await register(ownerContext, `owner_${suffix}`)
  await ownerPage.getByRole('button', { name: '发布招募' }).first().click()
  const gameName = 'Florr.io'
  await ownerPage.getByRole('button', { name: '发布招募' }).last().click()
  await expect(ownerPage.getByRole('article').filter({ hasText: `owner_${suffix}` })).toBeVisible()

  const joinerPage = await register(joinerContext, `joiner_${suffix}`)
  await joinerPage.getByRole('article').filter({ hasText: `owner_${suffix}` }).getByRole('button', { name: '加入队伍' }).click()

  await expect.poll(() => ownerPage.evaluate(() => (window as unknown as { __notifications?: unknown[] }).__notifications?.length ?? 0)).toBe(1)
  const notification = await ownerPage.evaluate(() => (window as unknown as { __notifications: Array<{ title: string; body: string; icon: string }> }).__notifications[0])
  expect(notification.title).toContain(`joiner_${suffix}`)
  expect(notification.body).toContain(gameName)
  expect(notification.body).toContain(`florr-joiner_${suffix}`)
  expect(notification.icon).toBeUndefined()

  await ownerContext.close()
  await joinerContext.close()
})
