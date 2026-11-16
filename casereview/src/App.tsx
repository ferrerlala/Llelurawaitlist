import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './app/AppContext.tsx';
import { Layout } from './components/Layout.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NewReviewPage } from './pages/NewReviewPage.tsx';
import { StartAnnualAssessmentPage } from './pages/StartAnnualAssessmentPage.tsx';
import { FixIssuesPage } from './pages/FixIssuesPage.tsx';
import { PrintReportPage } from './pages/PrintReportPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { ReviewPage } from './pages/ReviewPage.tsx';
import { SectionPage } from './pages/SectionPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TasksPage } from './pages/TasksPage.tsx';

export function App() {
  const { user, loading } = useApp();
  if (loading) return <div className="p-10 text-sm text-slate-500">Loading…</div>;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route path="/reviews/:id/print" element={<PrintReportPage />} />
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/annual" element={<StartAnnualAssessmentPage />} />
            <Route path="/new" element={<NewReviewPage />} />
            <Route path="/fix" element={<FixIssuesPage />} />
            <Route path="/reviews/:id" element={<ReviewPage />} />
            <Route path="/cds" element={<SectionPage section="cds" />} />
            <Route path="/adl" element={<SectionPage section="adl" />} />
            <Route path="/qa" element={<SectionPage section="qa" />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
}
