import { useState, useEffect, useMemo } from 'react'
import './PurchaseRecommendation.css'
import API_URL from '../api'

function PurchaseRecommendation() {
  const [recommendations, setRecommendations] = useState([])
  const [unitPrices, setUnitPrices] = useState({})
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addingId, setAddingId] = useState(null)
  const [addingSelected, setAddingSelected] = useState(false)
  const [message, setMessage] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState([])
  const [quantities, setQuantities] = useState({})
  const [budget, setBudget] = useState('')
  const [daysToMaintain, setDaysToMaintain] = useState(7)
  const [budgetPlanGenerated, setBudgetPlanGenerated] = useState(false)
  const [activeProductImage, setActiveProductImage] = useState(null)
  const [productImages, setProductImages] = useState({})
  const [pendingItem, setPendingItem] = useState(null)
  const [confirmationQuantity, setConfirmationQuantity] = useState(0)
  const [confirmingAdd, setConfirmingAdd] = useState(false)
  const [bulkConfirmationQueue, setBulkConfirmationQueue] = useState([])
  const [bulkConfirmationTotal, setBulkConfirmationTotal] = useState(0)

  const fetchRecommendations = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const [predictionResponse, purchaseResponse, productImagesResponse] = await Promise.all([
        fetch(`${API_URL}/ai-predictions`, { credentials: 'include' }),
        fetch(`${API_URL}/purchases`, { credentials: 'include' }),
        // Fetch only the logged-in user's selected product images.
        // GET /products is not the image-selection endpoint.
        fetch(`${API_URL}/product-images`, { credentials: 'include' }).catch(() => null)
      ])
      if (!predictionResponse.ok) throw new Error('Failed to fetch AI predictions')
      if (!purchaseResponse.ok) throw new Error('Failed to fetch purchase history')
      const predictionData = await predictionResponse.json()
      const purchaseData = await purchaseResponse.json()
      const items = Array.isArray(predictionData) ? predictionData : predictionData.predictions || []
      setRecommendations(items)
      setPurchases(Array.isArray(purchaseData) ? purchaseData : [])
      // Backend response: [{ product_id, image_url, product_name }, ...]
      const imageMap = {}

      if (productImagesResponse?.ok) {
        const selectedImagesData = await productImagesResponse.json()
        const selectedImages = Array.isArray(selectedImagesData)
          ? selectedImagesData
          : selectedImagesData.images || selectedImagesData.product_images || []

        selectedImages.forEach((selectedImage) => {
          const productId = Number(selectedImage.product_id)
          const imageUrl = selectedImage.image_url

          if (Number.isFinite(productId) && productId > 0 && imageUrl) {
            imageMap[productId] = imageUrl
          }
        })
      }

      // Replace the map even when empty, preventing stale images from
      // remaining visible after the logged-in account changes.
      setProductImages(imageMap)

      const priceMap = {}
      if (Array.isArray(purchaseData)) {
        purchaseData.forEach((purchase) => {
          const productId = Number(purchase.product_id)
          const quantity = Number(purchase.quantity)
          const totalPrice = Number(purchase.total_price)
          const storedUnitPrice = Number(purchase.unit_price)
          let unitPrice = storedUnitPrice > 0 ? storedUnitPrice : 0
          if (unitPrice <= 0 && Number.isFinite(totalPrice) && quantity > 0) unitPrice = totalPrice / quantity
          if (productId > 0 && Number.isFinite(unitPrice) && unitPrice > 0 && priceMap[productId] === undefined) {
            priceMap[productId] = unitPrice
          }
        })
      }
      setUnitPrices(priceMap)
    } catch (err) {
      console.error('Recommendation error:', err)
      setError(err.message || 'Unable to load purchase recommendations.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecommendations()
    const refresh = () => fetchRecommendations()
    window.addEventListener('aiPredictionsUpdated', refresh)
    window.addEventListener('purchaseUpdated', refresh)
    return () => {
      window.removeEventListener('aiPredictionsUpdated', refresh)
      window.removeEventListener('purchaseUpdated', refresh)
    }
  }, [])

  const getRecommendedQuantity = (item) => {
    const dailyUsage = Number(item.average_daily_consumption || 0)
    const currentStock = Number(item.current_stock || 0)
    if (!Number.isFinite(dailyUsage) || !Number.isFinite(currentStock) || dailyUsage <= 0 || currentStock < 0) return 0
    return Math.max(0, Number((dailyUsage * daysToMaintain - currentStock).toFixed(2)))
  }

  const getUnitPrice = (item) => {
    const price = Number(unitPrices[Number(item.product_id)])
    return Number.isFinite(price) && price > 0 ? price : 0
  }

  const getQuantity = (item) => {
    const saved = quantities[item.product_id]
    return saved === undefined ? getRecommendedQuantity(item) : Math.max(0, Number(saved) || 0)
  }

  const getItemEstimatedCost = (item) => getQuantity(item) * getUnitPrice(item)

  const getPriority = (item) => {
    const days = Number(item.days_remaining)
    return Number.isFinite(days) && days <= 2 ? 'high' : 'normal'
  }

  const recommendedItems = useMemo(() => recommendations
    .filter((item) => {
      const days = Number(item.days_remaining)
      return item.days_remaining !== null && item.days_remaining !== undefined && Number.isFinite(days) && days >= 0 && days < daysToMaintain && getRecommendedQuantity(item) > 0
    })
    .sort((a, b) => Number(a.days_remaining) - Number(b.days_remaining)), [recommendations, daysToMaintain])

  const filteredItems = useMemo(() => {
    if (priorityFilter === 'high') return recommendedItems.filter((item) => getPriority(item) === 'high')
    if (priorityFilter === 'normal') return recommendedItems.filter((item) => getPriority(item) === 'normal')
    return recommendedItems
  }, [recommendedItems, priorityFilter])

  useEffect(() => {
    const validIds = new Set(recommendedItems.map((item) => String(item.product_id)))
    setSelectedIds((current) => current.filter((id) => validIds.has(String(id))))
  }, [recommendedItems])

  const estimatedCost = recommendedItems.reduce((total, item) => total + getItemEstimatedCost(item), 0)
  const selectedItems = recommendedItems.filter((item) => selectedIds.includes(String(item.product_id)))
  const selectedCost = selectedItems.reduce((total, item) => total + getItemEstimatedCost(item), 0)
  const highPriorityCount = recommendedItems.filter((item) => getPriority(item) === 'high').length
  const normalPriorityCount = recommendedItems.length - highPriorityCount
  const budgetValue = Number(budget)
  const budgetProgress = budgetValue > 0 ? Math.min(100, (selectedCost / budgetValue) * 100) : 0
  // Prefer the image explicitly selected by this logged-in user.
  const getProductImage = (item) => productImages[Number(item.product_id)] || item.image_url || item.product_image_url || item.product_image || item.image || item.image_path || item.photo_url || ''
  const generateBudgetPlan = () => {
    const available = Number(budget)
    if (!Number.isFinite(available) || available <= 0) {
      setError('Please enter a budget greater than zero.')
      return
    }
    let remaining = available
    const chosen = []
    // Urgency first; when urgency ties, choose the lower-cost item first.
    const ranked = [...recommendedItems].sort((a, b) => {
      const urgency = Number(a.days_remaining) - Number(b.days_remaining)
      if (urgency !== 0) return urgency
      return getItemEstimatedCost(a) - getItemEstimatedCost(b)
    })
    ranked.forEach((item) => {
      const cost = getItemEstimatedCost(item)
      if (cost > 0 && cost <= remaining) {
        chosen.push(String(item.product_id))
        remaining -= cost
      }
    })
    setSelectedIds(chosen)
    setBudgetPlanGenerated(true)
    setPriorityFilter('all')
    setError('')
    setMessage(`Budget plan generated: ${chosen.length} product(s) selected within ₹${available.toFixed(2)}.`)
  }

  const currentMonthSummary = useMemo(() => {
    const now = new Date()
    let totalSpent = 0
    let purchaseCount = 0
    purchases.forEach((purchase) => {
      if (!purchase.purchase_date) return
      const date = new Date(purchase.purchase_date)
      if (Number.isNaN(date.getTime())) return
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
        totalSpent += Number(purchase.total_price || 0)
        purchaseCount += 1
      }
    })
    return { totalSpent, purchaseCount }
  }, [purchases])

  const handleQuantityChange = (item, value) => {
    const next = Math.max(0, Number(value) || 0)
    setQuantities((current) => ({ ...current, [item.product_id]: Number(next.toFixed(2)) }))
  }

  const toggleSelected = (item) => {
    const id = String(item.product_id)
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  const selectAllVisible = () => {
    const visibleIds = filteredItems.map((item) => String(item.product_id))
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])])
  }

  // Open the confirmation dialog instead of adding immediately.
  const handleAdd = (item) => {
    setBulkConfirmationQueue([])
    setBulkConfirmationTotal(0)
    setMessage('')
    setError('')
    setPendingItem(item)
    setConfirmationQuantity(getQuantity(item))
  }

  // Add the product only after the user confirms the editable quantity.
  // For bulk selection, the dialog advances one product at a time.
  const handleConfirmAdd = async () => {
    if (!pendingItem) return

    const currentItem = pendingItem
    const requiredQuantity = Math.max(0, Number(confirmationQuantity) || 0)

    if (requiredQuantity <= 0) {
      setError('Enter a quantity greater than zero.')
      return
    }

    setConfirmingAdd(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/shopping-list/add-prediction`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: currentItem.product_id,
          required_quantity: requiredQuantity
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to add item to Shopping List')
      }

      window.dispatchEvent(new Event('shoppingListUpdated'))
      setSelectedIds((current) => current.filter((id) => id !== String(currentItem.product_id)))

      if (bulkConfirmationQueue.length > 1) {
        const remainingQueue = bulkConfirmationQueue.slice(1)
        const nextItem = remainingQueue[0]
        setBulkConfirmationQueue(remainingQueue)
        setPendingItem(nextItem)
        setConfirmationQuantity(getQuantity(nextItem))
        setMessage(`${currentItem.product_name} added. Please review the next selected product.`)
      } else {
        setBulkConfirmationQueue([])
        setBulkConfirmationTotal(0)
        setPendingItem(null)
        setMessage(`${currentItem.product_name} (${requiredQuantity} ${currentItem.unit || ''}) added to your Shopping List!`)
      }
    } catch (err) {
      console.error('Add recommendation error:', err)
      setError(err.message || 'Unable to add item to Shopping List.')
    } finally {
      setConfirmingAdd(false)
    }
  }

  // Start the bulk flow. Each selected product requires its own confirmation.
  const handleAddSelected = () => {
    if (!selectedItems.length) return
    const queue = [...selectedItems]
    setError('')
    setMessage('')
    setBulkConfirmationQueue(queue)
    setBulkConfirmationTotal(queue.length)
    setPendingItem(queue[0])
    setConfirmationQuantity(getQuantity(queue[0]))
  }

  // Skip the current product and ask for confirmation of the next one.
  const handleSkipBulkItem = () => {
    if (!bulkConfirmationQueue.length) return
    const remainingQueue = bulkConfirmationQueue.slice(1)
    const skippedItem = bulkConfirmationQueue[0]
    setSelectedIds((current) => current.filter((id) => id !== String(skippedItem.product_id)))

    if (remainingQueue.length) {
      setBulkConfirmationQueue(remainingQueue)
      setPendingItem(remainingQueue[0])
      setConfirmationQuantity(getQuantity(remainingQueue[0]))
      setError('')
    } else {
      setBulkConfirmationQueue([])
      setBulkConfirmationTotal(0)
      setPendingItem(null)
      setMessage(`${skippedItem.product_name} skipped. Bulk confirmation completed.`)
    }
  }

  // Cancel closes the complete bulk-confirmation sequence.
  const handleCancelConfirmation = () => {
    if (confirmingAdd) return
    setPendingItem(null)
    setBulkConfirmationQueue([])
    setBulkConfirmationTotal(0)
    setError('')
  }

  const handleExport = () => {
    const rows = [['Product', 'Priority', 'Current Stock', 'Recommended Quantity', 'Unit', 'Unit Price (INR)', 'Estimated Cost (INR)']]
    recommendedItems.forEach((item) => rows.push([
      item.product_name, getPriority(item) === 'high' ? 'Buy now' : 'Buy soon', item.current_stock ?? 0,
      getQuantity(item), item.unit || '', getUnitPrice(item), getItemEstimatedCost(item).toFixed(2)
    ]))
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'home-needs-purchase-plan.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="purchase-recommendation">
      <div className="page-title">
        <div className="page-title-icon">🛍️</div>
        <div><h1>Purchase Recommendations</h1><p>Smart suggestions based on your household needs</p></div>
      </div>

      <div className="recommendation-summary">
        <div className="recommendation-summary-card summary-green"><div className="summary-icon">🛒</div><div><span>Recommended Items</span><strong>{recommendedItems.length}</strong><small>Based on selected stock period</small></div></div>
        <div className="recommendation-summary-card summary-blue"><div className="summary-icon">📦</div><div><span>Products Tracked</span><strong>{recommendations.length}</strong><small>Currently monitoring</small></div></div>
        <div className="recommendation-summary-card summary-orange"><div className="summary-icon">💰</div><div><span>Estimated Cost</span><strong>₹{estimatedCost.toFixed(2)}</strong><small>Based on latest recorded prices</small></div></div>
        <div className="recommendation-summary-card summary-purple"><div className="summary-icon">🚨</div><div><span>Buy Now</span><strong>{highPriorityCount}</strong><small>Expected to finish within 2 days</small></div></div>
      </div>

      <section className="budget-panel">
        <div className="budget-copy"><span className="budget-icon">💳</span><div><h2>Shopping Budget</h2><p>Set a budget to plan your recommended purchases.</p></div></div>
        <label className="budget-input-wrap"><span>My budget (₹)</span><input type="number" min="0" step="1" placeholder="Enter budget" value={budget} onChange={(event) => { setBudget(event.target.value); setBudgetPlanGenerated(false) }} /></label>
        <div className="budget-plan-controls">
          <div className="budget-progress-area">
            <div className="budget-progress-label"><span>All recommendations: <strong>₹{estimatedCost.toFixed(2)}</strong></span><span>{budgetValue > 0 ? `Budget: ₹${budgetValue.toFixed(2)}` : 'Enter your available budget'}</span></div>
            <div className="budget-progress-track"><div className={`budget-progress-fill ${budgetValue > 0 && estimatedCost > budgetValue ? 'over-budget' : ''}`} style={{ width: `${budgetValue > 0 ? Math.min(100, (estimatedCost / budgetValue) * 100) : 0}%` }} /></div>
            {budgetValue > 0 && <small className="budget-helper">{estimatedCost > budgetValue ? `All products exceed your budget by ₹${(estimatedCost - budgetValue).toFixed(2)}.` : `All recommendations fit. ₹${(budgetValue - estimatedCost).toFixed(2)} would remain.`}</small>}
          </div>
          <button type="button" className="generate-budget-plan" onClick={generateBudgetPlan}>✨ Generate Budget-Friendly Plan</button>
          {budgetPlanGenerated && <div className="budget-plan-result"><strong>{selectedItems.length} products selected</strong><span>Selected total: ₹{selectedCost.toFixed(2)}</span><span>Remaining: ₹{Math.max(0, budgetValue - selectedCost).toFixed(2)}</span><span>{recommendedItems.length - selectedItems.length} products can be bought later</span></div>}
        </div>
      </section>

      <section className="smart-purchase-section">
        <div className="section-heading">
          <div className="section-title-row"><span className="section-heading-icon">💡</span><div><h2>Smart Purchase Plan</h2><p>AI-recommended items based on your consumption pattern</p></div></div>
          <div className="duration-and-bulk-actions">
            <div className="duration-control">
              <label htmlFor="maintain-days">Maintain stock for</label>
              <select id="maintain-days" value={daysToMaintain} onChange={(event) => { setDaysToMaintain(Number(event.target.value)); setQuantities({}); setSelectedIds([]); setBudgetPlanGenerated(false) }}>
                <option value={3}>3 days</option><option value={7}>7 days (Default)</option><option value={15}>15 days</option><option value={30}>30 days</option>
              </select>
            </div>
            {!loading && !error && recommendedItems.length > 0 && (
              <div className="top-bulk-add-wrap">
                <button
                  type="button"
                  className="top-bulk-add-button"
                  onClick={handleAddSelected}
                  disabled={!selectedItems.length || addingSelected}
                >
                  {addingSelected ? 'Adding...' : `＋ Add Selected to Shopping List${selectedItems.length ? ` (${selectedItems.length})` : ''}`}
                </button>
                <small>Selected estimate: ₹{selectedCost.toFixed(2)}</small>
              </div>
            )}
          </div>
          <div className="recommendation-filters">
            <button type="button" className={`filter-pill all ${priorityFilter === 'all' ? 'active' : ''}`} onClick={() => setPriorityFilter('all')}>All ({recommendedItems.length})</button>
            <button type="button" className={`filter-pill high ${priorityFilter === 'high' ? 'active' : ''}`} onClick={() => setPriorityFilter('high')}>Buy Now ({highPriorityCount})</button>
            <button type="button" className={`filter-pill normal ${priorityFilter === 'normal' ? 'active' : ''}`} onClick={() => setPriorityFilter('normal')}>Buy Soon ({normalPriorityCount})</button>
          </div>
        </div>

        {!loading && !error && recommendedItems.length > 0 && <div className="plan-toolbar"><label className="select-all-label"><input type="checkbox" checked={filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(String(item.product_id)))} onChange={selectAllVisible} /> Select visible items</label><div className="plan-toolbar-actions"><span>{selectedItems.length} selected · ₹{selectedCost.toFixed(2)}</span><button type="button" className="outline-action" onClick={handleExport}>↓ Export Plan</button></div></div>}

        {loading && <div className="recommendation-empty"><div className="loading-icon">🤖</div><h3>Analyzing your household...</h3><p>Home Needs is checking stock, consumption patterns and purchase history.</p></div>}
        {!loading && error && <div className="recommendation-message error-message">⚠️ {error}</div>}
        {!loading && !error && recommendedItems.length === 0 && <div className="recommendation-empty"><div className="empty-icon">✓</div><h3>No purchases needed right now</h3><p>Your household products currently have sufficient stock, or more consumption data is needed for a recommendation.</p></div>}
        {!loading && !error && recommendedItems.length > 0 && filteredItems.length === 0 && <div className="recommendation-empty filter-empty"><div className="empty-icon">🔎</div><h3>No items in this group</h3><p>There are currently no recommendations in this priority group.</p></div>}

        {!loading && !error && filteredItems.length > 0 && <div className="recommendation-grid">
          {filteredItems.map((item) => {
            const quantity = getQuantity(item)
            const unitPrice = getUnitPrice(item)
            const cost = quantity * unitPrice
            const priority = getPriority(item)
            const days = Number(item.days_remaining)
            const finishText = days <= 0 ? 'Today' : days < 2 ? 'Tomorrow' : `In ${Math.ceil(days)} days`
            const selected = selectedIds.includes(String(item.product_id))
            return <article className={`smart-recommendation-card ${priority} ${selected ? 'selected' : ''}`} key={item.product_id}>
              <div className="recommendation-card-top">
                <label className="product-select">
                  <input type="checkbox" checked={selected} onChange={() => toggleSelected(item)} aria-label={`Select ${item.product_name}`} />
                  <span className={`priority-badge ${priority}`}><span className="priority-dot" />{priority === 'high' ? 'Buy Now' : 'Buy Soon'}</span>
                </label>
                <div className="recommendation-card-top-actions">
                  
                  <span className="finish-badge"><small>Expected to finish</small><strong>{finishText}</strong></span>
                </div>
              </div>
              <div className="product-main-info">
                <button
                  type="button"
                  className="product-visual"
                  onClick={() => getProductImage(item) && setActiveProductImage({ src: getProductImage(item), name: item.product_name })}
                  aria-label={`View ${item.product_name} image`}
                  disabled={!getProductImage(item)}
                >
                  {getProductImage(item) ? (
                    <>
                      <img
                        src={getProductImage(item)}
                        alt={item.product_name}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                          const fallback = event.currentTarget.parentElement?.querySelector('.product-image-fallback')
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <span className="product-image-fallback" style={{ display: 'none' }}>
                        <span className="fallback-basket">🛒</span>
                        <small>Product Image</small>
                      </span>
                    </>
                  ) : (
                    <span className="product-image-fallback">
                      <span className="fallback-basket">🛒</span>
                      <small>Product Image</small>
                    </span>
                  )}
                </button>
                <div className="product-info">
                  <h3>{item.product_name}</h3>
                  <p>Current Stock: <strong>{item.current_stock ?? 0} {item.unit || ''}</strong></p>
                  <p>Daily Usage: <strong>{item.average_daily_consumption ?? 0} {item.unit || ''}/day</strong></p>
                </div>
              </div>
              <div className="ai-recommendation-box"><span className="ai-icon">🤖</span><div><strong>AI Recommendation</strong><p>Suggested quantity to maintain approximately {daysToMaintain} days of stock.</p></div></div>
              <div className="quantity-control-row"><span>Purchase quantity</span><div className="quantity-stepper"><button type="button" aria-label={`Decrease ${item.product_name} quantity`} onClick={() => handleQuantityChange(item, Math.max(0, quantity - 1))}>−</button><input type="number" min="0" step="0.1" value={quantity} onChange={(event) => handleQuantityChange(item, event.target.value)} /><button type="button" aria-label={`Increase ${item.product_name} quantity`} onClick={() => handleQuantityChange(item, quantity + 1)}>+</button></div><small>{item.unit || ''}</small></div>
              <div className="recommendation-values"><div><span>Unit Price</span><strong>{unitPrice > 0 ? `₹${unitPrice.toFixed(2)}` : 'Not set'}</strong></div><div><span>Quantity</span><strong>{quantity.toFixed(2)} {item.unit || ''}</strong></div><div><span>Estimated Cost</span><strong>{unitPrice > 0 ? `₹${cost.toFixed(2)}` : '—'}</strong></div></div>
              <button className="shopping-list-button" onClick={() => handleAdd(item)} disabled={addingId === item.product_id || quantity <= 0}>🛒 {addingId === item.product_id ? 'Adding...' : 'Add to Shopping List'}</button>
            </article>
          })}
        </div>}
      </section>

      {pendingItem && (
        <div
          className="purchase-confirm-backdrop"
          role="presentation"
          onClick={handleCancelConfirmation}
        >
          <div
            className="purchase-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="purchase-confirm-header">
              <div>
                <span className="purchase-confirm-icon">🛒</span>
                <div>
                  <h2 id="purchase-confirm-title">Confirm Shopping Item</h2>
                  <p>{bulkConfirmationQueue.length > 0 ? `Confirm each selected product one by one (${bulkConfirmationQueue.length} remaining).` : 'Review and edit the quantity before adding.'}</p>
                </div>
              </div>
              <button
                type="button"
                className="purchase-confirm-close"
                onClick={handleCancelConfirmation}
                disabled={confirmingAdd}
                aria-label="Close confirmation"
              >
                ×
              </button>
            </div>

            <div className="purchase-confirm-product">
              {getProductImage(pendingItem) ? (
                <img
                  src={getProductImage(pendingItem)}
                  alt={pendingItem.product_name}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                    const fallback = event.currentTarget.parentElement?.querySelector('.purchase-confirm-placeholder')
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
              ) : null}
              <div
                className="purchase-confirm-placeholder"
                style={{ display: getProductImage(pendingItem) ? 'none' : 'flex' }}
              >
                <span>🛒</span>
              </div>
              <div className="purchase-confirm-product-name">
                <strong>{pendingItem.product_name}</strong>
                <small>Review your purchase quantity</small>
              </div>
            </div>

            <div className="purchase-confirm-quantity">
              <label htmlFor="confirmation-quantity">Purchase Quantity</label>
              <div className="purchase-confirm-stepper">
                <button
                  type="button"
                  onClick={() => setConfirmationQuantity((value) => Math.max(0, Number((Number(value) - 1).toFixed(2))))}
                  aria-label="Decrease quantity"
                >−</button>
                <input
                  id="confirmation-quantity"
                  type="number"
                  min="0"
                  step="0.1"
                  value={confirmationQuantity}
                  onChange={(event) => setConfirmationQuantity(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setConfirmationQuantity((value) => Number((Number(value || 0) + 1).toFixed(2)))}
                  aria-label="Increase quantity"
                >+</button>
                <span>{pendingItem.unit || ''}</span>
              </div>
            </div>

            <div className="purchase-confirm-price-row">
              <span>Unit Price</span>
              <strong>
                {getUnitPrice(pendingItem) > 0
                  ? `₹${getUnitPrice(pendingItem).toFixed(2)}`
                  : 'Not available'}
              </strong>
            </div>
            <div className="purchase-confirm-total-row">
              <span>Estimated Total</span>
              <strong>
                {getUnitPrice(pendingItem) > 0
                  ? `₹${(Math.max(0, Number(confirmationQuantity) || 0) * getUnitPrice(pendingItem)).toFixed(2)}`
                  : '—'}
              </strong>
            </div>

            {error && (
              <div className="purchase-confirm-error" role="alert">{error}</div>
            )}

            {bulkConfirmationQueue.length > 0 && (
              <div className="purchase-confirm-bulk-progress">
                Product {bulkConfirmationTotal - bulkConfirmationQueue.length + 1} of {bulkConfirmationTotal}
              </div>
            )}

            <div className="purchase-confirm-actions">
              <button
                type="button"
                className="purchase-confirm-cancel"
                onClick={handleCancelConfirmation}
                disabled={confirmingAdd}
              >Cancel</button>
              {bulkConfirmationQueue.length > 0 && (
                <button
                  type="button"
                  className="purchase-confirm-skip"
                  onClick={handleSkipBulkItem}
                  disabled={confirmingAdd}
                >Skip</button>
              )}
              <button
                type="button"
                className="purchase-confirm-submit"
                onClick={handleConfirmAdd}
                disabled={confirmingAdd || Number(confirmationQuantity) <= 0}
              >
                {confirmingAdd ? 'Adding...' : '✓ Confirm & Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeProductImage && <div className="product-image-modal-backdrop" role="presentation" onClick={() => setActiveProductImage(null)}>
        <div className="product-image-modal" role="dialog" aria-modal="true" aria-label={`${activeProductImage.name} image`} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="product-image-modal-close" onClick={() => setActiveProductImage(null)} aria-label="Close image">×</button>
          <img src={activeProductImage.src} alt={activeProductImage.name} />
          <h2>{activeProductImage.name}</h2>
        </div>
      </div>}
      {message && <div className="recommendation-toast success">✓ {message}</div>}

      {/* Styles for the confirmation dialog and default product image. */}
      <style>{`
        .purchase-recommendation .product-image-fallback {
          width: 100%; height: 100%; min-height: 65px; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 5px; padding: 6px; background: #edf8ef; border: 1px solid #d8ecdc;
          border-radius: 10px; color: #087a45; text-align: center;
        }
        .purchase-recommendation .product-image-fallback .fallback-basket { font-size: 27px; line-height: 1; }
        .purchase-recommendation .product-image-fallback small { font-size: 9px; font-weight: 600; color: #63816d; }
        .recommendation-card-top-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
        .plan-toggle-button { border: 1px solid #d8e9dc; border-radius: 999px; padding: 6px 9px; font-size: 10px; font-weight: 700; white-space: nowrap; cursor: pointer; }
        .plan-toggle-button.add { background: #eaf7ee; color: #087a45; }
        .plan-toggle-button.remove { background: #fff1ef; border-color: #f3d3ce; color: #b42318; }
        .purchase-confirm-bulk-progress { margin: 2px 0 10px; color: #63816d; font-size: 11px; font-weight: 700; text-align: center; }
        .purchase-confirm-skip { flex: 1; min-height: 43px; border: 1px solid #f0dfbd; border-radius: 11px; background: #fff9ed; color: #8a5a0a; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
        .purchase-confirm-backdrop {
          position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center;
          justify-content: center; padding: 16px; background: rgba(18, 38, 27, .48);
          backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
        }
        .purchase-confirm-modal {
          position: relative; width: min(100%, 420px); max-height: 90vh; overflow-y: auto;
          box-sizing: border-box; padding: 22px; background: #fff; border: 1px solid #e1eee4;
          border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, .2); color: #173d2b;
        }
        .purchase-confirm-header, .purchase-confirm-header > div { display: flex; align-items: center; }
        .purchase-confirm-header { justify-content: space-between; gap: 12px; margin-bottom: 20px; }
        .purchase-confirm-header > div { gap: 12px; min-width: 0; }
        .purchase-confirm-icon { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; border-radius: 14px; background: #eaf7ee; font-size: 22px; }
        .purchase-confirm-header h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.3; }
        .purchase-confirm-header p { margin: 0; color: #718276; font-size: 12px; }
        .purchase-confirm-close { flex: 0 0 32px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: #eff6f0; color: #315d43; font-size: 23px; cursor: pointer; }
        .purchase-confirm-product { display: flex; align-items: center; gap: 13px; padding: 12px; margin-bottom: 20px; border: 1px solid #e3eee5; border-radius: 13px; background: #fbfefb; }
        .purchase-confirm-product > img, .purchase-confirm-placeholder { flex: 0 0 64px; width: 64px; height: 64px; object-fit: cover; border-radius: 10px; }
        .purchase-confirm-placeholder { display: flex; align-items: center; justify-content: center; background: #edf8ef; color: #087a45; font-size: 27px; }
        .purchase-confirm-product-name { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .purchase-confirm-product-name strong { font-size: 15px; overflow-wrap: anywhere; }
        .purchase-confirm-product-name small { color: #78877c; font-size: 11px; }
        .purchase-confirm-quantity { margin-bottom: 17px; }
        .purchase-confirm-quantity > label { display: block; margin-bottom: 9px; font-size: 13px; font-weight: 700; }
        .purchase-confirm-stepper { display: flex; align-items: center; gap: 9px; }
        .purchase-confirm-stepper button { width: 38px; height: 38px; border: 1px solid #dcebe0; border-radius: 10px; background: #f1f8f2; color: #087a45; font-size: 21px; cursor: pointer; }
        .purchase-confirm-stepper input { flex: 1; min-width: 0; height: 38px; box-sizing: border-box; border: 1px solid #dcebe0; border-radius: 10px; padding: 0 10px; text-align: center; font: inherit; font-weight: 700; color: #173d2b; }
        .purchase-confirm-stepper > span { min-width: 28px; color: #64776a; font-size: 12px; }
        .purchase-confirm-price-row, .purchase-confirm-total-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; font-size: 13px; }
        .purchase-confirm-price-row { color: #718276; border-bottom: 1px solid #edf2ee; }
        .purchase-confirm-total-row { margin-bottom: 12px; color: #173d2b; font-weight: 700; }
        .purchase-confirm-total-row strong { color: #078449; font-size: 18px; }
        .purchase-confirm-error { margin: 8px 0 12px; padding: 9px 11px; border-radius: 9px; background: #fff1ef; color: #b42318; font-size: 12px; }
        .purchase-confirm-actions { display: flex; gap: 10px; margin-top: 8px; }
        .purchase-confirm-actions button { flex: 1; min-height: 43px; border-radius: 11px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
        .purchase-confirm-cancel { border: 1px solid #dce8df; background: #f7faf7; color: #45604d; }
        .purchase-confirm-submit { border: 1px solid #078449; background: linear-gradient(135deg, #159b5b, #087a45); color: #fff; }
        .purchase-confirm-actions button:disabled, .purchase-confirm-close:disabled { opacity: .55; cursor: not-allowed; }
        @media (max-width: 480px) {
          .purchase-confirm-modal { padding: 18px; border-radius: 17px; }
          .purchase-confirm-header h2 { font-size: 16px; }
        }
        .duration-and-bulk-actions {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap; width: 100%;
        }
        .top-bulk-add-wrap {
          display: flex; flex-direction: column; align-items: flex-end;
          gap: 4px; margin-left: auto; min-width: 0;
        }
        .top-bulk-add-button {
          min-height: 40px; padding: 9px 15px; border: 0; border-radius: 10px;
          background: linear-gradient(135deg, #159b5b, #087a45); color: #fff;
          font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
          white-space: nowrap; box-shadow: 0 3px 8px rgba(8, 122, 69, .14);
        }
        .top-bulk-add-button:disabled {
          opacity: .48; cursor: not-allowed; box-shadow: none;
        }
        .top-bulk-add-wrap small { color: #718276; font-size: 10px; }
        @media (max-width: 600px) {
          .duration-and-bulk-actions { align-items: stretch; gap: 9px; }
          .duration-and-bulk-actions .duration-control { flex: 1 1 100%; }
          .top-bulk-add-wrap { width: 100%; align-items: stretch; margin-left: 0; }
          .top-bulk-add-button { width: 100%; white-space: normal; }
          .top-bulk-add-wrap small { text-align: center; }
        }
      `}</style>
    </div>
  )
}

export default PurchaseRecommendation
