import './AnalyticsDashboard.css'

function AnalyticsDashboard() {
  return (
    <div className="analytics-dashboard">

      {/* Page Header */}
      <div className="page-title">
        <h1>📈 Analytics Dashboard</h1>
        <p>Understand your household spending and consumption</p>
      </div>


      {/* Summary Cards */}
      <div className="analytics-summary">

        <div className="analytics-card">
          <span>💰</span>

          <div>
            <h3>Monthly Spending</h3>
            <strong>₹4,850</strong>
          </div>
        </div>


        <div className="analytics-card">
          <span>🛒</span>

          <div>
            <h3>Products Purchased</h3>
            <strong>24</strong>
          </div>
        </div>


        <div className="analytics-card">
          <span>📦</span>

          <div>
            <h3>Products Consumed</h3>
            <strong>18</strong>
          </div>
        </div>


        <div className="analytics-card">
          <span>📊</span>

          <div>
            <h3>Average Daily Usage</h3>
            <strong>3.2 items</strong>
          </div>
        </div>

      </div>


      {/* Monthly Spending */}
      <div className="analytics-section">

        <h2>💰 Monthly Spending</h2>

        <div className="spending-chart">

          <div className="chart-row">
            <span>April</span>

            <div className="bar">
              <div className="bar-fill april"></div>
            </div>

            <strong>₹3,900</strong>
          </div>


          <div className="chart-row">
            <span>May</span>

            <div className="bar">
              <div className="bar-fill may"></div>
            </div>

            <strong>₹4,200</strong>
          </div>


          <div className="chart-row">
            <span>June</span>

            <div className="bar">
              <div className="bar-fill june"></div>
            </div>

            <strong>₹4,500</strong>
          </div>


          <div className="chart-row">
            <span>July</span>

            <div className="bar">
              <div className="bar-fill july"></div>
            </div>

            <strong>₹4,100</strong>
          </div>


          <div className="chart-row">
            <span>August</span>

            <div className="bar">
              <div className="bar-fill august"></div>
            </div>

            <strong>₹4,850</strong>
          </div>

        </div>

      </div>


      {/* Most Purchased Products */}
      <div className="analytics-section">

        <h2>🛒 Most Purchased Products</h2>

        <div className="product-analysis">

          <div className="analysis-item">
            <span>🍚 Rice</span>
            <strong>8 times</strong>
          </div>


          <div className="analysis-item">
            <span>🛢️ Cooking Oil</span>
            <strong>6 times</strong>
          </div>


          <div className="analysis-item">
            <span>🥛 Milk</span>
            <strong>12 times</strong>
          </div>


          <div className="analysis-item">
            <span>🧺 Detergent</span>
            <strong>4 times</strong>
          </div>

        </div>

      </div>


      {/* Household Insight */}
      <div className="analytics-insight">

        <h2>💡 Household Insight</h2>

        <p>
          Your household spending increased by 8% compared with
          the previous month. Milk and rice are your most frequently
          purchased products.
        </p>

      </div>

    </div>
  )
}

export default AnalyticsDashboard