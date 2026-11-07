document.title = import.meta.env.VITE_APP_TITLE || "Bitstek Workspace";
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/app.css';
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 120000, gcTime: 900000, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>);
