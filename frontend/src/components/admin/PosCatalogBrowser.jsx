import { useState } from "react";

function PosCatalogBrowser({
  departments,
  departmentCounts,
  activeTab,
  setActiveTab,
  searchTerm,
  setSearchTerm,
  activeCount,
  inventoryLoading,
  serviceFilters,
  activeServiceType,
  setActiveServiceType,
  bookingTab,
  setBookingTab,
  bookingDateFilter,
  setBookingDateFilter,
  todayDateKey,
  categoryOptions,
  activeCategoryId,
  setActiveCategoryId,
  posCategoryOptions,
  activePosCategoryId,
  setActivePosCategoryId,
  allItemsSections,
  filteredProducts,
  variantSelections,
  setVariantSelections,
  filteredPosProducts,
  workshopSelections,
  setWorkshopSelections,
  workshopOptionSelections,
  setWorkshopOptionSelections,
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
  eventSelections,
  setEventSelections,
  serviceSections,
  formatCurrency,
  topSellerEntries,
  topSellersLabel,
  onAddProduct,
  onAddPosProduct,
  onAddWorkshop,
  onAddClass,
  onAddEvent,
  onAddTopSeller,
}) {
  const visibleCategoryOptions =
    activeTab === "products"
      ? categoryOptions
      : activeTab === "pos-products"
        ? posCategoryOptions
        : [];
  const visibleCategoryId =
    activeTab === "products"
      ? activeCategoryId
      : activeTab === "pos-products"
        ? activePosCategoryId
        : "all";
  const handleVisibleCategoryChange =
    activeTab === "products"
      ? setActiveCategoryId
      : activeTab === "pos-products"
        ? setActivePosCategoryId
        : null;
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  const openDepartment = (departmentId, serviceType = "all") => {
    setActiveTab(departmentId);
    if (departmentId === "services") {
      setActiveServiceType(serviceType);
    }
  };

  const activeDepartment =
    departments.find((department) => department.id === activeTab) || null;
  const isSearchActive = searchTerm.trim().length > 0;
  const previewItems = (items, limit) =>
    isSearchActive ? items : items.slice(0, limit);
  const visibleProductResults = previewItems(filteredProducts, 12);
  const visiblePosProductResults = previewItems(filteredPosProducts, 12);
  const visibleServiceSections = serviceSections
    .map((section) => ({
      ...section,
      items: previewItems(section.items, 8),
    }))
    .filter((section) => section.items.length > 0);
  const visibleWorkshopBookingResults = previewItems(
    filteredWorkshopBookings,
    10,
  );
  const visibleCutFlowerBookingResults = previewItems(
    filteredCutFlowerBookings,
    10,
  );
  const searchDialogTitle =
    activeTab === "bookings"
      ? bookingTab === "workshop"
        ? "Search workshop bookings"
        : "Search cut flower bookings"
      : activeTab === "all-items"
        ? "Search the POS catalog"
        : `Search ${activeDepartment?.label?.toLowerCase() || "catalog"}`;
  const searchDialogDescription =
    activeTab === "bookings"
      ? "Find a booking by guest name, phone number, email, or booking details."
      : activeTab === "all-items"
        ? "Search across products, POS-only items, workshops, classes, and events."
        : `Search within ${activeDepartment?.label?.toLowerCase() || "the catalog"} and add the item straight to the order.`;
  const searchDialogPlaceholder =
    activeTab === "bookings"
      ? "Search bookings"
      : "Search products, services, and items";

  const openSearchDialog = () => {
    setSearchTerm("");
    setIsSearchDialogOpen(true);
  };

  const closeSearchDialog = () => {
    setIsSearchDialogOpen(false);
    setSearchTerm("");
  };

  const getItemFamily = (type, bookingType = "") => {
    if (type === "product") return "product";
    if (type === "pos-product") return "pos-product";
    if (type === "workshop") return "workshop";
    if (type === "class") return "class";
    if (type === "event") return "event";
    if (type === "booking") {
      return bookingType === "workshop"
        ? "workshop-booking"
        : "cut-flower-booking";
    }
    return "product";
  };

  const getItemFamilyLabel = (family) => {
    if (family === "product") return "Product";
    if (family === "pos-product") return "POS-only";
    if (family === "workshop") return "Workshop";
    if (family === "class") return "Class";
    if (family === "event") return "Event";
    if (family === "workshop-booking") return "Workshop booking";
    if (family === "cut-flower-booking") return "Cut flower booking";
    return "Item";
  };

  const renderFamilyBadge = (family) => (
    <span
      className="pos-retail-card__department-badge"
      data-item-family={family}
    >
      {getItemFamilyLabel(family)}
    </span>
  );

  const renderTopSellerSubtitle = (subtitle = "") => {
    const text = subtitle.toString().trim();
    if (!text) return null;

    const separator = " - ";
    const separatorIndex = text.indexOf(separator);
    if (separatorIndex === -1) {
      return (
        <p className="modal__meta pos-top-seller-card__meta">
          <span className="pos-top-seller-card__variant">{text}</span>
        </p>
      );
    }

    const dateText = text.slice(0, separatorIndex + separator.length).trim();
    const variantText = text.slice(separatorIndex + separator.length).trim();

    return (
      <p className="modal__meta pos-top-seller-card__meta">
        <span className="pos-top-seller-card__date">{dateText}</span>
        {variantText && (
          <>
            {" "}
            <span className="pos-top-seller-card__variant">
              {variantText}
            </span>
          </>
        )}
      </p>
    );
  };

  const renderProductCard = (product, renderOptions = null) => {
    const family = getItemFamily("product");
    const onAfterAdd = renderOptions?.onAfterAdd;
    const selection =
      variantSelections[product.id] || product.variants[0]?.id || "";
    const variant =
      product.variants.find((entry) => entry.id === selection) || null;
    const variantPrice = Number.isFinite(variant?.price)
      ? variant.price
      : product.numericPrice;
    const priceLabel = Number.isFinite(variantPrice)
      ? formatCurrency(variantPrice)
      : product.displayPrice;
    const canAdd =
      product.variants.length > 0
        ? Boolean(variant) && variant.stockStatus?.state !== "out"
        : product.stockStatus?.state !== "out";

    return (
      <article
        className="pos-item-card pos-retail-card"
        key={product.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__body">
          <div className="pos-retail-card__header">
            <div className="pos-retail-card__title-block">
              <h4>{product.name}</h4>
              <div className="pos-retail-card__highlight-row">
                {product.variants.length > 0 && (
                  <span className="pos-retail-card__pill pos-retail-card__pill--variant">
                    Variant:{" "}
                    {variant?.label ||
                      `${product.variants.length} ${product.variants.length === 1 ? "variant" : "variants"}`}
                  </span>
                )}
              </div>
            </div>
            {renderFamilyBadge(family)}
          </div>
          <div className="pos-retail-card__price-row">
            <strong>{priceLabel}</strong>
          </div>
          {product.variants.length > 0 && (
            <div className="pos-retail-card__config">
              <label className="modal__meta pos-item-card__field">
                Change variant
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
            </div>
          )}
        </div>
        <div className="pos-retail-card__actions">
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            disabled={!canAdd}
            onClick={() => {
              onAddProduct(product, { variantId: variant?.id || null });
              onAfterAdd?.();
            }}
          >
            Add to order
          </button>
        </div>
      </article>
    );
  };

  const renderPosOnlyCard = (product, renderOptions = null) => {
    const family = getItemFamily("pos-product");
    const onAfterAdd = renderOptions?.onAfterAdd;
    const canAdd = product.stockStatus?.state !== "out";

    return (
      <article
        className="pos-item-card pos-retail-card"
        key={product.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__body">
          <div className="pos-retail-card__header">
            <div className="pos-retail-card__title-block">
              <h4>{product.name}</h4>
            </div>
            {renderFamilyBadge(family)}
          </div>

          <div className="pos-retail-card__price-row">
            <strong>{product.displayPrice}</strong>
          </div>
        </div>

        <div className="pos-retail-card__actions">
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            disabled={!canAdd}
            onClick={() => {
              onAddPosProduct(product);
              onAfterAdd?.();
            }}
          >
            Add to order
          </button>
        </div>
      </article>
    );
  };

  const renderWorkshopCard = (workshop, renderOptions = null) => {
    const family = getItemFamily("workshop");
    const onAfterAdd = renderOptions?.onAfterAdd;
    const selectedSessionId =
      workshopSelections[workshop.id] || workshop.sessions[0]?.id || "";
    const selectedSession =
      workshop.sessions.find((session) => session.id === selectedSessionId) ||
      workshop.sessions[0] ||
      null;
    const selectedOptionId =
      workshopOptionSelections[workshop.id] || workshop.options[0]?.id || "";
    const selectedOption =
      workshop.options.find((option) => option.id === selectedOptionId) ||
      workshop.options[0] ||
      null;
    const optionPrice = Number.isFinite(selectedOption?.price)
      ? selectedOption.price
      : null;
    const priceLabel = Number.isFinite(optionPrice)
      ? formatCurrency(optionPrice)
      : workshop.displayPrice;
    const canAdd = workshop.options.length === 0 || Boolean(selectedOption);

    return (
      <article
        className="pos-item-card pos-retail-card pos-retail-card--service"
        key={workshop.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__body">
          <div className="pos-retail-card__header">
            <div className="pos-retail-card__title-block">
              <h4>{workshop.title}</h4>
              <div className="pos-retail-card__highlight-row">
                <span className="pos-retail-card__pill">
                  {selectedSession?.label || "By request"}
                </span>
                <span className="pos-retail-card__pill pos-retail-card__pill--variant">
                  Frame: {selectedOption?.label || "Choose size"}
                </span>
              </div>
            </div>
            {renderFamilyBadge(family)}
          </div>
          <div className="pos-retail-card__price-row">
            <strong>{priceLabel}</strong>
          </div>
          <div className="pos-retail-card__config">
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
            {workshop.options.length > 0 && (
              <label className="modal__meta pos-item-card__field">
                Frame size
                <select
                  className="input"
                  value={selectedOptionId}
                  onChange={(event) =>
                    setWorkshopOptionSelections((prev) => ({
                      ...prev,
                      [workshop.id]: event.target.value,
                    }))
                  }
                >
                  {workshop.options.map((option) => (
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
        </div>
        <div className="pos-retail-card__actions">
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            disabled={!canAdd}
            onClick={() => {
              onAddWorkshop(workshop, {
                sessionId: selectedSession?.id || null,
                optionId: selectedOption?.id || null,
              });
              onAfterAdd?.();
            }}
          >
            Add to order
          </button>
        </div>
      </article>
    );
  };

  const renderClassCard = (classDoc, renderOptions = null) => {
    const family = getItemFamily("class");
    const onAfterAdd = renderOptions?.onAfterAdd;
    const selectedSlotId =
      classSelections[classDoc.id] || classDoc.slots[0]?.id || "";
    const selectedSlot =
      classDoc.slots.find((slot) => slot.id === selectedSlotId) ||
      classDoc.slots[0] ||
      null;
    const selectedOptionId =
      classOptionSelections[classDoc.id] || classDoc.options[0]?.id || "";
    const selectedOption =
      classDoc.options.find((option) => option.id === selectedOptionId) ||
      classDoc.options[0] ||
      null;
    const optionPrice = Number.isFinite(selectedOption?.price)
      ? selectedOption.price
      : null;
    const priceLabel = Number.isFinite(optionPrice)
      ? formatCurrency(optionPrice)
      : classDoc.displayPrice;
    const canAdd = classDoc.options.length === 0 || Boolean(selectedOption);

    return (
      <article
        className="pos-item-card pos-retail-card pos-retail-card--service"
        key={classDoc.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__body">
          <div className="pos-retail-card__header">
            <div className="pos-retail-card__title-block">
              <h4>{classDoc.title}</h4>
              <div className="pos-retail-card__highlight-row">
                <span className="pos-retail-card__pill">
                  {selectedSlot?.label || "Set time"}
                </span>
                {selectedOption?.label && (
                  <span className="pos-retail-card__pill pos-retail-card__pill--variant">
                    Option: {selectedOption.label}
                  </span>
                )}
              </div>
            </div>
            {renderFamilyBadge(family)}
          </div>
          <div className="pos-retail-card__price-row">
            <strong>{priceLabel}</strong>
          </div>
          <div className="pos-retail-card__config">
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
        </div>
        <div className="pos-retail-card__actions">
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            disabled={!canAdd}
            onClick={() => {
              onAddClass(classDoc, {
                slotId: selectedSlot?.id || null,
                optionId: selectedOption?.id || null,
              });
              onAfterAdd?.();
            }}
          >
            Add to order
          </button>
        </div>
      </article>
    );
  };

  const renderEventCard = (event, renderOptions = null) => {
    const family = getItemFamily("event");
    const onAfterAdd = renderOptions?.onAfterAdd;
    const selectedSlotId =
      eventSelections[event.id] || event.slots[0]?.id || "";
    const selectedSlot =
      event.slots.find((slot) => slot.id === selectedSlotId) ||
      event.slots[0] ||
      null;

    return (
      <article
        className="pos-item-card pos-retail-card pos-retail-card--service"
        key={event.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__body">
          <div className="pos-retail-card__header">
            <div className="pos-retail-card__title-block">
              <h4>{event.title}</h4>
              <div className="pos-retail-card__highlight-row">
                <span className="pos-retail-card__pill">
                  {selectedSlot?.label || "Set time"}
                </span>
              </div>
            </div>
            {renderFamilyBadge(family)}
          </div>
          <div className="pos-retail-card__price-row">
            <strong>{event.displayPrice}</strong>
          </div>
          {event.slots.length > 0 && (
            <div className="pos-retail-card__config">
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
            </div>
          )}
        </div>
        <div className="pos-retail-card__actions">
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            onClick={() => {
              onAddEvent(event, { slotId: selectedSlot?.id || null });
              onAfterAdd?.();
            }}
          >
            Add to order
          </button>
        </div>
      </article>
    );
  };
  const renderBookingCard = (booking, type, renderOptions = null) => {
    const family = getItemFamily("booking", type);
    const onAfterAction = renderOptions?.onAfterAction;
    const editorKey = `${type}:${booking.id}`;
    const isEditorOpen = activeBookingEditor === editorKey;
    const editState = getBookingEditState(booking, type);
    const workshop =
      type === "workshop" ? workshopLookup.get(booking.workshopId) : null;
    const attendeeOptionsForRender =
      type === "cut-flower"
        ? Array.from(
            {
              length: Math.max(
                1,
                Number.parseInt(editState.attendeeCount, 10) || 1,
              ),
            },
            (_, index) =>
              editState.attendeeOptions?.[index] || editState.optionId || "",
          )
        : [];
    const totalFromOptions =
      type === "cut-flower"
        ? attendeeOptionsForRender.reduce((sum, optionId) => {
            const price = Number(cutFlowerOptionPriceMap.get(optionId));
            return Number.isFinite(price) ? sum + price : sum;
          }, 0)
        : null;
    const selectedWorkshopOption =
      type === "workshop"
        ? workshop?.options?.find(
            (option) => option.id === editState.optionId,
          ) || null
        : null;
    const workshopOptionRequired =
      type === "workshop" && (workshop?.options?.length || 0) > 0;
    const workshopPerAttendeePrice =
      type === "workshop" && Number.isFinite(selectedWorkshopOption?.price)
        ? selectedWorkshopOption.price
        : Number.isFinite(booking.numericPrice)
          ? booking.numericPrice
          : null;
    const workshopTotal =
      type === "workshop"
        ? (() => {
            const attendeeCount = Math.max(
              1,
              Number.parseInt(editState.attendeeCount, 10) || 1,
            );
            return Number.isFinite(workshopPerAttendeePrice)
              ? workshopPerAttendeePrice * attendeeCount
              : null;
          })()
        : null;
    const priceLabel =
      type === "workshop" && workshopOptionRequired && !selectedWorkshopOption
        ? "Select frame size"
        : Number.isFinite(totalFromOptions) && totalFromOptions > 0
          ? formatCurrency(totalFromOptions)
          : Number.isFinite(workshopTotal) && workshopTotal > 0
            ? formatCurrency(workshopTotal)
            : Number.isFinite(booking.numericPrice)
              ? formatCurrency(booking.numericPrice)
              : "Price on request";
    const workshopPriceHint =
      type === "workshop"
        ? workshopOptionRequired && !selectedWorkshopOption
          ? "Select the frame size to load the booking price."
          : Number.isFinite(workshopTotal) && workshopTotal > 0
            ? Number.isFinite(workshopPerAttendeePrice)
              ? `${formatCurrency(workshopPerAttendeePrice)} per guest | ${formatCurrency(workshopTotal)} total`
              : `Total: ${formatCurrency(workshopTotal)}`
            : "Price on request"
        : null;
    const editorTitleId = `${editorKey}-title`;

    return (
      <div className="pos-booking-card-shell" key={booking.id}>
        <article
          className="pos-item-card pos-item-card--booking pos-retail-card pos-retail-card--booking"
          data-item-family={family}
        >
          <div className="pos-item-card__body pos-item-card__body--booking pos-retail-card__body">
            <div className="pos-retail-card__header">
              <div>
                <h4>
                  {type === "workshop"
                    ? booking.name || booking.email || "Workshop booking"
                    : booking.customerName || "Cut flower booking"}
                </h4>
                <p className="modal__meta">
                  {type === "workshop"
                    ? booking.workshopTitle || "Workshop booking"
                    : booking.displayDate}
                </p>
              </div>
              {renderFamilyBadge(family)}
            </div>
            <div className="pos-retail-card__booking-meta">
              <div className="pos-retail-card__price-row">
                <strong>{priceLabel}</strong>
              </div>
              <div className="pos-retail-card__details">
                <div className="pos-retail-card__detail">
                  <span>Date</span>
                  <strong>{booking.displayDate}</strong>
                </div>
                {type === "workshop" &&
                  (selectedWorkshopOption?.label || booking.optionLabel) && (
                    <div className="pos-retail-card__detail">
                      <span>Frame</span>
                      <strong>
                        {selectedWorkshopOption?.label || booking.optionLabel}
                      </strong>
                    </div>
                  )}
                <div className="pos-retail-card__detail">
                  <span>Checkout</span>
                  <strong>Marked paid</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="pos-item-card__actions pos-item-card__actions--booking pos-retail-card__actions">
            <button
              className="btn pos-retail-card__button pos-retail-card__button--secondary"
              type="button"
              data-item-family={family}
              onClick={() => {
                setActiveBookingEditor(editorKey);
                onAfterAction?.();
              }}
            >
              Configure booking
            </button>
          </div>
        </article>

        {isEditorOpen && (
          <div
            className="modal is-active admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={editorTitleId}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setActiveBookingEditor(null);
              }
            }}
          >
            <div className="modal__content pos-booking-dialog">
              <button
                className="modal__close"
                type="button"
                onClick={() => setActiveBookingEditor(null)}
                aria-label="Close booking editor"
              >
                &times;
              </button>
              <div className="pos-booking-dialog__header">
                <h3 className="modal__title" id={editorTitleId}>
                  Configure booking
                </h3>
                <p className="modal__meta">
                  {type === "workshop"
                    ? booking.workshopTitle || "Workshop booking"
                    : booking.customerName || "Cut flower booking"}
                </p>
              </div>

              <div className="pos-booking-editor">
                <div className="pos-booking-editor__grid">
                  {type === "workshop" && workshop?.options?.length > 0 && (
                    <label className="modal__meta pos-item-card__field">
                      Frame size
                      <select
                        className="input"
                        value={editState.optionId}
                        onChange={(event) =>
                          handleBookingEditChange(
                            booking,
                            type,
                            "optionId",
                            event.target.value,
                          )
                        }
                      >
                        <option value="">Select option</option>
                        {workshop.options.map((option) => (
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
                    <div className="pos-item-card__field pos-booking-editor__field--full">
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
                                handleBookingEditChange(
                                  booking,
                                  type,
                                  "attendeeOptionIndex",
                                  {
                                    index,
                                    optionId: event.target.value,
                                  },
                                )
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
                        handleBookingEditChange(
                          booking,
                          type,
                          "date",
                          event.target.value,
                        )
                      }
                    />
                  </label>

                  {type === "workshop" && (
                    <div className="pos-item-card__field pos-booking-editor__field--full">
                      <span className="modal__meta">Pricing</span>
                      <p className="modal__meta">{workshopPriceHint}</p>
                    </div>
                  )}
                </div>

                {bookingError && (
                  <p className="admin-panel__error">{bookingError}</p>
                )}

                <div className="pos-booking-editor__actions">
                  <button
                    className="btn pos-retail-card__button pos-retail-card__button--secondary"
                    type="button"
                    data-item-family={family}
                    disabled={bookingSavingId === booking.id}
                    onClick={() => handleSaveBookingChanges(booking, type)}
                  >
                    {bookingSavingId === booking.id
                      ? "Saving..."
                      : "Save changes"}
                  </button>
                  <button
                    className="btn pos-retail-card__button pos-retail-card__button--primary"
                    type="button"
                    data-item-family={family}
                    disabled={workshopOptionRequired && !selectedWorkshopOption}
                    onClick={() => handleAddBookingToCart(booking, type)}
                  >
                    Add to Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const hasAllItemsResults = allItemsSections.some((section) =>
    Array.isArray(section.items)
      ? section.items.length > 0
      : Array.isArray(section.groups)
        ? section.groups.some((group) => group.items.length > 0)
        : false,
  );

  return (
    <section className="pos-wizard__card pos-catalog-browser pos-retail-browser">
      <div className="pos-retail-browser__layout">
        <aside className="pos-retail-browser__rail">
          <div className="pos-retail-browser__rail-header">
            <p className="modal__meta">Departments</p>
            <h3>Point of sale</h3>
          </div>
          <div className="pos-retail-browser__rail-search">
            <p className="modal__meta pos-retail-browser__rail-search-label">
              Need something specific?
            </p>
            <button
              className="btn pos-retail-browser__search-trigger"
              type="button"
              onClick={openSearchDialog}
            >
              <span
                className="pos-retail-browser__search-trigger-icon"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </span>
              <span>Search</span>
            </button>
            <p className="modal__meta pos-retail-browser__rail-search-copy">
              Open a quick search dialog and add the item directly from there.
            </p>
          </div>
          <div
            className="pos-retail-browser__rail-list"
            role="tablist"
            aria-label="POS departments"
          >
            {departments.map((department) => (
              <button
                key={department.id}
                type="button"
                role="tab"
                aria-selected={activeTab === department.id}
                className={`pos-retail-browser__rail-button ${activeTab === department.id ? "is-active" : ""}`}
                onClick={() => setActiveTab(department.id)}
              >
                <span className="pos-retail-browser__rail-label">
                  {department.label}
                </span>
                <span className="pos-retail-browser__rail-description">
                  {department.description}
                </span>
                <span className="pos-retail-browser__rail-count">
                  {departmentCounts?.[department.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="pos-retail-browser__workspace">
          <div className="pos-retail-browser__toolbar">
            <div className="pos-retail-browser__toolbar-head">
              <div>
                <p className="modal__meta">Browse</p>
                <h3>
                  {departments.find((department) => department.id === activeTab)
                    ?.label || "Catalog"}
                </h3>
                <p className="modal__meta">
                  {departments.find((department) => department.id === activeTab)
                    ?.description || ""}
                </p>
              </div>
              <span className="modal__meta pos-retail-browser__count">
                Showing {activeCount} items
              </span>
            </div>

            {activeTab === "services" && (
              <div className="pos-retail-browser__filters">
                {serviceFilters.map((filter) => (
                  <button
                    key={filter.id}
                    className={`pos-category-chip ${activeServiceType === filter.id ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setActiveServiceType(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}

            {(activeTab === "products" || activeTab === "pos-products") &&
              visibleCategoryOptions.length > 0 &&
              handleVisibleCategoryChange && (
                <div className="pos-retail-browser__filters">
                  <button
                    className={`pos-category-chip ${visibleCategoryId === "all" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => handleVisibleCategoryChange("all")}
                  >
                    All categories
                  </button>
                  {visibleCategoryOptions.map((category) => (
                    <button
                      className={`pos-category-chip ${visibleCategoryId === category.id ? "is-active" : ""}`}
                      type="button"
                      key={category.id}
                      onClick={() => handleVisibleCategoryChange(category.id)}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              )}

            {activeTab === "bookings" && (
              <div className="pos-retail-browser__filters pos-retail-browser__filters--bookings">
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
                <label className="modal__meta pos-retail-browser__date-filter">
                  Booking date
                  <input
                    className="input"
                    type="date"
                    value={bookingDateFilter}
                    onChange={(event) =>
                      setBookingDateFilter(event.target.value)
                    }
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
          </div>

          <div className="pos-catalog-browser__body pos-retail-browser__content">
            {inventoryLoading && (
              <p className="modal__meta">Loading inventory...</p>
            )}

            {activeTab !== "bookings" && topSellerEntries.length > 0 && (
              <section className="pos-top-sellers">
                <div className="pos-top-sellers__header">
                  <div>
                    <p className="modal__meta">Quick access</p>
                    <h4>{topSellersLabel}</h4>
                  </div>
                </div>
                <div className="pos-top-sellers__list">
                  {topSellerEntries.map((entry) => (
                    <article
                      className="pos-top-seller-card"
                      key={entry.id}
                      data-item-family={getItemFamily(entry.type)}
                    >
                      <div className="pos-top-seller-card__body">
                        <div className="pos-top-seller-card__heading">
                          {renderFamilyBadge(getItemFamily(entry.type))}
                          <span className="pos-top-seller-card__sold">
                            {entry.soldQuantity} sold
                          </span>
                        </div>
                        <h5>{entry.title}</h5>
                        {renderTopSellerSubtitle(entry.subtitle)}
                        <strong>{entry.priceLabel}</strong>
                      </div>
                      <button
                        className="btn pos-retail-card__button pos-retail-card__button--primary"
                        type="button"
                        data-item-family={getItemFamily(entry.type)}
                        disabled={entry.isAvailable === false}
                        onClick={() => onAddTopSeller(entry)}
                      >
                        Add
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {activeTab === "all-items" && (
              <>
                {!hasAllItemsResults && !inventoryLoading && (
                  <p className="empty-state">No items match your search.</p>
                )}
                {allItemsSections.map((section) => {
                  const hasItems =
                    Array.isArray(section.items) && section.items.length > 0;
                  const hasGroups =
                    Array.isArray(section.groups) &&
                    section.groups.some((group) => group.items.length > 0);
                  if (!hasItems && !hasGroups) return null;

                  return (
                    <section
                      className="pos-department-section"
                      key={section.id}
                    >
                      <div className="pos-department-section__header">
                        <div>
                          <p className="modal__meta">{section.description}</p>
                          <h4>{section.label}</h4>
                        </div>
                        <button
                          className="btn btn--secondary btn--small"
                          type="button"
                          onClick={() => openDepartment(section.departmentId)}
                        >
                          Open {section.label}
                        </button>
                      </div>

                      {hasItems && (
                        <div className="pos-grid pos-grid--dense">
                          {section.id === "products" &&
                            section.items.map(renderProductCard)}
                          {section.id === "pos-products" &&
                            section.items.map(renderPosOnlyCard)}
                        </div>
                      )}

                      {hasGroups && (
                        <div className="pos-service-stack">
                          {section.groups.map((group) => {
                            if (group.items.length === 0) return null;
                            return (
                              <section
                                className="pos-service-group"
                                key={group.id}
                              >
                                <div className="pos-service-group__header">
                                  <div>
                                    <p className="modal__meta">Services</p>
                                    <h5>{group.label}</h5>
                                  </div>
                                  <button
                                    className="btn btn--secondary btn--small"
                                    type="button"
                                    onClick={() =>
                                      openDepartment("services", group.id)
                                    }
                                  >
                                    Show all
                                  </button>
                                </div>
                                <div className="pos-grid pos-grid--dense">
                                  {group.id === "workshop" &&
                                    group.items.map(renderWorkshopCard)}
                                  {group.id === "class" &&
                                    group.items.map(renderClassCard)}
                                  {group.id === "event" &&
                                    group.items.map(renderEventCard)}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </>
            )}

            {activeTab === "products" && (
              <>
                {filteredProducts.length === 0 && !inventoryLoading && (
                  <p className="empty-state">
                    No products match your search or selected category.
                  </p>
                )}
                <div className="pos-grid pos-grid--dense">
                  {filteredProducts.map(renderProductCard)}
                </div>
              </>
            )}

            {activeTab === "pos-products" && (
              <>
                {filteredPosProducts.length === 0 && !inventoryLoading && (
                  <p className="empty-state">
                    No POS-only items match your search or selected category.
                  </p>
                )}
                <div className="pos-grid pos-grid--dense">
                  {filteredPosProducts.map(renderPosOnlyCard)}
                </div>
              </>
            )}

            {activeTab === "services" && (
              <>
                {serviceSections.every(
                  (section) => section.items.length === 0,
                ) &&
                  !inventoryLoading && (
                    <p className="empty-state">
                      No services match your search.
                    </p>
                  )}
                <div className="pos-service-stack">
                  {serviceSections.map((section) => (
                    <section className="pos-service-group" key={section.id}>
                      <div className="pos-service-group__header">
                        <div>
                          <p className="modal__meta">{section.description}</p>
                          <h4>{section.label}</h4>
                        </div>
                        <span className="modal__meta">
                          {section.items.length} items
                        </span>
                      </div>

                      <div className="pos-grid pos-grid--dense">
                        {section.id === "workshop" &&
                          section.items.map(renderWorkshopCard)}
                        {section.id === "class" &&
                          section.items.map(renderClassCard)}
                        {section.id === "event" &&
                          section.items.map(renderEventCard)}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}

            {activeTab === "bookings" && (
              <>
                {bookingError && (
                  <p className="admin-panel__error">{bookingError}</p>
                )}
                <div className="pos-grid pos-grid--bookings">
                  {(bookingTab === "workshop"
                    ? filteredWorkshopBookings
                    : filteredCutFlowerBookings
                  ).map((booking) =>
                    renderBookingCard(
                      booking,
                      bookingTab === "workshop" ? "workshop" : "cut-flower",
                    ),
                  )}
                </div>
                {bookingTab === "workshop" &&
                  filteredWorkshopBookings.length === 0 && (
                    <p className="empty-state">
                      No open workshop bookings for this date.
                    </p>
                  )}
                {bookingTab === "cut-flower" &&
                  filteredCutFlowerBookings.length === 0 && (
                    <p className="empty-state">
                      No open cut flower bookings for this date.
                    </p>
                  )}
              </>
            )}
          </div>
        </div>
      </div>

      {isSearchDialogOpen && (
        <div
          className="modal is-active admin-modal pos-retail-search-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-search-dialog-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeSearchDialog();
            }
          }}
        >
          <div className="modal__content pos-retail-search-dialog">
            <button
              className="modal__close"
              type="button"
              onClick={closeSearchDialog}
              aria-label="Close search"
            >
              &times;
            </button>

            <div className="pos-retail-search-dialog__header">
              <div>
                <p className="modal__meta">Quick add</p>
                <h3 className="modal__title" id="pos-search-dialog-title">
                  {searchDialogTitle}
                </h3>
                <p className="modal__meta">{searchDialogDescription}</p>
              </div>
            </div>

            <div className="pos-retail-search-dialog__search-row">
              <label className="modal__meta pos-retail-search-dialog__search-field">
                Search
                <input
                  autoFocus
                  className="input pos-search"
                  type="search"
                  placeholder={searchDialogPlaceholder}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
              {isSearchActive && (
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => setSearchTerm("")}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="pos-retail-search-dialog__summary">
              <span className="modal__meta">
                {isSearchActive
                  ? "Matching results below. Select the item exactly as you would from the browse area."
                  : "Suggested items from the current section are shown below."}
              </span>
            </div>

            <div className="pos-retail-search-dialog__results">
              {activeTab === "all-items" && (
                <>
                  {!hasAllItemsResults && !inventoryLoading && (
                    <p className="empty-state">No items match this search.</p>
                  )}
                  {allItemsSections.map((section) => {
                    const hasItems =
                      Array.isArray(section.items) && section.items.length > 0;
                    const hasGroups =
                      Array.isArray(section.groups) &&
                      section.groups.some((group) => group.items.length > 0);
                    if (!hasItems && !hasGroups) return null;

                    return (
                      <section
                        className="pos-retail-search-dialog__section"
                        key={`search-${section.id}`}
                      >
                        <div className="pos-retail-search-dialog__section-header">
                          <div>
                            <p className="modal__meta">{section.description}</p>
                            <h4>{section.label}</h4>
                          </div>
                        </div>

                        {hasItems && (
                          <div className="pos-grid pos-grid--dense">
                            {section.id === "products" &&
                              section.items.map((item) =>
                                renderProductCard(item, {
                                  onAfterAdd: closeSearchDialog,
                                }),
                              )}
                            {section.id === "pos-products" &&
                              section.items.map((item) =>
                                renderPosOnlyCard(item, {
                                  onAfterAdd: closeSearchDialog,
                                }),
                              )}
                          </div>
                        )}

                        {hasGroups && (
                          <div className="pos-service-stack">
                            {section.groups.map((group) => {
                              if (group.items.length === 0) return null;
                              return (
                                <section
                                  className="pos-service-group"
                                  key={`search-${group.id}`}
                                >
                                  <div className="pos-service-group__header">
                                    <div>
                                      <p className="modal__meta">Services</p>
                                      <h5>{group.label}</h5>
                                    </div>
                                  </div>
                                  <div className="pos-grid pos-grid--dense">
                                    {group.id === "workshop" &&
                                      group.items.map((item) =>
                                        renderWorkshopCard(item, {
                                          onAfterAdd: closeSearchDialog,
                                        }),
                                      )}
                                    {group.id === "class" &&
                                      group.items.map((item) =>
                                        renderClassCard(item, {
                                          onAfterAdd: closeSearchDialog,
                                        }),
                                      )}
                                    {group.id === "event" &&
                                      group.items.map((item) =>
                                        renderEventCard(item, {
                                          onAfterAdd: closeSearchDialog,
                                        }),
                                      )}
                                  </div>
                                </section>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </>
              )}

              {activeTab === "products" && (
                <>
                  {visibleProductResults.length === 0 && !inventoryLoading && (
                    <p className="empty-state">
                      No products match this search.
                    </p>
                  )}
                  {visibleProductResults.length > 0 && (
                    <div className="pos-grid pos-grid--dense">
                      {visibleProductResults.map((product) =>
                        renderProductCard(product, {
                          onAfterAdd: closeSearchDialog,
                        }),
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === "pos-products" && (
                <>
                  {visiblePosProductResults.length === 0 &&
                    !inventoryLoading && (
                      <p className="empty-state">
                        No POS-only items match this search.
                      </p>
                    )}
                  {visiblePosProductResults.length > 0 && (
                    <div className="pos-grid pos-grid--dense">
                      {visiblePosProductResults.map((product) =>
                        renderPosOnlyCard(product, {
                          onAfterAdd: closeSearchDialog,
                        }),
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === "services" && (
                <>
                  {visibleServiceSections.length === 0 && !inventoryLoading && (
                    <p className="empty-state">
                      No services match this search.
                    </p>
                  )}
                  {visibleServiceSections.map((section) => (
                    <section
                      className="pos-retail-search-dialog__section"
                      key={`search-${section.id}`}
                    >
                      <div className="pos-retail-search-dialog__section-header">
                        <div>
                          <p className="modal__meta">{section.description}</p>
                          <h4>{section.label}</h4>
                        </div>
                      </div>
                      <div className="pos-grid pos-grid--dense">
                        {section.id === "workshop" &&
                          section.items.map((item) =>
                            renderWorkshopCard(item, {
                              onAfterAdd: closeSearchDialog,
                            }),
                          )}
                        {section.id === "class" &&
                          section.items.map((item) =>
                            renderClassCard(item, {
                              onAfterAdd: closeSearchDialog,
                            }),
                          )}
                        {section.id === "event" &&
                          section.items.map((item) =>
                            renderEventCard(item, {
                              onAfterAdd: closeSearchDialog,
                            }),
                          )}
                      </div>
                    </section>
                  ))}
                </>
              )}

              {activeTab === "bookings" && (
                <>
                  {bookingTab === "workshop" &&
                    visibleWorkshopBookingResults.length === 0 &&
                    !inventoryLoading && (
                      <p className="empty-state">
                        No workshop bookings match this search.
                      </p>
                    )}
                  {bookingTab === "cut-flower" &&
                    visibleCutFlowerBookingResults.length === 0 &&
                    !inventoryLoading && (
                      <p className="empty-state">
                        No cut flower bookings match this search.
                      </p>
                    )}
                  {bookingTab === "workshop" &&
                    visibleWorkshopBookingResults.length > 0 && (
                      <div className="pos-grid pos-grid--dense">
                        {visibleWorkshopBookingResults.map((booking) =>
                          renderBookingCard(booking, "workshop", {
                            onAfterAction: closeSearchDialog,
                          }),
                        )}
                      </div>
                    )}
                  {bookingTab === "cut-flower" &&
                    visibleCutFlowerBookingResults.length > 0 && (
                      <div className="pos-grid pos-grid--dense">
                        {visibleCutFlowerBookingResults.map((booking) =>
                          renderBookingCard(booking, "cut-flower", {
                            onAfterAction: closeSearchDialog,
                          }),
                        )}
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default PosCatalogBrowser;
