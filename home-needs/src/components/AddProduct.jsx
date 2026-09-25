import { useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import './AddProduct.css'

function AddProduct({ onSave }) {

  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('Kg')
  const [price, setPrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [barcode, setBarcode] = useState('')
  const [scanning, setScanning] = useState(false)

  const handleBarcodeScan = async () => {
    setScanning(true)

    const scanner = new Html5Qrcode('barcode-reader')

    try {
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 300, height: 150 }
        },
        async (decodedText) => {

          const scannedBarcode = decodedText

          setBarcode(scannedBarcode)

          await scanner.stop()
          scanner.clear()
          setScanning(false)

          try {
            const response = await fetch(
              `http://127.0.0.1:5000/barcode-products/${scannedBarcode}`
            )

            const data = await response.json()

            if (response.ok) {

              setProductName(data.product_name || '')
              setUnit(data.unit || 'Kg')
              setPrice(data.price || '')

              alert('Product found and details filled automatically!')

            } else {

              alert(
                'Barcode scanned, but this product is not available in our barcode database.'
              )

            }

          } catch (error) {

            console.error('Error finding barcode product:', error)

            alert('Unable to connect to backend.')

          }
        },
        () => {
          // Ignore scanning errors while camera is searching
        }
      )

    } catch (error) {

      console.error('Unable to start camera:', error)

      setScanning(false)

      alert(
        'Unable to access camera. Please allow camera permission and try again.'
      )
    }
  }


  const handleStopScanner = async () => {

    try {

      const scanner = new Html5Qrcode('barcode-reader')

      if (scanning) {
        await scanner.stop()
        scanner.clear()
      }

    } catch (error) {

      console.error('Error stopping scanner:', error)

    }

    setScanning(false)
  }


  const handleSave = async () => {

    const product = {
      productName,
      quantity,
      unit,
      price,
      purchaseDate,
      expiryDate,
      barcode
    }

    try {

      const response = await fetch(
        'http://127.0.0.1:5000/products',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(product)
        }
      )

      const data = await response.json()

      if (response.ok) {

        alert('Product added successfully!')

        onSave(product)

      } else {

        alert(
          data.message || 'Failed to add product'
        )

      }

    } catch (error) {

      console.error('Error adding product:', error)

      alert('Unable to connect to backend')

    }
  }


  return (
    <div className="add-product-page">

      {/* Page Header */}
      <div className="add-product-header">

      </div>


      {/* Product Form Card */}
      <div className="add-product-card">

        <div className="form-section-title">

          <span>📦</span>

          <div>

            <h2>Product Information</h2>

            <p>
              Enter the details of your household product
            </p>

          </div>

        </div>


        {/* Product Name */}
        <div className="form-group">

          <label>
            Product Name
          </label>

          <input
            type="text"
            placeholder="Example: Rice"
            value={productName}
            onChange={(e) =>
              setProductName(e.target.value)
            }
          />

        </div>


        {/* Quantity + Unit */}
        <div className="form-row">

          <div className="form-group">

            <label>
              Quantity
            </label>

            <input
              type="number"
              placeholder="Example: 5"
              value={quantity}
              onChange={(e) =>
                setQuantity(e.target.value)
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
                setUnit(e.target.value)
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


        {/* Price */}
        <div className="form-group">

          <label>
            Price
          </label>

          <div className="price-input">

            <span>₹</span>

            <input
              type="number"
              placeholder="Example: 300"
              value={price}
              onChange={(e) =>
                setPrice(e.target.value)
              }
            />

          </div>

        </div>


        {/* Purchase Date */}
        <div className="form-group">

          <label>
            Purchase Date
          </label>

          <input
            type="date"
            value={purchaseDate}
            onChange={(e) =>
              setPurchaseDate(e.target.value)
            }
          />

        </div>


        {/* Expiry Date */}
        <div className="form-group">

          <label>
            Expiry Date
          </label>

          <input
            type="date"
            value={expiryDate}
            onChange={(e) =>
              setExpiryDate(e.target.value)
            }
          />

        </div>


        {/* Barcode Scanner */}
        <div className="form-group">

          <label>
            Add Using Barcode
          </label>

          <button
            type="button"
            className="barcode-scan-button"
            onClick={handleBarcodeScan}
          >
            📷 Scan Barcode
          </button>


          {/* Camera Scanner */}
          {scanning && (
            <div className="barcode-scanner-container">

              <div
                id="barcode-reader"
                className="barcode-reader"
              ></div>

              <button
                type="button"
                className="stop-scanner-button"
                onClick={handleStopScanner}
              >
                ✖ Stop Scanner
              </button>

            </div>
          )}


          {/* Scanned Barcode */}
          {barcode && (
            <div className="scanned-barcode">

              Scanned Barcode:{' '}

              <strong>
                {barcode}
              </strong>

            </div>
          )}

        </div>


        {/* Save Button */}
        <button
          className="save-button"
          onClick={handleSave}
        >
          💾 Save Product
        </button>

      </div>

    </div>
  )
}

export default AddProduct