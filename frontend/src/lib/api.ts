import axios, { AxiosError } from 'axios'
import type { ApiValidationError } from '../types'

export const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '')

export const api = axios.create({
  baseURL: `${apiOrigin}/api`,
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: 'application/json' },
})

export function getCsrfCookie() {
  return axios.get(`${apiOrigin}/sanctum/csrf-cookie`, { withCredentials: true })
}

export function getErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return '操作失败，请稍后重试。'

  const data = (error as AxiosError<ApiValidationError>).response?.data
  const firstValidationMessage = data?.errors ? Object.values(data.errors).flat()[0] : undefined

  return firstValidationMessage ?? data?.message ?? '无法连接服务器，请检查网络后重试。'
}
