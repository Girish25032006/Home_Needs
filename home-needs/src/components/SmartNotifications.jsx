
import { useEffect, useState } from 'react'
import './SmartNotifications.css'

function SmartNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchNotifications = async () => {
    setLoading(true)
    setError('')

    try {
      // Fetch AI predictions
      const predictionResponse = await fetch(
        'http://localhost:5000/ai-predictions'
      )

      if (!predictionResponse.ok) {
        throw new Error('Failed to fetch AI predictions')
      }

      const predictionData = await predictionResponse.json()

      const predictions = predictionData.predictions || []

      const newNotifications = []

      // Low stock notifications: strictly less than 7 days
      predictions.forEach((item) => {
        const days = Number(item.days_remaining)

        if (
          item.days_remaining !== null &&
          item.days_remaining !== undefined &&
          Number.isFinite(days) &&
          days >= 0 &&
          days < 7
        ) {
          newNotifications.push({
            id: `stock-${item.product_id}`,
            icon: '⚠️',
            title: `${item.product_name} is running low`,
            message:
              days === 0
                ? `${item.product_name} may run out today.`
                : `${item.product_name} may finish in ${days} day(s).`,
            type: days <= 2 ? 'Urgent' : 'Reminder'
          })
        }
      })

      // Fetch products for expiry notifications
      const productResponse = await fetch(
        'http://localhost:5000/products'
      )

      if (productResponse.ok) {
        const productData = await productResponse.json()

        const products = Array.isArray(productData)
          ? productData
          : productData.products || []

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        products.forEach((product) => {
          const expiryValue =
            product.expiry_date || product.expiryDate

          if (!expiryValue) return

          const expiryDate = new Date(
            expiryValue + 'T00:00:00'
          )

          if (Number.isNaN(expiryDate.getTime())) return

          const difference =
            expiryDate.getTime() - today.getTime()

          const daysToExpiry = Math.ceil(
            difference / (1000 * 60 * 60 * 24)
          )

          // Show products expiring within 7 days
          if (daysToExpiry >= 0 && daysToExpiry < 7) {
            newNotifications.push({
              id: `expiry-${product.id}`,
              icon: '📅',
              title: `${product.product_name} is nearing expiry`,
              message:
                daysToExpiry === 0
                  ? `${product.product_name} expires today.`
                  : `${product.product_name} expires in ${daysToExpiry} day(s).`,
              type: 'Expiry'
            })
          }
        })
      }

      setNotifications(newNotifications)

    } catch (err) {
      console.error('Notification error:', err)
      setError('Unable to load notifications.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  // Calculate notification counts dynamically
  const urgentCount = notifications.filter(
    (item) => item.type === 'Urgent'
  ).length

  const reminderCount = notifications.filter(
    (item) => item.type === 'Reminder'
  ).length

  const expiryCount = notifications.filter(
    (item) => item.type === 'Expiry'
  ).length

  return (
    <div className="notifications-page">

      {/* Page Header */}

      <div className="notifications-title">
        <h1>🔔 Smart Notifications</h1>
        <p>
          Important updates about your household needs
        </p>
      </div>

      {/* Notification Summary */}

      <div className="notification-summary">

        <div className="summary-card">
          <span>🔴</span>
          <div>
            <strong>{urgentCount}</strong>
            <p>Urgent</p>
          </div>
        </div>

        <div className="summary-card">
          <span>🟡</span>
          <div>
            <strong>{reminderCount}</strong>
            <p>Reminders</p>
          </div>
        </div>

        <div className="summary-card">
          <span>🟢</span>
          <div>
            <strong>{expiryCount}</strong>
            <p>Expiry</p>
          </div>
        </div>

      </div>

      {/* Refresh Notifications */}

      <button
        className="shopping-button"
        onClick={fetchNotifications}
        disabled={loading}
        style={{ marginBottom: '20px' }}
      >
        {loading ? 'Loading...' : '🔄 Refresh Notifications'}
      </button>

      {/* Notifications List */}

      <div className="notifications-list">

        {loading && (
          <p>Loading notifications...</p>
        )}

        {error && (
          <p>{error}</p>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="notification-card">
            <div className="notification-icon">
              ✅
            </div>

            <div className="notification-content">
              <h2>All products are looking good!</h2>
              <p>
                No products are predicted to run out
                within 7 days, and no expiry alerts
                are currently available.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && notifications.map(
          (notification) => (
            <div
              className="notification-card"
              key={notification.id}
            >

              <div className="notification-icon">
                {notification.icon}
              </div>

              <div className="notification-content">
                <h2>{notification.title}</h2>
                <p>{notification.message}</p>
              </div>

              <div
                className={`notification-type ${notification.type.toLowerCase()}`}
              >
                {notification.type}
              </div>

            </div>
          )
        )}

      </div>

    </div>
  )
}

export default SmartNotifications