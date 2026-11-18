
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Html5Qrcode } from 'html5-qrcode'
import API_URL from '../api'
import './AddProduct.css'

function AddProduct({ onSave, onClose, initialBarcode = '', initialProductName = '', onProductCreated }) {
  const [productName, setProductName] = useState(initialProductName || '')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('Kg')
  const [price, setPrice] = useState('')
  // Price always means the total amount paid for the full quantity.
  const calculatedTotal = price !== '' && quantity !== '' && Number(quantity) > 0
    ? Number(price)
    : null
  const calculatedUnitPrice = price !== '' && quantity !== '' && Number(quantity) > 0
    ? Number(price) / Number(quantity)
    : null
  const [purchaseDate, setPurchaseDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [barcode, setBarcode] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [selectedGalleryImage, setSelectedGalleryImage] = useState(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryItems, setGalleryItems] = useState([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryError, setGalleryError] = useState('')
  const [gallerySearch, setGallerySearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false)

  const scannerRef = useRef(null)
  const fileInputRef = useRef(null)

  const categories = [
    'Vegetables', 'Fruits', 'Grains & Staples', 'Dairy & Eggs',
    'Cooking Essentials', 'Bakery & Breakfast',
    'Packaged & Instant Food', 'Cleaning & Household',
    'Personal Care', 'Beverages', 'Other'
  ]

  const units = ['Kg', 'Gram', 'Litre', 'Packet', 'Piece', 'Bottle']

  const emojis = {
    Vegetables: '🥬',
    Fruits: '🍎',
    'Grains & Staples': '🌾',
    'Dairy & Eggs': '🥛',
    'Cooking Essentials': '🫙',
    'Bakery & Breakfast': '🍞',
    'Packaged & Instant Food': '🥫',
    'Cleaning & Household': '🧹',
    'Personal Care': '🧴',
    Beverages: '🥤',
    Other: '📦'
  }

  useEffect(() => {
    if (initialBarcode) setBarcode(initialBarcode)
  }, [initialBarcode])

  // Allow another module (such as Meal Planner) to prefill the product name.
  useEffect(() => {
    if (initialProductName) setProductName(initialProductName)
  }, [initialProductName])

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !scanning) onClose?.()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose, scanning])

  useEffect(() => {
    if (!showSaveConfirmation && !galleryOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showSaveConfirmation, galleryOpen])

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current
      if (scanner?.isScanning) {
        scanner.stop()
          .then(() => scanner.clear())
          .catch((error) => console.error('Scanner cleanup:', error))
      }
    }
  }, [])

  const openGallery = async () => {
    setGalleryOpen(true)
    setGalleryLoading(true)
    setGalleryError('')

    try {
      const response = await fetch(`${API_URL}/product-image-gallery`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Unable to load product image gallery.')
      }
      setGalleryItems(Array.isArray(data) ? data : (data.images || data.gallery || []))
    } catch (error) {
      console.error('Load product image gallery error:', error)
      setGalleryError(error.message || 'Unable to connect to the gallery.')
    } finally {
      setGalleryLoading(false)
    }
  }

  const chooseGalleryImage = (item) => {
  // Read the product name directly from the gallery item.
  const selectedName = String(
    item?.product_name ||
    item?.productName ||
    item?.name ||
    item?.title ||
    ''
  ).trim();

  // Read the image URL directly from the gallery item.
  const selectedUrl =
    item?.image_url ||
    item?.imageUrl ||
    item?.url ||
    '';

  if (!selectedUrl) {
    alert('The selected image has no valid image URL.');
    return;
  }

  if (!selectedName) {
    console.error('Gallery item:', item);
    alert('Product name is missing from this gallery image.');
    return;
  }

  // Update the Add Product form.
  setProductName(selectedName);
  setImagePreview(selectedUrl);
  setSelectedGalleryImage(item);

  // Match the gallery category with the form categories.
  const galleryCategory = String(item?.category || '').trim();

  const matchingCategory = categories.find(
    (category) =>
      String(category).trim().toLowerCase() ===
      galleryCategory.toLowerCase()
  );

  if (matchingCategory) {
    setCategory(matchingCategory);
  }

  // Close the gallery.
  setGalleryOpen(false);
  setGallerySearch('');
};

  const stopScanner = async () => {
    const scanner = scannerRef.current
    scannerRef.current = null

    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch (error) {
        console.error('Error stopping scanner:', error)
      }
    }

    setScanning(false)
  }

  const startScanner = async () => {
    if (scanning) return
    setScanning(true)

    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))

      if (!document.getElementById('barcode-reader')) {
        throw new Error('Barcode reader is not available.')
      }

      const scanner = new Html5Qrcode('barcode-reader')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 130 } },
        async (decodedText) => {
          if (scannerRef.current !== scanner) return

          const code = decodedText.trim()
          scannerRef.current = null
          setBarcode(code)

          try {
            if (scanner.isScanning) await scanner.stop()
            scanner.clear()
          } catch (error) {
            console.warn('Scanner cleanup:', error)
          }

          setScanning(false)

          try {
            const response = await fetch(
              `${API_URL}/barcode-products/${encodeURIComponent(code)}`,
              { credentials: 'include' }
            )
            const data = await response.json()

            if (response.ok) {
              setProductName(data.product_name || '')
              setCategory(data.category || '')
              setUnit(data.unit || 'Kg')
              setPrice(data.price ?? '')
              alert('Product details filled successfully!')
            } else {
              alert('Barcode scanned. Enter the product details manually.')
            }
          } catch (error) {
            console.error('Barcode lookup failed:', error)
            alert('Could not connect to the backend.')
          }
        },
        () => {}
      )
    } catch (error) {
      console.error('Unable to start camera:', error)
      await stopScanner()
      alert(
        'Camera unavailable. Allow camera permission and use HTTPS or localhost. You can still enter details manually.'
      )
    }
  }

  const resetForm = () => {
    setProductName('')
    setCategory('')
    setQuantity('')
    setUnit('Kg')
    setPrice('')
    setPurchaseDate('')
    setExpiryDate('')
    setBarcode('')
    setImagePreview('')
    setSelectedGalleryImage(null)
    setGalleryOpen(false)
    setGallerySearch('')

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // First validate the form and show a confirmation preview.
  // No database request is made until the user confirms Save Product.
  const handleSave = (event) => {
    event.preventDefault()

    if (!productName.trim() || !category || !quantity || Number(quantity) <= 0) {
      alert('Please enter a product name, category and valid quantity.')
      return
    }

    if (price !== '' && Number(price) < 0) {
      alert('Price cannot be negative.')
      return
    }

    if (purchaseDate && expiryDate && expiryDate < purchaseDate) {
      alert('Expiry date cannot be earlier than purchase date.')
      return
    }

    setShowSaveConfirmation(true)
  }

  const cancelSaveConfirmation = () => {
    if (saving) return
    setShowSaveConfirmation(false)
  }

  // This is the only function that sends the product to the backend.
  const saveProduct = async () => {
    if (saving) return

    const product = {
      productName: productName.trim(),
      category,
      quantity,
      unit,
      price,
      purchaseQuantity: quantity,
      purchaseUnit: unit,
      totalPurchaseAmount: calculatedTotal,
      pricePerUnit: calculatedUnitPrice,
      purchaseDate,
      expiryDate,
      barcode
    }

    setSaving(true)

    try {
      const response = await fetch(`${API_URL}/products`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.message || 'Failed to add product.')
        return
      }

      // Save the selected shared-gallery image against the newly created product.
      let imageSaved = true
      const selectedImageUrl =
        selectedGalleryImage?.image_url ||
        selectedGalleryImage?.imageUrl ||
        selectedGalleryImage?.url ||
        ''

      if (selectedImageUrl && data.id) {
        try {
          const imageResponse = await fetch(`${API_URL}/products/${data.id}/image`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: selectedImageUrl })
          })
          const imageData = await imageResponse.json().catch(() => ({}))
          if (!imageResponse.ok) {
            imageSaved = false
            console.error('Product saved, but image could not be saved:', imageData)
          }
        } catch (imageError) {
          imageSaved = false
          console.error('Product saved, but image request failed:', imageError)
        }
      }

      window.dispatchEvent(new CustomEvent('productsUpdated'))
      window.dispatchEvent(new CustomEvent('purchaseUpdated'))
      window.dispatchEvent(new CustomEvent('productImagesUpdated'))

      // Notify the calling module after the product has been created successfully.
      if (typeof onProductCreated === 'function') {
        try {
          await onProductCreated(data, product)
        } catch (callbackError) {
          console.error('Product created, but follow-up refresh failed:', callbackError)
        }
      }

      if (selectedImageUrl && !imageSaved) {
        alert('Product saved successfully, but its image could not be saved. Please open Product Management and choose the image again.')
      } else {
        alert('Product added successfully!')
      }

      setShowSaveConfirmation(false)
      resetForm()
      onClose?.()
    } catch (error) {
      console.error('Error adding product:', error)
      alert('Unable to connect to the backend.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="add-product-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !scanning) {
          onClose?.()
        }
      }}
    >
      <section
        className="add-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-product-modal-title"
      >
        

        <div className="add-product-modal-grid">
          <div className="add-product-form-panel">
            <div className="modal-heading">
              <span className="modal-heading-icon">＋</span>
              <div>
                <h1 id="add-product-modal-title">Add Product</h1>
                <p>Add a household item to Home Needs</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="add-product-form">
              {/* Product image */}
              <section className="add-product-section image-upload-section" aria-labelledby="product-image-heading">
                <div className="add-product-section-title">
                  <span className="add-product-section-icon" aria-hidden="true">▧</span>
                  <h2 id="product-image-heading">Product Image <span>(Optional)</span></h2>
                </div>

                <div className="add-product-image-picker-row">
                  <button
                    type="button"
                    className={`image-upload-box ${imagePreview ? 'has-image' : ''}`}
                    onClick={openGallery}
                    aria-label="Choose product image from gallery"
                  >
                    <>
                      <span className="upload-icon" aria-hidden="true">▧</span>
                      <strong>{imagePreview ? 'Change Product Image' : 'Add Product Image'}</strong>
                      <span>(Optional)</span>
                      <small>Choose an approved image from the gallery</small>
                    </>
                  </button>

                  {imagePreview && (
                    <div className="selected-gallery-image-preview">
                      <img src={imagePreview} alt="Selected product" />
                      <button
                        type="button"
                        className="selected-image-remove"
                        onClick={() => {
                          setImagePreview('')
                          setSelectedGalleryImage(null)
                        }}
                        aria-label="Remove selected image"
                      >×</button>
                      <button type="button" className="choose-gallery-again-button" onClick={openGallery}>
                        Change image
                      </button>
                    </div>
                  )}
                </div>
                {!imagePreview && (
                  <p className="add-product-image-hint">Select an image to fill the product name and category automatically when available.</p>
                )}
              </section>

              {/* Product details */}
              <section className="add-product-section" aria-labelledby="product-details-heading">
                <div className="add-product-section-title">
                  <span className="add-product-section-icon" aria-hidden="true">▣</span>
                  <h2 id="product-details-heading">Product Details</h2>
                </div>

                <div className="add-product-fields-grid">
                  <div className="modal-field add-product-field-full">
                    <label htmlFor="add-product-name">Product Name <span className="required-mark">*</span></label>
                    <input
                      id="add-product-name"
                      type="text"
                      placeholder="Enter product name"
                      value={productName}
                      onChange={(event) => setProductName(event.target.value)}
                      required
                    />
                  </div>

                  <div className="modal-field add-product-field-full">
                    <label htmlFor="add-category">Category <span className="required-mark">*</span></label>
                    <select
                      id="add-category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      required
                    >
                      <option value="">Select category</option>
                      {categories.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>

                  <div className="modal-field">
                    <label htmlFor="add-quantity">Quantity <span className="required-mark">*</span></label>
                    <input
                      id="add-quantity"
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder="e.g., 5"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      required
                    />
                  </div>

                  <div className="modal-field">
                    <label htmlFor="add-unit">Unit <span className="required-mark">*</span></label>
                    <select
                      id="add-unit"
                      value={unit}
                      onChange={(event) => { setUnit(event.target.value); setPrice('') }}
                      required
                    >
                      {units.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Purchase information */}
              <section className="add-product-section" aria-labelledby="purchase-information-heading">
                <div className="add-product-section-title">
                  <span className="add-product-section-icon" aria-hidden="true">🛒</span>
                  <h2 id="purchase-information-heading">Purchase Information</h2>
                </div>

                <div className="add-product-fields-grid">
                  <div className="modal-field add-product-field-full">
                    <label htmlFor="add-price">Total Purchase Amount (₹)</label>
                    <input
                      id="add-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g., 150.00"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                    />
                    <small className="add-product-field-hint">Enter the total amount paid for this quantity.</small>
                  </div>

                  <div className="modal-field">
                    <label htmlFor="add-purchase-date">Purchase Date</label>
                    <input
                      id="add-purchase-date"
                      type="date"
                      value={purchaseDate}
                      onChange={(event) => setPurchaseDate(event.target.value)}
                    />
                  </div>

                  <div className="modal-field">
                    <label htmlFor="add-expiry-date">Expiry Date <span className="optional-mark">(Optional)</span></label>
                    <input
                      id="add-expiry-date"
                      type="date"
                      min={purchaseDate || undefined}
                      value={expiryDate}
                      onChange={(event) => setExpiryDate(event.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* Barcode */}
              <section className="modal-barcode-section add-product-section" aria-label="Add using barcode">
                <div className="modal-barcode-info">
                  <span className="modal-barcode-icon" aria-hidden="true">▥</span>
                  <div>
                    <strong>Add using Barcode</strong>
                    <p>Scan to find product details when available.</p>
                  </div>
                </div>

                {!scanning ? (
                  <button type="button" className="modal-scan-button" onClick={startScanner}>
                    ▦ &nbsp; Scan Barcode
                  </button>
                ) : (
                  <button type="button" className="modal-scan-button stop" onClick={stopScanner}>
                    Stop Scanner
                  </button>
                )}
              </section>

              {scanning && (
                <div className="modal-scanner-container">
                  <div id="barcode-reader" />
                  <p>Hold the barcode steady in the camera frame.</p>
                </div>
              )}

              {barcode && (
                <div className="modal-scanned-code">
                  <span>✓ Barcode</span>
                  <strong>{barcode}</strong>
                  <button type="button" onClick={() => setBarcode('')} aria-label="Remove barcode">×</button>
                </div>
              )}

              <div className="modal-actions">
                <button type="submit" className="modal-save-button" disabled={saving}>
                  {saving ? 'Saving...' : '✓  Save Product'}
                </button>
                <button type="button" className="modal-reset-button" onClick={resetForm} disabled={saving}>
                  ↻  Reset to Default
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>


      {showSaveConfirmation && createPortal(

        <div
          className="add-product-confirmation-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              cancelSaveConfirmation()
            }
          }}
        >
          <section
            className="add-product-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-product-confirmation-title"
          >
            <div className="add-product-confirmation-icon" aria-hidden="true">✓</div>
            <h2 id="add-product-confirmation-title">Confirm Product Details</h2>
            <p className="add-product-confirmation-message">
              Please check the details before saving this product.
            </p>

            <div className="add-product-confirmation-summary">
              <div>
                <span>Product</span>
                <strong>{productName.trim() || '—'}</strong>
              </div>
              <div>
                <span>Category</span>
                <strong>{category || '—'}</strong>
              </div>
              <div>
                <span>Quantity</span>
                <strong>{quantity ? `${quantity} ${unit}` : '—'}</strong>
              </div>
              <div>
                <span>Total purchase amount</span>
                <strong>
                  {calculatedTotal !== null ? `₹${calculatedTotal.toFixed(2)}` : 'Not entered'}
                </strong>
              </div>
            </div>

            <div className="add-product-confirmation-actions">
              <button
                type="button"
                className="add-product-confirmation-cancel"
                onClick={cancelSaveConfirmation}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="add-product-confirmation-save"
                onClick={saveProduct}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      {galleryOpen && createPortal(
        <div className="product-gallery-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setGalleryOpen(false)
        }}>
          <section className="product-gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="product-gallery-title">
            <div className="product-gallery-dialog-header">
              <div>
                <h2 id="product-gallery-title">Choose a product image</h2>
                <p>Select an approved image from your Home Needs gallery.</p>
              </div>
              <button type="button" className="product-gallery-close" onClick={() => setGalleryOpen(false)} aria-label="Close gallery">×</button>
            </div>

            <input
              className="product-gallery-search"
              type="search"
              placeholder="Search product or category…"
              value={gallerySearch}
              onChange={(event) => setGallerySearch(event.target.value)}
              aria-label="Search product image gallery"
            />

            {galleryLoading ? (
              <div className="product-gallery-status">Loading approved images…</div>
            ) : galleryError ? (
              <div className="product-gallery-error" role="alert">{galleryError}</div>
            ) : galleryItems.filter((item) => `${item.product_name || item.name || ''} ${item.category || ''}`.toLowerCase().includes(gallerySearch.trim().toLowerCase())).length === 0 ? (
              <div className="product-gallery-status">No matching approved images found.</div>
            ) : (
              <div className="product-gallery-grid">
                {galleryItems
                  .filter((item) => `${item.product_name || item.name || ''} ${item.category || ''}`.toLowerCase().includes(gallerySearch.trim().toLowerCase()))
                  .map((item) => (
                    <button type="button" className="product-gallery-option" key={item.id ?? item.image_url} onClick={() => chooseGalleryImage(item)}>
                      <span className="product-gallery-option-image">
                        <img src={item.image_url || item.imageUrl} alt={item.product_name || item.name || 'Product'} loading="lazy" />
                      </span>
                      <strong>{item.product_name || item.name || 'Unnamed product'}</strong>
                      <small>{item.category || 'Other'}</small>
                    </button>
                  ))}
              </div>
            )}
          </section>
        </div>,
        document.body
      )}
    </div>
  )
}

export default AddProduct
