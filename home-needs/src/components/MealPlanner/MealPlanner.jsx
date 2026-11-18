import { useCallback, useEffect, useMemo, useState } from 'react'
import API_URL from '../../api'
import AddProduct from '../AddProduct'
import './MealPlanner.css'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function localDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function mondayOf(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
  return result
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

function displayDate(dateString, options = { day: 'numeric', month: 'short' }) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, options)
}

function recipeName(recipe) {
  return recipe?.meal_name || recipe?.recipe_name || recipe?.name || 'Untitled recipe'
}

function normalizeRecipe(recipe, source, savedImage = '') {
  const candidateImage =
    recipe?.image_url ||
    recipe?.imageUrl ||
    (typeof recipe?.image === 'string' && /^(https?:|\/)/i.test(recipe.image)
      ? recipe.image
      : '') ||
    savedImage ||
    ''

  return {
    ...recipe,
    image_url: candidateImage,
    recipe_source: source,
    recipe_id: Number(recipe.id)
  }
}

function getRecipeImage(item, myMeals, communityMeals) {
  const source = item?.recipe_source === 'global' ? communityMeals : myMeals
  const recipe = source.find(
    meal => String(meal.id) === String(item?.recipe_id)
  )

  const candidates = [
    item?.image_url,
    item?.imageUrl,
    item?.recipe_image_url,
    item?.recipe_image,
    recipe?.image_url,
    recipe?.imageUrl,
    typeof recipe?.image === 'string' && /^(https?:|\/)/i.test(recipe.image)
      ? recipe.image
      : ''
  ]

  return candidates.find(value => typeof value === 'string' && value.trim()) || ''
}

export default function MealPlanner() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => localDateString(new Date()))
  const [view, setView] = useState('week')
  const [selectedMealType, setSelectedMealType] = useState(null)

  const [plans, setPlans] = useState([])
  const [myMeals, setMyMeals] = useState([])
  const [communityMeals, setCommunityMeals] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [showPicker, setShowPicker] = useState(false)
  const [pickerStep, setPickerStep] = useState('source')
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerDate, setPickerDate] = useState(selectedDate)
  const [pickerType, setPickerType] = useState('Breakfast')
  const [pickerSource, setPickerSource] = useState('own')
  const [pickerRecipe, setPickerRecipe] = useState('')
  const [pickerServings, setPickerServings] = useState(1)

  const [availability, setAvailability] = useState({})
  const [checkingId, setCheckingId] = useState(null)
  const [createProductContext, setCreateProductContext] = useState(null)
  const [shoppingModal, setShoppingModal] = useState(null)
  const [shoppingDraft, setShoppingDraft] = useState([])
  const [shoppingSaving, setShoppingSaving] = useState(false)

  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return localDateString(d)
      }),
    [weekStart]
  )

  const loadRecipes = useCallback(async () => {
    const [ownResponse, communityResponse, imageResponse] = await Promise.all([
      fetch(`${API_URL}/meals`, { credentials: 'include' }),
      fetch(`${API_URL}/global-recipes`, { credentials: 'include' }),
      fetch(`${API_URL}/meal-images`, { credentials: 'include' }).catch(() => null)
    ])

    const ownData = await ownResponse.json().catch(() => [])
    const communityData = await communityResponse.json().catch(() => [])
    const imageData = imageResponse
      ? await imageResponse.json().catch(() => [])
      : []

    // MealRecommendation stores each user's selected meal image through /meal-images.
    // Use that same mapping here so personal recipes show their saved gallery image.
    const imageRows = Array.isArray(imageData)
      ? imageData
      : imageData.images || imageData.meal_images || []
    const savedImages = {}
    imageRows.forEach(row => {
      const mealId = row.meal_id ?? row.mealId ?? row.id
      const imageUrl = row.image_url || row.imageUrl || row.url
      if (mealId != null && imageUrl) savedImages[String(mealId)] = imageUrl
    })

    if (!ownResponse.ok) {
      throw new Error(ownData.error || 'Unable to load My Meals')
    }

    if (!communityResponse.ok) {
      throw new Error(communityData.error || 'Unable to load Community Recipes')
    }

    setMyMeals(
      (Array.isArray(ownData) ? ownData : ownData.meals || [])
        .map(r => normalizeRecipe(r, 'own', savedImages[String(r.id)] || ''))
    )

    setCommunityMeals(
      (Array.isArray(communityData)
        ? communityData
        : communityData.recipes || []
      ).map(r => normalizeRecipe(r, 'global'))
    )
  }, [])

  const loadPlans = useCallback(async () => {
    const start = localDateString(weekStart)
    const end = shiftDate(start, 6)

    const response = await fetch(
      `${API_URL}/meal-planner?start_date=${start}&end_date=${end}`,
      { credentials: 'include' }
    )

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Unable to load Meal Planner')
    }

    setPlans(Array.isArray(data) ? data : data.items || data.plans || [])
  }, [weekStart])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      await Promise.all([loadPlans(), loadRecipes()])
    } catch (e) {
      setError(e.message || 'Unable to load Meal Planner')
    } finally {
      setLoading(false)
    }
  }, [loadPlans, loadRecipes])

  useEffect(() => {
    refresh()
  }, [refresh])

  const recipesForPicker =
    pickerSource === 'own' ? myMeals : communityMeals

  const selectedRecipeObject = recipesForPicker.find(
    r => String(r.id) === String(pickerRecipe)
  )

  function getItemsForDate(date, type) {
    return plans.filter(
      item => item.plan_date === date && item.meal_type === type
    )
  }

  function openRecipePicker(date, type = 'Breakfast') {
    setPickerDate(date)
    setPickerType(type)
    setPickerSource('own')
    setPickerRecipe('')
    setPickerServings(1)
    setPickerSearch('')
    setPickerStep('source')
    setError('')
    setShowPicker(true)
  }

  async function addToPlan(event) {
    event.preventDefault()

    if (!pickerRecipe) {
      setError('Please select a recipe.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(`${API_URL}/meal-planner`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_date: pickerDate,
          recipe_source: pickerSource,
          recipe_id: Number(pickerRecipe),
          meal_type: pickerType,
          servings: Number(pickerServings)
        })
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Could not add recipe')
      }

      setShowPicker(false)
      setPickerStep('source')
      setPickerRecipe('')
      setNotice('Recipe added to your plan.')
      await loadPlans()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateItem(item, patch) {
    setError('')
    setNotice('')

    try {
      const response = await fetch(
        `${API_URL}/meal-planner/items/${item.id}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Could not update plan')
      }

      setNotice('Plan updated.')
      await loadPlans()
    } catch (e) {
      setError(e.message)
    }
  }

  async function deleteItem(item) {
    if (!window.confirm('Remove this recipe from your meal plan?')) return

    try {
      const response = await fetch(
        `${API_URL}/meal-planner/items/${item.id}`,
        { method: 'DELETE', credentials: 'include' }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Could not remove recipe')
      }

      setPlans(prev => prev.filter(x => x.id !== item.id))
      setNotice('Recipe removed from your plan.')
    } catch (e) {
      setError(e.message)
    }
  }

  async function checkAvailability(item) {
    setCheckingId(item.id)
    setError('')

    try {
      const response = await fetch(
        `${API_URL}/meal-planner/items/${item.id}/availability`,
        { credentials: 'include' }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Could not check ingredients')
      }

      setAvailability(prev => ({
        ...prev,
        [item.id]: data
      }))
    } catch (e) {
      setError(e.message)
    } finally {
      setCheckingId(null)
    }
  }

  // Open the existing Add Product component with the ingredient name.
  function openCreateProduct(item, ingredient) {
    const name = String(ingredient?.ingredient_name || '').trim()

    if (!name) {
      setError('Ingredient name is missing, so a product cannot be created.')
      return
    }

    setError('')
    setNotice('')

    setCreateProductContext({
      item,
      ingredient,
      productName: name
    })
  }

  // After product creation, check the recipe inventory again.
  async function handleProductCreated() {
    const context = createProductContext
    setCreateProductContext(null)

    if (!context?.item) return

    setNotice(
      `Product "${context.productName}" created. Refreshing ingredient availability…`
    )

    try {
      const response = await fetch(
        `${API_URL}/meal-planner/items/${context.item.id}/availability`,
        { credentials: 'include' }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.error ||
          data.message ||
          'Product was created, but ingredient availability could not be refreshed.'
        )
      }

      setAvailability(prev => ({
        ...prev,
        [context.item.id]: data
      }))

      setNotice(
        `"${context.productName}" was created. Ingredient availability has been refreshed. Add any remaining missing quantity to your Shopping List.`
      )
    } catch (e) {
      setError(e.message)
    }
  }

  function openShoppingConfirmation(item, ingredients) {
    const rows = ingredients
      .filter(ingredient => ingredient.product_id && Number(ingredient.missing_quantity) > 0)
      .map((ingredient, index) => ({
        key: `${ingredient.product_id}-${index}`,
        product_id: Number(ingredient.product_id),
        name: ingredient.ingredient_name || ingredient.product_name || 'Ingredient',
        quantity: String(ingredient.missing_quantity),
        unit: ingredient.missing_unit || ingredient.unit || ''
      }))
    if (!rows.length) {
      setError('There are no clearly matched missing ingredients to add. Resolve unmatched or multiple product matches first.')
      return
    }
    setError('')
    setNotice('')
    setShoppingModal({ item })
    setShoppingDraft(rows)
  }

  async function confirmShoppingList() {
    if (!shoppingModal || !shoppingDraft.length) return
    if (shoppingDraft.some(row => !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0)) {
      setError('Enter a quantity greater than zero for every selected ingredient.')
      return
    }
    setShoppingSaving(true)
    setError('')
    let added = 0
    try {
      for (const row of shoppingDraft) {
        const response = await fetch(`${API_URL}/meal-planner/items/${shoppingModal.item.id}/shopping-list`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: row.product_id, missing_quantity: Number(row.quantity) })
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || data.message || `Could not add ${row.name}`)
        added += 1
      }
      setShoppingModal(null)
      setShoppingDraft([])
      setNotice(`${added} ingredient(s) added to your Shopping List.`)
      window.dispatchEvent(new Event('shoppingListUpdated'))
    } catch (e) {
      setError(`${e.message} ${added ? `${added} ingredient(s) were already added.` : ''}`)
    } finally {
      setShoppingSaving(false)
    }
  }

  async function cookItem(item) {
    if (item.recipe_source !== 'own') {
      setError(
        'Community recipes must first be saved/imported into My Meals before cooking. Open Meals → Community Recipes and save this recipe, then add the saved meal to your plan.'
      )
      return
    }

    const mealId = item.recipe_id

    if (
      !window.confirm(
        `Cook ${item.recipe_name || item.meal_name || 'this recipe'} for ${item.servings} serving(s)? This will deduct ingredients from your inventory.`
      )
    ) {
      return
    }

    try {
      const response = await fetch(
        `${API_URL}/meals/${mealId}/cook`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servings: Number(item.servings) })
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Cooking failed')
      }

      await updateItem(item, { status: 'Cooked' })

      setNotice(data.message || 'Meal cooked and inventory updated.')
      window.dispatchEvent(new Event('productsUpdated'))
    } catch (e) {
      setError(e.message)
    }
  }

  function changeWeek(offset) {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + offset * 7)
    setWeekStart(next)
    setSelectedDate(localDateString(next))
  }

  const visibleDates = view === 'day' ? [selectedDate] : weekDates
  const plannedCount = plans.filter(item => (item.status || 'Planned') === 'Planned').length
  const cookedCount = plans.filter(item => item.status === 'Cooked').length
  const dayCount = new Set(plans.map(item => item.plan_date)).size

  return (
    <div className="meal-planner">
      <header className="mp-header">
        <div>
          <span className="mp-eyebrow">HOME NEEDS · SMART PLANNING</span>
          <h1>Plan your family meals <span aria-hidden="true">🍽️</span></h1>
          <p>
            Your weekly meals, organised in one simple place.
          </p>
        </div>

        
      </header>

      <section className="mp-summary" aria-label="Weekly meal summary">
        <div className="mp-summary-card"><span className="mp-summary-icon">🍲</span><div><strong>{plans.length}</strong><span>Meals planned</span></div></div>
        <div className="mp-summary-card"><span className="mp-summary-icon">🗓️</span><div><strong>{dayCount}</strong><span>Days organised</span></div></div>
        <div className="mp-summary-card"><span className="mp-summary-icon">⏳</span><div><strong>{plannedCount}</strong><span>Still to cook</span></div></div>
        <div className="mp-summary-card"><span className="mp-summary-icon">✓</span><div><strong>{cookedCount}</strong><span>Meals completed</span></div></div>
      </section>

      <div className="mp-toolbar">
        <div className="mp-date-controls">
          <button
            className="mp-icon-btn"
            onClick={() => changeWeek(-1)}
            aria-label="Previous week"
          >
            ‹
          </button>

          <strong>
            {displayDate(localDateString(weekStart), {
              month: 'short',
              day: 'numeric'
            })}
            {' – '}
            {displayDate(shiftDate(localDateString(weekStart), 6), {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </strong>

          <button
            className="mp-icon-btn"
            onClick={() => changeWeek(1)}
            aria-label="Next week"
          >
            ›
          </button>

          <button
            className="mp-today"
            onClick={() => {
              const now = new Date()
              setWeekStart(mondayOf(now))
              setSelectedDate(localDateString(now))
              setSelectedMealType(null)
            }}
          >
            Today
          </button>
        </div>

        <div className="mp-view-toggle">
          <button
            className={view === 'week' ? 'active' : ''}
            onClick={() => { setView('week'); setSelectedMealType(null) }}
          >
            Week
          </button>

          <button
            className={view === 'day' ? 'active' : ''}
            onClick={() => { setView('day'); setSelectedMealType(null) }}
          >
            Day
          </button>
        </div>
      </div>

      <div className="mp-date-strip">
        {weekDates.map((date, i) => (
          <button
            key={date}
            className={`mp-date-chip ${selectedDate === date ? 'selected' : ''} ${date === localDateString(new Date()) ? 'is-today' : ''}`}
            onClick={() => {
              setSelectedDate(date)
              setSelectedMealType(null)
              setView('day')
            }}
          >
            <span>{WEEKDAYS[i]}</span>
            <strong>{displayDate(date, { day: 'numeric' })}</strong>
            <small>{plans.filter(item => item.plan_date === date).length ? `${plans.filter(item => item.plan_date === date).length} meal(s)` : 'No meals'}</small>
          </button>
        ))}
      </div>

      {error && <div className="mp-alert error">{error}</div>}
      {notice && <div className="mp-alert success">{notice}</div>}

      {loading ? (
        <div className="mp-loading">Loading your meal plan…</div>
      ) : (
        <div className={`mp-board ${view === 'day' ? 'day-view' : ''}`}>
          {visibleDates.map(date => (
            <section className="mp-day" key={date}>
              <div className="mp-day-heading">
                <div>
                  <h2>
                    {displayDate(date, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short'
                    })}
                  </h2>
                  <span>
                    {date === localDateString(new Date())
                      ? 'Today'
                      : 'Your planned meals'}
                  </span>
                </div>

                {(view !== 'day' || selectedMealType) && (
                  <button
                    onClick={() => openRecipePicker(date, selectedMealType || 'Breakfast')}
                  >
                    ＋ Add {view === 'day' ? selectedMealType : 'Recipe'}
                  </button>
                )}
              </div>

              {view === 'day' && !selectedMealType ? (
                <div className="mp-meal-choice-grid">
                  {MEAL_TYPES.map(type => {
                    const count = getItemsForDate(date, type).length
                    const details = {
                      Breakfast: { icon: '🌅', subtitle: 'Start the day right', tone: 'breakfast' },
                      Lunch: { icon: '🍛', subtitle: 'Midday family meals', tone: 'lunch' },
                      Dinner: { icon: '🌙', subtitle: 'Evening meals together', tone: 'dinner' },
                      Snacks: { icon: '🍿', subtitle: 'Little bites & treats', tone: 'snacks' }
                    }[type]
                    return (
                      <button type="button" className={`mp-meal-choice ${details.tone}`} key={type} onClick={() => setSelectedMealType(type)}>
                        <span className="mp-meal-choice-icon">{details.icon}</span>
                        <span className="mp-meal-choice-copy"><strong>{type}</strong><small>{details.subtitle}</small></span>
                        <span className="mp-meal-choice-count">{count} {count === 1 ? 'recipe' : 'recipes'}</span>
                        <span className="mp-meal-choice-arrow">›</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <>
                  {view === 'day' && selectedMealType && (
                    <div className="mp-selected-meal-heading">
                      <button type="button" className="mp-back-meal-types" onClick={() => setSelectedMealType(null)}>← All meal types</button>
                      <div><span>{selectedMealType === 'Breakfast' ? '🌅' : selectedMealType === 'Lunch' ? '🍛' : selectedMealType === 'Dinner' ? '🌙' : '🍿'}</span><strong>{selectedMealType}</strong></div>
                      <button type="button" className="mp-add-selected-meal" onClick={() => openRecipePicker(date, selectedMealType)}>＋ Add recipe</button>
                    </div>
                  )}
                  <div className="mp-meal-grid">
                {MEAL_TYPES.filter(type => view !== 'day' || type === selectedMealType).map(type => {
                  const items = getItemsForDate(date, type)

                  return (
                    <div className="mp-meal-slot" key={type}>
                      <div className="mp-slot-title">
                        <h3>{type}</h3>
                        <span>{items.length}</span>
                      </div>

                      {items.length === 0 ? (
                        <button
                          className="mp-empty-slot"
                          onClick={() => openRecipePicker(date, type)}
                        >
                          ＋ Add a recipe
                        </button>
                      ) : (
                        items.map(item => (
                          <article className="mp-recipe-card" key={item.id}>
                            <div className="mp-recipe-image-wrap">
                              {getRecipeImage(item, myMeals, communityMeals) ? (
                                <img
                                  className="mp-recipe-image"
                                  src={getRecipeImage(item, myMeals, communityMeals)}
                                  alt={item.recipe_name || item.meal_name || 'Planned recipe'}
                                  loading="lazy"
                                  onError={event => {
                                    event.currentTarget.style.display = 'none'
                                    const fallback = event.currentTarget.nextElementSibling
                                    if (fallback) fallback.style.display = 'grid'
                                  }}
                                />
                              ) : null}
                              <span
                                className="mp-recipe-image-fallback"
                                style={{ display: getRecipeImage(item, myMeals, communityMeals) ? 'none' : 'grid' }}
                                aria-hidden="true"
                              >
                                🍽️
                              </span>
                            </div>
                            <div className="mp-recipe-top">
                              <div>
                                <strong>
                                  {item.recipe_name ||
                                    item.meal_name ||
                                    item.name ||
                                    `Recipe #${item.recipe_id}`}
                                </strong>

                                <small>
                                  {item.recipe_source === 'global'
                                    ? 'Community Recipe'
                                    : 'My Meal'}
                                  {' · '}
                                  {item.servings} serving(s)
                                </small>
                              </div>

                              <button
                                className="mp-more"
                                title="Remove"
                                onClick={() => deleteItem(item)}
                              >
                                ×
                              </button>
                            </div>

                            <div className="mp-card-controls">
                              <label>
                                Servings
                                <select
                                  value={item.servings}
                                  onChange={e =>
                                    updateItem(item, {
                                      servings: Number(e.target.value)
                                    })
                                  }
                                >
                                  {Array.from(
                                    { length: 20 },
                                    (_, i) => i + 1
                                  ).map(n => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <select
                                className={`mp-status status-${String(
                                  item.status || 'Planned'
                                ).toLowerCase()}`}
                                value={item.status || 'Planned'}
                                onChange={e =>
                                  updateItem(item, { status: e.target.value })
                                }
                                aria-label="Meal status"
                              >
                                <option>Planned</option>
                                <option>Cooked</option>
                                <option>Skipped</option>
                              </select>
                            </div>

                            <div className="mp-card-actions">
                              <button
                                onClick={() => checkAvailability(item)}
                                disabled={checkingId === item.id}
                              >
                                {checkingId === item.id
                                  ? 'Checking…'
                                  : 'Check ingredients'}
                              </button>

                              
                            </div>

                            {availability[item.id] && (
                              <div className="mp-availability">
                                <strong>Ingredient check</strong>

                                <p>
                                  {availability[item.id].all_available
                                    ? 'All ingredients are available.'
                                    : `${availability[item.id].missing_ingredient_count ?? 0} ingredient(s) need attention.`}
                                </p>

                                {(availability[item.id].ingredients || []).map(
                                  (ing, index) => (
                                    <div
                                      className="mp-ingredient-result"
                                      key={index}
                                    >
                                      <div className="mp-ingredient-line">
                                        <span>{ing.ingredient_name}</span>
                                        <span>
                                          {ing.status === 'available'
                                            ? 'Available'
                                            : ing.status === 'insufficient_stock'
                                              ? `Missing ${ing.missing_quantity} ${ing.missing_unit || ing.unit || ''}`
                                              : ing.status === 'product_not_found'
                                                ? 'Product not in inventory'
                                                : ing.status === 'multiple_matches'
                                                  ? 'Multiple product matches'
                                                  : ing.status === 'unit_mismatch'
                                                    ? 'Unit mismatch'
                                                    : ing.status}
                                        </span>
                                      </div>

                                      {ing.status === 'insufficient_stock' &&
                                        ing.product_id && (
                                          <button
                                            className="mp-add-missing"
                                            onClick={() =>
                                              openShoppingConfirmation(item, [ing])
                                            }
                                          >
                                            ＋ Add missing quantity to Shopping List
                                          </button>
                                        )}

                                      {ing.status === 'product_not_found' && (
                                        <div className="mp-unmatched-actions">
                                          <small className="mp-help-text">
                                            This ingredient is not in your inventory yet.
                                          </small>

                                          <button
                                            type="button"
                                            className="mp-create-product"
                                            onClick={() =>
                                              openCreateProduct(item, ing)
                                            }
                                          >
                                            ＋ Create “{ing.ingredient_name}” Product
                                          </button>
                                        </div>
                                      )}

                                      {ing.status === 'multiple_matches' && (
                                        <small className="mp-help-text">
                                          More than one inventory product matches this ingredient. Resolve the duplicate/matching products before adding it.
                                        </small>
                                      )}

                                      {ing.status === 'unit_mismatch' && (
                                        <small className="mp-help-text">
                                          The recipe and inventory units cannot currently be converted. Add a unit conversion or correct the product unit first.
                                        </small>
                                      )}
                                    </div>
                                  )
                                )}

                                {(availability[item.id].ingredients || []).some(
                                  ing =>
                                    ing.status === 'insufficient_stock' &&
                                    ing.product_id &&
                                    Number(ing.missing_quantity) > 0
                                ) && (
                                  <button
                                    className="mp-add-all"
                                    onClick={() => openShoppingConfirmation(item, availability[item.id].ingredients.filter(ing => ing.status === 'insufficient_stock'))}
                                  >
                                    Add all matched missing items
                                  </button>
                                )}
                              </div>
                            )}
                          </article>
                        ))
                      )}
                    </div>
                  )
                })}
                  </div>
                </>
              )}
            </section>
          ))}
        </div>
      )}

      {showPicker && (
        <section className="mp-picker-page" aria-label="Choose a recipe">
          <div className="mp-picker-topbar">
            <button
              type="button"
              className="mp-picker-back"
              onClick={() => {
                if (pickerStep === 'source') setShowPicker(false)
                else if (pickerStep === 'recipes') setPickerStep('source')
                else setPickerStep('recipes')
              }}
            >
              ← <span>{pickerStep === 'source' ? 'Back to planner' : 'Back'}</span>
            </button>
            <div className="mp-picker-context">
              <span>{displayDate(pickerDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <strong>{pickerType}</strong>
            </div>
            <button type="button" className="mp-picker-close" onClick={() => setShowPicker(false)} aria-label="Close recipe selection">×</button>
          </div>

          <div className="mp-picker-content">
            {pickerStep === 'source' && (
              <>
                <div className="mp-picker-intro">
                  <span className="mp-eyebrow">BUILD YOUR MENU</span>
                  <h2>Where would you like to choose a recipe from?</h2>
                  <p>Select your recipe collection. You can browse and choose a dish on the next screen.</p>
                </div>
                <div className="mp-source-grid">
                  <button type="button" className="mp-source-card mp-source-own" onClick={() => { setPickerSource('own'); setPickerSearch(''); setPickerStep('recipes') }}>
                    <span className="mp-source-art">🥘</span>
                    <span className="mp-source-copy"><strong>My Meals</strong><small>Your saved family recipes</small><em>Browse my meals →</em></span>
                  </button>
                  <button type="button" className="mp-source-card mp-source-community" onClick={() => { setPickerSource('global'); setPickerSearch(''); setPickerStep('recipes') }}>
                    <span className="mp-source-art">🍲</span>
                    <span className="mp-source-copy"><strong>Community Recipes</strong><small>Discover recipes shared by others</small><em>Explore community →</em></span>
                  </button>
                </div>
              </>
            )}

            {pickerStep === 'recipes' && (
              <>
                <div className="mp-picker-intro">
                  <span className="mp-eyebrow">{pickerSource === 'own' ? 'YOUR COLLECTION' : 'DISCOVER SOMETHING NEW'}</span>
                  <h2>{pickerSource === 'own' ? 'Choose from My Meals' : 'Explore Community Recipes'}</h2>
                  <p>Choose a recipe to see its details before adding it to {pickerType}.</p>
                </div>
                <div className="mp-picker-tools">
                  <label className="mp-picker-search">
                    <span aria-hidden="true">⌕</span>
                    <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search recipes..." aria-label="Search recipes" />
                  </label>
                  <span className="mp-picker-count">{recipesForPicker.filter(recipe => recipeName(recipe).toLowerCase().includes(pickerSearch.toLowerCase())).length} recipes</span>
                </div>
                <div className="mp-picker-recipe-grid">
                  {recipesForPicker.filter(recipe => recipeName(recipe).toLowerCase().includes(pickerSearch.toLowerCase())).map(recipe => {
                    const image = recipe.image_url || recipe.imageUrl || (typeof recipe.image === 'string' && /^(https?:|\/)/i.test(recipe.image) ? recipe.image : '')
                    return (
                      <button type="button" className="mp-picker-recipe-card" key={recipe.id} onClick={() => { setPickerRecipe(String(recipe.id)); setPickerStep('detail') }}>
                        <span className="mp-picker-card-image">
                          {image ? <img src={image} alt={recipeName(recipe)} loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'grid' }} /> : null}
                          <span className="mp-picker-image-fallback" style={{ display: image ? 'none' : 'grid' }}>🍽️</span>
                        </span>
                        <span className="mp-picker-card-info"><strong>{recipeName(recipe)}</strong><small>{recipe.preparation_time ? `${recipe.preparation_time} min` : 'Recipe'} · ${recipe.servings || 1} serving(s)</small><em>View recipe →</em></span>
                      </button>
                    )
                  })}
                  {!recipesForPicker.length && <div className="mp-picker-empty"><span>🍽️</span><strong>No recipes found here yet</strong><p>{pickerSource === 'own' ? 'Save a recipe in My Meals first, then it will appear here.' : 'There are no community recipes available right now.'}</p></div>}
                  {!!recipesForPicker.length && !recipesForPicker.some(recipe => recipeName(recipe).toLowerCase().includes(pickerSearch.toLowerCase())) && <div className="mp-picker-empty"><span>🔎</span><strong>No matching recipes</strong><p>Try another search term.</p></div>}
                </div>
              </>
            )}

            {pickerStep === 'detail' && selectedRecipeObject && (
              <form className="mp-picker-detail" onSubmit={addToPlan}>
                <div className="mp-picker-detail-image">
                  {(selectedRecipeObject.image_url || selectedRecipeObject.imageUrl || (typeof selectedRecipeObject.image === 'string' && /^(https?:|\/)/i.test(selectedRecipeObject.image))) ? (
                    <img src={selectedRecipeObject.image_url || selectedRecipeObject.imageUrl || selectedRecipeObject.image} alt={recipeName(selectedRecipeObject)} onError={e => { e.currentTarget.style.display = 'none' }} />
                  ) : <span>🍽️</span>}
                </div>
                <div className="mp-picker-detail-body">
                  <span className="mp-eyebrow">{pickerSource === 'own' ? 'MY MEAL' : 'COMMUNITY RECIPE'}</span>
                  <h2>{recipeName(selectedRecipeObject)}</h2>
                  <p>You're adding this recipe to <strong>{pickerType}</strong> on <strong>{displayDate(pickerDate, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.</p>
                  <div className="mp-detail-facts">
                    <span>⏱ {selectedRecipeObject.preparation_time || '—'} min prep</span>
                    <span>🍽 Base servings: {selectedRecipeObject.servings || 1}</span>
                  </div>
                  <label className="mp-detail-servings">How many people are you cooking for?
                    <div><button type="button" onClick={() => setPickerServings(n => Math.max(1, n - 1))} aria-label="Decrease servings">−</button><strong>{pickerServings}</strong><button type="button" onClick={() => setPickerServings(n => Math.min(100, n + 1))} aria-label="Increase servings">+</button></div>
                  </label>
                  <div className="mp-picker-detail-actions">
                    <button type="button" className="mp-secondary" onClick={() => setPickerStep('recipes')}>Choose another</button>
                    <button type="submit" className="mp-primary" disabled={saving}>{saving ? 'Adding…' : '+ Add to Meal Plan'}</button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      {shoppingModal && (
        <div className="mp-modal-backdrop mp-shopping-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !shoppingSaving) setShoppingModal(null) }}>
          <section className="mp-modal mp-shopping-modal" role="dialog" aria-modal="true" aria-labelledby="mp-shopping-title">
            <div className="mp-modal-heading">
              <div><span className="mp-eyebrow">SHOPPING LIST</span><h2 id="mp-shopping-title">Review missing ingredients</h2><p>Edit quantities before adding them.</p></div>
              <button type="button" onClick={() => setShoppingModal(null)} disabled={shoppingSaving} aria-label="Close">×</button>
            </div>
            <div className="mp-shopping-recipe"><span>For recipe</span><strong>{shoppingModal.item.recipe_name || shoppingModal.item.meal_name || 'Planned meal'}</strong></div>
            <div className="mp-shopping-rows">
              {shoppingDraft.map(row => (
                <div className="mp-shopping-row" key={row.key}>
                  <div className="mp-shopping-name"><strong>{row.name}</strong><small>Missing quantity</small></div>
                  <label className="mp-quantity-field"><span>Quantity</span><div><input type="number" min="0.001" step="any" value={row.quantity} onChange={e => setShoppingDraft(prev => prev.map(x => x.key === row.key ? { ...x, quantity: e.target.value } : x))} /><span>{row.unit}</span></div></label>
                  <button type="button" className="mp-remove-row" disabled={shoppingSaving} onClick={() => setShoppingDraft(prev => prev.filter(x => x.key !== row.key))} aria-label={`Remove ${row.name}`}>×</button>
                </div>
              ))}
              {!shoppingDraft.length && <p className="mp-empty-shopping">No ingredients selected. Close this window and choose an ingredient.</p>}
            </div>
            <div className="mp-shopping-note">Only the quantities shown here will be added. Your inventory will not be changed.</div>
            <div className="mp-modal-actions">
              <button type="button" className="mp-secondary" onClick={() => setShoppingModal(null)} disabled={shoppingSaving}>Cancel</button>
              <button type="button" className="mp-primary" onClick={confirmShoppingList} disabled={shoppingSaving || !shoppingDraft.length}>{shoppingSaving ? 'Adding…' : `Confirm & Add (${shoppingDraft.length})`}</button>
            </div>
          </section>
        </div>
      )}

      {createProductContext && (
        <AddProduct
          initialProductName={createProductContext.productName}
          onClose={() => setCreateProductContext(null)}
          onProductCreated={handleProductCreated}
        />
      )}
    </div>
  )
}