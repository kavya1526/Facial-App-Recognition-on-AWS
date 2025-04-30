import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import CheckInPage from './pages/CheckInPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <div className="mb-7 text-center">
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">
            Facial Recognition Check-In
          </h1>
          <p className="mt-1 text-sm text-subtle">
            Serverless employee verification on AWS Rekognition
          </p>
        </div>

        <Header />

        <Routes>
          <Route path="/" element={<CheckInPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>

        <p className="mt-6 text-center text-xs text-subtle">
          Demo system. Photos are deleted after 24 hours.
        </p>
      </main>
    </div>
  );
}
