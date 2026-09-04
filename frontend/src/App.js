import React, { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LangProvider } from './context/LangContext';
import { AuthProvider } from './context/AuthContext';
import { isDemo } from './api';
import Intro from './components/Intro';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Courses from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import Teachers from './pages/Teachers';
import Prices from './pages/Prices';
import Feedback from './pages/Feedback';
import HowItWorks from './pages/HowItWorks';
import FAQ from './pages/FAQ';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Cabinet from './pages/Cabinet';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function DemoBanner() {
  const on = isDemo();
  useEffect(() => {
    document.body.classList.toggle('demo-mode', on);
  }, [on]);
  if (!on) return null;
  return (
    <div className="demo-banner">
      Демо-версия · данные показаны из подготовленного набора, заявки не отправляются
    </div>
  );
}

function Layout() {
  const { pathname } = useLocation();
  // The cabinet screens are workspaces, not marketing pages; the marketing
  // footer under them is only noise.
  const hideFooter = ['/admin', '/login', '/cabinet'].includes(pathname);
  return (
    <>
      {pathname === '/' && <Intro />}
      <DemoBanner />
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/prices" element={<Prices />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cabinet" element={<Cabinet />} />
      </Routes>
      {!hideFooter && <Footer />}
    </>
  );
}

// The standalone demo is one HTML file with nothing serving it, so a path like
// /courses would 404 on reload. That build routes on the hash instead; the
// deployed site keeps clean URLs.
const Router = process.env.REACT_APP_STANDALONE === '1' ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <Router>
          <ScrollToTop />
          <Layout />
        </Router>
      </AuthProvider>
    </LangProvider>
  );
}
