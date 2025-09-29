import { isElectronEnvironment } from '@/lib/is-electron'

function showWebNotification(title: string, body?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return

  if (Notification.permission === 'granted') {
    new Notification(title, { body })
    return
  }

  if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body })
      }
    })
  }
}

export function notifyDesktop(title: string, body?: string) {
  if (typeof window === 'undefined') return

  if (isElectronEnvironment() && window.electron?.showNotification) {
    window.electron.showNotification(title, body)
    return
  }

  showWebNotification(title, body)
}
