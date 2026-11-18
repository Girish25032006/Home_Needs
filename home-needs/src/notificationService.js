
import { getToken, onMessage } from 'firebase/messaging'
import { messagingPromise } from './firebase'
import API_URL from './api'

const VAPID_KEY =
  'BKn2v_sPvxBE3UXgOGVCRSnJlVx_MbWQbbv91_X9QCbbbdPJMuSEuf-HgeEDUDtsplr_rZdUMIlwAIkRkHDPt1c'

let foregroundListenerRegistered = false
let initializationPromise = null

async function getReadyMessaging() {
  if (typeof window === 'undefined') {
    throw new Error('Notifications require a browser.')
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('This browser does not support notifications.')
  }

  if (!window.isSecureContext) {
    throw new Error('Notifications require a secure HTTPS connection.')
  }

  const messaging = await messagingPromise

  if (!messaging) {
    throw new Error('Firebase Messaging is unavailable.')
  }

  await navigator.serviceWorker.register('/firebase-messaging-sw.js')

  const registration = await navigator.serviceWorker.ready

  if (!registration.active) {
    throw new Error('Firebase service worker is not active.')
  }

  return { messaging, registration }
}

/*
  Register foreground listener once per page load.
*/
async function registerForegroundListener(messaging) {
  if (foregroundListenerRegistered || !messaging) return

  onMessage(messaging, async payload => {
    console.log('Foreground FCM message received:', payload)

    const title =
      payload?.notification?.title ||
      payload?.data?.title ||
      'Home Needs'

    const body =
      payload?.notification?.body ||
      payload?.data?.body ||
      'You have a new household notification.'

    window.dispatchEvent(
      new CustomEvent('home-needs-notification', {
        detail: payload
      })
    )

    if (Notification.permission !== 'granted') return

    try {
      const registration = await navigator.serviceWorker.ready

      const tag =
        payload?.data?.notification_id ||
        `${payload?.data?.type || 'household'}-${payload?.data?.product_id || Date.now()}`

      await registration.showNotification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `home-needs-${tag}`,
        renotify: false,
        data: { url: '/' }
      })

      console.log('Foreground notification displayed successfully.')
    } catch (error) {
      console.error('Foreground notification display failed:', error)
    }
  })

  foregroundListenerRegistered = true
}

/*
  Register the current browser's FCM token with Flask.
*/
async function saveTokenWithBackend(token) {
  const response = await fetch(`${API_URL}/register-fcm-token`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      device_name: navigator.userAgent
    })
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      result.message || `FCM registration failed. HTTP ${response.status}`
    )
  }

  console.log('FCM token registered with backend:', result)
  return result
}

/*
  Automatically initialize notifications after page refresh.
  Does not ask the user for permission.
*/
export async function initializeNotifications() {
  if (typeof window === 'undefined') return

  if (Notification.permission !== 'granted') {
    console.log('Notifications have not been enabled on this device.')
    return
  }

  if (initializationPromise) return initializationPromise

  initializationPromise = (async () => {
    try {
      console.log('Initializing Home Needs notifications...')

      const { messaging, registration } = await getReadyMessaging()

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      })

      if (!token) {
        throw new Error('Firebase could not generate an FCM token.')
      }

      await saveTokenWithBackend(token)
      await registerForegroundListener(messaging)

      console.log('Automatic notification initialization completed.')
    } catch (error) {
      console.error('Automatic notification initialization failed:', error)
    } finally {
      initializationPromise = null
    }
  })()

  return initializationPromise
}

/*
  Explicit first-time device registration.
  Called by the Enable on This Device button.
*/
export async function registerNotifications() {
  if (typeof window === 'undefined') {
    throw new Error('Notifications require a browser.')
  }

  const { messaging, registration } = await getReadyMessaging()

  let permission = Notification.permission

  if (permission !== 'granted') {
    permission = await Notification.requestPermission()
  }

  if (permission !== 'granted') {
    throw new Error('Please allow notifications in your browser settings.')
  }

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration
  })

  if (!token) {
    throw new Error('Firebase could not generate an FCM token.')
  }

  await saveTokenWithBackend(token)
  await registerForegroundListener(messaging)

  console.log('Home Needs notifications enabled successfully.')

  return {
    success: true,
    message: 'Notifications enabled successfully.'
  }
}
