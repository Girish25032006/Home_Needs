import { useEffect, useState } from 'react'
import './ProductManagement.css'

function ProductManagement({ onAddProduct }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)

  const fetchProducts = () => {
    fetch('http://127.0.0.1:5000')
      .then((response) => response.json())
      .then((data) => setProducts(data))
      .catch((error) => console.error('Error fetching products:', error))
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const handleEdit = (product) => {
    setEditingProduct({
      ...product,
      quantity: product.quantity,
      price: product.price
    })
  }

  const handleUpdate = async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:5000/products/${editingProduct.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            productName: editingProduct.product_name,
            category: editingProduct.category,
            quantity: editingProduct.quantity,
            unit: editingProduct.unit,
            price: editingProduct.price,
            purchaseDate: editingProduct.purchase_date
              ? editingProduct.purchase_date.substring(0, 10)
              : ''
          })
        }
      )

      const data = await response.json()

      if (response.ok) {
        alert('Product updated successfully!')
        setEditingProduct(null)
        fetchProducts()
      } else {
        alert(data.message || 'Failed to update product')
      }
    } catch (error) {
      console.error('Error updating product:', error)
      alert('Unable to connect to backend')
    }
  }

  const filteredProducts = products.filter((product) =>
    product.product_name.toLowerCase().includes(search.toLowerCase())
  )

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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          className="add-product-button"
          onClick={onAddProduct}
        >
          ➕ Add Product
        </button>

      </div>

      {/* Product List */}
      <div className="product-list">

        {filteredProducts.map((product) => (
          <div className="product-card" key={product.id}>

            <div className="product-info">
              <div className="product-icon">
                {product.category === 'Cleaning' ? '🧺' : '📦'}
              </div>

              <div>
                <h3>{product.product_name}</h3>
                <p>
                  {product.category} • {product.quantity} {product.unit}
                </p>
              </div>
            </div>

            <div className="product-price">
              ₹{product.price}
            </div>

            <div className="product-actions-small">

              <button onClick={() => handleEdit(product)}>
                ✏️
              </button>

              <button
                onClick={async () => {
                  if (!window.confirm(`Delete ${product.product_name}?`)) {
                    return
                  }

                  try {
                    const response = await fetch(
                      `http://127.0.0.1:5000/products/${product.id}`,
                      {
                        method: 'DELETE'
                      }
                    )

                    const data = await response.json()

                    if (response.ok) {
                      alert('Product deleted successfully!')
                      fetchProducts()
                    } else {
                      alert(data.message || 'Failed to delete product')
                    }
                  } catch (error) {
                    console.error('Error deleting product:', error)
                    alert('Unable to connect to backend')
                  }
                }}
              >
                🗑️
              </button>

            </div>

          </div>
        ))}

      </div>

      {/* Edit Product */}
      {editingProduct && (
        <div className="edit-product-overlay">

          <div className="edit-product-card">

            <h2>✏️ Edit Product</h2>

            <div className="form-group">
              <label>Product Name</label>
              <input
                type="text"
                value={editingProduct.product_name}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    product_name: e.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={editingProduct.category}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    category: e.target.value
                  })
                }
              />
            </div>

            <div className="form-row">

              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  value={editingProduct.quantity}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      quantity: e.target.value
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>Unit</label>
                <input
                  type="text"
                  value={editingProduct.unit}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      unit: e.target.value
                    })
                  }
                />
              </div>

            </div>

            <div className="form-group">
              <label>Price</label>
              <input
                type="number"
                value={editingProduct.price}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    price: e.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Purchase Date</label>
              <input
                type="date"
                value={
                  editingProduct.purchase_date
                    ? editingProduct.purchase_date.substring(0, 10)
                    : ''
                }
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    purchase_date: e.target.value
                  })
                }
              />
            </div>

            <div className="edit-buttons">

              <button
                className="cancel-edit-button"
                onClick={() => setEditingProduct(null)}
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