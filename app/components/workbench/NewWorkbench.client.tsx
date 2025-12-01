import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { EditorPanel } from './EditorPanel';
import { BacktestsPanel } from './BacktestsPanel';
import { LogsPanel } from './LogsPanel';
import { Preview as TVChartContainer } from './TVChartContainer';
import { executeBacktest, type BacktestResult } from '~/lib/backtest';
import { toast } from 'react-toastify';
import type { FileMap } from '~/lib/stores/files';

interface NewWorkbenchProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

export const NewWorkbench = memo(({ chatStarted, isStreaming }: NewWorkbenchProps) => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const { messages } = useStore(chatStore);

  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [strategyName, setStrategyName] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  useEffect(() => {
    if (currentDocument?.content && isPythonStrategyFile(selectedFile)) {
      runBacktestAutomatically(currentDocument.content);
    }
  }, [currentDocument?.content, selectedFile]);

  const isPythonStrategyFile = (filePath: string | undefined): boolean => {
    if (!filePath) return false;
    return filePath.endsWith('.py') && filePath.includes('strategy');
  };

  const runBacktestAutomatically = async (pythonCode: string) => {
    if (isBacktesting) return;

    setIsBacktesting(true);

    try {
      const result = await executeBacktest(pythonCode, selectedSymbol, 1000);
      setBacktestResult(result);

      const match = pythonCode.match(/class\s+(\w+)/);
      if (match) {
        setStrategyName(match[1]);
      }
    } catch (error) {
      console.error('Backtest failed:', error);
      toast.error('Failed to run backtest simulation');
    } finally {
      setIsBacktesting(false);
    }
  };

  const onEditorChange = useCallback((update: any) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback((position: any) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  if (!chatStarted || !showWorkbench) {
    return null;
  }

  return (
    <>
      <CollapsibleSidebar />

      <div
        className={classNames(
          'fixed top-[var(--header-height)] bottom-0 right-0 bg-bolt-elements-background-depth-1 transition-all duration-300',
          'left-16'
        )}
      >
        <PanelGroup direction="horizontal" className="h-full">
          <Panel defaultSize={35} minSize={25} maxSize={50}>
            <div className="h-full flex flex-col border-r border-bolt-elements-borderColor">
              <div className="flex items-center justify-between px-4 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                <div className="flex items-center gap-2">
                  <div className="i-ph:code text-lg text-bolt-elements-textSecondary" />
                  <span className="text-sm font-semibold text-bolt-elements-textPrimary">
                    Strategy Code
                  </span>
                </div>

                <button
                  onClick={() => onFileSave()}
                  className="px-3 py-1.5 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded text-xs font-medium hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
                >
                  Save
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                <EditorPanel
                  editorDocument={currentDocument}
                  isStreaming={isStreaming}
                  selectedFile={selectedFile}
                  files={files}
                  unsavedFiles={unsavedFiles}
                  onFileSelect={onFileSelect}
                  onEditorScroll={onEditorScroll}
                  onEditorChange={onEditorChange}
                  onFileSave={onFileSave}
                  onFileReset={onFileReset}
                />
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-bolt-elements-borderColor hover:bg-accent-500 transition-colors" />

          <Panel defaultSize={65} minSize={50}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={50} minSize={30}>
                <PanelGroup direction="horizontal">
                  <Panel defaultSize={50} minSize={30}>
                    <div className="h-full flex flex-col border-r border-b border-bolt-elements-borderColor">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                        <div className="flex items-center gap-2">
                          <div className="i-ph:chart-bar text-lg text-bolt-elements-textSecondary" />
                          <span className="text-sm font-semibold text-bolt-elements-textPrimary">
                            Backtests
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-bolt-elements-textTertiary">
                            {strategyName || 'No strategy'}
                          </span>

                          <button className="px-3 py-1.5 bg-accent-500 text-white rounded text-xs font-medium hover:bg-accent-600 transition-colors">
                            Launch Bot
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto">
                        {isBacktesting ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="flex flex-col items-center gap-3">
                              <div className="i-svg-spinners:90-ring-with-bg text-3xl text-accent-500" />
                              <span className="text-sm text-bolt-elements-textSecondary">
                                Running backtest simulation...
                              </span>
                            </div>
                          </div>
                        ) : backtestResult ? (
                          <div className="p-4">
                            <div className="space-y-4">
                              <div className="grid grid-cols-3 gap-4">
                                <MetricCard
                                  label="ROI"
                                  value={`${backtestResult.roi.toFixed(2)}%`}
                                  positive={backtestResult.roi > 0}
                                />
                                <MetricCard
                                  label="Max DD"
                                  value={`${backtestResult.maxDrawdown.toFixed(2)}%`}
                                  positive={false}
                                />
                                <MetricCard
                                  label="Win Rate"
                                  value={`${backtestResult.winRate.toFixed(1)}%`}
                                  positive={backtestResult.winRate > 50}
                                />
                              </div>

                              <div className="grid grid-cols-3 gap-4">
                                <MetricCard label="Total Trades" value={backtestResult.totalTrades.toString()} />
                                <MetricCard
                                  label="Winning"
                                  value={backtestResult.winningTrades.toString()}
                                  positive={true}
                                />
                                <MetricCard
                                  label="Losing"
                                  value={backtestResult.losingTrades.toString()}
                                  positive={false}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <MetricCard
                                  label="Avg Profit"
                                  value={`$${backtestResult.avgProfit.toFixed(2)}`}
                                />
                                <MetricCard
                                  label="Sharpe Ratio"
                                  value={backtestResult.sharpeRatio.toFixed(2)}
                                />
                              </div>

                              <div className="bg-bolt-elements-background-depth-3 rounded-lg p-3 border border-bolt-elements-borderColor">
                                <div className="text-xs text-bolt-elements-textTertiary mb-2">Balance Progress</div>
                                <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                                  ${backtestResult.finalBalance.toFixed(2)}
                                </div>
                                <div
                                  className={classNames(
                                    'text-sm font-medium mt-1',
                                    backtestResult.roi > 0 ? 'text-green-500' : 'text-red-500'
                                  )}
                                >
                                  {backtestResult.roi > 0 ? '+' : ''}$
                                  {(backtestResult.finalBalance - 1000).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center text-bolt-elements-textTertiary">
                              <div className="i-ph:chart-line text-4xl mb-2" />
                              <p>Generate a strategy to see backtest results</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Panel>

                  <PanelResizeHandle className="w-1 bg-bolt-elements-borderColor hover:bg-accent-500 transition-colors" />

                  <Panel defaultSize={50} minSize={30}>
                    <div className="h-full flex flex-col border-b border-bolt-elements-borderColor">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                        <div className="flex items-center gap-2">
                          <div className="i-ph:chart-candlestick text-lg text-bolt-elements-textSecondary" />
                          <span className="text-sm font-semibold text-bolt-elements-textPrimary">Chart</span>
                        </div>

                        <select
                          value={selectedSymbol}
                          onChange={(e) => setSelectedSymbol(e.target.value)}
                          className="px-2 py-1 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-xs text-bolt-elements-textPrimary"
                        >
                          <option value="BTC/USDT">BTC/USDT</option>
                          <option value="ETH/USDT">ETH/USDT</option>
                          <option value="SOL/USDT">SOL/USDT</option>
                        </select>
                      </div>

                      <div className="flex-1 overflow-hidden p-2">
                        <TVChartContainer />
                      </div>
                    </div>
                  </Panel>
                </PanelGroup>
              </Panel>

              <PanelResizeHandle className="h-1 bg-bolt-elements-borderColor hover:bg-accent-500 transition-colors" />

              <Panel defaultSize={50} minSize={20}>
                <div className="h-full flex flex-col">
                  <div className="flex items-center px-4 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                    <div className="flex items-center gap-2">
                      <div className="i-ph:terminal-window text-lg text-bolt-elements-textSecondary" />
                      <span className="text-sm font-semibold text-bolt-elements-textPrimary">Logs</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto bg-[#1e1e1e] p-4">
                    {backtestResult?.logs && backtestResult.logs.length > 0 ? (
                      <div className="font-mono text-xs space-y-1">
                        {backtestResult.logs.map((log, index) => (
                          <div
                            key={index}
                            className={classNames(
                              'text-gray-300',
                              log.includes('BUY') && 'text-green-400',
                              log.includes('SELL') && log.includes('Profit: +') && 'text-green-400',
                              log.includes('SELL') && log.includes('Profit: -') && 'text-red-400'
                            )}
                          >
                            {log}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                          <div className="i-ph:terminal-window text-4xl mb-2" />
                          <p>No execution logs yet</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </>
  );
});

interface MetricCardProps {
  label: string;
  value: string;
  positive?: boolean;
}

function MetricCard({ label, value, positive }: MetricCardProps) {
  return (
    <div className="bg-bolt-elements-background-depth-3 rounded-lg p-3 border border-bolt-elements-borderColor">
      <div className="text-xs text-bolt-elements-textTertiary mb-1">{label}</div>
      <div
        className={classNames(
          'text-lg font-bold',
          positive === true && 'text-green-500',
          positive === false && 'text-red-500',
          positive === undefined && 'text-bolt-elements-textPrimary'
        )}
      >
        {value}
      </div>
    </div>
  );
}
