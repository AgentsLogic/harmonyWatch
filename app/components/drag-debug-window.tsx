"use client";

import { useState, useEffect, useRef } from "react";

interface DragDebugLog {
  timestamp: number;
  event: string;
  data: Record<string, any>;
  color: string;
}

interface DragDebugWindowProps {
  enabled?: boolean;
}

export function DragDebugWindow({ enabled = false }: DragDebugWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<DragDebugLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const maxLogs = 100; // Keep last 100 logs

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Listen for drag debug events from video modal
  useEffect(() => {
    if (!enabled) return;

    const handleDragDebug = (event: CustomEvent) => {
      const logData = event.detail as DragDebugLog;
      setLogs((prev) => {
        const newLogs = [...prev, logData];
        // Keep only last maxLogs entries
        return newLogs.slice(-maxLogs);
      });
    };

    window.addEventListener('drag-debug' as any, handleDragDebug as EventListener);
    return () => {
      window.removeEventListener('drag-debug' as any, handleDragDebug as EventListener);
    };
  }, [enabled]);

  if (!enabled) return null;

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatData = (data: Record<string, any>): string => {
    return Object.entries(data)
      .map(([key, value]) => {
        if (typeof value === 'number') {
          return `${key}: ${value.toFixed(2)}`;
        }
        if (typeof value === 'boolean') {
          return `${key}: ${value ? '✓' : '✗'}`;
        }
        return `${key}: ${value}`;
      })
      .join(', ');
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <>
      {/* Toggle Button - Fixed position in bottom left */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 left-4 z-[9998] bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-mono font-bold shadow-lg transition-colors border-2 border-blue-400"
        style={{ 
          fontSize: '10px',
          padding: '8px 12px',
        }}
      >
        {isOpen ? '▼ DRAG' : '▲ DRAG'}
      </button>

      {/* Debug Window */}
      {isOpen && (
        <div className="fixed bottom-20 left-4 right-4 z-[9998] bg-black bg-opacity-95 border-2 border-blue-400 rounded-lg overflow-hidden shadow-2xl" style={{ maxHeight: '60vh' }}>
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 border-b border-gray-700 px-3 py-2 flex items-center justify-between">
              <h2 className="text-white text-xs font-mono font-bold">DRAG DEBUG</h2>
              <div className="flex gap-2">
                <button
                  onClick={clearLogs}
                  className="text-blue-400 hover:text-blue-300 text-xs font-mono px-2 py-1"
                >
                  Clear
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:text-red-400 text-lg font-bold"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Logs - Scrollable */}
            <div className="flex-1 overflow-y-auto bg-gray-950 p-2">
              {logs.length === 0 ? (
                <div className="text-gray-500 text-xs font-mono text-center py-4">
                  No drag events yet. Try dragging the video modal.
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`text-xs font-mono p-2 rounded border-l-2 ${
                        log.color === 'green' ? 'bg-green-900/20 border-green-500 text-green-300' :
                        log.color === 'red' ? 'bg-red-900/20 border-red-500 text-red-300' :
                        log.color === 'yellow' ? 'bg-yellow-900/20 border-yellow-500 text-yellow-300' :
                        log.color === 'blue' ? 'bg-blue-900/20 border-blue-500 text-blue-300' :
                        'bg-gray-900/20 border-gray-500 text-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500 shrink-0" style={{ fontSize: '9px' }}>
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <span className={`font-bold shrink-0 ${log.color === 'green' ? 'text-green-400' : log.color === 'red' ? 'text-red-400' : log.color === 'yellow' ? 'text-yellow-400' : log.color === 'blue' ? 'text-blue-400' : 'text-gray-400'}`}>
                          [{log.event}]
                        </span>
                        <span className="flex-1 break-words" style={{ fontSize: '10px' }}>
                          {formatData(log.data)}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Helper function to emit drag debug events
export function emitDragDebug(event: string, data: Record<string, any>, color: string = 'gray') {
  if (typeof window !== 'undefined') {
    const customEvent = new CustomEvent('drag-debug', {
      detail: {
        timestamp: Date.now(),
        event,
        data,
        color,
      } as DragDebugLog,
    });
    window.dispatchEvent(customEvent);
  }
}
