import { useState, useRef, useLayoutEffect } from "react";

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
  onCheckIn,
  bookingSavingId,
  bookingError,
  workshopLookup,
  cutFlowerOptions,
  cutFlowerOptionPriceMap,
  eventSelections,
  setEventSelections,
  serviceSections,
  formatCurrency,
  onAddProduct,
  onAddPosProduct,
  onAddWorkshop,
  onAddClass,
  onAddEvent,
}) {
  const visibleCategoryOptions =
    activeTab === "products" ? categoryOptions : [];
  const visibleCategoryId =
    activeTab === "products" ? activeCategoryId : "all";
  const handleVisibleCategoryChange =
    activeTab === "products" ? setActiveCategoryId : null;
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [variantDialog, setVariantDialog] = useState(null);
  const [serviceDialog, setServiceDialog] = useState(null);
  const [posCategoryPill, setPosCategoryPill] = useState("all");
  const catalogBodyRef = useRef(null);

  useLayoutEffect(() => {
    const el = catalogBodyRef.current;
    if (!el) return;
    const grids = el.querySelectorAll(".pos-grid--dense");
    grids.forEach((grid) => {
      grid.style.gridAutoRows = "";
      const cards = [...grid.querySelectorAll(".pos-item-card")];
      if (cards.length < 2) return;
      const max = Math.max(...cards.map((c) => c.getBoundingClientRect().height));
      if (max > 0) grid.style.gridAutoRows = `${max}px`;
    });
  });

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

  const renderProductCard = (product, renderOptions = null) => {
    const family = getItemFamily("product");
    const onAfterAdd = renderOptions?.onAfterAdd;
    const hasVariants = product.variants.length > 0;
    const canAdd = hasVariants
      ? product.variants.some((v) => v.stockStatus?.state !== "out")
      : product.stockStatus?.state !== "out";

    const productThumb = Array.isArray(product.images) && product.images[0]
      ? product.images[0]
      : product.imageUrl || null;

    let priceLabel;
    if (hasVariants) {
      const prices = product.variants.filter((v) => Number.isFinite(v.price)).map((v) => v.price);
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        priceLabel = min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
      } else {
        priceLabel = product.displayPrice;
      }
    } else {
      priceLabel = Number.isFinite(product.numericPrice) ? formatCurrency(product.numericPrice) : product.displayPrice;
    }

    return (
      <article
        className="pos-item-card pos-retail-card"
        key={product.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__image">
          {productThumb
            ? <img src={productThumb} alt={product.name} loading="lazy" decoding="async" />
            : <span className="pos-retail-card__letter" aria-hidden="true">{product.name.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="pos-retail-card__body">
          {renderFamilyBadge(family)}
          <h4>{product.name}</h4>
        </div>
        <div className="pos-retail-card__actions">
          <div className="pos-retail-card__price-row">
            <strong>{priceLabel}</strong>
          </div>
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            disabled={!canAdd}
            onClick={() => {
              if (hasVariants) {
                setVariantDialog({ product, onAfterAdd });
              } else {
                onAddProduct(product, { variantId: null });
                onAfterAdd?.();
              }
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
        <div className="pos-retail-card__image">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" />
            : <span className="pos-retail-card__letter" aria-hidden="true">{product.name.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="pos-retail-card__body">
          {renderFamilyBadge(family)}
          <h4>{product.name}</h4>
        </div>
        <div className="pos-retail-card__actions">
          <div className="pos-retail-card__price-row">
            <strong>{product.displayPrice}</strong>
          </div>
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
    const thumb = workshop.image || workshop.imageUrl || null;
    const hasConfig = workshop.sessions.length > 0 || workshop.options.length > 0;

    return (
      <article
        className="pos-item-card pos-retail-card pos-retail-card--service"
        key={workshop.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__image">
          {thumb
            ? <img src={thumb} alt={workshop.title} loading="lazy" decoding="async" />
            : <span className="pos-retail-card__letter" aria-hidden="true">{(workshop.title || "W").charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="pos-retail-card__body">
          {renderFamilyBadge(family)}
          <h4>{workshop.title}</h4>
        </div>
        <div className="pos-retail-card__actions">
          <div className="pos-retail-card__price-row">
            <strong>{workshop.displayPrice}</strong>
          </div>
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            onClick={() => {
              if (hasConfig) {
                setServiceDialog({
                  type: "workshop",
                  item: workshop,
                  sessionId: workshop.sessions[0]?.id || null,
                  optionId: workshop.options[0]?.id || null,
                  onAfterAdd,
                });
              } else {
                onAddWorkshop(workshop, { sessionId: null, optionId: null });
                onAfterAdd?.();
              }
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
    const thumb = classDoc.image || classDoc.imageUrl || null;
    const hasConfig = classDoc.slots.length > 0 || classDoc.options.length > 0;

    return (
      <article
        className="pos-item-card pos-retail-card pos-retail-card--service"
        key={classDoc.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__image">
          {thumb
            ? <img src={thumb} alt={classDoc.title} loading="lazy" decoding="async" />
            : <span className="pos-retail-card__letter" aria-hidden="true">{(classDoc.title || "C").charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="pos-retail-card__body">
          {renderFamilyBadge(family)}
          <h4>{classDoc.title}</h4>
        </div>
        <div className="pos-retail-card__actions">
          <div className="pos-retail-card__price-row">
            <strong>{classDoc.displayPrice}</strong>
          </div>
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            onClick={() => {
              if (hasConfig) {
                setServiceDialog({
                  type: "class",
                  item: classDoc,
                  slotId: classDoc.slots[0]?.id || null,
                  optionId: classDoc.options[0]?.id || null,
                  onAfterAdd,
                });
              } else {
                onAddClass(classDoc, { slotId: null, optionId: null });
                onAfterAdd?.();
              }
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
    const thumb = event.image || event.imageUrl || null;
    const hasConfig = event.slots.length > 0;

    return (
      <article
        className="pos-item-card pos-retail-card pos-retail-card--service"
        key={event.id}
        data-item-family={family}
      >
        <div className="pos-retail-card__image">
          {thumb
            ? <img src={thumb} alt={event.title} loading="lazy" decoding="async" />
            : <span className="pos-retail-card__letter" aria-hidden="true">{(event.title || "E").charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="pos-retail-card__body">
          {renderFamilyBadge(family)}
          <h4>{event.title}</h4>
        </div>
        <div className="pos-retail-card__actions">
          <div className="pos-retail-card__price-row">
            <strong>{event.displayPrice}</strong>
          </div>
          <button
            className="btn pos-retail-card__button pos-retail-card__button--primary"
            type="button"
            data-item-family={family}
            onClick={() => {
              if (hasConfig) {
                setServiceDialog({
                  type: "event",
                  item: event,
                  slotId: event.slots[0]?.id || null,
                  onAfterAdd,
                });
              } else {
                onAddEvent(event, { slotId: null });
                onAfterAdd?.();
              }
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

    const workshopThumb = type === "workshop" && workshop?.image ? workshop.image : null;
    const bookingTitle = type === "workshop"
      ? booking.name || booking.email || "Workshop booking"
      : booking.customerName || "Cut flower booking";
    const bookingMeta = type === "workshop"
      ? booking.workshopTitle || "Workshop booking"
      : booking.displayDate;

    const isPaid = booking.paid === true
      || booking.paymentStatus === "paid"
      || booking.adminPaymentStatus === "paid";

    const safeAttendeeCount = Math.max(1, Number.parseInt(editState.attendeeCount, 10) || 1);
    const attendeeFrameSelections = editState.attendeeFrameSelections || [];
    const allAttendeesHaveFrame = !workshopOptionRequired
      || (attendeeFrameSelections.length >= safeAttendeeCount
          && attendeeFrameSelections.slice(0, safeAttendeeCount).every((id) => Boolean(id)));

    const totalFromAttendeeSelections = type === "workshop" && workshop?.options?.length > 0
      ? attendeeFrameSelections.slice(0, safeAttendeeCount).reduce((sum, optionId) => {
          const option = workshop.options.find((o) => o.id === optionId);
          const price = Number(option?.price);
          return Number.isFinite(price) ? sum + price : sum;
        }, 0)
      : null;

    const effectivePriceLabel = totalFromAttendeeSelections > 0
      ? formatCurrency(totalFromAttendeeSelections)
      : priceLabel;

    return (
      <div className="pos-booking-card-shell" key={booking.id}>
        <article
          className="pos-item-card pos-item-card--booking pos-retail-card pos-retail-card--booking"
          data-item-family={family}
        >
          <div className="pos-retail-card__image">
            {workshopThumb
              ? <img src={workshopThumb} alt={bookingMeta} loading="lazy" decoding="async" />
              : <span className="pos-retail-card__letter" aria-hidden="true">{bookingTitle.charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className="pos-item-card__body pos-item-card__body--booking pos-retail-card__body">
            <div className="pos-retail-card__header">
              <div>
                <h4>{bookingTitle}</h4>
                <p className="modal__meta">{bookingMeta}</p>
              </div>
              {renderFamilyBadge(family)}
            </div>
            <div className="pos-retail-card__booking-meta">
              <div className="pos-retail-card__price-row">
                <strong>{effectivePriceLabel}</strong>
                <span className={`pos-booking-payment-badge ${isPaid ? "pos-booking-payment-badge--paid" : "pos-booking-payment-badge--unpaid"}`}>
                  {isPaid ? "Paid" : "Unpaid"}
                </span>
              </div>
              <div className="pos-retail-card__details">
                <div className="pos-retail-card__detail">
                  <span>Date</span>
                  <strong>{booking.displayDate}</strong>
                </div>
                {type === "workshop" && booking.attendeeCount > 0 && (
                  <div className="pos-retail-card__detail">
                    <span>Attendees</span>
                    <strong>{booking.attendeeCount}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pos-item-card__actions pos-item-card__actions--booking pos-retail-card__actions">
            <button
              className={`btn pos-retail-card__button pos-retail-card__button--primary${isPaid ? " pos-booking-checkin-btn" : ""}`}
              type="button"
              data-item-family={family}
              onClick={() => { setActiveBookingEditor(editorKey); onAfterAction?.(); }}
            >
              {isPaid ? "Check In" : "Pay"}
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
                <div className="pos-booking-dialog__header-row">
                  <div>
                    <h3 className="modal__title" id={editorTitleId}>{bookingTitle}</h3>
                    <p className="modal__meta">
                      {type === "workshop"
                        ? booking.workshopTitle || "Workshop booking"
                        : booking.displayDate || "Cut flower booking"}
                    </p>
                  </div>
                  <span className={`pos-booking-payment-badge pos-booking-payment-badge--lg ${isPaid ? "pos-booking-payment-badge--paid" : "pos-booking-payment-badge--unpaid"}`}>
                    {isPaid ? "Paid" : "Unpaid"}
                  </span>
                </div>
              </div>

              <div className="pos-booking-editor">
                <div className="pos-booking-editor__grid">
                  <label className="modal__meta pos-item-card__field">
                    Attendees
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={editState.attendeeCount}
                      onChange={(event) =>
                        handleBookingEditChange(booking, type, "attendeeCount", event.target.value)
                      }
                    />
                  </label>

                  {type === "workshop" && workshop?.options?.length > 0 && (
                    <div className="pos-item-card__field pos-booking-editor__field--full">
                      <span className="modal__meta">Frame size per attendee</span>
                      <div className="pos-attendee-frames">
                        {Array.from({ length: safeAttendeeCount }, (_, index) => {
                          const currentOptionId = attendeeFrameSelections[index] || "";
                          return (
                            <label className="modal__meta pos-attendee-frame-row" key={`${booking.id}-frame-${index}`}>
                              <span className="pos-attendee-frame-row__label">Attendee {index + 1}</span>
                              <select
                                className="input"
                                value={currentOptionId}
                                onChange={(event) =>
                                  handleBookingEditChange(booking, type, "attendeeFrameIndex", { index, optionId: event.target.value })
                                }
                              >
                                <option value="">Select frame</option>
                                {workshop.options.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}{Number.isFinite(option.price) ? ` — ${formatCurrency(option.price)}` : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        })}
                        {totalFromAttendeeSelections > 0 && (
                          <p className="pos-attendee-frames__total modal__meta">
                            Total: <strong>{formatCurrency(totalFromAttendeeSelections)}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {type === "cut-flower" && cutFlowerOptions.length > 0 && (
                    <div className="pos-item-card__field pos-booking-editor__field--full">
                      <span className="modal__meta">Attendee options</span>
                      <div className="pos-attendee-options">
                        {attendeeOptionsForRender.map((optionId, index) => (
                          <label className="modal__meta" key={`${booking.id}-attendee-${index + 1}`}>
                            Attendee {index + 1}
                            <select
                              className="input"
                              value={optionId}
                              onChange={(event) =>
                                handleBookingEditChange(booking, type, "attendeeOptionIndex", { index, optionId: event.target.value })
                              }
                            >
                              {cutFlowerOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}{Number.isFinite(option.price) ? ` - ${formatCurrency(option.price)}` : ""}
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
                    {bookingSavingId === booking.id ? "Saving..." : "Save changes"}
                  </button>
                  {isPaid ? (
                    <button
                      className="btn pos-retail-card__button pos-retail-card__button--primary pos-booking-checkin-btn"
                      type="button"
                      onClick={() => { onCheckIn(booking, type); }}
                    >
                      Check In
                    </button>
                  ) : (
                    <button
                      className="btn pos-retail-card__button pos-retail-card__button--primary"
                      type="button"
                      data-item-family={family}
                      disabled={!allAttendeesHaveFrame}
                      onClick={() => handleAddBookingToCart(booking, type)}
                    >
                      Add to Order
                    </button>
                  )}
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
                aria-selected={activeTab === department.id && (department.id !== "pos-only" || posCategoryPill === "all")}
                className={`pos-retail-browser__rail-button ${activeTab === department.id && (department.id !== "pos-only" || posCategoryPill === "all") ? "is-active" : ""}`}
                onClick={() => {
                  setActiveTab(department.id);
                  if (department.id === "pos-only") setPosCategoryPill("all");
                }}
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
            {posCategoryOptions.length > 0 && posCategoryOptions.map((cat) => (
              <button
                key={`cat-pill-${cat.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === "pos-only" && posCategoryPill === cat.name}
                className={`pos-retail-browser__rail-button pos-retail-browser__rail-button--category ${activeTab === "pos-only" && posCategoryPill === cat.name ? "is-active" : ""}`}
                onClick={() => {
                  setActiveTab("pos-only");
                  setPosCategoryPill(cat.name);
                }}
              >
                <span className="pos-retail-browser__rail-label">{cat.name}</span>
                <span className="pos-retail-browser__rail-count">
                  {filteredPosProducts.filter((p) => p.categoryName === cat.name).length}
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

            {activeTab === "products" &&
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

          <div className="pos-catalog-browser__body pos-retail-browser__content" ref={catalogBodyRef}>
            {inventoryLoading && (
              <p className="modal__meta">Loading inventory...</p>
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

            {activeTab === "pos-only" && (() => {
              const visiblePosItems = posCategoryPill === "all"
                ? filteredPosProducts
                : filteredPosProducts.filter((p) => p.categoryName === posCategoryPill);
              return (
                <>
                  {visiblePosItems.length === 0 && !inventoryLoading && (
                    <p className="empty-state">
                      No POS items match your search.
                    </p>
                  )}
                  <div className="pos-grid pos-grid--dense">
                    {visiblePosItems.map(renderPosOnlyCard)}
                  </div>
                </>
              );
            })()}

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

              {activeTab === "pos-only" && (() => {
                const visiblePosResults = posCategoryPill === "all"
                  ? visiblePosProductResults
                  : visiblePosProductResults.filter((p) => p.categoryName === posCategoryPill);
                return (
                  <>
                    {visiblePosResults.length === 0 && !inventoryLoading && (
                      <p className="empty-state">
                        No POS items match this search.
                      </p>
                    )}
                    {visiblePosResults.length > 0 && (
                      <div className="pos-grid pos-grid--dense">
                        {visiblePosResults.map((product) =>
                          renderPosOnlyCard(product, {
                            onAfterAdd: closeSearchDialog,
                          }),
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

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

      {serviceDialog && (() => {
        const { type, item, onAfterAdd: sdOnAfterAdd } = serviceDialog;
        const sessions = type === "workshop" ? item.sessions : type === "class" ? item.slots : type === "event" ? item.slots : [];
        const options = (type === "workshop" || type === "class") ? item.options : [];
        const selectedSession = sessions.find((s) => s.id === serviceDialog.sessionId) || sessions[0] || null;
        const selectedOption = options.find((o) => o.id === serviceDialog.optionId) || options[0] || null;
        const sessionFull = typeof selectedSession?.capacity === "number" && selectedSession.capacity <= 0;
        const optionPrice = Number.isFinite(selectedOption?.price) ? selectedOption.price : null;
        const attendeeCount = Math.max(1, parseInt(serviceDialog.attendeeCount || "1", 10) || 1);
        const computedPrice = Number.isFinite(optionPrice)
          ? formatCurrency(optionPrice * (type === "workshop" ? attendeeCount : 1))
          : item.displayPrice;
        const canAdd = (sessions.length === 0 || (selectedSession && !sessionFull)) &&
                       (options.length === 0 || selectedOption);
        const eyebrow = type === "workshop" ? "Workshop" : type === "class" ? "Class" : "Event";

        return (
          <div className="pos-variant-overlay" role="presentation" onClick={() => setServiceDialog(null)}>
            <div
              className="pos-variant-dialog pos-service-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`Book ${item.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pos-variant-dialog__header">
                <div>
                  <p className="pos-variant-dialog__eyebrow">{eyebrow}</p>
                  <h3 className="pos-variant-dialog__title">{item.title}</h3>
                </div>
                <button className="pos-variant-dialog__close" type="button" onClick={() => setServiceDialog(null)} aria-label="Close">✕</button>
              </div>
              <div className="pos-service-dialog__body">
                {sessions.length > 0 && (
                  <label className="pos-service-dialog__field">
                    <span className="pos-service-dialog__label">{type === "workshop" ? "Session" : "Time slot"}</span>
                    <select
                      className="input"
                      value={serviceDialog.sessionId || ""}
                      onChange={(e) => setServiceDialog((prev) => ({ ...prev, sessionId: e.target.value }))}
                    >
                      {sessions.map((session) => (
                        <option
                          key={session.id}
                          value={session.id}
                          disabled={typeof session.capacity === "number" && session.capacity <= 0}
                        >
                          {session.label}
                          {typeof session.capacity === "number"
                            ? session.capacity > 0
                              ? ` · ${session.capacity} seat${session.capacity === 1 ? "" : "s"} left`
                              : " · Fully booked"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {options.length > 0 && (
                  <label className="pos-service-dialog__field">
                    <span className="pos-service-dialog__label">{type === "workshop" ? "Frame size" : "Option"}</span>
                    <select
                      className="input"
                      value={serviceDialog.optionId || ""}
                      onChange={(e) => setServiceDialog((prev) => ({ ...prev, optionId: e.target.value }))}
                    >
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}{Number.isFinite(option.price) ? ` · ${formatCurrency(option.price)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {type === "workshop" && (
                  <label className="pos-service-dialog__field">
                    <span className="pos-service-dialog__label">Attendees</span>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={serviceDialog.attendeeCount || "1"}
                      onChange={(e) => setServiceDialog((prev) => ({ ...prev, attendeeCount: e.target.value }))}
                    />
                  </label>
                )}
                <div className="pos-service-dialog__footer">
                  <span className="pos-service-dialog__price">{computedPrice}</span>
                  <button
                    className="btn btn--primary pos-variant-dialog__add pos-service-dialog__add"
                    type="button"
                    disabled={!canAdd}
                    onClick={() => {
                      if (type === "workshop") {
                        onAddWorkshop(item, { sessionId: selectedSession?.id || null, optionId: selectedOption?.id || null, attendeeCount });
                      } else if (type === "class") {
                        onAddClass(item, { slotId: selectedSession?.id || null, optionId: selectedOption?.id || null });
                      } else if (type === "event") {
                        onAddEvent(item, { slotId: selectedSession?.id || null });
                      }
                      sdOnAfterAdd?.();
                      setServiceDialog(null);
                    }}
                  >
                    Add to order
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {variantDialog && (
        <div
          className="pos-variant-overlay"
          role="presentation"
          onClick={() => setVariantDialog(null)}
        >
          <div
            className="pos-variant-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Choose variant for ${variantDialog.product.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-variant-dialog__header">
              <div>
                <p className="pos-variant-dialog__eyebrow">Choose variant</p>
                <h3 className="pos-variant-dialog__title">{variantDialog.product.name}</h3>
              </div>
              <button
                className="pos-variant-dialog__close"
                type="button"
                onClick={() => setVariantDialog(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="pos-variant-dialog__list">
              {variantDialog.product.variants.map((variant) => {
                const isOut = variant.stockStatus?.state === "out";
                const price = Number.isFinite(variant.price)
                  ? formatCurrency(variant.price)
                  : variantDialog.product.displayPrice;
                return (
                  <div
                    key={variant.id}
                    className={`pos-variant-dialog__row${isOut ? " is-out" : ""}`}
                  >
                    <div className="pos-variant-dialog__info">
                      <span className="pos-variant-dialog__label">{variant.label}</span>
                      <span className="pos-variant-dialog__price">{price}</span>
                    </div>
                    <button
                      className="btn btn--primary pos-variant-dialog__add"
                      type="button"
                      disabled={isOut}
                      onClick={() => {
                        onAddProduct(variantDialog.product, { variantId: variant.id });
                        variantDialog.onAfterAdd?.();
                        setVariantDialog(null);
                      }}
                    >
                      {isOut ? "Out of stock" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default PosCatalogBrowser;
