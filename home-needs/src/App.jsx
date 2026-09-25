
import { useState, useEffect, useCallback } from 'react'
import Profile from './components/Profile'
import AddProduct from './components/AddProduct'
import Dashboard from './components/Dashboard'
import ProductManagement from './components/ProductManagement'
import PurchaseTracking from './components/PurchaseTracking'
import ConsumptionTracking from './components/ConsumptionTracking'
import AIPrediction from './components/AIPrediction'
import PurchaseRecommendation from './components/PurchaseRecommendation'
import MealRecommendation from './components/MealRecommendation'
import ExpiryTracking from './components/ExpiryTracking'
import SmartNotifications from './components/SmartNotifications'
import BarcodeScanner from './components/BarcodeScanner'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import './App.css'

const API_URL = 'http://localhost:5000'

function App() {
  const [page, setPage] = useState('dashboard')
  const [selectedShoppingItem, setSelectedShoppingItem] = useState(null)
  const [shoppingItems, setShoppingItems] = useState([])
  const [shoppingLoading, setShoppingLoading] = useState(false)
  const [shoppingError, setShoppingError] = useState('')
  const [purchased, setPurchased] = useState([])

  // Fetch Shopping List from Flask and MySQL
  const fetchShoppingList = useCallback(async () => {
    setShoppingLoading(true)
    setShoppingError('')

    try {
      const response = await fetch(`${API_URL}/shopping-list`)

      if (!response.ok) {
        throw new Error('Failed to fetch shopping list')
      }

      const data = await response.json()

      const items = Array.isArray(data)
        ? data
        : data.shopping_list || data.items || []

      setShoppingItems(items)

      // Show already purchased items as checked
      setPurchased(
        items
          .filter(item => item.status === 'Purchased')
          .map(item => item.id)
      )
    } catch (error) {
      console.error('Shopping list error:', error)
      setShoppingError('Unable to load shopping list.')
    } finally {
      setShoppingLoading(false)
    }
  }, [])

  // Load shopping list when opening the Shopping List page
  useEffect(() => {
    if (page === 'shopping') {
      fetchShoppingList()
    }
  }, [page, fetchShoppingList])

  // Add Product callback
  const addProduct = (product) => {
    setPage('shopping')
  }

  // Mark shopping item as Purchased or Pending
  const handlePurchaseChange = (item) => {
  if (purchased.includes(item.id)) {
    return
  }

  setSelectedShoppingItem(item)
  setPage('purchases')
}


  // Delete all Shopping List records
  const handleDeleteAll = async () => {
    if (shoppingItems.length === 0) {
      alert('Shopping List is already empty.')
      return
    }

    const confirmDelete = window.confirm(
      'Are you sure you want to delete ALL Shopping List records? This cannot be undone.'
    )

    if (!confirmDelete) {
      return
    }

    setShoppingLoading(true)
    setShoppingError('')

    try {
      // Delete each record using the existing Flask DELETE endpoint
      for (const item of shoppingItems) {
        const response = await fetch(
          `${API_URL}/shopping-list/${item.id}`,
          { method: 'DELETE' }
        )

        if (!response.ok) {
          throw new Error(`Could not delete shopping list record ${item.id}`)
        }
      }

      setShoppingItems([])
      setPurchased([])
      setSelectedShoppingItem(null)

      alert('All Shopping List records deleted successfully!')

      await fetchShoppingList()
    } catch (error) {
      console.error('Delete all error:', error)
      setShoppingError(
        'Unable to delete all records. Please refresh the Shopping List and try again.'
      )
      await fetchShoppingList()
    } finally {
      setShoppingLoading(false)
    }
  }

  const menuItems = [
    {
      id: 'dashboard',
      icon: '🏠',
      label: 'Dashboard'
    },
    {
      id: 'products',
      icon: '📦',
      label: 'Products'
    },
    {
      id: 'purchases',
      icon: '🧾',
      label: 'Purchases'
    },
    {
      id: 'consumption',
      icon: '📊',
      label: 'Consumption'
    },
    {
      id: 'ai',
      icon: '🤖',
      label: 'AI Predictions'
    },
    {
      id: 'recommendations',
      icon: '💡',
      label: 'Recommendations'
    },
    {
      id: 'meals',
      icon: '🍽️',
      label: 'Meals'
    },
    {
      id: 'expiry',
      icon: '📅',
      label: 'Expiry'
    },
    {
      id: 'notifications',
      icon: '🔔',
      label: 'Notifications'
    },
    {
      id: 'analytics',
      icon: '📈',
      label: 'Analytics'
    }
  ]

  return (
    <div className="app">

      {/* Sidebar */}
      <aside className="sidebar">

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-icon">
            🏠
          </div>

          <div className="logo-text">
            <h1>Home Needs</h1>
            <p>Smarter Homes</p>
            <span>Happier Families</span>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="sidebar-navigation">

          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${
                page === item.id ? 'active' : ''
              }`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              <span className="nav-label">
                {item.label}
              </span>
            </button>
          ))}

          {/* Divider */}
          <div className="nav-divider"></div>

          {/* Add Product */}
          <button
            className={`nav-item ${
              page === 'add' ? 'active' : ''
            }`}
            onClick={() => setPage('add')}
          >
            <span className="nav-icon">➕</span>
            <span className="nav-label">Add Product</span>
          </button>

          {/* Barcode Scanner */}
          <button
            className={`nav-item ${
              page === 'barcode' ? 'active' : ''
            }`}
            onClick={() => setPage('barcode')}
          >
            <span className="nav-icon">📷</span>
            <span className="nav-label">Barcode Scanner</span>
          </button>

          {/* Shopping List */}
          <button
            className={`nav-item ${
              page === 'shopping' ? 'active' : ''
            }`}
            onClick={() => setPage('shopping')}
          >
            <span className="nav-icon">🛒</span>
            <span className="nav-label">Shopping List</span>
          </button>

        </nav>

        {/* Profile at Bottom */}
        <button
          className={`sidebar-profile ${
            page === 'profile' ? 'profile-active' : ''
          }`}
          onClick={() => setPage('profile')}
        >
          <div className="profile-icon">
            👤
          </div>

          <div className="profile-info">
            <strong>User</strong>
            <span>Manage your profile</span>
          </div>

          <span className="profile-arrow">
            ›
          </span>
        </button>

      </aside>

      {/* Main Area */}
      <div className="main-area">

        {/* Top Bar */}
        <header className="topbar">

          {/* Search */}
          <div className="search-box">
            <span className="search-icon">
              🔍
            </span>

            <input
              type="text"
              placeholder="Search products, meals, or anything..."
            />
          </div>

          {/* Top Right */}
          <div className="topbar-actions">

            <button
              className="notification-button"
              onClick={() => setPage('notifications')}
            >
              🔔
              <span className="notification-count">
                3
              </span>
            </button>

            <div className="topbar-divider"></div>

            <button
              className="top-profile"
              onClick={() => setPage('profile')}
            >
              <div className="top-profile-icon">
                👤
              </div>

              <span>User</span>

              <span className="dropdown-arrow">
                ▾
              </span>
            </button>

          </div>

        </header>

        {/* Page Content */}
        <main className="main">

          {page === 'dashboard' && <Dashboard />}

          {page === 'products' && (
            <ProductManagement
              onAddProduct={() => setPage('add')}
            />
          )}

          {page === 'purchases' && (
            <PurchaseTracking
              selectedProduct={selectedShoppingItem}
              onPurchaseSaved={async (item) => {
                try {
                  const response = await fetch(
                    `${API_URL}/shopping-list/${item.id}`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        status: 'Purchased'
                      })
                    }
                  )

                  if (!response.ok) {
                    throw new Error('Failed to update shopping list')
                  }

                  setSelectedShoppingItem(null)
                  await fetchShoppingList()
                } catch (error) {
                  console.error(error)
                  alert('Purchase saved, but shopping list update failed.')
                }
              }}
            />
          )}

          {page === 'consumption' && <ConsumptionTracking />}

          {page === 'ai' && <AIPrediction />}

          {page === 'recommendations' && (
            <PurchaseRecommendation />
          )}

          {page === 'meals' && <MealRecommendation />}

          {page === 'expiry' && <ExpiryTracking />}

          {page === 'notifications' && (
            <SmartNotifications />
          )}

          {page === 'analytics' && (
            <AnalyticsDashboard />
          )}

          {page === 'profile' && <Profile />}

          {page === 'barcode' && <BarcodeScanner />}

          {/* Add Product */}
          {page === 'add' && (
            <>
              <div className="page-title">
                <h1>➕ Add Product</h1>
                <p>
                  Add a household item to Home Needs
                </p>
              </div>

              <AddProduct onSave={addProduct} />
            </>
          )}

          {/* Shopping List */}
          {page === 'shopping' && (
            <>
              <div className="page-title">
                <h1>🛒 Shopping List</h1>
                <p>
                  Items you need to purchase
                </p>
              </div>

              <div className="shopping-list">

                {shoppingLoading && (
                  <p>Loading shopping list...</p>
                )}

                {shoppingError && (
                  <p style={{ color: 'red' }}>
                    {shoppingError}
                  </p>
                )}

                {!shoppingLoading &&
                  !shoppingError &&
                  shoppingItems.length === 0 && (
                    <p>
                      Your shopping list is empty.
                    </p>
                  )}

                {!shoppingLoading &&
                  shoppingItems.map((item) => (
                    <div
                      className={`shopping-item ${
                        purchased.includes(item.id)
                          ? 'purchased'
                          : ''
                      }`}
                      key={item.id}
                    >

                      <div>
                        <h2>
                          🛒 {item.product_name}
                        </h2>

                        {purchased.includes(item.id) && (
                          <span className="purchased-text">
                            ✓ Purchased
                          </span>
                        )}

                        <p>
                          {item.required_quantity}{' '}
                          {item.unit || ''}
                        </p>
                      </div>

                      <input
                        type="checkbox"
                        checked={purchased.includes(item.id)}
                        onChange={() => handlePurchaseChange(item)}
                      />

                    </div>
                  ))}

                {!shoppingLoading && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      marginTop: '15px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <button
                      className="shopping-button"
                      style={{ flex: 1 }}
                      onClick={fetchShoppingList}
                    >
                      🔄 Refresh Shopping List
                    </button>

                    <button
                      className="shopping-button"
                      style={{
                        flex: 1,
                        backgroundColor: '#dc3545',
                        color: '#ffffff'
                      }}
                      onClick={handleDeleteAll}
                    >
                      🗑️ Delete All
                    </button>
                  </div>
                )}

              </div>
            </>
          )}

        </main>

      </div>

    </div>
  )
}

export default App