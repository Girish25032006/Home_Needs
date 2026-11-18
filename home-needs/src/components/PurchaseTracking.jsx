import { useEffect, useMemo, useState } from 'react'

import { Html5Qrcode } from 'html5-qrcode'

import './PurchaseTracking.css'

import API_URL from '../api'

function PurchaseTracking({

  selectedProduct,

  onPurchaseSaved

}) {

  const [productName, setProductName] = useState('')

  const [quantity, setQuantity] = useState('')

  const [unit, setUnit] = useState('Kg')

  const [amountPaid, setAmountPaid] = useState('')

  const [purchaseDate, setPurchaseDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [expiredStockModal, setExpiredStockModal] = useState(null)

  // Regular purchases teach the recurring pattern; additional purchases only add stock.

  const [purchaseType, setPurchaseType] = useState('regular')

  const [purchases, setPurchases] = useState([])

  // Product suggestions are sourced from Product Management.

  const [availableProducts, setAvailableProducts] = useState([])

  const [loading, setLoading] = useState(false)

  const [scannerOpen, setScannerOpen] = useState(false)

  const [barcode, setBarcode] = useState('')

  const [barcodeMessage, setBarcodeMessage] = useState('')

  const [barcodeLookupLoading, setBarcodeLookupLoading] = useState(false)

  const currentDate = new Date()

  const currentYear = currentDate.getFullYear()

  const currentMonth = currentDate.getMonth()

  const [selectedYear, setSelectedYear] =

    useState(currentYear)

  const [selectedMonth, setSelectedMonth] =

    useState(null)

  const months = [

    'January',

    'February',

    'March',

    'April',

    'May',

    'June',

    'July',

    'August',

    'September',

    'October',

    'November',

    'December'

  ]

  // Barcode lookup uses the logged-in user's saved products.

  const lookupBarcode = async (scannedBarcode) => {

    const code = String(scannedBarcode || '').trim()

    if (!code) return

    setBarcode(code)

    setBarcodeLookupLoading(true)

    setBarcodeMessage('Checking this barcode...')

    try {

      const response = await fetch(

        `${API_URL}/barcode-products/${encodeURIComponent(code)}`,

        { credentials: 'include' }

      )

      const data = await response.json().catch(() => ({}))

      if (response.ok && data && (data.product || data.product_name || data.productName || data.name)) {

        const product = data.product || data

        setProductName(product.product_name || product.productName || product.name || '')

        if (product.unit) setUnit(product.unit)

        setBarcodeMessage('Product found. Check the details and enter your purchase information.')

      } else if (response.status === 404) {

        setProductName('')

        setBarcodeMessage('Product not found in your saved products. Enter the product name manually to continue.')

      } else if (response.status === 401) {

        setBarcodeMessage('Your session has expired. Please log in again and scan the barcode.')

      } else {

        setBarcodeMessage(data.message || 'Could not look up this barcode. You can enter product details manually.')

      }

    } catch (error) {

      console.error('Barcode lookup error:', error)

      setBarcodeMessage('Could not connect to the server. You can enter product details manually.')

    } finally {

      setBarcodeLookupLoading(false)

    }

  }

  useEffect(() => {

    if (!scannerOpen) return undefined

    let scanner = null

    let cancelled = false

    let scannerStarted = false

    const safelyStopAndClear = async () => {

      if (!scanner) return

      try {

        if (scannerStarted && scanner.isScanning) {

          await scanner.stop()

        }

      } catch (error) {

        console.warn('Barcode scanner stop cleanup:', error)

      }

      try {

        scanner.clear()

      } catch (error) {

        console.warn('Barcode scanner clear cleanup:', error)

      }

      scannerStarted = false

    }

    const startScanner = async () => {

      try {

        scanner = new Html5Qrcode('purchase-barcode-reader')

        await scanner.start(

          { facingMode: 'environment' },

          { fps: 10, qrbox: { width: 250, height: 150 } },

          async (decodedText) => {

            if (cancelled) return

            cancelled = true

            await safelyStopAndClear()

            setScannerOpen(false)

            await lookupBarcode(decodedText)

          },

          () => {}

        )

        scannerStarted = true

      } catch (error) {

        console.error('Unable to start barcode scanner:', error)

        const message = String(error?.message || error || '').toLowerCase()

        if (

          message.includes('secure') ||

          message.includes('not supported') ||

          message.includes('camera')

        ) {

          setBarcodeMessage(

            'Camera access is blocked by this browser or connection. Open Home Needs using localhost on this computer, or use HTTPS for the network address. You can still enter the barcode manually.'

          )

        } else {

          setBarcodeMessage(

            'Camera could not start. Check camera permission or enter the barcode manually.'

          )

        }

        setScannerOpen(false)

        await safelyStopAndClear()

      }

    }

    startScanner()

    return () => {

      cancelled = true

      void safelyStopAndClear()

    }

  }, [scannerOpen])

// -----------------------------------

  // FETCH PRODUCTS FROM PRODUCT MANAGEMENT

  const fetchAvailableProducts = async () => {

    try {

      const response = await fetch(`${API_URL}/`, { credentials: 'include' })

      if (!response.ok) throw new Error('Failed to fetch Product Management products')

      const data = await response.json()

      setAvailableProducts(Array.isArray(data) ? data : [])

    } catch (error) {

      console.error('Error fetching Product Management products:', error)

      setAvailableProducts([])

    }

  }

  useEffect(() => {

    fetchAvailableProducts()

    const refreshProducts = () => fetchAvailableProducts()

    window.addEventListener('productsUpdated', refreshProducts)

    return () => window.removeEventListener('productsUpdated', refreshProducts)

  }, [])

  // FETCH PURCHASE HISTORY

  // -----------------------------------

  const fetchPurchases = async () => {

    try {

      const response = await fetch(

        `${API_URL}/purchases`,

        {

          credentials: 'include'

        }

      )

      if (!response.ok) {

        throw new Error(

          'Failed to fetch purchases'

        )

      }

      const data = await response.json()

      setPurchases(

        Array.isArray(data) ? data : []

      )

    } catch (error) {

      console.error(

        'Error fetching purchases:',

        error

      )

      setPurchases([])

    }

  }

  useEffect(() => {

    fetchPurchases()

  }, [])

  // -----------------------------------

  // FILL PRODUCT DETAILS

  // FROM SHOPPING LIST

  // -----------------------------------

  useEffect(() => {

    if (selectedProduct) {

      setProductName(

        selectedProduct.product_name ||

        selectedProduct.productName ||

        ''

      )

      setUnit(

        selectedProduct.unit || 'Kg'

      )

      setQuantity(

        selectedProduct.required_quantity

          ? String(

              selectedProduct.required_quantity

            )

          : ''

      )

      setAmountPaid('')

      setPurchaseDate('')
      setExpiryDate('')
      setExpiredStockModal(null)

      setBarcode('')

      setBarcodeMessage('')

    }

  }, [selectedProduct])

  // -----------------------------------

  // AVAILABLE YEARS

  // Current year is always available.

  // Older years appear if purchase data

  // exists for those years.

  // Future years are not shown.

  // -----------------------------------

  const availableYears = useMemo(() => {

    const years = new Set()

    years.add(currentYear)

    purchases.forEach((purchase) => {

      const parts = getDateParts(

        purchase.purchase_date

      )

      if (

        parts.year &&

        parts.year <= currentYear

      ) {

        years.add(parts.year)

      }

    })

    return Array.from(years).sort(

      (a, b) => b - a

    )

  }, [purchases, currentYear])

  // -----------------------------------

  // MONTHS FOR SELECTED YEAR

  //

  // Past year  -> all 12 months

  // Current year -> only months up to

  // the current month

  // -----------------------------------

  const visibleMonths = useMemo(() => {

    const lastMonth =

      selectedYear === currentYear

        ? currentMonth

        : 11

    return months

      .map((monthName, monthIndex) => ({

        monthName,

        monthIndex

      }))

      .filter(

        (month) =>

          month.monthIndex <= lastMonth

      )

  }, [

    selectedYear,

    currentYear,

    currentMonth

  ])

  // -----------------------------------

  // MONTH DATA

  // -----------------------------------

  const monthlyData = useMemo(() => {

    return visibleMonths.map(

      ({ monthName, monthIndex }) => {

        const monthPurchases =

          purchases.filter((purchase) => {

            const parts = getDateParts(

              purchase.purchase_date

            )

            return (

              parts.year === selectedYear &&

              parts.month === monthIndex

            )

          })

        const totalAmount =

          monthPurchases.reduce(

            (total, purchase) =>

              total +

              Number(

                purchase.total_price || 0

              ),

            0

          )

        return {

          monthName,

          monthIndex,

          purchases: monthPurchases,

          purchaseCount:

            monthPurchases.length,

          totalAmount

        }

      }

    )

  }, [

    purchases,

    selectedYear,

    visibleMonths

  ])

  const selectedMonthData =

    selectedMonth === null

      ? null

      : monthlyData.find(

          (month) =>

            month.monthIndex === selectedMonth

        )

  // Suggestions come only from the Product Management catalogue.

  const productSuggestions = useMemo(() => {

    const uniqueProducts = new Map()

    availableProducts.forEach((product) => {

      const name = String(product.product_name || product.productName || product.name || '').trim()

      if (name) {

        uniqueProducts.set(name.toLowerCase(), {

          id: product.id,

          name,

          unit: product.unit || 'Kg'

        })

      }

    })

    return Array.from(uniqueProducts.values()).sort((a, b) => a.name.localeCompare(b.name))

  }, [availableProducts])

  const handleProductNameChange = (value) => {

    setProductName(value)

    const selected = productSuggestions.find(

      (product) => product.name.toLowerCase() === value.trim().toLowerCase()

    )

    if (selected) setUnit(selected.unit)

  }

  // SAVE PURCHASE

  // -----------------------------------

  const handleSave = async (confirmDiscardExpired = false) => {

    if (

      !productName.trim() ||

      !quantity ||

      amountPaid === '' ||

      !purchaseDate

    ) {

      alert(

        'Please fill all purchase details'

      )

      return

    }

    if (

      !Number.isFinite(

        Number(quantity)

      ) ||

      Number(quantity) <= 0 ||

      !Number.isFinite(

        Number(amountPaid)

      ) ||

      Number(amountPaid) < 0

    ) {

      alert(

        'Enter a valid quantity and amount'

      )

      return

    }

    setLoading(true)

    const purchase = {

      productName:

        productName.trim(),

      quantity:

        Number(quantity),

      unit,

      amountPaid:

        Number(amountPaid),

      purchaseDate,

      // Expiry date is optional; send null when the field is left blank.
      expiryDate: expiryDate || null,

      // The second request must tell Flask that the user confirmed discard.
      confirm_discard_expired: confirmDiscardExpired,

      purchase_type: purchaseType,

      barcode: barcode.trim() || null

    }

    try {

      const response =

        await fetch(

          `${API_URL}/purchases`,

          {

            method: 'POST',

            credentials: 'include',

            headers: {

              'Content-Type':

                'application/json'

            },

            body:

              JSON.stringify(purchase)

          }

        )

      const data =

        await response.json()

      if (
        response.status === 409 &&
        data.code === 'EXPIRED_STOCK_CONFIRMATION_REQUIRED'
      ) {
        setExpiredStockModal(data)
        return
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save purchase')
      }

      setExpiredStockModal(null)

      await fetchPurchases()

      window.dispatchEvent(

        new Event('productsUpdated')

      )

      window.dispatchEvent(

        new Event('purchaseUpdated')

      )

      window.dispatchEvent(

        new Event('aiPredictionsUpdated')

      )

      if (

        selectedProduct &&

        onPurchaseSaved

      ) {

        try {

          await onPurchaseSaved(

            selectedProduct

          )

        } catch (callbackError) {

          console.error(

            'Shopping List update error:',

            callbackError

          )

        }

      }

      alert(

        'Purchase saved successfully! Product stock has been updated.'

      )

      setProductName('')

      setQuantity('')

      setUnit('Kg')

      setAmountPaid('')

      setPurchaseDate('')
      setExpiryDate('')

      setPurchaseType('regular')

    } catch (error) {

      console.error(

        'Error saving purchase:',

        error

      )

      alert(

        error.message ||

        'Unable to connect to backend'

      )

    } finally {

      setLoading(false)

    }

  }

  // -----------------------------------

  // FORMAT DATE

  // -----------------------------------

  const formatDate = (date) => {

    const parts = getDateParts(date)

    if (!parts.year) {

      return date || ''

    }

    return new Date(

      parts.year,

      parts.month,

      parts.day

    ).toLocaleDateString(

      'en-IN',

      {

        day: 'numeric',

        month: 'long',

        year: 'numeric'

      }

    )

  }

  // -----------------------------------

  // PDF BUTTON

  //

  // Groups same product + same unit.

  //

  // Example:

  // Rice 25 Kg on Oct 2

  // Rice 5 Kg on Oct 28

  // becomes:

  // Rice = 30 Kg

  // -----------------------------------

  const handleDownloadPDF = (

    monthData

  ) => {

    if (

      !monthData ||

      monthData.purchases.length === 0

    ) {

      alert(

        `No purchases available for ${monthData?.monthName || 'this month'}.`

      )

      return

    }

    createPurchasePDF(

      monthData.monthName,

      selectedYear,

      monthData.purchases

    )

  }

  return (

    <div className="purchase-tracking">
      {expiredStockModal && (
        <div className="expired-purchase-overlay" role="presentation">
          <div className="expired-purchase-modal" role="dialog" aria-modal="true" aria-labelledby="expired-purchase-title">
            <div className="expired-purchase-icon">⚠️</div>
            <h2 id="expired-purchase-title">Expired Stock Found</h2>
            <p><strong>{expiredStockModal.product_name}</strong> has{' '}
              {Number(expiredStockModal.quantity).toLocaleString('en-IN')} {expiredStockModal.unit} remaining.</p>
            <p className="expired-purchase-date">Expiry date: {expiredStockModal.expiry_date}</p>
            <p>Discard this expired stock before adding the new purchase? The discarded quantity will be recorded in Expiry Tracking history, and your new purchase will be added as fresh stock.</p>
            <div className="expired-purchase-actions">
              <button type="button" className="expired-purchase-cancel"
                onClick={() => setExpiredStockModal(null)} disabled={loading}>Cancel</button>
              <button type="button" className="expired-purchase-confirm"
                onClick={() => handleSave(true)} disabled={loading}>
                {loading ? 'Processing...' : 'Discard & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-title">

        <h1>

          🧾 Purchase Tracking

        </h1>

        <p>

          Keep track of your household purchases

        </p>

      </div>

      <div className="purchase-form">

      <div className="purchase-barcode-section">

        <div className="purchase-barcode-copy">

          <strong>Quick add with barcode</strong>

          <span>Scan a product package to look for it in your saved products.</span>

        </div>

        <button

          type="button"

          className="purchase-scan-button"

          onClick={() => {

            setBarcodeMessage('')

            setScannerOpen((open) => !open)

          }}

        >

          {scannerOpen ? '✕ Close Scanner' : '▦ Scan Barcode'}

        </button>

      </div>

      {scannerOpen && (

        <div className="purchase-scanner-panel">

          <div id="purchase-barcode-reader" />

          <p>Point your camera at the product barcode.</p>

        </div>

      )}

      <div className="purchase-barcode-manual">

        <label htmlFor="purchase-barcode-input">Barcode number (optional)</label>

        <div className="purchase-barcode-input-row">

          <input

            id="purchase-barcode-input"

            type="text"

            inputMode="numeric"

            placeholder="Scan or enter barcode number"

            value={barcode}

            onChange={(event) => setBarcode(event.target.value)}

          />

          <button

            type="button"

            className="purchase-lookup-button"

            disabled={!barcode.trim() || barcodeLookupLoading}

            onClick={() => lookupBarcode(barcode)}

          >

            {barcodeLookupLoading ? 'Checking…' : 'Find Product'}

          </button>

        </div>

        {barcodeMessage && (

          <p className={`purchase-barcode-message ${

            barcodeMessage.toLowerCase().includes('not found') ||

            barcodeMessage.toLowerCase().includes('could not')

              ? 'is-warning'

              : 'is-info'

          }`} role="status">

            {barcodeMessage}

          </p>

        )}

      </div>

<div className="form-group">

          <label>

            Product Name

          </label>

          <input

            type="text"

            list="purchase-product-suggestions"

            autoComplete="off"

            placeholder="Search or enter product name"

            value={productName}

            onChange={(e) => handleProductNameChange(e.target.value)}

          />

          <datalist id="purchase-product-suggestions">

            {productSuggestions.map((product) => (

              <option key={product.id ?? product.name} value={product.name} />

            ))}

          </datalist>

        </div>

        <div className="form-row">

          <div className="form-group">

            <label>

              Quantity

            </label>

            <input

              type="number"

              min="0.01"

              step="any"

              placeholder="Example: 5"

              value={quantity}

              onChange={(e) =>

                setQuantity(

                  e.target.value

                )

              }

            />

          </div>

          <div className="form-group">

            <label>

              Unit

            </label>

            <select

              value={unit}

              onChange={(e) =>

                setUnit(

                  e.target.value

                )

              }

            >

              <option>Kg</option>

              <option>Gram</option>

              <option>Litre</option>

              <option>Packet</option>

              <option>Piece</option>

              <option>Bottle</option>

            </select>

          </div>

        </div>

        <div className="form-row">

          <div className="form-group">

            <label>

              Amount Paid (₹)

            </label>

            <input

              type="number"

              min="0"

              step="any"

              placeholder="Example: 300"

              value={amountPaid}

              onChange={(e) =>

                setAmountPaid(

                  e.target.value

                )

              }

            />

          </div>

          <div className="form-group">

            <label>

              Purchase Date

            </label>

            <input

              type="date"

              value={purchaseDate}

              onChange={(e) =>

                setPurchaseDate(

                  e.target.value

                )

              }

            />

          </div>
          <div className="form-group  expiry-date-group" >
            <label>
              Expiry Date <span className="optional-field-label">(Optional)</span>
            </label>
            <input
              type="date"
              value={expiryDate}
              min={purchaseDate || undefined}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            
          </div>

        </div>

        <div className="form-group purchase-type-group">

          <label>Purchase Type</label>

          <div

            className="purchase-type-options"

            role="radiogroup"

            aria-label="Purchase type"

            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}

          >

            <label

              className={`purchase-type-option ${purchaseType === 'regular' ? 'selected' : ''}`}

              style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '13px', border: purchaseType === 'regular' ? '1.5px solid #15945b' : '1px solid #d9e7dc', borderRadius: '12px', background: purchaseType === 'regular' ? '#effaf2' : '#fff', cursor: 'pointer' }}

            >

              <input

                type="radio"

                name="purchaseType"

                value="regular"

                checked={purchaseType === 'regular'}

                onChange={() => setPurchaseType('regular')}

              />

              <span className="purchase-type-option-content">

                <strong>Regular Purchase</strong>

                <small>Helps AI learn your normal buying pattern.</small>

              </span>

            </label>

            <label

              className={`purchase-type-option ${purchaseType === 'additional' ? 'selected' : ''}`}

              style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '13px', border: purchaseType === 'additional' ? '1.5px solid #e99a32' : '1px solid #d9e7dc', borderRadius: '12px', background: purchaseType === 'additional' ? '#fff8eb' : '#fff', cursor: 'pointer' }}

            >

              <input

                type="radio"

                name="purchaseType"

                value="additional"

                checked={purchaseType === 'additional'}

                onChange={() => setPurchaseType('additional')}

              />

              <span className="purchase-type-option-content">

                <strong>Additional Purchase</strong>

                <small>Adds extra stock without learning a new regular interval.</small>

              </span>

            </label>

          </div>

        </div>

        <button
          className="purchase-save-button"
          onClick={() => handleSave(false)}
          disabled={loading}
        >

          {loading

            ? 'Saving...'

            : '💾 Save Purchase'}

        </button>

      </div>

      <div className="purchase-period-header">

        <div>

          <h2>

            📅 Purchase Overview

          </h2>

          <p>

            Select a year to view monthly purchases

          </p>

        </div>

        <div className="year-selector">

          <label>

            Year

          </label>

          <select

            value={selectedYear}

            onChange={(e) => {

              setSelectedYear(

                Number(e.target.value)

              )

              setSelectedMonth(null)

            }}

          >

            {availableYears.map(

              (year) => (

                <option

                  key={year}

                  value={year}

                >

                  {year}

                </option>

              )

            )}

          </select>

        </div>

      </div>

      {selectedMonth === null ? (

        <div className="month-grid">

          {monthlyData.map(

            (month) => (

              <div

                className={`month-card ${

                  month.purchaseCount === 0

                    ? 'empty'

                    : ''

                }`}

                key={month.monthIndex}

              >

                <button

                  type="button"

                  className="month-card-main"

                  onClick={() =>

                    setSelectedMonth(

                      month.monthIndex

                    )

                  }

                  aria-label={`View ${month.monthName} ${selectedYear} purchases`}

                >

                  <div className="month-card-top">

                    <div className="month-icon">

                      🛒

                    </div>

                    <span>

                      {month.purchaseCount === 0

                        ? 'No Purchases'

                        : `${month.purchaseCount} ${

                            month.purchaseCount === 1

                              ? 'Purchase'

                              : 'Purchases'

                          }`}

                    </span>

                  </div>

                  <h3>

                    {month.monthName}

                  </h3>

                  <div className="month-card-details">

                    <div>

                      <small>

                        Total Spent

                      </small>

                      <strong>

                        ₹

                        {month.totalAmount.toFixed(

                          2

                        )}

                      </strong>

                    </div>

                    <div>

                      <small>

                        Items

                      </small>

                      <strong>

                        {month.purchaseCount}

                      </strong>

                    </div>

                  </div>

                </button>

                <div className="month-card-actions">

                  <button

                    type="button"

                    className="view-month-button"

                    onClick={() =>

                      setSelectedMonth(

                        month.monthIndex

                      )

                    }

                  >

                    View Purchases

                    <span>→</span>

                  </button>

                  <button

                    type="button"

                    className="pdf-button"

                    disabled={

                      month.purchaseCount === 0

                    }

                    onClick={(event) => {

                      event.stopPropagation()

                      handleDownloadPDF(

                        month

                      )

                    }}

                    title={

                      month.purchaseCount === 0

                        ? 'No purchases to download'

                        : `Download ${month.monthName} PDF`

                    }

                  >

                    📄 PDF

                  </button>

                </div>

              </div>

            )

          )}

        </div>

      ) : (

        /* MONTH DETAILS */

        <div className="month-details">

          <button

            type="button"

            className="back-to-months"

            onClick={() =>

              setSelectedMonth(null)

            }

          >

            ← Back to {selectedYear}

          </button>

          <div className="month-detail-header">

            <div className="month-detail-title">

              <span className="detail-icon">

                🛒

              </span>

              <div>

                <h2>

                  {selectedMonthData?.monthName}{' '}

                  {selectedYear}

                </h2>

                <p>

                  Purchases made during this month

                </p>

              </div>

            </div>

            <div className="month-summary">

              <div>

                <span>

                  Purchase Records

                </span>

                <strong>

                  {selectedMonthData?.purchaseCount || 0}

                </strong>

              </div>

              <div>

                <span>Total Quantity</span>

                <strong>

                  {formatQuantity(

                    selectedMonthData?.purchases.reduce(

                      (total, purchase) => total + Number(purchase.quantity || 0),

                      0

                    ) || 0

                  )}

                </strong>

              </div>

              <div>

                <span>

                  Total Spent

                </span>

                <strong>

                  ₹

                  {(

                    selectedMonthData?.totalAmount || 0

                  ).toFixed(2)}

                </strong>

              </div>

            </div>

          </div>

          {selectedMonthData?.purchases.length > 0 && (

            <button

              type="button"

              className="month-detail-pdf-button"

              onClick={() =>

                handleDownloadPDF(

                  selectedMonthData

                )

              }

            >

              📄 Download {selectedMonthData.monthName}{' '}

              {selectedYear} Purchase PDF

            </button>

          )}

          {selectedMonthData?.purchases.length === 0 ? (

            <div className="no-month-purchases">

              <div>

                🛒

              </div>

              <h3>

                No purchases in{' '}

                {selectedMonthData?.monthName}

              </h3>

              <p>

                No purchase records were found for this month.

              </p>

            </div>

          ) : (

            <div className="month-purchase-list">

              {selectedMonthData.purchases.map(

                (purchase) => (

                  <div

                    className="month-purchase-card"

                    key={purchase.id}

                  >

                    <div className="purchase-product-icon">

                      🛒

                    </div>

                    <div className="month-purchase-info">

                      <h3>

                        {purchase.product_name}

                      </h3>

                      <p>

                        {purchase.quantity}{' '}

                        {purchase.unit}

                        {' • '}

                        {formatDate(

                          purchase.purchase_date

                        )}

                      </p>

                    </div>

                    <div className="month-purchase-amount">

                      <span>

                        Amount Paid

                      </span>

                      <strong>

                        ₹

                        {Number(

                          purchase.total_price || 0

                        ).toFixed(2)}

                      </strong>

                    </div>

                  </div>

                )

              )}

            </div>

          )}

        </div>

      )}

    </div>

  )

}

// -----------------------------------

// DATE HELPER

// Handles YYYY-MM-DD without timezone

// shifting.

// -----------------------------------

function getDateParts(date) {

  if (!date) {

    return {

      year: null,

      month: null,

      day: null

    }

  }

  const value =

    String(date).split('T')[0]

  const parts =

    value.split('-')

  if (parts.length >= 3) {

    const year =

      Number(parts[0])

    const month =

      Number(parts[1]) - 1

    const day =

      Number(parts[2])

    if (

      Number.isFinite(year) &&

      Number.isFinite(month) &&

      Number.isFinite(day)

    ) {

      return {

        year,

        month,

        day

      }

    }

  }

  const parsed =

    new Date(date)

  if (

    Number.isNaN(

      parsed.getTime()

    )

  ) {

    return {

      year: null,

      month: null,

      day: null

    }

  }

  return {

    year: parsed.getFullYear(),

    month: parsed.getMonth(),

    day: parsed.getDate()

  }

}

// -----------------------------------

// PDF GENERATOR

// No npm package is required.

//

// Creates a simple valid PDF directly

// in the browser and downloads it.

// -----------------------------------

function createPurchasePDF(

  monthName,

  year,

  monthPurchases

) {

  const groupedProducts =

    groupPurchases(

      monthPurchases

    )

  const totalSpent =

    monthPurchases.reduce(

      (total, purchase) =>

        total +

        Number(

          purchase.total_price || 0

        ),

      0

    )

  const lines = []

  lines.push(

    'HOME NEEDS'

  )

  lines.push(

    `${monthName} ${year} - PURCHASE REPORT`

  )

  lines.push(

    ''

  )

  lines.push(

    `Purchase Records: ${monthPurchases.length}`

  )

  lines.push(

    `Total Spent: Rs. ${totalSpent.toFixed(2)}`

  )

  lines.push(

    ''

  )

  lines.push(

    'PRODUCT SUMMARY'

  )

  lines.push(

    '----------------------------------------------'

  )

  lines.push(

    'Product                    Quantity    Amount'

  )

  lines.push(

    '----------------------------------------------'

  )

  groupedProducts.forEach(

    (product) => {

      lines.push(

        fitText(

          product.productName,

          24

        ) +

        padLeft(

          formatQuantity(

            product.totalQuantity

          ) +

          ' ' +

          product.unit,

          12

        ) +

        padLeft(

          `Rs.${product.totalAmount.toFixed(2)}`,

          14

        )

      )

    }

  )

  lines.push(

    '----------------------------------------------'

  )

  lines.push(

    ''

  )

  lines.push(

    'PURCHASE DETAILS'

  )

  lines.push(

    '----------------------------------------------'

  )

  lines.push(

    'Date         Product             Qty      Amount'

  )

  lines.push(

    '----------------------------------------------'

  )

  monthPurchases.forEach(

    (purchase) => {

      const parts =

        getDateParts(

          purchase.purchase_date

        )

      const dateText =

        parts.year

          ? `${String(parts.day).padStart(2, '0')}/${String(parts.month + 1).padStart(2, '0')}/${parts.year}`

          : '-'

      lines.push(

        `${dateText}   ` +

        `${fitText(purchase.product_name || 'Product', 18)} ` +

        `${padLeft(formatQuantity(Number(purchase.quantity || 0)) + ' ' + (purchase.unit || ''), 9)} ` +

        `${padLeft('Rs.' + Number(purchase.total_price || 0).toFixed(2), 11)}`

      )

    }

  )

  lines.push(

    '----------------------------------------------'

  )

  lines.push(

    ''

  )

  lines.push(

    'Generated by Home Needs'

  )

  const pdfBytes =

    buildSimplePDF(lines)

  const blob =

    new Blob(

      [pdfBytes],

      {

        type: 'application/pdf'

      }

    )

  const url =

    URL.createObjectURL(blob)

  const link =

    document.createElement('a')

  link.href = url

  link.download =

    `Home_Needs_${monthName}_${year}.pdf`

  document.body.appendChild(link)

  link.click()

  link.remove()

  setTimeout(

    () => URL.revokeObjectURL(url),

    1000

  )

}

// -----------------------------------

// GROUP SAME PRODUCT + SAME UNIT

// -----------------------------------

function groupPurchases(

  purchases

) {

  const grouped = new Map()

  purchases.forEach(

    (purchase) => {

      const productName =

        String(

          purchase.product_name ||

          'Unknown Product'

        ).trim()

      const unit =

        String(

          purchase.unit ||

          ''

        ).trim()

      const key =

        `${productName.toLowerCase()}_${unit.toLowerCase()}`

      const quantity =

        Number(

          purchase.quantity || 0

        )

      const amount =

        Number(

          purchase.total_price || 0

        )

      if (!grouped.has(key)) {

        grouped.set(

          key,

          {

            productName,

            unit,

            totalQuantity:

              quantity,

            totalAmount:

              amount

          }

        )

      } else {

        const item =

          grouped.get(key)

        item.totalQuantity +=

          quantity

        item.totalAmount +=

          amount

      }

    }

  )

  return Array.from(

    grouped.values()

  ).sort(

    (a, b) =>

      a.productName.localeCompare(

        b.productName

      )

  )

}

// -----------------------------------

// SIMPLE PDF WRITER

// -----------------------------------

function buildSimplePDF(lines) {

  const pageWidth = 595

  const pageHeight = 842

  const marginLeft = 40

  const startY = 800

  const lineHeight = 15

  const maxLinesPerPage = 49

  const pages = []

  for (

    let i = 0;

    i < lines.length;

    i += maxLinesPerPage

  ) {

    pages.push(

      lines.slice(

        i,

        i + maxLinesPerPage

      )

    )

  }

  if (pages.length === 0) {

    pages.push([])

  }

  const objects = []

  objects.push(

    '<< /Type /Catalog /Pages 2 0 R >>'

  )

  const pageObjectNumber =

    3

  const fontObjectNumber =

    pageObjectNumber +

    pages.length

 const pageReferences = pages

  .map((_, index) => `${pageObjectNumber + index} 0 R`)

  .join(' ');

  objects.push(

    `<< /Type /Pages /Kids [${pageReferences}] /Count ${pages.length} >>`

  )

  pages.forEach(

    (pageLines, pageIndex) => {

      const contentObjectNumber =

        pageObjectNumber +

        pages.length +

        1 +

        pageIndex

      const pageNumber =

        pageObjectNumber +

        pageIndex

      let stream =

        'BT\n'

      stream +=

        '/F1 10 Tf\n'

      stream +=

        `${marginLeft} ${startY} Td\n`

      pageLines.forEach(

        (line, index) => {

          const safeLine =

            escapePDFText(

              line

            )

          if (index > 0) {

            stream +=

              `0 -${lineHeight} Td\n`

          }

          stream +=

            `(${safeLine}) Tj\n`

        }

      )

      stream +=

        'ET'

      objects[contentObjectNumber - 1] =

        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`

      objects[pageNumber - 1] =

        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`

    }

  )

  objects[fontObjectNumber - 1] =

    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  let pdf =

    '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'

  const offsets = [0]

  objects.forEach(

    (object, index) => {

      offsets.push(

        pdf.length

      )

      pdf +=

        `${index + 1} 0 obj\n`

      pdf +=

        `${object}\n`

      pdf +=

        'endobj\n'

    }

  )

  const xrefPosition =

    pdf.length

  pdf +=

    `xref\n0 ${objects.length + 1}\n`

  pdf +=

    '0000000000 65535 f \n'

  for (

    let i = 1;

    i <= objects.length;

    i++

  ) {

    pdf +=

      `${String(offsets[i]).padStart(10, '0')} 00000 n \n`

  }

  pdf +=

    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`

  pdf +=

    `startxref\n${xrefPosition}\n%%EOF`

  return new TextEncoder().encode(

    pdf

  )

}

// -----------------------------------

// PDF TEXT HELPERS

// -----------------------------------

function escapePDFText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?')
}

function fitText(

  text,

  length

) {

  const value =

    String(text || '')

  if (value.length <= length) {

    return value.padEnd(

      length,

      ' '

    )

  }

  return (

    value.slice(

      0,

      length - 3

    ) +

    '...'

  )

}

function padLeft(

  text,

  length

) {

  return String(text)

    .padStart(

      length,

      ' '

    )

}

function formatQuantity(quantity) {

  const number = Number(quantity || 0)

  if (Number.isInteger(number)) return String(number)

  return number.toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')

}

export default PurchaseTracking
