import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import TnaGenerator from './pages/TnaGenerator.jsx';
import UserMaster from './pages/UserMaster.jsx';
import PrintView from './pages/PrintView.jsx';
import Logins from './pages/Logins.jsx';

export default function App() {
  return (
    <Routes>
      {/* The print document renders without any app chrome */}
      <Route path="/orders/:id/print" element={<PrintView />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/orders/new" element={<TnaGenerator />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/orders/:id/edit" element={<TnaGenerator />} />
        <Route path="/users" element={<UserMaster />} />
        <Route path="/logins" element={<Logins />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
