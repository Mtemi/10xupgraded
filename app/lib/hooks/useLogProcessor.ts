import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

export function useLogProcessor() {
  const [accumulatedLogs, setAccumulatedLogs] = useState<string[]>([]);
  const [isProcessingLogs, setIsProcessingLogs] = useState(false);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);

  // Function to format logs into a chat message
  const formatLogsMessage = (logs: string[], content: string, customInstructions?: string) => {
    return `Improve this trading bot code based on execution logs:

    Current Code:
    \`\`\`python
    ${content}
    \`\`\`

    Execution Logs:
    \`\`\`
    ${logs.join('\n')}
    \`\`\`
    ${customInstructions ? `Additional Instructions: ${customInstructions}` : ''}

    Return ONLY the improved Python code.`;
  };

  // Function to add new log
  const addLog = (log: string) => {
    setAccumulatedLogs(prev => [...prev, log]);
  };

  // Function to clear logs
  const clearLogs = () => {
    setAccumulatedLogs([]);
  };

  // Function to check if we have enough logs for processing
  const hasEnoughLogs = async (userId: string, fileName: string) => {
    try {
      const { data: notebookStatus } = await supabase
        .from('notebook_statuses')
        .select('chunk_size')
        .eq('user_id', userId)
        .eq('notebook_name', `${fileName}.py`)
        .single();

      if (!notebookStatus?.chunk_size) {
        return false;
      }

      return accumulatedLogs.length >= notebookStatus.chunk_size;
    } catch (error) {
      console.error('Error checking log count:', error);
      return false;
    }
  };

  // Function to get formatted message when ready
  const getFormattedMessage = async () => {
    if (!selectedFile || !currentDocument) {
      return null;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const fileName = selectedFile.split('/').pop()?.replace(/\.py$/, '');
      if (!fileName) return null;

      const { data: notebookStatus } = await supabase
        .from('notebook_statuses')
        .select('chunk_size, custom_instructions')
        .eq('user_id', user.id)
        .eq('notebook_name', `${fileName}.py`)
        .single();

      if (!notebookStatus?.chunk_size) return null;

      const chunkSize = notebookStatus.chunk_size;
      const latestLogs = accumulatedLogs.slice(-chunkSize);

      if (latestLogs.length >= chunkSize) {
        return formatLogsMessage(
          latestLogs,
          currentDocument.value,
          notebookStatus.custom_instructions
        );
      }
    } catch (error) {
      console.error('Error preparing message:', error);
    }

    return null;
  };

  return {
    addLog,
    clearLogs,
    hasEnoughLogs,
    getFormattedMessage,
    isProcessingLogs,
    setIsProcessingLogs,
    logCount: accumulatedLogs.length
  };
}