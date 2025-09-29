export {}

declare global {
  interface Window {
    electron?: {
      isElectron: boolean
      showNotification: (title: string, body?: string) => Promise<unknown> | void
      updates?: {
        checkForUpdates: () => Promise<{ ok?: boolean; error?: string; info?: unknown } | void>
        downloadUpdate: () => Promise<{ ok?: boolean; error?: string } | void>
        installUpdate: () => Promise<{ ok?: boolean; error?: string } | void>
        getCurrentVersion: () => Promise<string>
        onCurrentVersion: (callback: (payload: { version?: string }) => void) => () => void
        onUpdateAvailable: (callback: (payload: any) => void) => () => void
        onDownloadProgress: (callback: (payload: any) => void) => () => void
        onUpdateDownloaded: (callback: (payload: any) => void) => () => void
        onError: (callback: (payload: any) => void) => () => void
      }
    }
  }
}
