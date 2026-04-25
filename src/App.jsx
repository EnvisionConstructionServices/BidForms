import React, { useState, useEffect } from 'react';

/**
 * ============================================================================
 * FRONTEND REACT APPLICATION (UNIVERSAL VERSION)
 * ============================================================================
 * This version is "Backend Agnostic." It does not have a hardcoded URL.
 * It looks for the backend API in the URL query string.
 * Example: https://your-user.github.io/BidForms/?api=https://script.google.com/...
 */

const App = () => {
  const [view, setView] = useState('loading');
  const [gasUrl, setGasUrl] = useState(null); // The dynamic backend URL
  const [initialData, setInitialData] = useState(null);
  const [formData, setFormData] = useState(null);
  const [logos, setLogos] = useState({ main: '', wmdbe: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper for GET requests using the dynamic URL
  const apiGet = async (baseUrl, params) => {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${baseUrl}?${query}`);
    return response.json();
  };

  // Helper for POST requests using the dynamic URL
  const apiPost = async (baseUrl, action, data) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify({ action, ...data }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    return response.json();
  };

  useEffect(() => {
    // 1. Detect the Backend URL from the browser's address bar
    const urlParams = new URLSearchParams(window.location.search);
    const backendUrl = urlParams.get('api');

    if (!backendUrl) {
      setView('no-config');
      return;
    }

    setGasUrl(backendUrl);

    // 2. Fetch data from the detected backend
    const initData = async () => {
      try {
        const data = await apiGet(backendUrl, { action: 'getInitialData' });
        setInitialData(data);
        
        // Fetch logos
        apiGet(backendUrl, { action: 'getMainLogo' }).then(url => setLogos(prev => ({ ...prev, main: url })));
        apiGet(backendUrl, { action: 'getDriveImage', fileId: '1CyxISCVHpHmRg6GsXVCc2xaSNP-teXzY' }).then(url => setLogos(prev => ({ ...prev, wmdbe: url })));
        
        setView('landing');
      } catch (err) {
        console.error("Connection Error:", err);
        setView('error');
      }
    };

    initData();
  }, []);

  const loadScopeForm = async (scopeName) => {
    setView('loading-scope');
    try {
      const data = await apiGet(gasUrl, { action: 'getBidFormData', scopeName });
      setFormData(data);
      setView('form');
    } catch (err) {
      alert("Failed to load form");
      setView('landing');
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formEl = e.target;
    const submissionData = {};
    new FormData(formEl).forEach((value, key) => {
      if (submissionData[key]) {
        if (!Array.isArray(submissionData[key])) submissionData[key] = [submissionData[key]];
        submissionData[key].push(value);
      } else {
        submissionData[key] = value;
      }
    });

    const fileInput = document.getElementById('proposalUpload');
    let uploadedFileId = null;
    if (fileInput?.files.length > 0) {
      const file = fileInput.files[0];
      uploadedFileId = await uploadFile(file);
    }

    try {
      const result = await apiPost(gasUrl, 'saveBidSubmission', {
        formData: { ...submissionData, scopeName: formData.scopeName, uploadedFileId }
      });
      alert(result.message || "Submitted Successfully");
      setView('landing');
    } catch (err) {
      alert("Submission Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        const CHUNK_SIZE = 2 * 1024 * 1024;
        const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

        const { id: fileId } = await apiPost(gasUrl, 'initiateResumableUpload', { filename: file.name });
        
        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await apiPost(gasUrl, 'uploadChunk', { fileId, chunk });
        }

        const finalId = await apiPost(gasUrl, 'finalizeUpload', { fileId, mimeType: file.type, finalName: file.name });
        resolve(finalId);
      };
      reader.readAsDataURL(file);
    });
  };

  // Special view if the URL is missing the ?api= parameter
  if (view === 'no-config') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-amber-100">
          <h2 className="text-2xl font-bold text-amber-600 mb-4">Setup Required</h2>
          <p className="text-slate-600 mb-4">
            This portal is currently not connected to a project.
          </p>
          <p className="text-sm text-slate-500">
            Please open your Google Sheet and click the "Sync" button to generate your unique bid portal link.
          </p>
        </div>
      </div>
    );
  }

  if (view === 'error') return <div className="p-20 text-center text-red-500 font-bold">Error: Could not connect to the Google Sheet backend.</div>;
  if (view === 'loading' || view === 'loading-scope') return <div className="p-20 text-center animate-pulse text-slate-400">Loading Secure Bid Data...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 font-sans text-slate-800">
      <div className="flex justify-center mb-8">
        {logos.main && <img src={logos.main} className="h-16" alt="Logo" />}
      </div>

      {view === 'landing' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h1 className="text-2xl font-bold mb-4">{initialData.projectInfo[0]?.value}</h1>
            <div className="space-y-2">
              {initialData.projectInfo.slice(1).map((info, i) => (
                <div key={i} className="flex border-b border-slate-50 pb-2">
                  <span className="w-1/3 font-bold text-slate-600">{info.header}</span>
                  <span className="w-2/3">{info.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <h2 className="text-xl font-bold text-slate-700 px-2">Available Scopes</h2>
            {initialData.scopeList.map(scope => (
              <button 
                key={scope}
                onClick={() => loadScopeForm(scope)}
                className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-all font-semibold"
              >
                {scope}
                <span className="text-xs bg-green-200 px-2 py-1 rounded text-green-700 uppercase">View Form</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'form' && (
        <div className="pb-20">
          <button onClick={() => setView('landing')} className="mb-4 text-slate-500 font-bold hover:text-slate-800 flex items-center gap-1">
            ← Back to Scopes
          </button>
          <h1 className="text-3xl font-bold mb-6">Bid Form: {formData.scopeName}</h1>
          <form onSubmit={handleFormSubmit} className="space-y-8">
            {formData.orderedHeaders.map(header => (
              <div key={header} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <h2 className="bg-slate-800 text-white p-3 font-bold">{header}</h2>
                <div className="p-4 space-y-4">
                  {formData.sections[header].map((item, idx) => (
                    <div key={idx} className={`flex flex-col md:flex-row gap-4 py-2 border-b border-slate-50 last:border-0 ${item.type === 'SUBHEADER' ? 'bg-slate-50 -mx-4 px-4 py-3 font-bold italic text-slate-400' : ''}`}>
                      <div className="flex-1">
                        <span className="text-slate-400 text-xs mr-3 font-mono">{item.number}</span>
                        <span dangerouslySetInnerHTML={{ __html: item.description }} />
                      </div>
                      {item.type !== 'SUBHEADER' && !item.isBold && (
                        <div className="md:w-64 shrink-0">
                          <input 
                            name={`${item.number || 'field'}_${item.type}`} 
                            type="text" 
                            className="w-full border p-2 rounded text-center focus:ring-2 focus:ring-green-500 outline-none"
                            placeholder="Response"
                            required
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            <div className="p-6 bg-slate-100 rounded-xl flex flex-col md:flex-row gap-6 items-center border border-slate-200">
              <div className="flex-1">
                <h3 className="font-bold text-slate-700">Proposal Upload</h3>
                <p className="text-sm text-slate-500">Attach your formal letterhead proposal (PDF only).</p>
                <input type="file" id="proposalUpload" className="mt-2 text-sm" accept=".pdf" />
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className={`px-10 py-4 rounded-lg font-bold text-lg text-white shadow-lg transition-all ${isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 active:scale-95'}`}
              >
                {isSubmitting ? "Processing..." : "Submit Bid"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
