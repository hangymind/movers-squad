const localTopLevelDomains = new Set(['home', 'internal', 'invalid', 'lan', 'local', 'localhost', 'test'])
const domainLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

export function isSafeAvatarUrl(value: string | null | undefined): value is string {
  const hasControlCharacter = value ? Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  }) : false
  if (!value || value.length > 2048 || hasControlCharacter) return false

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false
    if (url.port && url.port !== '443') return false

    const host = url.hostname.toLowerCase()
    if (!host || host.endsWith('.') || host.includes(':') || host.startsWith('[')) return false
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false

    const labels = host.split('.')
    if (labels.length < 2 || labels.some((label) => !domainLabelPattern.test(label))) return false
    if (localTopLevelDomains.has(labels.at(-1) ?? '')) return false

    return true
  } catch {
    return false
  }
}
