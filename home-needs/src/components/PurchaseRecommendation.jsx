import './PurchaseRecommendation.css'

function PurchaseRecommendation() {
  return (
    <div className="purchase-recommendation">

      <div className="page-title">
        <h1>🛍️ Purchase Recommendations</h1>
        <p>Smart suggestions based on your household needs</p>
      </div>

      {/* Recommendation Summary */}

      <div className="recommendation-summary">

        <div className="recommendation-summary-card">
          <span>🛒</span>
          <div>
            <h3>Recommended Items</h3>
            <strong>4</strong>
          </div>
        </div>

        <div className="recommendation-summary-card">
          <span>📦</span>
          <div>
            <h3>Total Quantity</h3>
            <strong>11</strong>
          </div>
        </div>

        <div className="recommendation-summary-card">
          <span>💰</span>
          <div>
            <h3>Estimated Cost</h3>
            <strong>₹850</strong>
          </div>
        </div>

      </div>


      {/* Recommendations */}

      <div className="recommendation-section">

        <h2>💡 What You Should Buy</h2>

        <div className="recommendation-card">

          <div className="recommendation-product">
            <div className="recommendation-icon">🛢️</div>

            <div>
              <h3>Cooking Oil</h3>
              <p>Current quantity: 0.5 Litre</p>
              <small>Expected to finish tomorrow</small>
            </div>
          </div>

          <div className="recommendation-quantity">
            <span>Recommended</span>
            <strong>2 Litre</strong>
          </div>

          <button>
            ➕ Add
          </button>

        </div>


        <div className="recommendation-card">

          <div className="recommendation-product">
            <div className="recommendation-icon">🍚</div>

            <div>
              <h3>Rice</h3>
              <p>Current quantity: 2 Kg</p>
              <small>Expected to finish in 4 days</small>
            </div>
          </div>

          <div className="recommendation-quantity">
            <span>Recommended</span>
            <strong>5 Kg</strong>
          </div>

          <button>
            ➕ Add
          </button>

        </div>


        <div className="recommendation-card">

          <div className="recommendation-product">
            <div className="recommendation-icon">🧺</div>

            <div>
              <h3>Detergent</h3>
              <p>Current quantity: 1 Packet</p>
              <small>Expected to finish in 6 days</small>
            </div>
          </div>

          <div className="recommendation-quantity">
            <span>Recommended</span>
            <strong>2 Packet</strong>
          </div>

          <button>
            ➕ Add
          </button>

        </div>

      </div>


      {/* Recommendation Note */}

      <div className="recommendation-note">

        <h2>🤖 How Home Needs Decides</h2>

        <p>
          Recommendations will later be calculated using your
          purchase history, current stock, consumption rate and
          predicted run-out date.
        </p>

      </div>

    </div>
  )
}

export default PurchaseRecommendation