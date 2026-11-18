import { useEffect, useState } from 'react'

import './MealRecommendation.css'

import API_URL from '../api'

import MealImageGallery from './MealImageGallery'
import GlobalRecipes from './GlobalRecipes'

const recipes = []

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Canonical ingredient matching shared by availability checks.
// Keep distinct products (Rice vs Basmati Rice) distinct, but accept
// the common spelling variant Basmati/Basmathi.
function canonicalIngredientName(name) {
  let value = normalizeName(name)
  value = value.replace(/basmathi/g, 'basmati')
  return value
}

function isHttpImageUrl(value) {

  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))

}

function getIngredientEmoji(name) {

  const value = String(name || '').toLowerCase();

  const icons = [

    [/rice|basmati/, '🍚'], [/water|milk|juice/, '🧴'], [/onion/, '🧅'],

    [/tomato/, '🍅'], [/ginger/, '🫚'], [/oil|ghee/, '🫙'], [/salt/, '🧂'],

    [/potato/, '🥔'], [/tomato/, '🍅'], [/egg/, '🥚'], [/bread/, '🍞'],

    [/carrot/, '🥕'], [/apple/, '🍎'], [/banana/, '🍌'], [/chilli|chili|pepper/, '🌶️'],

    [/garlic/, '🧄'], [/lemon/, '🍋'], [/coriander|curry leaves|mint/, '🌿'],

    [/dal|lentil|chana|gram/, '🫘'], [/flour|atta|maida/, '🌾']

  ];

  const match = icons.find(([pattern]) => pattern.test(value));

  return match ? match[1] : '🥬';

}

function getMealTimeInfo(date = new Date()) {
  const hour = date.getHours()
  let greeting = 'Good night'
  let emoji = '🌙'
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning'
    emoji = '☀️'
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon'
    emoji = '🌤️'
  } else if (hour >= 17 && hour < 21) {
    greeting = 'Good evening'
    emoji = '🌆'
  }

  // Meal recommendation windows use the device's local time.
  let mealType = 'Dinner'
  if (hour >= 5 && hour < 11) mealType = 'Breakfast'
  else if (hour >= 11 && hour < 15) mealType = 'Lunch'
  else if (hour >= 15 && hour < 19) mealType = 'Snacks'

  return { greeting, emoji, mealType }
}

function MealRecommendation({ expiringProduct = null }) {

  const [showCommunityRecipes, setShowCommunityRecipes] = useState(false)

  const [mySubmissions, setMySubmissions] = useState([])

  const [showMySubmissions, setShowMySubmissions] = useState(false)

  const [loadingSubmissions, setLoadingSubmissions] = useState(false)

  // Cooking history is loaded from the authenticated, family-scoped API.
  const [cookingHistory, setCookingHistory] = useState([])
  const [cookingHistoryLoading, setCookingHistoryLoading] = useState(false)
  const [cookingHistoryError, setCookingHistoryError] = useState('')
  const [showCookingHistory, setShowCookingHistory] = useState(false)
  const [cookingHistoryFilter, setCookingHistoryFilter] = useState('all')
  const [cookingHistoryOffset, setCookingHistoryOffset] = useState(0)
  const [cookingHistoryHasMore, setCookingHistoryHasMore] = useState(false)
  const cookingHistoryLimit = 10

  const [pendingShareMeal, setPendingShareMeal] = useState(null)

  const [sharingMeal, setSharingMeal] = useState(false)

  const [products, setProducts] = useState([])

  // Household cooking-history forecast used to flag future ingredient shortages.
  const [cookingPredictions, setCookingPredictions] = useState([])
  const [cookingForecastDays, setCookingForecastDays] = useState(30)
  const [addingForecastToShoppingList, setAddingForecastToShoppingList] = useState({})

  // AI-estimated stock is displayed in Available Ingredients, matching Product Management.
  // Actual products.quantity remains available for recipe validation and server-side cooking.
  const [estimatedStocks, setEstimatedStocks] = useState({})

  const [ingredientAliases, setIngredientAliases] = useState({})

  const [customMeals, setCustomMeals] = useState([])

  const [loading, setLoading] = useState(true)

  const [refreshingIngredients, setRefreshingIngredients] = useState(false)

  const [error, setError] = useState('')

  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [expiredCookWarning, setExpiredCookWarning] = useState(null)
  // Number of people currently being served. Recipe quantities remain stored
  // at their original base serving size and are scaled only for display/cooking.
  const [selectedMembers, setSelectedMembers] = useState(1)
  const [familyMembers, setFamilyMembers] = useState(1)
  const [membersByRecipe, setMembersByRecipe] = useState({})

  const [showAllIngredients, setShowAllIngredients] = useState(false)

  const [ingredientSearch, setIngredientSearch] = useState('')

  const [showAddForm, setShowAddForm] = useState(false)

  const [mealName, setMealName] = useState('')
  // Number of people served by the original ingredient quantities.
  const [servings, setServings] = useState('1')

  const [preparationTime, setPreparationTime] = useState('30')

  const [difficulty, setDifficulty] = useState('Easy')

  const [category, setCategory] = useState('Vegetarian')

  const [cookingType, setCookingType] = useState('Quick Meals')
  const [mealType, setMealType] = useState('Breakfast')
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [hasManuallySelectedMealType, setHasManuallySelectedMealType] = useState(false)
  const [activeMealTypeTab, setActiveMealTypeTab] = useState(() => getMealTimeInfo().mealType)
  const [updatingMealTypeId, setUpdatingMealTypeId] = useState(null)

  const timeInfo = getMealTimeInfo(currentTime)

  // Keep the greeting and automatic meal category in sync with local device time.
  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTime(new Date()), 60 * 1000)
    return () => window.clearInterval(timerId)
  }, [])

  // Automatically follow the current meal time until the user chooses a tab manually.
  useEffect(() => {
    if (!hasManuallySelectedMealType) {
      setActiveMealTypeTab(timeInfo.mealType)
    }
  }, [timeInfo.mealType, hasManuallySelectedMealType])

  const [foodFilter, setFoodFilter] = useState('All Types')

  const [cookingFilter, setCookingFilter] = useState('All Types')

  const [nonVegRestrictionDays, setNonVegRestrictionDays] = useState([])

  const [nonVegStartDate, setNonVegStartDate] = useState('')

  const [nonVegEndDate, setNonVegEndDate] = useState('')

  const [ingredients, setIngredients] = useState([

    { ingredient_name: '', quantity: '', unit: 'Kg' }

  ])

  const [preparationSteps, setPreparationSteps] = useState([''])

  const [saving, setSaving] = useState(false)

  const [formMessage, setFormMessage] = useState('')

  const [showMealGallery, setShowMealGallery] = useState(false)

  // Shared gallery, with image choices saved per user's meal

  const [mealGallery, setMealGallery] = useState([])

  const [selectedMealImage, setSelectedMealImage] = useState('')

  const [galleryLoading, setGalleryLoading] = useState(false)

  const [galleryError, setGalleryError] = useState('')

  const [openMealMenuId, setOpenMealMenuId] = useState(null)

  const [selectedMealForImage, setSelectedMealForImage] = useState(null)

  const [imagePreview, setImagePreview] = useState('')

  const [imagePreviewName, setImagePreviewName] = useState('')

  useEffect(() => {
    fetchIngredientAliases()
  }, [])

  useEffect(() => {

    // Load products, saved meals, and the household's cooking-based forecast.

    fetchProducts()

    fetchCookingConsumptionPredictions()

    fetchMeals()

    loadProfilePreferences()

    // When opened from Expiry Tracking, show all matching meal types

    // instead of applying the user's saved meal filters.

    if (expiringProduct) {

      setFoodFilter('All Types')

      setCookingFilter('All Types')

    }

    // Refresh inventory whenever a product is added or updated

    // from another page in the Home Needs app.

    const handleProductsUpdated = () => {

      fetchProducts()

      fetchCookingConsumptionPredictions()

    }

    window.addEventListener('productsUpdated', handleProductsUpdated)

    // Clean up the event listener when this component unmounts.

    return () => {

      window.removeEventListener('productsUpdated', handleProductsUpdated)

    }

  }, [expiringProduct])

  // Read preferences from the logged-in user's database row.
  // Do not use localStorage here: it can mix stale preferences between accounts
  // on the same browser and does not reflect changes saved from Profile.
  async function loadProfilePreferences() {
    try {
      const response = await fetch(`${API_URL}/user-preferences`, {
        method: 'GET',
        credentials: 'include'
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || data.error || `Unable to load preferences (${response.status})`)
      }

      const savedProfile = data.preferences || {}
      const savedFood = ['Vegetarian', 'Non-Vegetarian', 'All Types'].includes(savedProfile.food_preference)
        ? savedProfile.food_preference
        : 'Vegetarian'
      const savedCooking = ['Quick Meals', 'Healthy Meals', 'Traditional Meals', 'All Types'].includes(savedProfile.cooking_preference)
        ? savedProfile.cooking_preference
        : 'Quick Meals'
      const savedRestrictionDays = Array.isArray(savedProfile.non_veg_restriction_days)
        ? savedProfile.non_veg_restriction_days
        : []

      const rawFamilyMembers = String(savedProfile.family_members || '1')
      const parsedFamilyMembers = rawFamilyMembers === '5+' ? 5 : Number(rawFamilyMembers)
      const safeFamilyMembers = Number.isInteger(parsedFamilyMembers) && parsedFamilyMembers > 0
        ? parsedFamilyMembers
        : 1

      setFamilyMembers(safeFamilyMembers)
      setSelectedMembers(safeFamilyMembers)
      setNonVegRestrictionDays(savedRestrictionDays)
      setNonVegStartDate(savedProfile.non_veg_start_date || '')
      setNonVegEndDate(savedProfile.non_veg_end_date || '')

      // Expiry Tracking intentionally shows all food/cooking categories;
      // weekday and temporary non-veg restrictions still remain active.
      if (!expiringProduct) {
        setFoodFilter(savedFood)
        setCookingFilter(savedCooking)
      }

      setCategory(savedFood === 'Non-Vegetarian' ? 'Non-Vegetarian' : 'Vegetarian')
      setCookingType(savedCooking === 'All Types' ? 'Quick Meals' : savedCooking)
    } catch (err) {
      console.error('Unable to load database profile preferences:', err)
      setError(previous => previous || 'Could not load your saved family preferences. Please refresh or check your login.')
    }
  }

  async function fetchIngredientAliases() {
    try {
      const response = await fetch(`${API_URL}/ingredient-aliases`, { credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to load ingredient aliases')
      setIngredientAliases(data.aliases || {})
      return true
    } catch (err) {
      console.error('Ingredient alias error:', err)
      setIngredientAliases({})
      return false
    }
  }

  async function fetchProducts() {

    try {

      setLoading(true)

      setError('')

      const response = await fetch(`${API_URL}/`, { credentials: 'include' })

      if (!response.ok) {

        throw new Error('Unable to fetch products')

      }

      const data = await response.json()

      if (!Array.isArray(data)) {

        throw new Error('Invalid product data received')

      }

      setProducts(data)

      // Load the same AI stock estimates used by Product Management.
      try {
        const predictionResponse = await fetch(`${API_URL}/ai-predictions`, { credentials: 'include' })
        if (!predictionResponse.ok) throw new Error('Unable to load AI stock estimates')

        const predictionData = await predictionResponse.json()
        const stockMap = {}

        if (Array.isArray(predictionData.predictions)) {
          predictionData.predictions.forEach(prediction => {
            stockMap[prediction.product_id] =
              prediction.estimated_stock === null || prediction.estimated_stock === undefined
                ? null
                : Number(prediction.estimated_stock)
          })
        }

        setEstimatedStocks(stockMap)
      } catch (predictionError) {
        console.error('AI-estimated stock error:', predictionError)
        setEstimatedStocks({})
      }

      return true

    } catch (err) {

      console.error('Product error:', err)

      setError(

        'Unable to load ingredients. Please check whether the backend is running.'

      )

      return false

    } finally {

      setLoading(false)

    }

  }

  // Read the logged-in family's cooking-based ingredient demand forecast.
  // This endpoint is read-only and does not modify inventory or purchases.
  async function fetchCookingConsumptionPredictions() {
    try {
      const response = await fetch(
        `${API_URL}/cooking-consumption-predictions?forecast_days=30&lookback_days=90`,
        { credentials: 'include' }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to load cooking consumption predictions'
        )
      }

      setCookingPredictions(
        Array.isArray(data.predictions) ? data.predictions : []
      )
      setCookingForecastDays(Number(data.forecast_days) || 30)
      return true
    } catch (err) {
      console.error('Cooking consumption forecast error:', err)
      setCookingPredictions([])
      return false
    }
  }

  async function fetchMealGallery() {

    setGalleryLoading(true)

    setGalleryError('')

    try {

      const response = await fetch(`${API_URL}/meal-image-gallery`, { credentials: 'include' })

      const data = await response.json().catch(() => [])

      if (!response.ok) throw new Error(data.error || 'Unable to load meal images')

      const images = Array.isArray(data) ? data : (data.images || data.gallery || [])

      setMealGallery(images.filter(item => item && (item.image_url || item.imageUrl || item.url)))

    } catch (err) {

      console.error('Meal image gallery error:', err)

      setGalleryError('Could not load the shared meal image gallery.')

    } finally {

      setGalleryLoading(false)

    }

  }

  async function fetchMealImageSelections() {

    try {

      const response = await fetch(`${API_URL}/meal-images`, { credentials: 'include' })

      const data = await response.json().catch(() => [])

      if (!response.ok) throw new Error(data.error || 'Unable to load saved meal images')

      const rows = Array.isArray(data) ? data : (data.images || data.meal_images || [])

      const selections = {}

      rows.forEach(item => {

        const mealId = item.meal_id ?? item.mealId ?? item.id

        const imageUrl = item.image_url || item.imageUrl || item.url

        if (mealId != null && imageUrl) selections[String(mealId)] = imageUrl

      })

      return selections

    } catch (err) {

      console.error('Saved meal image error:', err)

      return {}

    }

  }

  async function fetchMeals() {

    try {

      const [response, imageSelections] = await Promise.all([

        fetch(`${API_URL}/meals`, { credentials: 'include' }),

        fetchMealImageSelections()

      ])

      if (!response.ok) throw new Error('Unable to fetch meals')

      const data = await response.json()

      if (Array.isArray(data)) {

        setCustomMeals(data.map(meal => ({

          ...meal,

          image: imageSelections[String(meal.id)] || meal.image || '🍽️'

        })))

      }

    } catch (err) {

      console.error('Meal fetching error:', err)

    }

  }

  async function handleRefreshIngredients() {

    setRefreshingIngredients(true)

    setError('')

    try {

      const [productsLoaded] = await Promise.all([

        fetchProducts(),

        fetchMeals(),

        fetchIngredientAliases()

      ])

      if (productsLoaded) {

        setShowAllIngredients(false)

      }

    } catch (err) {

      console.error('Refresh ingredients error:', err)

      setError('Could not refresh ingredients. Please try again.')

    } finally {

      setRefreshingIngredients(false)

    }

  }

  // Show only AI-estimated available stock here, matching Product Management.
  // Do not fall back to products.quantity when an AI estimate is not available.
  const availableProducts = products.filter(product => {
    const estimatedStock = estimatedStocks[product.id]
    return estimatedStock !== null && estimatedStock !== undefined &&
      Number.isFinite(Number(estimatedStock)) && Number(estimatedStock) > 0
  })

  const availableIngredients = availableProducts.map(product => ({

    name:

      product.product_name ||

      product.productName ||

      product.name ||

      'Product',

    quantity: estimatedStocks[product.id],

    unit: product.unit || ''

  }))

  // Find the household product for a recipe ingredient.
  // Saved product_id is the strongest link; approved admin aliases are the fallback.
  function findProduct(ingredientOrName) {
    const ingredient = ingredientOrName && typeof ingredientOrName === 'object'
      ? ingredientOrName
      : null
    const ingredientName = ingredient
      ? (ingredient.ingredient_name || ingredient.name || '')
      : ingredientOrName

    // Prefer the exact product linked when the recipe was saved.
    const linkedProductId = ingredient?.product_id
    if (linkedProductId !== null && linkedProductId !== undefined && linkedProductId !== '') {
      const linkedMatches = products.filter(product =>
        String(product.id ?? product.product_id) === String(linkedProductId)
      )
      if (linkedMatches.length === 1) return linkedMatches[0]
      if (linkedMatches.length > 1) return null
    }

    const rawSearch = normalizeName(ingredientName)
    if (!rawSearch) return null

    const aliasMap = Object.fromEntries(
      Object.entries(ingredientAliases || {}).map(([key, value]) => [normalizeName(key), normalizeName(value)])
    )

    const namedProducts = products.map(product => {
      const productName = product.product_name || product.productName || product.name
      const rawKey = normalizeName(productName)
      return {
        product,
        rawKey,
        canonicalKey: aliasMap[rawKey] || rawKey
      }
    }).filter(item => item.rawKey)

    // A literal inventory-name match always wins.
    const exactMatches = namedProducts.filter(item => item.rawKey === rawSearch)
    if (exactMatches.length === 1) return exactMatches[0].product
    if (exactMatches.length > 1) return null

    // Resolve only aliases explicitly approved by the administrator.
    const target = aliasMap[rawSearch] || rawSearch
    const aliasMatches = namedProducts.filter(item => item.canonicalKey === target)
    return aliasMatches.length === 1 ? aliasMatches[0].product : null
  }

  function getScaledIngredient(ingredient, baseServings = 1, targetMembers = selectedMembers) {
    if (!ingredient || typeof ingredient !== 'object') return ingredient
    const base = Math.max(1, Number(baseServings) || 1)
    const target = Math.max(1, Number(targetMembers) || 1)
    const quantity = Number(ingredient.quantity)
    if (!Number.isFinite(quantity)) return ingredient
    return { ...ingredient, quantity: quantity * target / base }
  }

  function getScaledMealIngredients(meal, targetMembers = selectedMembers) {
    const baseServings = Number(meal?.servings) || 1
    return (Array.isArray(meal?.ingredients) ? meal.ingredients : []).map(ingredient =>
      getScaledIngredient(ingredient, baseServings, targetMembers)
    )
  }

  function hasIngredient(ingredient) {

    const product = findProduct(ingredient)

    return Boolean(product && Number(product.quantity) > 0)

  }

  // Check if required ingredient quantity is available.

function isIngredientSufficient(ingredient) {
  const product = findProduct(ingredient)
  if (!product) return false
  if (typeof ingredient === 'string') return Number(product.quantity) > 0

  const requiredQuantity = Number(ingredient.quantity)
  const availableQuantity = Number(product.quantity)
  if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0 ||
      !Number.isFinite(availableQuantity) || availableQuantity < 0) return false

  const normalizeUnit = (rawUnit) => {
    // Accept both plain units ("Tablespoon") and descriptive labels
    // ("Tablespoon (15 ml)"). Match the unit name before removing punctuation
    // or the conversion details in brackets.
    const rawValue = String(rawUnit || '').toLowerCase().trim()
    const unitMatch = rawValue.match(/^(milligrams?|mg|kilograms?|kg|grams?|g|milliliters?|millilitres?|ml|liters?|litres?|l|teaspoons?|tsp|tablespoons?|tbsp|cups?|pieces?|piece|pcs?|pc|units?|each|nos?|dozens?|packets?|packs?|bottles?|boxes?)\b/)
    const value = (unitMatch ? unitMatch[1] : rawValue).replace(/[^a-z0-9]/g, '')
    const aliases = {
      mg: 'mg', milligram: 'mg', milligrams: 'mg',
      g: 'g', gram: 'g', grams: 'g',
      kg: 'kg', kilogram: 'kg', kilograms: 'kg',
      ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
      l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
      tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
      tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
      cup: 'cup', cups: 'cup',
      pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece',
      unit: 'piece', units: 'piece', each: 'piece', no: 'piece', nos: 'piece',
      dozen: 'dozen', dozens: 'dozen',
      pack: 'packet', packs: 'packet', packets: 'packet', packet: 'packet',
      bottle: 'bottle', bottles: 'bottle', box: 'box', boxes: 'box'
    }
    return aliases[value] || value
  }

  const ingredientName = ingredient.ingredient_name || ingredient.name || ''
  const requestedKey = normalizeName(ingredientName)
  const aliasMap = Object.fromEntries(
    Object.entries(ingredientAliases || {}).map(([key, value]) => [normalizeName(key), normalizeName(value)])
  )
  const canonicalKey = aliasMap[requestedKey] || canonicalIngredientName(ingredientName)

  // Ingredient-specific density / average piece-weight rules.
  const densityRules = [
    { names: ['salt', 'table salt'], gramsPerMl: 1.2 },
    { names: ['cumin seeds', 'cumin', 'jeera'], gramsPerMl: 0.4 },
    { names: ['cooking oil', 'oil', 'sunflower oil', 'vegetable oil'], gramsPerMl: 0.92 },
    { names: ['milk'], gramsPerMl: 1.03 },
    { names: ['sugar'], gramsPerMl: 0.85 },
    { names: ['wheat flour', 'flour', 'atta', 'maida'], gramsPerMl: 0.53 },
    { names: ['tomato', 'tomatoes'], gramsPerMl: 0.95, gramsPerPiece: 120 },
    { names: ['onion', 'onions'], gramsPerMl: 0.75, gramsPerPiece: 110 },
    { names: ['potato', 'potatoes'], gramsPerMl: 0.70, gramsPerPiece: 150 },
    { names: ['green chilli', 'green chili', 'chilli', 'chili'], gramsPerPiece: 5 },
    { names: ['lemon'], gramsPerPiece: 60 },
    { names: ['apple'], gramsPerPiece: 180 },
    { names: ['banana'], gramsPerPiece: 120 },
    { names: ['carrot'], gramsPerPiece: 60 },
    { names: ['egg'], gramsPerPiece: 50 },
    { names: ['garlic'], gramsPerPiece: 5 }
  ]
  const densityRule = densityRules.find(rule => rule.names.some(name => {
    const key = normalizeName(name)
    return canonicalKey === key || canonicalKey.includes(key) || key.includes(canonicalKey)
  }))

  const recipeUnit = normalizeUnit(ingredient.unit)
  const stockUnit = normalizeUnit(product.unit || product.quantity_unit || product.stock_unit)
  if (!recipeUnit || !stockUnit) return false

  // Graph edges mean: 1 unit on the left equals factor units on the right.
  const graph = {}
  const addEdge = (from, to, factor) => {
    if (!from || !to || from === to || !Number.isFinite(factor) || factor <= 0) return
    if (!graph[from]) graph[from] = []
    graph[from].push([to, factor])
  }
  const addPair = (from, to, factor) => {
    addEdge(from, to, factor)
    addEdge(to, from, 1 / factor)
  }

  // Standard mass and volume conversions.
  addPair('kg', 'g', 1000)
  addPair('g', 'mg', 1000)
  addPair('l', 'ml', 1000)

  // Kitchen volume references.
  addPair('tsp', 'ml', 5)
  addPair('tbsp', 'ml', 15)
  addPair('cup', 'ml', 250)

  // Kitchen mass references used by the backend.
  // These are the Home Needs default measuring estimates.
  addPair('tsp', 'g', 5)
  addPair('tbsp', 'g', 15)
  addPair('cup', 'g', 250)
  addPair('piece', 'g', 130)

  // Keep ingredient-specific density rules for ml <-> g conversions.
  if (densityRule?.gramsPerMl) addPair('ml', 'g', densityRule.gramsPerMl)

  const queue = [[recipeUnit, 1]]
  const visited = new Set([recipeUnit])
  let convertedQuantity = null
  while (queue.length > 0) {
    const [current, multiplier] = queue.shift()
    for (const [next, factor] of graph[current] || []) {
      if (visited.has(next)) continue
      const nextMultiplier = multiplier * factor
      if (next === stockUnit) {
        convertedQuantity = requiredQuantity * nextMultiplier
        queue.length = 0
        break
      }
      visited.add(next)
      queue.push([next, nextMultiplier])
    }
  }

  if (convertedQuantity === null && recipeUnit === stockUnit) convertedQuantity = requiredQuantity
  if (convertedQuantity === null || !Number.isFinite(convertedQuantity)) return false
  return availableQuantity + 1e-9 >= convertedQuantity
}

  function getMealStatus(meal) {

    const mealIngredients = getScaledMealIngredients(meal)

    if (mealIngredients.length === 0) {

      return 2

    }

    const availableCount = mealIngredients.filter(

      ingredient => isIngredientSufficient(ingredient)

    ).length

    if (availableCount === mealIngredients.length) {

      return 0

    }

    if (availableCount > 0) {

      return 1

    }

    const matchedCount = mealIngredients.filter(ingredient => {

      const name = typeof ingredient === 'string'

        ? ingredient

        : ingredient.ingredient_name

      return Boolean(findProduct(name))

    }).length

    // Unknown ingredients with no inventory match are placed last.

    return matchedCount === 0 ? 3 : 2

  }

  // Calculate the percentage of recipe ingredients currently available in household stock.

  function getMealMatchPercentage(meal) {

    const mealIngredients = getScaledMealIngredients(meal)

    if (mealIngredients.length === 0) return 0

    const availableCount = mealIngredients.filter(ingredient =>

      isIngredientSufficient(ingredient)

    ).length

    return Math.round((availableCount / mealIngredients.length) * 100)

  }

  // Return the strongest expiry priority among ingredients used by this meal.
  // Only products with positive physical stock and a valid future expiry date
  // can increase a recipe's priority. Expired products are never promoted.
  function getMealExpiryPriority(meal) {
    const ingredients = Array.isArray(meal?.ingredients) ? meal.ingredients : []
    if (ingredients.length === 0) return 2

    const today = new Date()
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    let bestPriority = 2

    for (const ingredient of ingredients) {
      const ingredientName = typeof ingredient === 'string'
        ? ingredient
        : (ingredient?.ingredient_name || ingredient?.name || '')
      const product = findProduct(ingredientName)
      if (!product || !Number.isFinite(Number(product.quantity)) || Number(product.quantity) <= 0) {
        continue
      }

      const expiryValue = product.expiry_date || product.expiryDate
      if (!expiryValue) continue

      // Parse YYYY-MM-DD as a local calendar date to avoid timezone shifts.
      const match = String(expiryValue).match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (!match) continue
      const expiryUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      const daysUntilExpiry = Math.round((expiryUtc - todayUtc) / 86400000)

      // Past-expiry items are excluded; prioritize items expiring soon.
      if (daysUntilExpiry < 0) continue
      if (daysUntilExpiry <= 3) bestPriority = Math.min(bestPriority, 0)
      else if (daysUntilExpiry <= 7) bestPriority = Math.min(bestPriority, 1)
    }

    return bestPriority
  }

  // Return structured shortage records for this meal. Product IDs are the
  // strongest link; approved aliases are used only when a product link is absent.
  function getMealForecastRisk(meal) {
    const mealIngredients = Array.isArray(meal?.ingredients)
      ? meal.ingredients
      : []

    const shortagePredictions = cookingPredictions.filter(item =>
      item &&
      item.comparison_status === 'comparable' &&
      Number(item.additional_quantity_required) > 0 &&
      item.product_id !== null &&
      item.product_id !== undefined
    )

    const aliasMap = Object.fromEntries(
      Object.entries(ingredientAliases || {}).map(([key, value]) => [
        normalizeName(key), normalizeName(value)
      ])
    )

    const canonicalKey = value => {
      const key = normalizeName(value)
      return aliasMap[key] || canonicalIngredientName(key)
    }

    const namesMatch = (left, right) => {
      const a = canonicalKey(left)
      const b = canonicalKey(right)
      return Boolean(a && b && a === b)
    }

    const risksByProduct = new Map()

    for (const ingredient of mealIngredients) {
      const ingredientName = typeof ingredient === 'string'
        ? ingredient
        : (ingredient?.ingredient_name || ingredient?.name || '')

      const product = findProduct(ingredient)
      const productId =
        product?.id ?? product?.product_id ??
        (typeof ingredient === 'object'
          ? (ingredient?.product_id ?? ingredient?.productId)
          : null)

      let prediction = productId !== null && productId !== undefined
        ? shortagePredictions.find(item =>
            String(item.product_id) === String(productId)
          )
        : null

      // Name fallback is exact after canonical/approved-alias normalization.
      // Never infer a product match from a meal title or a partial word.
      if (!prediction && ingredientName) {
        const nameMatches = shortagePredictions.filter(item =>
          namesMatch(ingredientName, item.ingredient_name)
        )
        if (nameMatches.length === 1) prediction = nameMatches[0]
      }

      if (prediction) {
        risksByProduct.set(String(prediction.product_id), {
          product_id: prediction.product_id,
          ingredient_name: prediction.ingredient_name || ingredientName,
          required_quantity: Number(prediction.additional_quantity_required),
          unit: prediction.comparison_unit || prediction.stock_unit || '',
          confidence: prediction.confidence || 'Limited'
        })
      }
    }

    return Array.from(risksByProduct.values())
  }

  // Add only the forecasted shortage quantity. The existing backend endpoint
  // is family-scoped and updates an existing Pending row instead of duplicating it.
  async function addForecastRisksToShoppingList(meal, risks) {
    const mealKey = String(meal?.id ?? meal?.name ?? 'meal')
    if (!Array.isArray(risks) || risks.length === 0 || addingForecastToShoppingList[mealKey]) return

    setAddingForecastToShoppingList(previous => ({ ...previous, [mealKey]: true }))

    let addedCount = 0
    const failures = []

    try {
      for (const risk of risks) {
        if (!risk.product_id || !Number.isFinite(risk.required_quantity) || risk.required_quantity <= 0) {
          failures.push(`${risk.ingredient_name}: missing linked inventory product or valid quantity`)
          continue
        }

        try {
          const response = await fetch(`${API_URL}/shopping-list/add-prediction`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: risk.product_id,
              required_quantity: risk.required_quantity
            })
          })

          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(data.message || data.error || `Could not add ${risk.ingredient_name}`)
          }
          addedCount += 1
        } catch (error) {
          failures.push(error.message || `Could not add ${risk.ingredient_name}`)
        }
      }

      if (addedCount > 0) {
        window.dispatchEvent(new Event('shoppingListUpdated'))
      }

      if (failures.length > 0) {
        window.alert(
          `${addedCount} item(s) added to your shopping list.\n\n` +
          `Could not add: ${failures.join('; ')}`
        )
      } else if (addedCount > 0) {
        window.alert(`${addedCount} forecast shortage item(s) added to your shopping list.`)
      }
    } finally {
      setAddingForecastToShoppingList(previous => ({ ...previous, [mealKey]: false }))
    }
  }

  // Built-in recipes and database meals are combined.

  const allMeals = [

    ...recipes.map(recipe => ({

      ...recipe,

      isCustom: false

    })),

    ...customMeals.map(meal => ({

      ...meal,

      id: `custom-${meal.id}`,

      name: meal.meal_name,

      image: meal.image || '🍽️',

      description: 'Your own saved meal recipe.',

      time: `${meal.preparation_time || 30} mins`,

      difficulty: meal.difficulty || 'Easy',

      isCustom: true,

      steps: Array.isArray(meal.steps) ? meal.steps : []

    }))

  ]

  // When opened from Expiry Tracking, show only meals using that product.

  const filteredMeals = expiringProduct

    ? allMeals.filter(meal => {

        const mealIngredients = meal.ingredients || []

        const targetName = normalizeName(expiringProduct.productName)

        return mealIngredients.some(ingredient => {

          const ingredientName = typeof ingredient === 'string'

            ? ingredient

            : ingredient.ingredient_name

          const normalizedIngredient = normalizeName(ingredientName)

          return targetName && normalizedIngredient && (

            targetName === normalizedIngredient ||

            targetName.includes(normalizedIngredient) ||

            normalizedIngredient.includes(targetName)

          )

        })

      })

    : allMeals

  // Apply food category, cooking type, weekday restrictions, and

  // temporary date-range restrictions saved in Profile.jsx.

  const weekdayNames = [

    'Sunday',

    'Monday',

    'Tuesday',

    'Wednesday',

    'Thursday',

    'Friday',

    'Saturday'

  ]

  const today = new Date()

  const todayName = weekdayNames[today.getDay()]

  const isNonVegRestrictedToday = nonVegRestrictionDays.includes(todayName)

  // Use local calendar date in YYYY-MM-DD format to compare with

  // the date values from HTML date inputs without timezone issues.

  const currentYear = today.getFullYear()

  const currentMonth = String(today.getMonth() + 1).padStart(2, '0')

  const currentDay = String(today.getDate()).padStart(2, '0')

  const todayDate = `${currentYear}-${currentMonth}-${currentDay}`

  const hasValidDateRestriction = Boolean(

    nonVegStartDate &&

    nonVegEndDate &&

    nonVegEndDate >= nonVegStartDate

  )

  const isWithinNonVegDateRestriction =

    hasValidDateRestriction &&

    todayDate >= nonVegStartDate &&

    todayDate <= nonVegEndDate

  const isNonVegRestrictedByDate = isWithinNonVegDateRestriction

  const preferenceFilteredMeals = filteredMeals.filter(meal => {

    const mealCategory = String(meal.category || '').trim()

    const mealCookingType = String(meal.cooking_type || '').trim()

    const isNonVegMeal = mealCategory.toLowerCase() === 'non-vegetarian'

    const matchesFood = foodFilter === 'All Types' || mealCategory.toLowerCase() === foodFilter.toLowerCase()

    const matchesCooking = cookingFilter === 'All Types' || mealCookingType.toLowerCase() === cookingFilter.toLowerCase()

    // Hide non-veg meals if today's weekday is selected OR today is

    // within the temporary start-date/end-date restriction.

    const matchesRestriction = !(

      isNonVegMeal &&

      (isNonVegRestrictedToday || isNonVegRestrictedByDate)

    )

    return matchesFood && matchesCooking && matchesRestriction

  })

  // Availability remains the primary ranking rule. Within the same
  // availability group, recipes using in-stock ingredients expiring soon
  // are promoted: 0-3 days, then 4-7 days, then no near-expiry ingredient.
  const recommendedMeals = [...preferenceFilteredMeals].sort((a, b) => {
    // 1. Current ingredient availability remains the primary ranking rule.
    const availabilityDifference = getMealStatus(a) - getMealStatus(b)
    if (availabilityDifference !== 0) return availabilityDifference

    // 2. Prefer meals that use ingredients expiring soon.
    const expiryDifference = getMealExpiryPriority(a) - getMealExpiryPriority(b)
    if (expiryDifference !== 0) return expiryDifference

    // 3. Within those groups, prefer meals with fewer forecast shortages.
    const forecastDifference =
      getMealForecastRisk(a).length - getMealForecastRisk(b).length
    if (forecastDifference !== 0) return forecastDifference

    // 4. Preserve the existing match-percentage tie-breaker.
    return getMealMatchPercentage(b) - getMealMatchPercentage(a)
  })

  const mealTypeTabs = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages']
  const uncategorizedMeals = recommendedMeals.filter(meal =>
    !mealTypeTabs.includes(String(meal.meal_type || 'Uncategorized'))
  )
  const mealsForActiveTab = activeMealTypeTab === 'Uncategorized'
    ? uncategorizedMeals
    : recommendedMeals.filter(meal => String(meal.meal_type || 'Uncategorized') === activeMealTypeTab)

  async function updateMealType(meal, nextMealType) {
    if (!meal?.id || !meal.isCustom || updatingMealTypeId) return
    const mealId = String(meal.id).replace('custom-', '')
    setUpdatingMealTypeId(mealId)
    setError('')
    try {
      const response = await fetch(`${API_URL}/meals/${mealId}/meal-type`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_type: nextMealType })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update meal type')
      await fetchMeals()
    } catch (err) {
      setError(err.message || 'Unable to update meal type')
    } finally {
      setUpdatingMealTypeId(null)
    }
  }

  function addIngredientRow() {

    setIngredients([

      ...ingredients,

      { ingredient_name: '', quantity: '', unit: 'Kg' }

    ])

  }

  function removeIngredientRow(index) {

    setIngredients(

      ingredients.filter((_, i) => i !== index)

    )

  }

  function updateIngredient(index, field, value) {

    const updatedIngredients = [...ingredients]

    updatedIngredients[index] = {

      ...updatedIngredients[index],

      [field]: value

    }

    setIngredients(updatedIngredients)

  }

  function addPreparationStep() {

    setPreparationSteps(prev => [...prev, ''])

  }

  function updatePreparationStep(index, value) {

    setPreparationSteps(prev => prev.map((step, i) => i === index ? value : step))

  }

  function removePreparationStep(index) {

    setPreparationSteps(prev => prev.filter((_, i) => i !== index))

  }

  async function handleAddMeal(event) {

    event.preventDefault()

    setFormMessage('')

    if (!mealName.trim()) {

      setFormMessage('Please enter the meal name.')

      return

    }

    const validIngredients = ingredients.filter(

      ingredient =>

        ingredient.ingredient_name.trim() &&

        Number(ingredient.quantity) > 0 &&

        ingredient.unit.trim()

    )

    if (validIngredients.length === 0) {

      setFormMessage(

        'Please enter at least one ingredient with quantity and unit.'

      )

      return

    }

    const validSteps = preparationSteps.map(step => step.trim()).filter(Boolean)

    if (validSteps.length === 0) {

      setFormMessage('Please add at least one preparation step.')

      return

    }

    // Validate the number of people served by the original recipe quantities.
    const servingsValue = Number(servings)
    if (!Number.isInteger(servingsValue) || servingsValue < 1 || servingsValue > 100) {
      setFormMessage('Servings must be a whole number between 1 and 100.')
      return
    }

    // Validate and normalize the selected meal type before sending it to Flask.
    const allowedMealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages']
    const selectedMealType = allowedMealTypes.find(
      type => type.toLowerCase() === String(mealType || '').trim().toLowerCase()
    )

    if (!selectedMealType) {
      setFormMessage('Please select Breakfast, Lunch, Dinner, Snacks or Beverages.')
      return
    }

    setSaving(true)

    try {

      const response = await fetch(`${API_URL}/meals`, {

        method: 'POST',

        credentials: 'include',

        headers: {

          'Content-Type': 'application/json'

        },

        body: JSON.stringify({

          meal_name: mealName.trim(),

          preparation_time: Number(preparationTime),
          // Original recipe quantities are based on this number of people.
          servings: servingsValue,

          difficulty,

          category,

          cooking_type: cookingType,

          // Flask expects the exact field name: meal_type.
          meal_type: selectedMealType,

          steps: validSteps,

          ingredients: validIngredients.map(ingredient => ({

            ingredient_name: ingredient.ingredient_name.trim(),

            quantity: Number(ingredient.quantity),

            unit: ingredient.unit.trim()

          }))

        })

      })

      const data = await response.json()

      if (!response.ok) {

        throw new Error(data.error || 'Unable to save meal')

      }

      const createdMealId = data.meal_id ?? data.id

      let imageSaveFailed = false

      if (selectedMealImage && createdMealId != null) {

        try {

          const imageResponse = await fetch(`${API_URL}/meals/${createdMealId}/image`, {

            method: 'PUT', credentials: 'include',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ image_url: selectedMealImage })

          })

          if (!imageResponse.ok) imageSaveFailed = true

        } catch (imageErr) {

          console.error('Saving meal image error:', imageErr)

          imageSaveFailed = true

        }

      }

      setFormMessage(imageSaveFailed

        ? 'Meal added, but its image could not be saved.'

        : 'Meal added successfully!')

      setMealName('')
      setServings('1')

      setSelectedMealImage('')

      setPreparationTime('30')

      setDifficulty('Easy')

      setCategory('Vegetarian')

      setCookingType('Quick Meals')

      setMealType('Breakfast')

      setSelectedMealImage('')

      setIngredients([

        { ingredient_name: '', quantity: '', unit: 'Kg' }

      ])

      setPreparationSteps([''])

      await fetchMeals()

      setShowAddForm(false)

    } catch (err) {

      console.error('Add meal error:', err)

      setFormMessage(err.message || 'Unable to save meal.')

    } finally {

      setSaving(false)

    }

  }

  async function saveMealImage(meal, imageUrl) {

    if (!meal?.id || !imageUrl) return

    try {

      const response = await fetch(`${API_URL}/meals/${meal.id}/image`, {

        method: 'PUT',

        credentials: 'include',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ image_url: imageUrl })

      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) throw new Error(data.error || 'Unable to save meal image')

      setOpenMealMenuId(null)

      setSelectedMealForImage(null)

      await fetchMeals()

    } catch (err) {

      console.error('Save meal image error:', err)

      window.alert(err.message || 'Unable to save meal image. Check the backend route.')

    }

  }

  async function removeMealImage(meal) {

    if (!meal?.id) return

    try {

      const response = await fetch(`${API_URL}/meals/${meal.id}/image`, {

        method: 'DELETE', credentials: 'include'

      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) throw new Error(data.error || 'Unable to remove meal image')

      setOpenMealMenuId(null)

      await fetchMeals()

    } catch (err) {

      console.error('Remove meal image error:', err)

      window.alert(err.message || 'Unable to remove meal image. Check the backend route.')

    }

  }

  async function fetchMySubmissions() {
    setLoadingSubmissions(true)
    try {
      const response = await fetch(`${API_URL}/global-recipes/my-submissions`, {
        credentials: 'include'
      })
      const data = await response.json().catch(() => [])
      if (!response.ok) throw new Error(data.error || 'Unable to load your submissions')
      setMySubmissions(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('My submissions error:', err)
      window.alert(err.message || 'Unable to load your submissions.')
    } finally {
      setLoadingSubmissions(false)
    }
  }

  function handleShareMeal(meal) {
    if (!meal?.id) return
    // Open our themed confirmation dialog instead of the browser's native confirm.
    setPendingShareMeal(meal)
  }

  async function confirmShareMeal() {
    if (!pendingShareMeal?.id || sharingMeal) return

    setSharingMeal(true)
    try {
      const response = await fetch(`${API_URL}/global-recipes/share-meal/${pendingShareMeal.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to share this meal')

      setPendingShareMeal(null)
      window.alert(data.message || 'Meal shared successfully. Waiting for admin approval.')
      await fetchMySubmissions()
      setShowMySubmissions(true)
    } catch (err) {
      window.alert(err.message || 'Unable to share this meal.')
    } finally {
      setSharingMeal(false)
    }
  }

  async function fetchCookingHistory({ reset = true } = {}) {
    const nextOffset = reset ? 0 : cookingHistoryOffset
    setCookingHistoryLoading(true)
    setCookingHistoryError('')

    try {
      const params = new URLSearchParams({
        limit: String(cookingHistoryLimit),
        offset: String(nextOffset)
      })
      if (cookingHistoryFilter !== 'all') params.set('recipe_type', cookingHistoryFilter)

      const response = await fetch(`${API_URL}/meal-cooking-history?${params.toString()}`, {
        credentials: 'include'
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || data.error || `Unable to load cooking history (${response.status})`)
      }

      const rows = Array.isArray(data.history) ? data.history : []
      setCookingHistory(previous => reset ? rows : [...previous, ...rows])
      setCookingHistoryOffset(nextOffset + rows.length)
      setCookingHistoryHasMore(Boolean(data.pagination?.has_more))
    } catch (err) {
      console.error('Cooking history error:', err)
      setCookingHistoryError(err.message || 'Could not load cooking history.')
      if (reset) setCookingHistory([])
    } finally {
      setCookingHistoryLoading(false)
    }
  }

  function formatCookingDate(value) {
    if (!value) return 'Date unavailable'
    const parsed = new Date(String(value).replace(' ', 'T'))
    if (Number.isNaN(parsed.getTime())) return String(value)
    return parsed.toLocaleString([], {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function getExpiredIngredientsForMeal(meal) {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const expired = []
    const seen = new Set()

    ;(Array.isArray(meal?.ingredients) ? meal.ingredients : []).forEach(ingredient => {
      const product = findProduct(ingredient)
      if (!product || Number(product.quantity) <= 0) return

      const expiryValue = product.expiry_date || product.expiryDate
      if (!expiryValue) return

      const match = String(expiryValue).match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (!match) return
      const expiryKey = `${match[1]}-${match[2]}-${match[3]}`
      if (expiryKey >= todayKey) return

      const productId = String(product.id ?? product.product_id)
      if (seen.has(productId)) return
      seen.add(productId)
      expired.push({
        product_id: product.id ?? product.product_id,
        product_name: product.product_name || product.productName || 'Ingredient',
        expiry_date: expiryKey
      })
    })

    return expired
  }

  function openInventoryForExpiredIngredient() {
    const firstExpired = expiredCookWarning?.expiredProducts?.[0]
    setExpiredCookWarning(null)
    if (firstExpired) {
      window.dispatchEvent(new CustomEvent('open-product-management', {
        detail: {
          productId: firstExpired.product_id,
          productName: firstExpired.product_name,
          source: 'expired-meal-ingredient'
        }
      }))
      window.alert(`Please update ${firstExpired.product_name} in Product Management, then refresh the ingredients before cooking.`)
    }
  }

  async function handleCookMeal(recipe) {
    if (!recipe?.isCustom) {
      window.alert('Cook Meal is available for saved custom meals.')
      return
    }

    const meal = customMeals.find(item => `custom-${item.id}` === recipe.id)
    if (!meal) {
      window.alert('Saved meal not found. Please refresh meals.')
      return
    }

    const expiredProducts = getExpiredIngredientsForMeal(meal)
    if (expiredProducts.length > 0) {
      setExpiredCookWarning({
        mealName: meal.meal_name,
        expiredProducts
      })
      return
    }

    const servingsToCook = Number(membersByRecipe[recipe.id] || familyMembers || 1)
    const confirmed = window.confirm(
      `Cook "${meal.meal_name}" for ${servingsToCook} member(s)? Ingredient quantities will be scaled from the original ${Number(meal.servings) || 1}-serving recipe. Available stock will be checked before anything is deducted.`
    )
    if (!confirmed) return

    try {
      const response = await fetch(`${API_URL}/meals/${meal.id}/cook`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servings: servingsToCook })
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 409 && Array.isArray(result.expired_products)) {
          setExpiredCookWarning({
            mealName: meal.meal_name,
            expiredProducts: result.expired_products
          })
          return
        }
        throw new Error(result.error || 'Unable to cook meal')
      }

      window.alert(result.message || 'Meal cooked successfully!')
      await Promise.all([fetchProducts(), fetchMeals(), fetchCookingHistory()])
      window.dispatchEvent(new Event('productsUpdated'))
    } catch (err) {
      window.alert(err.message || 'Failed to cook meal.')
    }
  }

  async function handleDeleteMeal(meal) {

    const confirmed = window.confirm(`Delete "${meal.meal_name}"?`)

    if (!confirmed) return

    try {

      const response = await fetch(`${API_URL}/meals/${meal.id}`, {

        method: 'DELETE',

        credentials: 'include'

      })

      const data = await response.json()

      if (!response.ok) {

        throw new Error(data.error || 'Unable to delete meal')

      }

      if (selectedRecipe?.isCustom && selectedRecipe.id === `custom-${meal.id}`) {

        setSelectedRecipe(null)

      }

      await fetchMeals()

    } catch (err) {

      console.error('Delete meal error:', err)

      setFormMessage(err.message || 'Unable to delete meal.')

    }

  }

  if (showMealGallery) {

    return (

      <MealImageGallery

        selectionMode

        onSelectImage={(image) => {

          const imageUrl = image?.image_url || image?.imageUrl || image?.url || ''

          setShowMealGallery(false)

          if (selectedMealForImage) {

            saveMealImage(selectedMealForImage, imageUrl)

          } else {

            setSelectedMealImage(imageUrl)

          }

        }}

        onClose={() => { setShowMealGallery(false); setSelectedMealForImage(null) }}

      />

    )

  }

  return (

    <div className={`meal-recommendation ${showCommunityRecipes ? "community-recipes-active" : ""}`}>

      <div className="page-title meal-welcome-banner">
        {!showCommunityRecipes ? (
          <>
            <div className="meal-welcome-copy">
              <span className="meal-welcome-eyebrow">HOME NEEDS · YOUR DAILY FOOD COMPANION</span>
              <h1>{timeInfo.greeting}! {timeInfo.emoji}</h1>
              <p>Here are tasty {timeInfo.mealType.toLowerCase()} ideas based on the ingredients you have at home.</p>
              <small>Your meal category updates automatically with your local time.</small>
            </div>
            <div className="meal-welcome-art" aria-hidden="true">🥗</div>
          </>
        ) : (
          <p>Explore recipes shared by the Home Needs community.</p>
        )}
      </div>

      {showCommunityRecipes ? (
        <div className="community-recipes-page">
          <button
            type="button"
            className="community-recipes-back"
            onClick={() => setShowCommunityRecipes(false)}
          >
            ← Back to Meal Recommendations
          </button>
          <GlobalRecipes
            apiUrl={API_URL}
            MealImageGallery={MealImageGallery}
            onInventoryUpdated={() => {
              fetchProducts()
              fetchMeals()
              window.dispatchEvent(new Event('productsUpdated'))
            }}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            className="open-community-recipes-btn"
            onClick={() => setShowCommunityRecipes(true)}
          >
            🌍 Explore Community Recipes
          </button>

          

          <section className="cooking-history-section">
            <div className="cooking-history-toolbar">
              <div>
                <h2>🕘 Cooking History</h2>
                <p>Keep track of meals your household has prepared.</p>
              </div>
              <button
                type="button"
                className="cooking-history-toggle"
                onClick={async () => {
                  const next = !showCookingHistory
                  setShowCookingHistory(next)
                  if (next) await fetchCookingHistory()
                }}
              >
                {showCookingHistory ? 'Hide History' : 'View History'}
              </button>
            </div>

            {showCookingHistory && (
              <div className="cooking-history-panel">
                <div className="cooking-history-controls">
                  <label htmlFor="cooking-history-filter">Recipe type</label>
                  <select
                    id="cooking-history-filter"
                    value={cookingHistoryFilter}
                    onChange={async event => {
                      setCookingHistoryFilter(event.target.value)
                      setCookingHistoryOffset(0)
                      setCookingHistory([])
                      // Fetch using the newly selected filter without waiting for state.
                      const selectedFilter = event.target.value
                      setCookingHistoryLoading(true)
                      setCookingHistoryError('')
                      try {
                        const params = new URLSearchParams({ limit: String(cookingHistoryLimit), offset: '0' })
                        if (selectedFilter !== 'all') params.set('recipe_type', selectedFilter)
                        const response = await fetch(`${API_URL}/meal-cooking-history?${params.toString()}`, { credentials: 'include' })
                        const data = await response.json().catch(() => ({}))
                        if (!response.ok) throw new Error(data.message || data.error || 'Unable to load cooking history')
                        const rows = Array.isArray(data.history) ? data.history : []
                        setCookingHistory(rows)
                        setCookingHistoryOffset(rows.length)
                        setCookingHistoryHasMore(Boolean(data.pagination?.has_more))
                      } catch (err) {
                        setCookingHistoryError(err.message || 'Could not load cooking history.')
                        setCookingHistory([])
                      } finally {
                        setCookingHistoryLoading(false)
                      }
                    }}
                  >
                    <option value="all">All Recipes</option>
                    <option value="custom">My Recipes</option>
                    <option value="global">Community Recipes</option>
                  </select>
                  <button type="button" className="cooking-history-refresh" onClick={() => fetchCookingHistory()} disabled={cookingHistoryLoading}>
                    ↻ Refresh
                  </button>
                </div>

                {cookingHistoryLoading && cookingHistory.length === 0 ? (
                  <p className="cooking-history-message">Loading your cooking history...</p>
                ) : cookingHistoryError ? (
                  <div className="cooking-history-error">
                    <p>{cookingHistoryError}</p>
                    <button type="button" onClick={() => fetchCookingHistory()}>Try again</button>
                  </div>
                ) : cookingHistory.length === 0 ? (
                  <div className="cooking-history-empty">
                    <span>🍲</span>
                    <strong>No cooking history yet</strong>
                    <p>Cook a saved recipe and it will appear here.</p>
                  </div>
                ) : (
                  <>
                    <div className="cooking-history-list">
                      {cookingHistory.map(item => (
                        <article className="cooking-history-card" key={item.id}>
                          <div className="cooking-history-icon">🍽️</div>
                          <div className="cooking-history-details">
                            <h3>{item.recipe_name_snapshot || 'Untitled recipe'}</h3>
                            <div className="cooking-history-meta">
                              <span className={`cooking-history-type ${item.recipe_type === 'global' ? 'global' : 'custom'}`}>
                                {item.recipe_type === 'global' ? 'Community Recipe' : 'My Recipe'}
                              </span>
                              <span>👥 {Number(item.servings) || 1} serving(s)</span>
                              <span>🗓 {formatCookingDate(item.cooked_at)}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    {cookingHistoryHasMore && (
                      <button
                        type="button"
                        className="cooking-history-load-more"
                        disabled={cookingHistoryLoading}
                        onClick={() => fetchCookingHistory({ reset: false })}
                      >
                        {cookingHistoryLoading ? 'Loading...' : 'Load More History'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {showMySubmissions && (
            <section className="my-submissions-panel">
              <div className="my-submissions-heading">
                <div>
                  <h2>My Community Submissions</h2>
                  <p>Track the recipes you have shared with the community.</p>
                </div>
                <button type="button" onClick={fetchMySubmissions} disabled={loadingSubmissions}>
                  {loadingSubmissions ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>

              {loadingSubmissions ? (
                <p className="my-submissions-empty">Loading your submissions…</p>
              ) : mySubmissions.length === 0 ? (
                <p className="my-submissions-empty">You have not shared any meals yet.</p>
              ) : (
                <div className="my-submissions-list">
                  {mySubmissions.map(item => (
                    <article className="my-submission-card" key={item.id}>
                      {item.image_url && <img src={item.image_url} alt={item.recipe_name} />}
                      <div className="my-submission-info">
                        <h3>{item.recipe_name}</h3>
                        <span className={`submission-status submission-${String(item.status || '').toLowerCase()}`}>
                          {item.status === 'approved' ? '✓ Approved' : item.status === 'rejected' ? '✕ Rejected' : '◷ Pending'}
                        </span>
                        {item.status === 'rejected' && item.rejection_reason && (
                          <p className="submission-rejection-reason"><strong>Admin reason:</strong> {item.rejection_reason}</p>
                        )}
                        {item.status === 'rejected' && (
                          <p className="submission-resubmit-note">You can edit this meal in My Meals and share it again.</p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

      {expiringProduct && (

        <div

          style={{

            background: '#fff8e8',

            border: '1px solid #ff9800',

            borderRadius: '12px',

            padding: '15px 20px',

            marginBottom: '20px'

          }}

        >

          <h3>⏰ Use Your Expiring Product</h3>

          <p>

            Showing saved meals containing <strong>{expiringProduct.productName}</strong>

            {' '}to help avoid food waste.

          </p>

          <button

            type="button"

            onClick={() => window.dispatchEvent(

              new CustomEvent('clear-expiring-product-filter')

            )}

            style={{

              padding: '9px 16px',

              border: 'none',

              borderRadius: '8px',

              background: '#4caf50',

              color: 'white',

              cursor: 'pointer'

            }}

          >

            Clear Filter

          </button>

        </div>

      )}

      {/* Available Ingredients */}

      <div className="available-ingredients">

        <div className="available-ingredients-heading">

          <div className="available-ingredients-title-wrap">

            <span className="available-ingredients-icon" aria-hidden="true">🧺</span>

            <div>

              <h2>Available Ingredients</h2>

              <p>Ingredients in your home (updated from stock)</p>

            </div>

          </div>

          {!loading && !error && availableIngredients.length > 3 && (

            <button

              type="button"

              className="ingredients-view-all"

              onClick={() => setShowAllIngredients(prev => !prev)}

            >

              {showAllIngredients ? 'Show Less' : 'View All'} <span aria-hidden="true">›</span>

            </button>

          )}

        </div>

        <div className="ingredient-search-wrap">

          <span aria-hidden="true">⌕</span>

          <input

            type="search"

            value={ingredientSearch}

            onChange={event => setIngredientSearch(event.target.value)}

            placeholder="Search ingredient..."

            aria-label="Search available ingredients"

          />

          {ingredientSearch && (

            <button type="button" onClick={() => setIngredientSearch('')} aria-label="Clear ingredient search">×</button>

          )}

        </div>

        {loading ? (

          <p className="ingredients-empty-state">Loading ingredients from your stock...</p>

        ) : error ? (

          <p className="ingredients-empty-state">{error}</p>

        ) : availableIngredients.length === 0 ? (

          <p className="ingredients-empty-state">No ingredients available. Add products and update their stock.</p>

        ) : (

          <div className="ingredient-list">

            {availableIngredients

              .filter(ingredient => ingredient.name.toLowerCase().includes(ingredientSearch.trim().toLowerCase()))

              .slice(0, showAllIngredients || ingredientSearch.trim() ? availableIngredients.length : 3)

              .map((ingredient, index) => (

                <span className="ingredient-chip" key={`${ingredient.name}-${index}`}>

                  <span className="ingredient-chip-emoji" aria-hidden="true">{getIngredientEmoji(ingredient.name)}</span>

                  <span className="ingredient-chip-name">{ingredient.name}</span>

                  <small className="ingredient-chip-quantity">

                    {Number(ingredient.quantity)} {ingredient.unit || 'units'}

                  </small>

                </span>

              ))}

            {!ingredientSearch.trim() && availableIngredients.length > 7 && !showAllIngredients && (

              <button

                type="button"

                className="ingredient-more-btn"

                onClick={() => setShowAllIngredients(true)}

              >

                +{availableIngredients.length - 7} more

              </button>

            )}

            {showAllIngredients && availableIngredients.length > 7 && !ingredientSearch.trim() && (

              <button

                type="button"

                className="ingredient-more-btn"

                onClick={() => setShowAllIngredients(false)}

              >

                Show less

              </button>

            )}

            {ingredientSearch.trim() && availableIngredients.filter(ingredient => ingredient.name.toLowerCase().includes(ingredientSearch.trim().toLowerCase())).length === 0 && (

              <p className="ingredients-empty-state">No matching ingredients found.</p>

            )}

          </div>

        )}

        <button

          type="button"

          className="refresh-ingredients-btn"

          onClick={handleRefreshIngredients}

          disabled={refreshingIngredients}

        >

          <span className={refreshingIngredients ? 'refresh-icon is-spinning' : 'refresh-icon'} aria-hidden="true">↻</span>

          {refreshingIngredients ? 'Refreshing...' : 'Refresh Ingredients'}

        </button>

      </div>

      {/* Add Your Own Meal */}

      <div className="add-meal-trigger">

        <button

          type="button"

          className="add-own-meal-btn"

          onClick={() => {

            setShowAddForm(true)

            setFormMessage('')

          }}

        >

          ➕ Add Your Own Meal

        </button>

      </div>

      {/* Add Meal Modal */}

      {showAddForm && (

        <div

          className="add-meal-modal-overlay"

          onClick={() => setShowAddForm(false)}

        >

          <div

            className="add-meal-modal"

            onClick={event => event.stopPropagation()}

          >

            <div className="add-meal-modal-header">

              <div>

                <h2>🍳 Add a New Meal</h2>

                <p>Create your own meal using ingredients available at home.</p>

              </div>

              <button

                type="button"

                className="add-meal-close-btn"

                onClick={() => setShowAddForm(false)}

                aria-label="Close add meal form"

              >

                ✕

              </button>

            </div>

            <form onSubmit={handleAddMeal} className="add-meal-form">

              <div className="form-field full-width">

                <label>Meal Name</label>

                <input

                  type="text"

                  value={mealName}

                  onChange={event => setMealName(event.target.value)}

                  placeholder="Enter meal name"

                  required

                />

              </div>

                            <div className="form-field full-width meal-image-picker-field">

  <label>Meal Image <span className="optional-label">(optional)</span></label>

  <button type="button" className="meal-gallery-open-button" onClick={() => setShowMealGallery(true)}>

    <span className="meal-gallery-open-icon">＋</span>

    <span>Upload Image <small>Choose from Meal Image Gallery</small></span>

  </button>

  {selectedMealImage && (

    <div className="selected-meal-image-preview">

      <img src={selectedMealImage} alt="Selected meal" />

      <div>

        <strong>Selected image</strong>

        <button type="button" className="clear-meal-image" onClick={() => setSelectedMealImage('')}>Remove image</button>

      </div>

    </div>

  )}

</div>

<div className="add-meal-form-grid">

                <div className="form-field">

                  <label>Food Category</label>

                  <select

                    value={category}

                    onChange={event => setCategory(event.target.value)}

                    required

                  >

                    <option value="Vegetarian">Vegetarian</option>

                    <option value="Non-Vegetarian">Non-Vegetarian</option>

                    <option value="Beverages">Beverages</option>

                  </select>

                </div>

                <div className="form-field">
                  <label>Meal Type</label>
                  <select value={mealType} onChange={event => { const nextType = event.target.value; setMealType(nextType); setCookingType(nextType === 'Beverages' ? 'Quick Drink' : 'Quick Meals') }} required>
                    <option value="Breakfast">Breakfast</option>
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Beverages">Beverages</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Servings (Number of Members)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={servings}
                    onChange={event => setServings(event.target.value)}
                    placeholder="Example: 2"
                    required
                  />
                  <small>Enter how many people the ingredient quantities are for.</small>
                </div>

                <div className="form-field">

                  <label>Cooking Type</label>

                  <select

                    value={cookingType}

                    onChange={event => setCookingType(event.target.value)}

                    required

                  >

                    {mealType === 'Beverages' ? (
                      <>
                        <option value="Quick Drink">Quick Drink</option>
                        <option value="Healthy Drink">Healthy Drink</option>
                        <option value="Traditional Drink">Traditional Drink</option>
                      </>
                    ) : (
                      <>
                        <option value="Quick Meals">Quick Meals</option>
                        <option value="Healthy Meals">Healthy Meals</option>
                        <option value="Traditional Meals">Traditional Meals</option>
                      </>
                    )}

                  </select>

                </div>

                <div className="form-field">

                  <label>Preparation Time (minutes)</label>

                  <input

                    type="number"

                    min="1"

                    step="1"

                    value={preparationTime}

                    onChange={event => setPreparationTime(event.target.value)}

                    required

                  />

                </div>

                <div className="form-field">

                  <label>Difficulty</label>

                  <select

                    value={difficulty}

                    onChange={event => setDifficulty(event.target.value)}

                  >

                    <option value="Easy">Easy</option>

                    <option value="Medium">Medium</option>

                    <option value="Hard">Hard</option>

                  </select>

                </div>

              </div>

              <div className="ingredients-heading-row">

                <div>

                  <h3>🧺 Ingredients ({ingredients.length})</h3>

                  <p>Add the ingredients and quantities needed for this meal.</p>

                </div>

                <button

                  type="button"

                  className="add-ingredient-btn"

                  onClick={addIngredientRow}

                >

                  ➕ Add Ingredient

                </button>

              </div>

              <div className="ingredient-form-list">

                {ingredients.map((ingredient, index) => (

                  <div className="ingredient-form-row" key={index}>

                    <div className="form-field">

                      <label>Ingredient</label>

                      <input

                        type="text"

                        value={ingredient.ingredient_name}

                        onChange={event =>

                          updateIngredient(index, 'ingredient_name', event.target.value)

                        }

                        placeholder="Ingredient name"

                        required

                      />

                    </div>

                    <div className="form-field">

                      <label>Quantity</label>

                      <input

                        type="number"

                        min="0.01"

                        step="any"

                        value={ingredient.quantity}

                        onChange={event =>

                          updateIngredient(index, 'quantity', event.target.value)

                        }

                        placeholder="Quantity"

                        required

                      />

                    </div>

                    <div className="form-field">

                      <label>Unit</label>

                      <select

                        value={ingredient.unit}

                        onChange={event =>

                          updateIngredient(index, 'unit', event.target.value)

                        }

                        required

                      >

                        <option value="Kg">Kg</option>

                        <option value="Gram">Gram</option>

                        <option value="Litre">Litre</option>

                        <option value="Packet">Packet</option>

                        <option value="Piece">Piece</option>

                        <option value="Bottle">Bottle</option>

                        <option value="Tablespoon">Tablespoon (15 ml)</option>

                        <option value="Teaspoon">Teaspoon (5 ml)</option>

                        <option value="Cup">Cup (250 ml)</option>

                      </select>

                    </div>

                    <button

                      type="button"

                      className="remove-ingredient-btn"

                      onClick={() => removeIngredientRow(index)}

                      disabled={ingredients.length === 1}

                      aria-label="Remove ingredient"

                    >

                      ✕

                    </button>

                  </div>

                ))}

              </div>

              <section className="preparation-steps-editor">

                <div className="preparation-steps-heading">

                  <div>

                    <h3>👩‍🍳 Preparation (Steps) <span className="required-mark">*</span></h3>

                    <p>Add the cooking instructions in the order they should be followed.</p>

                  </div>

                  <button type="button" className="add-preparation-step-btn" onClick={addPreparationStep}>

                    ＋ Add Step

                  </button>

                </div>

                <div className="preparation-step-fields">

                  {preparationSteps.map((step, index) => (

                    <div className="preparation-step-field" key={index}>

                      <span className="preparation-step-number">{index + 1}</span>

                      <textarea

                        value={step}

                        onChange={event => updatePreparationStep(index, event.target.value)}

                        placeholder={`Enter preparation step ${index + 1}`}

                        rows={2}

                        maxLength={500}

                        required={index === 0}

                        aria-label={`Preparation step ${index + 1}`}

                      />

                      <button

                        type="button"

                        className="remove-preparation-step-btn"

                        onClick={() => removePreparationStep(index)}

                        disabled={preparationSteps.length === 1}

                        aria-label={`Remove step ${index + 1}`}

                        title="Remove step"

                      >×</button>

                    </div>

                  ))}

                </div>

              </section>

              {formMessage && (

                <div className="meal-form-message">{formMessage}</div>

              )}

              <div className="add-meal-form-actions">

                <button

                  type="button"

                  className="cancel-meal-btn"

                  onClick={() => setShowAddForm(false)}

                >

                  Cancel

                </button>

                <button

                  type="submit"

                  className="save-meal-btn"

                  disabled={saving}

                >

                  {saving ? '⏳ Saving Meal...' : '💾 Save Meal'}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

      {/* Recommended Meals */}

      <div className="meal-section">


        <h2>

          👩‍🍳 {expiringProduct

            ? `Meals Using ${expiringProduct.productName}`

            : 'Recommended Meals'}

        </h2>

        <p style={{ marginBottom: '15px' }}>

          {expiringProduct

            ? `Meals containing ${expiringProduct.productName} are shown below.`

            : 'Meals with all required ingredients available are shown first.'}

        </p>

        <div style={{

          display: 'grid',

          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',

          gap: '12px',

          marginBottom: '20px',

          padding: '16px',

          background: '#fff',

          borderRadius: '12px',

          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'

        }}>

          <div>

            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>

              Filter by Food Category

            </label>

            <select value={foodFilter} onChange={event => setFoodFilter(event.target.value)} style={inputStyle}>

              <option value="All Types">All Types</option>

              <option value="Vegetarian">Vegetarian</option>

              <option value="Non-Vegetarian">Non-Vegetarian</option>

              <option value="Beverages">Beverages</option>

            </select>

          </div>

          <div>

            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>

              Filter by Cooking Type

            </label>

            <select value={cookingFilter} onChange={event => setCookingFilter(event.target.value)} style={inputStyle}>

              <option value="All Types">All Types</option>

              <option value="Quick Meals">Quick Meals</option>

              <option value="Healthy Meals">Healthy Meals</option>

              <option value="Traditional Meals">Traditional Meals</option>
              <option value="Quick Drink">Quick Drink</option>
              <option value="Healthy Drink">Healthy Drink</option>
              <option value="Traditional Drink">Traditional Drink</option>

            </select>

          </div>

        </div>

        {loading ? (

          <p>Finding meals for you...</p>

        ) : error ? (

          <p>

            Meal recommendations are unavailable until the backend is connected.

          </p>

        ) : recommendedMeals.length === 0 ? (

          <p>

            {expiringProduct

              ? `No saved meals contain ${expiringProduct.productName}. Add a meal using this ingredient to get recommendations.`

              : 'No meals found. Add your own meal or update your stock.'}

          </p>

        ) : (

          <>
            <div className="meal-type-tabs" role="tablist" aria-label="Meal categories">
              {mealTypeTabs.map(type => (
                <button key={type} type="button" role="tab" aria-selected={activeMealTypeTab === type}
                  className={activeMealTypeTab === type ? 'active' : ''}
                  onClick={() => { setHasManuallySelectedMealType(true); setActiveMealTypeTab(type) }}>
                  {type} <span>{recommendedMeals.filter(meal => String(meal.meal_type || 'Uncategorized') === type).length}</span>
                </button>
              ))}
            </div>
            {hasManuallySelectedMealType && (
              <button type="button" className="meal-uncategorized-toggle"
                onClick={() => setHasManuallySelectedMealType(false)}>
                Use automatic meal category ({timeInfo.mealType})
              </button>
            )}
            {uncategorizedMeals.length > 0 && (
              <button type="button" className={`meal-uncategorized-toggle ${activeMealTypeTab === 'Uncategorized' ? 'active' : ''}`}
                onClick={() => { setHasManuallySelectedMealType(true); setActiveMealTypeTab('Uncategorized') }}>
                Uncategorized meals ({uncategorizedMeals.length}) — classify these existing meals
              </button>
            )}
            {mealsForActiveTab.length === 0 ? (
              <p className="meal-type-empty">No {activeMealTypeTab.toLowerCase()} meals yet. Add a meal and select this category.</p>
            ) : (
            <div className="meal-grid">

            {mealsForActiveTab.map(recipe => {

              const status = getMealStatus(recipe)
              const forecastRisks = getMealForecastRisk(recipe)
              const forecastMealKey = String(recipe?.id ?? recipe?.name ?? 'meal')

              return (

                <div className="meal-card" key={recipe.id} style={{ position: 'relative' }}>

                  {recipe.isCustom && (() => {

                    const savedMeal = customMeals.find(item => String(item.id) === String(String(recipe.id).replace('custom-', '')))

                    const previewUrl = savedMeal?.image || recipe.image

                    const hasPhoto = isHttpImageUrl(previewUrl)

                    return (

                      <div className="meal-card-menu-wrap" style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 5 }}>

                        <button

                          type="button"

                          aria-label={`Meal options for ${recipe.name}`}

                          title="Meal options"

                          onClick={() => setOpenMealMenuId(openMealMenuId === recipe.id ? null : recipe.id)}

                          style={{ width: '34px', height: '34px', border: '1px solid #dce9dc', borderRadius: '50%', background: '#fff', color: '#176b3a', fontSize: '22px', lineHeight: '1', cursor: 'pointer', boxShadow: '0 2px 7px rgba(0,0,0,.08)' }}

                        >⋮</button>

                        {openMealMenuId === recipe.id && (

                          <div style={{ position: 'absolute', top: '38px', right: 0, width: '175px', padding: '6px', background: '#fff', border: '1px solid #e1e9e1', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,.16)', display: 'flex', flexDirection: 'column', gap: '3px' }}>

                            <button type="button" onClick={() => { setSelectedMealForImage(savedMeal); setOpenMealMenuId(null); setShowMealGallery(true) }} style={mealMenuItemStyle}>🖼️ Choose image</button>

                            <button type="button" onClick={() => { setOpenMealMenuId(null); if (hasPhoto) { setImagePreviewName(savedMeal?.meal_name || recipe.name || 'Meal image'); setImagePreview(previewUrl) } else window.alert('No image selected for this meal yet. Choose an image first.') }} style={mealMenuItemStyle}>👁️ Preview image</button>

                            <button type="button" onClick={() => removeMealImage(savedMeal)} style={{ ...mealMenuItemStyle, color: '#c62828' }}>✕ Remove image</button>

                            <div style={{ height: '1px', background: '#edf1ed', margin: '4px 2px' }} />

                            <button type="button" onClick={() => { setOpenMealMenuId(null); handleShareMeal(savedMeal) }} style={mealMenuItemStyle}>
                              🌍 Share with Community
                            </button>

                            <button type="button" onClick={() => { setOpenMealMenuId(null); handleDeleteMeal(savedMeal) }} style={{ ...mealMenuItemStyle, color: '#c62828' }}>
                              🗑️ Delete Recipe
                            </button>

                          </div>

                        )}

                      </div>

                    )

                  })()}

                  <div

                    className="meal-image"

                    onClick={() => {

                      if (isHttpImageUrl(recipe.image)) {

                        setImagePreviewName(recipe.name || 'Meal image')

                        setImagePreview(recipe.image)

                      }

                    }}

                    role={isHttpImageUrl(recipe.image) ? 'button' : undefined}

                    tabIndex={isHttpImageUrl(recipe.image) ? 0 : undefined}

                    onKeyDown={event => {

                      if ((event.key === 'Enter' || event.key === ' ') && isHttpImageUrl(recipe.image)) {

                        event.preventDefault()

                        setImagePreviewName(recipe.name || 'Meal image')

                        setImagePreview(recipe.image)

                      }

                    }}

                    style={{ cursor: isHttpImageUrl(recipe.image) ? 'zoom-in' : 'default' }}

                    title={isHttpImageUrl(recipe.image) ? `Preview ${recipe.name || 'meal image'}` : undefined}

                  >

                    <span className="meal-match-badge">

                      {getMealMatchPercentage(recipe)}% Match

                    </span>

                    {isHttpImageUrl(recipe.image)

                      ? <img src={recipe.image} alt={recipe.name || 'Meal'} loading="lazy" />

                      : recipe.image}

                  </div>

                  <div className="meal-content">

                    <h3>{recipe.name}</h3>

                    <p>{recipe.description}</p>

                    {forecastRisks.length > 0 && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '10px 11px',
                          background: '#fff4e5',
                          border: '1px solid #f4c27a',
                          borderRadius: '9px',
                          color: '#8a4b08',
                          fontSize: '12px',
                          lineHeight: '1.5'
                        }}
                      >
                        <strong>⚠️ Future demand warning</strong>
                        <div>Predicted shortage within the next {cookingForecastDays} days:</div>
                        {forecastRisks.map(risk => (
                          <div key={risk.product_id} style={{ fontWeight: 600, marginTop: '4px' }}>
                            {risk.ingredient_name}: {risk.required_quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {risk.unit}
                          </div>
                        ))}
                        <button
                          type="button"
                          disabled={Boolean(addingForecastToShoppingList[forecastMealKey])}
                          onClick={() => addForecastRisksToShoppingList(recipe, forecastRisks)}
                          style={{
                            width: '100%',
                            marginTop: '9px',
                            padding: '8px 10px',
                            border: 'none',
                            borderRadius: '7px',
                            background: addingForecastToShoppingList[forecastMealKey] ? '#9bb9a3' : '#176b3a',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: addingForecastToShoppingList[forecastMealKey] ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {addingForecastToShoppingList[forecastMealKey]
                            ? 'Adding to shopping list...'
                            : '🛒 Add shortage quantity to shopping list'}
                        </button>
                        <div style={{ marginTop: '5px', fontSize: '10px', color: '#79521e' }}>
                          Optional · Adds only the predicted shortage quantity
                        </div>
                      </div>
                    )}

                    <div className="meal-details">

                      <span>⏱️ {recipe.time}</span>

                      <span>🥗 {recipe.difficulty}</span>

                      <span>👥 Serves {Number(membersByRecipe[recipe.id] || familyMembers)}</span>

                    </div>

                    <div className="meal-card-serving-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0 12px', flexWrap: 'wrap' }}>
                      <label htmlFor={`meal-servings-${recipe.id}`} style={{ fontSize: '13px', fontWeight: 600 }}>Prepare for</label>
                      <input
                        id={`meal-servings-${recipe.id}`}
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={membersByRecipe[recipe.id] || familyMembers}
                        onClick={event => event.stopPropagation()}
                        onChange={event => {
                          const value = event.target.value
                          setMembersByRecipe(previous => ({ ...previous, [recipe.id]: value }))
                        }}
                        onBlur={() => {
                          const count = Number(membersByRecipe[recipe.id] || familyMembers)
                          if (!Number.isInteger(count) || count < 1 || count > 100) {
                            setMembersByRecipe(previous => ({ ...previous, [recipe.id]: 1 }))
                          }
                        }}
                        style={{ width: '68px', padding: '6px 8px', border: '1px solid #b8d2bd', borderRadius: '8px' }}
                      />
                      <span style={{ fontSize: '12px', color: '#66756a' }}>members</span>
                    </div>

                    {recipe.isCustom && (

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>

                        <span style={{ background: '#e8f5e9', color: '#256029', padding: '5px 10px', borderRadius: '20px', fontSize: '13px' }}>

                          {recipe.category || 'Uncategorized'}

                        </span>

                        <span style={{ background: '#fff3e0', color: '#9a4d00', padding: '5px 10px', borderRadius: '20px', fontSize: '13px' }}>

                          {recipe.cooking_type || 'No cooking type'}

                        </span>
                        <span className="meal-type-card-badge">{recipe.meal_type || 'Uncategorized'}</span>

                      </div>

                    )}

                    
                    <p

                      style={{

                        fontWeight: 'bold',

                        color:

                          status === 0

                            ? 'green'

                            : status === 1

                            ? '#d97706'

                            : '#d32f2f',

                        marginTop: '10px'

                      }}

                    >

                      {status === 0

                        ? '✅ All ingredients available'

                        : status === 1

                        ? '⚠️ Some ingredients available'

                        : status === 2

                        ? '🛒 Ingredients need to be purchased'

                        : '➕ Ingredients not in your inventory'}

                    </p>

                    <div
                      className="meal-card-primary-actions"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: recipe.isCustom ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                        gap: '9px',
                        marginTop: '14px'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMembers(Number(membersByRecipe[recipe.id] || familyMembers))
                          setSelectedRecipe(recipe)
                        }}
                        style={{
                          minWidth: 0,
                          minHeight: '42px',
                          padding: '9px 8px',
                          border: '1px solid #b8d8c0',
                          borderRadius: '11px',
                          background: '#edf7ef',
                          color: '#176b3a',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        👨‍🍳 View Recipe
                      </button>

                      {recipe.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleCookMeal(recipe)}
                          className="cook-meal-btn"
                          style={{
                            minWidth: 0,
                            minHeight: '42px',
                            padding: '9px 8px',
                            border: '1px solid #f3c99f',
                            borderRadius: '11px',
                            background: '#fff2e5',
                            color: '#9a4d00',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          🍳 Cook Meal
                        </button>
                      )}
                    </div>

                  </div>

                </div>

              )

            })}

          </div>
          )}
          </>

        )}

      </div>

      {/* Recipe Details */}

      {selectedRecipe && (

        <div

          className="recipe-modal-overlay"

          onClick={() => setSelectedRecipe(null)}

        >

          <div

            className="recipe-modal"

            onClick={event => event.stopPropagation()}

          >

            <div className="recipe-modal-header">

              <div className="recipe-modal-heading">

                <span className="recipe-modal-heading-icon" aria-hidden="true">♧</span>

                <h2>Recipe Details</h2>

              </div>

              <button

                type="button"

                className="recipe-modal-close"

                onClick={() => setSelectedRecipe(null)}

                aria-label="Close recipe"

              >

                ✕

              </button>

            </div>

            <div className="recipe-hero">

              <div className="recipe-hero-image">

                {isHttpImageUrl(selectedRecipe.image)

                  ? <img src={selectedRecipe.image} alt={selectedRecipe.name || 'Meal'} />

                  : <span className="recipe-hero-emoji">{selectedRecipe.image || '🍽️'}</span>}

                <span className="recipe-hero-match">

                  {getMealMatchPercentage(selectedRecipe)}% Match

                </span>

              </div>

              <div className="recipe-hero-info">

                <h2>{selectedRecipe.name}</h2>

                <p>{selectedRecipe.description || 'A tasty meal made with ingredients at home.'}</p>

                <div className="recipe-hero-meta">

                  <span>◷ {selectedRecipe.time || `${selectedRecipe.preparation_time || 30} mins`}</span>

                  <span>▥ {selectedRecipe.difficulty || 'Easy'}</span>

                  <span>♧ Original recipe: {Number(selectedRecipe.servings) || 1} member(s)</span><span>👥 Preparing for: {selectedMembers} member(s)</span>

                </div>

                <div className="recipe-hero-tags">

                  <span className="recipe-tag-veg">{selectedRecipe.category || 'Homemade'}</span>

                  <span className="recipe-tag-type">{selectedRecipe.cookingType || selectedRecipe.cooking_type || 'Quick Meals'}</span>

                </div>

              </div>

            </div>

            <div className="recipe-modal-body">

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', margin: '14px 0', padding: '12px 14px', background: '#f1f8f1', borderRadius: '12px' }}>
                <strong style={{ color: '#176b43' }}>👥 Serving {selectedMembers} member(s)</strong>
                <button type="button" onClick={() => setSelectedRecipe(null)} style={{ border: '1px solid #176b43', color: '#176b43', background: '#fff', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer' }}>
                  Close recipe
                </button>
              </div>
              <div className="recipe-availability-card">

                <div className="recipe-availability-heading">

                  <span className="recipe-availability-check">✓</span>

                  <strong>Ingredient Availability</strong>

                </div>

                <div className="recipe-availability-track">

                  <span style={{ width: `${getMealMatchPercentage(selectedRecipe)}%` }} />

                </div>

                <div className="recipe-availability-summary">

                  <span>

                    {getScaledMealIngredients(selectedRecipe).filter(ingredient => isIngredientSufficient(ingredient)).length}

                    {' '}of{' '}{selectedRecipe.ingredients.length} ingredients available

                  </span>

                  <strong>{getMealMatchPercentage(selectedRecipe)}%</strong>

                </div>

              </div>

              <div className="recipe-section-title-row">

                <div>

                  <h3>🥕 Required Ingredients</h3>

                  <p>Required quantities and household stock availability</p>

                </div>

                <span className="recipe-ingredient-count">

                  {selectedRecipe.ingredients.length} {selectedRecipe.ingredients.length === 1 ? 'ingredient' : 'ingredients'}

                </span>

              </div>

              <div className="recipe-ingredient-list">

                {selectedRecipe.ingredients.map((ingredient, index) => {

                  // Scale from the recipe's saved original servings to the
                  // currently selected household member count.
                  const scaledIngredient = getScaledIngredient(
                    ingredient,
                    selectedRecipe.servings || 1,
                    selectedMembers
                  )

                  const ingredientName =
                    typeof ingredient === 'string'
                      ? ingredient
                      : (ingredient.ingredient_name || ingredient.name || 'Ingredient')

                  const sufficient = isIngredientSufficient(scaledIngredient)

                  const requiredText =
                    typeof scaledIngredient !== 'string' && scaledIngredient
                      ? `${Number(scaledIngredient.quantity || 0).toFixed(3)} ${scaledIngredient.unit || ''}`.trim()
                      : 'Required quantity not specified'

                  return (

                    <div

                      className={`recipe-ingredient-item ${sufficient ? 'available' : 'unavailable'}`}

                      key={index}

                    >

                      <div className="recipe-ingredient-main">

                        <div className="recipe-ingredient-icon">

                          {sufficient ? '✓' : '⚠'}

                        </div>

                        <div>

                          <strong>{ingredientName}</strong>

                          <span>Required: {requiredText}</span>

                        </div>

                      </div>

                      <span className={`recipe-stock-status ${sufficient ? 'available' : 'unavailable'}`}>

                        {sufficient ? 'Available' : 'Missing'}

                      </span>

                    </div>

                  )

                })}

              </div>

              <div className="recipe-preparation-section">

                <div className="recipe-section-title-row preparation-title-row">

                  <div>

                    <h3>👩‍🍳 Preparation</h3>

                    <p>Follow the preparation steps for this meal.</p>

                  </div>

                </div>

                {selectedRecipe.steps.length > 0 ? (

                  <ol className="recipe-steps-list">

                    {selectedRecipe.steps.map((step, index) => (

                      <li key={index}>

                        <span className="recipe-step-number">{index + 1}</span>

                        <span>{step}</span>

                      </li>

                    ))}

                  </ol>

                ) : (

                  <div className="recipe-no-steps">

                    <span>🍳</span>

                    <p>

                      This is your saved custom meal. No preparation steps were added.

                      Follow your preferred preparation method using the ingredients listed above.

                    </p>

                  </div>

                )}

              </div>

            </div>

            
          </div>

        </div>

      )}

      {/* Expired ingredient safety block */}
      {expiredCookWarning && (
        <div
          className="recipe-modal-overlay expired-cook-warning-overlay"
          onClick={() => setExpiredCookWarning(null)}
          role="presentation"
          style={{ zIndex: 1200 }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="expired-cook-warning-title"
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(92vw, 460px)',
              padding: '24px',
              borderRadius: '18px',
              background: '#fffdf7',
              boxShadow: '0 18px 60px rgba(0,0,0,.28)',
              border: '1px solid #f2c4a5'
            }}
          >
            <div style={{ fontSize: '38px', textAlign: 'center' }} aria-hidden="true">⚠️</div>
            <h2 id="expired-cook-warning-title" style={{ margin: '8px 0', textAlign: 'center', color: '#a12b20' }}>
              Cannot Cook This Meal
            </h2>
            <p style={{ textAlign: 'center', color: '#4b5563', lineHeight: 1.5 }}>
              {expiredCookWarning.mealName} contains expired inventory. Update the affected product before cooking.
            </p>
            <div style={{ margin: '16px 0', padding: '12px', borderRadius: '10px', background: '#fff1ee', border: '1px solid #f3c0b8' }}>
              {expiredCookWarning.expiredProducts.map(item => (
                <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '5px 0', color: '#8f241c' }}>
                  <strong>{item.product_name}</strong>
                  <span>Expired · {item.expiry_date}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: '#6b625d', lineHeight: 1.5 }}>
              No stock has been deducted and no cooking history has been saved. An expiry date alone cannot confirm food safety; do not use food that may be unsafe.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={() => setExpiredCookWarning(null)}
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #cbd5cf', background: '#fff', color: '#365443', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={openInventoryForExpiredIngredient}
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: 0, background: '#176b43', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Update Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share with Community confirmation modal */}
      {pendingShareMeal && (
        <div
          className="recipe-modal-overlay share-community-modal-overlay"
          onClick={() => !sharingMeal && setPendingShareMeal(null)}
          role="presentation"
        >
          <div
            className="share-community-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-community-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="share-community-modal-icon">🌍</div>
            <h2 id="share-community-title">Share with Community</h2>
            <p className="share-community-meal-name">{pendingShareMeal.meal_name}</p>
            <p className="share-community-description">Meal type: <strong>{pendingShareMeal.meal_type || 'Uncategorized'}</strong></p>
            {isHttpImageUrl(pendingShareMeal.image) ? (
              <img className="share-community-preview-image" src={pendingShareMeal.image} alt={pendingShareMeal.meal_name} />
            ) : (
              <div className="share-community-no-image" role="status">
                <span aria-hidden="true">🖼️</span>
                <strong>No image selected</strong>
                <small>Do you want to share this recipe without an image?</small>
              </div>
            )}
            <p className="share-community-description">
              Your original meal will remain in My Meals. The shared copy will be reviewed by an admin before it appears publicly.
            </p>
            <div className="share-community-modal-actions">
              <button type="button" className="share-community-cancel" onClick={() => setPendingShareMeal(null)} disabled={sharingMeal}>Cancel</button>
              <button type="button" className="share-community-confirm" onClick={confirmShareMeal} disabled={sharingMeal}>
                {sharingMeal ? 'Sharing…' : '✓ Confirm Share'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meal image preview modal */}

      {imagePreview && (

        <div className="recipe-modal-overlay meal-image-preview-overlay" onClick={() => { setImagePreview(''); setImagePreviewName('') }} role="presentation">

          <div className="meal-image-preview-dialog" role="dialog" aria-modal="true" aria-label="Meal image preview" onClick={event => event.stopPropagation()} style={{ position: 'relative', width: 'min(92vw, 760px)', maxHeight: '90vh', padding: '16px', background: '#fffdf7', borderRadius: '16px', boxShadow: '0 18px 60px rgba(0,0,0,.28)' }}>

            <h2 style={{ margin: '0 44px 12px 0', color: '#176b43', fontSize: '20px', overflowWrap: 'anywhere' }}>{imagePreviewName || 'Meal image'}</h2>

            <button type="button" onClick={() => { setImagePreview(''); setImagePreviewName('') }} aria-label="Close image preview" style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 2, width: '36px', height: '36px', border: 0, borderRadius: '50%', background: '#176b43', color: '#fff', fontSize: '22px', cursor: 'pointer' }}>×</button>

            <img src={imagePreview} alt="Selected meal preview" onError={() => { setImagePreview(''); window.alert('This meal image could not be loaded. Please choose another image.') }} style={{ display: 'block', width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '10px' }} />

          </div>

        </div>

      )}

      {/* AI Note */}

      <div className="meal-ai-note">

        <h2>🤖 Smart Meal Suggestions</h2>

        <p>

          Home Needs recommends meals using your available product stock.

          Meals with all required ingredients and quantities available

          appear first. Meals with partially available ingredients appear

          next, followed by meals whose ingredients are not in stock, and

          finally meals with ingredients not listed in your inventory.

          Your custom meals are saved in the database.

        </p>

      </div>
        </>
      )}

    </div>

  )

}

const mealMenuItemStyle = { width: '100%', textAlign: 'left', padding: '10px 9px', border: 'none', borderRadius: '8px', background: 'transparent', color: '#24452e', fontSize: '13px', cursor: 'pointer' }

const inputStyle = {

  width: '100%',

  minWidth: 0,

  padding: '12px',

  border: '1px solid #ccc',

  borderRadius: '8px',

  boxSizing: 'border-box'

}

export default MealRecommendation
