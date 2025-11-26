import {
  collection,
  doc,
  getCountFromServer,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const PRODUCT_SEED = [
  {
    id: "kit-yellow",
    name: "Yellow & White Pressed Flower Kit",
    title: "Yellow & White",
    description: "Sunlit hues mixed with airy neutrals for joyful, uplifting displays.",
    price: 400,
    category: "kit",
  },
  {
    id: "kit-red",
    name: "Red & White Pressed Flower Kit",
    title: "Red & White",
    description: "Romantic tones paired with delicate whites for heartfelt gifting moments.",
    price: 400,
    category: "kit",
  },
  {
    id: "market-buckets",
    name: "Market Buckets",
    title: "Market Buckets",
    description: "DIY buckets packed with 40–50 fresh stems for creative gatherings.",
    price: "From R600",
    category: "cut-flower",
  },
  {
    id: "seasonal-bouquet",
    name: "Seasonal Signature Bouquets",
    title: "Seasonal Bouquet",
    description: "Hand-tied bouquets featuring the best blooms of the week from local growers.",
    price: "From R350",
    category: "cut-flower",
  },
];

const WORKSHOP_SEED = [
  {
    id: "workshop-aug-02",
    title: "Pressed Bloom Storytelling",
    description:
      "Craft a framed pressed-flower artwork alongside guided prayer and seasonal refreshments in our Vereeniging studio.",
    scheduledFor: "2025-08-02T10:00:00+02:00",
    primarySessionId: "session-aug02-morning",
    price: 650,
    location: "Vereeniging Studio",
    whatToExpect:
      "Enjoy a fun, 3-hour session creating your own pressed flower artwork — no experience needed!\n- Flowers: Use as many preserved blooms as will fit in your frame.\n- Frames: Choose from A5, A4, or A3 sizes.\n- Create & Frame: Arrange, glue, and leave with framed art.\n- Supportive Team: We’re here to help as much as you need.",
    bookingPricing:
      "- A5 Frame: R350\n- A4 Frame: R550\n- A3 Frame: R650\n(Choose your frame at the venue.)",
    goodToKnow:
      "- Cashless studio: Card & EFT only.\n- Children 5+ welcome; must remain seated.\n- Water bottles allowed; no outside food.\n- No pets or toddlers; nursing infants welcome.",
    cancellations: "- Cancel 48 hours in advance to avoid a R250 no-show fee.",
    groupsInfo:
      "We host up to 14 guests per session. Planning a birthday, bridal shower, or team day? Book like a regular class and we’ll make it special!",
    careInfo:
      "- Keep art out of direct sunlight.\n- Avoid damp spaces.\n- Frames are sealed and ready to display.",
    whyPeopleLove:
      "More than just an art class—it’s a chance to pause, connect, and make something meaningful with your own hands.",
    ctaNote: "Book today to reserve your seat!",
    sessions: [
      {
        id: "session-aug02-morning",
        label: "Saturday 2 August · 10:00",
        start: "2025-08-02T10:00:00+02:00",
        date: "2025-08-02",
        time: "10:00",
        capacity: 14,
      },
      {
        id: "session-aug02-afternoon",
        label: "Saturday 2 August · 14:30",
        start: "2025-08-02T14:30:00+02:00",
        date: "2025-08-02",
        time: "14:30",
        capacity: 14,
      },
    ],
  },
  {
    id: "workshop-sep-13",
    title: "Botanical Faith Journaling",
    description:
      "Learn to press, preserve, and journal with blooms while creating keepsake spreads for your devotional practice.",
    scheduledFor: "2025-09-13T10:00:00+02:00",
    primarySessionId: "session-sep13-morning",
    price: 550,
    location: "Vereeniging Studio",
    whatToExpect:
      "Create a botanical journal spread while reflecting on scripture and seasonal blooms.\n- Guided devotion time.\n- Press, style, and write.\n- Leave with a keepsake journal kit.",
    bookingPricing: "- Full Workshop: R550 (journal + materials included)",
    goodToKnow:
      "- Cashless studio\n- Bring your favourite pen (optional)\n- All blooms supplied",
    cancellations: "- Cancel 48 hours in advance to avoid a R250 no-show fee.",
    groupsInfo:
      "Perfect for Bible studies and creative groups. For private bookings, chat with us and we’ll tailor the experience.",
    careInfo: "- Store journals flat and away from moisture.\n- Keep pressed blooms out of direct sun.",
    whyPeopleLove:
      "A restorative space to blend creativity and faith while crafting keepsakes you’ll revisit often.",
    ctaNote: "Reserve your journal seat today!",
    sessions: [
      {
        id: "session-sep13-morning",
        label: "Saturday 13 September · 10:00",
        start: "2025-09-13T10:00:00+02:00",
        date: "2025-09-13",
        time: "10:00",
        capacity: 12,
      },
      {
        id: "session-sep14-evening",
        label: "Sunday 14 September · 17:00",
        start: "2025-09-14T17:00:00+02:00",
        date: "2025-09-14",
        time: "17:00",
        capacity: 12,
      },
    ],
  },
];

const EVENTS_SEED = [
  {
    id: "event-market-pop-up",
    title: "Spring Pop-up & Bouquet Bar",
    description: "Meet Bethany Blooms at the Riverside Market for bouquet bars, mini installs, and live demos.",
    location: "Riverside Market, Johannesburg",
    eventDate: "2025-09-20T10:00:00+02:00",
    status: "live",
    workshopId: "workshop-aug-02",
    workshopTitle: "Pressed Bloom Storytelling",
  },
];

const CUT_FLOWER_CLASSES_SEED = [
  {
    id: "cutclass-summer-bouquets",
    title: "Summer Bouquets 101",
    description: "Learn colour pairing, stem prep, and bouquet wrapping in a relaxed studio setting.",
    location: "Bethany Blooms Studio",
    price: 450,
    capacity: 12,
    eventDate: "2025-09-10T18:30:00+02:00",
    status: "live",
  },
];

const CUT_FLOWER_BOOKINGS_SEED = [
  {
    id: "cutbooking-demo-1",
    customerName: "Demo Client",
    email: "demo@bethanyblooms.co.za",
    phone: "+27 74 123 4567",
    occasion: "Brand launch florals",
    location: "Johannesburg CBD",
    budget: "R5 000",
    notes: "Seeded booking for testing the admin dashboard.",
    status: "new",
    eventDate: "2025-09-15T10:00:00+02:00",
  },
];

const BOOKINGS_SEED = [
  {
    id: "booking-demo-1",
    name: "Workshop Guest",
    email: "guest@bethanyblooms.co.za",
    phone: "+27 74 000 0000",
    frame: "A4 Frame",
    notes: "Seeded booking linked to a demo order.",
    sessionDate: "2025-08-02",
    sessionLabel: "Saturday 2 August · 10:00",
    workshopId: "workshop-aug-02",
    orderId: "order-demo-1",
    paid: false,
    status: "new",
  },
];

const ORDERS_SEED = [
  {
    id: "order-demo-1",
    orderNumber: 1001,
    customer: {
      fullName: "Demo Customer",
      email: "demo@bethanyblooms.co.za",
      phone: "+27 74 000 0000",
      address: "123 Demo Street, Vereeniging",
    },
    items: [
      {
        id: "item-kit-yellow",
        name: "Yellow & White",
        quantity: 1,
        price: 400,
        metadata: { type: "product", productId: "kit-yellow" },
      },
      {
        id: "item-workshop-aug02",
        name: "Pressed Bloom Storytelling",
        quantity: 1,
        price: 650,
        metadata: {
          type: "workshop",
          workshopId: "workshop-aug-02",
          sessionDate: "2025-08-02",
          sessionLabel: "Saturday 2 August · 10:00",
          location: "Vereeniging Studio",
          framePreference: "A4",
        },
      },
    ],
    totalPrice: 1050,
    status: "pending",
    paymentStatus: "awaiting",
    deliveryMethod: "collection",
    trackingLink: "",
  },
];

async function seedCollectionIfEmpty(db, collectionName, seedData) {
  const colRef = collection(db, collectionName);
  const count = await getCountFromServer(colRef);
  if (count.data().count > 0) return false;

  await Promise.all(
    seedData.map(async (entry) => {
      const docRef = doc(colRef, entry.id);
      const { id: _unused, ...rest } = entry;
      await setDoc(docRef, {
        ...rest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }),
  );
  return true;
}

export async function seedAllCollections(db) {
  const seededProducts = await seedCollectionIfEmpty(db, "products", PRODUCT_SEED);
  const seededWorkshops = await seedCollectionIfEmpty(db, "workshops", WORKSHOP_SEED);
  const seededEvents = await seedCollectionIfEmpty(db, "events", EVENTS_SEED);
  const seededCutFlowerClasses = await seedCollectionIfEmpty(db, "cutFlowerClasses", CUT_FLOWER_CLASSES_SEED);
  const seededCutFlowerBookings = await seedCollectionIfEmpty(db, "cutFlowerBookings", CUT_FLOWER_BOOKINGS_SEED);
  const seededBookings = await seedCollectionIfEmpty(db, "bookings", BOOKINGS_SEED);
  const seededOrders = await seedCollectionIfEmpty(db, "orders", ORDERS_SEED);

  return {
    seededProducts,
    seededWorkshops,
    seededEvents,
    seededCutFlowerClasses,
    seededCutFlowerBookings,
    seededBookings,
    seededOrders,
  };
}

export async function seedSampleData(db) {
  return seedAllCollections(db);
}
