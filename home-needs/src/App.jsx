



import { useState, useEffect, useCallback, useRef } from 'react'

import { CalendarDays } from 'lucide-react';

import { jsPDF } from 'jspdf'



import Profile from './components/Profile'



import Auth from './components/Auth'



import ResetPassword from './ResetPassword'



import AddProduct from './components/AddProduct'



import Dashboard from './components/Dashboard'



import ProductManagement from './components/ProductManagement'



import PurchaseTracking from './components/PurchaseTracking'



import ConsumptionTracking from './components/ConsumptionTracking'



import AIPrediction from './components/AIPrediction'

import CookingPrediction from './components/CookingPrediction'



import PurchaseRecommendation from './components/PurchaseRecommendation'



import MealRecommendation from './components/MealRecommendation'



import ExpiryTracking from './components/ExpiryTracking'



import SmartNotifications from './components/SmartNotifications'
import Settings from './components/Settings'



import BarcodeScanner from './components/BarcodeScanner'



import AnalyticsDashboard from './components/AnalyticsDashboard'

import AddToShoppingList from './components/AddToShoppingList'

import './App.css'

import './MobileBottomNav.css'
import MealPlanner from './components/MealPlanner/MealPlanner'


import './ShoppingList.css'
import AdminImageGallery from './components/AdminImageGallery'
import AdminIngredientManagement from './components/AdminIngredientManagement'
import MealImageGallery from './components/MealImageGallery'







import API_URL from './api'







function App() {



  // Password-reset links from Gmail open this route with a token.



  // Render the dedicated reset page before the normal authentication flow.



  const isResetPasswordPage =



    window.location.pathname === '/reset-password'







  if (isResetPasswordPage) {



    return (



      <ResetPassword



        onBackToLogin={() => {



          window.history.replaceState({}, '', '/')



          window.location.reload()



        }}



      />



    )



  }







  const [page, setPage] = useState('dashboard')



  const [expiringProduct, setExpiringProduct] = useState(null)



  const [selectedShoppingItem, setSelectedShoppingItem] = useState(null)



  const [shoppingItems, setShoppingItems] = useState([])



  const [shoppingLoading, setShoppingLoading] = useState(false)



  const [shoppingError, setShoppingError] = useState('')



  const [purchased, setPurchased] = useState([])



  const [productCatalog, setProductCatalog] = useState([])

  const [showAddShoppingModal, setShowAddShoppingModal] = useState(false)



  const [initialBarcode, setInitialBarcode] = useState('')



  const [user, setUser] = useState(null)



  const [authLoading, setAuthLoading] = useState(true)



  const [showShareModal, setShowShareModal] = useState(false)



  const [headerNotifications, setHeaderNotifications] = useState([])



  const [headerNotificationsLoading, setHeaderNotificationsLoading] = useState(false)



  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)



  const notificationDropdownRef = useRef(null)







  // Mobile navigation drawer.



  const [sidebarOpen, setSidebarOpen] = useState(false)







  // Close the mobile navigation drawer.



  const closeMobileSidebar = () => {



    setSidebarOpen(false)



  }







  // Handle navigation from Expiry Tracking to meal recommendations,



  // and allow the Meals page to clear the expiring-product filter.



  useEffect(() => {



    const handleFindMealsForProduct = (event) => {



      setExpiringProduct(event.detail || null)



      setPage('meals')



    }







    const handleClearExpiringProductFilter = () => {



      setExpiringProduct(null)



    }







    window.addEventListener('find-meals-for-product', handleFindMealsForProduct)



    window.addEventListener('clear-expiring-product-filter', handleClearExpiringProductFilter)







    return () => {



      window.removeEventListener('find-meals-for-product', handleFindMealsForProduct)



      window.removeEventListener('clear-expiring-product-filter', handleClearExpiringProductFilter)



    }



  }, [])







  // Check whether a user already has an active Flask session.



  useEffect(() => {



    async function checkLogin() {



      try {



        const response = await fetch(`${API_URL}/api/me`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });







        if (response.ok) {



          const data = await response.json()
          console.log("USER FROM /api/me:", data.user)



          setUser(data.user)



        } else {



          setUser(null)



        }



      } catch (error) {



        console.error('Authentication check failed:', error)



        setUser(null)



      } finally {



        setAuthLoading(false)



      }



    }







    checkLogin()



  }, [])







  // Sign up or log in through the Flask authentication API.



  const handleAuthSuccess = async (formData) => {
    const endpoint = formData.mode === 'signup' ? '/api/signup' : '/api/login';

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          accepted_terms: formData.accepted_terms,
          accepted_privacy: formData.accepted_privacy
        })
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        // Keep a useful error if the backend did not return JSON.
      }

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed.');
      }

      // Signup now sends an OTP and must NOT create a dashboard session.
      if (formData.mode === 'signup' && data.requiresVerification) {
        return {
          requiresVerification: true,
          email: data.email || formData.email,
          message: data.message || 'Verification code sent to your email.'
        };
      }

      // Only a successful login should proceed to session verification.
      const sessionResponse = await fetch(`${API_URL}/api/me`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json'
        }
      });

      if (!sessionResponse.ok) {
        throw new Error(
          'Authentication succeeded, but your session could not be verified. Please try again.'
        );
      }

      const sessionData = await sessionResponse.json();
      setUser(sessionData.user || data.user);
      setPage('dashboard');

      return { authenticated: true };
    } catch (error) {
      console.error('Authentication error:', {
        name: error.name,
        message: error.message,
        apiUrl: API_URL,
        platform: window.location.origin
      });
      throw error;
    }
  };



  // Log out the current user and return to the authentication screen.



  const handleLogout = async () => {



    try {



      await fetch(`${API_URL}/api/logout`, {



        method: 'POST',



        credentials: 'include'



      })



    } catch (error) {



      console.error('Logout error:', error)



    }







    setUser(null)



    setPage('dashboard')



    setSidebarOpen(false)



    setShoppingItems([])



    setPurchased([])



    setSelectedShoppingItem(null)



  }







  // Fetch the notifications used by the top-right bell.



  // These are derived from the same user-scoped AI predictions and products



  // used by the Smart Notifications page.



  const fetchHeaderNotifications = useCallback(async () => {



    if (!user) return







    setHeaderNotificationsLoading(true)







    try {



      const [predictionResponse, productResponse, settingsResponse] = await Promise.all([



        fetch(`${API_URL}/ai-predictions`, {



          credentials: 'include'



        }),



        fetch(`${API_URL}/`, {



          credentials: 'include'



        }),



        fetch(`${API_URL}/reminder-settings`, {



          credentials: 'include'



        })



      ])







      const predictionData = predictionResponse.ok



        ? await predictionResponse.json()



        : { predictions: [] }







      const productData = productResponse.ok



        ? await productResponse.json()



        : []







      const settingsData = settingsResponse.ok



        ? await settingsResponse.json()



        : {}







      const predictions = predictionData.predictions || []



      const products = Array.isArray(productData)



        ? productData



        : productData.products || []







      const expiryEnabled = settingsData.expiry_notifications_enabled !== false



      const lowStockEnabled = settingsData.low_stock_notifications_enabled !== false



      const expiryDays = Number(settingsData.expiry_reminder_days ?? 3)







      const today = new Date()



      today.setHours(0, 0, 0, 0)







      const nextNotifications = []







      if (lowStockEnabled) {



        predictions.forEach((item) => {



          const days = Number(item.days_remaining)







          if (



            item.days_remaining !== null &&



            item.days_remaining !== undefined &&



            Number.isFinite(days) &&



            days >= 0 &&



            days < 7



          ) {



            nextNotifications.push({



              id: `header-stock-${item.product_id}`,



              icon: '⚠️',



              title: `${item.product_name} is running low`,



              message:



                days === 0



                  ? `${item.product_name} may run out today.`



                  : `${item.product_name} may finish in ${days} day(s).`,



              type: days <= 2 ? 'Urgent' : 'Reminder',



              priority: days <= 2 ? 1 : 2



            })



          }



        })



      }







      if (expiryEnabled) {



        products.forEach((product) => {



          const expiryValue = product.expiry_date || product.expiryDate







          if (!expiryValue) return







          const expiryDate = new Date(`${expiryValue}T00:00:00`)



          if (Number.isNaN(expiryDate.getTime())) return







          const difference = expiryDate.getTime() - today.getTime()



          const daysToExpiry = Math.ceil(



            difference / (1000 * 60 * 60 * 24)



          )







          if (daysToExpiry >= 0 && daysToExpiry <= expiryDays) {



            nextNotifications.push({



              id: `header-expiry-${product.id}`,



              icon: '📅',



              title: `${product.product_name} is nearing expiry`,



              message:



                daysToExpiry === 0



                  ? `${product.product_name} expires today.`



                  : `${product.product_name} expires in ${daysToExpiry} day(s).`,



              type: 'Expiry',



              priority: daysToExpiry <= 1 ? 1 : 2



            })



          }



        })



      }







      nextNotifications.sort((a, b) => a.priority - b.priority)



      setHeaderNotifications(nextNotifications)



    } catch (error) {



      console.error('Header notification error:', error)



      setHeaderNotifications([])



    } finally {



      setHeaderNotificationsLoading(false)



    }



  }, [user])







  // Load the bell notifications after login and refresh them periodically.



  useEffect(() => {



    if (!user) {



      setHeaderNotifications([])



      return undefined



    }







    fetchHeaderNotifications()



    const interval = window.setInterval(fetchHeaderNotifications, 60000)







    return () => window.clearInterval(interval)



  }, [user, fetchHeaderNotifications])







  // Close the notification dropdown when clicking outside it.



  useEffect(() => {



    const handleOutsideClick = (event) => {



      if (



        notificationDropdownRef.current &&



        !notificationDropdownRef.current.contains(event.target)



      ) {



        setShowNotificationDropdown(false)



      }



    }







    document.addEventListener('mousedown', handleOutsideClick)



    return () => document.removeEventListener('mousedown', handleOutsideClick)



  }, [])







  const handleNotificationBell = async () => {



    const nextOpen = !showNotificationDropdown



    setShowNotificationDropdown(nextOpen)







    if (nextOpen) {



      await fetchHeaderNotifications()



    }



  }







  const handleViewAllNotifications = () => {



    setShowNotificationDropdown(false)



    setPage('notifications')



  }







  // Fetch Shopping List and the current user's products.



  // Product information is used to enrich shopping-list rows with



  // category, unit and price when only product_id is returned.



  const fetchShoppingList = useCallback(async () => {



    setShoppingLoading(true)



    setShoppingError('')







    try {



      const [shoppingResponse, productsResponse] = await Promise.all([



        fetch(`${API_URL}/shopping-list`, {



          credentials: 'include'



        }),



        fetch(`${API_URL}/`, {



          credentials: 'include'



        })



      ])







      if (!shoppingResponse.ok) {



        throw new Error('Failed to fetch shopping list')



      }







      const shoppingData = await shoppingResponse.json()







      const rawItems = Array.isArray(shoppingData)



        ? shoppingData



        : shoppingData.shopping_list || shoppingData.items || []







      let products = []







      if (productsResponse.ok) {



        const productsData = await productsResponse.json()



        products = Array.isArray(productsData)



          ? productsData



          : productsData.products || []



      }







      setProductCatalog(products)







      const productMap = new Map(



        products.map(product => [String(product.id), product])



      )







      const items = rawItems.map(item => {



        const product = productMap.get(String(item.product_id))







        return {



          ...item,



          product_name:



            item.product_name ||



            product?.product_name ||



            'Product',



          category:



            item.category ||



            product?.category ||



            '',



          unit:



            item.unit ||



            product?.unit ||



            '',



          price:



            item.price ??



            item.unit_price ??



            product?.price ??



            null



        }



      })







      setShoppingItems(items)







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







  // Only share/download the items that still need to be purchased.



  const getPendingShoppingItems = () => {



    return shoppingItems.filter(



      item =>



        !purchased.includes(item.id) &&



        item.status !== 'Purchased'



    )



  }







  const getQuantity = (item) => {



    const value = Number(



      item.required_quantity ??



      item.quantity ??



      0



    )







    return Number.isFinite(value) ? value : 0



  }







  const formatQuantity = (item) => {



    const value = getQuantity(item)







    if (value === 0) return '0'







    return Number.isInteger(value)



      ? String(value)



      :  value.toFixed(2).replace(/\.?0+$/, '');



  }







  const getItemUnitPrice = (item) => {



    const value =



      item.unit_price ??



      item.price ??



      item.product_price ??



      null







    const number = Number(value)







    return Number.isFinite(number) && number > 0



      ? number



      : 0



  }







  const getItemEstimatedCost = (item) => {



    const explicitTotal =



      item.total_price ??



      item.estimated_price ??



      null







    const totalNumber = Number(explicitTotal)







    if (



      Number.isFinite(totalNumber) &&



      totalNumber > 0



    ) {



      return totalNumber



    }







    return (



      getQuantity(item) *



      getItemUnitPrice(item)



    )



  }







  const getEstimatedShoppingCost = () => {



    return getPendingShoppingItems().reduce(



      (total, item) =>



        total + getItemEstimatedCost(item),



      0



    )



  }







  const formatMoney = (amount) => {



    const number = Number(amount) || 0



    return `₹${number.toFixed(2)}`



  }







  // Grand WhatsApp/share message.



  // Only the things that need to be bought are included:



  // product name + required quantity/unit.



  // Barcode, category and database-only details are intentionally excluded.



  const buildShoppingMessage = () => {



    const items = getPendingShoppingItems()



    const total = getEstimatedShoppingCost()







    if (items.length === 0) {



      return [



        ' *🏡 HOMYCARE*',



        '',



        '*🛒 SHOPPING LIST*',



        '━━━━━━━━━━━━━━━━━━',



        '',



        '✨ Your shopping list is currently empty.',



        '',



        '💚 \\\_Smarter Homes • Happier Families\\\_'



      ].join('\n')



    }







    const lines = items.map((item, index) => {



      const quantity = formatQuantity(item)



      const unit = item.unit



        ? ` ${item.unit}`



        : ''







      return (



        `${index + 1}. 🛍️ *${item.product_name}* — ` +



        `${quantity}${unit}`



      )



    })







    return [



      ' *🏡 HOMYCARE*',



      '*🛒 SHOPPING LIST*',



      '━━━━━━━━━━━━━━━━━━',



      `🧺 *Items to Buy:* ${items.length}`,



      total > 0



        ? `💰 *Estimated Total:* ${formatMoney(total)}`



        : '💰 *Estimated Total:* Not available',



      '',



      '*✨ PLEASE BUY:*',



      ...lines,



      '',



      '━━━━━━━━━━━━━━━━━━',



      '💚 \\\_Planned with HomyCare\\\_',



      '🏠 \\\_Smarter Homes • Happier Families\\\_'



    ].join('\n')



  }







  // Use the device's native share sheet when available.



  const handleNativeShare = async () => {



    const message = buildShoppingMessage()







    if (navigator.share) {



      try {



        await navigator.share({



          title: '🏡 HomyCare – Shopping List',



          text: message



        })



      } catch (error) {



        if (error?.name !== 'AbortError') {



          console.error(



            'Native share error:',



            error



          )



        }



      }







      return



    }







    handleWhatsAppShare()



  }







  // Direct WhatsApp sharing.



  const handleWhatsAppShare = () => {



    const message = buildShoppingMessage()







    const whatsappUrl =



      `https\\://wa.me/?text=${encodeURIComponent(message)}`







    window.open(



      whatsappUrl,



      '\\\_blank',



      'noopener,noreferrer'



    )







    setShowShareModal(false)



  }







  // Email sharing.



  const handleEmailShare = () => {



    const message = buildShoppingMessage()



    const subject =



      '🏡 HomyCare – Shopping List'







    const mailto =



      `mailto:?subject=${encodeURIComponent(subject)}` +



      `&body=${encodeURIComponent(message)}`







    window.location.href = mailto



    setShowShareModal(false)



  }







  // Download the pending list as a professional PDF.



  const handleDownloadShoppingPDF = () => {



    const items = getPendingShoppingItems()



    const total = getEstimatedShoppingCost()







    const doc = new jsPDF()



    const pageWidth =



      doc.internal.pageSize.getWidth()



    const pageHeight =



      doc.internal.pageSize.getHeight()







    // Green HomyCare header.



    doc.setFillColor(21, 131, 79)



    doc.rect(



      0,



      0,



      pageWidth,



      38,



      'F'



    )







    doc.setTextColor(255, 255, 255)



    doc.setFont(



      'helvetica',



      'bold'



    )



    doc.setFontSize(22)



    doc.text(



      'HOMYCARE',



      18,



      15



    )







    doc.setFont(



      'helvetica',



      'normal'



    )



    doc.setFontSize(9)



    doc.text(



      'Smarter Homes • Happier Families',



      18,



      25



    )







    doc.setTextColor(7, 91, 60)



    doc.setFont(



      'helvetica',



      'bold'



    )



    doc.setFontSize(18)



    doc.text(



      'Shopping List',



      18,



      53



    )







    doc.setFont(



      'helvetica',



      'normal'



    )



    doc.setFontSize(10)



    doc.setTextColor(



      90,



      100,



      95



    )







    doc.text(



      `Items to buy: ${items.length}`,



      18,



      61



    )







    if (total > 0) {



      doc.text(



        `Estimated total: ${formatMoney(total)}`,



        pageWidth - 78,



        61



      )



    }







    if (items.length === 0) {



      doc.setFillColor(



        247,



        251,



        248



      )







      doc.roundedRect(



        16,



        76,



        pageWidth - 32,



        35,



        4,



        4,



        'F'



      )







      doc.setFont(



        'helvetica',



        'bold'



      )



      doc.setFontSize(13)



      doc.setTextColor(



        55,



        75,



        65



      )







      doc.text(



        'Your shopping list is empty.',



        24,



        97



      )



    } else {



      const startY = 76







      doc.setFillColor(



        232,



        247,



        235



      )







      doc.roundedRect(



        16,



        startY,



        pageWidth - 32,



        13,



        3,



        3,



        'F'



      )







      doc.setTextColor(



        7,



        91,



        60



      )



      doc.setFont(



        'helvetica',



        'bold'



      )



      doc.setFontSize(10)







      doc.text(



        '#',



        23,



        startY + 9



      )







      doc.text(



        'What to Buy',



        40,



        startY + 9



      )







      doc.text(



        'Quantity',



        pageWidth - 63,



        startY + 9



      )







      let y = startY + 25







      items.forEach((item, index) => {



        if (y > pageHeight - 35) {



          doc.addPage()



          y = 25



        }







        if (index % 2 === 0) {



          doc.setFillColor(



            249,



            253,



            250



          )







          doc.roundedRect(



            16,



            y - 8,



            pageWidth - 32,



            14,



            2,



            2,



            'F'



          )



        }







        const quantity =



          formatQuantity(item)







        const unit =



          item.unit



            ? ` ${item.unit}`



            : ''







        doc.setTextColor(



          50,



          60,



          55



        )







        doc.setFont(



          'helvetica',



          'bold'



        )



        doc.setFontSize(10)







        doc.text(



          String(index + 1),



          23,



          y



        )







        doc.setFont(



          'helvetica',



          'normal'



        )







        doc.text(



          String(



            item.product_name ||



            'Product'



          ),



          40,



          y



        )







        doc.text(



          `${quantity}${unit}`,



          pageWidth - 63,



          y



        )







        y += 15



      })







      if (total > 0) {



        if (y > pageHeight - 48) {



          doc.addPage()



          y = 25



        }







        doc.setFillColor(



          232,



          247,



          235



        )







        doc.roundedRect(



          16,



          y + 2,



          pageWidth - 32,



          18,



          4,



          4,



          'F'



        )







        doc.setTextColor(



          7,



          91,



          60



        )







        doc.setFont(



          'helvetica',



          'bold'



        )



        doc.setFontSize(11)







        doc.text(



          'Estimated Total',



          24,



          y + 14



        )







        doc.text(



          formatMoney(total),



          pageWidth - 53,



          y + 14



        )



      }



    }







    const footerY =



      pageHeight - 16







    doc.setDrawColor(



      210,



      230,



      215



    )







    doc.line(



      18,



      footerY - 5,



      pageWidth - 18,



      footerY - 5



    )







    doc.setFont(



      'helvetica',



      'normal'



    )



    doc.setFontSize(8)



    doc.setTextColor(



      110,



      120,



      115



    )







    doc.text(



      'Generated by HomyCare • Smarter Homes • Happier Families',



      18,



      footerY



    )







    doc.save(



      'HomyCare_Shopping_List.pdf'



    )



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



          { method: 'DELETE', credentials: 'include' }



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
      id: 'cooking-prediction',
      icon: '🍲',
      label: 'Cooking-Based Prediction'
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
  id: 'meal-planner',
  icon: <CalendarDays size={20} />,
  label: 'Meal Planner'
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
      id: 'settings',
      icon: '⚙️',
      label: 'Settings'
    },



    {



      id: 'analytics',



      icon: '📈',



      label: 'Analytics'



    },
    ...(user?.role === 'admin'
  ? [{
      id: 'admin-ingredients',
      icon: '🥬',
      label: 'Ingredient Management',
    }]
  : []),
    ...(user?.role === 'admin'
  ? [{
      id: 'admin-images',
      icon: '🛡️',
      label: 'Admin Image Gallery',
    }]
  : []),
    ...(user?.role === 'admin'
  ? [{
      id: 'meal-images',
      icon: '🍲',
      label: 'Add Meal Image',
    }]
  : [])



  ]







  if (authLoading) {



    return <div className="auth-loading">Loading HomyCare...</div>



  }







  if (!user) {



    return <Auth onAuthSuccess={handleAuthSuccess} />



  }







  return (



    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>







      {/* Mobile overlay */}



      {sidebarOpen && (



        <button



          className="sidebar-overlay"



          type="button"



          aria-label="Close navigation menu"



          onClick={closeMobileSidebar}



        />



      )}







      {/* Sidebar */}



      <aside



        id="home-needs-sidebar"



        className={`sidebar ${sidebarOpen ? 'sidebar-mobile-open' : ''}`}



      >







        {/* Mobile close button */}



        <button



          className="sidebar-close-button"



          type="button"



          onClick={closeMobileSidebar}



          aria-label="Close navigation menu"



        >



          ✕



        </button>







        {/* Logo */}



        <div className="sidebar-logo">



          <div className="logo-icon">



            🏠



          </div>







          <div className="logo-text">



            <h1>HomyCare</h1>



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



              onClick={() => {



                setPage(item.id)



                closeMobileSidebar()



              }}



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



            onClick={() => {



              setPage('add')



              closeMobileSidebar()



            }}



          >



            <span className="nav-icon">➕</span>



            <span className="nav-label">Add Product</span>



          </button>







          {/* Barcode Scanner */}



          <button



            className={`nav-item ${



              page === 'barcode' ? 'active' : ''



            }`}



            onClick={() => {



              setPage('barcode')



              closeMobileSidebar()



            }}



          >



            <span className="nav-icon">📷</span>



            <span className="nav-label">Barcode Scanner</span>



          </button>







          {/* Shopping List */}



          <button



            className={`nav-item ${



              page === 'shopping' ? 'active' : ''



            }`}



            onClick={() => {



              setPage('shopping')



              closeMobileSidebar()



            }}



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



          onClick={() => {



            setPage('profile')



            closeMobileSidebar()



          }}



        >



          <div className="profile-icon">



            👤



          </div>







          <div className="profile-info">



            <strong>{user?.name || 'User'}</strong>



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







          {/* Mobile hamburger button */}



          <button



            className="mobile-menu-button"



            type="button"



            onClick={() => setSidebarOpen(true)}



            aria-label="Open navigation menu"



            aria-expanded={sidebarOpen}



            aria-controls="home-needs-sidebar"



          >



            ☰



          </button>







          {/* HomyCare Brand */}



          <button



            className="topbar-brand"



            type="button"



            onClick={() => setPage('dashboard')}



            aria-label="Go to HomyCare Dashboard"



          >



            <span className="topbar-brand-mark" aria-hidden="true">



              <svg viewBox="0 0 64 64" role="img">



                <path



                  d="M9 30.5 32 10l23 20.5v22A4.5 4.5 0 0 1 50.5 57h-37A4.5 4.5 0 0 1 9 52.5z"



                  fill="#fff"



                />



                <path



                  d="M7 31 32 8l25 23-3.4 3.7L32 14.2 10.4 34.7z"



                  fill="#15834f"



                />



                <path



                  d="M18 33.5h28V56H18z"



                  fill="#f5a623"



                />



                <path



                  d="M28 56V42h8v14"



                  fill="#fff"



                />



                <circle cx="44" cy="41" r="2.2" fill="#15834f" />



                <path



                  d="M36 16c4.2-8.8 13.1-9.7 18.2-7.4-1.5 6.8-7.2 11.8-15.9 11.1"



                  fill="#2eae5b"



                />



                <path



                  d="M38.5 18.8c3.6-4.3 7.2-7 12.8-9.2"



                  fill="none"



                  stroke="#075b3c"



                  strokeWidth="1.8"



                  strokeLinecap="round"



                />



              </svg>



            </span>







            <span className="topbar-brand-text">



              <strong>HomyCare</strong>



              <span>Smarter Homes • Happier Families</span>



            </span>



          </button>







          {/* Top Right Actions */}



          <div className="topbar-actions">







            <div



              className="notification-wrapper"



              ref={notificationDropdownRef}



            >



              <button



                className={`notification-button ${



                  showNotificationDropdown ? 'notification-open' : ''



                }`}



                type="button"



                onClick={handleNotificationBell}



                aria-label="Open notifications"



                aria-expanded={showNotificationDropdown}



                aria-haspopup="true"



              >



                <span className="notification-bell-icon">🔔</span>



                {headerNotifications.length > 0 && (



                  <span className="notification-count">



                    {headerNotifications.length > 9 ? '9+' : headerNotifications.length}



                  </span>



                )}



              </button>







              {showNotificationDropdown && (



                <div className="notification-dropdown">



                  <div className="notification-dropdown-header">



                    <div>



                      <strong>Notifications</strong>



                      <span>



                        {headerNotifications.length



                          ? `${headerNotifications.length} update${headerNotifications.length === 1 ? '' : 's'} for your home`



                          : 'Your household is looking good'}



                      </span>



                    </div>



                    <button



                      type="button"



                      className="notification-refresh"



                      onClick={fetchHeaderNotifications}



                      disabled={headerNotificationsLoading}



                      aria-label="Refresh notifications"



                    >



                      ↻



                    </button>



                  </div>







                  <div className="notification-dropdown-list">



                    {headerNotificationsLoading && (



                      <div className="notification-dropdown-empty">



                        <div className="notification-loading-icon">⏳</div>



                        <strong>Checking your home...</strong>



                        <span>Loading the latest alerts.</span>



                      </div>



                    )}







                    {!headerNotificationsLoading && headerNotifications.length === 0 && (



                      <div className="notification-dropdown-empty">



                        <div className="notification-success-icon">✓</div>



                        <strong>Everything looks good</strong>



                        <span>No expiry or low-stock alerts right now.</span>



                      </div>



                    )}







                    {!headerNotificationsLoading && headerNotifications.length > 0 && (



                      headerNotifications.slice(0, 5).map((notification) => (



                        <button



                          type="button"



                          className={`header-notification-item ${notification.type.toLowerCase()}`}



                          key={notification.id}



                          onClick={handleViewAllNotifications}



                        >



                          <span className="header-notification-icon">



                            {notification.icon}



                          </span>



                          <span className="header-notification-content">



                            <strong>{notification.title}</strong>



                            <span>{notification.message}</span>



                          </span>



                          <span className="header-notification-arrow">›</span>



                        </button>



                      ))



                    )}



                  </div>







                  <div className="notification-dropdown-footer">



                    <button



                      type="button"



                      onClick={handleViewAllNotifications}



                    >



                      View All Notifications <span>→</span>



                    </button>



                  </div>



                </div>



              )}



            </div>







            <div className="topbar-divider"></div>







            <button



              className="top-profile"



              type="button"



              onClick={() => setPage('profile')}



              aria-label="Open profile"



            >



              <div className="top-profile-icon">



                👤



              </div>







              <span>{user?.name || 'User'}</span>







              <span className="dropdown-arrow">



                ▾



              </span>



            </button>







            <button



              className="logout-button"



              type="button"



              onClick={handleLogout}



            >



              Logout



            </button>







          </div>







        </header>







        {/* Page Content */}



        <main className="main">







          {page === 'dashboard' && <Dashboard onNavigate={setPage} />}







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



                      credentials: 'include',



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

          {page === 'cooking-prediction' && <CookingPrediction />}







          {page === 'recommendations' && (



            <PurchaseRecommendation />



          )}







          {page === 'meals' && (



            <MealRecommendation expiringProduct={expiringProduct} />



          )}
          {page === 'meal-planner' && <MealPlanner />}







          {page === 'expiry' && <ExpiryTracking />}







          {page === 'notifications' && (



            <SmartNotifications />



          )}

          {page === 'settings' && <Settings />}







          {page === 'analytics' && (



            <AnalyticsDashboard />



          )}
          {page === 'admin-ingredients' && user?.role === 'admin' && (
            <AdminIngredientManagement />
          )}
          {page === 'admin-images' && user?.role === 'admin' && (
            <AdminImageGallery />
          )}
          {page === 'meal-images' && user?.role === 'admin' && (
            <MealImageGallery />
          )}







          {page === 'profile' && <Profile />}







          {page === 'barcode' && (



  <BarcodeScanner



    onAddNewProduct={(scannedBarcode) => {



      setInitialBarcode(scannedBarcode)



      setPage('add')



    }}



  />



)}







          {/* Add Product */}



          {page === 'add' && (



            <>



              <div className="page-title">



                <h1>➕ Add Product</h1>



                <p>



                  Add a household item to HomyCare



                </p>



              </div>







              <AddProduct



  onSave={addProduct}



  initialBarcode={initialBarcode}



/>



            </>



          )}







          {/* Shopping List */}



          {page === 'shopping' && (



            <>



              <div className="shopping-page">







                <div className="shopping-page-header">



                  <div className="shopping-heading">



                    <div className="shopping-heading-icon">🛒</div>



                    <div>



                      <h1>Shopping List</h1>



                      <p>Products you need to buy for your home</p>



                    </div>



                  </div>



                </div>







                {!shoppingLoading && !shoppingError && (



                  <>



                    <div className="shopping-summary-grid">



                      <div className="shopping-summary-card">



                        <div className="summary-icon orange">🛒</div>



                        <div>



                          <strong>{getPendingShoppingItems().length}</strong>



                          <span>Items to Buy</span>



                        </div>



                      </div>







                      <div className="shopping-summary-card">



                        <div className="summary-icon green">₹</div>



                        <div>



                          <strong>



                            {getEstimatedShoppingCost() > 0



                              ? formatMoney(getEstimatedShoppingCost())



                              : '—'}



                          </strong>



                          <span>Estimated Cost</span>



                        </div>



                      </div>







                      <div className="shopping-summary-card">



                        <div className="summary-icon red">📦</div>



                        <div>



                          <strong>



                            {new Set(



                              getPendingShoppingItems()



                                .map(item => item.category)



                                .filter(Boolean)



                            ).size || '—'}



                          </strong>



                          <span>Categories</span>



                        </div>



                      </div>



                    </div>







                    <section className="shopping-items-card">







                      <div className="shopping-card-header">



                        <div className="shopping-card-title">



                          <div className="shopping-card-icon">🛒</div>



                          <div>



                            <h2>Items to Buy</h2>



                            <p>List of products you need to purchase</p>



                          </div>



                        </div>







                        <div className="shopping-card-actions">



                            <button

                              className="add-to-shopping-list-button"

                              type="button"

                              onClick={() => setShowAddShoppingModal(true)}

                            >

                              ＋ Add to List

                            </button>

                          <button



                            className="share-list-button"



                            type="button"



                            onClick={() => setShowShareModal(true)}



                            disabled={getPendingShoppingItems().length === 0}



                          >



                            📤 Share List



                          </button>







                          <button



                            className="download-pdf-button"



                            type="button"



                            onClick={handleDownloadShoppingPDF}



                          >



                            📄 Download PDF



                          </button>



                        </div>



                      </div>







                      {shoppingError && (



                        <div className="shopping-error">



                          {shoppingError}



                        </div>



                      )}







                      {shoppingLoading && (



                        <div className="shopping-empty-state">



                          <div className="empty-state-icon">⏳</div>



                          <h3>Loading your shopping list...</h3>



                          <p>Please wait while HomyCare loads your items.</p>



                        </div>



                      )}







                      {!shoppingLoading &&



                        !shoppingError &&



                        shoppingItems.length === 0 && (



                          <div className="shopping-empty-state">



                            <div className="empty-state-icon">🛒</div>



                            <h3>Your shopping list is empty</h3>



                            <p>Add products or accept an AI purchase recommendation to see items here.</p>



                          </div>



                        )}







                      {!shoppingLoading &&



                        !shoppingError &&



                        shoppingItems.length > 0 && (



                          <div className="shopping-table-wrap">



                            <table className="shopping-table">



                              <thead>



                                <tr>



                                  <th className="check-column">✓</th>



                                  <th>#</th>



                                  <th>Product</th>



                                  <th>Quantity</th>



                                  <th>Estimated Cost</th>



                                  <th>Category</th>



                                  <th></th>



                                </tr>



                              </thead>







                              <tbody>



                                {shoppingItems.map((item, index) => {



                                  const isPurchased = purchased.includes(item.id)







                                  const quantity =



                                    item.required_quantity ??



                                    item.quantity ??



                                    ''







                                  const unit = item.unit || ''







                                  const price = getItemEstimatedCost(item)







                                  return (



                                    <tr



                                      key={item.id}



                                      className={isPurchased ? 'shopping-row purchased-row' : ''}



                                    >



                                      <td className="check-column">



                                        <input



                                          type="checkbox"



                                          checked={isPurchased}



                                          onChange={() => handlePurchaseChange(item)}



                                          aria-label={`Mark ${item.product_name} as purchased`}



                                        />



                                      </td>







                                      <td className="number-cell">



                                        {index + 1}



                                      </td>







                                      <td>



                                        <div className="shopping-product">







                                          <div>



                                            <strong>{item.product_name}</strong>



                                            {isPurchased && (



                                              <span className="purchased-text">



                                                ✓ Purchased



                                              </span>



                                            )}



                                          </div>



                                        </div>



                                      </td>







                                      <td>



                                        <strong>{quantity}</strong>{' '}



                                        <span className="unit-text">{unit}</span>



                                      </td>







                                      <td className="price-cell">



                                        {price > 0



                                          ? formatMoney(price)



                                          : '—'}



                                      </td>







                                      <td>



                                        {item.category ? (



                                          <span className="category-pill">



                                            {item.category}



                                          </span>



                                        ) : (



                                          <span className="category-muted">



                                            Not specified



                                          </span>



                                        )}



                                      </td>







                                      <td>



                                        <button



                                          className="delete-shopping-item"



                                          type="button"



                                          onClick={async () => {



                                            const confirmed = window.confirm(



                                              `Remove ${item.product_name} from the shopping list?`



                                            )







                                            if (!confirmed) return







                                            try {



                                              const response = await fetch(



                                                `${API_URL}/shopping-list/${item.id}`,



                                                {



                                                  method: 'DELETE',



                                                  credentials: 'include'



                                                }



                                              )







                                              if (!response.ok) {



                                                throw new Error('Delete failed')



                                              }







                                              await fetchShoppingList()



                                            } catch (error) {



                                              console.error('Delete shopping item error:', error)



                                              setShoppingError(



                                                'Unable to remove this shopping item.'



                                              )



                                            }



                                          }}



                                          aria-label={`Delete ${item.product_name}`}



                                        >



                                          🗑️



                                        </button>



                                      </td>



                                    </tr>



                                  )



                                })}



                              </tbody>



                            </table>



                          </div>



                        )}







                      {!shoppingLoading && !shoppingError && shoppingItems.length > 0 && (



                        <div className="shopping-bottom-actions">



                          <button



                            className="refresh-shopping-button"



                            type="button"



                            onClick={fetchShoppingList}



                          >



                            🔄 Refresh List



                          </button>







                          <button



                            className="delete-all-shopping-button"



                            type="button"



                            onClick={handleDeleteAll}



                          >



                            🗑️ Delete All



                          </button>



                        </div>



                      )}



                    </section>



                  </>



                )}







                {showShareModal && (



                  <div



                    className="share-modal-overlay"



                    onClick={(event) => {



                      if (



                        event.target ===



                        event.currentTarget



                      ) {



                        setShowShareModal(false)



                      }



                    }}



                  >



                    <div



                      className="share-modal"



                      role="dialog"



                      aria-modal="true"



                    >



                      <button



                        className="share-modal-close"



                        type="button"



                        onClick={() =>



                          setShowShareModal(false)



                        }



                        aria-label="Close share dialog"



                      >



                        ✕



                      </button>







                      <div className="share-modal-heading">



                        <div className="share-modal-icon">



                          🛒



                        </div>







                        <div>



                          <h2>



                            Share Your Shopping List



                          </h2>







                          <p>



                            Send your grand shopping



                            plan to family or friends.



                          </p>



                        </div>



                      </div>







                      <div className="share-grand-banner">



                        <div className="share-grand-title">



                          🏡 HOMYCARE



                        </div>







                        <div className="share-grand-subtitle">



                          🛍️ Everything you need to buy



                        </div>



                      </div>







                      <div className="share-options">



                        <button



                          type="button"



                          className="share-option whatsapp"



                          onClick={



                            handleWhatsAppShare



                          }



                        >



                          <span>🟢</span>



                          <strong>



                            WhatsApp



                          </strong>



                          <small>



                            Share instantly



                          </small>



                        </button>







                        <button



                          type="button"



                          className="share-option email"



                          onClick={



                            handleEmailShare



                          }



                        >



                          <span>✉️</span>



                          <strong>



                            Email



                          </strong>



                          <small>



                            Send the list



                          </small>



                        </button>







                        <button



                          type="button"



                          className="share-option more"



                          onClick={



                            handleNativeShare



                          }



                        >



                          <span>📤</span>



                          <strong>



                            More



                          </strong>



                          <small>



                            Other apps



                          </small>



                        </button>



                      </div>







                      <div className="share-preview">



                        <div className="share-preview-top">



                          <div>



                            <div className="share-preview-title">



                              ✨ Preview Message



                            </div>







                            <div className="share-preview-note">



                              Only items you need to



                              buy are included.



                            </div>



                          </div>







                          <div className="share-preview-count">



                            {



                              getPendingShoppingItems()



                                .length



                            }



                          </div>



                        </div>







                        <div className="share-preview-list">



                          {getPendingShoppingItems()



                            .length === 0 ? (



                            <div className="share-preview-item">



                              <span>✓</span>



                              <strong>



                                Your shopping list



                                is empty.



                              </strong>



                            </div>



                          ) : (



                            getPendingShoppingItems().map(



                              (item, index) => (



                                <div



                                  className="share-preview-item"



                                  key={item.id}



                                >



                                  <span>



                                    {index + 1}



                                  </span>







                                  <strong>



                                    {



                                      item.product_name



                                    }



                                  </strong>







                                  <em>



                                    {



                                      formatQuantity(



                                        item



                                      )



                                    }



                                    {item.unit



                                      ? ` ${item.unit}`



                                      : ''}



                                  </em>



                                </div>



                              )



                            )



                          )}



                        </div>







                        <div className="share-preview-total">



                          <span>



                            💰 Estimated Total



                          </span>







                          <strong>



                            {getEstimatedShoppingCost() >



                            0



                              ? formatMoney(



                                  getEstimatedShoppingCost()



                                )



                              : 'Not available'}



                          </strong>



                        </div>







                        <div className="share-preview-footer">



                          💚 Smarter Homes • Happier



                          Families



                        </div>



                      </div>







                      <div className="share-modal-footer">



                        <button



                          className="share-pdf-modal-button"



                          type="button"



                          onClick={() => {



                            handleDownloadShoppingPDF()



                            setShowShareModal(false)



                          }}



                        >



                          📄 Download PDF



                        </button>







                        <button



                          className="share-cancel-button"



                          type="button"



                          onClick={() =>



                            setShowShareModal(false)



                          }



                        >



                          Close



                        </button>



                      </div>



                    </div>



                  </div>



                )}







              </div>



                          {showAddShoppingModal && (
                <AddToShoppingList
                  products={productCatalog}
                  onClose={() => setShowAddShoppingModal(false)}
                  onAdded={async () => {
                    await fetchShoppingList()
                    setShowAddShoppingModal(false)
                  }}
                />
              )}

</>





          )}







        </main>







      </div>



      {/* Mobile bottom navigation: five main destinations */}

      <nav className="mobile-bottom-nav" aria-label="Main navigation">

        <button

          type="button"

          className={`mobile-nav-item ${page === 'dashboard' ? 'active' : ''}`}

          onClick={() => setPage('dashboard')}

          aria-current={page === 'dashboard' ? 'page' : undefined}

        >

          <span className="mobile-nav-icon" aria-hidden="true">⌂</span>

          <span>Dashboard</span>

        </button>



        <button

          type="button"

          className={`mobile-nav-item ${page === 'ai' ? 'active' : ''}`}

          onClick={() => setPage('ai')}

          aria-current={page === 'ai' ? 'page' : undefined}

        >

          <span className="mobile-nav-icon" aria-hidden="true">✦</span>

          <span>AI Prediction</span>

        </button>



        <button

          type="button"

          className={`mobile-nav-item mobile-nav-add ${page === 'add' ? 'active' : ''}`}

          onClick={() => {

            setInitialBarcode('')

            setPage('add')

          }}

          aria-label="Add product"

          aria-current={page === 'add' ? 'page' : undefined}

        >

          <span className="mobile-add-circle" aria-hidden="true">+</span>

          <span>Add</span>

        </button>



        <button

          type="button"

          className={`mobile-nav-item ${page === 'meals' ? 'active' : ''}`}

          onClick={() => setPage('meals')}

          aria-current={page === 'meals' ? 'page' : undefined}

        >

          <span className="mobile-nav-icon" aria-hidden="true">♨</span>

          <span>Meals</span>

        </button>



        <button

          type="button"

          className={`mobile-nav-item ${page === 'expiry' ? 'active' : ''}`}

          onClick={() => setPage('expiry')}

          aria-current={page === 'expiry' ? 'page' : undefined}

        >

          <span className="mobile-nav-icon" aria-hidden="true">◷</span>

          <span>Expiry</span>

        </button>

      </nav>



    </div>



  )



}







export default App