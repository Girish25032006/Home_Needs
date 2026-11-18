import { useEffect, useMemo, useState } from 'react'



import './ConsumptionTracking.css'



import API_URL from '../api'



function ConsumptionTracking() {



  const [products, setProducts] = useState([])



  const [productName, setProductName] = useState('')



  const [quantity, setQuantity] = useState('')



  const [unit, setUnit] = useState('Kg')



  const [usageDate, setUsageDate] = useState('')



  const [consumptions, setConsumptions] = useState([])



  const [loading, setLoading] = useState(false)



  const [showConfirm, setShowConfirm] = useState(false)



  const [selectedYear, setSelectedYear] = useState(



    new Date().getFullYear()



  )



  const [selectedMonth, setSelectedMonth] = useState(null)



  const currentDate = new Date()



  const currentYear = currentDate.getFullYear()



  const currentMonth = currentDate.getMonth()



  const months = [



    'January',



    'February',



    'March',



    'April',



    'May',



    'June',



    'July',



    'August',



    'September',



    'October',



    'November',



    'December'



  ]



  // -----------------------------------



  // GET TODAY'S DATE



  // -----------------------------------



  const getToday = () => {



    const today = new Date()



    const year = today.getFullYear()



    const month = String(



      today.getMonth() + 1



    ).padStart(2, '0')



    const day = String(



      today.getDate()



    ).padStart(2, '0')



    return `${year}-${month}-${day}`



  }



  // -----------------------------------



  // FETCH PRODUCTS



  // -----------------------------------



  const fetchProducts = async () => {



    try {



      const response = await fetch(



        `${API_URL}/`,



        {



          credentials: 'include'



        }



      )



      const data = await response.json()



      if (response.ok) {



        setProducts(



          Array.isArray(data)



            ? data



            : []



        )



        // Keep the product field empty until the user searches and selects

        // a product. Suggestions come only from Product Management.

        if (!Array.isArray(data) || data.length === 0) {

          setProductName('')

          setUnit('Kg')

        } else {

          setProductName((previous) => {

            const stillExists = data.find((product) =>

              String(product.product_name || '').trim().toLowerCase() ===

              String(previous || '').trim().toLowerCase()

            )

            if (!stillExists) {

              setUnit('Kg')

              return ''

            }

            setUnit(stillExists.unit || 'Kg')

            return stillExists.product_name

          })

        }



      }



    } catch (error) {



      console.error(



        'Error fetching products:',



        error



      )



    }



  }



  // -----------------------------------



  // FETCH CONSUMPTION HISTORY



  // -----------------------------------



  const fetchConsumptions = async () => {



    try {



      const response = await fetch(



        `${API_URL}/consumption`,



        {



          credentials: 'include'



        }



      )



      const data = await response.json()



      if (response.ok) {



        setConsumptions(



          Array.isArray(data)



            ? data



            : []



        )



      }



    } catch (error) {



      console.error(



        'Error fetching consumption history:',



        error



      )



    }



  }



  // -----------------------------------



  // INITIAL LOAD



  // -----------------------------------



  useEffect(() => {



    fetchProducts()



    fetchConsumptions()



    setUsageDate(getToday())



  }, [])



  // -----------------------------------



  // PRODUCT CHANGE



  // -----------------------------------



  const handleProductChange = (e) => {



    const selectedName =



      e.target.value



    setProductName(



      selectedName



    )



    const selectedProduct = products.find(

      (product) =>

        String(product.product_name || '').trim().toLowerCase() ===

        String(selectedName || '').trim().toLowerCase()

    )



    if (selectedProduct) {



      setUnit(



        selectedProduct.unit ||



        'Kg'



      )



    }



  }



  // -----------------------------------



  // RECORD CONSUMPTION



  // -----------------------------------



  const handleSave = async (confirmed = false) => {



    if (



      !productName ||



      !quantity ||



      !usageDate



    ) {



      alert(



        'Please fill all consumption details'



      )



      return



    }



    if (usageDate > getToday()) {



      alert('Usage date cannot be in the future.')



      return



    }



    if (



      Number(quantity) <= 0



    ) {



      alert(



        'Enter a valid quantity'



      )



      return



    }



    const selectedProduct =



      products.find(



        (product) =>



          product.product_name ===



          productName



      )



    if (!selectedProduct) {



      alert(



        'Please select a valid product'



      )



      return



    }



    if (



      Number(quantity) >



      Number(selectedProduct.quantity)



    ) {



      alert(



        `Only ${selectedProduct.quantity} ${selectedProduct.unit} available in stock`



      )



      return



    }



    if (!confirmed) {

      setShowConfirm(true)

      return

    }



    setShowConfirm(false)

    setLoading(true)



    const consumption = {



      productName:



        productName,



      quantity:



        Number(quantity),



      unit:



        unit,



      usageDate:



        usageDate



    }



    try {



      const response =



        await fetch(



          `${API_URL}/consumption`,



          {



            method: 'POST',



            headers: {



              'Content-Type':



                'application/json'



            },



            credentials:



              'include',



            body:



              JSON.stringify(



                consumption



              )



          }



        )



      const data =



        await response.json()



      if (response.ok) {



        setShowConfirm(false)



        alert(



          'Consumption recorded successfully!'



        )



        setQuantity('')



        setUsageDate(



          getToday()



        )



        await fetchProducts()



        await fetchConsumptions()



        window.dispatchEvent(



          new CustomEvent(



            'productsUpdated'



          )



        )



        window.dispatchEvent(



          new CustomEvent(



            'consumptionUpdated'



          )



        )



        window.dispatchEvent(



          new CustomEvent(



            'aiPredictionsUpdated'



          )



        )



      } else {



        alert(



          data.message ||



          'Failed to record consumption'



        )



      }



    } catch (error) {



      console.error(



        'Error recording consumption:',



        error



      )



      alert(



        'Unable to connect to backend'



      )



    } finally {



      setLoading(false)



    }



  }



  // -----------------------------------



  // AVAILABLE YEARS



  // -----------------------------------



  const availableYears = useMemo(() => {



    const years =



      new Set()



    years.add(



      currentYear



    )



    consumptions.forEach(



      (consumption) => {



        const parts =



          getDateParts(



            consumption.usage_date



          )



        if (



          parts.year &&



          parts.year <=



            currentYear



        ) {



          years.add(



            parts.year



          )



        }



      }



    )



    return Array.from(



      years



    ).sort(



      (a, b) => b - a



    )



  }, [



    consumptions,



    currentYear



  ])



  // -----------------------------------



  // VISIBLE MONTHS



  // Current year:



  // up to current month only.



  //



  // Previous year:



  // all 12 months.



  // -----------------------------------



  const visibleMonths = useMemo(() => {



    const lastMonth =



      selectedYear ===



      currentYear



        ? currentMonth



        : 11



    return months



      .map(



        (



          monthName,



          monthIndex



        ) => ({



          monthName,



          monthIndex



        })



      )



      .filter(



        (month) =>



          month.monthIndex <=



          lastMonth



      )



  }, [



    selectedYear,



    currentYear,



    currentMonth



  ])



  // -----------------------------------



  // MONTHLY DATA



  // -----------------------------------



  const monthlyData = useMemo(() => {



    return visibleMonths.map(



      ({



        monthName,



        monthIndex



      }) => {



        const monthConsumptions =



          consumptions.filter(



            (consumption) => {



              const parts =



                getDateParts(



                  consumption.usage_date



                )



              return (



                parts.year ===



                  selectedYear &&



                parts.month ===



                  monthIndex



              )



            }



          )



        const totalQuantity =



          monthConsumptions.reduce(



            (total, consumption) =>



              total +



              Number(



                consumption.quantity ||



                0



              ),



            0



          )



        return {



          monthName,



          monthIndex,



          consumptions:



            monthConsumptions,



          consumptionCount:



            monthConsumptions.length,



          totalQuantity



        }



      }



    )



  }, [



    consumptions,



    selectedYear,



    visibleMonths



  ])



  const selectedMonthData =



    selectedMonth === null



      ? null



      : monthlyData.find(



          (month) =>



            month.monthIndex ===



            selectedMonth



        )



  // -----------------------------------



  // FORMAT DATE



  // -----------------------------------



  const formatDate = (date) => {



    const parts =



      getDateParts(date)



    if (!parts.year) {



      return date || ''



    }



    return new Date(



      parts.year,



      parts.month,



      parts.day



    ).toLocaleDateString(



      'en-IN',



      {



        day: 'numeric',



        month: 'long',



        year: 'numeric'



      }



    )



  }



  // -----------------------------------



  // DOWNLOAD MONTH PDF



  // -----------------------------------



  const handleDownloadPDF = (



    monthData



  ) => {



    if (



      !monthData ||



      monthData.consumptions.length ===



        0



    ) {



      alert(



        `No consumption records available for ${



          monthData?.monthName ||



          'this month'



        }.`



      )



      return



    }



    createConsumptionPDF(



      monthData.monthName,



      selectedYear,



      monthData.consumptions



    )



  }



  const selectedProductForConfirm = () =>

    products.find((product) => product.product_name === productName) || null



  return (



    <div className="consumption-tracking">



      {/* PAGE HEADER */}



      <div className="page-title">



        <h1>



          📊 Consumption Tracking



        </h1>



        <p>



          Track how much your household uses



        </p>



      </div>



      {/* CONSUMPTION FORM */}



      <div className="consumption-form">



        <div className="form-group">



          <label>



            Product



          </label>



          <input

            type="text"

            id="consumption-product-name"

            list="consumption-product-suggestions"

            autoComplete="off"

            placeholder={products.length ? 'Search or enter product name' : 'No products available in Product Management'}

            value={productName}

            onChange={handleProductChange}

            disabled={products.length === 0}

          />



          <datalist id="consumption-product-suggestions">

            {products

              .filter((product) => product.product_name)

              .filter((product, index, all) =>

                all.findIndex((item) =>

                  String(item.product_name).trim().toLowerCase() ===

                  String(product.product_name).trim().toLowerCase()

                ) === index

              )

              .map((product) => (

                <option key={product.id || product.product_name} value={product.product_name} />

              ))}

          </datalist>



        </div>



        <div className="form-row">



          <div className="form-group">



            <label>



              Quantity Used



            </label>



            <input



              type="number"



              placeholder="Example: 2"



              min="0"



              step="any"



              value={quantity}



              onChange={(e) =>



                setQuantity(



                  e.target.value



                )



              }



            />



          </div>



          <div className="form-group">



            <label>



              Unit



            </label>



            <select



              value={unit}



              onChange={(e) =>



                setUnit(



                  e.target.value



                )



              }



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



        <div className="form-group">



          <label>



            Usage Date



          </label>



          <input



            type="date"



            max={getToday()}



            value={usageDate}



            onChange={(e) =>



              setUsageDate(



                e.target.value



              )



            }



          />



        </div>



        <button

          type="button"

          className="consumption-save-button"

          onClick={() => handleSave(false)}

          disabled={loading}

        >



          {loading



            ? 'Recording...'



            : '💾 Record Usage'}



        </button>



      </div>



      {/* CONSUMPTION OVERVIEW */}



      <div className="consumption-period-header">



        <div>



          <h2>



            📅 Consumption Overview



          </h2>



          <p>



            Select a year to view monthly consumption



          </p>



        </div>



        <div className="year-selector">



          <label>



            Year



          </label>



          <select



            value={selectedYear}



            onChange={(e) => {



              setSelectedYear(



                Number(



                  e.target.value



                )



              )



              setSelectedMonth(



                null



              )



            }}



          >



            {availableYears.map(



              (year) => (



                <option



                  key={year}



                  value={year}



                >



                  {year}



                </option>



              )



            )}



          </select>



        </div>



      </div>



      {/* MONTH CARDS */}



      {selectedMonth === null ? (



        <div className="month-grid">

          {monthlyData.map((month) => (

            <button

              type="button"

              className={`month-card ${month.consumptionCount === 0 ? 'empty' : ''}`}

              key={month.monthIndex}

              onClick={() => setSelectedMonth(month.monthIndex)}

              aria-label={`View ${month.monthName} ${selectedYear} consumption`}

            >

              <div className="month-card-top">

                <span className="month-count-badge">

                  {month.consumptionCount === 0

                    ? 'No Usage'

                    : `${month.consumptionCount} ${

                        month.consumptionCount === 1 ? 'Record' : 'Records'

                      }`}

                </span>

                <span className="month-total-label">Total Used</span>

              </div>

              <div className="month-card-bottom">

                <h3>{month.monthName}</h3>

                <strong className="month-total-value">

                  {formatQuantity(month.totalQuantity)}

                  <span className="month-card-arrow" aria-hidden="true">→</span>

                </strong>

              </div>

            </button>

          ))}

        </div>



      ) : (



        <div className="month-details">



          <button



            type="button"



            className="back-to-months"



            onClick={() =>



              setSelectedMonth(



                null



              )



            }



          >



            ← Back to {selectedYear}



          </button>



          <div className="month-detail-header">



            <div className="month-detail-title">



              <span className="detail-icon">



                📊



              </span>



              <div>



                <h2>



                  {



                    selectedMonthData?.monthName



                  }{' '}



                  {selectedYear}



                </h2>



                <p>



                  Consumption recorded during this month



                </p>



              </div>



            </div>



            <div className="month-summary">



              <div>



                <span>



                  Consumption Records



                </span>



                <strong>



                  {



                    selectedMonthData?.consumptionCount ||



                    0



                  }



                </strong>



              </div>



              <div>



                <span>



                  Total Quantity Used



                </span>



                <strong>



                  {



                    formatQuantity(



                      selectedMonthData?.totalQuantity ||



                      0



                    )



                  }



                </strong>



              </div>



            </div>



          </div>



          {selectedMonthData?.consumptions



            .length > 0 && (



            <button



              type="button"



              className="month-detail-pdf-button"



              onClick={() =>



                handleDownloadPDF(



                  selectedMonthData



                )



              }



            >



              📄 Download{' '}



              {



                selectedMonthData.monthName



              }{' '}



              {selectedYear} Consumption PDF



            </button>



          )}



          {selectedMonthData?.consumptions



            .length === 0 ? (



            <div className="no-month-consumption">



              <div>



                📊



              </div>



              <h3>



                No consumption in{' '}



                {



                  selectedMonthData?.monthName



                }



              </h3>



              <p>



                No consumption records were found for this month.



              </p>



            </div>



          ) : (



            <div className="month-consumption-list">



              {selectedMonthData.consumptions.map(



                (consumption) => (



                  <div



                    className="month-consumption-card"



                    key={



                      consumption.id



                    }



                  >



                    <div className="consumption-product-icon">



                      📊



                    </div>



                    <div className="month-consumption-info">



                      <h3>



                        {



                          consumption.product_name



                        }



                      </h3>



                      <p>



                        {



                          formatQuantity(



                            Number(



                              consumption.quantity ||



                              0



                            )



                          )



                        }{' '}



                        {



                          consumption.unit



                        }



                        {' • '}



                        {



                          formatDate(



                            consumption.usage_date



                          )



                        }



                      </p>



                    </div>



                    <div
                      className="month-consumption-amount"
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        width: '100%',
                        minWidth: 0,
                      }}
                    >



                      <span>



                        Quantity Used



                      </span>



                      <strong>



                        {



                          formatQuantity(



                            Number(



                              consumption.quantity ||



                              0



                            )



                          )



                        }{' '}



                        {



                          consumption.unit



                        }



                      </strong>



                    </div>



                  </div>



                )



              )}



            </div>



          )}



        </div>



      )}



      {showConfirm && (

        <div

          className="consumption-confirm-overlay"

          onClick={() => !loading && setShowConfirm(false)}

          style={{

            position: 'fixed',

            inset: 0,

            zIndex: 9999,

            background: 'rgba(10, 35, 22, 0.58)',

            backdropFilter: 'blur(4px)',

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            padding: '18px'

          }}

        >

          <div

            className="consumption-confirm-modal"

            role="dialog"

            aria-modal="true"

            aria-labelledby="consumption-confirm-title"

            onClick={(event) => event.stopPropagation()}

            style={{

              width: '100%',

              maxWidth: '420px',

              background: '#ffffff',

              borderRadius: '18px',

              padding: '24px',

              boxShadow: '0 18px 55px rgba(0,0,0,0.22)',

              color: '#174b32'

            }}

          >

            <div style={{

              width: '48px',

              height: '48px',

              borderRadius: '14px',

              background: '#e7f6eb',

              display: 'grid',

              placeItems: 'center',

              fontSize: '24px',

              marginBottom: '14px'

            }}>

              📊

            </div>



            <h2

              id="consumption-confirm-title"

              style={{ margin: '0 0 6px', fontSize: '21px' }}

            >

              Confirm Usage

            </h2>

            <p style={{

              margin: '0 0 18px',

              color: '#668071',

              fontSize: '14px',

              lineHeight: 1.5

            }}>

              Please check the consumption details before recording.

            </p>



            <div style={{

              background: '#f3faf5',

              border: '1px solid #dcefe2',

              borderRadius: '12px',

              padding: '14px',

              display: 'grid',

              gap: '12px'

            }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>

                <span style={{ color: '#668071' }}>Product</span>

                <strong style={{ textAlign: 'right' }}>{productName}</strong>

              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>

                <span style={{ color: '#668071' }}>Quantity Used</span>

                <strong>{formatQuantity(Number(quantity))} {unit}</strong>

              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>

                <span style={{ color: '#668071' }}>Usage Date</span>

                <strong>{formatDate(usageDate)}</strong>

              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid #dcefe2', paddingTop: '10px' }}>

                <span style={{ color: '#668071' }}>Available Stock</span>

                <strong>

                  {formatQuantity(Number(selectedProductForConfirm()?.quantity ?? 0))} {unit}

                </strong>

              </div>

            </div>



            <div style={{

              display: 'flex',

              gap: '10px',

              marginTop: '20px'

            }}>

              <button

                type="button"

                onClick={() => setShowConfirm(false)}

                disabled={loading}

                style={{

                  flex: 1,

                  border: '1px solid #cfe3d5',

                  borderRadius: '10px',

                  padding: '12px',

                  background: '#ffffff',

                  color: '#17633a',

                  fontWeight: 700,

                  cursor: 'pointer'

                }}

              >

                Cancel

              </button>

              <button

                type="button"

                onClick={() => handleSave(true)}

                disabled={loading}

                style={{

                  flex: 1,

                  border: 0,

                  borderRadius: '10px',

                  padding: '12px',

                  background: '#168d4b',

                  color: '#ffffff',

                  fontWeight: 700,

                  cursor: loading ? 'wait' : 'pointer',

                  opacity: loading ? 0.7 : 1

                }}

              >

                {loading ? 'Recording...' : '✓ Confirm & Record'}

              </button>

            </div>

          </div>

        </div>

      )}



    </div>



  )



}



// -----------------------------------



// DATE HELPER



// -----------------------------------



function getDateParts(date) {



  if (!date) {



    return {



      year: null,



      month: null,



      day: null



    }



  }



  const value =



    String(date).split('T')[0]



  const parts =



    value.split('-')



  if (parts.length >= 3) {



    const year =



      Number(parts[0])



    const month =



      Number(parts[1]) - 1



    const day =



      Number(parts[2])



    if (



      Number.isFinite(year) &&



      Number.isFinite(month) &&



      Number.isFinite(day)



    ) {



      return {



        year,



        month,



        day



      }



    }



  }



  const parsed =



    new Date(date)



  if (



    Number.isNaN(



      parsed.getTime()



    )



  ) {



    return {



      year: null,



      month: null,



      day: null



    }



  }



  return {



    year: parsed.getFullYear(),



    month: parsed.getMonth(),



    day: parsed.getDate()



  }



}



// -----------------------------------



// GROUP SAME PRODUCT + SAME UNIT



// -----------------------------------



function groupConsumptions(



  consumptions



) {



  const grouped = new Map()



  consumptions.forEach(



    (consumption) => {



      const productName =



        String(



          consumption.product_name ||



          'Unknown Product'



        ).trim()



      const unit =



        String(



          consumption.unit ||



          ''



        ).trim()



      const key =



        `${productName.toLowerCase()}__${unit.toLowerCase()}`



      const quantity =



        Number(



          consumption.quantity ||



          0



        )



      if (!grouped.has(key)) {



        grouped.set(



          key,



          {



            productName,



            unit,



            totalQuantity:



              quantity



          }



        )



      } else {



        const item =



          grouped.get(key)



        item.totalQuantity +=



          quantity



      }



    }



  )



  return Array.from(



    grouped.values()



  ).sort(



    (a, b) =>



      a.productName.localeCompare(



        b.productName



      )



  )



}



// -----------------------------------

// CONSUMPTION PDF - FORMATTED REPORT

// -----------------------------------



function createConsumptionPDF(monthName, year, monthConsumptions) {

  const grouped = groupConsumptions(monthConsumptions)

  const totalQuantity = monthConsumptions.reduce(

    (total, item) => total + Number(item.quantity || 0),

    0

  )



  const PAGE_W = 595

  const PAGE_H = 842

  const LEFT = 42

  const RIGHT = 553

  const CONTENT_W = RIGHT - LEFT

  const pages = []

  let commands = []

  let pageNumber = 1

  let y = 0



  const color = {

    green: [0.035, 0.36, 0.23],

    dark: [0.08, 0.22, 0.16],

    muted: [0.39, 0.49, 0.43],

    pale: [0.92, 0.97, 0.93],

    border: [0.82, 0.89, 0.84],

    orange: [0.98, 0.57, 0.16],

    white: [1, 1, 1],

    stripe: [0.965, 0.98, 0.968]

  }



  const pdfText = (value) =>

    String(value ?? '')

      .replace(/[^\x20-\x7E]/g, '?')

      .replace(/**\\\**/g, '\\\\\\\\')

      .replace(/**\\(**/g, '\\\\(')

      .replace(/**\\)**/g, '\\\\)')



  const rgb = (values) => values.join(' ')



  const text = (x, top, value, size = 10, fill = color.dark, bold = false) => {

    const font = bold ? '/F2' : '/F1'

    commands.push(

      `BT ${rgb(fill)} rg ${font} ${size} Tf 1 0 0 1 ${x} ${PAGE_H - top} Tm (${pdfText(value)}) Tj ET`

    )

  }



  const rightText = (rightX, top, value, size = 10, fill = color.dark, bold = false) => {

    const str = String(value ?? '')

    const estimatedWidth = str.length * size * (bold ? 0.56 : 0.51)

    text(rightX - estimatedWidth, top, str, size, fill, bold)

  }



  const rect = (x, top, width, height, fill, stroke = null, radius = 0) => {

    const bottom = PAGE_H - top - height

    if (radius > 0) {

      const r = Math.min(radius, height / 2, width / 2)

      const k = 0.5522847498

      commands.push(`${rgb(fill)} rg`)

      if (stroke) commands.push(`${rgb(stroke)} RG 0.8 w`)

      commands.push(

        `${x + r} ${bottom} m ${x + width - r} ${bottom} l ` +

        `${x + width - r + r*k} ${bottom} ${x + width} ${bottom + r-r*k} ${x + width} ${bottom+r} c ` +

        `${x + width} ${bottom + height-r} l ` +

        `${x + width} ${bottom + height-r+r*k} ${x + width-r+r*k} ${bottom+height} ${x+width-r} ${bottom+height} c ` +

        `${x+r} ${bottom+height} l ` +

        `${x+r-r*k} ${bottom+height} ${x} ${bottom+height-r+r*k} ${x} ${bottom+height-r} c ` +

        `${x} ${bottom+r} l ` +

        `${x} ${bottom+r-r*k} ${x+r-r*k} ${bottom} ${x+r} ${bottom} c h`

      )

      commands.push(stroke ? 'B' : 'f')

    } else {

      commands.push(`${rgb(fill)} rg ${x} ${bottom} ${width} ${height} re f`)

      if (stroke) {

        commands.push(`${rgb(stroke)} RG 0.8 w ${x} ${bottom} ${width} ${height} re S`)

      }

    }

  }



  const line = (x1, top1, x2, top2, stroke = color.border, width = 0.8) => {

    commands.push(

      `${rgb(stroke)} RG ${width} w ${x1} ${PAGE_H-top1} m ${x2} ${PAGE_H-top2} l S`

    )

  }



  const finishPage = () => {

    // Footer

    line(LEFT, 802, RIGHT, 802, color.border, 0.7)

    text(LEFT, 820, 'Home Needs  |  Household Consumption Report', 8, color.muted)

    rightText(RIGHT, 820, `Page ${pageNumber}`, 8, color.muted)

    pages.push(commands.join('\n'))

    commands = []

  }



  const startPage = (continued = false) => {

    commands = []

    rect(0, 0, PAGE_W, 118, color.green)

    text(LEFT, 42, 'HOME NEEDS', 11, color.white, true)

    text(LEFT, 75, `${monthName} ${year} - CONSUMPTION REPORT${continued ? ' (CONTINUED)' : ''}`, 18, color.white, true)

    text(LEFT, 96, 'A clear record of household product usage', 9, [0.86, 0.95, 0.88])

    y = 145

    pageNumber += continued ? 1 : 0

  }



  startPage(false)



  // Summary figures

  const summaryTop = y

  rect(LEFT, summaryTop, CONTENT_W, 82, color.pale, color.border, 10)

  text(LEFT + 16, summaryTop + 23, 'TOTAL CONSUMPTION RECORDS', 8, color.muted, true)

  text(LEFT + 16, summaryTop + 51, String(monthConsumptions.length), 21, color.green, true)

  line(LEFT + 250, summaryTop + 15, LEFT + 250, summaryTop + 67, color.border, 0.8)

  text(LEFT + 272, summaryTop + 23, 'TOTAL QUANTITY USED', 8, color.muted, true)

  text(LEFT + 272, summaryTop + 51, formatQuantity(totalQuantity), 21, color.green, true)

  y += 108



  // Product summary

  text(LEFT, y, 'PRODUCT SUMMARY', 12, color.green, true)

  y += 15

  const summaryCols = { product: LEFT + 12, qty: RIGHT - 12 }

  rect(LEFT, y, CONTENT_W, 27, color.green, null, 4)

  text(summaryCols.product, y + 18, 'PRODUCT', 8, color.white, true)

  rightText(summaryCols.qty, y + 18, 'TOTAL USED', 8, color.white, true)

  y += 27



  grouped.forEach((item, index) => {

    if (y > 755) {

      finishPage()

      startPage(true)

      text(LEFT, y, 'PRODUCT SUMMARY (CONTINUED)', 12, color.green, true)

      y += 18

      rect(LEFT, y, CONTENT_W, 27, color.green, null, 4)

      text(summaryCols.product, y + 18, 'PRODUCT', 8, color.white, true)

      rightText(summaryCols.qty, y + 18, 'TOTAL USED', 8, color.white, true)

      y += 27

    }

    if (index % 2 === 1) rect(LEFT, y, CONTENT_W, 28, color.stripe)

    text(summaryCols.product, y + 18, item.productName.slice(0, 48), 9)

    rightText(summaryCols.qty, y + 18, `${formatQuantity(item.totalQuantity)} ${item.unit}`.trim(), 9, color.dark, true)

    line(LEFT, y + 28, RIGHT, y + 28, color.border, 0.35)

    y += 28

  })



  y += 25

  if (y > 720) {

    finishPage()

    startPage(true)

  }



  // Consumption details

  text(LEFT, y, 'CONSUMPTION DETAILS', 12, color.green, true)

  y += 15



  const drawDetailsHeader = () => {

    rect(LEFT, y, CONTENT_W, 28, color.green, null, 4)

    text(LEFT + 10, y + 18, 'DATE', 8, color.white, true)

    text(LEFT + 112, y + 18, 'PRODUCT', 8, color.white, true)

    rightText(RIGHT - 12, y + 18, 'QUANTITY', 8, color.white, true)

    y += 28

  }

  drawDetailsHeader()



  monthConsumptions.forEach((item, index) => {

    if (y > 770) {

      finishPage()

      startPage(true)

      text(LEFT, y, 'CONSUMPTION DETAILS (CONTINUED)', 12, color.green, true)

      y += 15

      drawDetailsHeader()

    }



    if (index % 2 === 0) rect(LEFT, y, CONTENT_W, 31, color.stripe)

    const parts = getDateParts(item.usage_date)

    const dateText = parts.year

      ? `${String(parts.day).padStart(2, '0')}/${String(parts.month + 1).padStart(2, '0')}/${parts.year}`

      : '-'

    text(LEFT + 10, y + 20, dateText, 8, color.muted)

    text(LEFT + 112, y + 20, String(item.product_name || 'Product').slice(0, 48), 9, color.dark, true)

    rightText(RIGHT - 12, y + 20, `${formatQuantity(item.quantity)} ${item.unit || ''}`.trim(), 9, color.green, true)

    line(LEFT, y + 31, RIGHT, y + 31, color.border, 0.35)

    y += 31

  })



  finishPage()



  // Build a standards-compliant PDF with Helvetica regular and bold fonts.

  const objects = []

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'

  const pageStart = 3

  const fontRegular = pageStart + pages.length * 2

  const fontBold = fontRegular + 1

  const pageRefs = pages.map((_, i) => `${pageStart + i * 2} 0 R`).join(' ')

  objects[1] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`



  pages.forEach((stream, i) => {

    const pageObj = pageStart + i * 2

    const contentObj = pageObj + 1

    objects[pageObj - 1] =

      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +

      `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObj} 0 R >>`

    objects[contentObj - 1] =

      `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`

  })



  objects[fontRegular - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  objects[fontBold - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'



  let pdf = '%PDF-1.4\n'

  const offsets = [0]

  objects.forEach((object, index) => {

    offsets.push(new TextEncoder().encode(pdf).length)

    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`

  })

  const xrefPosition = new TextEncoder().encode(pdf).length

  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`

  for (let i = 1; i <= objects.length; i++) {

    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`

  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`

  pdf += `startxref\n${xrefPosition}\n%%EOF`



  const blob = new Blob([new TextEncoder().encode(pdf)], { type: 'application/pdf' })

  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')

  link.href = url

  link.download = `Home_Needs_${monthName}_${year}_Consumption_Report.pdf`

  document.body.appendChild(link)

  link.click()

  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 1500)

}



// -----------------------------------



// PDF HELPERS



// -----------------------------------



function escapePDFText(text) {
  return String(text)
    .replace(/\\\\/g, '\\\\\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?')
}

function fitText(



  text,



  length



) {



  const value =



    String(text || '')



  if (



    value.length <=



    length



  ) {



    return value.padEnd(



      length,



      ' '



    )



  }



  return (



    value.slice(



      0,



      length - 3



    ) +



    '...'



  )



}



function padLeft(



  text,



  length



) {



  return String(text)



    .padStart(



      length,



      ' '



    )



}



function formatQuantity(quantity) {

  const number = Number(quantity || 0)

  if (!Number.isFinite(number)) {

    return '0'

  }

  if (Number.isInteger(number)) {

    return String(number)

  }

  return number

    .toFixed(2)

    .replace(/\.?0+$/, '')

}

export default ConsumptionTracking
