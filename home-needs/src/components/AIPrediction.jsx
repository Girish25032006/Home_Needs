
import { useEffect, useState } from 'react'
import './AIPrediction.css'

function AIPrediction() {
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accuracy, setAccuracy] = useState(null)
  const [evaluatedCount, setEvaluatedCount] = useState(0)
  const [addingProduct, setAddingProduct] = useState(null)

  const fetchPredictions = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        'http://localhost:5000/ai-predictions'
      )

      if (!response.ok) {
        throw new Error('Failed to fetch predictions')
      }

      const data = await response.json()

      setPredictions(data.predictions || [])

    } catch (err) {
      console.error(err)
      setError('Unable to load AI predictions.')
    } finally {
      setLoading(false)
    }
  }

  const fetchAccuracy = async () => {
    try {
      const response = await fetch(
        'http://localhost:5000/ai-predictions/accuracy'
      )

      if (!response.ok) {
        throw new Error('Failed to fetch accuracy')
      }

      const data = await response.json()

      setAccuracy(data.mean_absolute_error)
      setEvaluatedCount(data.evaluated_predictions || 0)

    } catch (err) {
      console.error('Accuracy error:', err)
    }
  }

  useEffect(() => {
    fetchPredictions()
    fetchAccuracy()
  }, [])

  // Only products with 0 to less than 7 days remaining
  const lowStockProducts = predictions.filter(
    (item) =>
      item.days_remaining !== null &&
      item.days_remaining !== undefined &&
      Number.isFinite(Number(item.days_remaining)) &&
      Number(item.days_remaining) >= 0 &&
      Number(item.days_remaining) < 7
  )

  // Products running out within 3 days
  const predictedSoon = predictions.filter(
    (item) =>
      item.days_remaining !== null &&
      item.days_remaining !== undefined &&
      Number(item.days_remaining) >= 0 &&
      Number(item.days_remaining) <= 3
  ).length

  // Sort recommendations by the lowest days remaining
  const sortedRecommendations = [...lowStockProducts].sort(
    (a, b) =>
      Number(a.days_remaining) - Number(b.days_remaining)
  )

  const getProductIcon = (name) => {
    const product = (name || '').toLowerCase()

    if (product.includes('rice')) return '🍚'
    if (product.includes('oil')) return '🛢️'
    if (product.includes('detergent')) return '🧺'
    if (product.includes('sugar')) return '🍬'

    return '📦'
  }

  const getProductClass = (name) => {
    const product = (name || '').toLowerCase()

    if (product.includes('rice')) return 'rice-icon'
    if (product.includes('oil')) return 'oil-icon'
    if (product.includes('detergent')) return 'detergent-icon'

    return ''
  }

  const getFinishText = (item) => {
    if (
      item.days_remaining === null ||
      item.days_remaining === undefined
    ) {
      return 'Not enough data'
    }

    const days = Number(item.days_remaining)

    if (days === 0) {
      return 'May run out today'
    }

    if (days === 1) {
      return 'Tomorrow'
    }

    return `In ${days} days`
  }

  // Add one recommended product to Shopping List
  const addToShoppingList = async (item) => {
    setAddingProduct(item.product_id)

    try {
      const response = await fetch(
        'http://localhost:5000/shopping-list/add-prediction',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            product_id: item.product_id
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.message || 'Failed to add product'
        )
      }

      alert(
        `${data.product_name || item.product_name} added to your shopping list!`
      )

    } catch (error) {
      console.error('Shopping list error:', error)
      alert(
        error.message || 'Unable to add product to shopping list.'
      )
    } finally {
      setAddingProduct(null)
    }
  }

  return (
    <div className="ai-prediction">

      {/* Page Header */}

      <div className="ai-page-header">
        <div>
          <h1>🤖 AI Predictions</h1>
          <p>
            Smart predictions for your household products
          </p>
        </div>
      </div>

      {/* Summary Cards */}

      <div className="prediction-summary">

        <div className="prediction-summary-card green-card">
          <div className="summary-icon">📦</div>

          <div className="summary-content">
            <span>Products Tracked</span>
            <strong>{predictions.length}</strong>
            <small>Currently monitored</small>
          </div>
        </div>

        <div className="prediction-summary-card orange-card">
          <div className="summary-icon">⚠️</div>

          <div className="summary-content">
            <span>Running Low</span>
            <strong>{lowStockProducts.length}</strong>
            <small>Less than 7 days remaining</small>
          </div>
        </div>

        <div className="prediction-summary-card red-card">
          <div className="summary-icon">📅</div>

          <div className="summary-content">
            <span>Predicted Soon</span>
            <strong>{predictedSoon}</strong>
            <small>Within 3 days</small>
          </div>
        </div>

        {/* Actual Prediction Error */}

        <div className="prediction-summary-card green-card">
          <div className="summary-icon">🧠</div>

          <div className="summary-content">
            <span>Prediction Error</span>

            <strong>
              {accuracy !== null
                ? `${accuracy} days`
                : '—'}
            </strong>

            <small>
              {evaluatedCount > 0
                ? `Based on ${evaluatedCount} evaluated predictions`
                : 'Waiting for actual results'}
            </small>
          </div>
        </div>

      </div>

      {/* Product Predictions */}

      <div className="prediction-main-card">

        <div className="section-header">
          <div>
            <h2>🔮 Product Predictions</h2>
            <p>
              Estimated time until your household products run out
            </p>
          </div>
        </div>

        {loading && (
          <p>Loading predictions...</p>
        )}

        {error && (
          <p>{error}</p>
        )}

        {!loading && !error && predictions.length === 0 && (
          <p>No products found.</p>
        )}

        {!loading && !error && predictions.map((item) => (

          <div
            className="prediction-row"
            key={item.product_id}
          >

            <div className="prediction-product">

              <div
                className={`prediction-icon ${getProductClass(item.product_name)}`}
              >
                {getProductIcon(item.product_name)}
              </div>

              <div className="prediction-product-info">
                <h3>{item.product_name}</h3>

                <p>
                  Current quantity: {item.current_stock} {item.unit}
                </p>

                <p>
                  Average daily usage:{' '}
                  {item.average_daily_consumption} {item.unit}/day
                </p>
              </div>

            </div>

            <div
              className={`prediction-details ${
                item.days_remaining !== null &&
                Number(item.days_remaining) < 7 &&
                Number(item.days_remaining) >= 0
                  ? 'warning'
                  : ''
              }`}
            >

              <span>Expected to finish</span>

              <strong>
                {getFinishText(item)}
              </strong>

              {item.predicted_date && (
                <small>
                  {new Date(
                    item.predicted_date + 'T00:00:00'
                  ).toLocaleDateString('en-IN')}
                </small>
              )}

            </div>

          </div>

        ))}

      </div>

      {/* AI Recommendation */}

      <div className="ai-insight">

        <div className="insight-icon">
          💡
        </div>

        <div className="insight-content">

          <h2>AI Recommendation</h2>

          {loading ? (

            <p>Generating recommendations...</p>

          ) : error ? (

            <p>Unable to generate recommendations.</p>

          ) : sortedRecommendations.length > 0 ? (

            <>
              <p>
                Based on recorded consumption, the following
                products may run out within the next 7 days.
                Consider adding them to your Shopping List.
              </p>

              {sortedRecommendations.map((item) => (

                <div
                  key={item.product_id}
                  className="ai-recommendation-item"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '15px',
                    flexWrap: 'wrap',
                    marginTop: '15px',
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#fff'
                  }}
                >

                  <div>
                    <strong>
                      {getProductIcon(item.product_name)}{' '}
                      {item.product_name}
                    </strong>

                    <p>
                      May run out in{' '}
                      <strong>
                        {item.days_remaining === 0
                          ? 'less than a day'
                          : `${item.days_remaining} day(s)`}
                      </strong>
                    </p>
                  </div>

                  <button
                    className="shopping-button"
                    disabled={addingProduct !== null}
                    onClick={() => addToShoppingList(item)}
                  >
                    {addingProduct === item.product_id
                      ? 'Adding...'
                      : '🛒 Add to Shopping List'}
                  </button>

                </div>

              ))}

            </>

          ) : (

            <p>
              All products have 7 or more days of stock
              remaining, or there is insufficient consumption
              data. No purchase recommendations at this time.
            </p>

          )}

        </div>

      </div>

    </div>
  )
}

export default AIPrediction