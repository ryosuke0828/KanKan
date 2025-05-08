import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import RegisterMember from './pages/RegisterMember';
import NotFound from './pages/NotFound';
import SideBar from './components/sideBar';
import LoginPage from './pages/LoginPage';
import axios from 'axios';

const slack_api_url = process.env.REACT_APP_API_BASE_URL_SLACK;

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userSlackToken, setUserSlackToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const storedUserEmail = localStorage.getItem('userEmail');
    const storedToken = localStorage.getItem('userSlackToken');
    if (storedUserEmail && storedToken) {
      setUserId(storedUserEmail);
      setUserSlackToken(storedToken);
      setIsLoggedIn(true);
    }
    setIsLoading(false);
  }, []);

  const handleLoginSuccess = useCallback((email: string, token: string) => {
    setUserId(email);
    setUserSlackToken(token);
    setIsLoggedIn(true);
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userSlackToken', token);
  }, []);

  const handleLogout = useCallback(() => {
    setUserId(null);
    setUserSlackToken(null);
    setIsLoggedIn(false);
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userSlackToken');
  }, []);

  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        if (config.url?.startsWith(`${slack_api_url}`) && userId) {
          config.headers['X-User-ID'] = userId;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, [userId]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route
            path="/login"
            element={
              isLoggedIn ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage onLoginSuccess={handleLoginSuccess} />
              )
            }
          />
          {isLoggedIn ? (
            <Route element={<SideBar onLogout={handleLogout} />}>
              <Route path="/" element={<Home userId={userId} />} />
              <Route path="/register" element={<RegisterMember userID={userId} />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          ) : (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </div>
    </Router>
  );
}

export default App;