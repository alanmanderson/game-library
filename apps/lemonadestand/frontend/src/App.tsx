import { Routes, Route, Navigate } from 'react-router-dom';
import MainMenu from '@/screens/MainMenu';
import GameDashboard from '@/screens/GameDashboard';
import GameOver from '@/screens/GameOver';
import ToastContainer from '@/components/ToastContainer';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/game/:id" element={<GameDashboard />} />
        <Route path="/game-over/:id" element={<GameOver />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}

export default App;
