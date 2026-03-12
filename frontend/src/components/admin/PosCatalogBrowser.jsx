function PosCatalogBrowser({
  tabs,
  activeTab,
  setActiveTab,
  searchTerm,
  setSearchTerm,
  activeCount,
  inventoryLoading,
  bookingTab,
  setBookingTab,
  bookingDateFilter,
  setBookingDateFilter,
  todayDateKey,
  categoryOptions,
  activeCategoryId,
  setActiveCategoryId,
  filteredProducts,
  variantSelections,
  setVariantSelections,
  filteredPosProducts,
  filteredWorkshops,
  workshopSelections,
  setWorkshopSelections,
  filteredClasses,
  classSelections,
  setClassSelections,
  classOptionSelections,
  setClassOptionSelections,
  filteredWorkshopBookings,
  filteredCutFlowerBookings,
  activeBookingEditor,
  setActiveBookingEditor,
  getBookingEditState,
  handleBookingEditChange,
  handleSaveBookingChanges,
  handleAddBookingToCart,
  bookingSavingId,
  bookingError,
  workshopLookup,
  cutFlowerOptions,
  cutFlowerOptionPriceMap,
  filteredEvents,
  eventSelections,
  setEventSelections,
  formatCurrency,
  handleAddToCart,
}) {
  return (
    <section className="pos-wizard__card pos-catalog-browser">
      <div className="pos-toolbar">
        <div className="pos-toolbar__row">
          <div className="admin-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`admin-tab ${activeTab === tab.id ? "is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pos-toolbar__row pos-toolbar__row--search">
          <input
            className="input pos-search"
            type="search"
            placeholder="Search items"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {searchTerm.trim().length > 0 && (
            <button
              className="btn btn--secondary btn--small pos-search__clear"
              type="button"
              onClick={() => setSearchTerm("")}
            >
              Clear
            </button>
          )}
          <span className="modal__meta pos-toolbar__count">Showing {activeCount} items</span>
        </div>

        {activeTab === "bookings" && (
          <div className="pos-toolbar__row">
            <div className="admin-tabs">
              <button
                type="button"
                className={`admin-tab ${bookingTab === "workshop" ? "is-active" : ""}`}
                onClick={() => setBookingTab("workshop")}
              >
                Workshops
              </button>
              <button
                type="button"
                className={`admin-tab ${bookingTab === "cut-flower" ? "is-active" : ""}`}
                onClick={() => setBookingTab("cut-flower")}
              >
                Cut flower
              </button>
            </div>
            <label className="modal__meta">
              Booking date
              <input
                className="input"
                type="date"
                value={bookingDateFilter}
                onChange={(event) => setBookingDateFilter(event.target.value)}
              />
            </label>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => setBookingDateFilter(todayDateKey)}
            >
              Today
            </button>
          </div>
        )}

        {activeTab === "products" && categoryOptions.length > 0 && (
          <div className="pos-toolbar__categories">
            <button
              className={`pos-category-chip ${activeCategoryId === "all" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveCategoryId("all")}
            >
              All categories
            </button>
            {categoryOptions.map((category) => (
              <button
                className={`pos-category-chip ${
                  activeCategoryId === category.id ? "is-active" : ""
                }`}
                type="button"
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pos-catalog-browser__body">
        {inventoryLoading && <p className="modal__meta">Loading inventory...</p>}
        {activeTab === "products" && filteredProducts.length === 0 && !inventoryLoading && (
          <p className="empty-state">No products match your search or selected category.</p>
        )}
        {activeTab === "pos-products" && filteredPosProducts.length === 0 && !inventoryLoading && (
          <p className="empty-state">No POS-only items match your search.</p>
        )}
        {activeTab === "workshops" && filteredWorkshops.length === 0 && !inventoryLoading && (
          <p className="empty-state">No workshops match your search.</p>
        )}
        {activeTab === "classes" && filteredClasses.length === 0 && !inventoryLoading && (
          <p className="empty-state">No classes match your search.</p>
        )}
        {activeTab === "events" && filteredEvents.length === 0 && !inventoryLoading && (
          <p className="empty-state">No events match your search.</p>
        )}

        {activeTab === "products" && (
          <div className="pos-grid">
            {filteredProducts.map((product) => {
              const selection = variantSelections[product.id] || "";
              const variant = product.variants.find((entry) => entry.id === selection) || null;
              const variantPrice = Number.isFinite(variant?.price) ? variant.price : product.numericPrice;
              const priceLabel = Number.isFinite(variantPrice)
                ? formatCurrency(variantPrice)
                : "Price on request";
              const canAdd =
                product.variants.length > 0
                  ? Boolean(variant) && variant.stockStatus?.state !== "out"
                  : product.stockStatus?.state !== "out";
              return (
                <article className="pos-item-card" key={product.id}>
                  <div>
                    <h4>{product.name}</h4>
                    <p className="modal__meta">{priceLabel}</p>
                    {product.stockStatus && (
                      <span className={`badge badge--stock-${product.stockStatus.state}`}>
                        {product.stockStatus.label}
                      </span>
                    )}
                    {product.variants.length > 0 && (
                      <label className="modal__meta pos-item-card__field">
                        Variant
                        <select
                          className="input"
                          value={selection}
                          onChange={(event) =>
                            setVariantSelections((prev) => ({
                              ...prev,
                              [product.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select variant</option>
                          {product.variants.map((variantOption) => (
                            <option key={variantOption.id} value={variantOption.id}>
                              {variantOption.label}
                              {Number.isFinite(variantOption.price)
                                ? ` - ${formatCurrency(variantOption.price)}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={!canAdd || (product.variants.length > 0 && !selection)}
                    onClick={() =>
                      handleAddToCart({
                        key: ["product", product.id, variant?.id || "base", "default"].join(":"),
                        sourceId: product.id,
                        type: "product",
                        name: product.name,
                        price: Number.isFinite(variantPrice) ? variantPrice : 0,
                        quantity: 1,
                        metadata: {
                          type: "product",
                          productId: product.id,
                          variantId: variant?.id || null,
                          variantLabel: variant?.label || null,
                        },
                      })
                    }
                  >
                    Add
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {activeTab === "pos-products" && (
          <div className="pos-grid">
            {filteredPosProducts.map((product) => {
              const canAdd = product.stockStatus?.state !== "out";
              return (
                <article className="pos-item-card" key={product.id}>
                  <div>
                    <h4>{product.name}</h4>
                    <p className="modal__meta">{product.displayPrice}</p>
                    {product.stockStatus && (
                      <span className={`badge badge--stock-${product.stockStatus.state}`}>
                        {product.stockStatus.label}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={!canAdd}
                    onClick={() =>
                      handleAddToCart({
                        key: ["pos-product", product.id, "base", "default"].join(":"),
                        sourceId: product.id,
                        type: "pos-product",
                        name: product.name,
                        price: Number.isFinite(product.numericPrice) ? product.numericPrice : 0,
                        quantity: 1,
                        metadata: { type: "pos-product" },
                      })
                    }
                  >
                    Add
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {activeTab === "workshops" && (
          <div className="pos-grid">
            {filteredWorkshops.map((workshop) => {
              const selectedSessionId =
                workshopSelections[workshop.id] || workshop.sessions[0]?.id || "";
              const selectedSession =
                workshop.sessions.find((session) => session.id === selectedSessionId) || null;
              return (
                <article className="pos-item-card" key={workshop.id}>
                  <div>
                    <h4>{workshop.title}</h4>
                    <p className="modal__meta">{workshop.displayPrice}</p>
                    {workshop.sessions.length > 0 && (
                      <label className="modal__meta pos-item-card__field">
                        Session
                        <select
                          className="input"
                          value={selectedSessionId}
                          onChange={(event) =>
                            setWorkshopSelections((prev) => ({
                              ...prev,
                              [workshop.id]: event.target.value,
                            }))
                          }
                        >
                          {workshop.sessions.map((session) => (
                            <option key={session.id} value={session.id}>
                              {session.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() =>
                      handleAddToCart({
                        key: ["workshop", workshop.id, "base", selectedSession?.id || "default"].join(":"),
                        sourceId: workshop.id,
                        type: "workshop",
                        name: workshop.title,
                        price: Number.isFinite(workshop.numericPrice) ? workshop.numericPrice : 0,
                        quantity: 1,
                        metadata: {
                          type: "workshop",
                          workshopId: workshop.id,
                          sessionId: selectedSession?.id || null,
                          sessionLabel: selectedSession?.label || null,
                          sessionDate: selectedSession?.date || "",
                        },
                      })
                    }
                  >
                    Add
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {activeTab === "classes" && (
          <div className="pos-grid">
            {filteredClasses.map((classDoc) => {
              const selectedSlotId = classSelections[classDoc.id] || classDoc.slots[0]?.id || "";
              const selectedSlot =
                classDoc.slots.find((slot) => slot.id === selectedSlotId) || null;
              const selectedOptionId =
                classOptionSelections[classDoc.id] || classDoc.options[0]?.id || "";
              const selectedOption =
                classDoc.options.find((option) => option.id === selectedOptionId) || null;
              const optionPrice = Number.isFinite(selectedOption?.price) ? selectedOption.price : null;
              const price = Number.isFinite(optionPrice)
                ? optionPrice
                : Number.isFinite(classDoc.numericPrice)
                  ? classDoc.numericPrice
                  : 0;
              const priceLabel = Number.isFinite(optionPrice)
                ? formatCurrency(optionPrice)
                : classDoc.displayPrice;
              const sessionLabel = selectedSlot?.label
                ? `${classDoc.displayDate} - ${selectedSlot.label}`
                : classDoc.displayDate;
              const canAdd = classDoc.options.length === 0 || Boolean(selectedOption);
              return (
                <article className="pos-item-card" key={classDoc.id}>
                  <div>
                    <h4>{classDoc.title}</h4>
                    <p className="modal__meta">{priceLabel}</p>
                    <p className="modal__meta">{classDoc.displayDate}</p>
                    {classDoc.slots.length > 0 && (
                      <label className="modal__meta pos-item-card__field">
                        Time slot
                        <select
                          className="input"
                          value={selectedSlotId}
                          onChange={(event) =>
                            setClassSelections((prev) => ({
                              ...prev,
                              [classDoc.id]: event.target.value,
                            }))
                          }
                        >
                          {classDoc.slots.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {slot.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {classDoc.options.length > 0 && (
                      <label className="modal__meta pos-item-card__field">
                        Option
                        <select
                          className="input"
                          value={selectedOptionId}
                          onChange={(event) =>
                            setClassOptionSelections((prev) => ({
                              ...prev,
                              [classDoc.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select option</option>
                          {classDoc.options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                              {Number.isFinite(option.price)
                                ? ` - ${formatCurrency(option.price)}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={!canAdd}
                    onClick={() =>
                      handleAddToCart({
                        key: [
                          "class",
                          classDoc.id,
                          selectedOption?.id || "base",
                          selectedSlot?.id || "default",
                        ].join(":"),
                        sourceId: classDoc.id,
                        type: "class",
                        name: classDoc.title,
                        price,
                        quantity: 1,
                        metadata: {
                          type: "cut-flower",
                          classId: classDoc.id,
                          sessionLabel,
                          sessionDate: classDoc.eventDate
                            ? classDoc.eventDate.toISOString()
                            : "",
                          location: classDoc.location || "",
                          optionId: selectedOption?.id || null,
                          optionLabel: selectedOption?.label || null,
                          optionPrice,
                        },
                      })
                    }
                  >
                    Add
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {activeTab === "bookings" && (
          <>
            {bookingError && <p className="admin-panel__error">{bookingError}</p>}
            <div className="pos-grid">
              {(bookingTab === "workshop"
                ? filteredWorkshopBookings
                : filteredCutFlowerBookings
              ).map((booking) => {
                const type = bookingTab === "workshop" ? "workshop" : "cut-flower";
                const editorKey = `${type}:${booking.id}`;
                const isEditorOpen = activeBookingEditor === editorKey;
                const editState = getBookingEditState(booking, type);
                const workshop = type === "workshop" ? workshopLookup.get(booking.workshopId) : null;
                const attendeeOptionsForRender =
                  type === "cut-flower"
                    ? Array.from(
                        { length: Math.max(1, Number.parseInt(editState.attendeeCount, 10) || 1) },
                        (_, index) => editState.attendeeOptions?.[index] || editState.optionId || "",
                      )
                    : [];
                const totalFromOptions =
                  type === "cut-flower"
                    ? attendeeOptionsForRender.reduce((sum, optionId) => {
                        const price = Number(cutFlowerOptionPriceMap.get(optionId));
                        return Number.isFinite(price) ? sum + price : sum;
                      }, 0)
                    : null;
                const priceLabel =
                  Number.isFinite(totalFromOptions) && totalFromOptions > 0
                    ? formatCurrency(totalFromOptions)
                    : Number.isFinite(booking.numericPrice)
                      ? formatCurrency(booking.numericPrice)
                      : "Price on request";
                return (
                  <article className="pos-item-card" key={booking.id}>
                    <div>
                      <h4>
                        {type === "workshop"
                          ? booking.workshopTitle
                          : booking.customerName || "Cut flower booking"}
                      </h4>
                      <p className="modal__meta">{booking.displayDate}</p>
                      {type === "workshop" && booking.sessionLabel && (
                        <p className="modal__meta">{booking.sessionLabel}</p>
                      )}
                      <p className="modal__meta">{priceLabel}</p>
                      <p className="modal__meta">Booking will be marked paid on checkout.</p>
                    </div>

                    <div className="admin-category-card__actions">
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={() =>
                          setActiveBookingEditor((prev) => (prev === editorKey ? null : editorKey))
                        }
                      >
                        {isEditorOpen ? "Hide editor" : "Configure booking"}
                      </button>
                    </div>

                    {isEditorOpen && (
                      <div className="pos-booking-editor">
                        {type === "workshop" && workshop?.sessions?.length > 0 && (
                          <label className="modal__meta pos-item-card__field">
                            Session
                            <select
                              className="input"
                              value={editState.sessionId}
                              onChange={(event) =>
                                handleBookingEditChange(
                                  booking,
                                  type,
                                  "sessionId",
                                  event.target.value,
                                )
                              }
                            >
                              {workshop.sessions.map((session) => (
                                <option key={session.id} value={session.id}>
                                  {session.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        <label className="modal__meta pos-item-card__field">
                          Attendees
                          <input
                            className="input"
                            type="number"
                            min="1"
                            value={editState.attendeeCount}
                            onChange={(event) =>
                              handleBookingEditChange(
                                booking,
                                type,
                                "attendeeCount",
                                event.target.value,
                              )
                            }
                          />
                        </label>

                        {type === "cut-flower" && cutFlowerOptions.length > 0 && (
                          <div className="pos-item-card__field">
                            <span className="modal__meta">Attendee options</span>
                            <div className="pos-attendee-options">
                              {attendeeOptionsForRender.map((optionId, index) => (
                                <label
                                  className="modal__meta"
                                  key={`${booking.id}-attendee-${index + 1}`}
                                >
                                  Attendee {index + 1}
                                  <select
                                    className="input"
                                    value={optionId}
                                    onChange={(event) =>
                                      handleBookingEditChange(booking, type, "attendeeOptionIndex", {
                                        index,
                                        optionId: event.target.value,
                                      })
                                    }
                                  >
                                    {cutFlowerOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                        {Number.isFinite(option.price)
                                          ? ` - ${formatCurrency(option.price)}`
                                          : ""}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <label className="modal__meta pos-item-card__field">
                          Update date
                          <input
                            className="input"
                            type="date"
                            value={editState.date}
                            onChange={(event) =>
                              handleBookingEditChange(booking, type, "date", event.target.value)
                            }
                          />
                        </label>

                        <div className="admin-category-card__actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            disabled={bookingSavingId === booking.id}
                            onClick={() => handleSaveBookingChanges(booking, type)}
                          >
                            {bookingSavingId === booking.id ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => handleAddBookingToCart(booking, type)}
                          >
                            Add to Order
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {bookingTab === "workshop" && filteredWorkshopBookings.length === 0 && (
              <p className="empty-state">No open workshop bookings for this date.</p>
            )}
            {bookingTab === "cut-flower" && filteredCutFlowerBookings.length === 0 && (
              <p className="empty-state">No open cut flower bookings for this date.</p>
            )}
          </>
        )}

        {activeTab === "events" && (
          <div className="pos-grid">
            {filteredEvents.map((event) => {
              const selectedSlotId = eventSelections[event.id] || event.slots[0]?.id || "";
              const selectedSlot = event.slots.find((slot) => slot.id === selectedSlotId) || null;
              const sessionLabel = selectedSlot?.label
                ? `${event.displayDate} - ${selectedSlot.label}`
                : event.displayDate;
              return (
                <article className="pos-item-card" key={event.id}>
                  <div>
                    <h4>{event.title}</h4>
                    <p className="modal__meta">{event.displayDate}</p>
                    {event.slots.length > 0 && (
                      <label className="modal__meta pos-item-card__field">
                        Time slot
                        <select
                          className="input"
                          value={selectedSlotId}
                          onChange={(eventSlot) =>
                            setEventSelections((prev) => ({
                              ...prev,
                              [event.id]: eventSlot.target.value,
                            }))
                          }
                        >
                          {event.slots.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {slot.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() =>
                      handleAddToCart({
                        key: ["event", event.id, "base", selectedSlot?.id || "default"].join(":"),
                        sourceId: event.id,
                        type: "event",
                        name: event.title,
                        price: 0,
                        quantity: 1,
                        metadata: {
                          type: "event",
                          eventId: event.id,
                          sessionLabel,
                          sessionDate: event.eventDate ? event.eventDate.toISOString() : "",
                          location: event.location || "",
                        },
                      })
                    }
                  >
                    Add
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default PosCatalogBrowser;
