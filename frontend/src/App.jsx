import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import HomePage from "./pages/HomePage.jsx";
import WorkshopsPage from "./pages/WorkshopsPage.jsx";
import KitsPage from "./pages/KitsPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import CutFlowersPage from "./pages/CutFlowersPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { ModalProvider } from "./context/ModalContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ModalProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/workshops" element={<WorkshopsPage />} />
              <Route path="/kits" element={<KitsPage />} />
              <Route path="/cut-flowers" element={<CutFlowersPage />} />
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </ModalProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
