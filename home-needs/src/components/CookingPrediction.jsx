
import { useCallback, useEffect, useState } from 'react'
import API_URL from '../api'
import './CookingPrediction.css'

function formatNumber(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) return '—'

  return number.toLocaleString(undefined, {
    maximumFractionDigits: 3
  })
}

function getIngredientIcon(name = '') {
  const value = String(name).toLowerCase()
  if (/lemon|lime/.test(value)) return '🍋'
  if (/water/.test(value)) return '💧'
  if (/rice|salt|flour|sugar|atta/.test(value)) return '🥣'
  if (/maggi|noodle/.test(value)) return '🍜'
  if (/oil|ghee/.test(value)) return '🫙'
  if (/tomato/.test(value)) return '🍅'
  if (/onion/.test(value)) return '🧅'
  if (/potato/.test(value)) return '🥔'
  if (/carrot/.test(value)) return '🥕'
  if (/milk/.test(value)) return '🥛'
  if (/egg/.test(value)) return '🥚'
  if (/chilli|chili|pepper/.test(value)) return '🌶️'
  if (/coriander|spinach|leaf/.test(value)) return '🥬'
  if (/apple/.test(value)) return '🍎'
  if (/banana/.test(value)) return '🍌'
  return '🧺'
}

function CookingPrediction() {
  const [predictions, setPredictions] = useState([])
  const [forecastDays, setForecastDays] = useState(30)
  const [lookbackDays, setLookbackDays] = useState(90)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [notes, setNotes] = useState([])
  const [expandedIngredient, setExpandedIngredient] = useState(null)
  const [productImages, setProductImages] = useState({})

  const loadPredictions = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const response = await fetch(
        `${API_URL}/cooking-consumption-predictions?forecast_days=${forecastDays}&lookback_days=${lookbackDays}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json'
          }
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            'Your login session was not found. Please log in again and retry.'
          )
        }

        throw new Error(
          data.message ||
          `Unable to load predictions (${response.status}).`
        )
      }

      setPredictions(
        Array.isArray(data.predictions)
          ? data.predictions
          : []
      )

      setSummary(data)

      setNotes(
        Array.isArray(data.notes)
          ? data.notes
          : []
      )

      // Load the logged-in user's selected product images.
      // This is optional: image failures must never block predictions.
      try {
        const imageResponse = await fetch(`${API_URL}/product-images`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' }
        })

        if (imageResponse.ok) {
          const imageData = await imageResponse.json().catch(() => [])
          const imageRows = Array.isArray(imageData)
            ? imageData
            : (imageData.images || [])

          const imageMap = {}
          imageRows.forEach((row) => {
            if (row?.product_id != null && row?.image_url) {
              imageMap[String(row.product_id)] = row.image_url
            }
          })
          setProductImages(imageMap)
        } else {
          setProductImages({})
        }
      } catch (imageError) {
        console.warn('Product images could not be loaded:', imageError)
        setProductImages({})
      }

    } catch (err) {
      console.error(
        'Cooking-based prediction error:',
        err
      )

      setError(
        err.message ||
        'Unable to load cooking-based predictions.'
      )

      setPredictions([])
      setSummary(null)
      setNotes([])

    } finally {
      setLoading(false)
      setRefreshing(false)
    }

  }, [forecastDays, lookbackDays])

  useEffect(() => {
    loadPredictions()
  }, [loadPredictions])

  const getStatusClass = (item) => {
    if (item.comparison_status === 'comparable') {
      return item.additional_quantity_required > 0
        ? 'cp-stock-status cp-stock-shortage'
        : 'cp-stock-status cp-stock-sufficient'
    }

    return 'cp-stock-status cp-stock-unknown'
  }

  return (
    <div className="cooking-prediction-page">

      {/* Header */}
      <header className="cp-hero">

        <div>
          <span className="cp-eyebrow">
            SMART HOME AI
          </span>

          <h1>
            Cooking-Based Consumption Prediction
          </h1>

          <p>
            Estimate future ingredient demand from your family's
            cooking history and compare it with your available inventory.
          </p>
        </div>

        <div
          className="cp-hero-icon"
          aria-hidden="true"
        >
          🍲
        </div>

      </header>

      {/* Prediction controls */}
      <section
        className="cp-controls"
        aria-label="Prediction settings"
      >

        <div className="cp-control">

          <label htmlFor="cp-forecast">
            Forecast period
          </label>

          <select
            id="cp-forecast"
            value={forecastDays}
            onChange={(event) =>
              setForecastDays(Number(event.target.value))
            }
          >
            <option value={7}>Next 7 days</option>
            <option value={15}>Next 15 days</option>
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
            <option value={90}>Next 90 days</option>
          </select>

        </div>

        <div className="cp-control">

          <label htmlFor="cp-history">
            Cooking history used
          </label>

          <select
            id="cp-history"
            value={lookbackDays}
            onChange={(event) =>
              setLookbackDays(Number(event.target.value))
            }
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last 365 days</option>
          </select>

        </div>

        <button
          className="cp-refresh"
          type="button"
          onClick={() => loadPredictions(true)}
          disabled={loading || refreshing}
        >
          {refreshing
            ? 'Refreshing…'
            : '↻ Refresh predictions'}
        </button>

      </section>

      {/* Error */}
      {error && (
        <div
          className="cp-alert"
          role="alert"
        >

          <strong>
            Could not load predictions
          </strong>

          <span>
            {error}
          </span>

          <button
            type="button"
            onClick={() => loadPredictions(true)}
          >
            Try again
          </button>

        </div>
      )}

      {/* Loading */}
      {loading ? (

        <div className="cp-state">

          <div className="cp-spinner" />

          <p>
            Analysing your family's cooking history…
          </p>

        </div>

      ) : !error && (

        <>

          {/* Summary cards */}
          <section className="cp-summary-grid">

            <article className="cp-summary-card">

              <span className="cp-summary-icon">
                🥕
              </span>

              <div>

                <small>
                  Ingredients predicted
                </small>

                <strong>
                  {summary?.total_ingredients ?? predictions.length}
                </strong>

              </div>

            </article>

            <article className="cp-summary-card">

              <span className="cp-summary-icon">
                ⚠️
              </span>

              <div>

                <small>
                  Predicted shortages
                </small>

                <strong>
                  {summary?.shortage_count ?? 0}
                </strong>

              </div>

            </article>

            <article className="cp-summary-card">

              <span className="cp-summary-icon">
                📅
              </span>

              <div>

                <small>
                  Forecast period
                </small>

                <strong>
                  {summary?.forecast_days ?? forecastDays} days
                </strong>

              </div>

            </article>

            <article className="cp-summary-card">

              <span className="cp-summary-icon">
                📖
              </span>

              <div>

                <small>
                  History analysed
                </small>

                <strong>
                  {summary?.lookback_days ?? lookbackDays} days
                </strong>

              </div>

            </article>

          </section>

          {/* Predicted ingredient cards */}
      <section className="cp-section">
        <div className="cp-section-heading">
          <div>
            <span className="cp-eyebrow">FAMILY INGREDIENT DEMAND</span>
            <h2>Predicted ingredient requirements</h2>
            <p>Forecast demand compared with current stock, where units can be converted.</p>
          </div>
          <span className="cp-readonly-tag">Read-only forecast</span>
        </div>

        {predictions.length === 0 ? (
          <div className="cp-empty">
            <span>🍽️</span>
            <h3>Not enough cooking records yet</h3>
            <p>Cook and record more recipes. Home Needs will use those records to estimate ingredient demand here.</p>
          </div>
        ) : (
          <div className="cp-product-grid">
            {predictions.map((item, index) => {
              const itemKey = `${item.product_id ?? item.ingredient_name}-${item.recipe_unit}-${index}`
              const isExpanded = expandedIngredient === itemKey
              const statusClass = getStatusClass(item)
              const demandUnit = item.forecast_unit || item.recipe_unit
              const stockText = item.current_stock == null
                ? 'Not linked'
                : `${formatNumber(item.current_stock)} ${item.stock_unit || ''}`
              const buyText = item.comparison_status === 'comparable'
                ? `${formatNumber(item.additional_quantity_required)} ${item.comparison_unit}`
                : '—'

              return (
                <article className={`cp-product-card ${isExpanded ? 'is-expanded' : ''}`} key={itemKey}>
                  <button
                    type="button"
                    className="cp-product-toggle"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedIngredient(isExpanded ? null : itemKey)}
                  >
                    <span className="cp-product-image" aria-hidden="true">
                      {productImages[String(item.product_id)] && (
                        <img
                          src={productImages[String(item.product_id)]}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true
                            const fallback = event.currentTarget.parentElement?.querySelector('.cp-product-fallback')
                            if (fallback) fallback.hidden = false
                          }}
                        />
                      )}
                      <span
                        className="cp-product-fallback"
                        hidden={Boolean(productImages[String(item.product_id)])}
                      >
                        {getIngredientIcon(item.ingredient_name)}
                      </span>
                    </span>
                    <span className="cp-product-main">
                      <span className="cp-product-title-row">
                        <strong className="cp-product-name">{item.ingredient_name}</strong>
                        <span className={statusClass}>{item.stock_status || 'Not available'}</span>
                      </span>
                      <span className="cp-product-demand">{formatNumber(item.predicted_quantity)} {demandUnit}</span>
                      <span className="cp-product-stock-row">
                        <span>Stock: <b>{stockText}</b></span>
                        <span className="cp-product-buy">To Buy: <b>{buyText}</b></span>
                      </span>
                    </span>
                    <span className={`cp-product-chevron ${isExpanded ? 'open' : ''}`} aria-hidden="true">›</span>
                  </button>

                  <div className="cp-product-desktop-meta">
                    <div><span>Expected remaining</span><strong>{item.comparison_status === 'comparable' ? `${formatNumber(item.expected_remaining_stock)} ${item.comparison_unit}` : '—'}</strong></div>
                    <div><span>Cooking events</span><strong>{item.cooking_events ?? 0}</strong></div>
                    <span className={`cp-confidence cp-confidence-${String(item.confidence || 'limited').toLowerCase()}`}>{item.confidence || 'Limited'} confidence</span>
                  </div>

                  {isExpanded && (
                    <div className="cp-product-expanded">
                      <div className="cp-product-detail-grid">
                        <div><span>Expected remaining</span><strong>{item.comparison_status === 'comparable' ? `${formatNumber(item.expected_remaining_stock)} ${item.comparison_unit}` : '—'}</strong></div>
                        <div><span>Average demand / day</span><strong>{formatNumber(item.average_daily_recipe_demand)} {item.recipe_unit}</strong></div>
                        <div><span>Cooking events</span><strong>{item.cooking_events ?? 0}</strong></div>
                        <div><span>Confidence</span><strong>{item.confidence || 'Limited'}</strong></div>
                      </div>
                      {item.recipe_breakdown?.length > 0 ? (
                        <div className="cp-product-recipes">
                          <b>Recipe-wise usage</b>
                          <ul>
                            {item.recipe_breakdown.map((recipe, recipeIndex) => (
                              <li key={`${recipe.recipe_name}-${recipe.unit}-${recipeIndex}`}>
                                <span>{recipe.recipe_name}</span>
                                <strong>{formatNumber(recipe.predicted_quantity)} {recipe.unit}</strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : item.recipes_used_in?.length > 0 ? (
                        <p className="cp-product-recipes"><b>Recipes:</b> {item.recipes_used_in.join(', ')}</p>
                      ) : null}
                      {item.comparison_status === 'comparable' && (
                        <p className="cp-product-conversion">Converted demand: {formatNumber(item.converted_predicted_demand)} {item.comparison_unit}</p>
                      )}
                      {item.comparison_status !== 'comparable' && item.unit_comparison_note && (
                        <p className="cp-product-unit-note">{item.unit_comparison_note}</p>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Explanation */}
          
        </>

      )}

    </div>
  )
}

export default CookingPrediction
