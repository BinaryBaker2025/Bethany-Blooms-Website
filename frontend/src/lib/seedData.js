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
  },
  {
    id: "workshop-sep-13",
    title: "Botanical Faith Journaling",
    description:
      "Learn to press, preserve, and journal with blooms while creating keepsake spreads for your devotional practice.",
    scheduledFor: "2025-09-13T10:00:00+02:00",
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

export async function seedSampleData(db) {
  const seededProducts = await seedCollectionIfEmpty(db, "products", PRODUCT_SEED);
  const seededWorkshops = await seedCollectionIfEmpty(db, "workshops", WORKSHOP_SEED);
  return { seededProducts, seededWorkshops };
}
