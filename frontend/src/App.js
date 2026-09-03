import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LangProvider } from './context/LangContext';
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
  const hideFooter = pathname === '/admin';
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
      </Routes>
      {!hideFooter && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Layout />
      </BrowserRouter>
    </LangProvider>
  );
}
