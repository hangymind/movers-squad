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
