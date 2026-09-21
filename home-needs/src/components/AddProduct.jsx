import { useState } from 'react'
import './AddProduct.css'

function AddProduct({ onSave }) {

  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('Kg')
  const [price, setPrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')

  const handleSave = () => {

    const product = {
      productName,
      quantity,
      unit,
      price,
      purchaseDate
    }

    onSave(product)
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
            <p>Enter the details of your household product</p>
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
            onChange={(e) => setProductName(e.target.value)}
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
              onChange={(e) => setQuantity(e.target.value)}
            />

          </div>


          <div className="form-group">

            <label>
              Unit
            </label>

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
              onChange={(e) => setPrice(e.target.value)}
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
            onChange={(e) => setPurchaseDate(e.target.value)}
          />

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