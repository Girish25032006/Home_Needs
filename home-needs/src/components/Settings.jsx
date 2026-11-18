import { useCallback, useEffect, useState } from 'react'
import API_URL from '../api'
import './Settings.css'

const DEFAULT_SETTINGS = {
  expiry_reminder_days: 3,
  low_stock_threshold: 1,
  expiry_notifications_enabled: true,
  low_stock_notifications_enabled: true,
  ai_notifications_enabled: true,
  reminder_time: '08:00'
}

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || data.error || fallback)
  return data
}

function toBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = String(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function normalizeSettings(data = {}) {
  return {
    expiry_reminder_days: Number(data.expiry_reminder_days ?? DEFAULT_SETTINGS.expiry_reminder_days),
    low_stock_threshold: Number(data.low_stock_threshold ?? DEFAULT_SETTINGS.low_stock_threshold),
    expiry_notifications_enabled: toBoolean(data.expiry_notifications_enabled),
    low_stock_notifications_enabled: toBoolean(data.low_stock_notifications_enabled),
    ai_notifications_enabled: toBoolean(data.ai_notifications_enabled),
    reminder_time: String(data.reminder_time || DEFAULT_SETTINGS.reminder_time).slice(0, 5)
  }
}

function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/reminder-settings`, { credentials: 'include' })
      const data = await readResponse(response, 'Unable to load your settings.')
      setSettings(normalizeSettings(data))
    } catch (err) {
      setError(err.message || 'Unable to load your settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const updateSetting = (field, value) => {
    setSettings(previous => ({ ...previous, [field]: value }))
    setMessage('')
  }

  const saveSettings = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_URL}/reminder-settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          expiry_reminder_days: Number(settings.expiry_reminder_days),
          low_stock_threshold: Number(settings.low_stock_threshold),
          reminder_time: settings.reminder_time || '08:00'
        })
      })
      await readResponse(response, 'Failed to save your settings.')
      setMessage('Your notification preferences have been saved.')
      await fetchSettings()
    } catch (err) {
      setError(err.message || 'Unable to save your settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="home-settings-page">
      <header className="settings-hero">
        <div className="settings-hero-icon" aria-hidden="true">⚙️</div>
        <div className="settings-hero-copy">
          <span className="settings-eyebrow">HOME NEEDS PREFERENCES</span>
          <h1>Settings</h1>
          <p>Choose when and how Home Needs sends household reminders.</p>
        </div>
        <span className="settings-hero-decoration" aria-hidden="true">✦</span>
      </header>

      {error && (
        <div className="settings-alert settings-alert-error" role="alert">
          <span>⚠️</span><p>{error}</p>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button>
        </div>
      )}
      {message && (
        <div className="settings-alert settings-alert-success" role="status">
          <span>✓</span><p>{message}</p>
          <button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button>
        </div>
      )}

      <form onSubmit={saveSettings}>
        <section className="settings-panel">
          <div className="settings-panel-heading">
            <span className="settings-section-icon">🕗</span>
            <div><h2>Daily reminder schedule</h2><p>Set your preferred time for household reminders.</p></div>
          </div>
          <div className="settings-time-row">
            <label htmlFor="home-needs-reminder-time">
              <strong>Preferred reminder time</strong>
              <small>Default time is 8:00 AM. You can change it anytime.</small>
            </label>
            <input
              id="home-needs-reminder-time"
              type="time"
              value={settings.reminder_time}
              onChange={event => updateSetting('reminder_time', event.target.value)}
              disabled={loading}
              required
            />
          </div>
          <p className="settings-note">
            This saves your preferred time. Automatic delivery while the app is closed
            also requires the scheduled background job to be configured on the server.
          </p>
        </section>

        <section className="settings-panel">
          <div className="settings-panel-heading">
            <span className="settings-section-icon">🔔</span>
            <div><h2>Notification preferences</h2><p>Choose which household alerts you want to receive.</p></div>
          </div>
          <div className="settings-toggle-list">
            <label className="settings-toggle">
              <span className="settings-toggle-icon expiry">📅</span>
              <span className="settings-toggle-copy"><strong>Expiry alerts</strong><small>Products nearing or past their expiry date.</small></span>
              <input type="checkbox" checked={settings.expiry_notifications_enabled}
                onChange={event => updateSetting('expiry_notifications_enabled', event.target.checked)} disabled={loading} />
              <i aria-hidden="true" />
            </label>
            <label className="settings-toggle">
              <span className="settings-toggle-icon stock">📦</span>
              <span className="settings-toggle-copy"><strong>Low-stock alerts</strong><small>Products at or below your selected stock threshold.</small></span>
              <input type="checkbox" checked={settings.low_stock_notifications_enabled}
                onChange={event => updateSetting('low_stock_notifications_enabled', event.target.checked)} disabled={loading} />
              <i aria-hidden="true" />
            </label>
            <label className="settings-toggle">
              <span className="settings-toggle-icon ai">🤖</span>
              <span className="settings-toggle-copy"><strong>AI prediction alerts</strong><small>Predicted product run-out reminders.</small></span>
              <input type="checkbox" checked={settings.ai_notifications_enabled}
                onChange={event => updateSetting('ai_notifications_enabled', event.target.checked)} disabled={loading} />
              <i aria-hidden="true" />
            </label>
          </div>
        </section>

        <section className="settings-panel">
          <div className="settings-panel-heading">
            <span className="settings-section-icon">🎚️</span>
            <div><h2>Alert thresholds</h2><p>Adjust when Home Needs should remind you.</p></div>
          </div>
          <div className="settings-threshold-grid">
            <label className="settings-input-field">
              <span>Expiry reminder window</span>
              <small>Number of days before expiry to remind you.</small>
              <select value={settings.expiry_reminder_days}
                onChange={event => updateSetting('expiry_reminder_days', event.target.value)} disabled={loading}>
                {[0, 1, 2, 3, 4, 5, 7, 10, 14, 30].map(day =>
                  <option key={day} value={day}>{day} {day === 1 ? 'day' : 'days'}</option>
                )}
              </select>
            </label>
            <label className="settings-input-field">
              <span>Low-stock threshold</span>
              <small>Alert when quantity is at or below this amount.</small>
              <input type="number" min="0" step="0.1" value={settings.low_stock_threshold}
                onChange={event => updateSetting('low_stock_threshold', event.target.value)} disabled={loading} />
            </label>
          </div>
        </section>

        <div className="settings-footer">
          <p>{loading ? 'Loading your saved preferences…' : 'Your preferences are saved to your Home Needs account.'}</p>
          <div className="settings-footer-actions">
            <button className="settings-reset-button" type="button" onClick={fetchSettings} disabled={loading || saving}>Reset changes</button>
            <button className="settings-save-button" type="submit" disabled={loading || saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        </div>
      </form>
    </main>
  )
}

export default Settings
