import { useState, useEffect, useRef } from 'react';
import { Terminal, Activity, Zap } from 'lucide-react';
import { triggerSwarmSync } from '../lib/aiEngine';

interface LogEntry {
  timestamp: string;
  direction: 'TX' | 'RX';
  agentId: string;
  message: string;
}

export default function SwarmTerminal() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = new BroadcastChannel('ea-niti-swarm');
    
    channel.onmessage = (event) => {
      const { type, agent } = event.data;
      
      const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        direction: type === 'PING' ? 'TX' : 'RX',
        agentId: agent || 'UNKNOWN',
        message: JSON.stringify(event.data)
      };
      
      setLogs(prev => [...prev, newLog]);
    };

    return () => {
      channel.close();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSync = () => {
    triggerSwarmSync();
  };

  return (
    <div className="bg-black rounded-lg border border-gray-800 overflow-hidden shadow-2xl flex flex-col h-80">
      <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-green-500" />
          <span className="text-green-500 font-mono text-xs font-bold tracking-widest">SWARM_TERMINAL_v1.0</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleSync}
            className="flex items-center gap-1 px-2 py-1 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded border border-green-800/50 text-xs font-mono transition-colors"
          >
            <Zap size={12} />
            Swarm Sync
          </button>
          <Activity size={16} className="text-green-500 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-green-500 space-y-1">
        {logs.length === 0 ? (
          <div className="text-gray-600 italic">Waiting for swarm communications...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="break-all">
              <span className="text-gray-500">{`> [${log.timestamp}]`}</span>{' '}
              <span className={log.direction === 'TX' ? 'text-blue-400' : 'text-purple-400'}>
                [{log.direction}]
              </span>{' '}
              <span className="font-bold text-yellow-400">{log.agentId}:</span>{' '}
              <span className="opacity-90">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
