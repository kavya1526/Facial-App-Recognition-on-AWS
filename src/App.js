import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import CheckInPage from './pages/CheckInPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-gray-900">
          Facial Recognition Check-In
        </h1>
        <p className="mt-1 mb-6 text-center text-sm text-gray-500">
          Serverless employee verification on AWS Rekognition
        </p>

        <Header />

        <Routes>
          <Route path="/" element={<CheckInPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
    </div>
  );
}
