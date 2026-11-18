import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import './BarcodeScanner.css'

import API_URL from '../api'
const RECENT_SCANS_KEY = 'home_needs_recent_barcode_scans'

function BarcodeScanner({ onAddNewProduct }) {
  const [barcode, setBarcode] = useState('')
  const [product, setProduct] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [recentScans, setRecentScans] = useState([])

  const scannerRef = useRef(null)
  const processingRef = useRef(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) || '[]')
      setRecentScans(Array.isArray(saved) ? saved : [])
    } catch (error) {
      console.error('Unable to load recent scans:', error)
    }
  }, [])

  const saveRecentScan = (item) => {
    try {
      const entry = {
        barcode: String(item.barcode || barcode).trim(),
        product_name: item.product_name || 'Unknown Product',
        category: item.category || 'Not specified',
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        scanned_at: new Date().toISOString(),
      }

      const existing = JSON.parse(
        localStorage.getItem(RECENT_SCANS_KEY) || '[]'
      )

      const filtered = Array.isArray(existing)
        ? existing.filter((scan) => scan.barcode !== entry.barcode)
        : []

      const updated = [entry, ...filtered].slice(0, 4)
      localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(updated))
      setRecentScans(updated)
    } catch (error) {
      console.error('Unable to save recent scan:', error)
    }
  }

  const searchBarcode = async (value) => {
    const cleanBarcode = value.trim()

    if (!cleanBarcode) {
      alert('Please enter a barcode number')
      return
    }

    setBarcode(cleanBarcode)
    setProduct(null)
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Unable to fetch products')
      }

      const data = await response.json()
      const products = Array.isArray(data) ? data : []

      const foundProduct = products.find(
        (item) => String(item.barcode || '').trim() === cleanBarcode
      )

      if (foundProduct) {
        setProduct(foundProduct)
        setMessage('Product found in your Home Needs inventory!')
        saveRecentScan(foundProduct)
      } else {
        setProduct(null)
        setMessage(
          'This barcode is not in your inventory. You can add it as a new product.'
        )
      }
    } catch (error) {
      console.error('Barcode search error:', error)
      setMessage('Unable to connect to the backend. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const startCamera = () => {
    setMessage('')
    setProduct(null)
    setBarcode('')
    processingRef.current = false
    setScanning(true)
  }

  useEffect(() => {
    if (!scanning) return

    let cancelled = false
    let scanner = null

    const initializeCamera = async () => {
      try {
        const element = document.getElementById('barcode-reader')

        if (!element) {
          throw new Error('Camera element with id barcode-reader not found')
        }

        scanner = new Html5Qrcode('barcode-reader')
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 150 },
            aspectRatio: 1.5,
          },
          async (decodedText) => {
            if (processingRef.current || cancelled) return

            processingRef.current = true
            const scannedBarcode = decodedText.trim()
            setBarcode(scannedBarcode)

            try {
              if (scanner.isScanning) await scanner.stop()
              scanner.clear()
            } catch (error) {
              console.error('Error stopping camera:', error)
            }

            if (cancelled) return

            scannerRef.current = null
            setScanning(false)
            await searchBarcode(scannedBarcode)
          },
          () => {
            // Normal scanning misses are ignored.
          }
        )

        if (cancelled && scanner.isScanning) {
          await scanner.stop()
          scanner.clear()
        }
      } catch (error) {
        console.error('Camera start error:', error)

        if (scanner) {
          try {
            if (scanner.isScanning) await scanner.stop()
            scanner.clear()
          } catch (cleanupError) {
            console.error('Camera cleanup error:', cleanupError)
          }
        }

        if (scannerRef.current === scanner) scannerRef.current = null

        if (!cancelled) {
          setScanning(false)
          setMessage(
            'Unable to access camera. Please allow camera permission and try again.'
          )
        }
      }
    }

    initializeCamera()

    return () => {
      cancelled = true

      if (scanner) {
        const cleanupCamera = async () => {
          try {
            if (scanner.isScanning) await scanner.stop()
            scanner.clear()
          } catch (error) {
            console.error('Camera cleanup error:', error)
          }

          if (scannerRef.current === scanner) scannerRef.current = null
        }

        cleanupCamera()
      }
    }
  }, [scanning])

  const stopCamera = async () => {
    const scanner = scannerRef.current

    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch (error) {
        console.error('Error stopping camera:', error)
      }
      scannerRef.current = null
    }

    setScanning(false)
  }

  const handleManualSearch = (event) => {
    event.preventDefault()
    searchBarcode(barcode)
  }

  const handleAddProduct = () => {
    if (!barcode.trim()) {
      alert('Please scan or enter a barcode first.')
      return
    }

    if (product) {
      alert('This product is already in your inventory.')
      return
    }

    if (onAddNewProduct) {
      onAddNewProduct(barcode.trim())
    } else {
      alert('Unable to open Add Product page.')
    }
  }

  const handleScanAnother = async () => {
    await stopCamera()
    setBarcode('')
    setProduct(null)
    setMessage('')
    processingRef.current = false
  }

  const formatScanTime = (dateValue) => {
    if (!dateValue) return ''

    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return ''

    return date.toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="barcode-scanner">
      <div className="page-title barcode-page-title">
        <div className="title-icon">📷</div>
        <div>
          <h1>Barcode Scanner</h1>
          <p>Scan a product barcode to quickly add it to Home Needs</p>
        </div>
      </div>

      <div className="scanner-layout">
        <section className="scanner-card main-scanner-card">
          <div className="section-heading">
            <div className="section-icon">📦</div>
            <div>
              <h2>Scan Product Barcode</h2>
              <p>Use your device camera to scan a product barcode</p>
            </div>
          </div>

          <div className={`camera-box ${scanning ? 'camera-active' : ''}`}>
            {scanning ? (
              <div id="barcode-reader" className="barcode-reader" />
            ) : (
              <div className="camera-placeholder">
                <div className="camera-placeholder-icon">📷</div>
                <strong>Camera Scanner</strong>
                <span>Ready to scan a product barcode</span>
              </div>
            )}
          </div>

          <p className="scanner-info">
            Position the product barcode inside the scanning frame.
          </p>

          {!scanning ? (
            <button className="primary-button camera-button" onClick={startCamera}>
              📷 Start Camera
            </button>
          ) : (
            <button className="primary-button camera-button" onClick={stopCamera}>
              ✖ Stop Camera
            </button>
          )}
        </section>

        <section className="scanner-card product-result-card">
          <div className="section-heading result-heading">
            <div className={`section-icon ${product ? 'success-icon' : ''}`}>
              {product ? '✓' : '📦'}
            </div>
            <div>
              <h2>{product ? 'Product Found' : 'Product Details'}</h2>
              <p>
                {product
                  ? 'Product details found in your Home Needs inventory'
                  : 'Scan or search a barcode to view product details'}
              </p>
            </div>
          </div>

          {product ? (
            <div className="found-product">
              <div className="found-product-top">
                <div className="product-box-icon">📦</div>
                <div className="found-product-name">
                  <h3>{product.product_name}</h3>
                  <span className="category-badge">
                    {product.category || 'Not specified'}
                  </span>
                </div>
                <span className="verified-badge">✓ Verified Product</span>
              </div>

              <div className="product-info-grid">
                <div><span>Barcode</span><strong>{product.barcode || barcode}</strong></div>
                <div><span>Quantity</span><strong>{product.quantity ?? '—'}</strong></div>
                <div><span>Unit</span><strong>{product.unit || '—'}</strong></div>
                <div><span>Price</span><strong>₹{product.price ?? '—'}</strong></div>
              </div>

              <div className="result-actions">
                <button className="success-button" disabled>
                  ✓ Already in Products
                </button>
                <button className="secondary-button" onClick={handleScanAnother}>
                  ↻ Scan Another
                </button>
              </div>
            </div>
          ) : message ? (
            <div className={`search-message ${message.startsWith('Unable') ? 'error' : ''}`}>
              <div className="message-icon">{message.startsWith('Unable') ? '⚠️' : '🔎'}</div>
              <div>
                <strong>{message.startsWith('Unable') ? 'Search Error' : 'Barcode Search'}</strong>
                <p>{message}</p>
                {barcode && <small>Barcode: {barcode}</small>}
              </div>
            </div>
          ) : (
            <div className="empty-result">
              <span>🔍</span>
              <strong>No product selected</strong>
              <p>Scan a barcode or enter one manually to see the product here.</p>
            </div>
          )}

          {!product && barcode.trim() && !loading && !message.startsWith('Unable') && (
            <div className="new-product-actions">
              <button className="success-button" onClick={handleAddProduct}>
                ＋ Add to Products
              </button>
              <button className="secondary-button" onClick={handleScanAnother}>
                ↻ Scan Another
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="manual-section scanner-card">
        <div className="section-heading">
          <div className="section-icon manual-icon">⌨️</div>
          <div>
            <h2>Enter Barcode Manually</h2>
            <p>Type the barcode number if you cannot scan it</p>
          </div>
        </div>

        <form className="barcode-input" onSubmit={handleManualSearch}>
          <input
            type="text"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="Example: 8901234567890"
            inputMode="numeric"
          />
          <button type="submit" className="manual-search-button" disabled={loading}>
            {loading ? 'Searching...' : '🔍 Search Barcode'}
          </button>
        </form>
      </section>

      <section className="recent-section scanner-card">
        <div className="section-heading recent-heading">
          <div className="section-icon recent-icon">🕘</div>
          <div>
            <h2>Recent Scans</h2>
            <p>Your recently scanned products</p>
          </div>
          {recentScans.length > 0 && <span className="recent-count">{recentScans.length}</span>}
        </div>

        {recentScans.length > 0 ? (
          <div className="recent-grid">
            {recentScans.map((scan) => (
              <button
                type="button"
                className="recent-card"
                key={`${scan.barcode}-${scan.scanned_at}`}
                onClick={() => searchBarcode(scan.barcode)}
              >
                <div className="recent-product-icon">📦</div>
                <div className="recent-product-info">
                  <strong>{scan.product_name}</strong>
                  <span>{scan.barcode}</span>
                  <small>{formatScanTime(scan.scanned_at)}</small>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <span>🕘</span>
            <p>No recent scans yet. Your scanned products will appear here.</p>
          </div>
        )}
      </section>
    </div>
  )
}

export default BarcodeScanner
