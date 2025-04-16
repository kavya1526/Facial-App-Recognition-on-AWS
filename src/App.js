import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import CheckInPage from './pages/CheckInPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900">
        Facial Recognition Check-In
      </h1>

      <Header />

      <Routes>
        <Route path="/" element={<CheckInPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
    </main>
  );
}
