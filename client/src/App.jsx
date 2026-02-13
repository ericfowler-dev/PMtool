import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Equipment from './pages/Equipment';
import FleetManager from './pages/FleetManager';
import PriceLists from './pages/PriceLists';
import PMPlanner from './pages/PMPlanner';
import TCOAnalysis from './pages/TCOAnalysis';
import LifeAnalysis from './pages/LifeAnalysis';
import ScenarioComparison from './pages/ScenarioComparison';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/fleet" element={<FleetManager />} />
        <Route path="/pricelists" element={<PriceLists />} />
        <Route path="/maintenance" element={<PMPlanner />} />
        <Route path="/analysis" element={<TCOAnalysis />} />
        <Route path="/lifecycle" element={<LifeAnalysis />} />
        <Route path="/scenarios" element={<ScenarioComparison />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
