import './Dashboard.css'
function Dashboard() {
  return (
    <div className="dashboard">

      {/* Welcome */}
      <div className="dashboard-welcome">
        <h1>Good Morning! 👋</h1>
        <p>Here's what your home needs today.</p>
      </div>

      {/* Summary Cards */}
      <div className="dashboard-cards">

        <div className="dashboard-card">
          <div className="card-icon">🛒</div>
          <div>
            <h3>Shopping List</h3>
            <strong>5 Items</strong>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon">⚠️</div>
          <div>
            <h3>Expiring Soon</h3>
            <strong>2 Items</strong>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon">📦</div>
          <div>
            <h3>Low Stock</h3>
            <strong>3 Items</strong>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon">🍳</div>
          <div>
            <h3>Meal Ideas</h3>
            <strong>10 Dishes</strong>
          </div>
        </div>

      </div>

      {/* AI Predictions */}
      <section className="dashboard-section">

        <h2>🤖 AI Predictions</h2>

        <div className="prediction-list">

          <div className="prediction-item">
            <span>🍚 Rice</span>
            <strong>May finish in 4 days</strong>
          </div>

          <div className="prediction-item">
            <span>🛢️ Cooking Oil</span>
            <strong>May finish in 1 day</strong>
          </div>

          <div className="prediction-item">
            <span>🧺 Detergent</span>
            <strong>May finish in 6 days</strong>
          </div>

        </div>

      </section>

      {/* Shopping List Preview */}
      <section className="dashboard-section">

        <h2>🛍️ Shopping List</h2>

        <div className="shopping-preview">

          <div>
            <span>🍚 Rice</span>
            <strong>5 Kg</strong>
          </div>

          <div>
            <span>🛢️ Cooking Oil</span>
            <strong>2 Litre</strong>
          </div>

          <div>
            <span>🧺 Detergent</span>
            <strong>2 Packet</strong>
          </div>

        </div>

      </section>

      {/* Expiry */}
      <section className="dashboard-section">

        <h2>⏰ Expiring Soon</h2>

        <div className="expiry-preview">

          <div>
            <span>🥛 Milk</span>
            <strong>Tomorrow</strong>
          </div>

          <div>
            <span>🍞 Bread</span>
            <strong>In 2 days</strong>
          </div>

        </div>

      </section>

    </div>
  )
}

export default Dashboard