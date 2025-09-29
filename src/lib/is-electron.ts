export function isElectronEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electron?.isElectron)
}

export function inBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && !isElectronEnvironment()
}
