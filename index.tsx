import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './tailwind.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Root element not found");
}

try {
  const root = ReactDOM.createRoot(rootElement as HTMLElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  console.error("Render error:", e);
  rootElement.innerHTML = `<div style="color: red; padding: 20px;">
    <h1>Startup Error</h1>
    <pre>${e instanceof Error ? e.message + '\n' + e.stack : JSON.stringify(e)}</pre>
  </div>`;
}

// Global error handler for module loading errors
window.addEventListener('error', (event) => {
   const root = document.getElementById('root');
   if (root && root.innerHTML === '') {
       root.innerHTML = `<div style="color: red; padding: 20px;">
        <h1>Global Error</h1>
        <p>${event.message}</p>
        <p>${event.filename}:${event.lineno}:${event.colno}</p>
      </div>`;
   }
});
