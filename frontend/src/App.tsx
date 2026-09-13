import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthContext.js";
import { ProtectedRoute } from "./features/auth/ProtectedRoute.js";
import LoginPage from "./features/auth/LoginPage.js";
import HomePage from "./pages/HomePage.js";
import StationsPage from "./features/stations/StationsPage.js";
import ProductsPage from "./features/products/ProductsPage.js";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/stations"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <StationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <ProductsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
