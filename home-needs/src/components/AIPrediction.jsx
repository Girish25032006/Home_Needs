import { useEffect, useMemo, useState } from 'react'

import { createPortal } from 'react-dom'

import './AIPrediction.css'

import API_URL from '../api'

function AIPrediction() {

  const [predictions, setPredictions] = useState([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [productImages, setProductImages] = useState({})

  const [accuracy, setAccuracy] = useState(null)

  const [evaluatedCount, setEvaluatedCount] = useState(0)

  const [addingProduct, setAddingProduct] = useState(null)

  const [searchTerm, setSearchTerm] = useState('')

  const [statusFilter, setStatusFilter] = useState('All Status')

  const [selectedProduct, setSelectedProduct] = useState(null)

  const [predictionHistory, setPredictionHistory] = useState([])

  const [historyLoading, setHistoryLoading] = useState(false)

  const [historyError, setHistoryError] = useState('')

  const [detailTab, setDetailTab] = useState('forecast')

  const [shoppingDraft, setShoppingDraft] = useState(null)

  const [shoppingQuantity, setShoppingQuantity] = useState('')

  const [selectedImage, setSelectedImage] = useState(null)

  const [showAllPredictions, setShowAllPredictions] = useState(false)

  const [stockAction, setStockAction] = useState('stock')

  const [stockInput, setStockInput] = useState('')

  const [consumptionInput, setConsumptionInput] = useState('')

  const [consumptionDate, setConsumptionDate] = useState(

    new Date().toISOString().slice(0, 10)

  )

  const [savingStockData, setSavingStockData] = useState(false)

  // Load genuine evaluated prediction history for the selected product.

  useEffect(() => {

    if (!selectedProduct?.product_id) {

      setPredictionHistory([])

      setHistoryError('')

      setDetailTab('forecast')

      return

    }

    let cancelled = false

    const loadHistory = async () => {

      setHistoryLoading(true)

      setHistoryError('')

      try {

        const response = await fetch(

          `${API_URL}/ai-predictions/history/${selectedProduct.product_id}`,

          { credentials: 'include' }

        )

        const data = await response.json().catch(() => ({}))

        if (!response.ok) throw new Error(data.message || 'Unable to load prediction history.')

        if (!cancelled) setPredictionHistory(Array.isArray(data.history) ? data.history : [])

      } catch (err) {

        if (!cancelled) {

          setPredictionHistory([])

          setHistoryError(err.message || 'Unable to load prediction history.')

        }

      } finally {

        if (!cancelled) setHistoryLoading(false)

      }

    }

    loadHistory()

    return () => { cancelled = true }

  }, [selectedProduct?.product_id])

  useEffect(() => {

    if (!selectedImage) return undefined

    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {

      if (event.key === 'Escape') setSelectedImage(null)

    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {

      document.body.style.overflow = previousOverflow

      window.removeEventListener('keydown', handleKeyDown)

    }

  }, [selectedImage])

  const [stockActionMessage, setStockActionMessage] = useState('')

  const [stockActionError, setStockActionError] = useState('')

  // -----------------------------------

  // FETCH AI PREDICTIONS

  // -----------------------------------

  const fetchPredictions = async () => {

    setLoading(true)

    setError('')

    try {

      const response = await fetch(

        `${API_URL}/ai-predictions`,

        {

          credentials: 'include'

        }

      )

      if (!response.ok) {

        throw new Error('Failed to fetch predictions')

      }

      const data = await response.json()

      setPredictions(

        Array.isArray(data.predictions)

          ? data.predictions

          : []

      )

    } catch (err) {

      console.error(err)

      setError('Unable to load AI predictions.')

    } finally {

      setLoading(false)

    }

  }

  // -----------------------------------

  // FETCH PREDICTION ERROR

  // -----------------------------------

  const fetchAccuracy = async () => {

    try {

      const response = await fetch(

        `${API_URL}/ai-predictions/accuracy`,

        {

          credentials: 'include'

        }

      )

      if (!response.ok) {

        throw new Error('Failed to fetch accuracy')

      }

      const data = await response.json()

      setAccuracy(

        data.mean_absolute_error !== null &&

        data.mean_absolute_error !== undefined

          ? Number(data.mean_absolute_error).toFixed(2)

          : null

      )

      setEvaluatedCount(

        data.evaluated_predictions || 0

      )

    } catch (err) {

      console.error('Accuracy error:', err)

    }

  }

  // -----------------------------------

  // LOAD + REFRESH

  // -----------------------------------

  useEffect(() => {

    fetchPredictions()

    fetchAccuracy()

    const refresh = () => {

      fetchPredictions()

      fetchAccuracy()

    }

    window.addEventListener(

      'aiPredictionsUpdated',

      refresh

    )

    window.addEventListener(

      'consumptionUpdated',

      refresh

    )

    return () => {

      window.removeEventListener(

        'aiPredictionsUpdated',

        refresh

      )

      window.removeEventListener(

        'consumptionUpdated',

        refresh

      )

    }

  }, [])

  // -----------------------------------

  // RECOMMENDED PURCHASE

  // Approximately 7 days of stock

  // -----------------------------------

  const getRecommendedQuantity = (item) => {

    const currentStock =

      Number(item.current_stock)

    const dailyUsage =

      Number(item.average_daily_consumption)

    if (

      !Number.isFinite(currentStock) ||

      !Number.isFinite(dailyUsage) ||

      currentStock < 0 ||

      dailyUsage <= 0

    ) {

      return 0

    }

    const requiredQuantity =

      dailyUsage * 7 - currentStock

    return Math.max(

      0,

      Number(requiredQuantity.toFixed(2))

    )

  }

  // -----------------------------------

  // DAYS REMAINING

  // -----------------------------------

  const getDaysRemaining = (item) => {

    const stock = Number(item.current_stock)

    const dailyUsage = Number(item.average_daily_consumption)

    // A run-out date cannot be estimated from zero/invalid usage while stock remains.

    if (Number.isFinite(stock) && stock > 0 &&

        (!Number.isFinite(dailyUsage) || dailyUsage <= 0)) {

      return null

    }

    const value = Number(item.days_remaining)

    return Number.isFinite(value) && value >= 0 ? value : null

  }

  // -----------------------------------

  // STATUS

  // -----------------------------------

  const getStatus = (item) => {

    const stock = Number(item.current_stock)

    const days = getDaysRemaining(item)

    // Empty stock is actionable even if consumption history is missing.

    if (Number.isFinite(stock) && stock <= 0) {

      return 'Out of Stock'

    }

    // If stock remains but there is no valid usage rate, do not invent a forecast.

    const dailyUsage = Number(item.average_daily_consumption)

    if (!Number.isFinite(dailyUsage) || dailyUsage <= 0) {

      return 'Insufficient Data'

    }

    if (days === null || days < 0) {

      return 'Insufficient Data'

    }

    if (days <= 3) {

      return 'Running Low'

    }

    if (days < 7) {

      return 'Predicted Soon'

    }

    return 'Sufficient'

  }

  const getStatusClass = (item) => {

    const status =

      getStatus(item)

    if (status === 'Running Low' || status === 'Out of Stock') {

      return 'status-danger'

    }

    if (status === 'Predicted Soon') {

      return 'status-warning'

    }

    if (status === 'Sufficient') {

      return 'status-good'

    }

    return 'status-neutral'

  }

  // -----------------------------------

  // RUNNING LOW

  // 0 to less than 7 days

  // -----------------------------------

  const lowStockProducts =

    predictions.filter((item) => {

      const days =

        getDaysRemaining(item)

      return (

        days !== null &&

        days >= 0 &&

        days < 7

      )

    })

  // -----------------------------------

  // PREDICTED WITHIN 3 DAYS

  // -----------------------------------

  const predictedSoon =

    predictions.filter((item) => {

      const days =

        getDaysRemaining(item)

      return (

        days !== null &&

        days >= 0 &&

        days <= 3

      )

    }).length

  // -----------------------------------

  // SORT ATTENTION ITEMS

  // -----------------------------------

  const sortedRecommendations = predictions

    .filter((item) => ['Out of Stock', 'Running Low', 'Predicted Soon'].includes(getStatus(item)))

    .sort((a, b) => {

      const aDays = getDaysRemaining(a)

      const bDays = getDaysRemaining(b)

      if (aDays === null && bDays === null) return 0

      if (aDays === null) return -1

      if (bDays === null) return 1

      return aDays - bDays

    })

  // -----------------------------------

  // MOST IMPORTANT AI INSIGHT

  // -----------------------------------

  const insightProduct =

    sortedRecommendations[0] ||

    predictions

      .filter(

        (item) =>

          getDaysRemaining(item) !== null

      )

      .sort(

        (a, b) =>

          Number(a.days_remaining) -

          Number(b.days_remaining)

      )[0] ||

    null

  // -----------------------------------

  // SEARCH + FILTER

  // -----------------------------------

  const filteredPredictions =

    useMemo(() => {

      const search =

        searchTerm

          .trim()

          .toLowerCase()

      return predictions.filter(

        (item) => {

          const matchesSearch =

            !search ||

            String(

              item.product_name || ''

            )

              .toLowerCase()

              .includes(search)

          const matchesStatus =

            statusFilter ===

              'All Status' ||

            getStatus(item) ===

              statusFilter

          return (

            matchesSearch &&

            matchesStatus

          )

        }

      )

    }, [

      predictions,

      searchTerm,

      statusFilter

    ])

  // -----------------------------------

  // Load each user's selected image from the Product Management gallery.

  useEffect(() => {

    const fetchProductImages = async () => {

      try {

        const response = await fetch(`${API_URL}/product-images`, { credentials: 'include' })

        if (!response.ok) return

        const data = await response.json()

        const imageMap = {}

        if (Array.isArray(data)) {

          data.forEach((item) => {

            if (item?.product_id && item?.image_url) imageMap[String(item.product_id)] = item.image_url

          })

        }

        setProductImages(imageMap)

      } catch (imageError) {

        console.error('Unable to load selected product gallery images:', imageError)

      }

    }

    fetchProductImages()

    window.addEventListener('productImagesUpdated', fetchProductImages)

    return () => window.removeEventListener('productImagesUpdated', fetchProductImages)

  }, [])

  // -------------------------------------------------

  // PRODUCT ICON

  // -----------------------------------

  const getProductIcon = (name) => {

    const product =

      (name || '').toLowerCase()

    if (product.includes('banana')) return '🍌'

    if (product.includes('apple')) return '🍎'

    if (product.includes('orange')) return '🍊'

    if (product.includes('tomato')) return '🍅'

    if (product.includes('potato')) return '🥔'

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

  const getProductImage = (item) => item?.product_id

    ? (productImages[String(item.product_id)] || '')

    : ''

  // -----------------------------------

  // PRODUCT ICON CLASS

  // -----------------------------------

  const getProductClass = (name) => {

    const product =

      (name || '').toLowerCase()

    if (

      product.includes('banana') ||

      product.includes('apple') ||

      product.includes('orange') ||

      product.includes('tomato')

    ) {

      return 'fruit-icon'

    }

    if (product.includes('rice')) {

      return 'rice-icon'

    }

    if (product.includes('oil')) {

      return 'oil-icon'

    }

    if (product.includes('detergent')) {

      return 'detergent-icon'

    }

    if (product.includes('milk')) {

      return 'milk-icon'

    }

    if (product.includes('bread')) {

      return 'bread-icon'

    }

    return ''

  }

  // -----------------------------------

  // FINISH TEXT

  // -----------------------------------

  const getFinishText = (item) => {

    const stock = Number(item.current_stock)

    const dailyUsage = Number(item.average_daily_consumption)

    if (Number.isFinite(stock) && stock > 0 &&

        (!Number.isFinite(dailyUsage) || dailyUsage <= 0)) {

      return 'Not enough data'

    }

    const days = getDaysRemaining(item)

    if (days === null) {

      return 'Not enough data'

    }

    if (days <= 0) {

      return 'Today'

    }

    if (days < 1) {

      return 'Less than a day'

    }

    if (days === 1) {

      return 'Tomorrow'

    }

    return `In ${Math.ceil(days)} days`

  }

  // -----------------------------------

  // PREDICTED DATE

  // -----------------------------------

  const getPredictedDate = (item) => {

    if (!item.predicted_date) {

      return null

    }

    const date = new Date(

      `${item.predicted_date}T00:00:00`

    )

    if (

      Number.isNaN(

        date.getTime()

      )

    ) {

      return null

    }

    return date.toLocaleDateString(

      'en-IN',

      {

        day: 'numeric',

        month: 'short',

        year: 'numeric'

      }

    )

  }

  // -----------------------------------

  // UPDATE STOCK / RECORD CONSUMPTION

  // -----------------------------------

  const formatDateForMySQL = (value) => {

    if (!value) return null

    // Keep already-normalized MySQL dates unchanged.

    if (typeof value === 'string') {

      const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/)

      if (isoMatch) return isoMatch[0]

    }

    // API responses may return JavaScript/RFC date strings, which MySQL DATE rejects.

    const parsed = new Date(value)

    if (Number.isNaN(parsed.getTime())) return null

    return parsed.toISOString().slice(0, 10)

  }

  const saveStockAction = async (event) => {

    event.preventDefault()

    if (!selectedProduct) return

    setSavingStockData(true)

    setStockActionMessage('')

    setStockActionError('')

    try {

      if (stockAction === 'stock') {

        const newQuantity = Number(stockInput)

        if (!Number.isFinite(newQuantity) || newQuantity < 0) {

          throw new Error('Enter a valid stock quantity (0 or more).')

        }

        // Fetch the full product record so required product fields are preserved.

        const productsResponse = await fetch(`${API_URL}/`, {

          credentials: 'include'

        })

        if (!productsResponse.ok) {

          throw new Error('Unable to load product details. Please sign in again and retry.')

        }

        const products = await productsResponse.json()

        const product = Array.isArray(products)

          ? products.find((p) => Number(p.id) === Number(selectedProduct.product_id))

          : null

        if (!product) {

          throw new Error('Could not find this product in your product list.')

        }

        const updateResponse = await fetch(

          `${API_URL}/products/${selectedProduct.product_id}`,

          {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            credentials: 'include',

            body: JSON.stringify({

              productName: product.product_name,

              category: product.category || 'General',

              quantity: newQuantity,

              unit: product.unit || selectedProduct.unit,

              price: product.price ?? '',

              purchaseDate: formatDateForMySQL(product.purchase_date),

              expiryDate: formatDateForMySQL(product.expiry_date),

              barcode: product.barcode || null

            })

          }

        )

        const updateData = await updateResponse.json().catch(() => ({}))

        if (!updateResponse.ok) {

          throw new Error(updateData.message || 'Unable to update stock.')

        }

        setStockActionMessage('Stock updated successfully.')

      } else {

        const usedQuantity = Number(consumptionInput)

        if (!Number.isFinite(usedQuantity) || usedQuantity <= 0) {

          throw new Error('Enter a consumption quantity greater than 0.')

        }

        if (!consumptionDate) {

          throw new Error('Select the date when the product was used.')

        }

        const response = await fetch(`${API_URL}/consumption`, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          credentials: 'include',

          body: JSON.stringify({

            productName: selectedProduct.product_name,

            quantity: usedQuantity,

            unit: selectedProduct.unit,

            usageDate: consumptionDate

          })

        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {

          throw new Error(data.message || 'Unable to record consumption.')

        }

        setStockActionMessage(

          `Consumption recorded. Remaining stock: ${data.remainingQuantity ?? 'updated'} ${selectedProduct.unit}.`

        )

      }

      await fetchPredictions()

      await fetchAccuracy()

      window.dispatchEvent(new Event('consumptionUpdated'))

      window.dispatchEvent(new Event('productsUpdated'))

      // Refresh the selected product's values from the latest prediction.

      const latestResponse = await fetch(`${API_URL}/ai-predictions`, {

        credentials: 'include'

      })

      if (latestResponse.ok) {

        const latestData = await latestResponse.json()

        const latestItems = Array.isArray(latestData.predictions)

          ? latestData.predictions

          : []

        const refreshed = latestItems.find(

          (item) => Number(item.product_id) === Number(selectedProduct.product_id)

        )

        if (refreshed) setSelectedProduct(refreshed)

      }

      setStockInput('')

      setConsumptionInput('')

    } catch (err) {

      console.error('Stock / consumption update error:', err)

      setStockActionError(err.message || 'Unable to save the stock information.')

    } finally {

      setSavingStockData(false)

    }

  }

  // -----------------------------------

  // ADD TO SHOPPING LIST — open quantity confirmation first

  const addToShoppingList = (item) => {

    const recommendedQuantity = getRecommendedQuantity(item)

    if (recommendedQuantity <= 0) {

      alert('No additional quantity is required for this product.')

      return

    }

    setShoppingDraft(item)

    setShoppingQuantity(String(recommendedQuantity))

  }

  const confirmAddToShoppingList = async () => {

    if (!shoppingDraft || addingProduct !== null) return

    const quantity = Number(shoppingQuantity)

    if (!Number.isFinite(quantity) || quantity <= 0) {

      alert('Please enter a quantity greater than 0.')

      return

    }

    const item = shoppingDraft

    setAddingProduct(item.product_id)

    try {

      const response = await fetch(`${API_URL}/shopping-list/add-prediction`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        credentials: 'include',

        body: JSON.stringify({ product_id: item.product_id, required_quantity: quantity })

      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.message || 'Failed to add product')

      setShoppingDraft(null)

      setShoppingQuantity('')

      alert(`${data.product_name || item.product_name} (${quantity} ${item.unit}) added to your Shopping List!`)

      window.dispatchEvent(new Event('shoppingListUpdated'))

    } catch (error) {

      console.error('Shopping list error:', error)

      alert(error.message || 'Unable to add product to Shopping List.')

    } finally {

      setAddingProduct(null)

    }

  }

  // AI INSIGHT TEXT

  // -----------------------------------

  const getInsightText = () => {

    if (!insightProduct) {

      return {

        title:

          'AI is learning your household pattern',

        description:

          'Record more consumption to improve personalized product predictions.'

      }

    }

    const finish =

      getFinishText(

        insightProduct

      )

    return {

      title:

        `${insightProduct.product_name} is expected to finish ${finish.toLowerCase()}.`,

      description:

        'Based on your recorded consumption pattern and current stock, consider planning the next purchase.'

    }

  }

  const insight =

    getInsightText()

  // -----------------------------------

  // SUMMARY

  // -----------------------------------

  const productsTracked =

    predictions.length

  // -----------------------------------

  // FORMAT QUANTITY

  // -----------------------------------

  const formatQuantity = (value) => {
    const number = Number(value ?? 0);

    if (!Number.isFinite(number)) return '0';
    if (Number.isInteger(number)) return String(number);

    return number.toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  };

  const visibleAttentionProducts = sortedRecommendations.filter((item) => {

    const search = searchTerm.trim().toLowerCase()

    const matchesSearch = !search || String(item.product_name || '').toLowerCase().includes(search)

    const matchesStatus = statusFilter === 'All Status' || getStatus(item) === statusFilter

    return matchesSearch && matchesStatus

  })

  const purchaseGuidance = predictions

    .map((item) => ({ ...item, suggestedQuantity: getRecommendedQuantity(item) }))

    .filter((item) => item.suggestedQuantity > 0)

    .sort((a, b) => b.suggestedQuantity - a.suggestedQuantity)

  return (

    <div className="ai-prediction">

      <header className="ai-page-header">

        <div className="ai-header-left">

          <div className="ai-title-icon">🤖</div>

          <div>

            <h1>AI Predictions</h1>

            <p>Understand your household’s upcoming needs</p>

          </div>

        </div>

        

      </header>

      {error && <div className="ai-inline-error" role="alert">{error}</div>}

      {loading && <div className="ai-loading-state">🤖 Generating your household predictions…</div>}

      <section className="prediction-summary" aria-label="Prediction summary">

        <article className="prediction-summary-card green-card">

          <div className="summary-icon">📦</div>

          <div className="summary-content"><span>Products Monitored</span><strong>{productsTracked}</strong><small>Currently monitored</small></div>

        </article>

        <article className="prediction-summary-card orange-card">

          <div className="summary-icon">⚠️</div>

          <div className="summary-content"><span>Running Low</span><strong>{lowStockProducts.length}</strong><small>Less than 7 days remaining</small></div>

        </article>

        <article className="prediction-summary-card blue-card">

          <div className="summary-icon">📅</div>

          <div className="summary-content"><span>Need to Buy Soon</span><strong>{predictedSoon}</strong><small>Expected within 3 days</small></div>

        </article>

        <article className="prediction-summary-card purple-card">

          <div className="summary-icon">🎯</div>

          <div className="summary-content"><span>Average Error</span><strong>{accuracy !== null ? `${accuracy} days` : '—'}</strong><small>{evaluatedCount > 0 ? `Based on ${evaluatedCount} evaluated predictions` : 'Waiting for actual results'}</small></div>

        </article>

      </section>

      <section className="ai-household-insight">

        <div className="insight-product-illustration" onClick={() => insightProduct && getProductImage(insightProduct) && setSelectedImage({ src: getProductImage(insightProduct), name: insightProduct.product_name })} role={insightProduct && getProductImage(insightProduct) ? "button" : undefined} tabIndex={insightProduct && getProductImage(insightProduct) ? 0 : undefined}>

          {insightProduct && getProductImage(insightProduct)

            ? <img src={getProductImage(insightProduct)} alt={insightProduct.product_name} />

            : <span>{insightProduct ? getProductIcon(insightProduct.product_name) : '🏡'}</span>}

        </div>

        <div className="insight-copy">

          <div className="insight-heading"><h2>Today’s AI Insight</h2><span>Smart Insight</span></div>

          <h3>{insight.title}</h3>

          <p>{insightProduct

            ? `Current stock: ${formatQuantity(insightProduct.current_stock)} ${insightProduct.unit}  |  Daily usage: ${formatQuantity(insightProduct.average_daily_consumption)} ${insightProduct.unit}/day`

            : insight.description}</p>

        </div>

        {insightProduct && <button type="button" className="insight-shopping-button" onClick={() => addToShoppingList(insightProduct)} disabled={addingProduct !== null}>

          {addingProduct === insightProduct.product_id ? 'Adding…' : '🛒 Add to Shopping List'}

        </button>}

      </section>

      <section className="needs-attention">

        <div className="attention-header">

          <div><h2>⚠️ Needs Attention</h2><p>Products that are out of stock or likely to finish soon</p></div>

        </div>

        <div className="attention-tools">

          <div className="attention-filters" role="group" aria-label="Filter products by status">

            {[

              ['Out of Stock', `Out of Stock (${sortedRecommendations.filter((item) => getStatus(item) === 'Out of Stock').length})`],

              ['Running Low', `Running Low (${sortedRecommendations.filter((item) => getStatus(item) === 'Running Low').length})`],

              ['Predicted Soon', `Need Soon (${sortedRecommendations.filter((item) => getStatus(item) === 'Predicted Soon').length})`],

              ['All Status', `All (${sortedRecommendations.length})`]

            ].map(([value, label]) => (

              <button key={value} type="button" className={statusFilter === value ? 'filter-chip active' : 'filter-chip'} onClick={() => setStatusFilter(value)}>{label}</button>

            ))}

          </div>

          <label className="attention-search"><span>⌕</span><input type="search" placeholder="Search products…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search products" /></label>

        </div>

        {!loading && !error && visibleAttentionProducts.length > 0 ? (

          <div className="attention-grid">

            {visibleAttentionProducts.slice(0, 4).map((item) => {

              const recommendedQuantity = getRecommendedQuantity(item)

              return <article className={`attention-card ${getStatusClass(item)}`} key={item.product_id}>

                <div className="attention-product-info">

                  <div className={`product-icon ${getProductClass(item.product_name)}`} onClick={() => getProductImage(item) && setSelectedImage({ src: getProductImage(item), name: item.product_name })} role={getProductImage(item) ? "button" : undefined} tabIndex={getProductImage(item) ? 0 : undefined}>

                    {getProductImage(item)

                      ? <img src={getProductImage(item)} alt={item.product_name} loading="lazy" />

                      : <span>{getProductIcon(item.product_name)}</span>}

                  </div>

                  <div className="attention-product-name"><h3>{item.product_name}</h3><p>Current stock: <strong>{formatQuantity(item.current_stock)} {item.unit}</strong></p></div>

                </div>

                <div className="attention-card-metric"><span>Expected finish</span><strong>{getFinishText(item)}</strong></div>

                <div className="attention-card-metric"><span>Daily usage</span><strong>{formatQuantity(item.average_daily_consumption)} {item.unit}/day</strong></div>

                <div className="attention-card-actions">

                  <span className={`status-badge ${getStatusClass(item)}`}>{getStatus(item)}</span>

                  <button type="button" className="attention-add-button" aria-label={recommendedQuantity <= 0 ? `Check stock data for ${item.product_name}` : `Add ${item.product_name} to shopping list`} title={recommendedQuantity <= 0 ? 'Check stock data' : 'Add to shopping list'} disabled={addingProduct !== null} onClick={() => {

                    if (recommendedQuantity <= 0) { setSelectedProduct(item); setStockInput(String(item.current_stock ?? '')); setStockActionMessage(''); setStockActionError('') }

                    else addToShoppingList(item)

                  }}>{addingProduct === item.product_id ? '…' : recommendedQuantity <= 0 ? 'Check' : '＋ Add'}</button>

                </div>

              </article>

            })}

          </div>

        ) : (!loading && !error ? <div className="attention-empty">{sortedRecommendations.length === 0 ? 'Great! No products currently need attention.' : 'No products match your search or selected filter.'}</div> : null)}

        <div className="attention-footer">

          <button type="button" className="view-all-predictions-button" onClick={() => setShowAllPredictions(true)}>View All Product Predictions <span>→</span></button>

        </div>

      </section>

      {showAllPredictions && (

        <div

          className="ai-modal-overlay"

          onClick={() =>

            setShowAllPredictions(false)

          }

        >

          <div

            className="ai-details-modal all-predictions-modal"

            style={{

              width: '94vw',

              maxWidth: '1250px',

              maxHeight: '88vh',

              overflowY: 'auto'

            }}

            onClick={(e) =>

              e.stopPropagation()

            }

          >

            <div

              className="section-header"

              style={{

                marginBottom: '20px'

              }}

            >

              <div className="section-title">

                <div className="section-icon">

                  🤖

                </div>

                <div>

                  <h2>

                    All Product Predictions

                  </h2>

                  <p>

                    Complete AI prediction details for your household products

                  </p>

                </div>

              </div>

              <button

                type="button"

                className="modal-close"

                onClick={() =>

                  setShowAllPredictions(false)

                }

                aria-label="Close all predictions"

              >

                ×

              </button>

            </div>

            <div

              className="prediction-controls"

              style={{

                marginBottom: '20px'

              }}

            >

              <div className="prediction-search">

                <span>

                  🔍

                </span>

                <input

                  type="text"

                  placeholder="Search products..."

                  value={searchTerm}

                  onChange={(e) =>

                    setSearchTerm(

                      e.target.value

                    )

                  }

                />

              </div>

              <select

                value={statusFilter}

                onChange={(e) =>

                  setStatusFilter(

                    e.target.value

                  )

                }

              >

                <option>

                  All Status

                </option>

                <option>

                  Running Low

                </option>

                <option>

                  Predicted Soon

                </option>

                <option>

                  Sufficient

                </option>

                <option>

                  Insufficient Data

                </option>

              </select>

            </div>

            {loading && (

              <div className="prediction-state">

                <div className="state-icon">

                  🤖

                </div>

                <h3>

                  Generating predictions...

                </h3>

                <p>

                  Please wait while Home Needs analyzes your household data.

                </p>

              </div>

            )}

            {!loading &&

              !error &&

              predictions.length === 0 && (

                <div className="prediction-state">

                  <div className="state-icon">

                    📊

                  </div>

                  <h3>

                    No predictions yet

                  </h3>

                  <p>

                    Record product consumption to give the AI enough household history to generate predictions.

                  </p>

                </div>

              )}

            {!loading &&

              !error &&

              predictions.length > 0 &&

              filteredPredictions.length === 0 && (

                <div className="prediction-state compact-state">

                  <div className="state-icon">

                    🔍

                  </div>

                  <h3>

                    No matching products

                  </h3>

                  <p>

                    Try a different product name or status filter.

                  </p>

                </div>

              )}

            {!loading &&

              !error &&

              filteredPredictions.length > 0 && (

                <div className="prediction-grid">

                  {filteredPredictions.map(

                    (item) => {

                      const recommendedQuantity =

                        getRecommendedQuantity(

                          item

                        )

                      const days =

                        getDaysRemaining(

                          item

                        )

                      return (

                        <div

                          className={`prediction-product-card ${getStatusClass(item)}`}

                          key={

                            item.product_id

                          }

                        >

                          <div className="product-card-header">

  <div

    className={`large-product-icon ${getProductClass(item.product_name)}`}

    onClick={() => getProductImage(item) && setSelectedImage({ src: getProductImage(item), name: item.product_name })}

    role={getProductImage(item) ? 'button' : undefined}

    tabIndex={getProductImage(item) ? 0 : undefined}

    aria-label={getProductImage(item) ? `View ${item.product_name} image` : undefined}

  >

    {getProductImage(item) ? (

      <img src={getProductImage(item)} alt={item.product_name} loading="lazy" />

    ) : (

      <span>{getProductIcon(item.product_name)}</span>

    )}

  </div>

  <h3 className="prediction-product-name">{item.product_name}</h3>

  <span className={`status-badge ${getStatusClass(item)}`}>

    {getStatus(item)}

  </span>

</div>

                          <div className="prediction-metrics">

                            <div>

                              <span>

                                Current Stock

                              </span>

                              <strong>

                                {formatQuantity(

                                  item.current_stock

                                )}{' '}

                                {item.unit}

                              </strong>

                            </div>

                            <div>

                              <span>

                                Daily Usage

                              </span>

                              <strong>

                                {formatQuantity(

                                  item.average_daily_consumption

                                )}{' '}

                                {item.unit}/day

                              </strong>

                            </div>

                            <div>

                              <span>

                                Expected Finish

                              </span>

                              <strong>

                                {getFinishText(

                                  item

                                )}

                              </strong>

                              {getPredictedDate(

                                item

                              ) && (

                                <small>

                                  {getPredictedDate(

                                    item

                                  )}

                                </small>

                              )}

                            </div>

                            <div className="accuracy-metric">

                              <span>

                                🎯 Prediction Performance

                              </span>

                              <strong>

                                {item.prediction_accuracy !== null && item.prediction_accuracy !== undefined

                                  ? `${Number(item.prediction_accuracy).toFixed(1)}%`

                                  : '—'}

                              </strong>

                              <small>

                                {Number(item.evaluated_predictions || 0) > 0

                                  ? `MAE ${Number(item.prediction_mae_days || 0).toFixed(1)} days · ${item.evaluated_predictions} evaluated`

                                  : 'Awaiting next regular purchase'}

                              </small>

                            </div>

                          </div>

                          <div className="usage-indicator">

                            <div className="usage-indicator-header">

                              <span>

                                Stock Forecast

                              </span>

                              <strong>

                                {days === null

                                  ? 'Data needed'

                                  : days <= 3

                                    ? 'Immediate attention'

                                    : days < 7

                                      ? 'Plan next purchase'

                                      : 'Stock looks sufficient'}

                              </strong>

                            </div>

                            <div className="forecast-bar">

                              <div

                                className={`forecast-fill ${getStatusClass(item)}`}

                                style={{

                                  width:

                                    days === null

                                      ? '25%'

                                      : `${Math.min(

                                          100,

                                          Math.max(

                                            8,

                                            (days /

                                              30) *

                                              100

                                          )

                                        )}%`

                                }}

                              />

                            </div>

                          </div>

                          <div className="recommended-purchase">

                            <span>

                              AI Recommended Purchase

                            </span>

                            <strong>

                              {recommendedQuantity > 0

                                ? `${formatQuantity(

                                    recommendedQuantity

                                  )} ${item.unit}`

                                : '0 ' +

                                  item.unit}

                            </strong>

                          </div>

                          <div className="product-card-actions">

                            <button

                              className="view-details-button"

                              onClick={() =>

                                setSelectedProduct(

                                  item

                                )

                              }

                            >

                              👁 View Details

                            </button>

                            <button

                              type="button"

                              className="product-shopping-button"

                              disabled={

                                addingProduct !== null ||

                                (recommendedQuantity <= 0 &&

                                  !['Running Low', 'Out of Stock', 'Predicted Soon'].includes(getStatus(item)))

                              }

                              onClick={() => {

                                if (recommendedQuantity <= 0) {

                                  setSelectedProduct(item); setStockInput(String(item.current_stock ?? '')); setStockActionMessage(''); setStockActionError('')

                                } else {

                                  addToShoppingList(item)

                                }

                              }}

                            >

                              {addingProduct === item.product_id

                                ? 'Adding...'

                                : recommendedQuantity <= 0

                                  ? (['Running Low', 'Out of Stock', 'Predicted Soon'].includes(getStatus(item))

                                      ? 'Check Stock Data'

                                      : 'Stock Sufficient')

                                  : '🛒 Add to List'}

                            </button>

                          </div>

                        </div>

                      )

                    }

                  )}

                </div>

              )}

            <button

              type="button"

              className="modal-shopping-button"

              onClick={() =>

                setShowAllPredictions(false)

              }

              style={{

                marginTop: '20px'

              }}

            >

              Close All Predictions

            </button>

          </div>

        </div>

      )}

      {/* COMPACT PRODUCT DETAILS MODAL */}

      {selectedProduct && createPortal((

        <div

          className="ai-modal-overlay ai-product-details-overlay"

          onClick={() => setSelectedProduct(null)}

        >

          <div

            className="ai-details-modal ai-product-details-modal"

            role="dialog"

            aria-modal="true"

            aria-labelledby="ai-product-details-title"

            onClick={(e) => e.stopPropagation()}

          >

            <div className="ai-product-details-topbar">

              <h2 id="ai-product-details-title">Product Details</h2>

              <button

                type="button"

                className="modal-close"

                aria-label="Close product details"

                onClick={() => setSelectedProduct(null)}

              >

                ×

              </button>

            </div>

            <div className="ai-product-details-identity">

              <div className="ai-product-details-image">

                {getProductImage(selectedProduct) ? (

                  <img src={getProductImage(selectedProduct)} alt={selectedProduct.product_name} />

                ) : (

                  <span>{getProductIcon(selectedProduct.product_name)}</span>

                )}

              </div>

              <div className="ai-product-details-name">

                <h3>{selectedProduct.product_name}</h3>

                <span className={`status-badge ${getStatusClass(selectedProduct)}`}>

                  {getStatus(selectedProduct)}

                </span>

                <p>Expected to finish {getFinishText(selectedProduct).toLowerCase()}</p>

              </div>

            </div>

            <div className="ai-product-details-metrics">

              <div className="ai-product-metric">

                <span>Current Stock</span>

                <strong>{formatQuantity(selectedProduct.current_stock)} {selectedProduct.unit}</strong>

              </div>

              <div className="ai-product-metric">

                <span>Daily Usage</span>

                <strong>{formatQuantity(selectedProduct.average_daily_consumption)} {selectedProduct.unit}/day</strong>

              </div>

              <div className="ai-product-metric">

                <span>Recommended Purchase</span>

                <strong>{formatQuantity(getRecommendedQuantity(selectedProduct))} {selectedProduct.unit}</strong>

              </div>

              <div className="ai-product-metric">

                <span>Predicted Finish</span>

                <strong>{getPredictedDate(selectedProduct) || 'Not available'}</strong>

              </div>

            </div>

            <section className="ai-detail-chart-section">

              <div className="ai-detail-chart-tabs" role="tablist" aria-label="Product prediction charts">

                <button type="button" role="tab" aria-selected={detailTab === 'forecast'} className={detailTab === 'forecast' ? 'active' : ''} onClick={() => setDetailTab('forecast')}>Stock Forecast</button>

                <button type="button" role="tab" aria-selected={detailTab === 'actual'} className={detailTab === 'actual' ? 'active' : ''} onClick={() => setDetailTab('actual')}>Actual vs Predicted</button>

              </div>

              {detailTab === 'forecast' ? (

                <div className="ai-forecast-chart-panel">

                  <div className="ai-chart-heading">

                    <div><h3>Stock Depletion Forecast</h3><p>Estimated stock based on current usage</p></div>

                    <span className="ai-chart-legend"><i /> Projected stock</span>

                  </div>

                  {(() => {

                    const stock = Math.max(0, Number(selectedProduct.current_stock) || 0)

                    const usage = Math.max(0, Number(selectedProduct.average_daily_consumption) || 0)

                    const points = Array.from({ length: 8 }, (_, day) => ({ day, value: Math.max(0, stock - usage * day) }))

                    const maxValue = Math.max(stock, 1)

                    const coords = points.map((point, index) => `${42 + index * 78},${154 - (point.value / maxValue) * 112}`).join(' ')

                    return usage > 0 ? (

                      <>

                        <div className="ai-stock-svg-wrap">

                          <svg viewBox="0 0 600 190" role="img" aria-label="Projected stock depletion over seven days" preserveAspectRatio="none">

                            {[0, 1, 2, 3].map((line) => <line key={line} x1="40" x2="590" y1={42 + line * 37} y2={42 + line * 37} className="ai-chart-gridline" />)}

                            <polyline points={coords} className="ai-stock-line" />

                            {points.map((point, index) => {

                              const x = 42 + index * 78

                              const y = 154 - (point.value / maxValue) * 112

                              return <g key={point.day}><circle cx={x} cy={y} r="4" className="ai-stock-point" /><text x={x} y="178" textAnchor="middle" className="ai-chart-axis-label">{point.day === 0 ? 'Today' : `Day ${point.day}`}</text></g>

                            })}

                          </svg>

                        </div>

                        <div className="ai-chart-footnote">Starting stock: <strong>{formatQuantity(stock)} {selectedProduct.unit}</strong> · Daily usage: <strong>{formatQuantity(usage)} {selectedProduct.unit}</strong></div>

                      </>

                    ) : <div className="ai-chart-empty">A stock forecast will appear when daily usage data is available.</div>

                  })()}

                </div>

              ) : (

                <div className="ai-actual-chart-panel">

                  <div className="ai-chart-heading">

                    <div><h3>Actual vs Predicted</h3><p>Days remaining at forecast time vs recorded regular-purchase outcome</p></div>

                    <span className="ai-chart-legend ai-actual-legend"><i /> Predicted <b /> Actual</span>

                  </div>

                  {historyLoading ? (

                    <div className="ai-chart-empty">Loading evaluated prediction history…</div>

                  ) : historyError ? (

                    <div className="ai-chart-empty">{historyError}</div>

                  ) : predictionHistory.length === 0 ? (

                    <div className="ai-chart-empty">No evaluated predictions yet. This chart will appear after a regular purchase evaluates a saved forecast.</div>

                  ) : (

                    <div className="ai-actual-history-list">

                      {predictionHistory.map((record) => {

                        const predicted = Number(record.predicted_days_remaining)

                        const actual = Number(record.actual_days_remaining)

                        const max = Math.max(predicted, actual, 1)

                        return (

                          <div className="ai-actual-history-row" key={record.id}>

                            <div className="ai-actual-history-date">{record.prediction_date ? new Date(`${record.prediction_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Forecast'}</div>

                            <div className="ai-actual-bars">

                              <div className="ai-actual-bar-track"><span className="predicted-bar" style={{ width: `${Math.max(3, predicted / max * 100)}%` }} /><small>Predicted {predicted} days</small></div>

                              <div className="ai-actual-bar-track"><span className="actual-bar" style={{ width: `${Math.max(3, actual / max * 100)}%` }} /><small>Recorded {actual} days</small></div>

                            </div>

                            <strong className="ai-error-value">Error {Number(record.absolute_error).toFixed(1)}d</strong>

                          </div>

                        )

                      })}

                    </div>

                  )}

                  <p className="ai-chart-footnote">“Actual” is based on the next regular purchase recorded in Home Needs; it is not a sensor-measured empty-stock time.</p>

                </div>

              )}

              <div className="ai-product-accuracy-strip">

                <span>Prediction Accuracy</span>

                <strong>{selectedProduct.prediction_accuracy !== null && selectedProduct.prediction_accuracy !== undefined ? `${Number(selectedProduct.prediction_accuracy).toFixed(1)}%` : 'Not enough evaluated data'}</strong>

                <small>{Number(selectedProduct.evaluated_predictions || 0)} evaluated prediction(s) · MAE {selectedProduct.prediction_mae_days !== null && selectedProduct.prediction_mae_days !== undefined ? `${Number(selectedProduct.prediction_mae_days).toFixed(1)} days` : '—'}</small>

              </div>

            </section>


          </div>

        </div>

      ), document.body)}

      {shoppingDraft && createPortal((

        <div className="ai-modal-overlay ai-confirm-overlay" onClick={() => setShoppingDraft(null)}>

          <div className="ai-details-modal ai-shopping-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="shopping-confirm-title" onClick={(e) => e.stopPropagation()}>

            <button type="button" className="modal-close" aria-label="Close" onClick={() => setShoppingDraft(null)}>×</button>

            <div className="shopping-confirm-icon">🛒</div>

            <h2 id="shopping-confirm-title">Add to Shopping List?</h2>

            <p className="shopping-confirm-product">{shoppingDraft.product_name}</p>

            <p className="shopping-confirm-help">Review and adjust the recommended quantity before adding.</p>

            <div className="shopping-quantity-control">

              <button type="button" aria-label="Decrease quantity" onClick={() => setShoppingQuantity(String(Math.max(0, Number(shoppingQuantity || 0) - 1)))}>−</button>

              <input type="number" min="0.01" step="0.01" value={shoppingQuantity} onChange={(e) => setShoppingQuantity(e.target.value)} aria-label="Quantity" />

              <button type="button" aria-label="Increase quantity" onClick={() => setShoppingQuantity(String(Number(shoppingQuantity || 0) + 1))}>＋</button>

              <span>{shoppingDraft.unit || 'unit'}</span>

            </div>

            <div className="shopping-confirm-actions">

              <button type="button" className="shopping-cancel-button" onClick={() => setShoppingDraft(null)}>Cancel</button>

              <button type="button" className="shopping-confirm-button" onClick={confirmAddToShoppingList} disabled={addingProduct !== null || !Number.isFinite(Number(shoppingQuantity)) || Number(shoppingQuantity) <= 0}>{addingProduct === shoppingDraft.product_id ? 'Adding…' : 'Confirm & Add'}</button>

            </div>

          </div>

        </div>

      ), document.body)}

      {selectedImage && createPortal(

        <div

          className="ai-image-lightbox"

          role="dialog"

          aria-modal="true"

          aria-label={`${selectedImage.name} image`}

          onClick={() => setSelectedImage(null)}

        >

          <div className="ai-image-lightbox-content" onClick={(event) => event.stopPropagation()}>

            <button

              type="button"

              className="ai-image-lightbox-close"

              aria-label="Close image"

              onClick={() => setSelectedImage(null)}

            >

              ×

            </button>

            <img src={selectedImage.src} alt={selectedImage.name} />

            <h3>{selectedImage.name}</h3>

          </div>

        </div>,

        document.body

      )}

    </div>

  )

}

export default AIPrediction
