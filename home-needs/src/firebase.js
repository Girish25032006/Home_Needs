
import { initializeApp, getApp, getApps } from 'firebase/app'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyA1v8C1gP7cuBr8I9CJBBeVoRzZJ8SRLgw",
  authDomain: "home-needs-9e084.firebaseapp.com",
  projectId: "home-needs-9e084",
  storageBucket: "home-needs-9e084.firebasestorage.app",
  messagingSenderId: "919293265857",
  appId: "1:919293265857:web:e927ba167d01854b111140",
  measurementId: "G-YE7FHELHC1"
}

// Initialize Firebase only once.
const app = getApps().length > 0
  ? getApp()
  : initializeApp(firebaseConfig)

// Check Firebase Messaging support.
export const messagingSupported = async () => {
  try {
    return await isSupported()
  } catch (error) {
    console.warn('Firebase support check failed:', error)
    return false
  }
}

// Initialize Firebase Messaging.
export const messagingPromise = (async () => {
  try {
    const supported = await messagingSupported()

    if (!supported) {
      console.warn('Firebase Messaging is not supported.')
      return null
    }

    return getMessaging(app)
  } catch (error) {
    console.error(
      'Firebase Messaging initialization failed:',
      error
    )
    return null
  }
})()

export default app
