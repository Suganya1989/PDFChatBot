'use client';

import { useState } from 'react';
import FileUpload from '../components/FileUpload';
import ChatInterface from '../components/ChatInterface';

export default function Home() {
  const [uploadedPdf, setUploadedPdf] = useState<{
    url: string;
    filename: string;
    fileSize: number;
  } | null>(null);

  const handleUploadComplete = (url: string, filename: string, fileSize: number) => {
    setUploadedPdf({ url, filename, fileSize });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
      
      <div className="relative">
        <div className="container mx-auto px-4 py-12">
          <header className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent mb-4">
              PDF Chatbot
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Transform your PDF documents into interactive conversations. Upload, ask, and discover insights instantly.
            </p>
          </header>

          <div className="max-w-4xl mx-auto space-y-8">
            {/* File Upload Section */}
            <div className="space-y-6">
              <FileUpload onUploadComplete={handleUploadComplete} />
              
              {uploadedPdf && (
                <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-white/20 shadow-xl max-w-lg mx-auto">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-2">Document Ready</h3>
                      <p className="text-sm text-gray-700 truncate mb-3">{uploadedPdf.filename}</p>
                      <a 
                        href={uploadedPdf.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View Document
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Section */}
            <div>
              <ChatInterface 
                pdfUrl={uploadedPdf?.url} 
                pdfName={uploadedPdf?.filename}
                pdfSize={uploadedPdf?.fileSize}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
