import './SmartNotifications.css'

function SmartNotifications() {
  const notifications = [
    {
      icon: '⚠️',
      title: 'Cooking Oil is running low',
      message: 'Your cooking oil may finish in 1 day.',
      type: 'Urgent',
    },
    {
      icon: '🛒',
      title: 'Rice may need to be purchased',
      message: 'Based on your consumption, rice may finish in 5 days.',
      type: 'Reminder',
    },
    {
      icon: '⏰',
      title: 'Detergent reminder',
      message: 'Your detergent may finish in 6 days.',
      type: 'Reminder',
    },
    {
      icon: '📅',
      title: 'Expiry reminder',
      message: 'Check products that are close to their expiry date.',
      type: 'Expiry',
    },
  ]

  return (
    <div className="notifications-page">

      <div className="notifications-title">
        <h1>🔔 Smart Notifications</h1>
        <p>Important updates about your household needs</p>
      </div>

      <div className="notification-summary">
        <div className="summary-card">
          <span>🔴</span>
          <div>
            <strong>1</strong>
            <p>Urgent</p>
          </div>
        </div>

        <div className="summary-card">
          <span>🟡</span>
          <div>
            <strong>2</strong>
            <p>Reminders</p>
          </div>
        </div>

        <div className="summary-card">
          <span>🟢</span>
          <div>
            <strong>1</strong>
            <p>Expiry</p>
          </div>
        </div>
      </div>

      <div className="notifications-list">
        {notifications.map((notification, index) => (
          <div className="notification-card" key={index}>

            <div className="notification-icon">
              {notification.icon}
            </div>

            <div className="notification-content">
              <h2>{notification.title}</h2>
              <p>{notification.message}</p>
            </div>

            <div className={`notification-type ${notification.type.toLowerCase()}`}>
              {notification.type}
            </div>

          </div>
        ))}
      </div>

    </div>
  )
}

export default SmartNotifications