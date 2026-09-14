import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthContext.js";
import { ProtectedRoute } from "./features/auth/ProtectedRoute.js";
import LoginPage from "./features/auth/LoginPage.js";
import HomePage from "./pages/HomePage.js";
import StationsPage from "./features/stations/StationsPage.js";
import ProductsPage from "./features/products/ProductsPage.js";
import ProductVariationsPage from "./features/product-variations/ProductVariationsPage.js";
import AdditionalsPage from "./features/additionals/AdditionalsPage.js";
import NewOrderPage from "./features/orders/NewOrderPage.js";
import OrderPage from "./features/orders/OrderPage.js";
import AddItemPage from "./features/orders/AddItemPage.js";

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
          <Route
            path="/admin/products/:productId/variations"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <ProductVariationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/additionals"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <AdditionalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/new"
            element={
              <ProtectedRoute allowedRoles={["ATENDENTE", "ADMIN"]}>
                <NewOrderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId/items/new"
            element={
              <ProtectedRoute allowedRoles={["ATENDENTE", "ADMIN"]}>
                <AddItemPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <ProtectedRoute allowedRoles={["ATENDENTE", "ADMIN"]}>
                <OrderPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
