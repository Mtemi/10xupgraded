import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useState, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { authStore } from '~/lib/stores/auth';
import { EditorPanel } from './EditorPanel';
import { BacktestChart } from './BacktestChart';
import { BacktestMetrics } from './BacktestMetrics';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { Messages } from '../chat/Messages.client';
import { IconSidebar } from '../sidebar/IconSidebar';
import type { BacktestResult } from '~/lib/backtest';

interface EnhancedWorkbenchProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: Array<{ role: string; content: string }>;
}

export const EnhancedWorkbench = memo(({ chatStarted, isStreaming, messages = [] }: EnhancedWorkbenchProps) => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const { isAuthenticated, user } = useStore(authStore);

  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [showBacktests, setShowBacktests] = useState(true);
  const [botStatus, setBotStatus] = useState<'idle' | 'deploying' | 'running' | 'error'>('idle');
  const [strategyDeployed, setStrategyDeployed] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deploymentLogs]);

  // Check if this is user's first strategy
  const checkAndAutoDeploy = useCallback(async () => {
    if (!isAuthenticated || !user?.id || !selectedFile) return;

    try {
      const { data: existingBots, error } = await supabase
        .from('bots')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (error) {
        console.error('Error checking existing bots:', error);
        return;
      }

      if (!existingBots || existingBots.length === 0) {
        await autoDeployFirstStrategy();
      }
    } catch (error) {
      console.error('Error in auto-deploy check:', error);
    }
  }, [isAuthenticated, user, selectedFile]);

  // Auto-deploy first strategy
  const autoDeployFirstStrategy = async () => {
    if (!currentDocument?.content || !user?.id) return;

    setIsDeploying(true);
    setBotStatus('deploying');
    addLog('🚀 Initializing auto-deployment for your first trading strategy...');
    addLog('📝 Preparing strategy configuration...');

    try {
      const strategyName = selectedFile?.split('/').pop()?.replace('.py', '') || 'MyFirstStrategy';

      addLog(`✓ Strategy detected: ${strategyName}`);
      addLog('⚙️  Creating default bot configuration...');

      const botConfig = {
        name: `${strategyName}_bot`,
        strategy_name: strategyName,
        strategy_code: currentDocument.content,
        user_id: user.id,
        exchange: 'binance',
        trading_mode: 'paper',
        trading_type: 'CEX',
        market: 'spot',
        timeframe: '5m',
        stake_currency: 'USDT',
        max_open_trades: 3,
        stake_amount: 100,
        paper_trading_wallet_size: 1000,
        stop_loss: -0.1,
        minimal_roi: {
          "0": 0.04,
          "30": 0.02,
          "60": 0.01
        },
        pair_whitelist: [
          'AVAX/USDT', 'DOT/USDT', 'LINK/USDT', 'UNI/USDT', 'MATIC/USDT',
          'LTC/USDT', 'ATOM/USDT', 'NEAR/USDT', 'FIL/USDT', 'AAVE/USDT',
          'SAND/USDT', 'GRT/USDT', 'FTM/USDT', 'ALGO/USDT', 'ICP/USDT',
          'VET/USDT', 'SOL/USDT'
        ],
        is_active: true,
        status: 'deploying'
      };

      addLog('✓ Configuration created successfully');
      addLog('📤 Deploying to trading infrastructure...');

      const response = await fetch('/api/deploy_bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig)
      });

      if (!response.ok) {
        throw new Error('Deployment failed');
      }

      const result = await response.json();

      addLog('✓ Bot deployed successfully!');
      addLog(`🎯 Bot ID: ${result.bot_id}`);
      addLog('📊 Initializing live trading environment...');
      addLog('✓ Paper trading wallet: $1,000 USDT');
      addLog('✓ Max open trades: 3');
      addLog('✓ Active pairs: 17 pairs');
      addLog('✅ Your bot is now live in paper trading mode!');

      setBotStatus('running');
      setStrategyDeployed(true);

      toast.success('🎉 First bot deployed successfully! Welcome to live trading!');

    } catch (error) {
      console.error('Auto-deployment error:', error);
      addLog(`❌ Deployment failed: ${error.message}`);
      setBotStatus('error');
      toast.error('Auto-deployment failed. Please try manual deployment.');
    } finally {
      setIsDeploying(false);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDeploymentLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Trigger auto-deploy when code appears
  useEffect(() => {
    if (currentDocument?.content && !strategyDeployed) {
      checkAndAutoDeploy();
    }
  }, [currentDocument?.content, strategyDeployed, checkAndAutoDeploy]);

  // Set loading state when streaming
  useEffect(() => {
    setIsLoadingData(isStreaming || false);
  }, [isStreaming]);

  const handleBacktestLogs = useCallback((logs: string[]) => {
    logs.forEach((log) => {
      addLog(log);
    });
  }, []);

  if (!showWorkbench) {
    return null;
  }

  return (
    <>
      {/* Icon Sidebar for Workbench */}
      <IconSidebar onMenuOpen={setIsSidebarExpanded} />

      <div
        className={classNames(
          "fixed inset-0 z-50 bg-[#0a0e17] transition-all duration-300",
          isSidebarExpanded ? "left-64" : "left-16"
        )}
      >
        <PanelGroup direction="horizontal" className="h-full">
        {/* LEFT: Modern Chat Panel */}
        <Panel defaultSize={25} minSize={20} maxSize={35} className="hidden md:block">
          <div className="h-full flex flex-col bg-gradient-to-b from-[#0f1419] to-[#0a0e17] border-r border-gray-800/50">
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-800/50 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <div className="i-ph:chat-circle-text-fill text-white text-lg" />
                  </div>
                  <h2 className="text-base font-semibold text-white">Strategy Chat</h2>
                </div>
                <button
                  onClick={() => workbenchStore.showWorkbench.set(false)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-all duration-200 group"
                  title="Close Workbench"
                >
                  <div className="i-ph:x text-lg text-gray-400 group-hover:text-white transition-colors" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
              <Messages
                messages={messages}
                isStreaming={isStreaming}
              />
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="hidden md:block w-1 bg-gray-800/50 hover:bg-blue-500 transition-all duration-200" />

        {/* CENTER: Code Editor + Logs */}
        <Panel defaultSize={50} minSize={30}>
          <PanelGroup direction="vertical">
            {/* Code Editor */}
            <Panel defaultSize={60} minSize={30}>
              <div className="h-full flex flex-col bg-[#0a0e17]">
                <div className="flex-shrink-0 px-6 py-4 border-b border-gray-800/50 backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <div className="i-ph:file-py-fill text-white text-lg" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-white">
                          {selectedFile?.split('/').pop() || 'strategy.py'}
                        </h2>
                        <p className="text-xs text-gray-400">Python Trading Strategy</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={classNames(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all duration-200",
                        botStatus === 'running' && "bg-green-500/10 text-green-400 border border-green-500/30",
                        botStatus === 'deploying' && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
                        botStatus === 'error' && "bg-red-500/10 text-red-400 border border-red-500/30",
                        botStatus === 'idle' && "bg-gray-500/10 text-gray-400 border border-gray-500/30"
                      )}>
                        {botStatus === 'running' && <><div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Live</>}
                        {botStatus === 'deploying' && <><div className="i-svg-spinners:ring-resize animate-spin" /> Deploying</>}
                        {botStatus === 'error' && <><div className="i-ph:x-circle-fill" /> Error</>}
                        {botStatus === 'idle' && <><div className="w-2 h-2 rounded-full bg-gray-400" /> Ready</>}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden bg-[#0d1117]">
                  <EditorPanel />
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="h-1 bg-gray-800/50 hover:bg-blue-500 transition-all duration-200" />

            {/* Logs Panel */}
            <Panel defaultSize={40} minSize={20}>
              <div className="h-full flex flex-col bg-[#0a0e17]">
                <div className="flex-shrink-0 px-6 py-4 border-b border-gray-800/50 backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                        <div className="i-ph:terminal-window-fill text-white text-lg" />
                      </div>
                      <h2 className="text-base font-semibold text-white">Execution Logs</h2>
                    </div>
                    <button
                      onClick={() => setDeploymentLogs([])}
                      className="px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 rounded-lg transition-all duration-200 text-gray-300"
                    >
                      Clear Logs
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 font-mono text-xs bg-[#0d1117] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                  {isLoadingData && deploymentLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full animate-pulse">
                      <div className="i-ph:terminal-window text-4xl text-gray-600 mb-3" />
                      <span className="text-sm text-gray-500">Waiting for strategy execution...</span>
                    </div>
                  ) : deploymentLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <div className="i-ph:file-magnifying-glass text-4xl text-gray-600 mb-3" />
                      <span className="text-sm text-gray-500">No logs yet</span>
                    </div>
                  ) : (
                    deploymentLogs.map((log, index) => (
                      <div
                        key={index}
                        className={classNames(
                          "py-1 leading-relaxed",
                          log.includes('✓') && "text-green-400",
                          log.includes('❌') && "text-red-400",
                          log.includes('⚙️') && "text-blue-400",
                          log.includes('🚀') && "text-purple-400",
                          log.includes('📊') && "text-cyan-400",
                          !log.match(/[✓❌⚙️🚀📊]/) && "text-gray-400"
                        )}
                      >
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-800/50 hover:bg-blue-500 transition-all duration-200" />

        {/* RIGHT: Charts & Backtests */}
        <Panel defaultSize={30} minSize={25} maxSize={40}>
          <div className="h-full flex flex-col bg-gradient-to-b from-[#0f1419] to-[#0a0e17]">
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-800/50 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex gap-2 bg-white/5 rounded-lg p-1">
                  <button
                    onClick={() => setShowBacktests(false)}
                    className={classNames(
                      "px-4 py-2 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-2",
                      !showBacktests
                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/50"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <div className="i-ph:chart-line-fill" />
                    Chart
                  </button>
                  <button
                    onClick={() => setShowBacktests(true)}
                    className={classNames(
                      "px-4 py-2 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-2",
                      showBacktests
                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/50"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <div className="i-ph:list-bullets-fill" />
                    Backtest
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-[#0d1117]">
              {showBacktests ? (
                <div className="relative w-full h-full">
                  {isLoadingData && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117] z-10">
                      <div className="flex flex-col items-center gap-4 animate-pulse">
                        <div className="i-ph:list-bullets text-5xl text-gray-600" />
                        <span className="text-sm text-gray-500 font-medium">Generating backtest data...</span>
                      </div>
                    </div>
                  )}
                  <BacktestMetrics result={backtestResult} />
                </div>
              ) : (
                <div className="relative w-full h-full">
                  {isLoadingData && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117] z-10">
                      <div className="flex flex-col items-center gap-4 animate-pulse">
                        <div className="i-ph:chart-line text-5xl text-gray-600" />
                        <span className="text-sm text-gray-500 font-medium">Rendering chart with indicators...</span>
                      </div>
                    </div>
                  )}
                  <BacktestChart
                    pythonCode={currentDocument?.value || ''}
                    symbol="BTC/USDT"
                    onBacktestComplete={setBacktestResult}
                    onLogs={handleBacktestLogs}
                  />
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
      </div>
    </>
  );
});

EnhancedWorkbench.displayName = 'EnhancedWorkbench';
