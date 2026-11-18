import { useState, useEffect, useMemo } from 'react'

import './ExpiryTracking.css'

import API_URL from '../api'



function ExpiryTracking() {

  const [products, setProducts] = useState([])
  const [productImages, setProductImages] = useState({})
  const [imagePreview, setImagePreview] = useState(null)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [sortBy, setSortBy] = useState('expiry')

  const [activeFilter, setActiveFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [openActionMenu, setOpenActionMenu] = useState(null)

  const [showAllAlerts, setShowAllAlerts] = useState(false)

  const [showAllProducts, setShowAllProducts] = useState(false)

  const [wastage, setWastage] = useState([])

  const [actionLoading, setActionLoading] = useState(false)

  const [actionMessage, setActionMessage] = useState('')

  const [archiveCandidates, setArchiveCandidates] = useState([])

  const [actionModal, setActionModal] = useState(null)

  const [modalQuantity, setModalQuantity] = useState('')

  const [modalReason, setModalReason] = useState('Expired')

  const [modalExpiryDate, setModalExpiryDate] = useState('')
  const [expiredExceptionConfirmed, setExpiredExceptionConfirmed] = useState(false)
  const [expiredExceptionReason, setExpiredExceptionReason] = useState('')



  const getDaysRemaining = (expiryDate) => {

    if (!expiryDate) return null

    const expiry = new Date(expiryDate)

    if (Number.isNaN(expiry.getTime())) return null

    expiry.setHours(0, 0, 0, 0)

    const today = new Date()

    today.setHours(0, 0, 0, 0)

    return Math.round((expiry - today) / 86400000)

  }



  const formatDate = (date) => {

    if (!date) return 'Date unavailable'

    const parsed = new Date(date)

    if (Number.isNaN(parsed.getTime())) return 'Date unavailable'

    return parsed.toLocaleDateString('en-IN', {

      day: 'numeric',

      month: 'short',

      year: 'numeric'

    })

  }



  const fetchProducts = async () => {

    setError('')

    try {

      const response = await fetch(`${API_URL}/`, {

        credentials: 'include'

      })

      if (!response.ok) throw new Error('Failed to fetch products')

      const data = await response.json()

      const safeProducts = Array.isArray(data) ? data : []

      setProducts(safeProducts)

      setArchiveCandidates(safeProducts.filter(product => Number(product.quantity) <= 0 && product.expiry_date))

    } catch (err) {

      console.error('Expiry tracking error:', err)

      setError('Unable to load expiry details. Please check Flask.')

    } finally {

      setLoading(false)

    }

  }



  const fetchProductImages = async () => {
    try {
      const response = await fetch(`${API_URL}/product-images`, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Unable to fetch product images')
      const data = await response.json()
      const imageMap = {}
      ;(Array.isArray(data) ? data : []).forEach(item => {
        if (item?.product_id && item?.image_url) {
          imageMap[String(item.product_id)] = item.image_url
        }
      })
      setProductImages(imageMap)
    } catch (err) {
      console.error('Expiry product images error:', err)
      setProductImages({})
    }
  }

  const fetchWastage = async () => {

    try {

      const response = await fetch(`${API_URL}/expiry/wastage`, {

        credentials: 'include'

      })

      if (!response.ok) throw new Error('Unable to fetch wastage history')

      const data = await response.json()

      setWastage(Array.isArray(data) ? data : [])

    } catch (err) {

      console.error('Wastage history error:', err)

    }

  }



  const postExpiryAction = async (url, payload) => {

    const response = await fetch(`${API_URL}${url}`, {

      method: 'POST',

      credentials: 'include',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) throw new Error(data.message || 'Action failed')

    return data

  }



  useEffect(() => {

    fetchProducts()

    fetchWastage()

    fetchProductImages()

    const refresh = () => { fetchProducts(); fetchWastage(); fetchProductImages() }

    window.addEventListener('productsUpdated', refresh)

    window.addEventListener('purchaseUpdated', refresh)

    window.addEventListener('aiPredictionsUpdated', refresh)

    return () => {

      window.removeEventListener('productsUpdated', refresh)

      window.removeEventListener('purchaseUpdated', refresh)

      window.removeEventListener('aiPredictionsUpdated', refresh)

    }

  }, [])



  useEffect(() => {
    if (!imagePreview) return undefined
    const handleKeyDown = event => {
      if (event.key === 'Escape') setImagePreview(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [imagePreview])


  const trackedProducts = useMemo(

    () => products.filter(product =>

      Number(product.quantity) > 0 &&

      product.expiry_date &&

      getDaysRemaining(product.expiry_date) !== null

    ),

    [products]

  )



  const expiredProducts = trackedProducts.filter(

    product => getDaysRemaining(product.expiry_date) < 0

  )

  const expiringSoon = trackedProducts.filter(product => {

    const days = getDaysRemaining(product.expiry_date)

    return days >= 0 && days <= 3

  })

  const expiringThisWeek = trackedProducts.filter(product => {

    const days = getDaysRemaining(product.expiry_date)

    return days >= 0 && days <= 7

  })

  const freshProducts = trackedProducts.filter(

    product => getDaysRemaining(product.expiry_date) > 7

  )

  const todayProducts = trackedProducts.filter(

    product => getDaysRemaining(product.expiry_date) === 0

  )



  const sortedProducts = useMemo(() => {

    let list = [...trackedProducts]

    if (sortBy === 'name') {

      list.sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || '')))

    } else if (sortBy === 'quantity') {

      list.sort((a, b) => Number(b.quantity) - Number(a.quantity))

    } else {

      list.sort((a, b) => getDaysRemaining(a.expiry_date) - getDaysRemaining(b.expiry_date))

    }

    return list

  }, [trackedProducts, sortBy])



  const filteredProducts = useMemo(() => {

    switch (activeFilter) {

      case 'today':

        return sortedProducts.filter(p => getDaysRemaining(p.expiry_date) === 0)

      case 'three':

        return sortedProducts.filter(p => {

          const days = getDaysRemaining(p.expiry_date)

          return days >= 0 && days <= 3

        })

      case 'seven':

        return sortedProducts.filter(p => {

          const days = getDaysRemaining(p.expiry_date)

          return days >= 0 && days <= 7

        })

      case 'expired':

        return sortedProducts.filter(p => getDaysRemaining(p.expiry_date) < 0)

      default:

        return sortedProducts

    }

  }, [sortedProducts, activeFilter])

  const searchedProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return filteredProducts
    return filteredProducts.filter(product => String(product.product_name || '').toLowerCase().includes(query))
  }, [filteredProducts, searchTerm])



  const getProductIcon = (name = '') => {

    const value = name.toLowerCase()

    if (value.includes('tomato')) return '🍅'

    if (value.includes('milk')) return '🥛'

    if (value.includes('curd') || value.includes('yogurt')) return '🥣'

    if (value.includes('bread')) return '🍞'

    if (value.includes('cheese')) return '🧀'

    if (value.includes('spinach')) return '🥬'

    if (value.includes('banana')) return '🍌'

    if (value.includes('apple')) return '🍎'

    if (value.includes('rice')) return '🍚'

    if (value.includes('potato')) return '🥔'

    if (value.includes('onion')) return '🧅'

    if (value.includes('ginger')) return '🫚'

    if (value.includes('juice')) return '🧃'

    if (value.includes('egg')) return '🥚'

    if (value.includes('oil')) return '🛢️'

    if (value.includes('chicken')) return '🍗'

    if (value.includes('salt')) return '🧂'

    if (value.includes('sugar')) return '🍬'

    return '📦'

  }



  const getExpiryLabel = (days) => {

    if (days < 0) return 'Expired'

    if (days === 0) return 'Today'

    if (days === 1) return '1 day left'

    return `${days} days left`

  }



  const getStatusClass = (days) => {

    if (days < 0) return 'status-expired'

    if (days === 0) return 'status-today'

    if (days <= 3) return 'status-soon'

    if (days <= 7) return 'status-week'

    return 'status-fresh'

  }




  const openActionModal = (type, product) => {

    if (!product) return

    setActionMessage('')

    setActionModal({ type, product })

    setModalQuantity(String(product.quantity || ''))

    setModalReason('Expired')

    setModalExpiryDate(toDateInputValue(product.expiry_date))
    setExpiredExceptionConfirmed(false)
    setExpiredExceptionReason('')

  }



  const toDateInputValue = (value) => {

    if (!value) return ''

    const text = String(value)

    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

    const parsed = new Date(value)

    if (Number.isNaN(parsed.getTime())) return ''

    const year = parsed.getFullYear()

    const month = String(parsed.getMonth() + 1).padStart(2, '0')

    const day = String(parsed.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`

  }



  const submitActionModal = async () => {

    if (!actionModal || actionLoading) return

    const { type, product } = actionModal



    if (type === 'update') {

      if (!modalExpiryDate) {

        window.alert('Please select an expiry date.')

        return

      }

      setActionLoading(true)

      try {

        const response = await fetch(`${API_URL}/expiry/update/${product.id}`, {

          method: 'PUT',

          credentials: 'include',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ expiry_date: modalExpiryDate })

        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) throw new Error(data.message || 'Unable to update expiry date')

        setActionMessage(`Expiry date updated for ${product.product_name}.`)

        setActionModal(null)

        await fetchProducts()

      } catch (err) {

        window.alert(err.message)

      } finally {

        setActionLoading(false)

      }

      return

    }



    const quantity = Number(modalQuantity)
    const isExpiredConsumption = type === 'consume' && getDaysRemaining(product.expiry_date) < 0
    if (isExpiredConsumption && (!expiredExceptionConfirmed || !expiredExceptionReason.trim())) {
      window.alert('Please confirm the warning and enter a reason before recording this exception.')
      return
    }

    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(product.quantity)) {

      window.alert(`Enter a quantity greater than zero and not more than ${product.quantity} ${product.unit || ''}.`)

      return

    }



    setActionLoading(true)

    try {

      if (type === 'consume') {

        const response = await fetch(`${API_URL}/consumption`, {

          method: 'POST',

          credentials: 'include',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            productName: product.product_name,

            quantity,

            unit: product.unit,

            usageDate: new Date().toISOString().slice(0, 10),
              expired_exception_confirmed: expiredExceptionConfirmed,
              exception_reason: expiredExceptionReason.trim()

          })

        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) throw new Error(data.message || 'Unable to record consumption')

        setActionMessage(`${quantity} ${product.unit || ''} ${product.product_name} recorded as consumed.`)

      } else if (type === 'discard') {

        await postExpiryAction('/expiry/discard', {

          product_id: product.id,

          quantity,

          reason: modalReason.trim() || 'Expired'

        })

        setActionMessage(`${quantity} ${product.unit || ''} ${product.product_name} recorded as wastage.`)

      }



      setActionModal(null)

      await Promise.all([fetchProducts(), fetchWastage()])

      window.dispatchEvent(new Event('productsUpdated'))

    } catch (err) {

      window.alert(err.message)

    } finally {

      setActionLoading(false)

    }

  }



  const markAsConsumed = (product) => openActionModal('consume', product)

  const discardStock = (product) => openActionModal('discard', product)



  const updateExpiryDate = (product) => openActionModal('update', product)



  const archiveProduct = async (product) => {

    if (Number(product.quantity) > 0) {

      window.alert('Only products with zero stock can be archived.')

      return

    }

    if (!window.confirm(`Archive ${product.product_name}? It will be hidden from active inventory.`)) return



    setActionLoading(true)

    setActionMessage('')

    try {

      const data = await postExpiryAction(`/expiry/archive/${product.id}`, {})

      setActionMessage(`${product.product_name} archived successfully.`)

      await fetchProducts()

    } catch (err) {

      window.alert(err.message)

    } finally {

      setActionLoading(false)

    }

  }



  const addToShoppingList = (product) => {

    window.dispatchEvent(new CustomEvent('add-product-to-shopping-list', {

      detail: {

        productId: product.id,

        productName: product.product_name

      }

    }))

    window.alert(

      `Requested adding ${product.product_name} to your shopping list. If your Shopping List module does not listen for this event, add the product there manually.`

    )

  }



  const suggestionProduct = [...expiringSoon].sort(

    (a, b) => getDaysRemaining(a.expiry_date) - getDaysRemaining(b.expiry_date)

  )[0] || null



  const suggestionText = suggestionProduct

    ? `${suggestionProduct.product_name} ${

        getDaysRemaining(suggestionProduct.expiry_date) === 0

          ? 'expires today'

          : `expires in ${getDaysRemaining(suggestionProduct.expiry_date)} day(s)`

      }. Consider using it soon to avoid food waste.`

    : 'No products are expiring within the next 3 days. Your household stock looks good.'



  const scrollToSection = (id) => {

    document.getElementById(id)?.scrollIntoView({

      behavior: 'smooth',

      block: 'start'

    })

  }



  const renderProductCard = (product, compact = false) => {
    const days = getDaysRemaining(product.expiry_date)
    const menuOpen = openActionMenu === product.id

    return (
      <article className={`expiry-product-card ${compact ? 'compact' : ''}`} key={product.id}>
        <button
          type="button"
          className={`expiry-product-visual expiry-product-image-button ${productImages[String(product.id)] ? 'has-image' : 'no-image'}`}
          onClick={() => setImagePreview({
            name: product.product_name,
            imageUrl: productImages[String(product.id)] || '',
            fallback: getProductIcon(product.product_name)
          })}
          aria-label={`View image of ${product.product_name}`}
          title={`View ${product.product_name}`}
        >
          {productImages[String(product.id)] ? (
            <img src={productImages[String(product.id)]} alt={product.product_name} loading="lazy" />
          ) : (
            <span aria-hidden="true">{getProductIcon(product.product_name)}</span>
          )}
          <span className="expiry-image-zoom-hint" aria-hidden="true">⌕</span>
        </button>
        <div className="expiry-product-info">
          <strong>{product.product_name}</strong>
          <span className="expiry-product-quantity">{product.quantity} {product.unit || ''}</span>
          <span className="expiry-product-date">
            <span aria-hidden="true">▣</span> {formatDate(product.expiry_date)}
          </span>
        </div>
        <div className="expiry-product-side">
          <span className={`expiry-status ${getStatusClass(days)}`}>{getExpiryLabel(days)}</span>
          <div className="expiry-product-menu-wrap">
            <button
              type="button"
              className="expiry-menu-trigger"
              aria-label={`Actions for ${product.product_name}`}
              aria-expanded={menuOpen}
              onClick={() => setOpenActionMenu(menuOpen ? null : product.id)}
              disabled={actionLoading}
            >⋮</button>
            {menuOpen && (
              <>
                <button type="button" className="expiry-menu-dismiss" aria-label="Close product actions" onClick={() => setOpenActionMenu(null)} />
                <div className="expiry-product-action-menu">
                  <button type="button" onClick={() => { setOpenActionMenu(null); markAsConsumed(product) }}>
                    <span className="menu-action-icon consume">✓</span>
                    <span><strong>Record Consumption</strong><small>Update available stock</small></span>
                  </button>
                  <button type="button" onClick={() => { setOpenActionMenu(null); discardStock(product) }}>
                    <span className="menu-action-icon discard">♻</span>
                    <span><strong>Record Wastage</strong><small>Remove discarded quantity</small></span>
                  </button>
                  <button type="button" onClick={() => { setOpenActionMenu(null); updateExpiryDate(product) }}>
                    <span className="menu-action-icon update">▦</span>
                    <span><strong>Update Expiry Date</strong><small>Change product expiry</small></span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </article>
    )
  }

  const filterOptions = [

    { key: 'all', label: `All (${trackedProducts.length})` },

    { key: 'today', label: `Today (${todayProducts.length})` },

    { key: 'three', label: `≤ 3 Days (${expiringSoon.length})` },

    { key: 'seven', label: `≤ 7 Days (${expiringThisWeek.length})` },

    { key: 'expired', label: `Expired (${expiredProducts.length})` }

  ]



  return (

    <main className="expiry-tracking">

      <header className="expiry-page-header">

        <div className="expiry-title-wrap">

          <div className="expiry-title-icon" aria-hidden="true">📅</div>

          <div>

            <p className="expiry-eyebrow">HOME INVENTORY</p>

            <h1>Expiry Tracking</h1>

            <p className="expiry-subtitle">Monitor your household products and reduce food waste.</p>

          </div>

        </div>

      </header>



      {error && (

        <div className="expiry-error" role="alert">

          <span>⚠️ {error}</span>

          <button type="button" onClick={fetchProducts}>Retry</button>

        </div>

      )}



      <section className="expiry-summary" aria-label="Expiry summary">

        <button type="button" className="expiry-summary-card summary-danger" onClick={() => scrollToSection('expiry-alerts-section')}>

          <span className="summary-icon">◷</span>

          <span className="summary-copy">

            <span>Expiring Soon</span>

            <strong>{loading ? '…' : expiringSoon.length}</strong>

            <small>Within 3 days</small>

          </span>

        </button>

        <button type="button" className="expiry-summary-card summary-warning" onClick={() => scrollToSection('expiry-alerts-section')}>

          <span className="summary-icon">▦</span>

          <span className="summary-copy">

            <span>This Week</span>

            <strong>{loading ? '…' : expiringThisWeek.length}</strong>

            <small>Within 7 days</small>

          </span>

        </button>

        <button type="button" className="expiry-summary-card summary-success" onClick={() => { setActiveFilter('all'); scrollToSection('expiry-products-section') }}>

          <span className="summary-icon">✓</span>

          <span className="summary-copy">

            <span>Fresh Products</span>

            <strong>{loading ? '…' : freshProducts.length}</strong>

            <small>More than 7 days</small>

          </span>

        </button>

        <button type="button" className="expiry-summary-card summary-expired" onClick={() => { setActiveFilter('expired'); scrollToSection('expiry-products-section') }}>

          <span className="summary-icon">!</span>

          <span className="summary-copy">

            <span>Expired</span>

            <strong>{loading ? '…' : expiredProducts.length}</strong>

            <small>Need attention</small>

          </span>

        </button>

      </section>



      <section className="expiry-section expiry-alerts-section" id="expiry-alerts-section">

        <div className="section-heading-row">

          <div>

            <p className="expiry-eyebrow">PRIORITY LIST</p>

            <h2>Expiry Alerts</h2>

            <p>Products that need your quick attention.</p>

          </div>

          <button type="button" className="expiry-view-all" onClick={() => { setActiveFilter('seven'); scrollToSection('expiry-products-section') }}>

            View All <span>→</span>

          </button>

        </div>



        {loading ? (

          <div className="expiry-empty-state">Loading products…</div>

        ) : expiringThisWeek.length ? (

          <div className="expiry-product-list">

            {(showAllAlerts ? [...expiringThisWeek] : [...expiringThisWeek].slice(0, 3))

              .sort((a, b) => getDaysRemaining(a.expiry_date) - getDaysRemaining(b.expiry_date))

              .map(product => renderProductCard(product))}

            {expiringThisWeek.length > 3 && (

              <button type="button" className="expiry-show-more" onClick={() => setShowAllAlerts(value => !value)}>

                {showAllAlerts ? 'Show less ↑' : `Show ${expiringThisWeek.length - 3} more ↓`}

              </button>

            )}

          </div>

        ) : (

          <div className="expiry-empty-state">

            <span>✓</span>

            <div><strong>No products expiring within 7 days</strong><p>You're all caught up!</p></div>

          </div>

        )}

      </section>



      <section className="expiry-suggestion">

        <div className="suggestion-icon">💡</div>

        <div className="suggestion-content">

          <div className="suggestion-heading">

            <h2>Smart Suggestion</h2>

            <span className="suggestion-tag">✦ Smart insight</span>

          </div>

          <p>{loading ? 'Checking your products…' : suggestionText}</p>

        </div>

      </section>



      <section className="expiry-section expiry-products-section" id="expiry-products-section">

        <div className="section-heading-row expiry-products-heading">

          <div>

            <p className="expiry-eyebrow">YOUR INVENTORY</p>

            <h2>All Products</h2>

            <p>View and manage products by expiry status.</p>

          </div>

          <div className="expiry-products-tools">
            <label className="expiry-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search products..." aria-label="Search products" />
              {searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search">×</button>}
            </label>
            <select className="expiry-sort" value={sortBy} onChange={event => setSortBy(event.target.value)} aria-label="Sort products">

            <option value="expiry">Sort: Expiry date</option>

            <option value="name">Sort: Product name</option>

            <option value="quantity">Sort: Quantity</option>
            </select>
          </div>
        </div>



        <div className="expiry-filter-list" role="group" aria-label="Filter products by expiry">

          {filterOptions.map(option => (

            <button

              type="button"

              key={option.key}

              className={`expiry-filter-chip ${activeFilter === option.key ? 'active' : ''}`}

              onClick={() => setActiveFilter(option.key)}

              aria-pressed={activeFilter === option.key}

            >

              {option.label}

            </button>

          ))}

        </div>



        {loading ? (

          <div className="expiry-empty-state">Loading products…</div>

        ) : searchedProducts.length ? (

          <>

            <div className="expiry-product-list all-products-list">

              {(showAllProducts ? searchedProducts : searchedProducts.slice(0, 6)).map(product => renderProductCard(product, true))}

            </div>

            {searchedProducts.length > 6 && (

              <button type="button" className="expiry-show-more" onClick={() => setShowAllProducts(value => !value)}>

                {showAllProducts ? 'Show less ↑' : `Show ${searchedProducts.length - 6} more ↓`}

              </button>

            )}

          </>

        ) : (

          <div className="expiry-empty-state">

            <span>✓</span>

            <div><strong>No products in this filter</strong><p>Try another expiry filter to see your inventory.</p></div>

          </div>

        )}

      </section>



      {archiveCandidates.length > 0 && (

        <section className="expiry-section expiry-archive-section">

          <div className="section-heading-row">

            <div>

              <p className="expiry-eyebrow">INVENTORY CLEANUP</p>

              <h2>Ready to Archive</h2>

              <p>These products have zero stock and can be moved out of active inventory.</p>

            </div>

          </div>

          <div className="expiry-archive-list">

            {archiveCandidates.map(product => (

              <div className="expiry-archive-row" key={product.id}>

                <div>

                  <strong>{product.product_name}</strong>

                  <small>Stock: {product.quantity} {product.unit || ''}</small>

                </div>

                <button

                  type="button"

                  className="expiry-archive-button"

                  disabled={actionLoading}

                  onClick={() => archiveProduct(product)}

                >

                  Archive

                </button>

              </div>

            ))}

          </div>

        </section>

      )}



      <section className="expiry-quick-actions">

        <div className="quick-actions-heading">

          <span className="quick-actions-icon">⚡</span>

          <div><h2>Quick Actions</h2><p>Shortcuts for your priority product.</p></div>

        </div>

        <div className="quick-actions-grid">

          <button

            type="button"

            className="quick-action-button quick-action-consumed"

            disabled={!suggestionProduct}

            onClick={() => markAsConsumed(suggestionProduct)}

          >

            <span className="quick-action-symbol">✓</span>

            <span><strong>Mark as Consumed</strong><small>Update inventory</small></span>

          </button>

          <button

            type="button"

            className="quick-action-button quick-action-shopping"

            disabled={!suggestionProduct}

            onClick={() => addToShoppingList(suggestionProduct)}

          >

            <span className="quick-action-symbol">🛒</span>

            <span><strong>Add to Shopping List</strong><small>Restock products</small></span>

          </button>

          <button

            type="button"

            className="quick-action-button quick-action-discard"

            disabled={!suggestionProduct || actionLoading}

            onClick={() => discardStock(suggestionProduct)}

          >

            <span className="quick-action-symbol">♻️</span>

            <span><strong>Record Wastage</strong><small>Discard expired stock</small></span>

          </button>

        </div>

        {actionMessage && <p className="expiry-action-message" role="status">{actionMessage}</p>}

        {actionLoading && <p className="expiry-action-loading">Saving inventory update…</p>}

      </section>



      <section className="expiry-section expiry-wastage-section">

        <div className="section-heading-row">

          <div>

            <p className="expiry-eyebrow">WASTE MANAGEMENT</p>

            <h2>Wastage History</h2>

            <p>Track products and quantities removed from your household stock.</p>

          </div>

          <button type="button" className="expiry-view-all" onClick={fetchWastage}>Refresh ↻</button>

        </div>

        {wastage.length ? (

          <div className="expiry-wastage-list">

            {wastage.slice(0, 8).map(item => (

              <div className="expiry-wastage-row" key={item.id}>

                <span className="wastage-icon">🗑️</span>

                <div className="wastage-info">

                  <strong>{item.product_name}</strong>

                  <small>{item.reason || 'Discarded'} · {formatDate(item.discard_date)}</small>

                </div>

                <strong className="wastage-quantity">-{item.quantity_wasted} {item.unit}</strong>

              </div>

            ))}

          </div>

        ) : (

          <div className="expiry-empty-state"><span>✓</span><div><strong>No wastage recorded yet</strong><p>Discarded quantities will appear here.</p></div></div>

        )}

      </section>



      {imagePreview && (
        <div
          className="expiry-image-preview-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setImagePreview(null)
          }}
        >
          <section className="expiry-image-preview" role="dialog" aria-modal="true" aria-label={`${imagePreview.name} image preview`}>
            <button
              type="button"
              className="expiry-image-preview-close"
              onClick={() => setImagePreview(null)}
              aria-label="Close image preview"
            >×</button>
            <div className="expiry-image-preview-picture">
              {imagePreview.imageUrl ? (
                <img src={imagePreview.imageUrl} alt={imagePreview.name} />
              ) : (
                <span className="expiry-image-preview-fallback" aria-hidden="true">{imagePreview.fallback}</span>
              )}
            </div>
            <h2>{imagePreview.name}</h2>
            
          </section>
        </div>
      )}

      {actionModal && (

        <div className="expiry-modal-backdrop" role="presentation" onMouseDown={(event) => {

          if (event.target === event.currentTarget && !actionLoading) setActionModal(null)

        }}>

          <section className="expiry-action-modal" role="dialog" aria-modal="true" aria-labelledby="expiry-modal-title">

            <div className="expiry-modal-header">

              <div className="expiry-modal-icon">

                {actionModal.type === 'update' ? '📅' : actionModal.type === 'consume' ? '✓' : '♻️'}

              </div>

              <button type="button" className="expiry-modal-close" onClick={() => !actionLoading && setActionModal(null)} aria-label="Close">×</button>

            </div>

            <p className="expiry-eyebrow">HOME INVENTORY</p>

            <h2 id="expiry-modal-title">

              {actionModal.type === 'update' ? 'Update Expiry Date' : actionModal.type === 'consume' ? 'Record Consumption' : 'Record Wastage'}

            </h2>

            <p className="expiry-modal-product">{actionModal.product.product_name} · Available: {actionModal.product.quantity} {actionModal.product.unit || ''}</p>



            {actionModal.type === 'update' ? (

              <label className="expiry-modal-field">

                <span>New expiry date</span>

                <input

                  type="date"

                  value={modalExpiryDate}

                  onChange={(event) => setModalExpiryDate(event.target.value)}

                  min={toDateInputValue(actionModal.product.purchase_date) || undefined}

                  required

                />

              </label>

            ) : (

              <>

                <label className="expiry-modal-field">

                  <span>{actionModal.type === 'consume' ? 'Quantity Consumed' : 'Quantity Wasted'} ({actionModal.product.unit || 'units'})</span>

                  <input

                    type="number"

                    inputMode="decimal"

                    min="0.01"

                    max={Number(actionModal.product.quantity)}

                    step="any"

                    value={modalQuantity}

                    onChange={(event) => setModalQuantity(event.target.value)}

                    placeholder="Enter quantity"

                  />

                </label>

                {actionModal.type === 'discard' && (

                  <label className="expiry-modal-field">

                    <span>Reason for wastage</span>

                    <select value={modalReason} onChange={(event) => setModalReason(event.target.value)}>

                      <option value="Expired">Expired</option>

                      <option value="Spoiled">Spoiled</option>

                      <option value="Damaged">Damaged</option>

                      <option value="Other">Other</option>

                    </select>

                  </label>

                )}

                {actionModal.type === 'consume' && getDaysRemaining(actionModal.product.expiry_date) < 0 && (
                  <div className="expiry-exception-warning" role="alert">
                    <strong>⚠️ This product is past its expiry date.</strong>
                    <p>Expiry-date information cannot confirm that food is safe. Do not consume food that looks, smells, or seems unsafe. When in doubt, discard it.</p>
                    <label className="expiry-exception-check">
                      <input
                        type="checkbox"
                        checked={expiredExceptionConfirmed}
                        onChange={(event) => setExpiredExceptionConfirmed(event.target.checked)}
                      />
                      <span>I understand the warning and still want to record this consumption.</span>
                    </label>
                    {expiredExceptionConfirmed && (
                      <label className="expiry-modal-field">
                        <span>Reason for this exception (required)</span>
                        <input
                          type="text"
                          value={expiredExceptionReason}
                          onChange={(event) => setExpiredExceptionReason(event.target.value)}
                          maxLength={255}
                          placeholder="Explain why you are recording this"
                        />
                      </label>
                    )}
                  </div>
                )}

              </>

            )}



            <div className="expiry-modal-actions">

              <button type="button" className="expiry-modal-cancel" onClick={() => setActionModal(null)} disabled={actionLoading}>Cancel</button>

              <button type="button" className="expiry-modal-save" onClick={submitActionModal} disabled={actionLoading}>

                {actionLoading ? 'Saving…' : actionModal.type === 'update' ? 'Update Expiry Date' : actionModal.type === 'consume' ? 'Save Consumption' : 'Save Wastage'}

              </button>

            </div>

          </section>

        </div>

      )}



      <section className="expiry-tips">

        <div className="expiry-tips-copy">

          <div className="expiry-tips-heading"><span>🌿</span><h2>Expiry Tips</h2></div>

          <ul>

            <li>Use items expiring soon in your next meal.</li>

            <li>Store fruits and vegetables properly to extend freshness.</li>

            <li>Check expiry dates when adding new products.</li>

          </ul>

        </div>

        <div className="expiry-tips-art" aria-hidden="true">🥬</div>

      </section>

    </main>

  )

}



export default ExpiryTracking
