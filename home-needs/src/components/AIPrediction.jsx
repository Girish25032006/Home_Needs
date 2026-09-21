import './AIPrediction.css'

function AIPrediction() {
  return (
    <div className="ai-prediction">

      {/* Page Header */}
      <div className="ai-page-header">
        <div>
          <h1>🤖 AI Predictions</h1>
          <p>Smart predictions for your household products</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="prediction-summary">

        <div className="prediction-summary-card green-card">
          <div className="summary-icon">📦</div>

          <div className="summary-content">
            <span>Products Tracked</span>
            <strong>12</strong>
            <small>Currently monitored</small>
          </div>
        </div>

        <div className="prediction-summary-card orange-card">
          <div className="summary-icon">⚠️</div>

          <div className="summary-content">
            <span>Running Low</span>
            <strong>3</strong>
            <small>Need attention soon</small>
          </div>
        </div>

        <div className="prediction-summary-card red-card">
          <div className="summary-icon">📅</div>

          <div className="summary-content">
            <span>Predicted Soon</span>
            <strong>2</strong>
            <small>May finish soon</small>
          </div>
        </div>

        <div className="prediction-summary-card green-card">
          <div className="summary-icon">🧠</div>

          <div className="summary-content">
            <span>AI Accuracy</span>
            <strong>92%</strong>
            <small>Based on usage history</small>
          </div>
        </div>

      </div>


      {/* Product Predictions */}
      <div className="prediction-main-card">

        <div className="section-header">
          <div>
            <h2>🔮 Product Predictions</h2>
            <p>AI estimated when your household products may run out</p>
          </div>
        </div>


        {/* Rice */}
        <div className="prediction-row">

          <div className="prediction-product">

            <div className="prediction-icon rice-icon">
              🍚
            </div>

            <div className="prediction-product-info">
              <h3>Rice</h3>
              <p>Current quantity: 2 Kg</p>
            </div>

          </div>

          <div className="prediction-details">

            <span>Expected to finish</span>

            <strong>
              In 4 days
            </strong>

          </div>

        </div>


        {/* Cooking Oil */}
        <div className="prediction-row">

          <div className="prediction-product">

            <div className="prediction-icon oil-icon">
              🛢️
            </div>

            <div className="prediction-product-info">
              <h3>Cooking Oil</h3>
              <p>Current quantity: 0.5 Litre</p>
            </div>

          </div>

          <div className="prediction-details warning">

            <span>Expected to finish</span>

            <strong>
              Tomorrow
            </strong>

          </div>

        </div>


        {/* Detergent */}
        <div className="prediction-row">

          <div className="prediction-product">

            <div className="prediction-icon detergent-icon">
              🧺
            </div>

            <div className="prediction-product-info">
              <h3>Detergent</h3>
              <p>Current quantity: 1 Packet</p>
            </div>

          </div>

          <div className="prediction-details">

            <span>Expected to finish</span>

            <strong>
              In 6 days
            </strong>

          </div>

        </div>

      </div>


      {/* AI Insight */}
      <div className="ai-insight">

        <div className="insight-icon">
          💡
        </div>

        <div className="insight-content">

          <h2>AI Recommendation</h2>

          <p>
            Based on your recent consumption, you may need to
            purchase <strong>Cooking Oil</strong> soon.
            Your current usage pattern suggests it may finish tomorrow.
          </p>

        </div>

        <button className="shopping-button">
          🛒 Add to Shopping List
        </button>

      </div>

    </div>
  )
}

export default AIPrediction