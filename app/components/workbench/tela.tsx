import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { toast } from "react-toastify";
import { supabase } from '~/lib/superbase/client';
import { ApiKeyDialog } from '~/components/auth/ApiKeyDialog';
import { detectApiKeyVariables } from '~/utils/script-parser';
import { webcontainer } from '~/lib/webcontainer';
import { useNotebookStatus } from '~/lib/hooks/useNotebookStatus';
import { LiveTradingAIDialog } from './LiveTradingAIDialog';
import { estimateTokens, checkTokenAvailability, trackTokenUsage } from '~/lib/token-tracking';
import { chatStore, type ChatState, type ChatMessage, sendChatMessage } from '~/lib/stores/chat';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useChat } from 'ai/react';
import { useChatActions } from '~/lib/hooks/useChatActions';
import { useMessageSubmit } from '~/lib/hooks/useMessageSubmit';

const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 640;
};

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: () => void;
  onFileReset?: () => void;
}

const DEFAULT_TERMINAL_SIZE = 25;
const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;
const editorSettings: EditorSettings = { tabSize: 2 };

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);
    const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
    const [showAIDialog, setShowAIDialog] = useState(false);
    const [pendingScriptContent, setPendingScriptContent] = useState<string | null>(null);
    const [isProcessingAI, setIsProcessingAI] = useState(false);
    const [hasLogs, setHasLogs] = useState(false);
    const [terminalVisible, setTerminalVisible] = useState(false);

    const terminalRef = useRef<TerminalRef>(null);
    const terminalPanelRef = useRef<ImperativePanelHandle>(null);
    const terminalToggledByShortcut = useRef(false);
    const [hasTunedVersions, setHasTunedVersions] = useState(false);
    const [localCurrentVersion, setLocalCurrentVersion] = useState(0);
    const [isInitializing, setIsInitializing] = useState(false);
    const [accumulatedLogs, setAccumulatedLogs] = useState<string[]>([]);
    const [isProcessingLogs, setIsProcessingLogs] = useState(false);
    const { status, error, logs } = useNotebookStatus(selectedFile);
    const { submitMessage } = useMessageSubmit();

    useEffect(() => {
      if (terminalRef.current && logs.length > 0 && terminalVisible) {
        const lastLog = logs[logs.length - 1];
        terminalRef.current.write(lastLog + '\n');
        setHasLogs(true);
        setAccumulatedLogs(prevLogs => [...prevLogs, lastLog]);
      }
    }, [logs, terminalVisible]);

    const { sendMessage } = useChatActions();

    useEffect(() => {
      // Only proceed if the terminal is visible, not already processing logs, and necessary data exists.
      if (
        !terminalVisible ||
        isProcessingLogs ||
        accumulatedLogs.length === 0 ||
        !selectedFile ||
        !editorDocument
      ) {
        return;
      }

      const processLogs = async () => {
        try {
          setIsProcessingLogs(true);

          // Retrieve the authenticated user.
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log('No authenticated user found');
            return;
          }

          // Extract the file name.
          const fileName = selectedFile.split('/').pop()?.replace(/\.py$/, '');
          if (!fileName) {
            console.log('Invalid file name');
            return;
          }

          // Get configuration and current script version.
          const [notebookStatus, scriptResponse] = await Promise.all([
            supabase
              .from('notebook_statuses')
              .select('chunk_size, iterations, custom_instructions')
              .eq('user_id', user.id)
              .eq('notebook_name', `${fileName}.py`)
              .single(),
            supabase
              .from('trading_scripts')
              .select('content_v1, content_v2, content_v3, content_v4, content_v5, current_version')
              .eq('user_id', user.id)
              .eq('name', fileName)
              .single()
          ]);

          // Abort if configuration data is missing.
          if (!notebookStatus.data?.chunk_size || !notebookStatus.data?.iterations) {
            console.log('No configuration found:', notebookStatus);
            return;
          }

          const targetIterations = notebookStatus.data.iterations;
          const chunkSize = notebookStatus.data.chunk_size;
          const fetchedVersion = scriptResponse.data?.current_version || 0;
          // Use the higher value between the local current version and the fetched version.
          const currentVersion = Math.max(localCurrentVersion, fetchedVersion);

          console.log('targetIterations:', { targetIterations });
          console.log('chunkSize:', { chunkSize });
          console.log('currentVersion:', { currentVersion });

          // If we've reached the target iterations, clear the log buffer and exit.
          if (currentVersion >= targetIterations) {
            console.log('All target iterations completed:', { currentVersion, targetIterations });
            setAccumulatedLogs([]);
            return;
          }

          // Only process if enough logs have accumulated.
          if (accumulatedLogs.length >= chunkSize) {
            const latestChunk = accumulatedLogs.slice(-chunkSize).join('\n');
            const currentContent = editorDocument?.value || '';

            console.log('latestChunk:', { latestChunk });

            // Check token availability
            const estimatedTokens = await estimateTokens(
              currentContent +
              latestChunk +
              (notebookStatus.data.custom_instructions || '')
            );
            const hasTokens = await checkTokenAvailability(user.id, estimatedTokens);
            if (!hasTokens) return;

            // Get current chat ID
            const currentChatId = chatId.get();
            if (!currentChatId) {
              console.error('No active chat ID found');
              toast.error('No active chat session');
              return;
            }

            // Construct the message
            const message = `Improve this trading bot code based on execution logs:
    
    Current Code:
    \`\`\`python
    ${currentContent}
    \`\`\`
    
    Execution Logs:
    \`\`\`
    ${latestChunk}
    \`\`\`
    ${notebookStatus.data.custom_instructions ? `Additional Instructions: ${notebookStatus.data.custom_instructions}` : ''}
    
    Return ONLY the improved Python code.`;

            console.log('Adding message to chat:', currentChatId);

            // Submit the message using shared hook
            const response = await submitMessage(message);
            if (response) {
              const improvedScript = extractScriptFromResponse(response.content);
              if (improvedScript) {
                const nextVersion = currentVersion + 1;
                const updateData = {
                  [`content_v${nextVersion}`]: improvedScript,
                  current_version: nextVersion,
                  last_improved_at: new Date().toISOString()
                };

                // Update the script in the database
                const { error: updateError } = await supabase
                  .from('trading_scripts')
                  .update(updateData)
                  .eq('user_id', user.id)
                  .eq('name', fileName);

                if (updateError) {
                  console.error('Error updating script:', updateError);
                  toast.error('Failed to save improved version');
                  return;
                }

                // Update UI state
                toast.success(`Created improved version v${nextVersion} of ${targetIterations}`);
                setHasTunedVersions(true);
                setLocalCurrentVersion(nextVersion);
                setAccumulatedLogs([]);

                console.log('Successfully processed version:', {
                  version: nextVersion,
                  targetIterations,
                  remainingIterations: targetIterations - nextVersion
                });
              }
            }
          }
        } catch (error) {
          console.error('Error processing AI improvements:', error);
          toast.error('Failed to process improvements');
        } finally {
          setIsProcessingLogs(false);
        }
      };

      processLogs();
    }, [accumulatedLogs, terminalVisible, selectedFile, editorDocument, isProcessingLogs, localCurrentVersion, submitMessage]);

    const handleAIAnalysis = async (config: { chunkSize: number; iterations: number; customInstructions: string }) => {
      if (!selectedFile || !editorDocument) {
        toast.error('No file selected');
        return;
      }

      setIsProcessingAI(true);
      let iterationCount = 0;
      let logBuffer: string[] = [];

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to use AI analysis');
          return;
        }

        const currentFile = workbenchStore.files.get()[selectedFile];
        if (!currentFile || currentFile.type !== 'file') {
          throw new Error('Invalid file');
        }

        const processLogChunk = async (chunk: string[]) => {
          try {
            const promptText = `
              Analyze these trading bot execution logs and suggest improvements:

              Current Script:
              \`\`\`python
              ${currentFile.content}
              \`\`\`

              Recent Logs:
              \`\`\`
              ${chunk.join('\n')}
              \`\`\`

              ${config.customInstructions ? `Additional Instructions: ${config.customInstructions}\n` : ''}

              Please:
              1. Analyze the trading performance and errors
              2. Suggest specific improvements
              3. Provide an improved version of the script
            `;

            const response = await submitMessage(promptText);

            if (response) {
              const improvedScript = extractScriptFromResponse(response.content);
              if (improvedScript) {
                const timestamp = Date.now();
                const baseName = selectedFile.split('/').pop()?.replace('.py', '') || 'script';
                const newFileName = `${baseName}_improved_${timestamp}.py`;

                await workbenchStore.saveFile(`/home/project/${newFileName}`, improvedScript);

                toast.success(`New improved version available: ${newFileName}`);
                console.log('[AI Analysis] Created improved version:', newFileName);
              }

              iterationCount++;
              if (config.iterations !== -1 && iterationCount >= config.iterations) {
                setIsProcessingAI(false);
                setShowAIDialog(false);
                toast.success('AI analysis complete');
              }
            }

          } catch (error) {
            console.error('[AI Analysis] Error processing log chunk:', error);
            toast.error(error.message || 'Failed to process log chunk');
            setIsProcessingAI(false);
          }
        };

        if (logs.length >= config.chunkSize) {
          const initialChunk = logs.slice(-config.chunkSize);
          await processLogChunk(initialChunk);
        }

        const handleNewLog = (log: string) => {
          logBuffer.push(log);

          if (logBuffer.length >= config.chunkSize) {
            const chunk = [...logBuffer];
            logBuffer = [];
            processLogChunk(chunk);
          }
        };

        socket.on('execution_log', (data: { notebook_name: string; output: string }) => {
          if (data.notebook_name === selectedFile) {
            handleNewLog(data.output);
          }
        });

      } catch (error) {
        console.error('[AI Analysis] Error in AI analysis:', error);
        toast.error('Failed to start AI analysis');
        setIsProcessingAI(false);
      }
    };

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }
      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    useEffect(() => {
      const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
        terminalToggledByShortcut.current = true;
      });

      const unsubscribeFromThemeStore = themeStore.subscribe(() => {
        if (terminalRef.current) {
          terminalRef.current.reloadStyles();
        }
      });

      return () => {
        unsubscribeFromEventEmitter();
        unsubscribeFromThemeStore();
      };
    }, []);

    useEffect(() => {
      const loadScripts = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: scripts, error } = await supabase
            .from('trading_scripts')
            .select('*')
            .eq('user_id', user.id);

          if (error) {
            console.error('Error loading scripts:', error);
            return;
          }

          const container = await webcontainer;
          if (!container) {
            console.error('WebContainer not initialized');
            return;
          }

          for (const script of scripts) {
            const filePath = `/home/project/${script.name}.py`;
            await container.fs.writeFile(filePath, script.content);
          }
        } catch (error) {
          console.error('Error loading scripts:', error);
        }
      };

      loadScripts();
    }, []);

    useEffect(() => {
      const { current: terminal } = terminalPanelRef;

      if (!terminal) {
        return;
      }

      const isCollapsed = terminal.isCollapsed();

      if (!showTerminal && !isCollapsed) {
        terminal.collapse();
        setTerminalVisible(false);
      } else if (showTerminal && isCollapsed) {
        terminal.resize(DEFAULT_TERMINAL_SIZE);
        setTerminalVisible(true);
      }

      terminalToggledByShortcut.current = false;
    }, [showTerminal]);

    const handleStopScript = async () => {
      if (!selectedFile) return;

      const fileName = selectedFile.split('/').pop() || '';

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to stop scripts');
          return;
        }

        if (status !== 'running' && status !== 'initializing') {
          toast.warning('Script is not currently running');
          return;
        }

        const { data: notebookStatus, error: statusError } = await supabase
          .from('notebook_statuses')
          .select('process_id, status')
          .eq('user_id', user.id)
          .eq('notebook_name', fileName)
          .single();

        console.log('[Stop] Current notebook status:', notebookStatus);

        const requestBody = {
          notebook_name: fileName,
          user_id: user.id,
          process_id: notebookStatus?.process_id || null
        };

        console.log('[Stop] Sending stop request:', requestBody);

        const response = await fetch('/apa/stop-notebook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorMessage = 'Failed to stop script';

          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            errorMessage = data.error || errorMessage;
          } else {
            const text = await response.text();
            console.error('[Stop] Non-JSON error response:', text);
          }

          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('[Stop] Stop request successful:', data);

        if (data.status === 'success') {
          const details = data.details || {};
          let message = data.message;

          if (details.process_terminated !== undefined) {
            message += details.process_terminated
              ? ' (Process terminated successfully)'
              : ' (Process termination not required or failed)';
          }

          toast.info(message);
        } else {
          toast.warning(data.message || 'Stop request processed with warnings');
        }

      } catch (error) {
        console.error('[Stop] Error stopping script:', error);
        toast.error(error.message || 'Failed to stop script');
      }
    };

    const handleRunScript = async () => {
      if (!selectedFile || !editorDocument) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to run scripts');
          return;
        }

        const fileName = selectedFile.split('/').pop() || '';

        if (status === 'running' || status === 'stopping') {
          toast.warning(`Script is already ${status}`);
          return;
        }

        if (detectApiKeyVariables(editorDocument.value)) {
          setPendingScriptContent(editorDocument.value);
          setShowApiKeyDialog(true);
          return;
        }

        setIsInitializing(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        const startTime = Date.now();
        const response = await fetch('/apa/run-notebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.email,
            notebook_name: fileName,
            user_id: user.id,
            content: editorDocument.value
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to run script');
        }

        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) {
          await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
        }
      } catch (error) {
        console.error('Error running script:', error);
        toast.error(error.message || 'Failed to run script');
      } finally {
        setIsInitializing(false);
      }
    };

    const handleApiKeyConfirm = async (apiKey: string, apiSecret: string) => {
      if (!pendingScriptContent || !selectedFile) return;

      setIsInitializing(true);
      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          toast.error('Please sign in to run scripts');
          return;
        }

        const fileName = selectedFile.split('/').pop() || '';
        const contentWithKeys = appendApiKeysToScript(pendingScriptContent, apiKey, apiSecret);

        const startTime = Date.now();
        const response = await fetch('/apa/run-notebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.email,
            notebook_name: fileName,
            user_id: user.id,
            content: contentWithKeys
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to run script');
        }

        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) {
          await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
        }

        setPendingScriptContent(null);
        setShowApiKeyDialog(false);

      } catch (error) {
        console.error('Error running script:', error);
        toast.error(error.message || 'Failed to run script');
      } finally {
        setIsInitializing(false);
      }
    };

    const appendApiKeysToScript = (content: string, apiKey: string, apiSecret: string) => {
      const lines = content.split('\n');
      let modifiedLines = [...lines];

      const apiKeyPattern = /(BINANCE_API_KEY|API_KEY)\s*=\s*(["'].*["']|None|''|""|\{.*\}|\[.*\]|\(.*\))?/;
      const apiSecretPattern = /(BINANCE_API_SECRET|API_SECRET|SECRET_KEY)\s*=\s*(["'].*["']|None|''|""|\{.*\}|\[.*\]|\(.*\))?/;

      let keyFound = false;
      let secretFound = false;
      let keyVarName = 'BINANCE_API_KEY';
      let secretVarName = 'BINANCE_API_SECRET';

      for (const line of lines) {
        const keyMatch = line.match(apiKeyPattern);
        const secretMatch = line.match(apiSecretPattern);

        if (keyMatch && keyMatch[1]) {
          keyVarName = keyMatch[1];
        }
        if (secretMatch && secretMatch[1]) {
          secretVarName = secretMatch[1];
        }
      }

      modifiedLines = modifiedLines.map(line => {
        if (apiKeyPattern.test(line)) {
          keyFound = true;
          return `${keyVarName} = "${apiKey}"  # Updated by TBB`;
        }
        if (apiSecretPattern.test(line)) {
          secretFound = true;
          return `${secretVarName} = "${apiSecret}"  # Updated by TBB`;
        }
        return line;
      });

      if (!keyFound || !secretFound) {
        let insertIndex = 0;
        for (let i = 0; i < modifiedLines.length; i++) {
          if (modifiedLines[i].trim().startsWith('import') || modifiedLines[i].trim().startsWith('from')) {
            insertIndex = i + 1;
          }
        }

        const keysToAdd = [];
        if (!keyFound) {
          keysToAdd.push(`${keyVarName} = "${apiKey}"  # Added by TBB`);
        }
        if (!secretFound) {
          keysToAdd.push(`${secretVarName} = "${apiSecret}"  # Added by TBB`);
        }

        modifiedLines.splice(insertIndex, 0, '', ...keysToAdd, '');
      }

      return modifiedLines.join('\n');
    };

    const getRunButtonText = (fileName: string) => {
      if (isInitializing) return 'Initializing...';
      switch (status) {
        case 'initializing': return 'Initializing...';
        case 'running': return 'Running';
        case 'stopping': return 'Stopping...';
        case 'failed': return 'Run';
        case 'completed': return 'Run Again';
        case 'stopped': return 'Run';
        default: return 'Run';
      }
    };

    useEffect(() => {
      const checkTunedVersions = async () => {
        if (!selectedFile) return;

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const fileName = selectedFile.split('/').pop()?.replace('.py', '');

          const { data: script } = await supabase
            .from('trading_scripts')
            .select('current_version')
            .eq('user_id', user.id)
            .eq('name', fileName)
            .single();

          setHasTunedVersions(script?.current_version > 0);
        } catch (error) {
          console.error('Error checking tuned versions:', error);
        }
      };

      checkTunedVersions();
    }, [selectedFile]);

    return (
      <>
        <PanelGroup direction="vertical">
          <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
            <PanelGroup direction="horizontal">
              <Panel defaultSize={20} minSize={10} collapsible>
                <div className="flex flex-col border-r border-bolt-elements-borderColor h-full">
                  <PanelHeader>
                    <div className="i-ph:tree-structure-duotone shrink-0" />
                    Files
                  </PanelHeader>
                  <FileTree
                    className="h-full"
                    files={files}
                    hideRoot
                    unsavedFiles={unsavedFiles}
                    rootFolder={WORK_DIR}
                    selectedFile={selectedFile}
                    onFileSelect={onFileSelect}
                  />
                </div>
              </Panel>
              <PanelResizeHandle />
              <Panel className="flex flex-col" defaultSize={80} minSize={20}>
                <PanelHeader className="overflow-x-auto">
                  {activeFileSegments?.length && (
                    <div className="flex items-center flex-1 text-sm">
                      <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />

                      {activeFileSegments[activeFileSegments.length - 1].endsWith('.py') && editorDocument && (
                        <div className="flex items-center gap-2 ml-2">

                          <button
                            onClick={handleRunScript}
                            disabled={['running', 'stopping', 'initializing'].includes(status) || isInitializing}
                            className={classNames(
                              "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                              "flex items-center gap-2",
                              {
                                'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover':
                                  !['running', 'stopping', 'initializing'].includes(status) && !isInitializing,
                                'bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text':
                                  ['running', 'stopping', 'initializing'].includes(status) || isInitializing,
                                'cursor-not-allowed opacity-75': ['running', 'stopping', 'initializing'].includes(status) || isInitializing
                              }
                            )}
                          >
                            <div className={classNames(
                              "i-ph:play-circle",
                              { "animate-spin": ['running', 'stopping', 'initializing'].includes(status) || isInitializing }
                            )} />
                            {getRunButtonText(activeFileSegments[activeFileSegments.length - 1])}
                          </button>

                          {status === 'running' && (
                            <button
                              onClick={handleStopScript}
                              disabled={status === 'stopping'}
                              className={classNames(
                                "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                                "flex items-center gap-2",
                                {
                                  'bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover':
                                    status !== 'stopping',
                                  'cursor-not-allowed opacity-75': status === 'stopping'
                                }
                              )}
                            >
                              <div className={classNames(
                                "i-ph:stop-circle",
                                { "animate-spin": status === 'stopping' }
                              )} />
                              {status === 'stopping' ? 'Stopping...' : 'Stop'}
                            </button>
                          )}

                          {hasLogs && (
                            <button
                              onClick={() => setShowAIDialog(true)}
                              disabled={isProcessingAI}
                              className={classNames(
                                "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                                "flex items-center gap-2",
                                "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover",
                                { "cursor-not-allowed opacity-75": isProcessingAI }
                              )}
                            >
                              <div className={classNames(
                                "i-ph:robot",
                                { "animate-spin": isProcessingAI }
                              )} />
                              {isProcessingAI ? 'Processing...' : 'AI Analysis'}
                            </button>
                          )}

                          {hasTunedVersions && (
                            <button
                              onClick={() => {
                                // Handle viewing tuned versions
                              }}
                              className="px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-2 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover"
                            >
                              <div className="i-ph:git-branch" />
                              View Tuned Versions
                            </button>
                          )}

                          {activeFileUnsaved && (
                            <div className="flex gap-1 ml-auto -mr-1.5">
                              <PanelHeaderButton onClick={onFileSave}>
                                <div className="i-ph:floppy-disk-duotone" />
                                Save
                              </PanelHeaderButton>
                              <PanelHeaderButton onClick={onFileReset}>
                                <div className="i-ph:clock-counter-clockwise-duotone" />
                                Reset
                              </PanelHeaderButton>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </PanelHeader>

                <div className="h-full flex-1 overflow-hidden">
                  <CodeMirrorEditor
                    theme={theme}
                    editable={!isStreaming && editorDocument !== undefined}
                    settings={editorSettings}
                    doc={editorDocument}
                    autoFocusOnDocumentChange={!isMobile()}
                    onScroll={onEditorScroll}
                    onChange={onEditorChange}
                    onSave={onFileSave}
                  />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle />

          <Panel
            ref={terminalPanelRef}
            defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
            minSize={10}
            collapsible
            onExpand={() => {
              if (!terminalToggledByShortcut.current) {
                workbenchStore.toggleTerminal(true);
                setTerminalVisible(true);
              }
            }}
            onCollapse={() => {
              if (!terminalToggledByShortcut.current) {
                workbenchStore.toggleTerminal(false);
                setTerminalVisible(false);
              }
            }}
          >

            {terminalVisible && (
              <div className="h-full">
                <div className="bg-bolt-elements-terminals-background h-full flex flex-col">
                  <div className="flex items-center bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2">
                    <div className="flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary">
                      <div className="i-ph:terminal-window-duotone text-lg" />
                      Output Terminal
                      {status && (
                        <span className={classNames(
                          'ml-2 px-2 py-0.5 rounded-full text-xs',
                          {
                            'bg-green-500/20 text-green-500': status === 'running',
                            'bg-red-500/20 text-red-500': status === 'failed',
                            'bg-gray-500/20 text-gray-500': status === 'stopped',
                            'bg-yellow-500/20 text-yellow-500': status === 'stopping',
                            'bg-blue-500/20 text-blue-500': status === 'completed',
                            'bg-purple-500/20 text-purple-500': status === 'initializing' || isInitializing
                          }
                        )}>
                          {isInitializing ? 'Initializing' : status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      )}
                    </div>
                    {hasLogs && (
                      <button
                        onClick={() => setShowAIDialog(true)}
                        className={classNames(
                          "ml-2 px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                          "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
                          "hover:bg-bolt-elements-button-primary-backgroundHover",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        disabled={isProcessingAI}
                      >
                        <div className={classNames(
                          "i-ph:robot",
                          { "animate-spin": isProcessingAI }
                        )} />
                        {hasLogs && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowAIDialog(true)}
                              className={classNames(
                                "px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                                "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
                                "hover:bg-bolt-elements-button-primary-backgroundHover",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                              disabled={isProcessingAI}
                            >
                              {isProcessingAI ? "Processing..." : "Fine Tune with AI"}
                              <div
                                className="ml-1 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary cursor-help"
                                title="AI will analyze your logs and suggest improvements to your trading strategy"
                              >
                                <div className="i-ph:question-circle" />
                              </div>
                            </button>
                            {hasTunedVersions && (
                              <span className="text-sm text-green-500 flex items-center gap-1">
                                <div className="i-ph:check-circle" />
                                Fine tuned versions available
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    )}
                    <IconButton
                      className="ml-auto"
                      icon="i-ph:caret-down"
                      title="Close"
                      size="md"
                      onClick={() => {
                        workbenchStore.toggleTerminal(false);
                        setTerminalVisible(false);
                      }}
                    />
                  </div>
                  <Terminal
                    className="h-full overflow-hidden"
                    ref={terminalRef}
                    onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                    onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                    theme={theme}
                    logs={logs}
                  />
                </div>
              </div>
            )}
          </Panel>

        </PanelGroup>

        <ApiKeyDialog
          isOpen={showApiKeyDialog}
          onClose={() => {
            setShowApiKeyDialog(false);
            setPendingScriptContent(null);
          }}
          onConfirm={handleApiKeyConfirm}
          platformId="binance"
        />

        <LiveTradingAIDialog
          isOpen={showAIDialog}
          onClose={() => setShowAIDialog(false)}
          selectedFile={selectedFile}
        />
      </>
    );
  },
);

function extractScriptFromResponse(response: string): string | null {
  const match = response.match(/```python\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}
