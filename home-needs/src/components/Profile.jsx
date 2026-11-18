import { useState, useEffect } from 'react'
import './Profile.css'
import API_URL from '../api'

function Profile() {
  const defaultSettings = {
    householdName: '',
    familyMembers: '1',
    foodPreference: 'Vegetarian',
    cookingPreference: 'Quick Meals',
    nonVegRestrictionDays: [],
    nonVegStartDate: '',
    nonVegEndDate: '',
    expiryAlerts: true,
    lowStockAlerts: true,
    mealSuggestions: true
  }

  const [settings, setSettings] = useState(defaultSettings)
  const [savedMessage, setSavedMessage] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [userLoaded, setUserLoaded] = useState(false)

  const weekDays = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ]

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      try {
        // Load the currently logged-in user first.
        const meResponse = await fetch(`${API_URL}/api/me`, {
          method: 'GET',
          credentials: 'include'
        })

        if (!meResponse.ok) {
          throw new Error(`Could not load logged-in user (${meResponse.status})`)
        }

        const meData = await meResponse.json()
        const loggedInUser = meData?.user || meData

        if (cancelled) return
        setCurrentUser(loggedInUser)

        // Family preferences are stored in MySQL and are isolated by user_id.
        const preferencesResponse = await fetch(
          `${API_URL}/user-preferences`,
          {
            method: 'GET',
            credentials: 'include'
          }
        )

        if (!preferencesResponse.ok) {
          const errorText = await preferencesResponse.text()
          throw new Error(
            `Could not load family preferences (${preferencesResponse.status}). ${errorText}`
          )
        }

        const preferencesData = await preferencesResponse.json()
        const preferences = preferencesData.preferences || {}

        if (cancelled) return

        setSettings((previousSettings) => ({
          ...previousSettings,
          householdName: preferences.household_name ?? '',
          familyMembers: String(preferences.family_members ?? '1'),
          foodPreference: preferences.food_preference ?? 'Vegetarian',
          cookingPreference: preferences.cooking_preference ?? 'Quick Meals',
          nonVegRestrictionDays: Array.isArray(
            preferences.non_veg_restriction_days
          )
            ? preferences.non_veg_restriction_days
            : [],
          nonVegStartDate: preferences.non_veg_start_date || '',
          nonVegEndDate: preferences.non_veg_end_date || '',
          mealSuggestions:
            preferences.meal_suggestions === undefined
              ? true
              : Boolean(preferences.meal_suggestions)
        }))
      } catch (error) {
        console.error('Error loading profile preferences:', error)
        if (!cancelled) {
          setSavedMessage(
            'Could not load family preferences from the server. Please refresh and try again.'
          )
        }
      } finally {
        if (!cancelled) setUserLoaded(true)
      }

      // Notification preferences remain managed by the existing reminder API.
      try {
        const response = await fetch(`${API_URL}/reminder-settings`, {
          method: 'GET',
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error(
            `Could not load reminder settings (${response.status})`
          )
        }

        const data = await response.json()
        const reminderSettings = data.settings || data

        const expiryValue =
          reminderSettings.expiry_notifications_enabled ??
          reminderSettings.expiryAlerts ??
          reminderSettings.expiry_alerts

        const lowStockValue =
          reminderSettings.low_stock_notifications_enabled ??
          reminderSettings.lowStockAlerts ??
          reminderSettings.low_stock_alerts

        if (!cancelled) {
          setSettings((previousSettings) => ({
            ...previousSettings,
            ...(expiryValue !== undefined
              ? { expiryAlerts: Boolean(expiryValue) }
              : {}),
            ...(lowStockValue !== undefined
              ? { lowStockAlerts: Boolean(lowStockValue) }
              : {})
          }))
        }
      } catch (error) {
        console.warn(
          'Could not load notification settings from Flask:',
          error
        )
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target

    setSettings((previousSettings) => ({
      ...previousSettings,
      [name]: type === 'checkbox' ? checked : value
    }))

    setSavedMessage('')
  }

  const handleRestrictionDayChange = (day) => {
    setSettings((previousSettings) => {
      const currentDays = previousSettings.nonVegRestrictionDays

      const updatedDays = currentDays.includes(day)
        ? currentDays.filter((selectedDay) => selectedDay !== day)
        : [...currentDays, day]

      return {
        ...previousSettings,
        nonVegRestrictionDays: updatedDays
      }
    })

    setSavedMessage('')
  }

  const handleClearDateRestriction = () => {
    setSettings((previousSettings) => ({
      ...previousSettings,
      nonVegStartDate: '',
      nonVegEndDate: ''
    }))

    setSavedMessage('')
  }

  const handleSave = async () => {
    if (!currentUser?.id) {
      setSavedMessage('Your account could not be verified. Please log in again.')
      return
    }

    if (
      settings.nonVegStartDate &&
      settings.nonVegEndDate &&
      settings.nonVegEndDate < settings.nonVegStartDate
    ) {
      setSavedMessage('End date must be on or after the start date.')
      return
    }

    if (
      (settings.nonVegStartDate && !settings.nonVegEndDate) ||
      (!settings.nonVegStartDate && settings.nonVegEndDate)
    ) {
      setSavedMessage('Please select both start date and end date.')
      return
    }

    setSavedMessage('')

    try {
      // Save household and meal preferences to the logged-in user's MySQL row.
      const preferencesResponse = await fetch(
        `${API_URL}/user-preferences`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            householdName: settings.householdName,
            familyMembers: settings.familyMembers,
            foodPreference: settings.foodPreference,
            cookingPreference: settings.cookingPreference,
            nonVegRestrictionDays: settings.nonVegRestrictionDays,
            nonVegStartDate: settings.nonVegStartDate || null,
            nonVegEndDate: settings.nonVegEndDate || null,
            mealSuggestions: Boolean(settings.mealSuggestions)
          })
        }
      )

      if (!preferencesResponse.ok) {
        const errorText = await preferencesResponse.text()
        throw new Error(
          `Could not save family preferences (${preferencesResponse.status}). ${errorText}`
        )
      }

      // Keep expiry and low-stock notifications on the existing API.
      const reminderResponse = await fetch(
        `${API_URL}/reminder-settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            expiry_notifications_enabled: Boolean(settings.expiryAlerts),
            low_stock_notifications_enabled: Boolean(settings.lowStockAlerts)
          })
        }
      )

      if (!reminderResponse.ok) {
        const errorText = await reminderResponse.text()
        throw new Error(
          `Family preferences were saved, but notification settings could not be saved (${reminderResponse.status}). ${errorText}`
        )
      }

      setSavedMessage('Profile and notification settings saved successfully!')
    } catch (error) {
      console.error('Error saving profile/notification settings:', error)
      setSavedMessage(
        error.message || 'Could not save settings. Please try again.'
      )
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''

    return new Date(
      dateString + 'T00:00:00'
    ).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div className="profile-page">

      {/* Page Header */}
      <div className="profile-page-header">
        <div className="profile-page-icon">⚙️</div>

        <div>
          <h1>Profile &amp; Settings</h1>
          <p>
            Manage your Home Needs account and preferences
          </p>
        </div>
      </div>

      {/* Account Card */}
      <section className="profile-account-card">
        <div className="account-main">
          <div className="large-profile-avatar">
            👤
          </div>

          <div className="account-details">
            <div className="account-name-row">
              <h2>{currentUser?.name || 'Home User'}</h2>
              <span className="active-badge">
                <span className="active-dot"></span>
                Active Account
              </span>
            </div>

            <p className="account-email">
              ✉️ {currentUser?.email || 'Email not available'}
            </p>
          </div>
        </div>

        <div className="account-status-box">
          <span className="account-status-icon">👤</span>

          <div>
            <strong>Account Info</strong>
            <span>
              {currentUser?.email
                ? 'Signed in with your Home Needs account'
                : 'Home Needs household account'}
            </span>

            <small>
              <span className="status-green-dot"></span>
              Active
            </small>
          </div>
        </div>
      </section>

      {/* Household Information */}
      <section className="settings-card">
        <div className="section-heading">
          <div className="section-icon household-icon">🏠</div>

          <div>
            <h2>Household Information</h2>
            <p>
              This information helps us personalize
              recommendations for your family.
            </p>
          </div>
        </div>

        <div className="settings-form two-column">
          <div className="form-group">
            <label htmlFor="householdName">
              <span className="label-icon">🏠</span>
              Household Name
            </label>

            <input
              id="householdName"
              type="text"
              name="householdName"
              placeholder="Example: My Home"
              value={settings.householdName}
              onChange={handleChange}
            />

            <small>Enter a name for your household</small>
          </div>

          <div className="form-group">
            <label htmlFor="familyMembers">
              <span className="label-icon">👥</span>
              Family Members
            </label>

            <select
              id="familyMembers"
              name="familyMembers"
              value={settings.familyMembers}
              onChange={handleChange}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5+">5+</option>
            </select>

            <small>Total number of people in your family</small>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="settings-card">
        <div className="section-heading">
          <div className="section-icon preference-icon">🍴</div>

          <div>
            <h2>Preferences</h2>
            <p>
              Tell us your food and cooking preferences for
              better meal recommendations.
            </p>
          </div>
        </div>

        <div className="settings-form two-column">
          <div className="form-group">
            <label htmlFor="foodPreference">
              <span className="label-icon">🌿</span>
              Food Preference
            </label>

            <select
              id="foodPreference"
              name="foodPreference"
              value={settings.foodPreference}
              onChange={handleChange}
            >
              <option value="Vegetarian">Vegetarian</option>
              <option value="Non-Vegetarian">
                Non-Vegetarian
              </option>
              <option value="Both">Both</option>
            </select>

            <small>
              Used for personalized meal recommendations
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="cookingPreference">
              <span className="label-icon">🍳</span>
              Cooking Preference
            </label>

            <select
              id="cookingPreference"
              name="cookingPreference"
              value={settings.cookingPreference}
              onChange={handleChange}
            >
              <option value="Quick Meals">Quick Meals</option>
              <option value="Healthy Meals">
                Healthy Meals
              </option>
              <option value="Traditional Meals">
                Traditional Meals
              </option>
              <option value="All Types">All Types</option>
            </select>

            <small>
              Used to prioritize suitable recipes
            </small>
          </div>
        </div>
      </section>

      {/* Weekly Restrictions */}
      <section className="settings-card">
        <div className="section-heading">
          <div className="section-icon restriction-icon">📅</div>

          <div>
            <h2>Non-Vegetarian Restriction Days</h2>
            <p>
              Select the days when your family does not want
              non-vegetarian meals. Home Needs will avoid
              recommending non-veg meals on these days.
            </p>
          </div>
        </div>

        <div className="restriction-days-grid">
          {weekDays.map((day) => {
            const selected =
              settings.nonVegRestrictionDays.includes(day)

            return (
              <label
                key={day}
                className={`restriction-day ${
                  selected ? 'selected' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    handleRestrictionDayChange(day)
                  }
                />

                <span className="custom-check">
                  {selected ? '✓' : ''}
                </span>

                <span className="day-name">{day}</span>
              </label>
            )
          })}
        </div>

        <div className="restriction-summary">
          <span className="summary-icon">ⓘ</span>

          {settings.nonVegRestrictionDays.length > 0 ? (
            <p>
              Non-veg meals will be restricted on:{' '}
              <strong>
                {weekDays
                  .filter((day) =>
                    settings.nonVegRestrictionDays.includes(day)
                  )
                  .join(', ')}
              </strong>
            </p>
          ) : (
            <p>
              No restriction days selected. Non-veg meals can
              be recommended on any day according to your
              food preference and date restrictions.
            </p>
          )}
        </div>
      </section>

      {/* Temporary Restriction */}
      <section className="settings-card">
        <div className="section-heading">
          <div className="section-icon calendar-icon">📆</div>

          <div>
            <h2>Temporary Non-Veg Restriction</h2>
            <p>
              Does your family want to avoid non-vegetarian
              meals for a particular period? Select the start
              date and end date. Home Needs will hide non-veg
              recommendations during these dates.
            </p>
          </div>
        </div>

        <div className="temporary-grid">
          <div className="form-group">
            <label htmlFor="nonVegStartDate">
              <span className="label-icon">📅</span>
              Start Date
            </label>

            <input
              id="nonVegStartDate"
              type="date"
              name="nonVegStartDate"
              value={settings.nonVegStartDate}
              max={settings.nonVegEndDate || undefined}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="nonVegEndDate">
              <span className="label-icon">📅</span>
              End Date
            </label>

            <input
              id="nonVegEndDate"
              type="date"
              name="nonVegEndDate"
              value={settings.nonVegEndDate}
              min={settings.nonVegStartDate || undefined}
              onChange={handleChange}
            />
          </div>

          <button
            type="button"
            className="clear-restriction-button"
            onClick={handleClearDateRestriction}
          >
            🗑️ Clear Restriction
          </button>
        </div>

        {settings.nonVegStartDate &&
          settings.nonVegEndDate &&
          settings.nonVegEndDate >= settings.nonVegStartDate && (
            <div className="restriction-summary date-summary">
              <span className="summary-icon">ⓘ</span>

              <p>
                Non-veg meals will be restricted from{' '}
                <strong>
                  {formatDate(settings.nonVegStartDate)}
                </strong>{' '}
                to{' '}
                <strong>
                  {formatDate(settings.nonVegEndDate)}
                </strong>
                .
              </p>
            </div>
          )}
      </section>

      {/* Notifications */}
      <section className="settings-card notifications-card">
        <div className="section-heading">
          <div className="section-icon notification-icon">🔔</div>

          <div>
            <h2>Notifications</h2>
            <p>Choose the notifications you want to receive.</p>
          </div>
        </div>

        <div className="notification-grid">

          <div className="notification-option">
            <div className="notification-icon-box expiry">
              🌿
            </div>

            <div className="notification-copy">
              <h3>Expiry Alerts</h3>
              <p>
                Get notified when products are about to expire.
              </p>
            </div>

            <label className="toggle-switch">
              <input
                type="checkbox"
                name="expiryAlerts"
                checked={settings.expiryAlerts}
                onChange={handleChange}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="notification-option">
            <div className="notification-icon-box stock">
              📦
            </div>

            <div className="notification-copy">
              <h3>Low Stock Alerts</h3>
              <p>
                Get notified when household products are running low.
              </p>
            </div>

            <label className="toggle-switch">
              <input
                type="checkbox"
                name="lowStockAlerts"
                checked={settings.lowStockAlerts}
                onChange={handleChange}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="notification-option">
            <div className="notification-icon-box meal">
              🍲
            </div>

            <div className="notification-copy">
              <h3>Meal Suggestions</h3>
              <p>
                Receive meal suggestions based on available products.
              </p>
            </div>

            <label className="toggle-switch">
              <input
                type="checkbox"
                name="mealSuggestions"
                checked={settings.mealSuggestions}
                onChange={handleChange}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

        </div>
      </section>

      {/* Save */}
      <button
        className="profile-save-button"
        onClick={handleSave}
        disabled={!userLoaded}
      >
        💾 Save Settings
      </button>

      {savedMessage && (
        <div
          role="status"
          className={`save-message ${
            savedMessage.includes('successfully')
              ? 'success'
              : 'error'
          }`}
        >
          <span>
            {savedMessage.includes('successfully') ? '✓' : '⚠'}
          </span>
          {savedMessage}
        </div>
      )}

    </div>
  )
}

export default Profile
