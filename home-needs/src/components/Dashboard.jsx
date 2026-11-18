import { useEffect, useState } from 'react'
import './Dashboard.css'

import API_URL from '../api'

function Dashboard({ onNavigate }) {
  const [analytics, setAnalytics] = useState(null)
  const [shoppingItems, setShoppingItems] = useState([])
  const [products, setProducts] = useState([])
  const [predictions, setPredictions] = useState([])
  const [accuracy, setAccuracy] = useState(null)
  const [evaluatedCount, setEvaluatedCount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shoppingError, setShoppingError] = useState('')
  const [expiryError, setExpiryError] = useState('')
  const [predictionError, setPredictionError] = useState('')
  const [addingProduct, setAddingProduct] = useState(null)
  const [activeBar, setActiveBar] = useState(null)
  const [activeLinePoint, setActiveLinePoint] = useState(null)
  const [chartType, setChartType] = useState('bar')
  const [galleryImages, setGalleryImages] = useState([])
  const [brokenGalleryImages, setBrokenGalleryImages] = useState({})
  const [selectedProductImage, setSelectedProductImage] = useState(null)
  const [selectedPredictionProduct, setSelectedPredictionProduct] = useState(null)
  const [shoppingActionMessage, setShoppingActionMessage] = useState(null)

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`${API_URL}/analytics`, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Failed to load analytics')
      setAnalytics(await response.json())
      setError('')
    } catch (err) {
      console.error('Analytics error:', err)
      setError('Unable to load dashboard analytics.')
    } finally {
      setLoading(false)
    }
  }

  // Load the approved shared product images from the Home Needs gallery.
  const fetchGalleryImages = async () => {
    try {
      const response = await fetch(`${API_URL}/product-image-gallery`, {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to load product image gallery')
      }

      const data = await response.json()
      setGalleryImages(Array.isArray(data) ? data : [])
      setBrokenGalleryImages({})
    } catch (err) {
      // Gallery images are optional; the dashboard should still work if this request fails.
      console.error('Product image gallery error:', err)
      setGalleryImages([])
    }
  }

  const fetchShoppingList = async () => {
    try {
      const response = await fetch(`${API_URL}/shopping-list`, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Failed to load shopping list')

      const data = await response.json()
      const items = Array.isArray(data)
        ? data
        : data.items || data.shopping_list || []

      setShoppingItems(items)
      setShoppingError('')
    } catch (err) {
      console.error('Shopping list error:', err)
      setShoppingError('Unable to load shopping list.')
    }
  }

  const fetchExpiryProducts = async () => {
    try {
      const response = await fetch(`${API_URL}/`, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Failed to load products')

      const data = await response.json()
      setProducts(Array.isArray(data) ? data : [])
      setExpiryError('')
    } catch (err) {
      console.error('Expiry error:', err)
      setExpiryError('Unable to load expiry details.')
    }
  }

  const fetchPredictions = async () => {
    try {
      const response = await fetch(`${API_URL}/ai-predictions`, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Failed to load AI predictions')

      const data = await response.json()
      setPredictions(data.predictions || [])
      setPredictionError('')
    } catch (err) {
      console.error('AI prediction error:', err)
      setPredictionError('Unable to load AI predictions.')
    }
  }

  const fetchAccuracy = async () => {
    try {
      const response = await fetch(`${API_URL}/ai-predictions/accuracy`, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Failed to load prediction accuracy')

      const data = await response.json()

      setAccuracy(
        data.mean_absolute_error !== null &&
        data.mean_absolute_error !== undefined
          ? Number(data.mean_absolute_error).toFixed(2)
          : null
      )

      setEvaluatedCount(data.evaluated_predictions || 0)
    } catch (err) {
      console.error('Accuracy error:', err)
    }
  }

  const refreshDashboard = () => {
    fetchAnalytics()
    fetchGalleryImages()
    fetchShoppingList()
    fetchExpiryProducts()
    fetchPredictions()
    fetchAccuracy()
  }

  useEffect(() => {
    refreshDashboard()

    const handleUpdate = () => refreshDashboard()

    window.addEventListener('purchaseUpdated', handleUpdate)
    window.addEventListener('productsUpdated', handleUpdate)
    window.addEventListener('consumptionUpdated', handleUpdate)
    window.addEventListener('shoppingListUpdated', handleUpdate)
    window.addEventListener('aiPredictionsUpdated', handleUpdate)
    window.addEventListener('productImagesUpdated', handleUpdate)

    return () => {
      window.removeEventListener('purchaseUpdated', handleUpdate)
      window.removeEventListener('productsUpdated', handleUpdate)
      window.removeEventListener('consumptionUpdated', handleUpdate)
      window.removeEventListener('shoppingListUpdated', handleUpdate)
      window.removeEventListener('aiPredictionsUpdated', handleUpdate)
      window.removeEventListener('productImagesUpdated', handleUpdate)
    }
  }, [])

  const getDaysRemaining = (expiryDate) => {
    if (!expiryDate) return null

    const expiry = new Date(expiryDate)
    if (Number.isNaN(expiry.getTime())) return null

    expiry.setHours(0, 0, 0, 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return Math.round((expiry - today) / (1000 * 60 * 60 * 24))
  }

  const getExpiryText = (days) => {
    if (days === null) return 'Date unavailable'
    if (days < 0) return `Expired ${Math.abs(days)} days ago`
    if (days === 0) return 'Expires today'
    if (days === 1) return 'Tomorrow'
    return `In ${days} days`
  }

  const getRecommendedQuantity = (item) => {
    const currentStock = Number(item.current_stock)
    const dailyUsage = Number(item.average_daily_consumption)

    if (
      !Number.isFinite(currentStock) ||
      !Number.isFinite(dailyUsage) ||
      currentStock < 0 ||
      dailyUsage <= 0
    ) {
      return 0
    }

    return Math.max(
      0,
      Number((dailyUsage * 7 - currentStock).toFixed(2))
    )
  }

  const getFinishText = (item) => {
    const value = Number(item.days_remaining)

    if (
      item.days_remaining === null ||
      item.days_remaining === undefined ||
      !Number.isFinite(value)
    ) {
      return 'Not enough data'
    }

    if (value <= 0) return 'May run out today'
    if (value < 1) return 'Less than a day'
    if (value === 1) return 'Tomorrow'

    return `In ${Math.ceil(value)} days`
  }

  const getPredictedDate = (item) => {
    if (!item.predicted_date) return null

    const date = new Date(`${item.predicted_date}T00:00:00`)
    if (Number.isNaN(date.getTime())) return null

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const getProductIcon = (name) => {
    const product = (name || '').toLowerCase()

    if (product.includes('rice')) return '🍚'
    if (product.includes('oil')) return '🛢️'
    if (product.includes('detergent')) return '🧺'
    if (product.includes('sugar')) return '🍬'
    if (product.includes('milk')) return '🥛'
    if (product.includes('bread')) return '🍞'
    if (product.includes('egg')) return '🥚'
    if (product.includes('soap')) return '🧼'
    if (product.includes('dal')) return '🥣'
    if (product.includes('flour')) return '🌾'

    return '📦'
  }

  // Match product names to the approved gallery without guessing between multiple images.
  const getGalleryImage = (productName) => {
    const normalize = (value) =>
      String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

    const name = normalize(productName)
    if (!name) return null

    const exactMatch = galleryImages.find(
      item => normalize(item.product_name) === name && item.image_url
    )

    if (exactMatch) return exactMatch.image_url

    // Allow variants such as "Rice" and "Basmati Rice" only when one match exists.
    const possibleMatches = galleryImages.filter(item => {
      const galleryName = normalize(item.product_name)
      return (
        item.image_url &&
        (galleryName.includes(name) || name.includes(galleryName))
      )
    })

    return possibleMatches.length === 1 ? possibleMatches[0].image_url : null
  }

  const addToShoppingList = async (item) => {
    const recommendedQuantity = getRecommendedQuantity(item)

    if (recommendedQuantity <= 0) {
      setShoppingActionMessage({ type: 'info', text: `No additional quantity is required for ${item.product_name || 'this product'}.` })
      return
    }

    setShoppingActionMessage(null)
    setAddingProduct(item.product_id)

    try {
      const response = await fetch(
        `${API_URL}/shopping-list/add-prediction`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            product_id: item.product_id,
            required_quantity: recommendedQuantity
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to add product')
      }

      setShoppingActionMessage({
        type: 'success',
        text: `${data.product_name || item.product_name} (${recommendedQuantity} ${item.unit || 'units'}) added to your Shopping List.`
      })

      await fetchShoppingList()
      window.dispatchEvent(new Event('shoppingListUpdated'))
    } catch (err) {
      console.error('Shopping list error:', err)
      setShoppingActionMessage({ type: 'error', text: err.message || 'Unable to add product to Shopping List.' })
    } finally {
      setAddingProduct(null)
    }
  }

  const pendingItems = shoppingItems.filter(
    item =>
      String(item.status || 'Pending').toLowerCase() !== 'purchased'
  )

  const trackedProducts = products.filter(
    product => Number(product.quantity) > 0 && product.expiry_date
  )

  const expiredProducts = trackedProducts.filter(product => {
    const days = getDaysRemaining(product.expiry_date)
    return days !== null && days < 0
  })

  const expiringSoon = trackedProducts
    .filter(product => {
      const days = getDaysRemaining(product.expiry_date)
      return days !== null && days >= 0 && days <= 7
    })
    .sort(
      (a, b) =>
        getDaysRemaining(a.expiry_date) -
        getDaysRemaining(b.expiry_date)
    )

  const lowStockProducts = predictions
    .filter(
      item =>
        item.days_remaining !== null &&
        item.days_remaining !== undefined &&
        Number.isFinite(Number(item.days_remaining)) &&
        Number(item.days_remaining) >= 0 &&
        Number(item.days_remaining) < 7
    )
    .sort(
      (a, b) =>
        Number(a.days_remaining) - Number(b.days_remaining)
    )

  const predictedSoon = predictions.filter(
    item =>
      item.days_remaining !== null &&
      item.days_remaining !== undefined &&
      Number.isFinite(Number(item.days_remaining)) &&
      Number(item.days_remaining) >= 0 &&
      Number(item.days_remaining) <= 3
  ).length

  if (loading) {
    return (
      <div className="dashboard dashboard-loading">
        <div className="dashboard-loading-card">
          <div className="loading-icon">🏠</div>
          <h1>Preparing your Home Needs dashboard</h1>
          <p>Loading your household information...</p>
        </div>
      </div>
    )
  }

  if (error && !analytics) {
    return (
      <div className="dashboard">
        <div className="dashboard-error-state">
          <div className="error-icon">⚠️</div>
          <h1>Home Needs Dashboard</h1>
          <p>{error}</p>
          <button className="dashboard-refresh" onClick={refreshDashboard}>
            ↻ Try Again
          </button>
        </div>
      </div>
    )
  }

  const spendingChart = analytics?.monthly_spending_chart || []
  const mostPurchased = analytics?.most_purchased || []

  const maxSpending = Math.max(
    ...spendingChart.map(item => Number(item.spending) || 0),
    1
  )

  const fiveMonthTotal = spendingChart.reduce(
    (sum, item) => sum + (Number(item.spending) || 0),
    0
  )

  const topPurchaseCount = Math.max(
    ...mostPurchased.map(item => Number(item.purchase_count) || 0),
    1
  )

  const spendingChange = analytics?.spending_change

  return (
    <div className="dashboard">

      {/* Header */}
      

      {/* Quick Summary */}
      <div className="dashboard-cards">

        <div className="dashboard-card spending-card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <span>Monthly Spending</span>
            <strong>
              ₹{Number(
                analytics?.monthly_spending || 0
              ).toLocaleString('en-IN')}
            </strong>
            <small>Current month</small>
          </div>
        </div>

        <div className="dashboard-card purchase-card">
          <div className="card-icon">🛒</div>
          <div className="card-content">
            <span>Products Purchased</span>
            <strong>{analytics?.products_purchased ?? 0}</strong>
            <small>Purchase records</small>
          </div>
        </div>

        <div className="dashboard-card consumption-card">
          <div className="card-icon">📦</div>
          <div className="card-content">
            <span>Products Consumed</span>
            <strong>{analytics?.products_consumed ?? 0}</strong>
            <small>Consumption records</small>
          </div>
        </div>

        <div className="dashboard-card usage-card">
          <div className="card-icon">📊</div>
          <div className="card-content">
            <span>Average Daily Usage</span>
            <strong>
              {Number(
                analytics?.average_daily_usage || 0
              ).toFixed(2)}
            </strong>
            <small>Items per day</small>
          </div>
        </div>

      </div>

      {/* Main two-column overview */}
      <div className="dashboard-main-grid">

        {/* Monthly Spending */}
        <section className="dashboard-section spending-section">
          <div className="section-header">
            <div>
              <span className="section-kicker">FINANCIAL OVERVIEW</span>
              <h2>💰 Monthly Spending</h2>
              <p>
                Your household spending over the last 5 months.
              </p>
            </div>

            <div className="spending-header-actions">
              <label className="chart-type-control">
                <span>Chart</span>
                <select
                  value={chartType}
                  onChange={event => setChartType(event.target.value)}
                  aria-label="Select monthly spending chart type"
                >
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie</option>
                </select>
              </label>

              <div className="section-total">
                <small>5-Month Total</small>
                <strong>
                  ₹{fiveMonthTotal.toLocaleString('en-IN')}
                </strong>
              </div>
            </div>
          </div>

          {spendingChart.length > 0 ? (
            <>
              {chartType === 'bar' && (
                <div className="spending-chart">
                  <div className="chart-grid-lines">
                    <span />
                    <span />
                    <span />
                  </div>

                  <div className="chart-bars">
                    {spendingChart.map((item, index) => {
                      const spending = Number(item.spending) || 0
                      const barHeight = (spending / maxSpending) * 100

                      return (
                        <div
                          className="chart-bar-column"
                          key={`${item.month}-${index}`}
                          onMouseEnter={() => setActiveBar(index)}
                          onMouseLeave={() => setActiveBar(null)}
                        >
                          <div className="chart-bar-area">
                            {activeBar === index && (
                              <div className="chart-tooltip">
                                <strong>{item.month}</strong>
                                <span>₹{spending.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            <div
                              className={`chart-bar ${activeBar === index ? 'chart-bar-active' : ''}`}
                              style={{
                                height: `${Math.max(barHeight, spending > 0 ? 5 : 2)}%`
                              }}
                            />
                          </div>
                          <span className="chart-month">{item.month}</span>
                          <span className="chart-value">
                            ₹{spending.toLocaleString('en-IN')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {chartType === 'line' && (
                <div className="spending-line-chart" style={{ position: 'relative' }}>
                  <svg
                    className="spending-line-svg"
                    viewBox="0 0 600 210"
                    role="img"
                    aria-label="Line chart showing monthly household spending. Select a point to view its details."
                    preserveAspectRatio="none"
                  >
                    {[35, 90, 145].map(y => (
                      <line key={y} x1="20" y1={y} x2="580" y2={y} className="line-grid" />
                    ))}
                    {spendingChart.length > 1 && (
                      <polyline
                        className="spending-line-path"
                        points={spendingChart.map((item, index) => {
                          const x = 30 + (index * 540) / (spendingChart.length - 1)
                          const value = Number(item.spending) || 0
                          const y = 175 - (value / maxSpending) * 140
                          return `${x},${y}`
                        }).join(' ')}
                      />
                    )}
                    {spendingChart.map((item, index) => {
                      const x = spendingChart.length === 1
                        ? 300
                        : 30 + (index * 540) / (spendingChart.length - 1)
                      const value = Number(item.spending) || 0
                      const y = 175 - (value / maxSpending) * 140
                      const isActive = activeLinePoint === index

                      return (
                        <circle
                          key={`${item.month}-${index}`}
                          cx={x}
                          cy={y}
                          r={isActive ? 9 : 6}
                          className={`spending-line-point${isActive ? ' spending-line-point-active' : ''}`}
                          role="button"
                          tabIndex="0"
                          aria-label={`${item.month}: ₹${value.toLocaleString('en-IN')}`}
                          onMouseEnter={() => setActiveLinePoint(index)}
                          onClick={() => setActiveLinePoint(index)}
                          onTouchStart={() => setActiveLinePoint(index)}
                          onFocus={() => setActiveLinePoint(index)}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setActiveLinePoint(index)
                            }
                          }}
                        >
                        </circle>
                      )
                    })}
                  </svg>

                  {activeLinePoint !== null && spendingChart[activeLinePoint] && (() => {
                    const selectedItem = spendingChart[activeLinePoint]
                    const selectedValue = Number(selectedItem.spending) || 0
                    const selectedX = spendingChart.length === 1
                      ? 300
                      : 30 + (activeLinePoint * 540) / (spendingChart.length - 1)
                    const selectedY = 175 - (selectedValue / maxSpending) * 140

                    return (
                      <div
                        className="spending-line-tooltip"
                        role="status"
                        style={{
                          position: 'absolute',
                          left: `${(selectedX / 600) * 100}%`,
                          top: `${(selectedY / 210) * 100}%`,
                          transform:
                            activeLinePoint === 0
                              ? 'translate(0, -140%)'
                              : activeLinePoint === spendingChart.length - 1
                                ? 'translate(-100%, -140%)'
                                : 'translate(-50%, -140%)',
                          zIndex: 5,
                          pointerEvents: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '4px',
                          width: '132px',
                          minWidth: '132px',
                          padding: '11px 13px',
                          boxSizing: 'border-box',
                          background: '#ffffff',
                          border: '1px solid #dcefe2',
                          borderRadius: '12px',
                          boxShadow: '0 8px 22px rgba(20, 83, 45, 0.16)',
                          color: '#174b35',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <strong style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          color: '#16834b',
                          textTransform: 'uppercase'
                        }}>
                          {selectedItem.month}
                        </strong>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 800,
                          lineHeight: 1.2,
                          color: '#174b35'
                        }}>
                          ₹{selectedValue.toLocaleString('en-IN')}
                        </span>
                        <small style={{
                          fontSize: '10px',
                          color: '#718579'
                        }}>
                          Monthly spending
                        </small>
                      </div>
                    )
                  })()}

                  <div className="spending-line-labels">
                    {spendingChart.map((item, index) => (
                      <div key={`${item.month}-${index}`}>
                        <strong>{item.month}</strong>
                        <span>₹{(Number(item.spending) || 0).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chartType === 'pie' && (
                <div className="spending-pie-chart">
                  <div
                    className="spending-pie"
                    style={{
                      background: `conic-gradient(${spendingChart.map((item, index) => {
                        const total = fiveMonthTotal || 1
                        const startAngle = spendingChart
                          .slice(0, index)
                          .reduce((sum, previous) => sum + ((Number(previous.spending) || 0) / total) * 100, 0)
                        const endAngle = startAngle + ((Number(item.spending) || 0) / total) * 100
                        const colors = ['#f59e0b', '#16a36a', '#45c486', '#f97316', '#0f766e', '#84cc16']
                        return `${colors[index % colors.length]} ${startAngle}% ${endAngle}%`
                      }).join(', ')})`
                    }}
                    role="img"
                    aria-label="Pie chart showing each month's share of household spending"
                  />
                  <div className="spending-pie-legend">
                    {spendingChart.map((item, index) => {
                      const value = Number(item.spending) || 0
                      const percentage = fiveMonthTotal > 0
                        ? (value / fiveMonthTotal) * 100
                        : 0
                      const colors = ['#f59e0b', '#16a36a', '#45c486', '#f97316', '#0f766e', '#84cc16']
                      return (
                        <div className="spending-pie-legend-item" key={`${item.month}-${index}`}>
                          <span style={{ background: colors[index % colors.length] }} />
                          <strong>{item.month}</strong>
                          <small>₹{value.toLocaleString('en-IN')} · {percentage.toFixed(1)}%</small>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="dashboard-empty">
              <span>📊</span>
              <p>No monthly spending data available yet.</p>
            </div>
          )}

          <div className="spending-summary">
            <div>
              <span>Total this month</span>
              <strong>
                ₹{Number(
                  analytics?.monthly_spending || 0
                ).toLocaleString('en-IN')}
              </strong>
            </div>

            <div>
              <span>Compared with last month</span>
              <strong className={
                spendingChange > 0
                  ? 'change-up'
                  : spendingChange < 0
                    ? 'change-down'
                    : ''
              }>
                {spendingChange === null ||
                spendingChange === undefined
                  ? '—'
                  : `${Number(spendingChange) > 0 ? '+' : ''}${Number(
                      spendingChange
                    ).toLocaleString('en-IN')}%`}
              </strong>
            </div>
          </div>
        </section>

        {/* Household Status */}
        <section className="dashboard-section status-section">
          <div className="section-header">
            <div>
              <span className="section-kicker">AT A GLANCE</span>
              <h2>🏠 Household Status</h2>
              <p>Important items that need your attention.</p>
            </div>

            <button className="view-all-button" type="button" onClick={() => onNavigate?.('expiry')}>
              View All
            </button>
          </div>

          <div className="status-cards">
            <button
              type="button"
              className={`status-card urgent ${
                expiredProducts.length > 0 ? 'has-items' : ''
              }`}
              onClick={() => onNavigate?.('expiry')}
              aria-label={`Open Expiry Tracking to review ${expiredProducts.length} urgent expired items`}
              title="Open Expiry Tracking"
            >
              <span className="status-card-icon" aria-hidden="true">🚨</span>
              <strong>{expiredProducts.length}</strong>
              <b>Urgent Items</b>
              <span>Tap to review expired items</span>
            </button>

            <div className={`status-card reminder ${
              pendingItems.length > 0 ? 'has-items' : ''
            }`}>
              <div className="status-card-icon">🔔</div>
              <strong>{pendingItems.length}</strong>
              <b>Reminders</b>
              <span>Items to purchase soon</span>
            </div>

            <button
              type="button"
              className={`status-card expiry ${
                expiringSoon.length > 0 ? 'has-items' : ''
              }`}
              onClick={() => onNavigate?.('expiry')}
              aria-label={`Open Expiry Tracking to review ${expiringSoon.length} products expiring soon`}
              title="Open Expiry Tracking"
            >
              <span className="status-card-icon" aria-hidden="true">📅</span>
              <strong>{expiringSoon.length}</strong>
              <b>Expiring Soon</b>
              <span>Tap to review items nearing expiry</span>
            </button>
          </div>
        </section>

      </div>

      {/* Most Purchased + AI Predictions */}
      <div className="dashboard-middle-grid">

        {/* Most Purchased */}
        <section className="dashboard-section purchased-section">
          <div className="section-header">
            <div>
              <span className="section-kicker">PURCHASE PATTERN</span>
              <h2>🛒 Most Purchased Products</h2>
              <p>Products you purchase most frequently.</p>
            </div>

            <button className="view-all-button" type="button" onClick={() => onNavigate?.('purchases')}>
              View All
            </button>
          </div>

          {mostPurchased.length > 0 ? (
            <div className="most-purchased-list">
              {mostPurchased.slice(0, 5).map((product, index) => {
                const count = Number(product.purchase_count) || 0
                const percentage = (count / topPurchaseCount) * 100

                return (
                  <div
                    className="purchased-product"
                    key={`${product.product_name}-${index}`}
                  >
                    <div className="purchased-product-info">
                      {getGalleryImage(product.product_name) &&
                      !brokenGalleryImages[product.product_name] ? (
                        <button
                          type="button"
                          className="product-emoji product-image-trigger"
                          onClick={() => setSelectedProductImage({
                            name: product.product_name,
                            imageUrl: getGalleryImage(product.product_name)
                          })}
                          aria-label={`View image of ${product.product_name}`}
                          title={`View ${product.product_name} image`}
                        >
                          <img
                            src={getGalleryImage(product.product_name)}
                            alt={product.product_name}
                            loading="lazy"
                            onError={() =>
                              setBrokenGalleryImages(current => ({
                                ...current,
                                [product.product_name]: true
                              }))
                            }
                          />
                        </button>
                      ) : (
                        <span className="product-emoji" aria-label={product.product_name}>
                          {getProductIcon(product.product_name)}
                        </span>
                      )}

                      <div className="purchased-product-details">
                        <strong>{product.product_name}</strong>
                      </div>

                      <div className="purchase-count-wrap">
                        <strong className="purchase-count">
                          {count}
                        </strong>
                        <small>
                          {count === 1 ? 'purchase' : 'purchases'}
                        </small>
                      </div>
                    </div>

                    <div className="purchase-progress">
                      <div
                        className="purchase-progress-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="dashboard-empty compact-empty">
              <span>🛒</span>
              <p>No purchase records available yet.</p>
            </div>
          )}
        </section>

        {/* AI Predictions */}
        <section className="dashboard-section ai-section">
          <div className="section-header">
            <div>
              <span className="section-kicker">SMART HOME AI</span>
              <h2>🤖 AI Predictions <em>(Next to Run Out)</em></h2>
              <p>Products that may run out soon based on your usage.</p>
            </div>

            <button className="view-all-button" type="button" onClick={() => onNavigate?.('ai')}>
              View All
            </button>
          </div>

          {predictionError ? (
            <p className="dashboard-error">{predictionError}</p>
          ) : predictions.length === 0 ? (
            <div className="dashboard-empty">
              <span>🤖</span>
              <p>No AI predictions available yet.</p>
              <small>
                Record product consumption to generate personalized predictions.
              </small>
            </div>
          ) : (
            <div className="ai-prediction-list">
              {shoppingActionMessage && (
                <div className={`shopping-action-message ${shoppingActionMessage.type}`} role={shoppingActionMessage.type === 'error' ? 'alert' : 'status'}>
                  <span>{shoppingActionMessage.type === 'success' ? '✓' : shoppingActionMessage.type === 'error' ? '!' : 'ℹ'}</span>
                  <p>{shoppingActionMessage.text}</p>
                  <button type="button" onClick={() => setShoppingActionMessage(null)} aria-label="Dismiss message">×</button>
                </div>
              )}
              {predictions
                .filter(
                  item =>
                    item.days_remaining !== null &&
                    item.days_remaining !== undefined &&
                    Number.isFinite(Number(item.days_remaining))
                )
                .sort(
                  (a, b) =>
                    Number(a.days_remaining) -
                    Number(b.days_remaining)
                )
                .slice(0, 5)
                .map(item => {
                  const days = Number(item.days_remaining)
                  const recommendedQuantity =
                    getRecommendedQuantity(item)
                  const galleryImage = getGalleryImage(item.product_name)

                  const badgeClass =
                    days <= 1
                      ? 'prediction-danger'
                      : days <= 7
                        ? 'prediction-warning'
                        : 'prediction-safe'

                  return (
                    <div className="ai-prediction-item" key={item.product_id}>
                      {galleryImage && !brokenGalleryImages[item.product_name] ? (
                        <button
                          type="button"
                          className="ai-product-icon product-image-trigger"
                          onClick={() => setSelectedProductImage({
                            name: item.product_name,
                            imageUrl: galleryImage
                          })}
                          aria-label={`View image of ${item.product_name}`}
                          title={`View ${item.product_name} image`}
                        >
                          <img
                            src={galleryImage}
                            alt={item.product_name}
                            loading="lazy"
                            onError={() =>
                              setBrokenGalleryImages(current => ({
                                ...current,
                                [item.product_name]: true
                              }))
                            }
                          />
                        </button>
                      ) : (
                        <div className="ai-product-icon">
                          {getProductIcon(item.product_name)}
                        </div>
                      )}

                      <div className="ai-product-details">
                        <button
                          type="button"
                          className="ai-prediction-product-name"
                          onClick={() => { setSelectedPredictionProduct(item); setShoppingActionMessage(null) }}
                          aria-label={`View AI prediction details for ${item.product_name}`}
                        >
                          {item.product_name}
                        </button>
                        <small className="ai-prediction-details-hint">View prediction details</small>
                      </div>

                      <div className={`prediction-badge ${badgeClass}`}>
                        {days <= 0
                          ? 'Today'
                          : days === 1
                            ? 'Tomorrow'
                            : `${Math.ceil(days)} days`}
                      </div>

                      <span className="prediction-arrow">›</span>

                      <button
                        className="prediction-add-button"
                        
                        disabled={
                          addingProduct !== null ||
                          recommendedQuantity <= 0
                        }
                        onClick={() => addToShoppingList(item)}
                      >
                        {addingProduct === item.product_id
                          ? '…'
                          : recommendedQuantity > 0
                            ? '+'
                            : '✓'}
                      </button>
                    </div>
                  )
                })}

              {predictions.filter(
                item =>
                  item.days_remaining !== null &&
                  item.days_remaining !== undefined &&
                  Number.isFinite(Number(item.days_remaining))
              ).length === 0 && (
                <div className="ai-stable-message">
                  <span>✨</span>
                  <div>
                    <strong>Your household stock looks stable.</strong>
                    <p>No run-out prediction is available yet.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Household Insight */}
      <section className="household-insight">
        <div className="insight-icon">💡</div>

        <div className="insight-content">
          <span className="section-kicker">PERSONALIZED INSIGHT</span>
          <h2>Household Insight</h2>

          <p>
            {spendingChange === null ||
            spendingChange === undefined
              ? 'Add purchase records to compare your household spending.'
              : spendingChange > 0
                ? `Your household spending increased by ${spendingChange}% compared with the previous month.`
                : spendingChange < 0
                  ? `Your household spending decreased by ${Math.abs(spendingChange)}% compared with the previous month.`
                  : 'Your household spending is the same as the previous month.'}

            {mostPurchased.length > 0 &&
              ` Your most frequently purchased product is ${mostPurchased[0].product_name}.`}
          </p>
        </div>

        <div className="insight-decoration">🏠</div>
      </section>

      {error && (
        <p className="dashboard-error dashboard-bottom-error">
          {error}
        </p>
      )}

      {selectedPredictionProduct && (
        <div
          className="prediction-details-backdrop"
          role="presentation"
          onClick={() => setSelectedPredictionProduct(null)}
        >
          <section
            className="prediction-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prediction-details-title"
            onClick={event => event.stopPropagation()}
          >
            <button type="button" className="prediction-details-close" onClick={() => setSelectedPredictionProduct(null)} aria-label="Close prediction details">×</button>
            <span className="prediction-details-kicker">HOME NEEDS · AI INSIGHT</span>
            <div className="prediction-details-product-icon">
              {getGalleryImage(selectedPredictionProduct.product_name) && !brokenGalleryImages[selectedPredictionProduct.product_name] ? (
                <img src={getGalleryImage(selectedPredictionProduct.product_name)} alt={selectedPredictionProduct.product_name} onError={() => setBrokenGalleryImages(current => ({ ...current, [selectedPredictionProduct.product_name]: true }))} />
              ) : (getProductIcon(selectedPredictionProduct.product_name))}
            </div>
            <h2 id="prediction-details-title">{selectedPredictionProduct.product_name}</h2>
            <p className="prediction-details-description">Based on your household's recorded consumption.</p>
            <div className="prediction-details-stats">
              <div><span>Current stock</span><strong>{Number.isFinite(Number(selectedPredictionProduct.current_stock)) ? `${selectedPredictionProduct.current_stock} ${selectedPredictionProduct.unit || ''}`.trim() : 'Not available'}</strong></div>
              <div><span>Daily usage</span><strong>{Number.isFinite(Number(selectedPredictionProduct.average_daily_consumption)) ? `${selectedPredictionProduct.average_daily_consumption} ${selectedPredictionProduct.unit || 'units'}/day` : 'Not available'}</strong></div>
              <div><span>Expected to run out</span><strong>{selectedPredictionProduct.days_remaining == null ? 'Not available' : Number(selectedPredictionProduct.days_remaining) <= 0 ? 'Today / overdue' : Number(selectedPredictionProduct.days_remaining) === 1 ? 'Tomorrow' : `In ${Math.ceil(Number(selectedPredictionProduct.days_remaining))} days`}</strong></div>
              <div><span>Predicted date</span><strong>{selectedPredictionProduct.predicted_date ? String(selectedPredictionProduct.predicted_date).slice(0, 10) : 'Not available'}</strong></div>
            </div>
            <p className="prediction-details-recommendation">
              {getRecommendedQuantity(selectedPredictionProduct) > 0
                ? `Suggested shopping quantity: ${getRecommendedQuantity(selectedPredictionProduct)} ${selectedPredictionProduct.unit || 'units'}`
                : 'Your current stock may be sufficient based on the available usage data.'}
            </p>
            {shoppingActionMessage && (
              <div className={`shopping-action-message ${shoppingActionMessage.type}`} role={shoppingActionMessage.type === 'error' ? 'alert' : 'status'}>
                <span>{shoppingActionMessage.type === 'success' ? '✓' : shoppingActionMessage.type === 'error' ? '!' : 'ℹ'}</span><p>{shoppingActionMessage.text}</p>
              </div>
            )}
            <button
              type="button"
              className="prediction-details-add-button"
              disabled={addingProduct !== null || getRecommendedQuantity(selectedPredictionProduct) <= 0}
              onClick={() => addToShoppingList(selectedPredictionProduct)}
            >
              {addingProduct === selectedPredictionProduct.product_id ? 'Adding…' : getRecommendedQuantity(selectedPredictionProduct) > 0 ? '＋ Add to Shopping List' : '✓ Stock is sufficient'}
            </button>
          </section>
        </div>
      )}

      {selectedProductImage && (
        <div
          className="product-image-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedProductImage(null)}
        >
          <section
            className="product-image-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-image-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="product-image-modal-close"
              onClick={() => setSelectedProductImage(null)}
              aria-label="Close product image"
            >
              ×
            </button>
            <img
              className="product-image-modal-photo"
              src={selectedProductImage.imageUrl}
              alt={selectedProductImage.name}
            />
            <h2 id="product-image-modal-title">{selectedProductImage.name}</h2>
          </section>
        </div>
      )}

    </div>
  )
}

export default Dashboard
