import './Profile.css'

function Profile() {
  return (
    <div className="profile-page">

      <div className="page-title">
        <h1>👤 Profile & Settings</h1>
        <p>Manage your Home Needs account and preferences</p>
      </div>

      {/* Profile Information */}

      <div className="profile-card">

        <div className="profile-avatar">
          👤
        </div>

        <div className="profile-info">
          <h2>Home User</h2>
          <p>homeuser@example.com</p>
        </div>

      </div>


      {/* Household Information */}

      <div className="settings-card">

        <h2>🏠 Household Information</h2>

        <div className="settings-form">

          <div className="form-group">
            <label>Household Name</label>
            <input
              type="text"
              placeholder="Example: My Home"
            />
          </div>

          <div className="form-group">
            <label>Family Members</label>

            <select>
              <option>1</option>
              <option>2</option>
              <option>3</option>
              <option>4</option>
              <option>5+</option>
            </select>
          </div>

        </div>

      </div>


      {/* Preferences */}

      <div className="settings-card">

        <h2>🍽️ Preferences</h2>

        <div className="settings-form">

          <div className="form-group">
            <label>Food Preference</label>

            <select>
              <option>Vegetarian</option>
              <option>Non-Vegetarian</option>
              <option>Both</option>
            </select>
          </div>

          <div className="form-group">
            <label>Cooking Preference</label>

            <select>
              <option>Quick Meals</option>
              <option>Healthy Meals</option>
              <option>Traditional Meals</option>
              <option>All Types</option>
            </select>
          </div>

        </div>

      </div>


      {/* Notifications */}

      <div className="settings-card">

        <h2>🔔 Notifications</h2>

        <div className="notification-option">
          <div>
            <h3>Expiry Alerts</h3>
            <p>Get notified when products are about to expire.</p>
          </div>

          <input type="checkbox" defaultChecked />
        </div>

        <div className="notification-option">
          <div>
            <h3>Low Stock Alerts</h3>
            <p>Get notified when household products are running low.</p>
          </div>

          <input type="checkbox" defaultChecked />
        </div>

        <div className="notification-option">
          <div>
            <h3>Meal Suggestions</h3>
            <p>Receive meal suggestions based on available products.</p>
          </div>

          <input type="checkbox" defaultChecked />
        </div>

      </div>


      <button className="profile-save-button">
        💾 Save Settings
      </button>

    </div>
  )
}

export default Profile