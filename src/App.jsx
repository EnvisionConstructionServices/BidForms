import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * ============================================================================
 * INDEXED DB HELPER (LOCAL AUTOSAVE)
 * ============================================================================
 */
const DB_NAME = 'BidFormsDB';
const STORE_NAME = 'drafts';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
        e.target.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveDraft = async (scope, data) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, scope);
  } catch (e) { console.error("Draft save failed", e); }
};

const getDraft = async (scope) => {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(scope);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
};

const clearDraft = async (scope) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(scope);
  } catch (e) { console.error("Draft clear failed", e); }
};


/**
 * ============================================================================
 * FRONTEND REACT APPLICATION
 * ============================================================================
 */
const App = () => {
  const [view, setView] = useState('loading');
  const [gasUrl, setGasUrl] = useState(null); 
  const [initialData, setInitialData] = useState(null);
  const [formData, setFormData] = useState(null);
  const [savedDraft, setSavedDraft] = useState({});
  const [logos, setLogos] = useState({ main: '', wmdbe: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [sectionComments, setSectionComments] = useState({}); // Tracks comment rows per section
  const debounceTimer = useRef(null);

  const apiGet = async (baseUrl, params) => {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${baseUrl}?${query}`);
    return response.json();
  };

  const apiPost = async (baseUrl, action, data) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify({ action, ...data }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    return response.json();
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const scriptId = urlParams.get('id');

    if (!scriptId) {
      setView('no-config');
      return;
    }

    const backendUrl = `https://script.google.com/macros/s/${scriptId}/exec`;
    setGasUrl(backendUrl);

    const initData = async () => {
      try {
        const data = await apiGet(backendUrl, { action: 'getInitialData' });
        setInitialData(data);
        
        const projectName = data.projectInfo?.[0]?.value || "Project";
        document.title = `Envision CS - ${projectName} Bid Forms`;
        
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
      const draft = await getDraft(scopeName) || {};
      
      // Initialize comment rows based on saved draft
      const initComments = {};
      data.orderedHeaders.forEach(header => {
        const secKey = header.replace(/[^a-zA-Z0-9]/g, '_');
        const refs = draft[`${secKey}_comment_ref`];
        if (refs) {
          const count = Array.isArray(refs) ? refs.length : 1;
          initComments[header] = Array.from({length: count}, (_, i) => Date.now() + i);
        } else {
          initComments[header] = [];
        }
      });
      
      setFormData(data);
      setSavedDraft(draft);
      setSectionComments(initComments);
      setView('form');
    } catch (err) {
      alert("Failed to load form");
      setView('landing');
    }
  };

  const handleFormChange = (e) => {
    const formEl = e.currentTarget || e.target;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    debounceTimer.current = setTimeout(async () => {
      const draftData = {};
      new FormData(formEl).forEach((value, key) => {
        if (draftData[key]) {
          if (!Array.isArray(draftData[key])) draftData[key] = [draftData[key]];
          draftData[key].push(value);
        } else {
          draftData[key] = value;
        }
      });
      await saveDraft(formData.scopeName, draftData);
    }, 800); 
  };

  const handleClearDraft = async () => {
    if (window.confirm("Are you sure you want to clear your saved progress and start over?")) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      await clearDraft(formData.scopeName);
      setSavedDraft({});
      setSectionComments({});
      document.getElementById('bid-form').reset();
    }
  };

  const handleAddComment = (header) => {
    setSectionComments(prev => ({
      ...prev,
      [header]: [...(prev[header] || []), Date.now()]
    }));
  };

  const handleRemoveComment = (header, idToRemove) => {
    setSectionComments(prev => ({
      ...prev,
      [header]: prev[header].filter(id => id !== idToRemove)
    }));
    // Manually trigger draft save since removing a DOM node doesn't fire onChange
    setTimeout(() => {
      const formEl = document.getElementById('bid-form');
      if (formEl) handleFormChange({ currentTarget: formEl });
    }, 100);
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
      
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      await clearDraft(formData.scopeName);
      
      setModalData({ 
        status: result.status || 'success', 
        message: result.message || 'Submitted Successfully' 
      });
      
    } catch (err) {
      setModalData({ 
        status: 'error', 
        message: "Submission Error: " + err.message 
      });
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

        const { id: finalId } = await apiPost(gasUrl, 'finalizeUpload', { fileId, mimeType: file.type, finalName: file.name });
        resolve(finalId);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCloseModal = () => {
    const wasSuccess = modalData?.status === 'success';
    setModalData(null);
    if (wasSuccess) {
      setView('landing');
    }
  };

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
    <div className="w-full px-2 md:px-4 py-6 font-sans text-slate-800 relative">
      
      {/* CUSTOM MODAL OVERLAY */}
      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform transition-all border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${modalData.status === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {modalData.status === 'success' ? (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              )}
            </div>
            <h3 className="text-2xl font-bold text-center mb-4 text-slate-800">
              {modalData.status === 'success' ? 'Success!' : 'Oops!'}
            </h3>
            <div 
              className="text-center text-slate-600 mb-8 leading-relaxed" 
              dangerouslySetInnerHTML={{ __html: modalData.message }} 
            />
            <button 
              onClick={handleCloseModal} 
              className="w-full bg-slate-800 text-white font-bold py-3 px-4 rounded-xl hover:bg-slate-700 transition-colors shadow-md"
            >
              {modalData.status === 'success' ? 'Return to Dashboard' : 'Close and Try Again'}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-center mb-8">
        {logos.main && <img src={logos.main} className="h-16" alt="Logo" />}
      </div>

      {view === 'landing' && (
        <div className="max-w-4xl mx-auto space-y-6">
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
        <div className="pb-20 max-w-5xl mx-auto">
          <button onClick={() => setView('landing')} className="mb-4 text-slate-500 font-bold hover:text-slate-800 flex items-center gap-1">
            ← Back to Scopes
          </button>
          <h1 className="text-3xl font-bold mb-6">Bid Form: {formData.scopeName}</h1>
          
          {Object.keys(savedDraft).length > 0 && (
            <div className="bg-sky-50 text-sky-800 p-4 rounded-xl shadow-sm mb-6 flex flex-col sm:flex-row justify-between items-center text-sm font-semibold border border-sky-200 gap-4">
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Your previous progress has been restored.
              </span>
              <button 
                type="button" 
                onClick={handleClearDraft}
                className="text-sky-600 hover:text-sky-800 underline hover:bg-sky-100 px-3 py-1 rounded transition-colors"
              >
                Start Over
              </button>
            </div>
          )}

          <form id="bid-form" onSubmit={handleFormSubmit} onChange={handleFormChange} className="space-y-8">
            {(() => {
              const nameTracker = {};
              
              return formData.orderedHeaders.map((header, index) => {
                const secKey = header.replace(/[^a-zA-Z0-9]/g, '_');
                const commentRefName = `${secKey}_comment_ref`;
                const commentTextName = `${secKey}_comment_text`;

                return (
                  <div key={header} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div style={{ height: '6px', backgroundColor: index % 2 === 0 ? '#59BA48' : '#1B95D2' }} />
                    <h2 className="bg-slate-800 text-white p-3 font-bold">{header}</h2>
                    <div className="p-4 space-y-4">
                      {formData.sections[header].map((item, idx) => {
                        const type = (item.type || '').toUpperCase();
                        const inputName = `${item.number ? String(item.number).replace(/[^a-zA-Z0-9]/g, '_') : 'field'}_${(item.type || 'text').toLowerCase()}`;
                        
                        let draftValue = '';

                        // Tracker logic for main inputs
                        nameTracker[inputName] = (nameTracker[inputName] || 0) + 1;
                        const arrayIndex = nameTracker[inputName] - 1;
                        if (savedDraft?.[inputName]) {
                           if (Array.isArray(savedDraft[inputName])) {
                               draftValue = savedDraft[inputName][arrayIndex] || '';
                           } else {
                               if (arrayIndex === 0) draftValue = savedDraft[inputName];
                           }
                        }
                        
                        return (
                          <div key={idx} className={`flex flex-col md:flex-row gap-4 py-3 border-b border-slate-50 last:border-0 items-start md:items-center ${item.type === 'SUBHEADER' ? 'bg-slate-50 -mx-4 px-4 py-3 font-bold italic text-slate-400' : ''}`}>
                            <div className="flex-1 flex items-start">
                              <span className="text-slate-400 text-xs mr-3 font-mono mt-[2px]">{item.number}</span>
                              <span dangerouslySetInnerHTML={{ __html: item.description }} />
                            </div>
                            
                            {item.type !== 'SUBHEADER' && !item.isBold && (
                              <div className="w-full md:w-[320px] shrink-0">
                                {(() => {
                                  if (type === 'Y/N/NA' || type === 'Y/N' || type === 'YES/NO') {
                                    const options = type === 'Y/N/NA' ? ['Yes', 'No', 'N/A'] : ['Yes', 'No'];
                                    return (
                                      <div className="flex gap-2 items-center justify-center w-full h-[42px]">
                                        {options.map(opt => {
                                          let activeClass = '';
                                          if (opt === 'Yes') activeClass = 'peer-checked:bg-green-600 peer-checked:text-white peer-checked:border-green-600';
                                          else if (opt === 'No') activeClass = 'peer-checked:bg-red-500 peer-checked:text-white peer-checked:border-red-500';
                                          else activeClass = 'peer-checked:bg-slate-500 peer-checked:text-white peer-checked:border-slate-500';
                                          
                                          return (
                                            <label key={opt} className="flex-1 cursor-pointer">
                                              <input type="radio" name={inputName} value={opt} defaultChecked={draftValue === opt} required className="peer sr-only" />
                                              <div className={`text-center px-2 py-2 text-sm font-bold rounded-lg border-2 border-slate-100 bg-slate-50 text-slate-400 transition-all hover:bg-slate-200 ${activeClass}`}>
                                                {opt}
                                              </div>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    );
                                  }
                                  if (type === '$' || type === 'TOTAL' || type === 'P&P' || type === 'TAX') {
                                    return (
                                      <div className="flex w-full h-[42px] rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500 transition-shadow shadow-sm">
                                        <div className="flex items-center justify-center bg-slate-50 px-3 border-r border-slate-200 text-slate-500 font-semibold select-none">$</div>
                                        <input name={inputName} type="number" step="0.01" defaultValue={draftValue} className="w-full py-2 px-3 outline-none bg-transparent text-left" placeholder="0.00" required />
                                      </div>
                                    );
                                  }
                                  if (type === 'EMAIL') {
                                    return <input name={inputName} type="email" defaultValue={draftValue} className="w-full h-[42px] border border-slate-200 rounded-lg py-2 px-3 text-center focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none shadow-sm transition-shadow" placeholder="Email Address" required />;
                                  }
                                  if (type === 'PHONE') {
                                    return <input name={inputName} type="tel" defaultValue={draftValue} className="w-full h-[42px] border border-slate-200 rounded-lg py-2 px-3 text-center focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none shadow-sm transition-shadow" placeholder="Phone Number" required />;
                                  }
                                  if (type === 'TEXT' || type === '') {
                                    return <input name={inputName} type="text" defaultValue={draftValue} className="w-full h-[42px] border border-slate-200 rounded-lg py-2 px-3 text-center focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none shadow-sm transition-shadow" placeholder="Response" required />;
                                  }
                                  
                                  return (
                                    <div className="flex w-full h-[42px] rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500 transition-shadow shadow-sm">
                                      <input name={inputName} type="number" step="any" defaultValue={draftValue} className="w-full py-2 px-3 outline-none bg-transparent text-right min-w-0" placeholder="0" required />
                                      <div className="flex items-center justify-center bg-slate-50 px-4 border-l border-slate-200 text-slate-500 font-bold text-xs select-none shrink-0 whitespace-nowrap">
                                        {type}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* DEDICATED SECTION COMMENTS AREA */}
                    <div className="bg-slate-50 border-t border-slate-100 p-2 mt-auto">
                      {(sectionComments[header] || []).map((commentId, cIdx) => {
                        let draftRef = '';
                        let draftText = '';
                        if (savedDraft?.[commentRefName]) {
                            if (Array.isArray(savedDraft[commentRefName])) {
                                draftRef = savedDraft[commentRefName][cIdx] || '';
                                draftText = savedDraft[commentTextName]?.[cIdx] || '';
                            } else if (cIdx === 0) {
                                draftRef = savedDraft[commentRefName];
                                draftText = savedDraft[commentTextName];
                            }
                        }

                        return (
                          <div key={commentId} className="flex flex-col md:flex-row gap-2 mb-2 relative group">
                            <div className="w-full md:w-24 shrink-0 relative">
                              <div className="absolute top-0 left-0 w-1 h-full bg-sky-400 rounded-l-[4px]"></div>
                              <input 
                                name={commentRefName} 
                                defaultValue={draftRef} 
                                placeholder="Line No." 
                                required 
                                className="w-full bg-sky-50 border border-sky-100 rounded-r py-1.5 pl-3 pr-2 focus:border-sky-300 focus:ring-1 focus:ring-sky-300 outline-none text-xs text-sky-900 placeholder-sky-400 shadow-inner" 
                              />
                            </div>
                            <div className="flex-1 relative">
                              <textarea 
                                name={commentTextName} 
                                defaultValue={draftText} 
                                placeholder="Enter your comment or clarification here..." 
                                required 
                                className="w-full bg-sky-50 border border-sky-100 rounded py-1.5 px-2 focus:border-sky-300 focus:ring-1 focus:ring-sky-300 outline-none text-xs text-sky-900 placeholder-sky-400 min-h-[32px] h-[32px] leading-tight resize-y shadow-inner" 
                              />
                            </div>
                            
                            {/* Desktop Remove Button (Hover) */}
                            <button 
                              type="button" 
                              onClick={() => handleRemoveComment(header, commentId)} 
                              className="md:absolute md:-right-2 md:-top-2 text-slate-400 hover:text-red-500 transition-colors bg-white rounded-full p-1 shadow-sm border border-slate-100 hidden md:group-hover:block z-10" 
                              title="Remove Comment"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            
                            {/* Mobile Remove Button */}
                            <button 
                              type="button" 
                              onClick={() => handleRemoveComment(header, commentId)} 
                              className="md:hidden text-red-400 hover:text-red-600 text-xs font-bold text-right w-full mb-1"
                            >
                              Remove Comment
                            </button>
                          </div>
                        );
                      })}

                      <button 
                        type="button" 
                        onClick={() => handleAddComment(header)} 
                        className="text-sky-600 hover:text-sky-800 transition-colors flex items-center gap-1 text-xs font-bold mt-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                        Add Comment / Clarification
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
            
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

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
