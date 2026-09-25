
import { useEffect, useState } from 'react'
import './PurchaseTracking.css'

function PurchaseTracking() {
  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('Kg')
  const [amountPaid, setAmountPaid] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')

  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchPurchases = async () => {
    try {
      const response = await fetch(
        'http://127.0.0.1:5000/purchases'
      )

      const data = await response.json()

      if (response.ok) {
        setPurchases(data)
      }
    } catch (error) {
      console.error('Error fetching purchases:', error)
    }
  }

  useEffect(() => {
    fetchPurchases()
  }, [])

  const handleSave = async () => {
    if (
      !productName.trim() ||
      !quantity ||
      !amountPaid ||
      !purchaseDate
    ) {
      alert('Please fill all purchase details')
      return
    }

    if (Number(quantity) <= 0 || Number(amountPaid) < 0) {
      alert('Enter a valid quantity and amount')
      return
    }

    setLoading(true)

    const purchase = {
      productName: productName.trim(),
      quantity: Number(quantity),
      unit,
      amountPaid: Number(amountPaid),
      purchaseDate
    }

    try {
      const response = await fetch(
        'http://127.0.0.1:5000/purchases',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(purchase)
        }
      )

      const data = await response.json()

      if (response.ok) {
        alert('Purchase saved successfully!')

        setProductName('')
        setQuantity('')
        setUnit('Kg')
        setAmountPaid('')
        setPurchaseDate('')

        await fetchPurchases()
      } else {
        alert(data.message || 'Failed to save purchase')
      }
    } catch (error) {
      console.error('Error saving purchase:', error)
      alert('Unable to connect to backend')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date) => {
    if (!date) return ''

    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <div className="purchase-tracking">

      <div className="page-title">
        <h1>🧾 Purchase Tracking</h1>
        <p>Keep track of your household purchases</p>
      </div>

      {/* Purchase Form */}

      <div className="purchase-form">

        <div className="form-group">
          <label>Product Name</label>
          <input
            type="text"
            placeholder="Example: Rice"
            value={productName}
            onChange={(e) =>
              setProductName(e.target.value)
            }
          />
        </div>

        <div className="form-row">

          <div className="form-group">
            <label>Quantity</label>
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
            <label>Unit</label>
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

        <div className="form-row">

          <div className="form-group">
            <label>Amount Paid</label>
            <input
              type="number"
              placeholder="Example: 300"
              value={amountPaid}
              onChange={(e) =>
                setAmountPaid(e.target.value)
              }
            />
          </div>

          <div className="form-group">
            <label>Purchase Date</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) =>
                setPurchaseDate(e.target.value)
              }
            />
          </div>

        </div>

        <button
          className="purchase-save-button"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Saving...' : '💾 Save Purchase'}
        </button>

      </div>

      {/* Purchase History */}

      <div className="purchase-history">

        <h2>📋 Purchase History</h2>

        {purchases.length === 0 ? (
          <p>No purchase history available.</p>
        ) : (
          purchases.map((purchase) => (
            <div
              className="purchase-card"
              key={purchase.id}
            >

              <div>
                <h3>🛒 {purchase.product_name}</h3>

                <p>
                  {purchase.quantity} {purchase.unit}
                  {' • '}
                  {formatDate(purchase.purchase_date)}
                </p>
              </div>

              <strong>
                ₹{Number(purchase.total_price).toFixed(2)}
              </strong>

            </div>
          ))
        )}

      </div>

    </div>
  )
}

export default PurchaseTracking