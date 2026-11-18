import { useCallback, useEffect, useMemo, useState } from 'react'
import './SmartNotifications.css'
import { registerNotifications, initializeNotifications } from '../notificationService'
import API_URL from '../api'

const DEFAULT_SETTINGS = {
  expiry_reminder_days: 3,
  low_stock_threshold: 1,
  expiry_notifications_enabled: true,
  low_stock_notifications_enabled: true,
  ai_notifications_enabled: true,
  reminder_time: '08:00'
}

const TIME_OPTIONS = [
  ['06:00', '06:00 AM'], ['07:00', '07:00 AM'], ['08:00', '08:00 AM'],
  ['09:00', '09:00 AM'], ['10:00', '10:00 AM'], ['12:00', '12:00 PM'],
  ['18:00', '06:00 PM'], ['20:00', '08:00 PM']
]

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || fallback)
  return data
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function getCategory(type = '') {
  if (type.startsWith('expiry')) return 'Expiry'
  if (type === 'low_stock') return 'Low Stock'
  if (type.startsWith('ai_runout')) return 'AI Prediction'
  return 'Reminder'
}

function getIcon(type = '') {
  if (type.startsWith('expiry')) return '📅'
  if (type === 'low_stock') return '📦'
  if (type.startsWith('ai_runout')) return '🤖'
  return '🔔'
}

function getUrgency(type = '') {
  if (type === 'low_stock' || type === 'expiry_expired' || type === 'expiry_today' || type === 'ai_runout_1_day') return 'urgent'
  if (type === 'expiry_1_day' || type === 'expiry_3_days' || type === 'expiry_7_days' || type === 'ai_runout_3_days') return 'soon'
  return 'normal'
}

function SmartNotifications() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [enabling, setEnabling] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [productSettings, setProductSettings] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [showProductSettings, setShowProductSettings] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState('All')

  const fetchNotifications = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/notifications`, { credentials: 'include' })
      const data = await readResponse(response, 'Unable to load notifications')
      setNotifications(Array.isArray(data.notifications) ? data.notifications : [])
      setUnreadCount(Number(data.unread_count || 0))
    } catch (err) {
      setError(err.message || 'Unable to load notifications.')
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/reminder-settings`, { credentials: 'include' })
      const data = await readResponse(response, 'Unable to load reminder settings')
      setSettings(previous => ({
        ...previous,
        ...data,
        expiry_reminder_days: Number(data.expiry_reminder_days ?? 3),
        low_stock_threshold: Number(data.low_stock_threshold ?? 1),
        expiry_notifications_enabled: Boolean(Number(data.expiry_notifications_enabled)),
        low_stock_notifications_enabled: Boolean(Number(data.low_stock_notifications_enabled)),
        ai_notifications_enabled: Boolean(Number(data.ai_notifications_enabled)),
        reminder_time: String(data.reminder_time || '08:00').slice(0, 5)
      }))
    } catch (err) {
      setError(err.message || 'Unable to load reminder settings.')
    }
  }, [])

  const fetchProductSettings = useCallback(async () => {
    setProductsLoading(true)
    try {
      const response = await fetch(`${API_URL}/product-reminder-settings`, { credentials: 'include' })
      const data = await readResponse(response, 'Unable to load product settings')
      setProductSettings(Array.isArray(data) ? data : (data.products || []))
    } catch (err) {
      setError(err.message || 'Unable to load product settings.')
    } finally {
      setProductsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchNotifications()
    initializeNotifications()
  }, [fetchSettings, fetchNotifications])

  const updateSetting = (field, value) => setSettings(previous => ({ ...previous, [field]: value }))

  const saveReminderSettings = async () => {
    setSettingsLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_URL}/reminder-settings`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          expiry_reminder_days: Number(settings.expiry_reminder_days),
          low_stock_threshold: Number(settings.low_stock_threshold),
          reminder_time: settings.reminder_time || '08:00'
        })
      })
      await readResponse(response, 'Failed to save reminder settings')
      setMessage('Reminder settings saved successfully.')
      await fetchSettings()
      await fetchNotifications(false)
    } catch (err) {
      setError(err.message || 'Unable to save settings.')
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleEnableNotifications = async () => {
    setEnabling(true)
    setError('')
    setMessage('')
    try {
      await registerNotifications()
      setMessage('Browser notifications are enabled and this device is registered.')
    } catch (err) {
      setError(err.message || 'Unable to enable notifications.')
    } finally {
      setEnabling(false)
    }
  }

  const handleTestNotification = async () => {
    setTestSending(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_URL}/send-test-notification`, {
        method: 'POST', credentials: 'include'
      })
      const data = await readResponse(response, 'Failed to send test notification')
      setMessage(data.message || 'Test notification sent. Check your browser/device.')
    } catch (err) {
      setError(err.message || 'Unable to send test notification.')
    } finally {
      setTestSending(false)
    }
  }

  const markAsRead = async id => {
    setBusyId(id)
    try {
      const response = await fetch(`${API_URL}/notifications/${id}/read`, {
        method: 'PUT', credentials: 'include'
      })
      await readResponse(response, 'Unable to mark notification as read')
      await fetchNotifications(false)
    } catch (err) { setError(err.message) }
    finally { setBusyId(null) }
  }

  const markAllAsRead = async () => {
    setBusyId('all')
    try {
      const response = await fetch(`${API_URL}/notifications/read-all`, {
        method: 'PUT', credentials: 'include'
      })
      await readResponse(response, 'Unable to mark notifications as read')
      await fetchNotifications(false)
      setMessage('All notifications marked as read.')
    } catch (err) { setError(err.message) }
    finally { setBusyId(null) }
  }

  const deleteNotification = async id => {
    setBusyId(id)
    try {
      const response = await fetch(`${API_URL}/notifications/${id}`, {
        method: 'DELETE', credentials: 'include'
      })
      await readResponse(response, 'Unable to delete notification')
      await fetchNotifications(false)
    } catch (err) { setError(err.message) }
    finally { setBusyId(null) }
  }

  const editProduct = product => {
    setSelectedProduct({
      ...product,
      expiry_reminder_days: product.expiry_reminder_days ?? '',
      low_stock_threshold: product.low_stock_threshold ?? '',
      expiry_notifications_enabled: product.expiry_notifications_enabled == null
        ? true : Boolean(Number(product.expiry_notifications_enabled)),
      low_stock_notifications_enabled: product.low_stock_notifications_enabled == null
        ? true : Boolean(Number(product.low_stock_notifications_enabled))
    })
  }

  const saveProductSettings = async () => {
    if (!selectedProduct) return
    const productId = selectedProduct.product_id || selectedProduct.id
    if (!productId) return setError('Product ID is missing. Please refresh product settings.')
    setSavingProduct(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/product-reminder-settings/${productId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiry_reminder_days: selectedProduct.expiry_reminder_days === '' ? null : Number(selectedProduct.expiry_reminder_days),
          low_stock_threshold: selectedProduct.low_stock_threshold === '' ? null : Number(selectedProduct.low_stock_threshold),
          expiry_notifications_enabled: selectedProduct.expiry_notifications_enabled,
          low_stock_notifications_enabled: selectedProduct.low_stock_notifications_enabled
        })
      })
      await readResponse(response, 'Failed to save product settings')
      setMessage(`Reminder settings saved for ${selectedProduct.product_name || 'this product'}.`)
      setSelectedProduct(null)
      await fetchProductSettings()
      await fetchNotifications(false)
    } catch (err) { setError(err.message || 'Unable to save product settings.') }
    finally { setSavingProduct(false) }
  }

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return productSettings.filter(product => (product.product_name || '').toLowerCase().includes(term))
  }, [productSettings, searchTerm])

  const filteredNotifications = useMemo(() => notifications.filter(item => {
    if (filter === 'Unread') return !item.is_read
    if (filter === 'Expiry') return getCategory(item.notification_type) === 'Expiry'
    if (filter === 'Low Stock') return getCategory(item.notification_type) === 'Low Stock'
    if (filter === 'AI Prediction') return getCategory(item.notification_type) === 'AI Prediction'
    return true
  }), [notifications, filter])

  const urgentCount = notifications.filter(item => getUrgency(item.notification_type) === 'urgent').length
  const expiryTodayCount = notifications.filter(item => item.notification_type === 'expiry_today').length
  const unreadVisibleCount = notifications.filter(item => !item.is_read).length

  return (
    <main className="notifications-page">
      <header className="notifications-hero">
        <div className="notifications-hero-icon">🔔</div>
        <div className="notifications-hero-content">
          <span className="notifications-eyebrow">HOME NEEDS CARE</span>
          <h1>Smart Notifications</h1>
          <p>Helpful household alerts for expiry, stock levels and AI predictions.</p>
          <span className="hero-unread"><strong>{unreadCount}</strong> unread notifications</span>
        </div>
        <div className="hero-decoration" aria-hidden="true">✦</div>
      </header>

      {error && <div className="notification-message error" role="alert"><span>⚠</span><p>{error}</p><button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
      {message && <div className="notification-message success" role="status"><span>✓</span><p>{message}</p><button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}

      <section className="notification-action-grid">
        <article className="notification-action-card enable-card">
          <div className="action-icon">🔔</div>
          <div className="action-copy"><h2>Browser Notifications</h2><p>Allow this device to receive Home Needs push alerts.</p>
            <button className="primary-button" onClick={handleEnableNotifications} disabled={enabling}>{enabling ? 'Enabling…' : 'Enable on this device'}</button>
          </div>
        </article>
        <article className="notification-action-card test-card">
          <div className="action-icon">➤</div>
          <div className="action-copy"><h2>Test Push Notification</h2><p>Send a test alert to your registered browser.</p>
            <button className="primary-button" onClick={handleTestNotification} disabled={testSending}>{testSending ? 'Sending…' : 'Send test notification'}</button>
          </div>
        </article>
      </section>

      <section className="product-settings-card">
        <div className="product-settings-heading"><div className="section-heading"><span className="section-icon peach">📦</span><div><h2>Product-wise Reminders</h2><p>Override general expiry and low-stock settings for a product.</p></div></div>
          <button className="outline-button" onClick={async () => { const next = !showProductSettings; setShowProductSettings(next); setSelectedProduct(null); if (next) await fetchProductSettings() }}>{showProductSettings ? 'Close settings' : 'Manage products'}</button>
        </div>
        {showProductSettings && <div className="product-panel">
          <input className="product-search" type="search" placeholder="Search your products…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          {selectedProduct && <div className="product-editor">
            <div className="editor-heading"><div><span className="editor-kicker">EDIT REMINDERS</span><h3>{selectedProduct.product_name}</h3><p>Leave numeric fields empty to inherit the general setting.</p></div><button className="icon-button" onClick={() => setSelectedProduct(null)} aria-label="Close editor">×</button></div>
            <div className="editor-fields">
              <label>Expiry reminder days<input type="number" min="0" max="365" value={selectedProduct.expiry_reminder_days} onChange={e => setSelectedProduct(p => ({...p, expiry_reminder_days: e.target.value}))} /></label>
              <label>Low-stock threshold<input type="number" min="0" step="0.1" value={selectedProduct.low_stock_threshold} onChange={e => setSelectedProduct(p => ({...p, low_stock_threshold: e.target.value}))} /></label>
            </div>
            <div className="editor-toggles">
              <label><span>Expiry alerts</span><input type="checkbox" checked={selectedProduct.expiry_notifications_enabled} onChange={e => setSelectedProduct(p => ({...p, expiry_notifications_enabled: e.target.checked}))} /></label>
              <label><span>Low-stock alerts</span><input type="checkbox" checked={selectedProduct.low_stock_notifications_enabled} onChange={e => setSelectedProduct(p => ({...p, low_stock_notifications_enabled: e.target.checked}))} /></label>
            </div>
            <div className="editor-actions"><button className="save-button" onClick={saveProductSettings} disabled={savingProduct}>{savingProduct ? 'Saving…' : 'Save product settings'}</button><button className="cancel-button" onClick={() => setSelectedProduct(null)}>Cancel</button></div>
          </div>}
          {productsLoading ? <p className="panel-state">Loading products…</p> : <div className="product-list">
            {filteredProducts.map(product => <article className="product-row" key={product.product_id}><div className="product-row-icon">📦</div><div className="product-row-info"><strong>{product.product_name}</strong><small>Expiry: {product.effective_expiry_reminder_days ?? settings.expiry_reminder_days} days · Low stock: {product.effective_low_stock_threshold ?? settings.low_stock_threshold}</small></div><button className="edit-button" onClick={() => editProduct(product)}>Edit</button></article>)}
            {filteredProducts.length === 0 && <p className="panel-state">No matching products found.</p>}
          </div>}
        </div>}
      </section>

      <section className="summary-section">
        <div className="section-heading"><span className="section-icon">▦</span><div><h2>Notification Overview</h2><p>A quick look at your household alerts.</p></div></div>
        <div className="summary-grid">
          <article className="summary-card urgent"><span>⚠️</span><small>Urgent alerts</small><strong>{loading ? '—' : urgentCount}</strong></article>
          <article className="summary-card upcoming"><span>◷</span><small>Saved notifications</small><strong>{loading ? '—' : notifications.length}</strong></article>
          <article className="summary-card expiry"><span>📅</span><small>Expiring today</small><strong>{loading ? '—' : expiryTodayCount}</strong></article>
          <article className="summary-card unread"><span>🔔</span><small>Unread</small><strong>{loading ? '—' : unreadVisibleCount}</strong></article>
        </div>
      </section>

      <section className="notifications-list" id="household-notifications">
        <div className="list-heading"><div className="section-heading"><span className="section-icon">🔔</span><div><h2>Your Household Notifications</h2><p>{notifications.length} saved notification{notifications.length === 1 ? '' : 's'}</p></div></div>
          <div className="list-actions"><button className="outline-button" onClick={() => fetchNotifications()} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button><button className="outline-button" onClick={markAllAsRead} disabled={!unreadCount || busyId === 'all'}>{busyId === 'all' ? 'Updating…' : 'Mark all read'}</button></div>
        </div>
        <div className="notification-filters">{['All', 'Unread', 'Expiry', 'Low Stock', 'AI Prediction'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
        {loading ? <div className="empty-state">Loading your notifications…</div> : filteredNotifications.length === 0 ? <div className="empty-state"><span>🌿</span><strong>{notifications.length ? 'No notifications in this filter' : 'No notifications right now'}</strong><p>{notifications.length ? 'Try another filter to see your alerts.' : 'Your household is looking good. New alerts will appear here.'}</p></div> :
          <div className="notification-items">{filteredNotifications.map(item => {
            const type = item.notification_type || ''
            const category = getCategory(type)
            const urgency = getUrgency(type)
            return <article className={`notification-item ${urgency} ${item.is_read ? 'is-read' : 'is-unread'}`} key={item.id}>
              <div className="notification-icon">{getIcon(type)}</div>
              <div className="notification-body"><div className="notification-title-row"><h3>{item.title || category}</h3>{!item.is_read && <span className="unread-dot" title="Unread" />}</div><p>{item.message || 'You have a new household reminder.'}</p><div className="notification-details"><span>{item.product_name || 'Household product'}</span><span>{formatDate(item.created_at || item.notification_date)}</span></div></div>
              <div className="notification-actions"><span className={`category-pill ${category.toLowerCase().replaceAll(' ', '-')}`}>{category}</span>{!item.is_read && <button onClick={() => markAsRead(item.id)} disabled={busyId === item.id}>Mark read</button>}<button className="delete-button" onClick={() => deleteNotification(item.id)} disabled={busyId === item.id}>Delete</button></div>
            </article>
          })}</div>}
      </section>
      <p className="notification-footnote">Notifications are generated when Home Needs checks your notification feed. Automatic delivery while the app is closed requires a scheduled backend job.</p>
    </main>
  )
}

export default SmartNotifications
