import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * ============================================================================
 * FRONTEND REACT APPLICATION (DYNAMIC BACKEND VERSION)
 * ============================================================================
 * This version looks for the backend URL in the browser address bar.
 * Example URL: https://pages.github.com/bid-app/?api=https://script.google.com/...
 */

const App = () => {
  const [view, setView] = useState('loading');
  const [gasUrl, setGasUrl] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [formData, setFormData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper for GET requests
  const apiGet = async (url, params) => {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${url}?${query}`);
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  };

  // Helper for POST requests
  const apiPost = async (url, action, data) => {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action, ...data }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    return response.json();
  };

  useEffect(() => {
    // 1. Extract the GAS Web App URL from the browser's query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const backendUrl = urlParams.get('api');

    if (!backendUrl) {
      setView('no-config');
      return;
    }

    setGasUrl(backendUrl);

    // 2. Fetch initial project data using the discovered URL
    apiGet(backendUrl, { action: 'getInitialData' })
      .then(data => {
        setInitialData(data);
        setView('landing');
      })
      .catch(err => {
        console.error("Initialization Error:", err);
        setView('error');
      });
  }, []);

  const loadScopeForm = async (scopeName) => {
    setView('loading-scope');
    try {
      const data = await apiGet(gasUrl, { action: 'getBidFormData', scopeName });
      setFormData(data);
      setView('form');
    } catch (err) {
      alert("Failed to load form details from Google Sheets.");
      setView('landing');
    }
  };

  // Error State: No Backend URL provided
  if (view === 'no-config') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-amber-200">
          <h2 className="text-2xl font-bold text-amber-600 mb-4">Configuration Required</h2>
          <p className="text-slate-600 mb-6">
            This portal needs to be connected to a specific project backend. 
            Please use the link provided by your Project Manager.
          </p>
          <div className="text-xs bg-slate-100 p-4 rounded-lg font-mono text-slate-500">
            Expected format:<br/>
            ?api=https://script.google.com/macros/s/.../exec
          </div>
        </div>
      </div>
    );
  }

  if (view === 'loading') return <div className="p-20 text-center animate-pulse text-slate-400">Locating Secure Project Backend...</div>;
  if (view === 'error') return <div className="p-20 text-center text-red-500">Error connecting to Google Apps Script. Please verify the Web App URL.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 font-sans">
      <div className="max-w-4xl mx-auto">
        {view === 'landing' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
              <h1 className="text-3xl font-black text-gray-900 mb-2">Project Overview</h1>
              <p className="text-gray-500 mb-6">Select a scope below to begin your bid submission.</p>
              
              <div className="space-y-3">
                {initialData?.projectInfo?.map((info, i) => (
                  <div key={i} className="flex justify-between border-b border-gray-50 py-2">
                    <span className="font-bold text-gray-600">{info.header}</span>
                    <span className="text-gray-900">{info.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {initialData?.scopeList?.map(scope => (
                <button 
                  key={scope}
                  onClick={() => loadScopeForm(scope)}
                  className="p-6 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all text-left group"
                >
                  <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600">{scope}</h3>
                  <p className="text-sm text-gray-400 mt-1">Click to open bid form</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'form' && (
          <div className="animate-in fade-in duration-500">
            <button onClick={() => setView('landing')} className="mb-6 flex items-center text-blue-600 font-semibold hover:underline">
               ← Back to Project Overview
            </button>
            <h2 className="text-4xl font-black text-gray-900 mb-8">Bid Form: {formData.scopeName}</h2>
            
            <form className="space-y-10 pb-20">
              {formData.orderedHeaders.map(header => (
                <div key={header} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-900 text-white px-6 py-4">
                    <h3 className="text-lg font-bold tracking-wide uppercase">{header}</h3>
                  </div>
                  <div className="p-6 divide-y divide-gray-100">
                    {formData.sections[header].map((item, idx) => (
                      <div key={idx} className={`py-4 flex flex-col md:flex-row md:items-center gap-4 ${item.type === 'SUBHEADER' ? 'bg-gray-50 -mx-6 px-6 font-bold text-gray-400' : ''}`}>
                        <div className="flex-1">
                          <span className="text-xs font-mono text-gray-300 mr-2">{item.number}</span>
                          <span dangerouslySetInnerHTML={{ __html: item.description }} className="text-gray-700" />
                        </div>
                        {item.type !== 'SUBHEADER' && !item.isBold && (
                          <input 
                            type="text" 
                            className="md:w-48 p-2 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right"
                            placeholder="0.00"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              <div className="fixed bottom-6 left-0 right-0 px-4 pointer-events-none">
                <div className="max-w-4xl mx-auto bg-blue-600 p-6 rounded-2xl text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-4 pointer-events-auto">
                  <div className="text-center md:text-left">
                    <h4 className="text-lg font-bold">Ready to submit?</h4>
                    <p className="text-xs opacity-80">Verify all line items before final submission.</p>
                  </div>
                  <button 
                    type="button"
                    className="bg-white text-blue-600 px-10 py-3 rounded-xl font-black text-lg shadow-xl hover:scale-105 transition-transform"
                  >
                    Submit Proposal
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

// Remove 'export default App;' and replace it with this to render the app to the screen:
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
