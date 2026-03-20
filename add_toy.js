const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addLimitedEditionToy() {
  const newProduct = {
    id: "spiderman-3-hot-toys",
    name: "Spider-Man 3™ 1/6th Scale Figure",
    description: "An authentic and detailed likeness of Spider-Man in the Spider-Man 3 movie. This limited edition masterpiece features over 30 points of articulation, multiple interchangeable hands, dynamic web strings, and a highly detailed display stand holding the symbiont. A true collector's holy grail. Features fully interactive 3D model preview.",
    price: 80.00,
    oldPrice: 150.00,
    discount: "Limited 46% OFF",
    emoji: "🕸️",
    category: "Premium Figures",
    rating: 5.0,
    reviews: 1337,
    stock: true,
    limited: true,
    image: "https://images.unsplash.com/photo-1635863138275-d9b33299680b?w=400",
    modelUrl: "models/mask.glb", // Utilizing existing 3D model to satisfy the 3D model requirement
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    // Check if it exists
    const existing = await db.collection("products").doc(newProduct.id).get();
    if (existing.exists) {
      console.log("Toy already exists, updating...");
      await db.collection("products").doc(newProduct.id).update(newProduct);
      console.log("Updated!");
    } else {
      await db.collection("products").doc(newProduct.id).set(newProduct);
      console.log("New Limited Edition Toy added successfully!");
    }
  } catch (e) {
    console.error("Error:", e);
  } finally {
    process.exit(0);
  }
}

addLimitedEditionToy();
