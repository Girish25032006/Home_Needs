
import { useEffect, useState } from 'react'
import './ConsumptionTracking.css'

function ConsumptionTracking() {
  const [products, setProducts] = useState([])
  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('Kg')
  const [usageDate, setUsageDate] = useState('')

  const [consumptions, setConsumptions] = useState([])
  const [loading, setLoading] = useState(false)

  const API_URL = 'http://127.0.0.1:5000'

  // Get today's date
  const getToday = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  // Fetch products from MySQL
  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_URL}/`)
      const data = await response.json()

      if (response.ok) {
        setProducts(data)

        if (data.length > 0) {
          setProductName((previous) => {
            if (data.some((product) =>
              product.product_name === previous
            )) {
              return previous
            }

            return data[0].product_name
          })

          const selectedProduct = data.find(
            (product) => product.product_name === productName
          ) || data[0]

          setUnit(selectedProduct.unit || 'Kg')
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  // Fetch consumption history
  const fetchConsumptions = async () => {
    try {
      const response = await fetch(`${API_URL}/consumption`)
      const data = await response.json()

      if (response.ok) {
        setConsumptions(data)
      }
    } catch (error) {
      console.error('Error fetching consumption history:', error)
    }
  }

  // Load products and history
  useEffect(() => {
    fetchProducts()
    fetchConsumptions()
    setUsageDate(getToday())
  }, [])

  // Update unit when product changes
  const handleProductChange = (e) => {
    const selectedName = e.target.value
    setProductName(selectedName)

    const selectedProduct = products.find(
      (product) => product.product_name === selectedName
    )

    if (selectedProduct) {
      setUnit(selectedProduct.unit || 'Kg')
    }
  }

  // Record consumption
  const handleSave = async () => {
    if (!productName || !quantity || !usageDate) {
      alert('Please fill all consumption details')
      return
    }

    if (Number(quantity) <= 0) {
      alert('Enter a valid quantity')
      return
    }

    const selectedProduct = products.find(
      (product) => product.product_name === productName
    )

    if (!selectedProduct) {
      alert('Please select a valid product')
      return
    }

    if (Number(quantity) > Number(selectedProduct.quantity)) {
      alert(
        `Only ${selectedProduct.quantity} ${selectedProduct.unit} available in stock`
      )
      return
    }

    setLoading(true)

    const consumption = {
      productName: productName,
      quantity: Number(quantity),
      unit: unit,
      usageDate: usageDate
    }

    try {
      const response = await fetch(`${API_URL}/consumption`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(consumption)
      })

      const data = await response.json()

      if (response.ok) {
        alert('Consumption recorded successfully!')

        setQuantity('')
        setUsageDate(getToday())

        await fetchProducts()
        await fetchConsumptions()
      } else {
        alert(data.message || 'Failed to record consumption')
      }
    } catch (error) {
      console.error('Error recording consumption:', error)
      alert('Unable to connect to backend')
    } finally {
      setLoading(false)
    }
  }

  // Format date
  const formatDate = (date) => {
    if (!date) return ''

    const dateString = String(date).split('T')[0]
    const parts = dateString.split('-')

    if (parts.length === 3) {
      return new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
      ).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }

    return date
  }

  return (
    <div className="consumption-tracking">

      <div className="page-title">
        <h1>📊 Consumption Tracking</h1>
        <p>Track how much your household uses</p>
      </div>

      {/* Consumption Form */}

      <div className="consumption-form">

        <div className="form-group">
          <label>Product</label>

          <select
            value={productName}
            onChange={handleProductChange}
          >
            {products.length === 0 ? (
              <option value="">No products available</option>
            ) : (
              products.map((product) => (
                <option
                  key={product.id}
                  value={product.product_name}
                >
                  {product.product_name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="form-row">

          <div className="form-group">
            <label>Quantity Used</label>

            <input
              type="number"
              placeholder="Example: 2"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Unit</label>

            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
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

        <div className="form-group">
          <label>Usage Date</label>

          <input
            type="date"
            value={usageDate}
            onChange={(e) => setUsageDate(e.target.value)}
          />
        </div>

        <button
          className="consumption-save-button"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Recording...' : '💾 Record Usage'}
        </button>

      </div>

      {/* Consumption History */}

      <div className="consumption-history">

        <h2>📋 Recent Consumption</h2>

        {consumptions.length === 0 ? (
          <p>No consumption history available.</p>
        ) : (
          consumptions.map((consumption) => (
            <div
              className="consumption-card"
              key={consumption.id}
            >

              <div>
                <h3>
                  {consumption.product_name}
                </h3>

                <p>
                  {consumption.quantity} {consumption.unit} used
                  {' • '}
                  {formatDate(consumption.usage_date)}
                </p>
              </div>

              <strong>
                {consumption.quantity} {consumption.unit}
              </strong>

            </div>
          ))
        )}

      </div>

    </div>
  )
}

export default ConsumptionTracking