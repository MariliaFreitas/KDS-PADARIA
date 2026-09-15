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
import ProductionStationsPage from "./features/production/ProductionStationsPage.js";
import ProductionKdsPage from "./features/production/ProductionKdsPage.js";
import CashierPage from "./features/cashier/CashierPage.js";
import DeliveryPage from "./features/delivery/DeliveryPage.js";

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
          <Route
            path="/production"
            element={
              <ProtectedRoute allowedRoles={["PRODUCAO", "ADMIN"]}>
                <ProductionStationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/production/stations/:stationId"
            element={
              <ProtectedRoute allowedRoles={["PRODUCAO", "ADMIN"]}>
                <ProductionKdsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cashier"
            element={
              <ProtectedRoute allowedRoles={["CAIXA", "ADMIN"]}>
                <CashierPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery"
            element={
              // Só CAIXA nesta etapa — ADMIN não é concedido automaticamente,
              // ao contrário dos outros módulos (decisão explícita da
              // Etapa 14, não uma omissão).
              <ProtectedRoute allowedRoles={["CAIXA"]}>
                <DeliveryPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
