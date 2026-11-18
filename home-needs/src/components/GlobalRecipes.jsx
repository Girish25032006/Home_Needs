

import { useCallback, useEffect, useMemo, useState } from 'react'

import './GlobalRecipes.css'



const EMPTY_INGREDIENT = {

  ingredient_name: '',

  quantity: '',

  unit: 'Piece'

}



// Keep the same meal-time windows used by Personal Meal Recommendations.
function getCurrentMealType(date = new Date()) {
  const hour = date.getHours()

  if (hour >= 5 && hour < 11) return 'Breakfast'
  if (hour >= 11 && hour < 15) return 'Lunch'
  if (hour >= 15 && hour < 19) return 'Snacks'
  return 'Dinner'
}



export default function GlobalRecipes({

  apiUrl,

  MealImageGallery,

  onInventoryUpdated

}) {

  const [activeTab, setActiveTab] = useState('explore')

  const [recipes, setRecipes] = useState([])

  const [inventoryProducts, setInventoryProducts] = useState([])

  const [ingredientAliases, setIngredientAliases] = useState({})

  const [inventoryLoaded, setInventoryLoaded] = useState(false)

  const [savedRecipes, setSavedRecipes] = useState([])

  const [submissions, setSubmissions] = useState([])

  const [pendingRecipes, setPendingRecipes] = useState([])

  const [selectedRecipe, setSelectedRecipe] = useState(null)

  const [pendingConfirmation, setPendingConfirmation] = useState(null)

  const [selectedMembers, setSelectedMembers] = useState(1)

  const [membersByRecipe, setMembersByRecipe] = useState({})

  const [actionProcessing, setActionProcessing] = useState(false)

  const [reviews, setReviews] = useState([])



  const [search, setSearch] = useState('')

  const [categoryFilter, setCategoryFilter] = useState('')

  const [cookingFilter, setCookingFilter] = useState('')

  const [mealTypeFilter, setMealTypeFilter] = useState(() => getCurrentMealType())



  const [loading, setLoading] = useState(false)

  const [message, setMessage] = useState('')

  const [error, setError] = useState('')

  const [isAdmin, setIsAdmin] = useState(false)



  const [showGallery, setShowGallery] = useState(false)

  const [formSaving, setFormSaving] = useState(false)



  const [rating, setRating] = useState(5)

  const [reviewText, setReviewText] = useState('')



  const [recipeForm, setRecipeForm] = useState({

    recipe_name: '',

    description: '',

    category: 'Vegetarian',

    preparation_time: '30',

    difficulty: 'Easy',

    cooking_type: 'Quick Meals',

    meal_type: 'Breakfast',

    servings: '1',

    image_url: '',

    ingredients: [{ ...EMPTY_INGREDIENT }],

    steps: ['']

  })



  // Use the same ingredient matching and quantity validation rules as

  // MealRecommendation.jsx so the same recipe gets the same match percentage.

  // Exact product names and admin-approved aliases are supported; fuzzy

  // substring matching is intentionally avoided (Rice != Basmati Rice).

  const normalizeIngredientName = value => String(value || '')

    .toLowerCase()

    .replace(/basmathi/g, 'basmati')

    .replace(/[^a-z0-9]/g, '')



  function findInventoryProduct(ingredientOrName) {

    const ingredient = ingredientOrName && typeof ingredientOrName === 'object'

      ? ingredientOrName

      : null

    const ingredientName = ingredient

      ? (ingredient.ingredient_name || ingredient.name || '')

      : ingredientOrName



    const linkedProductId = ingredient?.product_id

    if (linkedProductId !== null && linkedProductId !== undefined && linkedProductId !== '') {

      const linkedMatches = inventoryProducts.filter(product =>

        String(product.id ?? product.product_id) === String(linkedProductId)

      )

      if (linkedMatches.length === 1) return linkedMatches[0]

      if (linkedMatches.length > 1) return null

    }



    const rawSearch = normalizeIngredientName(ingredientName)

    if (!rawSearch) return null



    const aliasMap = Object.fromEntries(

      Object.entries(ingredientAliases || {}).map(([key, value]) => [

        normalizeIngredientName(key), normalizeIngredientName(value)

      ])

    )



    const namedProducts = inventoryProducts.map(product => {

      const productName = product.product_name || product.productName || product.name

      const rawKey = normalizeIngredientName(productName)

      return { product, rawKey, canonicalKey: aliasMap[rawKey] || rawKey }

    }).filter(item => item.rawKey)



    const exactMatches = namedProducts.filter(item => item.rawKey === rawSearch)

    if (exactMatches.length === 1) return exactMatches[0].product

    if (exactMatches.length > 1) return null



    const target = aliasMap[rawSearch] || rawSearch

    const aliasMatches = namedProducts.filter(item => item.canonicalKey === target)

    return aliasMatches.length === 1 ? aliasMatches[0].product : null

  }



  function getScaledCommunityIngredient(ingredient, targetMembers = selectedMembers) {

    if (!ingredient || typeof ingredient !== 'object') return ingredient

    const originalServings = Math.max(1, Number(selectedRecipe?.servings) || 1)

    const target = Math.max(1, Number(targetMembers) || 1)

    const originalQuantity = Number(ingredient.quantity ?? ingredient.required_quantity)

    if (!Number.isFinite(originalQuantity)) return ingredient

    return { ...ingredient, quantity: originalQuantity * target / originalServings }

  }



  function formatIngredientQuantity(value) {

    const number = Number(value)

    if (!Number.isFinite(number)) return value

    return Number(number.toFixed(3)).toString()

  }



  function isRecipeIngredientSufficient(ingredient) {

    const product = findInventoryProduct(ingredient)

    if (!product) return false

    if (typeof ingredient === 'string') return Number(product.quantity) > 0



    // Community API ingredients use quantity; support required_quantity too.

    const requiredQuantity = Number(ingredient.quantity ?? ingredient.required_quantity)

    const availableQuantity = Number(product.quantity)

    if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0 ||

        !Number.isFinite(availableQuantity) || availableQuantity < 0) return false



    const normalizeUnit = rawUnit => {

      // Remove explanatory text such as "(15 ml)" before normalizing.

      // Otherwise "Tablespoon (15 ml)" becomes "tablespoon15ml" and

      // cannot match the tbsp conversion rule below.

      const value = String(rawUnit || '')

        .toLowerCase()

        .trim()

        .replace(/\([^)]*\)/g, '')

        .replace(/[^a-z0-9]/g, '')

      const aliases = {

        mg: 'mg', milligram: 'mg', milligrams: 'mg',

        g: 'g', gram: 'g', grams: 'g',

        kg: 'kg', kilogram: 'kg', kilograms: 'kg',

        ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',

        l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',

        tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',

        tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',

        tablespoon15ml: 'tbsp', tablespoons15ml: 'tbsp',

        cup: 'cup', cups: 'cup', cup250ml: 'cup', cups250ml: 'cup',

        teaspoon5ml: 'tsp', teaspoons5ml: 'tsp',

        pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece',

        unit: 'piece', units: 'piece', each: 'piece', no: 'piece', nos: 'piece',

        dozen: 'dozen', dozens: 'dozen',

        pack: 'packet', packs: 'packet', packets: 'packet', packet: 'packet',

        bottle: 'bottle', bottles: 'bottle', box: 'box', boxes: 'box'

      }

      return aliases[value] || value

    }



    const ingredientName = ingredient.ingredient_name || ingredient.name || ''

    const requestedKey = normalizeIngredientName(ingredientName)

    const aliasMap = Object.fromEntries(

      Object.entries(ingredientAliases || {}).map(([key, value]) => [

        normalizeIngredientName(key), normalizeIngredientName(value)

      ])

    )

    const canonicalKey = aliasMap[requestedKey] || normalizeIngredientName(ingredientName)



    // Keep the same ingredient-specific conversions as Meal Recommendations.

    const densityRules = [

      { names: ['salt', 'table salt'], gramsPerMl: 1.2 },

      { names: ['cumin seeds', 'cumin', 'jeera'], gramsPerMl: 0.4 },

      { names: ['cooking oil', 'oil', 'sunflower oil', 'vegetable oil'], gramsPerMl: 0.92 },

      { names: ['milk'], gramsPerMl: 1.03 },

      { names: ['sugar'], gramsPerMl: 0.85 },

      { names: ['wheat flour', 'flour', 'atta', 'maida'], gramsPerMl: 0.53 },

      { names: ['tomato', 'tomatoes'], gramsPerMl: 0.95 },

      { names: ['onion', 'onions'], gramsPerMl: 0.75 },

      { names: ['potato', 'potatoes'], gramsPerMl: 0.70 },

      { names: ['green chilli', 'green chili', 'chilli', 'chili'] },

      { names: ['lemon'] },

      { names: ['apple'] },

      { names: ['banana'] },

      { names: ['carrot'] },

      { names: ['egg'] },

      { names: ['garlic'] }

    ]

    const densityRule = densityRules.find(rule => rule.names.some(name => {

      const key = normalizeIngredientName(name)

      return canonicalKey === key || canonicalKey.includes(key) || key.includes(canonicalKey)

    }))



    const recipeUnit = normalizeUnit(ingredient.unit)

    const stockUnit = normalizeUnit(product.unit || product.quantity_unit || product.stock_unit)

    if (!recipeUnit || !stockUnit) return false



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



    addPair('kg', 'g', 1000)

    addPair('g', 'mg', 1000)

    addPair('l', 'ml', 1000)

    addPair('tsp', 'ml', 5)

    addPair('tbsp', 'ml', 15)

    addPair('cup', 'ml', 250)

    addPair('tsp', 'g', 5)

    addPair('tbsp', 'g', 15)

    addPair('cup', 'g', 250)
    addPair('piece', 'g', 130)

    if (densityRule?.gramsPerMl) addPair('ml', 'g', densityRule.gramsPerMl)

    if (densityRule?.gramsPerPiece) addPair('piece', 'g', densityRule.gramsPerPiece)



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



    if (convertedQuantity === null && recipeUnit === stockUnit) {

      convertedQuantity = requiredQuantity

    }

    if (convertedQuantity === null || !Number.isFinite(convertedQuantity)) return false

    return availableQuantity + 1e-9 >= convertedQuantity

  }



  // Scale each card's ingredient quantities to the servings selected on that
  // card before checking stock. This prevents a recipe from receiving a 100%
  // match when the household has enough for one serving but not the selected
  // number of servings.
  const getScaledCardIngredient = (recipe, ingredient) => {
    if (!ingredient || typeof ingredient !== 'object') return ingredient

    const recipeServings = Math.max(1, Number(recipe?.servings) || 1)
    const targetServings = Math.max(1, Number(membersByRecipe[recipe?.id]) || 1)
    const baseQuantity = Number(ingredient.quantity ?? ingredient.required_quantity)

    if (!Number.isFinite(baseQuantity)) return ingredient

    return {
      ...ingredient,
      quantity: baseQuantity * targetServings / recipeServings
    }
  }



  const getRecipeMatch = recipe => {
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
    if (!ingredients.length) return { percentage: 0, available: 0, total: 0 }

    const validIngredients = ingredients.filter(ingredient => {
      const name = typeof ingredient === 'string'
        ? ingredient
        : ingredient?.ingredient_name || ingredient?.name
      return Boolean(String(name || '').trim())
    })

    if (!validIngredients.length) return { percentage: 0, available: 0, total: 0 }

    const available = validIngredients.filter(ingredient => {
      const scaledIngredient = getScaledCardIngredient(recipe, ingredient)
      return isRecipeIngredientSufficient(scaledIngredient)
    }).length

    return {
      percentage: Math.round((available / validIngredients.length) * 100),
      available,
      total: validIngredients.length
    }
  }



  const loadInventoryForMatching = useCallback(async () => {

    try {

      const [productsResponse, aliasesResponse] = await Promise.all([

        fetch(`${apiUrl}/`, { credentials: 'include' }),

        fetch(`${apiUrl}/ingredient-aliases`, { credentials: 'include' })

      ])

      const productsData = productsResponse.ok ? await productsResponse.json() : []

      const aliasesData = aliasesResponse.ok ? await aliasesResponse.json() : {}

      setInventoryProducts(Array.isArray(productsData) ? productsData : [])

      setIngredientAliases(aliasesData.aliases || {})

    } catch (err) {

      console.warn('Unable to load household inventory for recipe matching:', err)

      setInventoryProducts([])

      setIngredientAliases({})

    } finally {

      setInventoryLoaded(true)

    }

  }, [apiUrl])



  // Common API request

  const request = useCallback(async (path, options = {}) => {

    const response = await fetch(

      `${apiUrl}/global-recipes${path}`,

      {

        credentials: 'include',

        ...options,

        headers: {

          ...(options.body

            ? { 'Content-Type': 'application/json' }

            : {}),

          ...(options.headers || {})

        }

      }

    )



    const data = await response.json().catch(() => ({}))



    if (!response.ok) {

      throw new Error(

        data.error || data.message || 'Request failed.'

      )

    }



    return data

  }, [apiUrl])



  // Load approved community recipes

  const loadExplore = useCallback(async () => {

    setLoading(true)

    setError('')



    try {

      const params = new URLSearchParams()



      if (search.trim()) {

        params.set('search', search.trim())

      }



      if (categoryFilter) {

        params.set('category', categoryFilter)

      }



      if (cookingFilter) {

        params.set('cooking_type', cookingFilter)

      }



      if (mealTypeFilter) {

        params.set('meal_type', mealTypeFilter)

      }



      const query = params.toString()



      const data = await request(

        query ? `?${query}` : ''

      )



      setRecipes(Array.isArray(data) ? data : [])



    } catch (err) {

      setError(err.message)

    } finally {

      setLoading(false)

    }

  }, [

    request,

    search,

    categoryFilter,

    cookingFilter,

    mealTypeFilter

  ])



  // Load saved recipes

  const loadSaved = useCallback(async () => {

    try {

      const data = await request('/saved')



      setSavedRecipes(

        Array.isArray(data) ? data : []

      )

    } catch (err) {

      setError(err.message)

    }

  }, [request])



  // Load current user's submissions

  const loadSubmissions = useCallback(async () => {

    try {

      const data = await request('/my-submissions')



      setSubmissions(

        Array.isArray(data) ? data : []

      )

    } catch (err) {

      setError(err.message)

    }

  }, [request])



  // Load pending recipes only for admins

  const loadPending = useCallback(async () => {

    if (!isAdmin) return



    try {

      const data = await request('/admin/pending')



      setPendingRecipes(

        Array.isArray(data) ? data : []

      )

    } catch (err) {

      console.warn(

        'Admin recipe queue:',

        err.message

      )

    }

  }, [request, isAdmin])



  // Check current user's role before calling admin API

  const checkAdminAccess = useCallback(async () => {

    try {

      const response = await fetch(

        `${apiUrl}/api/me`,

        {

          credentials: 'include'

        }

      )



      if (!response.ok) {

        setIsAdmin(false)

        setPendingRecipes([])

        return

      }



      const data = await response.json().catch(() => ({}))



      // Supports either {user: {...}} or a direct user object

      const user = data.user || data



      const admin =

        String(user.role || '').toLowerCase() === 'admin'



      setIsAdmin(admin)



      // Only admins can call this endpoint

      if (admin) {

        try {

          const pendingData = await request('/admin/pending')



          setPendingRecipes(

            Array.isArray(pendingData)

              ? pendingData

              : []

          )

        } catch (err) {

          console.warn(

            'Admin recipe queue:',

            err.message

          )

        }

      } else {

        setPendingRecipes([])

      }



    } catch (err) {

      console.warn(

        'Unable to check current user role:',

        err.message

      )



      setIsAdmin(false)

      setPendingRecipes([])

    }

  }, [apiUrl, request])



  // Initial loading

  useEffect(() => {

    loadExplore()

    loadSaved()

    loadSubmissions()

    checkAdminAccess()

    loadInventoryForMatching()

  }, [

    loadExplore,

    loadSaved,

    loadSubmissions,

    checkAdminAccess,

    loadInventoryForMatching

  ])



  // Recommendation ranking:
  // 1) The current meal category is applied as a filter by loadExplore().
  // 2) Inventory sufficiency has the strongest influence (60%).
  // 3) Community rating contributes the remaining 40%.
  // A recipe ingredient counts as available only when enough quantity exists
  // for the serving count selected on that recipe card.
  const visibleRecipes = useMemo(() => {
    const ranked = recipes.map((recipe, originalIndex) => {
      const match = inventoryLoaded
        ? getRecipeMatch(recipe)
        : { percentage: 0, available: 0, total: 0 }
      const ratingValue = Math.max(0, Math.min(5, Number(recipe.average_rating) || 0))
      const ratingScore = (ratingValue / 5) * 100
      const recommendationScore = inventoryLoaded
        ? (match.percentage * 0.6) + (ratingScore * 0.4)
        : ratingScore

      return { recipe, originalIndex, match, ratingScore, recommendationScore }
    })

    ranked.sort((a, b) =>
      b.recommendationScore - a.recommendationScore ||
      b.match.percentage - a.match.percentage ||
      b.ratingScore - a.ratingScore ||
      a.originalIndex - b.originalIndex
    )

    return ranked.map(item => item.recipe)
  }, [recipes, inventoryLoaded, inventoryProducts, ingredientAliases, membersByRecipe])



  // Open recipe details

  async function openRecipe(id) {

    setError('')



    try {

      const data = await request(`/${id}`)



      setSelectedRecipe(data)

      // Carry the serving count chosen on this recipe card into its detail view.

      setSelectedMembers(Number(membersByRecipe[id]) || 1)



      setRating(

        Number(data.my_rating?.rating || 5)

      )



      setReviewText(

        data.my_rating?.review_text || ''

      )



      const reviewData = await request(

        `/${id}/reviews`

      )



      setReviews(

        Array.isArray(reviewData)

          ? reviewData

          : []

      )



    } catch (err) {

      setError(err.message)

    }

  }



  // Save or remove saved recipe

  async function toggleSave(recipe) {

    setError('')



    try {

      await request(

        `/${recipe.id}/save`,

        {

          method: recipe.is_saved

            ? 'DELETE'

            : 'POST'

        }

      )



      await Promise.all([

        loadExplore(),

        loadSaved()

      ])



      if (selectedRecipe?.id === recipe.id) {

        setSelectedRecipe(current =>

          current

            ? {

                ...current,

                is_saved: !current.is_saved

              }

            : current

        )

      }



    } catch (err) {

      setError(err.message)

    }

  }



  // Update ingredient form

  function updateIngredient(index, key, value) {

    setRecipeForm(current => ({

      ...current,

      ingredients: current.ingredients.map(

        (item, i) =>

          i === index

            ? { ...item, [key]: value }

            : item

      )

    }))

  }



  // Update preparation step

  function updateStep(index, value) {

    setRecipeForm(current => ({

      ...current,

      steps: current.steps.map(

        (item, i) =>

          i === index ? value : item

      )

    }))

  }



  // Submit new community recipe

  async function submitRecipe(event) {

    event.preventDefault()



    setError('')

    setMessage('')



    if (!recipeForm.image_url) {

      setError(

        'Please select an image from the shared Meal Image Gallery.'

      )

      return

    }



    const servingsValue = Number(recipeForm.servings)

    if (!Number.isInteger(servingsValue) || servingsValue < 1 || servingsValue > 100) {

      setError('Servings must be a whole number between 1 and 100.')

      return

    }



    const payload = {

      ...recipeForm,

      servings: servingsValue,



      preparation_time: Number(

        recipeForm.preparation_time

      ),



      ingredients: recipeForm.ingredients.map(item => ({

        ingredient_name:

          item.ingredient_name.trim(),



        quantity: Number(item.quantity),



        unit: item.unit.trim()

      })),



      steps: recipeForm.steps

        .map(step => step.trim())

        .filter(Boolean)

    }



    setFormSaving(true)



    try {

      const result = await request(

        '',

        {

          method: 'POST',

          body: JSON.stringify(payload)

        }

      )



      setMessage(

        result.message ||

        'Recipe submitted for admin approval.'

      )



      setRecipeForm({

        recipe_name: '',

        description: '',

        category: 'Vegetarian',

        preparation_time: '30',

        difficulty: 'Easy',

        cooking_type: 'Quick Meals',

        meal_type: 'Breakfast',

        servings: '1',

        image_url: '',

        ingredients: [{ ...EMPTY_INGREDIENT }],

        steps: ['']

      })



      await loadSubmissions()



      setActiveTab('submissions')



    } catch (err) {

      setError(err.message)

    } finally {

      setFormSaving(false)

    }

  }



  // Copy global recipe to personal meals

  async function addToMyMeals(recipe) {

    setError('')

    setMessage('')



    try {

      const result = await request(

        `/${recipe.id}/add-to-my-meals`,

        {

          method: 'POST',

          body: JSON.stringify({})

        }

      )



      setMessage(

        result.already_added

          ? 'This recipe is already in My Meals.'

          : 'Recipe copied to My Meals successfully.'

      )



      if (result.meal_id) {

        onInventoryUpdated?.()

      }



    } catch (err) {

      setError(err.message)

    }

  }



  // Add global recipe to personal meals before cooking

  async function cookGlobalRecipe(recipe, servings = selectedMembers) {

    setError('')



    try {

      const result = await request(

        `/${recipe.id}/add-to-my-meals`,

        {

          method: 'POST',

          body: JSON.stringify({})

        }

      )



      if (!result.meal_id) {

        throw new Error(

          'Could not find the personal meal copy. Please try Add to My Meals first.'

        )

      }



      await cookPersonalMeal(

        result.meal_id,

        recipe.recipe_name,

        servings

      )



    } catch (err) {

      setError(err.message)

    }

  }



  // Cook a community recipe immediately without showing a confirmation popup.
  // Use the currently selected serving count and preserve the existing backend stock deduction.
  async function handleCookDirect(recipe) {
    if (!recipe || actionProcessing) return

    const servings = Number(selectedMembers)

    if (!Number.isInteger(servings) || servings < 1 || servings > 100) {
      setError('Please enter a whole number of members between 1 and 100.')
      return
    }

    setError('')
    setActionProcessing(true)

    try {
      await cookGlobalRecipe(recipe, servings)
    } finally {
      setActionProcessing(false)
    }
  }


  // Existing personal meal cooking endpoint. Confirmation is handled by the in-app popup.

  async function cookPersonalMeal(mealId, mealName, servings = selectedMembers) {

    try {

      const response = await fetch(

        `${apiUrl}/meals/${mealId}/cook`,

        {

          method: 'POST',

          credentials: 'include',

          headers: {

            'Content-Type': 'application/json'

          },

          body: JSON.stringify({ servings })

        }

      )



      const data = await response.json().catch(() => ({}))



      if (!response.ok) {

        throw new Error(

          data.error || 'Unable to cook meal.'

        )

      }



      window.alert(

        data.message || 'Meal cooked successfully!'

      )



      onInventoryUpdated?.()

      await loadInventoryForMatching()



    } catch (err) {

      setError(err.message)

    }

  }



  // Run the action only after the user confirms in the popup.

  async function confirmRecipeAction() {

    const action = pendingConfirmation

    const recipe = selectedRecipe

    if (!action || !recipe || actionProcessing) return



    if (action === 'cook') {

      const servings = Number(selectedMembers)

      if (!Number.isInteger(servings) || servings < 1 || servings > 100) {

        setError('Please enter a whole number of members between 1 and 100.')

        return

      }

      setSelectedMembers(servings)

    }



    setActionProcessing(true)

    setPendingConfirmation(null)



    try {

      if (action === 'add') {

        await addToMyMeals(recipe)

      } else if (action === 'cook') {

        await cookGlobalRecipe(recipe)

      }

    } finally {

      setActionProcessing(false)

    }

  }



  // Submit rating and review

  async function saveRating(event) {

    event.preventDefault()



    if (!selectedRecipe) return



    try {

      const data = await request(

        `/${selectedRecipe.id}/rating`,

        {

          method: 'POST',

          body: JSON.stringify({

            rating: Number(rating),

            review_text: reviewText

          })

        }

      )



      setMessage(

        data.message || 'Rating saved.'

      )



      await openRecipe(selectedRecipe.id)

      await loadExplore()



    } catch (err) {

      setError(err.message)

    }

  }



  // Admin approve or reject recipe

  async function reviewRecipe(id, status) {

    let rejection_reason = ''



    if (status === 'rejected') {

      rejection_reason =

        window.prompt(

          'Enter the reason for rejecting this recipe:'

        ) || ''



      if (!rejection_reason.trim()) return

    }



    try {

      const data = await request(

        `/admin/${id}/review`,

        {

          method: 'PATCH',

          body: JSON.stringify({

            status,

            rejection_reason

          })

        }

      )



      setMessage(

        data.message || `Recipe ${status}.`

      )



      await Promise.all([

        loadPending(),

        loadExplore()

      ])



    } catch (err) {

      setError(err.message)

    }

  }



  // Select image from shared gallery

  function selectGalleryImage(image) {

    const url =

      image?.image_url ||

      image?.imageUrl ||

      image?.url ||

      ''



    setRecipeForm(current => ({

      ...current,

      image_url: url

    }))



    setShowGallery(false)

  }



  return (

    <section className="global-recipes">



      {/* Header */}

      <div className="global-recipes-heading">

        <div className="gr-hero-copy">

          <span className="global-recipes-eyebrow">

            HOME NEEDS COMMUNITY

          </span>



          <h2>🌍 Community Recipes</h2>



        </div>

        <div className="gr-hero-art" aria-hidden="true">

          <span className="gr-hero-leaf">🌿</span>

          <span className="gr-hero-family">👩‍🍳 👧 👵</span>

          <span className="gr-hero-leaf">🥕</span>

        </div>



        <button

          type="button"

          className="gr-primary-btn"

          onClick={() => {

            setActiveTab('submit')

            setMessage('')

            setError('')

          }}

        >

          ＋ Share a Recipe

        </button>

      </div>



      {/* Navigation tabs */}

      <nav

        className="gr-tabs"

        aria-label="Community recipe sections"

      >

        {[

          ['explore', 'Explore'],

          ['saved', `Saved (${savedRecipes.length})`],

          ['submissions', 'My Submissions'],



          ...(isAdmin

            ? [['admin', `Admin Review (${pendingRecipes.length})`]]

            : [])

        ].map(([key, label]) => (

          <button

            key={key}

            type="button"

            className={

              activeTab === key ? 'active' : ''

            }

            onClick={() => setActiveTab(key)}

          >

            {label}

          </button>

        ))}

      </nav>



      {/* Messages */}

      {message && (

        <div

          className="gr-alert success"

          role="status"

        >

          {message}

        </div>

      )}



      {error && (

        <div

          className="gr-alert error"

          role="alert"

        >

          {error}

        </div>

      )}



      {/* Explore recipes */}

      {activeTab === 'explore' && (

        <>

          <div className="gr-filters">



            <input

              value={search}

              onChange={e => setSearch(e.target.value)}

              onKeyDown={e =>

                e.key === 'Enter' && loadExplore()

              }

              placeholder="Search community recipes..."

              aria-label="Search community recipes"

            />



            <select

              value={categoryFilter}

              onChange={e =>

                setCategoryFilter(e.target.value)

              }

            >

              <option value="">All food categories</option>

              <option>Vegetarian</option>

              <option>Non-Vegetarian</option>
              <option>Beverages</option>

            </select>



            <select

              value={cookingFilter}

              onChange={e =>

                setCookingFilter(e.target.value)

              }

            >

              <option value="">All cooking types</option>

              <option>Quick Meals</option>

              <option>Healthy Meals</option>

              <option>Traditional Meals</option>
              <option>Quick Drink</option>
              <option>Healthy Drink</option>
              <option>Traditional Drink</option>

            </select>



            <select value={mealTypeFilter} onChange={e => setMealTypeFilter(e.target.value)} aria-label="Filter by meal category">

              <option value="">All meal categories</option>

              <option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snacks</option><option>Beverages</option>

            </select>



            <button

              type="button"

              onClick={loadExplore}

            >

              Search

            </button>

          </div>



          <div className="gr-results-heading">

            <h3>Recipes from Our Community</h3>

            <span>{visibleRecipes.length} Recipes</span>

          </div>



          {loading ? (

            <p className="gr-empty">

              Loading community recipes...

            </p>

          ) : visibleRecipes.length === 0 ? (

            <p className="gr-empty">

              No approved community recipes yet. Be the first to share one!

            </p>

          ) : (

            <div className="gr-grid">

              {visibleRecipes.map(recipe => (

                <article

                  className="gr-card"

                  key={recipe.id}

                >

                  <button

                    type="button"

                    className="gr-card-image"

                    onClick={() => openRecipe(recipe.id)}

                    aria-label={`View ${recipe.recipe_name}`}

                  >

                    <img

                      src={recipe.image_url}

                      alt={recipe.recipe_name}

                      loading="lazy"

                    />



                    {(() => {

                      const match = getRecipeMatch(recipe)

                      const tone = match.percentage >= 80 ? 'high' : match.percentage >= 40 ? 'medium' : 'low'

                      return (

                        <span

                          className={`gr-image-match-badge ${tone}`}

                          aria-label={`${inventoryLoaded ? match.percentage : 'Checking'}% ingredient match`}

                        >

                          {inventoryLoaded ? `${match.percentage}%` : '...'}

                        </span>

                      )

                    })()}

                  </button>



                  <div className="gr-card-body">



                    <div className="gr-card-meta">

                      <span>{recipe.category}</span>

                      <span>{recipe.meal_type || 'Uncategorized'}</span>

                      <span>

                        ⏱ {recipe.preparation_time} min

                      </span>

                      <span>👥 Serves {Number(membersByRecipe[recipe.id] || 1)}</span>

                    </div>



                    <div className="gr-card-serving-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '9px 0 12px', flexWrap: 'wrap' }}>

                      <label htmlFor={`gr-servings-${recipe.id}`} style={{ fontSize: '13px', fontWeight: 600 }}>Prepare for</label>

                      <input

                        id={`gr-servings-${recipe.id}`}

                        type="number"

                        min="1"

                        max="100"

                        step="1"

                        value={membersByRecipe[recipe.id] || 1}

                        onClick={event => event.stopPropagation()}

                        onChange={event => setMembersByRecipe(previous => ({ ...previous, [recipe.id]: event.target.value }))}

                        onBlur={() => {

                          const count = Number(membersByRecipe[recipe.id] || 1)

                          if (!Number.isInteger(count) || count < 1 || count > 100) {

                            setMembersByRecipe(previous => ({ ...previous, [recipe.id]: 1 }))

                          }

                        }}

                        style={{ width: '68px', padding: '6px 8px', border: '1px solid #b8d2bd', borderRadius: '8px' }}

                      />

                      <span style={{ fontSize: '12px', color: '#66756a' }}>members</span>

                    </div>



                    <h3>{recipe.recipe_name}</h3>







                    <div className="gr-rating">

                      ★ {Number(

                        recipe.average_rating || 0

                      ).toFixed(1)}



                      <small>

                        ({recipe.rating_count || 0} ratings)

                      </small>

                    </div>



                    <div className="gr-card-actions">



                      <button

                        type="button"

                        onClick={() => openRecipe(recipe.id)}

                      >

                        View Recipe

                      </button>



                      <button

                        type="button"

                        className="gr-save-btn"

                        onClick={() => toggleSave(recipe)}

                      >

                        {Number(recipe.is_saved)

                          ? '♥ Saved'

                          : '♡ Save'}

                      </button>



                    </div>

                  </div>

                </article>

              ))}

            </div>

          )}

        </>

      )}



      {/* Saved recipes */}

      {activeTab === 'saved' && (

        <div className="gr-grid">



          {savedRecipes.length === 0 ? (

            <p className="gr-empty">

              You haven't saved any community recipes yet.

            </p>

          ) : (

            savedRecipes.map(recipe => (

              <article

                className="gr-card"

                key={recipe.id}

              >

                <button

                  type="button"

                  className="gr-card-image"

                  onClick={() => openRecipe(recipe.id)}

                >

                  <img

                    src={recipe.image_url}

                    alt={recipe.recipe_name}

                  />



                    {(() => {

                      const match = getRecipeMatch(recipe)

                      const tone = match.percentage >= 80 ? 'high' : match.percentage >= 40 ? 'medium' : 'low'

                      return (

                        <span

                          className={`gr-image-match-badge ${tone}`}

                          aria-label={`${inventoryLoaded ? match.percentage : 'Checking'}% ingredient match`}

                        >

                          {inventoryLoaded ? `${match.percentage}%` : '...'}

                        </span>

                      )

                    })()}

                  </button>



                <div className="gr-card-body">

                  <h3>{recipe.recipe_name}</h3>







                  <p>

                    {recipe.category} · {recipe.meal_type || 'Uncategorized'} · {recipe.preparation_time} min · Serves {recipe.servings || 1}

                  </p>



                  <button

                    type="button"

                    onClick={() => openRecipe(recipe.id)}

                  >

                    View Recipe

                  </button>



                  <button

                    type="button"

                    className="gr-save-btn"

                    onClick={() =>

                      toggleSave({

                        ...recipe,

                        is_saved: true

                      })

                    }

                  >

                    Remove Saved

                  </button>

                </div>

              </article>

            ))

          )}



        </div>

      )}



      {/* Submit recipe */}

      {activeTab === 'submit' && (

        <form

          className="gr-form"

          onSubmit={submitRecipe}

        >



          <div className="gr-form-heading">

            <h3>Share Your Recipe</h3>

            <p>

              Your recipe will become public after admin approval.

            </p>

          </div>



          <label>

            Recipe name



            <input

              maxLength="100"

              required

              value={recipeForm.recipe_name}

              onChange={e =>

                setRecipeForm({

                  ...recipeForm,

                  recipe_name: e.target.value

                })

              }

            />

          </label>



          <label>

            Description(optional)



            <textarea

              maxLength="5000"

              rows="3"

              value={recipeForm.description}

              onChange={e =>

                setRecipeForm({

                  ...recipeForm,

                  description: e.target.value

                })

              }

            />

          </label>



          <div className="gr-form-grid">



            <label>

              Food category



              <select

                value={recipeForm.category}

                onChange={e => {
                  const nextCategory = e.target.value
                  const isBeverage = nextCategory === 'Beverages'

                  setRecipeForm({
                    ...recipeForm,
                    category: nextCategory,
                    meal_type: isBeverage ? 'Beverages' : (
                      recipeForm.meal_type === 'Beverages' ? 'Breakfast' : recipeForm.meal_type
                    ),
                    cooking_type: isBeverage ? 'Quick Drink' : (
                      recipeForm.meal_type === 'Beverages' ? 'Quick Meals' : recipeForm.cooking_type
                    )
                  })
                }}

              >

                <option>Vegetarian</option>

                <option>Non-Vegetarian</option>
                <option>Beverages</option>

              </select>

            </label>



            <label>

              Preparation time (minutes)



              <input

                type="number"

                min="1"

                required

                value={recipeForm.preparation_time}

                onChange={e =>

                  setRecipeForm({

                    ...recipeForm,

                    preparation_time: e.target.value

                  })

                }

              />

            </label>



            <label>

              Difficulty



              <select

                value={recipeForm.difficulty}

                onChange={e =>

                  setRecipeForm({

                    ...recipeForm,

                    difficulty: e.target.value

                  })

                }

              >

                <option>Easy</option>

                <option>Medium</option>

                <option>Hard</option>

              </select>

            </label>



            <label>

              Meal category

              <select
                value={recipeForm.meal_type}
                onChange={e => setRecipeForm({
                  ...recipeForm,
                  meal_type: e.target.value,
                  cooking_type: e.target.value === 'Beverages' ? 'Quick Drink' : 'Quick Meals'
                })}
                required
                disabled={recipeForm.category === 'Beverages'}
              >
                {recipeForm.category === 'Beverages' ? (
                  <option value="Beverages">Beverages</option>
                ) : (
                  <>
                    <option>Breakfast</option>
                    <option>Lunch</option>
                    <option>Dinner</option>
                    <option>Snacks</option>
                  </>
                )}
              </select>

            </label>



            <label>

              Number of members (servings)

              <input

                type="number"

                min="1"

                max="100"

                step="1"

                required

                value={recipeForm.servings}

                onChange={e =>

                  setRecipeForm({

                    ...recipeForm,

                    servings: e.target.value

                  })

                }

              />

              <small>Enter how many people the original ingredient quantities serve.</small>

            </label>



            <label>

              Cooking type

              <select

                value={recipeForm.cooking_type}

                onChange={e => setRecipeForm({ ...recipeForm, cooking_type: e.target.value })}

                required

              >

                {recipeForm.category === 'Beverages' ? (
                  <>
                    <option>Quick Drink</option>
                    <option>Healthy Drink</option>
                    <option>Traditional Drink</option>
                  </>
                ) : (
                  <>
                    <option>Quick Meals</option>
                    <option>Healthy Meals</option>
                    <option>Traditional Meals</option>
                  </>
                )}

              </select>

            </label>



          </div>



          {/* Image gallery */}

          <div className="gr-image-picker">

            <div>

              <strong>Recipe image</strong>



              <small>

                Choose an existing image from the shared Meal Image Gallery.

              </small>

            </div>



            <button

              type="button"

              onClick={() => setShowGallery(true)}

            >

              Choose from Gallery

            </button>

          </div>



          {recipeForm.image_url && (

            <img

              className="gr-selected-image"

              src={recipeForm.image_url}

              alt="Selected recipe"

            />

          )}



          {/* Ingredients */}

          <section className="gr-form-section">

          <div className="gr-repeater-heading">

            <h4>🧺 Ingredients ({recipeForm.ingredients.length})</h4>



            <button

              type="button"

              onClick={() =>

                setRecipeForm(current => ({

                  ...current,

                  ingredients: [

                    ...current.ingredients,

                    { ...EMPTY_INGREDIENT }

                  ]

                }))

              }

            >

              ＋ Add Ingredient

            </button>

          </div>



          {recipeForm.ingredients.map((item, index) => (

            <div

              className="gr-ingredient-item"

              key={index}

            >

              <div className="gr-ingredient-labels" aria-hidden="true">

                <span>Ingredient</span>

                <span>Quantity</span>

                <span>Unit</span>

                <span></span>

              </div>

              <div className="gr-ingredient-row">

              <input

                placeholder="Ingredient name"

                required

                value={item.ingredient_name}

                onChange={e =>

                  updateIngredient(

                    index,

                    'ingredient_name',

                    e.target.value

                  )

                }

              />



              <input

                type="number"

                min="0.01"

                step="any"

                placeholder="Quantity"

                required

                value={item.quantity}

                onChange={e =>

                  updateIngredient(

                    index,

                    'quantity',

                    e.target.value

                  )

                }

              />



              <select

                aria-label={`Unit for ingredient ${index + 1}`}

                required

                value={item.unit}

                onChange={e =>

                  updateIngredient(

                    index,

                    'unit',

                    e.target.value

                  )

                }

              >

                <option value="Kg">Kg</option>

                <option value="Gram">Gram</option>

                <option value="Litre">Litre</option>

                <option value="ml">ml</option>

                <option value="Packet">Packet</option>

                <option value="Piece">Piece</option>

                <option value="Bottle">Bottle</option>

                <option value="Tablespoon (15 ml)">Tablespoon (15 ml)</option>

                <option value="Teaspoon (5 ml)">Teaspoon (5 ml)</option>

                <option value="Cup (250 ml)">Cup (250 ml)</option>

              </select>



              <button

                type="button"

                disabled={

                  recipeForm.ingredients.length === 1

                }

                onClick={() =>

                  setRecipeForm(current => ({

                    ...current,

                    ingredients: current.ingredients.filter(

                      (_, i) => i !== index

                    )

                  }))

                }

              >

                ×

              </button>

              </div>

            </div>

          ))}



          </section>



          {/* Preparation steps */}

          <section className="gr-form-section">

          <div className="gr-repeater-heading">

            <h4>👩‍🍳 Preparation (Steps) <span className="gr-required-mark">*</span></h4>



            <button

              type="button"

              onClick={() =>

                setRecipeForm(current => ({

                  ...current,

                  steps: [...current.steps, '']

                }))

              }

            >

              ＋ Add Step

            </button>

          </div>



          {recipeForm.steps.map((step, index) => (

            <div

              className="gr-step-row"

              key={index}

            >

              <span>{index + 1}</span>



              <textarea

                rows="2"

                required

                placeholder={`Describe step ${index + 1}`}

                value={step}

                onChange={e =>

                  updateStep(index, e.target.value)

                }

              />



              <button

                type="button"

                disabled={recipeForm.steps.length === 1}

                onClick={() =>

                  setRecipeForm(current => ({

                    ...current,

                    steps: current.steps.filter(

                      (_, i) => i !== index

                    )

                  }))

                }

              >

                ×

              </button>

            </div>

          ))}



          </section>



          <div className="gr-form-actions">

            <button

              className="gr-form-cancel"

              type="button"

              onClick={() => setActiveTab('explore')}

              disabled={formSaving}

            >

              Cancel

            </button>

            <button

              className="gr-primary-btn"

              type="submit"

              disabled={formSaving}

            >

              {formSaving

                ? 'Submitting...'

                : 'Submit for Admin Approval'}

            </button>

          </div>



        </form>

      )}



      {/* My submissions */}

      {activeTab === 'submissions' && (

        <div className="gr-submissions">



          {submissions.length === 0 ? (

            <p className="gr-empty">

              You haven't submitted a recipe yet.

            </p>

          ) : (

            submissions.map(item => (

              <article

                className="gr-submission"

                key={item.id}

              >

                <img

                  src={item.image_url}

                  alt={item.recipe_name}

                />



                <div>

                  <strong>{item.recipe_name}</strong>



                  <small>Serves {item.servings || 1} members</small>



                  <small>

                    Submitted{' '}

                    {item.created_at

                      ? new Date(

                          item.created_at

                        ).toLocaleDateString()

                      : ''}

                  </small>



                  {item.status === 'pending' ? (

                    <span className="gr-status pending">

                      Pending review

                    </span>

                  ) : item.status === 'approved' ? (

                    <span className="gr-status approved">

                      Approved

                    </span>

                  ) : (

                    <span className="gr-status rejected">

                      Rejected

                    </span>

                  )}



                  {item.rejection_reason && (

                    <p>

                      Reason: {item.rejection_reason}

                    </p>

                  )}

                </div>

              </article>

            ))

          )}



        </div>

      )}



      {/* Admin review - rendered only for admins */}

      {activeTab === 'admin' && isAdmin && (

        <div className="gr-admin-list">



          {pendingRecipes.length === 0 ? (

            <p className="gr-empty">

              No recipes are waiting for review.

            </p>

          ) : (

            pendingRecipes.map(item => (

              <article

                className="gr-admin-card"

                key={item.id}

              >

                <img

                  src={item.image_url}

                  alt={item.recipe_name}

                />



                <div className="gr-admin-content">



                  <h3>{item.recipe_name}</h3>



                  <p>{item.description}</p>



                  <small>

                    By {item.submitted_by_name || 'Home Needs user'}

                    {' · '}

                    {item.category}

                    {' · '}

                    {item.preparation_time} min

                    {' · '}

                    Serves {item.servings || 1}

                  </small>



                  <h4>Ingredients</h4>



                  <ul>

                    {(item.ingredients || []).map(

                      (ingredient, index) => (

                        <li key={index}>

                          {ingredient.ingredient_name}

                          {' — '}

                          {ingredient.quantity}

                          {' '}

                          {ingredient.unit}

                        </li>

                      )

                    )}

                  </ul>



                  <h4>Instructions</h4>



                  <ol>

                    {(item.steps || []).map(

                      (step, index) => (

                        <li key={index}>{step}</li>

                      )

                    )}

                  </ol>



                  <div className="gr-admin-actions">



                    <button

                      type="button"

                      onClick={() =>

                        reviewRecipe(item.id, 'approved')

                      }

                    >

                      Approve

                    </button>



                    <button

                      type="button"

                      onClick={() =>

                        reviewRecipe(item.id, 'rejected')

                      }

                    >

                      Reject

                    </button>



                  </div>

                </div>

              </article>

            ))

          )}



        </div>

      )}



      {/* Recipe details modal */}

      {selectedRecipe && (

        <div

          className="gr-modal-overlay"

          onClick={() => setSelectedRecipe(null)}

        >

          <section

            className="gr-detail-modal"

            role="dialog"

            aria-modal="true"

            aria-label="Community recipe details"

            onClick={e => e.stopPropagation()}

          >



            <div className="gr-detail-topbar">

              <button

                type="button"

                className="gr-detail-back"

                onClick={() => setSelectedRecipe(null)}

              >

                ← <span>Back to Recipes</span>

              </button>

              <span className="gr-detail-top-title">Recipe Details</span>

              <button

                type="button"

                className="gr-modal-close"

                onClick={() => setSelectedRecipe(null)}

                aria-label="Close recipe details"

              >

                ×

              </button>

            </div>



            <div className="gr-detail-content">

              <img

                className="gr-detail-image"

                src={selectedRecipe.image_url}

                alt={selectedRecipe.recipe_name}

              />



              <div className="gr-detail-meta">

                <span>{selectedRecipe.category}</span>

                <span>{selectedRecipe.preparation_time} min</span>

                <span>{selectedRecipe.difficulty}</span>

                <span>👥 Serves {selectedRecipe.servings || 1}</span>

              </div>



              <div className="gr-detail-title-row">

                <h2>{selectedRecipe.recipe_name}</h2>

                <span className="gr-detail-veg">🌿 {selectedRecipe.category}</span>

              </div>



              <div className="gr-detail-info">

                <span>◷ {selectedRecipe.preparation_time} min</span>

                <span>♨ {selectedRecipe.difficulty || 'Easy'}</span>

                <span>🍽 {selectedRecipe.meal_type || 'Uncategorized'}</span>

                 <span>♨ {selectedRecipe.cooking_type || 'Quick Meals'}</span>

                <span>👥 Serves {selectedRecipe.servings || 1} members</span>

              </div>



              <p className="gr-detail-description">{selectedRecipe.description}</p>



              <p className="gr-rating">

                ★ {Number(

                  selectedRecipe.average_rating || 0

                ).toFixed(1)}

                {' '}

                ({selectedRecipe.rating_count || 0} ratings)

              </p>



              <div className="gr-detail-section-heading">

                <h3>🧺 Ingredients</h3>

                <span>For {selectedMembers} member(s)</span>

              </div>



              <ul className="gr-detail-ingredients">

                {(selectedRecipe.ingredients || []).map((item, index) => {

                  const scaledItem = getScaledCommunityIngredient(item)

                  const available = inventoryLoaded

                    ? isRecipeIngredientSufficient(scaledItem)

                    : null

                  const statusColor = available === null

                    ? '#64748b'

                    : available

                      ? '#16834a'

                      : '#dc2626'

                  const statusBackground = available === null

                    ? '#f1f5f9'

                    : available

                      ? '#eaf7ee'

                      : '#fff0f0'

                  const statusBorder = available === null

                    ? '#cbd5e1'

                    : available

                      ? '#b9e4c6'

                      : '#fecaca'



                  return (

                    <li

                      key={item.id || index}

                      className="gr-ingredient-item"

                      style={{

                        backgroundColor: statusBackground,

                        borderColor: statusBorder,

                        color: statusColor

                      }}

                    >

                      <span className="gr-ingredient-name">

                        <span

                          className="gr-ingredient-dot"

                          style={{

                            backgroundColor: available === null ? '#e2e8f0' : available ? '#d1fae0' : '#fee2e2',

                            color: statusColor

                          }}

                          aria-hidden="true"

                        >

                          {available === null ? '…' : available ? '✓' : '✕'}

                        </span>

                        {item.ingredient_name}

                        <small style={{ color: statusColor, marginLeft: 7, fontWeight: 700 }}>

                          {available === null ? 'Checking' : available ? 'Available' : 'Missing'}

                        </small>

                      </span>

                      <strong className="gr-ingredient-amount" style={{ color: statusColor }}>

                        {formatIngredientQuantity(scaledItem.quantity)} {item.unit}

                      </strong>

                    </li>

                  )

                })}

              </ul>



              <div className="gr-detail-section-heading gr-steps-heading">

                <h3>👩‍🍳 Preparation Steps</h3>

              </div>



              <ol className="gr-detail-steps">

                {(selectedRecipe.steps || []).map(

                  (step, index) => (

                    <li key={index}>{step}</li>

                  )

                )}

              </ol>



              <div className="gr-detail-actions" aria-label="Recipe actions">



                <button

                  type="button"

                  onClick={() => toggleSave(selectedRecipe)}

                >

                  {selectedRecipe.is_saved

                    ? '♥ Saved'

                    : '♡ Save Recipe'}

                </button>



                <button

                  type="button"

                  onClick={() => setPendingConfirmation('add')}

                >

                  ＋ Add to My Meals

                </button>



                <button

                  type="button"

                  onClick={() => handleCookDirect(selectedRecipe)}
                  disabled={actionProcessing}

                >

                  🍳 Cook Meal

                </button>



              </div>



              {/* Rating form */}

              <form

                className="gr-rating-form"

                onSubmit={saveRating}

              >

                <h3>Rate this recipe</h3>



                <label>

                  Rating



                  <select

                    value={rating}

                    onChange={e =>

                      setRating(e.target.value)

                    }

                  >

                    <option value="5">5 - Excellent</option>

                    <option value="4">4 - Very good</option>

                    <option value="3">3 - Good</option>

                    <option value="2">2 - Fair</option>

                    <option value="1">1 - Poor</option>

                  </select>

                </label>



                <label>

                  Review (optional)



                  <textarea

                    rows="3"

                    maxLength="2000"

                    value={reviewText}

                    onChange={e =>

                      setReviewText(e.target.value)

                    }

                    placeholder="Share your experience..."

                  />

                </label>



                <button type="submit">

                  Submit Rating

                </button>

              </form>



              {/* Community reviews */}

              <div className="gr-reviews">

                <h3>Community reviews</h3>



                {reviews.length === 0 ? (

                  <p>No written reviews yet.</p>

                ) : (

                  reviews.map((review, index) => (

                    <article key={index}>

                      <strong>

                        {review.reviewer_name ||

                          'Home Needs user'}

                      </strong>



                      <span>

                        {'★'.repeat(

                          Number(review.rating || 0)

                        )}

                      </span>



                      <p>{review.review_text}</p>

                    </article>

                  ))

                )}

              </div>



            </div>

          </section>

        </div>

      )}



      {/* Confirmation popup for Add to My Meals and Cook Meal */}

      {pendingConfirmation === 'add' && selectedRecipe && (

        <div

          className="gr-confirm-overlay"

          onClick={() => !actionProcessing && setPendingConfirmation(null)}

        >

          <section

            className="gr-confirm-modal"

            role="dialog"

            aria-modal="true"

            aria-labelledby="gr-confirm-title"

            onClick={event => event.stopPropagation()}

          >

            <div className="gr-confirm-icon" aria-hidden="true">

              {pendingConfirmation === 'add' ? '＋' : '🍳'}

            </div>

            <h3 id="gr-confirm-title">

              {pendingConfirmation === 'add' ? 'Add to My Meals?' : 'Cook this meal?'}

            </h3>

            <p>

              {pendingConfirmation === 'add'

                ? `Do you want to add “${selectedRecipe.recipe_name}” to your personal meals?`

                : `Are you sure you want to cook “${selectedRecipe.recipe_name}”? The required ingredients will be deducted from your household inventory.`}

            </p>

            {pendingConfirmation === 'cook' && (

              <div style={{ margin: '14px 0', textAlign: 'left' }}>

                <label htmlFor="gr-cook-servings" style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>

                  How many members are you cooking for?

                </label>

                <input

                  id="gr-cook-servings"

                  type="number"

                  min="1"

                  max="100"

                  step="1"

                  value={selectedMembers}

                  onChange={event => setSelectedMembers(event.target.value)}

                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px', border: '1px solid #cbd5e1', borderRadius: 8 }}

                />

                <small style={{ display: 'block', marginTop: 6, color: '#64748b' }}>

                  Original recipe serves {Number(selectedRecipe.servings) || 1}. Ingredient quantities will scale automatically.

                </small>

              </div>

            )}

            <div className="gr-confirm-actions">

              <button

                type="button"

                className="gr-confirm-cancel"

                disabled={actionProcessing}

                onClick={() => setPendingConfirmation(null)}

              >

                Cancel

              </button>

              <button

                type="button"

                className="gr-confirm-accept"

                disabled={actionProcessing}

                onClick={confirmRecipeAction}

              >

                {actionProcessing ? 'Please wait...' : 'Confirm'}

              </button>

            </div>

          </section>

        </div>

      )}



      {/* Shared Meal Image Gallery */}

      {showGallery && MealImageGallery && (

        <div className="gr-gallery-overlay">

          <div className="gr-gallery-content">



            <MealImageGallery

              selectionMode

              onSelectImage={selectGalleryImage}

              onClose={() => setShowGallery(false)}

            />



          </div>

        </div>

      )}



    </section>

  )

}
