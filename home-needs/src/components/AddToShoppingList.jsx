
import { useEffect, useState } from 'react'
import API_URL from '../api'
import './AddToShoppingList.css'

export default function AddToShoppingList({
  products = [],
  onClose,
  onAdded,
}) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const availableProducts = products.filter(
    (product) => product.id && product.product_name
  )

  const selectedProduct = availableProducts.find(
    (product) => String(product.id) === String(productId)
  )

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !saving) onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose, saving])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const parsedQuantity = Number(quantity)

    if (!productId) {
      setError('Please select a product.')
      return
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Enter a quantity greater than zero.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch(
        `${API_URL}/shopping-list/add-prediction`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_id: Number(productId),
            requested_quantity: parsedQuantity,
          }),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not add the product to your shopping list.'
        )
      }

      await onAdded?.()
      onClose()
    } catch (err) {
      console.error('Add to shopping list error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="add-shopping-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        className="add-shopping-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-shopping-title"
      >
        <header className="add-shopping-header">
          <div className="add-shopping-heading-icon">🛒</div>
          <div>
            <h2 id="add-shopping-title">Add to Shopping List</h2>
            <p>Select a household product and required quantity.</p>
          </div>
          <button
            type="button"
            className="add-shopping-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="add-shopping-field">
            <label htmlFor="shopping-product">Choose Product</label>
            <select
              id="shopping-product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              required
              disabled={saving}
            >
              <option value="">Select an existing product</option>
              {availableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.product_name}
                </option>
              ))}
            </select>
            {availableProducts.length === 0 && (
              <small>
                No products found. Add a product in the Products module first.
              </small>
            )}
          </div>

          <div className="add-shopping-field">
            <label htmlFor="shopping-quantity">Required Quantity</label>
            <div className="add-shopping-quantity">
              <input
                id="shopping-quantity"
                type="number"
                min="0.01"
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
                disabled={saving}
              />
              <span>{selectedProduct?.unit || 'units'}</span>
            </div>
          </div>

          {selectedProduct && (
            <div className="add-shopping-preview">
              <span className="add-shopping-preview-icon">📦</span>
              <div>
                <strong>{selectedProduct.product_name}</strong>
                <p>
                  Quantity: {quantity || '0'} {selectedProduct.unit || 'units'}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="add-shopping-error" role="alert">
              {error}
            </div>
          )}

          <footer className="add-shopping-actions">
            <button
              type="button"
              className="add-shopping-cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="add-shopping-submit"
              disabled={saving || availableProducts.length === 0}
            >
              {saving ? 'Adding…' : '＋ Add to List'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
