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
  },
  {
    id: "workshop-sep-13",
    title: "Botanical Faith Journaling",
    description:
      "Learn to press, preserve, and journal with blooms while creating keepsake spreads for your devotional practice.",
    scheduledFor: "2025-09-13T10:00:00+02:00",
    price: 550,
    location: "Vereeniging Studio",
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
