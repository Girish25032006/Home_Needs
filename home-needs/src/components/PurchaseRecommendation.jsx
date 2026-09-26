
import { useState, useEffect } from 'react'
import './PurchaseRecommendation.css'

const API_URL = 'http://localhost:5000'

function PurchaseRecommendation() {
  const [recommendations, setRecommendations] = useState([])
  const [unitPrices, setUnitPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addingId, setAddingId] = useState(null)
  const [message, setMessage] = useState('')

  // Fetch AI recommendations and product unit prices
  const fetchRecommendations = async () => {
    setLoading(true)
    setError('')

    try {
      // Fetch AI predictions
      const response = await fetch(`${API_URL}/ai-predictions`)

      if (!response.ok) {
        throw new Error('Failed to fetch recommendations')
      }

      const data = await response.json()

      const items = Array.isArray(data)
        ? data
        : data.predictions || []

      setRecommendations(items)

      // Fetch latest product unit prices
      const priceResponse = await fetch(
        `${API_URL}/purchase-unit-prices`
      )

      if (!priceResponse.ok) {
        throw new Error('Failed to fetch product prices')
      }

      const priceData = await priceResponse.json()

      const priceMap = {}

      priceData.forEach(item => {
        priceMap[item.product_id] = Number(item.unit_price)
      })

      setUnitPrices(priceMap)

    } catch (err) {
      console.error('Recommendation error:', err)
      setError(
        'Unable to load recommendations or prices. Please check Flask.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecommendations()
  }, [])

  // Calculate recommended purchase quantity for 7 days
  const getRecommendedQuantity = (item) => {
    const dailyUsage = Number(
      item.average_daily_consumption || 0
    )

    const currentStock = Number(
      item.current_stock || 0
    )

    return Math.max(
      0,
      Number(
        (7 * dailyUsage - currentStock).toFixed(2)
      )
    )
  }

  // Add recommended product to Shopping List
  const handleAdd = async (item) => {
    setAddingId(item.product_id)
    setMessage('')
    setError('')

    try {
      const requiredQuantity = getRecommendedQuantity(item)

      if (requiredQuantity <= 0) {
        throw new Error(
          'No additional quantity is required for this product.'
        )
      }

      const response = await fetch(
        `${API_URL}/shopping-list/add-prediction`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            product_id: item.product_id,
            required_quantity: requiredQuantity
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Failed to add item'
        )
      }

      setMessage(
        `${item.product_name} (${requiredQuantity} ${item.unit || ''}) added to your Shopping List!`
      )

    } catch (err) {
      console.error('Add recommendation error:', err)
      setError(
        err.message || 'Unable to add item to Shopping List.'
      )
    } finally {
      setAddingId(null)
    }
  }

  // Format predicted days remaining
  const getRemainingText = (days) => {
    if (days === null || days === undefined) {
      return 'Not enough consumption data'
    }

    if (days <= 0) {
      return 'May be out of stock'
    }

    if (days < 1) {
      return 'Expected to finish today'
    }

    if (days < 2) {
      return 'Expected to finish tomorrow'
    }

    return `Expected to finish in ${Math.ceil(days)} days`
  }

  // Show recommendation status
  const getStatusText = (status) => {
    if (!status) return 'Based on consumption'

    return status
  }

  // Recommend only products with less than 7 days remaining
  const recommendedItems = recommendations.filter(item => {
    const days = Number(item.days_remaining)

    return (
      item.days_remaining !== null &&
      item.days_remaining !== undefined &&
      Number.isFinite(days) &&
      days < 7
    )
  })

  // Calculate total estimated cost
  const estimatedCost = recommendedItems.reduce(
    (total, item) => {
      const recommendedQuantity =
        getRecommendedQuantity(item)

      const unitPrice = unitPrices[item.product_id]

      // Skip products without a recorded unit price
      if (
        unitPrice === undefined ||
        !Number.isFinite(unitPrice)
      ) {
        return total
      }

      return total + recommendedQuantity * unitPrice
    },
    0
  )

  return (
    <div className="purchase-recommendation">

      <div className="page-title">
        <h1>🛍️ Purchase Recommendations</h1>
        <p>
          Smart suggestions based on your household needs
        </p>
      </div>

      {/* Recommendation Summary */}

      <div className="recommendation-summary">

        <div className="recommendation-summary-card">
          <span>🛒</span>
          <div>
            <h3>Recommended Items</h3>
            <strong>{recommendedItems.length}</strong>
          </div>
        </div>

        <div className="recommendation-summary-card">
          <span>📦</span>
          <div>
            <h3>Products Tracked</h3>
            <strong>{recommendations.length}</strong>
          </div>
        </div>

        <div className="recommendation-summary-card">
          <span>💰</span>
          <div>
            <h3>Estimated Cost</h3>
            <strong>
              ₹{estimatedCost.toFixed(2)}
            </strong>
          </div>
        </div>

      </div>

      {/* Recommendations */}

      <div className="recommendation-section">

        <h2>💡 What You Should Buy</h2>

        {loading && (
          <p>Loading purchase recommendations...</p>
        )}

        {error && (
          <p style={{ color: 'red' }}>
            {error}
          </p>
        )}

        {!loading &&
          !error &&
          recommendedItems.length === 0 && (
            <p>
              No purchase recommendations available.
              Add consumption records to get recommendations.
            </p>
          )}

        {!loading &&
          recommendedItems.map((item) => (
            <div
              className="recommendation-card"
              key={item.product_id}
            >

              <div className="recommendation-product">

                <div className="recommendation-icon">
                  🛒
                </div>

                <div>
                  <h3>{item.product_name}</h3>

                  <p>
                    Current quantity:{' '}
                    {item.current_stock ?? 0}{' '}
                    {item.unit || ''}
                  </p>

                  <small>
                    {getRemainingText(item.days_remaining)}
                  </small>

                  <small>
                    Status: {getStatusText(item.status)}
                  </small>
                </div>

              </div>

              <div className="recommendation-quantity">
                <span>Recommended Quantity</span>
                <strong>
                  {getRecommendedQuantity(item)}{' '}
                  {item.unit || ''}
                </strong>
              </div>

              <button
                onClick={() => handleAdd(item)}
                disabled={addingId === item.product_id}
              >
                {addingId === item.product_id
                  ? 'Adding...'
                  : '✓ Accept'}
              </button>

            </div>
          ))}

        {message && (
          <p style={{ color: 'green' }}>
            {message}
          </p>
        )}

      </div>

      {/* Recommendation Note */}

      <div className="recommendation-note">

        <h2>🤖 How Home Needs Decides</h2>

        <p>
          Home Needs uses your consumption history,
          current stock, average daily consumption
          and predicted run-out date to recommend
          additional quantities for a 7-day supply.
          Estimated cost is calculated using the latest
          recorded purchase unit prices.
        </p>

      </div>

    </div>
  )
}

export default PurchaseRecommendation