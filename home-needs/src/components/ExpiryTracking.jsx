import './ExpiryTracking.css'

function ExpiryTracking() {
  return (
    <div className="expiry-tracking">

      <div className="page-title">
        <h1>⏰ Expiry Tracking</h1>
        <p>Keep track of products that are expiring soon</p>
      </div>

      {/* Expiry Summary */}

      <div className="expiry-summary">

        <div className="expiry-summary-card">
          <span>⚠️</span>
          <div>
            <h3>Expiring Soon</h3>
            <strong>3</strong>
          </div>
        </div>

        <div className="expiry-summary-card">
          <span>📅</span>
          <div>
            <h3>Expiring This Week</h3>
            <strong>5</strong>
          </div>
        </div>

        <div className="expiry-summary-card">
          <span>✅</span>
          <div>
            <h3>Fresh Products</h3>
            <strong>14</strong>
          </div>
        </div>

      </div>


      {/* Expiring Products */}

      <div className="expiry-section">

        <h2>⚠️ Products Expiring Soon</h2>

        <div className="expiry-card">

          <div className="expiry-product">
            <div className="expiry-icon">🥛</div>

            <div>
              <h3>Milk</h3>
              <p>1 Litre • Purchased 5 September 2026</p>
            </div>
          </div>

          <div className="expiry-date danger">
            <span>Expires</span>
            <strong>Tomorrow</strong>
          </div>

        </div>


        <div className="expiry-card">

          <div className="expiry-product">
            <div className="expiry-icon">🍞</div>

            <div>
              <h3>Bread</h3>
              <p>1 Packet • Purchased 6 September 2026</p>
            </div>
          </div>

          <div className="expiry-date warning">
            <span>Expires</span>
            <strong>In 2 days</strong>
          </div>

        </div>


        <div className="expiry-card">

          <div className="expiry-product">
            <div className="expiry-icon">🥫</div>

            <div>
              <h3>Tomato Sauce</h3>
              <p>1 Bottle • Purchased 1 September 2026</p>
            </div>
          </div>

          <div className="expiry-date">
            <span>Expires</span>
            <strong>In 5 days</strong>
          </div>

        </div>

      </div>


      {/* Smart Suggestion */}

      <div className="expiry-suggestion">

        <h2>💡 Smart Suggestion</h2>

        <p>
          Milk is expiring tomorrow. Home Needs recommends
          using it soon to avoid food waste.
        </p>

        <button>
          🍽️ Find Meals
        </button>

      </div>

    </div>
  )
}

export default ExpiryTracking