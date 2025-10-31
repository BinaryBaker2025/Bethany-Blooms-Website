import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/hero-flowers.svg";

function CutFlowersPage() {
  usePageMetadata({
    title: "Bethany Blooms Fresh Cut Flowers | Bouquets, Events & Subscriptions",
    description:
      "Order Bethany Blooms fresh cut flowers: seasonal bouquets, event florals, market buckets, and weekly subscriptions in the Vaal Triangle.",
  });

  const {
    items: remoteProducts,
    status,
    isFallback,
  } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const offerings = remoteProducts.filter((item) => (item.category ?? "cut-flower") === "cut-flower");

  const normalizedOfferings = offerings.map((item) => {
    const priceNumber = typeof item.price === "number" ? item.price : Number(item.price);
    return {
      ...item,
      name: item.name || "Bethany Blooms Offering",
      description: item.description || "Details coming soon.",
      priceDisplay: Number.isFinite(priceNumber) ? `R${priceNumber}` : item.price ?? "Price on request",
    };
  });

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero variant="cut" background={heroBackground}>
            <h1>Fresh Cut Flowers, Gathered with Care</h1>
            <p>
              Beyond pressed art, Bethany Blooms offers fresh blooms harvested from trusted farms and our own cutting
              garden. Choose ready-to-style buckets, event packages, or a weekly bouquet subscription.
            </p>
            <div className="cta-group">
              <a className="btn btn--primary" href="#cut-flower-offerings">
                Explore Offerings
              </a>
              <a className="btn btn--secondary" href="/contact">
                Request a Quote
              </a>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section" id="cut-flower-offerings">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Fresh From the Garden</span>
            <h2>Cut Flower Collections</h2>
            <p>
              Thoughtfully chosen colour palettes with supporting foliage and textural stems—ideal for events, gifts, or
              styling your studio.
            </p>
          </Reveal>
          <div className="cards-grid">
            {normalizedOfferings.map((item, index) => (
              <Reveal as="article" className="card" key={item.id} delay={index * 90}>
                <h3 className="card__title">{item.name}</h3>
                <p>{item.description}</p>
                <p className="card__price">{item.priceDisplay}</p>
                <div className="card__actions">
                  <a className="btn btn--secondary" href="/contact">
                    Enquire Now
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedOfferings.length === 0 && status !== "loading" && (
            <p className="empty-state">No cut flower offerings listed yet. Check back again soon.</p>
          )}
          {status === "loading" && <p className="empty-state">Loading fresh offerings…</p>}
          {status === "empty" && <p className="empty-state">No cut flower offerings available yet.</p>}
          {status === "error" && (
            <p className="empty-state">We couldn’t load cut flower offerings. Displaying sample information.</p>
          )}
          {isFallback && normalizedOfferings.length > 0 && status !== "loading" && (
            <p className="empty-state">Showing locally seeded offerings until live data is ready.</p>
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">From Bloom to Frame</span>
            <h2>Press & Preserve</h2>
            <p>
              Love your cut blooms and want to remember them forever? Our studio can press key stems from your event and
              design a coordinating framed artwork, keeping your floral story alive.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export default CutFlowersPage;
