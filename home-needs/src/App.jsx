import { useState } from 'react'
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

function App() {
  const [page, setPage] = useState('dashboard')
  const [purchased, setPurchased] = useState([])

  const [products, setProducts] = useState([
    {
      productName: 'Rice',
      quantity: 5,
      unit: 'Kg'
    },
    {
      productName: 'Cooking Oil',
      quantity: 2,
      unit: 'Litre'
    },
    {
      productName: 'Detergent',
      quantity: 2,
      unit: 'Packet'
    }
  ])

  const addProduct = (product) => {
    setProducts([...products, product])
    setPage('shopping')
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

          {/* Additional Actions */}
          <button
            className={`nav-item ${
              page === 'add' ? 'active' : ''
            }`}
            onClick={() => setPage('add')}
          >
            <span className="nav-icon">➕</span>
            <span className="nav-label">Add Product</span>
          </button>

          <button
            className={`nav-item ${
              page === 'barcode' ? 'active' : ''
            }`}
            onClick={() => setPage('barcode')}
          >
            <span className="nav-icon">📷</span>
            <span className="nav-label">Barcode Scanner</span>
          </button>

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
            <ProductManagement onAddProduct={() => setPage('add')} />
          )}

          {page === 'purchases' && <PurchaseTracking />}

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

                {products.map((product, index) => (
                  <div
                    className={`shopping-item ${
                      purchased.includes(index)
                        ? 'purchased'
                        : ''
                    }`}
                    key={index}
                  >

                    <div>
                      <h2>
                        🛒 {product.productName}
                      </h2>

                      {purchased.includes(index) && (
                        <span className="purchased-text">
                          ✓ Purchased
                        </span>
                      )}

                      <p>
                        {product.quantity} {product.unit}
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={purchased.includes(index)}
                      onChange={() => {
                        if (purchased.includes(index)) {
                          setPurchased(
                            purchased.filter(
                              item => item !== index
                            )
                          )
                        } else {
                          setPurchased([
                            ...purchased,
                            index
                          ])
                        }
                      }}
                    />

                  </div>
                ))}

              </div>
            </>
          )}

        </main>

      </div>

    </div>
  )
}

export default App