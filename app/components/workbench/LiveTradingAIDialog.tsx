import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { classNames } from '~/utils/classNames';
import { IconButton } from '../ui/IconButton';
import { IoMdHelpCircle } from "react-icons/io";
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';

interface LiveTradingAIDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFile?: string;
}

const CHUNK_SIZE_OPTIONS = [
  { value: 5, label: '5 logs' },
  { value: 10, label: '10 logs' },
  { value: 15, label: '15 logs' },
  { value: 20, label: '20 logs' },
  { value: -1, label: 'Custom' }
];

const ITERATION_OPTIONS = [
  { value: 2, label: '2 iterations' },
  { value: 4, label: '4 iterations' },
  { value: 6, label: '6 iterations' },
  { value: 8, label: '8 iterations' },
  { value: 10, label: '10 iterations' },
  { value: -1, label: 'Custom' }
];

export function LiveTradingAIDialog({ isOpen, onClose, selectedFile }: LiveTradingAIDialogProps) {
  const [chunkSize, setChunkSize] = useState(5);
  const [iterations, setIterations] = useState(2);
  const [customChunkSize, setCustomChunkSize] = useState('');
  const [customIterations, setCustomIterations] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showCustomChunkSize, setShowCustomChunkSize] = useState(false);
  const [showCustomIterations, setShowCustomIterations] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChunkSizeChange = (value: number) => {
    if (value === -1) {
      setShowCustomChunkSize(true);
    } else {
      setShowCustomChunkSize(false);
      setChunkSize(value);
    }
  };

  const handleIterationsChange = (value: number) => {
    if (value === -1) {
      setShowCustomIterations(true);
    } else {
      setShowCustomIterations(false);
      setIterations(value);
    }
  };

  const validateInputs = () => {
    if (showCustomChunkSize) {
      const parsedChunkSize = parseInt(customChunkSize);
      if (!customChunkSize || isNaN(parsedChunkSize) || parsedChunkSize < 1) {
        toast.error('Please enter a valid chunk size');
        return false;
      }
    }

    if (showCustomIterations) {
      const parsedIterations = parseInt(customIterations);
      if (!customIterations || isNaN(parsedIterations) || parsedIterations < 1) {
        toast.error('Please enter a valid number of iterations');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateInputs()) return;

    try {
      setIsSubmitting(true);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Please sign in to use this feature');

      if (!selectedFile) {
        throw new Error('No file selected');
      }

      // Get filename with .py extension
      const fileName = selectedFile.split('/').pop();
      if (!fileName) {
        throw new Error('Invalid file name');
      }
      
      // Ensure filename has .py extension
      const pythonFileName = fileName.endsWith('.py') ? fileName : `${fileName}.py`;

      const finalChunkSize = showCustomChunkSize ? parseInt(customChunkSize) : chunkSize;
      const finalIterations = showCustomIterations ? parseInt(customIterations) : iterations;

      // Prepare update data
      const updateData = {
        user_id: user.id,
        notebook_name: pythonFileName,
        chunk_size: finalChunkSize,
        iterations: finalIterations,
        custom_instructions: customInstructions.trim() || null,
        status: 'pending'
      };

      // Update the record using upsert
      const { error: updateError } = await supabase
        .from('notebook_statuses')
        .upsert(updateData, {
          onConflict: 'user_id,notebook_name'
        });

      if (updateError) {
        console.error('Error saving configuration:', updateError);
        throw updateError;
      }

      toast.success('Fine-tuning configuration saved successfully');
      onClose();

    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[999]" />
        <Dialog.Content asChild>
          <motion.div
            className="fixed top-[50%] left-[50%] popupCustomCenter w-[90vw] max-w-[400px] bg-bolt-elements-background-depth-2 rounded-lg p-6 z-[1000] border border-bolt-elements-borderColor"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-xl font-semibold text-bolt-elements-textPrimary">
                AI Log Analysis
              </Dialog.Title>
              <div className="relative">
                <button
                  className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                  onClick={() => setShowHelp(!showHelp)}
                >
                  <IoMdHelpCircle size={20} />
                </button>
                {showHelp && (
                  <div className="absolute right-0 mt-2 p-4 bg-bolt-elements-background-depth-3 rounded-lg shadow-lg border border-bolt-elements-borderColor w-64 z-10">
                    <h4 className="font-medium text-bolt-elements-textPrimary mb-2">About AI Log Analysis</h4>
                    <p className="text-sm text-bolt-elements-textSecondary">
                      AI will analyze your script's execution logs in chunks to suggest improvements. Each iteration creates a new optimized version of your script based on the analysis of log patterns and errors.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-6">
              {/* Chunk Size Selection */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                  Logs per Chunk
                </label>
                <div className="flex gap-2">
                  <select
                    value={showCustomChunkSize ? -1 : chunkSize}
                    onChange={(e) => handleChunkSizeChange(parseInt(e.target.value))}
                    className="flex-1 p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none"
                    disabled={isSubmitting}
                  >
                    {CHUNK_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {showCustomChunkSize && (
                    <input
                      type="number"
                      value={customChunkSize}
                      onChange={(e) => setCustomChunkSize(e.target.value)}
                      placeholder="Enter size"
                      className="w-24 p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none"
                      disabled={isSubmitting}
                    />
                  )}
                </div>
              </div>

              {/* Iterations Selection */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                  Number of Iterations
                </label>
                <div className="flex gap-2">
                  <select
                    value={showCustomIterations ? -1 : iterations}
                    onChange={(e) => handleIterationsChange(parseInt(e.target.value))}
                    className="flex-1 p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none"
                    disabled={isSubmitting}
                  >
                    {ITERATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {showCustomIterations && (
                    <input
                      type="number"
                      value={customIterations}
                      onChange={(e) => setCustomIterations(e.target.value)}
                      placeholder="Enter count"
                      className="w-24 p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none"
                      disabled={isSubmitting}
                    />
                  )}
                </div>
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                  Custom Instructions (Optional)
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Add any specific instructions for AI analysis..."
                  className="w-full h-24 p-3 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:border-bolt-elements-borderColorActive focus:outline-none resize-none"
                  disabled={isSubmitting}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={classNames(
                    "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                    "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover",
                    "flex items-center gap-2",
                    { "opacity-50 cursor-not-allowed": isSubmitting }
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Live Fine Tune Strategy"
                  )}
                </button>
              </div>
            </div>

            <IconButton
              icon="i-ph:x"
              className="absolute top-2 right-2"
              onClick={onClose}
              disabled={isSubmitting}
            />
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}