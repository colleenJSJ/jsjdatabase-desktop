export {}

declare global {
  interface Window {
    electron?: {
      isElectron: boolean
      showNotification: (title: string, body?: string) => Promise<unknown> | void
    }
  }
}
