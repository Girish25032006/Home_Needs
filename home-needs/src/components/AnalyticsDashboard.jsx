import { useEffect, useState } from 'react'
import './AnalyticsDashboard.css'
import API_URL from '../api'

function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState('5 months')

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`${API_URL}/analytics`, {
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('Failed to load analytics')
        }

        const data = await response.json()
        setAnalytics(data)
      } catch (err) {
        console.error('Analytics error:', err)
        setError(
          'Unable to load analytics. Please check your backend connection.'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [])

  const money = value =>
    `₹${Number(value || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`

  if (loading) {
    return (
      <div className="analytics-dashboard analytics-state">
        <div className="state-icon">📊</div>
        <h2>Loading Analytics</h2>
        <p>Preparing your household insights...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analytics-dashboard analytics-state">
        <div className="state-icon error-state-icon">⚠️</div>
        <h2>Analytics Unavailable</h2>
        <p>{error}</p>
        <button
          className="analytics-retry-button"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    )
  }

  const monthlyData = analytics?.monthly_spending_chart || []
  const products = (analytics?.most_purchased || []).slice(0, 5)
  const cookingSummary = analytics?.cooking_summary || {}
  const cookedRecipes = (analytics?.most_cooked_recipes || []).slice(0, 5)
  const consumedIngredients = (analytics?.most_consumed_ingredients || []).slice(0, 5)
  const cookingFrequency = analytics?.monthly_cooking_frequency || []
  const maxCookingCount = Math.max(
    ...cookingFrequency.map(item => Number(item.cooking_count || 0)),
    1
  )

  const maxSpending = Math.max(
    ...monthlyData.map(item => Number(item.spending || 0)),
    1
  )

  const maxPurchaseCount = Math.max(
    ...products.map(item => Number(item.purchase_count || 0)),
    1
  )

  const totalChartSpending = monthlyData.reduce(
    (total, item) => total + Number(item.spending || 0),
    0
  )

  const totalPurchases = products.reduce(
    (total, item) => total + Number(item.purchase_count || 0),
    0
  )

  const spendingChange =
    analytics?.spending_change === null ||
    analytics?.spending_change === undefined
      ? null
      : Number(analytics.spending_change)

  const averageUsage = Number(analytics?.average_daily_usage || 0)
  const productIcons = ['🍚', '🧂', '🍞', '🥛', '🍌']

  const insightText = () => {
    if (spendingChange === null) {
      return 'Add purchase records for this month and the previous month to compare household spending.'
    }

    if (spendingChange > 0) {
      return `Your household spending increased by ${spendingChange}% compared with the previous month.`
    }

    if (spendingChange < 0) {
      return `Your household spending decreased by ${Math.abs(
        spendingChange
      )}% compared with the previous month.`
    }

    return 'Your household spending is the same as the previous month.'
  }

  const chartChangeLabel =
    spendingChange === null
      ? 'No comparison yet'
      : `${spendingChange > 0 ? '↑' : spendingChange < 0 ? '↓' : '→'} ${Math.abs(
          spendingChange
        )}% ${spendingChange > 0 ? 'higher' : spendingChange < 0 ? 'lower' : 'unchanged'}`

  const smartSpendingTitle =
    spendingChange === null
      ? 'Smart Spending'
      : spendingChange > 0
        ? 'Spending Alert'
        : spendingChange < 0
          ? 'Great Savings!'
          : 'Smart Spending'

  const smartSpendingMessage =
    spendingChange === null
      ? 'Keep recording purchases to understand your household spending.'
      : spendingChange > 0
        ? 'Your spending is higher than last month. Review your shopping list to save more.'
        : spendingChange < 0
          ? 'Your household spending is lower than last month. Keep up the good work!'
          : 'Your household spending is stable. Continue tracking purchases.'

  const openRecommendations = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-recommendations'))
  }

  const openProducts = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-products'))
  }

  return (
    <div className="analytics-dashboard">
      {/* Dashboard heading */}
      <header className="analytics-header">
        <div className="analytics-title-wrap">
          <div className="analytics-title-icon">📊</div>

          <div>
            <h1>Analytics Dashboard</h1>
            <p>Understand your household spending and consumption</p>
          </div>
        </div>

        <label className="analytics-range">
          <span aria-hidden="true">📅</span>
          <select
            value={range}
            onChange={event => setRange(event.target.value)}
            aria-label="Analytics date range"
          >
            <option value="5 months">Last 5 months</option>
          </select>
        </label>
      </header>

      {/* Summary cards */}
      <section className="analytics-summary" aria-label="Analytics summary">
        <article className="summary-card summary-orange">
          <div className="summary-icon">💰</div>
          <div className="summary-content">
            <span>Monthly Spending</span>
            <strong>{money(analytics?.monthly_spending)}</strong>
            <small>
              {spendingChange === null
                ? 'Current month'
                : `${spendingChange > 0 ? '↑' : spendingChange < 0 ? '↓' : '→'} ${Math.abs(
                    spendingChange
                  )}% vs last month`}
            </small>
          </div>
        </article>

        <article className="summary-card summary-blue">
          <div className="summary-icon">🛒</div>
          <div className="summary-content">
            <span>Products Purchased</span>
            <strong>{analytics?.products_purchased ?? 0}</strong>
            <small>Purchase records this month</small>
          </div>
        </article>

        <article className="summary-card summary-green">
          <div className="summary-icon">📦</div>
          <div className="summary-content">
            <span>Products Consumed</span>
            <strong>{analytics?.products_consumed ?? 0}</strong>
            <small>Total consumption records</small>
          </div>
        </article>

        <article className="summary-card summary-purple">
          <div className="summary-icon">📊</div>
          <div className="summary-content">
            <span>Average Daily Usage</span>
            <strong>{averageUsage.toLocaleString('en-IN')} items</strong>
            <small>Average quantity per day</small>
          </div>
        </article>
      </section>

      {/* Spending chart and smart spending panel */}
      <section className="analytics-main-grid">
        <article className="analytics-section spending-section">
          <div className="section-header chart-header">
            <div className="section-title-wrap">
              <div className="section-title">
                <span>📈</span>
                <h2>Monthly Spending</h2>
              </div>
              <p>Track your household spending over the last 5 months</p>
            </div>

            <div className="chart-change-pill">
              <strong>{chartChangeLabel}</strong>
              <small>Compared with last month</small>
            </div>
          </div>

          <div className="chart-total-strip">
            <div>
              <span>5-Month Total</span>
              <strong>{money(totalChartSpending)}</strong>
            </div>

            <div>
              <span>Current Month</span>
              <strong>{money(analytics?.monthly_spending)}</strong>
            </div>
          </div>

          <div className="spending-chart">
            {monthlyData.length > 0 ? (
              <div className="chart-area">
                <div className="chart-grid-lines">
                  <div className="chart-line line-top">
                    <span>{money(maxSpending)}</span>
                  </div>
                  <div className="chart-line line-upper">
                    <span>{money(Math.round(maxSpending * 0.75))}</span>
                  </div>
                  <div className="chart-line line-mid">
                    <span>{money(Math.round(maxSpending * 0.5))}</span>
                  </div>
                  <div className="chart-line line-lower">
                    <span>{money(Math.round(maxSpending * 0.25))}</span>
                  </div>
                  <div className="chart-line line-bottom">
                    <span>₹0</span>
                  </div>
                </div>

                <div
                  className="bars"
                  style={{
                    gridTemplateColumns: `repeat(${monthlyData.length}, minmax(0, 1fr))`,
                  }}
                >
                  {monthlyData.map((item, index) => {
                    const value = Number(item.spending || 0)
                    const height =
                      value > 0 ? Math.max((value / maxSpending) * 100, 3) : 0

                    return (
                      <div
                        className="bar-column"
                        key={`${item.month}-${index}`}
                      >
                        <div className="bar-tooltip">
                          {item.month}: {money(value)}
                        </div>

                        <strong className="bar-value-label">
                          {money(value)}
                        </strong>

                        <div className="bar-zone">
                          <div
                            className={`spending-bar ${
                              value === maxSpending ? 'highest' : ''
                            }`}
                            style={{ height: `${height}%` }}
                            title={`${item.month}: ${money(value)}`}
                          >
                            {value > 0 && <i />}
                          </div>
                        </div>

                        <span className="bar-month-label">{item.month}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-chart">
                <span>📊</span>
                <p>No spending data available yet.</p>
              </div>
            )}
          </div>

          <div className="chart-legend">
            <span>
              <i className="legend-current" />
              Monthly spending
            </span>
            <span className="legend-note">Values from your purchase records</span>
          </div>
        </article>

        <aside className="smart-spending-card">
          <div className="smart-spending-decoration">🌿</div>
          <div className="smart-spending-art" aria-hidden="true">
            <span className="smart-sparkle sparkle-left">✦</span>
            <span className="piggy-bank">🐷</span>
            <span className="smart-coin">₹</span>
            <span className="smart-leaves">🌱</span>
          </div>

          <span className="smart-card-eyebrow">HOME NEEDS TIP</span>
          <h2>{smartSpendingTitle}</h2>
          <p>{smartSpendingMessage}</p>

          <div className="smart-spending-stat">
            <span>{spendingChange === null ? 'Monthly total' : 'Spending change'}</span>
            <strong>
              {spendingChange === null
                ? money(analytics?.monthly_spending)
                : `${spendingChange > 0 ? '+' : ''}${spendingChange}%`}
            </strong>
          </div>

          <button
            type="button"
            className="smart-spending-button"
            onClick={openRecommendations}
          >
            View Recommendations <span>→</span>
          </button>
        </aside>
      </section>

      {/* Purchased products and household insight */}
      <section className="analytics-bottom-grid">
        <article className="analytics-section products-section">
          <div className="section-header products-header">
            <div className="products-title-group">
              <div className="section-title">
                <span className="products-heading-icon">🛒</span>
                <h2>Most Purchased Products</h2>
              </div>
              <p>Top 5 products by purchase count</p>
            </div>

            <button
              type="button"
              className="view-all-products"
              onClick={openProducts}
            >
              View All <span>→</span>
            </button>
          </div>

          <div className="product-list">
            {products.length > 0 ? (
              products.map((product, index) => {
                const count = Number(product.purchase_count || 0)
                const progress = (count / maxPurchaseCount) * 100
                const percentage = totalPurchases
                  ? Math.round((count / totalPurchases) * 100)
                  : 0

                return (
                  <div
                    className="product-row"
                    key={product.product_name || index}
                  >
                    <div className={`rank rank-${index + 1}`}>{index + 1}</div>

                    <div className="product-emoji">
                      {productIcons[index] || '📦'}
                    </div>

                    <div className="product-name-area">
                      <div className="product-name">
                        <strong title={product.product_name}>
                          {product.product_name}
                        </strong>
                        {index === 0 && <span aria-label="Most purchased">★</span>}
                      </div>

                      <div className="progress-track">
                        <div
                          className="progress-value"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="purchase-count">
                      <strong>{count}</strong>
                      <span>{count === 1 ? 'purchase' : 'purchases'}</span>
                    </div>

                    <div className="purchase-percent">
                      <strong>{percentage}%</strong>
                      <span>of listed total</span>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="empty-products">
                <span>🛒</span>
                <p>No purchase records available yet.</p>
              </div>
            )}
          </div>

          <div className="product-list-footer">
            <span>Showing up to 5 products</span>
            <strong>{totalPurchases} purchases across this list</strong>
          </div>
        </article>

        <article className="analytics-insight">
          <div className="insight-topline">
            <div className="insight-icon">💡</div>
            <div className="insight-heading">
              <h2>Household Insight</h2>
              <span>AI</span>
            </div>
          </div>

          <p className="insight-main-text">
            {insightText()}
            {products.length > 0 && (
              <>
                {' '}
                Your most frequently purchased product is{' '}
                <strong>{products[0].product_name}</strong>. Keep tracking your
                purchases to get better recommendations.
              </>
            )}
          </p>

          <div className="quick-tip-box">
            <span className="quick-tip-icon">🌿</span>
            <div>
              <strong>Quick Tip</strong>
              <p>
                Plan your shopping around household needs and check your
                existing stock before buying more.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="insight-recommendations-button"
            onClick={openRecommendations}
          >
            View Recommendations <span>→</span>
          </button>

          <div className="insight-house-art" aria-hidden="true">
            <span>🌳</span>
            <span>🏡</span>
            <span>🌿</span>
          </div>
        </article>
      </section>

      {/* Cooking Pattern Analysis */}
      <section className="cooking-pattern-section">
        <div className="cooking-pattern-heading">
          <div>
            <div className="section-title"><span>🍲</span><h2>Cooking Pattern Analysis</h2></div>
            <p>Understand your family's cooking habits and ingredient usage</p>
          </div>
          <span className="cooking-pattern-tag">Family Insights</span>
        </div>

        <div className="cooking-summary-grid">
          <article className="cooking-summary-card"><span>🍽️</span><div><small>Total cooking events</small><strong>{Number(cookingSummary.total_cooking_events || 0)}</strong></div></article>
          <article className="cooking-summary-card"><span>👨‍👩‍👧‍👦</span><div><small>Total servings prepared</small><strong>{Number(cookingSummary.total_servings || 0)}</strong></div></article>
          <article className="cooking-summary-card"><span>📖</span><div><small>Unique recipes cooked</small><strong>{Number(cookingSummary.unique_recipes || 0)}</strong></div></article>
        </div>

        <div className="cooking-analysis-grid">
          <article className="cooking-analysis-card">
            <div className="cooking-analysis-title"><div><h3>Most Cooked Recipes</h3><p>Ranked by successful cooking events</p></div><span>🥘</span></div>
            {cookedRecipes.length ? <div className="cooking-ranked-list">
              {cookedRecipes.map((recipe, index) => <div className="cooking-ranked-row" key={`${recipe.recipe_type}-${recipe.recipe_name}-${index}`}>
                <span className="cooking-rank">{index + 1}</span>
                <div className="cooking-ranked-name"><strong>{recipe.recipe_name}</strong><small>{recipe.recipe_type === 'global' ? 'Community recipe' : 'My recipe'}</small></div>
                <div className="cooking-ranked-value"><strong>{recipe.cook_count}</strong><small>{recipe.cook_count === 1 ? 'time cooked' : 'times cooked'}</small></div>
              </div>)}
            </div> : <div className="cooking-empty">🍲<p>Cook a recipe to start building your family cooking patterns.</p></div>}
          </article>

          <article className="cooking-analysis-card">
            <div className="cooking-analysis-title"><div><h3>Most Consumed Ingredients</h3><p>Based on recorded household consumption</p></div><span>🥬</span></div>
            {consumedIngredients.length ? <div className="cooking-ranked-list">
              {consumedIngredients.map((ingredient, index) => <div className="cooking-ranked-row" key={`${ingredient.product_name}-${index}`}>
                <span className="cooking-rank">{index + 1}</span>
                <div className="cooking-ranked-name"><strong>{ingredient.product_name}</strong><small>{ingredient.usage_count} usage records</small></div>
                <div className="cooking-ranked-value"><strong>{Number(ingredient.total_quantity_used || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong><small>{ingredient.unit || 'units'} used</small></div>
              </div>)}
            </div> : <div className="cooking-empty">🥬<p>Record product consumption to see your most-used ingredients.</p></div>}
          </article>
        </div>

        <article className="cooking-frequency-card">
          <div className="cooking-analysis-title"><div><h3>Monthly Cooking Frequency</h3><p>Number of times your family cooked in the last six months</p></div><span>📅</span></div>
          {cookingFrequency.length ? <div className="cooking-frequency-chart">
            {cookingFrequency.map((month, index) => {
              const count = Number(month.cooking_count || 0)
              const height = count > 0 ? Math.max((count / maxCookingCount) * 100, 4) : 0
              return <div className="cooking-frequency-column" key={`${month.month}-${index}`}>
                <strong>{count}</strong><div className="cooking-frequency-track"><div className="cooking-frequency-bar" style={{ height: `${height}%` }} /></div><small>{month.month}</small>
              </div>
            })}
          </div> : <div className="cooking-empty">📅<p>No cooking history is available for this period yet.</p></div>}
        </article>
      </section>
    </div>
  )
}

export default AnalyticsDashboard