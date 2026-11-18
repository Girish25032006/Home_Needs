import { useEffect, useMemo, useState } from 'react'

import './ProductManagement.css'

import API_URL from '../api'

function ProductManagement({ onAddProduct }) {

   const [products, setProducts] = useState([])
   const [estimatedStocks, setEstimatedStocks] = useState({})

   const [search, setSearch] = useState('')

   const [selectedCategory, setSelectedCategory] = useState('All')

   const [editingProduct, setEditingProduct] = useState(null)
   const [galleryImages, setGalleryImages] = useState([])
   const [gallerySearch, setGallerySearch] = useState('')
   const [appliedGallerySearch, setAppliedGallerySearch] = useState('')
   const [productImages, setProductImages] = useState({})
   const [imageMenuProduct, setImageMenuProduct] = useState(null)
   const [galleryProduct, setGalleryProduct] = useState(null)
   const [previewImage, setPreviewImage] = useState(null)
   const [imageBusy, setImageBusy] = useState(false)
   const [showAllLowStock, setShowAllLowStock] = useState(false)
   const [sortOrder, setSortOrder] = useState('low-stock')
   const [showFilters, setShowFilters] = useState(false)
   const [stockFilter, setStockFilter] = useState('all')

   const CATEGORY_CONFIG = {

      Vegetables: { icon: '🥬', color: 'green' },

      Fruits: { icon: '🍎', color: 'orange' },

      'Grains & Staples': { icon: '🌾', color: 'gold' },

      'Dairy & Eggs': { icon: '🥛', color: 'blue' },

      'Cooking Essentials': { icon: '🫙', color: 'yellow' },

      'Bakery & Breakfast': { icon: '🍞', color: 'amber' },

      'Packaged & Instant Food': { icon: '🥫', color: 'red' },

      'Cleaning & Household': { icon: '🧹', color: 'purple' },

      'Personal Care': { icon: '🧴', color: 'pink' },

      Beverages: { icon: '🥤', color: 'cyan' },

      Other: { icon: '📦', color: 'slate' }

   }

   const CATEGORY_ORDER = Object.keys(CATEGORY_CONFIG)

   const normalizeCategory = (category) => {

      const value = String(category || '').trim().toLowerCase()

      if (['vegetable', 'vegetables', 'veg'].includes(value)) return 'Vegetables'

      if (['fruit', 'fruits'].includes(value)) return 'Fruits'

      if (['grain', 'grains', 'staples', 'grains & staples', 'grocery', 'groceries'].includes(value)) return 'Grains & Staples'

      if (['dairy', 'dairy & eggs', 'milk', 'eggs', 'egg'].includes(value)) return 'Dairy & Eggs'

      if (['cooking', 'cooking essentials', 'oil', 'spices', 'masala'].includes(value)) return 'Cooking Essentials'

      if (['bakery', 'bakery & breakfast', 'breakfast'].includes(value)) return 'Bakery & Breakfast'

      if (['packaged', 'packaged food', 'packaged & instant food', 'instant food', 'instant'].includes(value)) return 'Packaged & Instant Food'

      if (['cleaning', 'cleaning & household', 'household', 'home care'].includes(value)) return 'Cleaning & Household'

      if (['personal care', 'personal', 'beauty', 'hygiene'].includes(value)) return 'Personal Care'

      if (['beverages', 'beverage', 'drinks', 'drink'].includes(value)) return 'Beverages'

      return 'Other'

   }

   const getCategoryConfig = (category) => CATEGORY_CONFIG[normalizeCategory(category)] || CATEGORY_CONFIG.Other

   const getEffectiveCategory = (product) => normalizeCategory(product?.category)

   const LOW_STOCK_LIMIT = 2

   const fetchProducts = async () => {

      try {

         const response = await fetch(

            `${API_URL}/`,

            {

               credentials: 'include'

            }

         )

         if (response.status === 401) {

            console.warn('User is not logged in.')

            setProducts([])

            return

         }

         const data = await response.json()

         if (response.ok) {

            setProducts(Array.isArray(data) ? data : [])

         } else {

            console.error('Failed to fetch products:', data)

            setProducts([])

         }

      } catch (error) {

         console.error('Error fetching products:', error)

         setProducts([])

      }

   }



   // Fetch AI-estimated stock separately; actual database stock is untouched.
   const fetchEstimatedStocks = async () => {
      try {
         const response = await fetch(`${API_URL}/ai-predictions`, {
            credentials: 'include'
         })

         if (!response.ok) {
            console.error('Failed to fetch AI-estimated stock')
            setEstimatedStocks({})
            return
         }

         const data = await response.json()
         const stockMap = {}

         if (Array.isArray(data.predictions)) {
            data.predictions.forEach((prediction) => {
               stockMap[prediction.product_id] =
                  prediction.estimated_stock === null ||
                  prediction.estimated_stock === undefined
                     ? null
                     : Number(prediction.estimated_stock)
            })
         }

         setEstimatedStocks(stockMap)
      } catch (error) {
         console.error('Error fetching AI-estimated stock:', error)
         setEstimatedStocks({})
      }
   }

   const getEstimatedStock = (product) => {
      const value = estimatedStocks[product.id]
      return value !== null && value !== undefined && Number.isFinite(value)
         ? value
         : null
   }

   useEffect(() => {

      fetchProducts()
      fetchEstimatedStocks()

      const handleProductsUpdated = () => {

         fetchProducts()
         fetchEstimatedStocks()

      }

      window.addEventListener(
         'productsUpdated',
         handleProductsUpdated
      )
      window.addEventListener(
         'aiPredictionsUpdated',
         handleProductsUpdated
      )
      window.addEventListener(
         'consumptionUpdated',
         handleProductsUpdated
      )

      return () => {
         window.removeEventListener(
            'productsUpdated',
            handleProductsUpdated
         )
         window.removeEventListener(
            'aiPredictionsUpdated',
            handleProductsUpdated
         )
         window.removeEventListener(
            'consumptionUpdated',
            handleProductsUpdated
         )
      }

   }, [])

   const fetchProductImages = async () => {
      try {
         const [galleryResponse, selectedResponse] = await Promise.all([
            fetch(`${API_URL}/product-image-gallery`, { credentials: 'include' }),
            fetch(`${API_URL}/product-images`, { credentials: 'include' })
         ])
         if (galleryResponse.ok) {
            const galleryData = await galleryResponse.json()
            setGalleryImages(Array.isArray(galleryData) ? galleryData : [])
         }
         if (selectedResponse.ok) {
            const selectedData = await selectedResponse.json()
            const imageMap = {}
            if (Array.isArray(selectedData)) selectedData.forEach((item) => { imageMap[item.product_id] = item.image_url })
            setProductImages(imageMap)
         }
      } catch (error) { console.error('Error fetching product images:', error) }
   }

   useEffect(() => {
      fetchProductImages()
      const handleImagesUpdated = () => fetchProductImages()
      window.addEventListener('productImagesUpdated', handleImagesUpdated)
      return () => window.removeEventListener('productImagesUpdated', handleImagesUpdated)
   }, [])

   const saveProductImage = async (product, imageUrl) => {
      setImageBusy(true)
      try {
         const response = await fetch(`${API_URL}/products/${product.id}/image`, {
            method: 'PUT', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imageUrl })
         })
         const data = await response.json()
         if (!response.ok) { alert(data.message || 'Unable to save product image'); return }
         setProductImages((current) => ({ ...current, [product.id]: imageUrl }))
         setGalleryProduct(null)
         setImageMenuProduct(null)
      } catch (error) { console.error('Error saving product image:', error); alert('Unable to connect to backend') }
      finally { setImageBusy(false) }
   }

   const removeProductImage = async (product) => {
      setImageBusy(true)
      try {
         const response = await fetch(`${API_URL}/products/${product.id}/image`, { method: 'DELETE', credentials: 'include' })
         const data = await response.json()
         if (!response.ok) { alert(data.message || 'Unable to remove product image'); return }
         setProductImages((current) => { const updated = { ...current }; delete updated[product.id]; return updated })
         setImageMenuProduct(null)
      } catch (error) { console.error('Error removing product image:', error); alert('Unable to connect to backend') }
      finally { setImageBusy(false) }
   }

   const lowStockProducts = products.filter((product) => {
      const estimatedStock = getEstimatedStock(product)
      return estimatedStock !== null && estimatedStock <= LOW_STOCK_LIMIT
   })

   const outOfStockCount = products.filter((product) => {
      const stock = getEstimatedStock(product)
      return stock !== null && stock <= 0
   }).length

   const expiringSoonCount = products.filter((product) => {
      const rawDate = product.expiry_date || product.expiryDate
      if (!rawDate) return false
      const expiry = new Date(rawDate)
      if (Number.isNaN(expiry.getTime())) return false
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const days = Math.ceil((expiry.setHours(0, 0, 0, 0) - today.getTime()) / 86400000)
      return days >= 0 && days <= 7
   }).length

   const handleEdit = (product) => {

      setEditingProduct({

         ...product,

         quantity: product.quantity,

         price: product.price

      })

   }

   const handleUpdate = async () => {

      if (!editingProduct) {

         return

      }

      try {

         const response = await fetch(

            `${API_URL}/products/${editingProduct.id}`,

            {

               method: 'PUT',

               credentials: 'include',

               headers: {

                  'Content-Type': 'application/json'

               },

               body: JSON.stringify({

                  productName: editingProduct.product_name,

                  category: normalizeCategory(editingProduct.category),

                  quantity: editingProduct.quantity,

                  unit: editingProduct.unit,

                  price: editingProduct.price,

                  purchaseDate:

                     editingProduct.purchase_date

                        ? editingProduct.purchase_date.substring(0, 10)

                        : ''

               })

            }

         )

         const data = await response.json()

         if (response.ok) {

            alert('Product updated successfully!')

            setEditingProduct(null)

            await fetchProducts()

            window.dispatchEvent(

               new CustomEvent('productsUpdated')

            )

         } else {

            alert(

               data.message ||

               'Failed to update product'

            )

         }

      } catch (error) {

         console.error(

            'Error updating product:',

            error

         )

         alert(

            'Unable to connect to backend'

         )

      }

   }

   const categoryCounts = useMemo(() => {

      const counts = { All: products.length }

      products.forEach((product) => {

         const category = getEffectiveCategory(product)

         counts[category] = (counts[category] || 0) + 1

      })

      return counts

   }, [products])

   const filteredProducts = useMemo(() => {
      const searchValue = search.toLowerCase().trim()
      const result = products.filter((product) => {
         const matchesSearch =
            !searchValue ||
            (product.product_name || '').toLowerCase().includes(searchValue) ||
            (product.category || '').toLowerCase().includes(searchValue) ||
            getEffectiveCategory(product).toLowerCase().includes(searchValue)

         const matchesCategory =
            selectedCategory === 'All' || getEffectiveCategory(product) === selectedCategory

         const stock = getEstimatedStock(product)
         const matchesStock =
            stockFilter === 'all' ||
            (stockFilter === 'low' && stock !== null && stock > 0 && stock <= LOW_STOCK_LIMIT) ||
            (stockFilter === 'out' && stock !== null && stock <= 0) ||
            (stockFilter === 'available' && stock !== null && stock > LOW_STOCK_LIMIT)

         return matchesSearch && matchesCategory && matchesStock
      })

      return result.sort((a, b) => {
         const stockA = getEstimatedStock(a)
         const stockB = getEstimatedStock(b)
         if (sortOrder === 'low-stock') return (stockA ?? Infinity) - (stockB ?? Infinity)
         if (sortOrder === 'name') return (a.product_name || '').localeCompare(b.product_name || '')
         if (sortOrder === 'price-high') return Number(b.price_per_unit ?? b.price ?? 0) - Number(a.price_per_unit ?? a.price ?? 0)
         if (sortOrder === 'price-low') return Number(a.price_per_unit ?? a.price ?? 0) - Number(b.price_per_unit ?? b.price ?? 0)
         return 0
      })
   }, [products, search, selectedCategory, stockFilter, sortOrder, estimatedStocks])

   const groupedProducts = useMemo(() => {

      const groups = {}

      filteredProducts.forEach((product) => {

         const category = getEffectiveCategory(product)

         if (!groups[category]) groups[category] = []

         groups[category].push(product)

      })

      return CATEGORY_ORDER.filter((category) => groups[category]?.length).map((category) => ({

         category,

         products: groups[category]

      }))

   }, [filteredProducts])

   // Normalize product names so singular/plural forms and punctuation match.
   const normalizeProductSearch = (value) => {
      return String(value || '')
         .toLowerCase()
         .trim()
         .replace(/[^a-z0-9\s]/g, '')
         .split(/\s+/)
         .filter(Boolean)
         .map((word) => {
            if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2)
            if (word.endsWith('s') && word.length > 3) return word.slice(0, -1)
            return word
         })
         .join(' ')
   }

   // Levenshtein distance: allows small spelling mistakes such as "tamato".
   const getEditDistance = (a, b) => {
      const previous = Array.from({ length: b.length + 1 }, (_, index) => index)

      for (let i = 1; i <= a.length; i++) {
         let diagonal = previous[0]
         previous[0] = i

         for (let j = 1; j <= b.length; j++) {
            const above = previous[j]
            previous[j] = Math.min(
               previous[j] + 1,
               previous[j - 1] + 1,
               diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
            )
            diagonal = above
         }
      }
      return previous[b.length]
   }

   const filteredGalleryImages = useMemo(() => {
      const query = normalizeProductSearch(gallerySearch)
      if (!query) return galleryImages

      return galleryImages.filter((image) => {
         const name = normalizeProductSearch(image.product_name)
         const category = normalizeProductSearch(image.category)

         // First prefer ordinary partial matches in name/category.
         if (name.includes(query) || category.includes(query)) return true

         // Then allow minor spelling errors against individual name words.
         return name.split(/\s+/).some((word) => {
            if (word.length < 4 || query.length < 4) return false
            const allowedDistance = query.length >= 7 ? 2 : 1
            return getEditDistance(word, query) <= allowedDistance
         })
      })
   }, [galleryImages, gallerySearch])

   return (

       <div className="product-management">

    

         

         <div className="pm-page-heading">
            <div>
               <span className="pm-eyebrow">YOUR HOUSEHOLD INVENTORY</span>
               <h1>Product Management</h1>
               <p>Manage your household products and stock</p>
            </div>
         </div>

         <section className="inventory-summary" aria-label="Inventory summary">
            <article className="inventory-stat stat-total">
               <span className="inventory-stat-icon">📦</span>
               <div><strong>{products.length}</strong><span>Total Products</span></div>
            </article>
            <article className="inventory-stat stat-low">
               <span className="inventory-stat-icon">⚠️</span>
               <div><strong>{lowStockProducts.filter((product) => getEstimatedStock(product) > 0).length}</strong><span>Low Stock</span></div>
            </article>
            <article className="inventory-stat stat-out">
               <span className="inventory-stat-icon">▣</span>
               <div><strong>{outOfStockCount}</strong><span>Out of Stock</span></div>
            </article>
            <article className="inventory-stat stat-expiry">
               <span className="inventory-stat-icon">🗓️</span>
               <div><strong>{expiringSoonCount}</strong><span>Expiring Soon</span></div>
            </article>
         </section>

         {/* Low Stock Alert */}

         {lowStockProducts.length > 0 && (

            <div className="low-stock-alert">

               <div className="low-stock-alert-icon">

                  ⚠️

               </div>

               <div>

                  <h3>

                     Low Stock Alert

                  </h3>

                  <p>

                     {lowStockProducts.length} household

                     {lowStockProducts.length === 1

                        ? ' product is'

                        : ' products are'}{' '}

                     running low. Please consider restocking.

                  </p>

                  <button type="button" className="view-low-stock-button"
                     onClick={() => { setSelectedCategory('All'); setStockFilter('low'); setShowAllLowStock(true) }}>
                     View Low Stock Products <span>›</span>
                  </button>
                  <div className="low-stock-names">

                     
                      {(showAllLowStock ? lowStockProducts : lowStockProducts.slice(0, 3)).map((product) => (
                         <span key={product.id}>
                            {product.product_name} ({getEstimatedStock(product).toFixed(2)}{' '}{product.unit})
                         </span>
                      ))}
                      {lowStockProducts.length > 3 && (
                         <button
                            type="button"
                            className="low-stock-more-button"
                            onClick={() => setShowAllLowStock((current) => !current)}
                            aria-expanded={showAllLowStock}
                         >
                            {showAllLowStock ? 'Show less' : `+${lowStockProducts.length - 3} more`}
                         </button>
                      )}
                    

                  </div>

               </div>

            </div>

         )}

         {/* Search + Add Product */}

         <div className="product-toolbar">

            <div className="product-search">

               <span>⌕</span>

               <input

                  type="text"

                  placeholder="Search products..."

                  value={search}

                  onChange={(e) => setSearch(e.target.value)}

               />

               {search && (

                  <button className="clear-search" onClick={() => setSearch('')}>×</button>

               )}

            </div>

            <button type="button" className={`product-filter-toggle ${showFilters ? 'active' : ''}`}
               onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}>
               <span>☷</span><span>Filter</span>
            </button>
            <div className="product-toolbar-right">

               <div className="product-summary">

                  <strong>{filteredProducts.length}</strong>

                  <span>products shown</span>

               </div>

               <button

                  className="add-product-button"

                  onClick={onAddProduct}

               >

                  <span className="add-product-icon">+</span>

                  <span>Add Product</span>

               </button>

            </div>

         </div>

         {showFilters && (
            <div className="product-filter-panel">
               <label>Stock status
                  <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
                     <option value="all">All stock statuses</option>
                     <option value="low">Low stock</option>
                     <option value="out">Out of stock</option>
                     <option value="available">Available</option>
                  </select>
               </label>
               <label>Sort products
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                     <option value="low-stock">Low stock first</option>
                     <option value="name">Name: A to Z</option>
                     <option value="price-high">Price: high to low</option>
                     <option value="price-low">Price: low to high</option>
                  </select>
               </label>
               <button type="button" onClick={() => { setStockFilter('all'); setSortOrder('low-stock'); setSelectedCategory('All'); setSearch('') }}>Reset</button>
            </div>
         )}

         <button
            type="button"
            className="floating-add-product-button"
            onClick={onAddProduct}
            aria-label="Add Product"
         >
            <span className="add-product-icon">+</span>
            <span>Add Product</span>
         </button>

         <div className="category-filter">

            <button

               className={`category-filter-button ${selectedCategory === 'All' ? 'active' : ''}`}

               onClick={() => setSelectedCategory('All')}

            >

               <span>🏠</span><span>All</span><b>{categoryCounts.All || 0}</b>

            </button>

            {CATEGORY_ORDER.map((category) => {

               const config = CATEGORY_CONFIG[category]

               return (

                  <button

                     key={category}

                     className={`category-filter-button ${selectedCategory === category ? 'active' : ''}`}

                     onClick={() => setSelectedCategory(category)}

                  >

                     <span>{config.icon}</span><span>{category}</span><b>{categoryCounts[category]}</b>

                  </button>

               )

            })}

         </div>

         <div className="products-section-heading">
            <div><h2>Products ({filteredProducts.length})</h2><span>Browse your household inventory</span></div>
            <label className="inline-sort">Sort
               <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                  <option value="low-stock">Low Stock First</option>
                  <option value="name">Name A–Z</option>
                  <option value="price-high">Price High–Low</option>
                  <option value="price-low">Price Low–High</option>
               </select>
            </label>
         </div>
         <div className="category-sections">

            {groupedProducts.map(({ category, products: categoryProducts }) => {

               const config = CATEGORY_CONFIG[category]

               return (

                  <section className="product-category-section" key={category}>

                     <div className="category-section-header">

                        <div className={`category-title-icon ${config.color}`}>{config.icon}</div>

                        <div className="category-title">

                           <h2>{category}</h2>

                           <span>{categoryProducts.length} {categoryProducts.length === 1 ? 'product' : 'products'}</span>

                        </div>

                        <div className="category-line" />

                     </div>

                     <div className="product-grid">

                        {categoryProducts.map((product) => {

                           const estimatedStock = getEstimatedStock(product)
                           const isLowStock = estimatedStock !== null && estimatedStock <= LOW_STOCK_LIMIT
                           // Visual indicator compares current stock with twice the low-stock threshold.
                           const stockFill = estimatedStock === null ? 0 : Math.max(0, Math.min(100, (estimatedStock / (LOW_STOCK_LIMIT * 2)) * 100))

                           return (

                              <div className={`product-card ${isLowStock ? 'product-card-low-stock' : ''}`} key={product.id}>
                                  <div className="product-image-column">
                                     <button
                                        type="button"
                                        className={`product-image-trigger ${productImages[product.id] ? 'has-product-image' : ''}`}
                                        onClick={() => productImages[product.id] && setPreviewImage({ url: productImages[product.id], name: product.product_name })}
                                        title={productImages[product.id] ? `Preview ${product.product_name} image` : 'No image selected'}
                                     >
                                        {productImages[product.id]
                                           ? <img src={productImages[product.id]} alt={product.product_name} loading="lazy" />
                                           : <span className={`product-icon ${config.color}`}>{config.icon}</span>}
                                     </button>
                                  </div>

                                  <div className="product-card-body">
                                     <h3>{product.product_name}</h3>
                                     <p>{category}</p>
                                     <div className="product-stock">
                                        <strong>{estimatedStock === null ? 'Learning...' : `${estimatedStock.toFixed(2)} ${product.unit}`}</strong>
                                     </div>
                                     <div className="product-card-footer">
                                        <div className="product-price">₹{Number(product.price_per_unit ?? product.price ?? 0).toFixed(2)} / {String(product.purchase_unit || product.unit || 'unit').toLowerCase() === 'packet' ? 'packet' : (product.purchase_unit || product.unit || 'unit')}</div>
                                        <span className={`stock-status ${isLowStock ? 'stock-low' : 'stock-available'}`}>
                                           {estimatedStock === null ? 'AI Learning' : isLowStock ? '⚠️ Low Stock' : '✓ Available'}
                                        </span>
                                     </div>
                                     <div className={`product-stock-meter ${isLowStock ? 'meter-low' : ''}`} role="img" aria-label={estimatedStock === null ? 'Stock level is being learned' : isLowStock ? 'Low stock level' : 'Available stock level'}>
                                        <span style={{ width: `${stockFill}%` }} />
                                     </div>
                                  </div>

                                  <div className="product-actions-column">
                                     <div className="product-actions-small">
                                        <button type="button" className="product-image-menu-button" title="Product image options" aria-label={`Image options for ${product.product_name}`} onClick={() => setImageMenuProduct(imageMenuProduct === product.id ? null : product.id)}>🖼️</button>
                                        <button type="button" onClick={() => handleEdit(product)} title="Edit" aria-label={`Edit ${product.product_name}`}>✏️</button>
                                        <button
                                           type="button"
                                           onClick={async () => {
                                              if (!window.confirm(`Delete ${product.product_name}?`)) return
                                              try {
                                                 const response = await fetch(`${API_URL}/products/${product.id}`, {
                                                    method: 'DELETE', credentials: 'include'
                                                 })
                                                 const data = await response.json()
                                                 if (response.ok) {
                                                    alert('Product deleted successfully!')
                                                    await fetchProducts()
                                                    window.dispatchEvent(new CustomEvent('productsUpdated'))
                                                 } else alert(data.message || 'Failed to delete product')
                                              } catch (error) {
                                                 console.error('Error deleting product:', error)
                                                 alert('Unable to connect to backend')
                                              }
                                           }}
                                           title="Delete"
                                           aria-label={`Delete ${product.product_name}`}
                                        >🗑️</button>
                                     </div>
                                     {imageMenuProduct === product.id && (
                                        <div className="product-image-menu">
                                           <button type="button" onClick={() => { setGallerySearch(''); setAppliedGallerySearch(''); setGalleryProduct(product); setImageMenuProduct(null) }}>🖼️ Choose image</button>
                                           {productImages[product.id] && <>
                                              <button type="button" onClick={() => { setPreviewImage({ url: productImages[product.id], name: product.product_name }); setImageMenuProduct(null) }}>🔍 Preview image</button>
                                              <button type="button" disabled={imageBusy} onClick={() => removeProductImage(product)}>✕ Remove image</button>
                                           </>}
                                        </div>
                                     )}
                                  </div>
                               </div>

                           )

                        })}

                     </div>

                  </section>

               )

            })}

            {filteredProducts.length === 0 && (

               <div className="no-products">

                  <div className="no-products-icon">📦</div>

                  <h3>No products found</h3>

                  <p>{search ? `No products match "${search}".` : 'No products are available in this category.'}</p>

                  {(search || selectedCategory !== 'All') && (

                     <button className="reset-product-filter" onClick={() => { setSearch(''); setSelectedCategory('All') }}>

                        Show All Products

                     </button>

                  )}

               </div>

            )}

         </div>
         
{/* Product Image Gallery Modal */}
{galleryProduct && (
  <div
    className="product-image-overlay"
    onClick={(e) => {
      if (e.target === e.currentTarget && !imageBusy) {
        setGalleryProduct(null)
      }
    }}
  >
    <div
      className="product-image-gallery-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-image-gallery-title"
    >
      <div className="product-image-modal-header">
        <div>
          <h2 id="product-image-gallery-title">Choose Product Image</h2>
          <p>Select an image for {galleryProduct.product_name}</p>
        </div>

        <button
          type="button"
          className="product-image-close"
          onClick={() => !imageBusy && setGalleryProduct(null)}
          aria-label="Close image gallery"
          disabled={imageBusy}
        >
          ×
        </button>
      </div>

      <div className="product-gallery-search">
        <input
          type="search"
          placeholder="Search by product name..."
          value={gallerySearch}
          onChange={(e) => {
            setGallerySearch(e.target.value)
            setAppliedGallerySearch(e.target.value)
          }}
          aria-label="Search gallery by product name"
        />
        
      </div>

      {filteredGalleryImages.length > 0 ? (
        <div className="product-image-gallery-grid">
          {filteredGalleryImages.map((image) => (
            <button
              type="button"
              className="product-gallery-image-card"
              key={image.id}
              disabled={imageBusy}
              onClick={() =>
                saveProductImage(galleryProduct, image.image_url)
              }
            >
              <img
                src={image.image_url}
                alt={image.product_name}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.opacity = '0.35'
                }}
              />

              <span>{image.product_name}</span>
              <small>{image.category || 'Other'}</small>

              {productImages[galleryProduct.id] === image.image_url && (
                <b>✓ Currently selected</b>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="product-image-empty">
          {galleryImages.length === 0
            ? 'No gallery images found. Check the Flask API and database.'
            : `No images found for "${gallerySearch}". Try another product name.`}
        </div>
      )}

      {imageBusy && (
        <p className="product-image-gallery-note">
          Saving image, please wait…
        </p>
      )}

      <p className="product-image-gallery-note">
        Your selection is saved separately for your account.
      </p>
    </div>
  </div>
)}

{/* Product Image Preview Modal */}
{previewImage && (
  <div
    className="product-image-overlay product-image-preview-overlay"
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        setPreviewImage(null)
      }
    }}
  >
    <div
      className="product-image-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Product image preview"
    >
      <button
        type="button"
        className="product-image-close"
        style={{ marginLeft: 'auto', marginBottom: '10px' }}
        onClick={() => setPreviewImage(null)}
        aria-label="Close preview"
      >
        ×
      </button>

      <img src={previewImage.url} alt={previewImage.name} />
      <h3>{previewImage.name}</h3>
    </div>
  </div>
)}


         {/* Edit Product Modal */}

         {editingProduct && (

            <div className="edit-product-overlay">

               <div className="edit-product-card">

                  <h2>

                     ✏️ Edit Product

                  </h2>

                  {/* Product Name */}

                  <div className="form-group">

                     <label>

                        Product Name

                     </label>

                     <input

                        type="text"

                        value={

                           editingProduct.product_name

                        }

                        onChange={(e) =>

                           setEditingProduct({

                              ...editingProduct,

                              product_name:

                                 e.target.value

                           })

                        }

                     />

                  </div>

                  {/* Category */}

                  <div className="form-group">

                     <label>

                        Category

                     </label>

                     <select

                        value={normalizeCategory(editingProduct.category)}

                        onChange={(e) =>

                           setEditingProduct({

                              ...editingProduct,

                              category: e.target.value

                           })

                        }

                     >

                        {CATEGORY_ORDER.map((category) => (

                           <option key={category} value={category}>

                              {CATEGORY_CONFIG[category].icon} {category}

                           </option>

                        ))}

                     </select>

                  </div>

                  {/* Quantity + Unit */}

                  <div className="form-row">

                     <div className="form-group">

                        <label>

                           Quantity

                        </label>

                        <input

                           type="number"

                           value={

                              editingProduct.quantity

                           }

                           onChange={(e) =>

                              setEditingProduct({

                                 ...editingProduct,

                                 quantity:

                                    e.target.value

                              })

                           }

                        />

                     </div>

                     <div className="form-group">

                        <label>

                           Unit

                        </label>

                        <input

                           type="text"

                           value={

                              editingProduct.unit

                           }

                           onChange={(e) =>

                              setEditingProduct({

                                 ...editingProduct,

                                 unit:

                                    e.target.value

                              })

                           }

                        />

                     </div>

                  </div>

                  {/* Price */}

                  <div className="form-group">

                     <label>

                        Price

                     </label>

                     <input

                        type="number"

                        value={

                           editingProduct.price

                        }

                        onChange={(e) =>

                           setEditingProduct({

                              ...editingProduct,

                              price:

                                 e.target.value

                           })

                        }

                     />

                  </div>

                  {/* Purchase Date */}

                  <div className="form-group">

                     <label>

                        Purchase Date

                     </label>

                     <input

                        type="date"

                        value={

                           editingProduct.purchase_date

                              ? editingProduct.purchase_date.substring(

                                    0,

                                    10

                                 )

                              : ''

                        }

                        onChange={(e) =>

                           setEditingProduct({

                              ...editingProduct,

                              purchase_date:

                                 e.target.value

                           })

                        }

                     />

                  </div>

                  {/* Buttons */}

                  <div className="edit-buttons">

                     <button

                        className="cancel-edit-button"

                        onClick={() =>

                           setEditingProduct(null)

                        }

                     >

                        Cancel

                     </button>

                     <button

                        className="save-edit-button"

                        onClick={handleUpdate}

                     >

                        💾 Save Changes

                     </button>

                  </div>

               </div>

            </div>

         )}

      </div>

   )

}

export default ProductManagement
