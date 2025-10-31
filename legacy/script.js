const STORAGE_KEY = "bethany-blooms-cart";

const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const state = {
  cart: [],
  testimonialIndex: 0,
  testimonialInterval: null,
};

function loadCart() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    state.cart = stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn("Unable to read cart from storage", error);
    state.cart = [];
  }
  updateCartBadge();
}

function saveCart() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
}

function updateCartBadge() {
  const count = state.cart.reduce((total, item) => total + item.quantity, 0);
  const badges = qsa(".cart-count");
  badges.forEach((badge) => {
    badge.textContent = count;
    badge.setAttribute("aria-label", `${count} items in cart`);
  });
}

function addToCart(item) {
  const existing = state.cart.find((cartItem) => cartItem.id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ ...item, quantity: 1 });
  }
  saveCart();
  updateCartBadge();
  renderCartItems();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  saveCart();
  updateCartBadge();
  renderCartItems();
}

function renderCartItems() {
  const modal = qs("#cart-modal");
  if (!modal) return;

  const list = qs(".modal__list", modal);
  const empty = qs(".empty-state", modal);
  const total = qs("[data-cart-total]", modal);

  if (!list || !empty || !total) return;

  list.innerHTML = "";

  if (state.cart.length === 0) {
    empty.classList.remove("hidden");
    total.textContent = "R0";
    return;
  }

  empty.classList.add("hidden");

  const fragment = document.createDocumentFragment();
  let runningTotal = 0;

  state.cart.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${item.name} <span class="badge">x${item.quantity}</span></span>
      <span>
        R${item.price * item.quantity}
        <button class="remove-btn" data-remove-id="${item.id}" aria-label="Remove ${item.name} from cart">Remove</button>
      </span>
    `;
    runningTotal += item.price * item.quantity;
    fragment.appendChild(li);
  });

  list.appendChild(fragment);
  total.textContent = `R${runningTotal}`;
}

function setupCart() {
  loadCart();
  renderCartItems();

  qsa("[data-add-to-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      const { productId, name, price } = button.dataset;
      if (!productId || !name || !price) return;
      addToCart({ id: productId, name, price: Number(price) });
      openModal("#cart-modal");
    });
  });

  const cartButtons = qsa("[data-toggle-cart]");
  cartButtons.forEach((button) => {
    button.addEventListener("click", () => openModal("#cart-modal"));
  });

  const modal = qs("#cart-modal");
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal("#cart-modal");
    });

    modal.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-id]");
      if (!button) return;
      const id = button.dataset.removeId;
      removeFromCart(id);
    });
  }
}

function openModal(selector) {
  const modal = qs(selector);
  if (!modal) return;
  modal.classList.add("is-active");
  modal.setAttribute("aria-hidden", "false");
  const closeBtn = qs("[data-close-modal]", modal);
  if (closeBtn) {
    closeBtn.focus({ preventScroll: true });
  }
}

function closeModal(selector) {
  const modal = qs(selector);
  if (!modal) return;
  modal.classList.remove("is-active");
  modal.setAttribute("aria-hidden", "true");
}

function setupModals() {
  qsa("[data-modal-target]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const { modalTarget } = trigger.dataset;
      if (modalTarget) {
        openModal(modalTarget);
      }
    });
  });

  qsa(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal && modal.id) {
        closeModal(`#${modal.id}`);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      qsa(".modal.is-active").forEach((modal) => closeModal(`#${modal.id}`));
      const lightbox = qs(".lightbox.is-active");
      if (lightbox) {
        lightbox.classList.remove("is-active");
        lightbox.setAttribute("aria-hidden", "true");
      }
    }
  });

  qsa("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = button.closest(".modal");
      if (modal && modal.id) {
        closeModal(`#${modal.id}`);
      }
    });
  });
}

function initNavigation() {
  const toggle = qs("[data-menu-toggle]");
  const links = qs("[data-nav-links]");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  links.addEventListener("click", (event) => {
    if (event.target.matches("a")) {
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function initFadeInObserver() {
  const elements = qsa(".fade-in");
  if (!elements.length || "IntersectionObserver" in window === false) {
    elements.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
    },
  );

  elements.forEach((el) => observer.observe(el));
}

function initParallax() {
  const parallaxElements = qsa("[data-parallax]");
  if (!parallaxElements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.dataset.inView = "true";
        } else {
          entry.target.dataset.inView = "false";
        }
      });
    },
    {
      threshold: 0,
    },
  );

  parallaxElements.forEach((element) => observer.observe(element));

  window.addEventListener("scroll", () => {
    const scrollTop = window.pageYOffset;
    parallaxElements.forEach((element) => {
      if (element.dataset.inView !== "true") return;
      const speed = Number(element.dataset.parallax) || 0.3;
      element.style.backgroundPositionY = `${scrollTop * speed}px`;
    });
  });
}

function initTestimonials() {
  const container = qs("[data-testimonials]");
  if (!container) return;

  const items = qsa("[data-testimonial-item]", container);
  const dots = qsa("[data-testimonial-dot]", container);
  if (!items.length) return;

  function show(index) {
    state.testimonialIndex = index;
    items.forEach((item, idx) => {
      item.classList.toggle("is-active", idx === index);
    });
    dots.forEach((dot, idx) => {
      dot.setAttribute("aria-pressed", idx === index ? "true" : "false");
    });
  }

  function next() {
    const index = (state.testimonialIndex + 1) % items.length;
    show(index);
  }

  dots.forEach((dot, idx) => {
    dot.addEventListener("click", () => {
      show(idx);
      restartInterval();
    });
  });

  function restartInterval() {
    if (state.testimonialInterval) {
      window.clearInterval(state.testimonialInterval);
    }
    state.testimonialInterval = window.setInterval(next, 6500);
  }

  show(0);
  restartInterval();
}

function initLightbox() {
  const lightbox = qs("#lightbox");
  if (!lightbox) return;

  const image = qs(".lightbox__image", lightbox);
  const closeButton = qs("[data-close-lightbox]", lightbox);

  qsa("[data-lightbox]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const src = link.getAttribute("href");
      const alt = link.dataset.alt || "";
      if (image) {
        image.src = src;
        image.alt = alt;
      }
      lightbox.classList.add("is-active");
      lightbox.setAttribute("aria-hidden", "false");
    });
  });

  [closeButton, lightbox].forEach((element) => {
    if (!element) return;
    element.addEventListener("click", (event) => {
      if (event.target === lightbox || event.target === closeButton) {
        lightbox.classList.remove("is-active");
        lightbox.setAttribute("aria-hidden", "true");
      }
    });
  });
}

function initSmoothScroll() {
  qsa('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (event) {
      const targetId = this.getAttribute("href").slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
  initNavigation();
  initFadeInObserver();
  initParallax();
  initTestimonials();
  initLightbox();
  initSmoothScroll();
  setupModals();
  setupCart();
});
