import './PurchaseTracking.css'

function PurchaseTracking() {
  return (
    <div className="purchase-tracking">

      <div className="page-title">
        <h1>🧾 Purchase Tracking</h1>
        <p>Keep track of your household purchases</p>
      </div>

      {/* Purchase Form */}

      <div className="purchase-form">

        <div className="form-group">
          <label>Product Name</label>
          <input
            type="text"
            placeholder="Example: Rice"
          />
        </div>

        <div className="form-row">

          <div className="form-group">
            <label>Quantity</label>
            <input
              type="number"
              placeholder="Example: 5"
            />
          </div>

          <div className="form-group">
            <label>Unit</label>
            <select>
              <option>Kg</option>
              <option>Gram</option>
              <option>Litre</option>
              <option>Packet</option>
              <option>Piece</option>
              <option>Bottle</option>
            </select>
          </div>

        </div>

        <div className="form-row">

          <div className="form-group">
            <label>Amount Paid</label>
            <input
              type="number"
              placeholder="Example: 300"
            />
          </div>

          <div className="form-group">
            <label>Purchase Date</label>
            <input type="date" />
          </div>

        </div>

        <button className="purchase-save-button">
          💾 Save Purchase
        </button>

      </div>


      {/* Purchase History */}

      <div className="purchase-history">

        <h2>📋 Purchase History</h2>

        <div className="purchase-card">

          <div>
            <h3>🍚 Rice</h3>
            <p>5 Kg • 5 September 2026</p>
          </div>

          <strong>₹300</strong>

        </div>

        <div className="purchase-card">

          <div>
            <h3>🛢️ Cooking Oil</h3>
            <p>2 Litre • 3 September 2026</p>
          </div>

          <strong>₹360</strong>

        </div>

      </div>

    </div>
  )
}

export default PurchaseTracking