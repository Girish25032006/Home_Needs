import './ProductManagement.css'

function ProductManagement() {
  return (
    <div className="product-management">

      <div className="page-title">
        <h1>📦 Product Management</h1>
        <p>Manage all the products in your home</p>
      </div>

      {/* Search and Add */}
      <div className="product-actions">

        <input
          type="text"
          placeholder="🔍 Search products..."
        />

        <button className="add-product-button">
          ➕ Add Product
        </button>

      </div>

      {/* Product List */}
      <div className="product-list">

        <div className="product-card">

          <div className="product-info">
            <div className="product-icon">🍚</div>

            <div>
              <h3>Rice</h3>
              <p>Grocery • 5 Kg</p>
            </div>
          </div>

          <div className="product-price">
            ₹300
          </div>

          <div className="product-actions-small">
            <button>✏️</button>
            <button>🗑️</button>
          </div>

        </div>


        <div className="product-card">

          <div className="product-info">
            <div className="product-icon">🛢️</div>

            <div>
              <h3>Cooking Oil</h3>
              <p>Grocery • 2 Litre</p>
            </div>
          </div>

          <div className="product-price">
            ₹360
          </div>

          <div className="product-actions-small">
            <button>✏️</button>
            <button>🗑️</button>
          </div>

        </div>


        <div className="product-card">

          <div className="product-info">
            <div className="product-icon">🧺</div>

            <div>
              <h3>Detergent</h3>
              <p>Cleaning • 2 Packet</p>
            </div>
          </div>

          <div className="product-price">
            ₹250
          </div>

          <div className="product-actions-small">
            <button>✏️</button>
            <button>🗑️</button>
          </div>

        </div>

      </div>

    </div>
  )
}

export default ProductManagement