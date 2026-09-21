import { useState } from 'react'
import './BarcodeScanner.css'

function BarcodeScanner() {
  const [barcode, setBarcode] = useState('')
  const [scanned, setScanned] = useState(false)

  const handleScan = () => {
    if (barcode.trim() === '') {
      alert('Please enter a barcode number')
      return
    }

    setScanned(true)
  }

  return (
    <div className="barcode-scanner">

      <div className="page-title">
        <h1>📷 Barcode Scanner</h1>
        <p>Scan a product barcode to quickly add it to Home Needs</p>
      </div>

      <div className="scanner-card">

        <div className="camera-box">
          <div className="scan-frame">
            <span>📷</span>
            <p>Camera Scanner</p>
          </div>
        </div>

        <p className="scanner-info">
          Position the product barcode inside the scanning area.
        </p>

        <button className="start-scan-button">
          📷 Start Camera
        </button>

      </div>


      <div className="manual-section">

        <h2>⌨️ Enter Barcode Manually</h2>

        <div className="barcode-input">

          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Example: 8901234567890"
          />

          <button onClick={handleScan}>
            🔍 Search
          </button>

        </div>

      </div>


      {scanned && (
        <div className="scanned-product">

          <div className="product-icon">
            📦
          </div>

          <div className="product-details">
            <h2>Product Found</h2>
            <p>Barcode: {barcode}</p>
            <p>Product details will be retrieved here.</p>
          </div>

          <button className="add-product-button">
            ➕ Add Product
          </button>

        </div>
      )}

    </div>
  )
}

export default BarcodeScanner