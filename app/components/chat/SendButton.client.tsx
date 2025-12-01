import { AnimatePresence, cubicBezier, motion } from 'framer-motion';
import { IoPaperPlaneOutline, IoStopCircleOutline } from 'react-icons/io5';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  isValidatingTokens?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export function SendButton({ show, isStreaming, isValidatingTokens, onClick }: SendButtonProps) {
  const getButtonContent = () => {
    if (isValidatingTokens) {
      return (
        <div className="i-svg-spinners:90-ring-with-bg text-yellow-500" 
             style={{ fontSize: window.innerWidth < 640 ? '24px' : '28px' }} />
      );
    }
    
    if (isStreaming) {
      return <IoStopCircleOutline size={window.innerWidth < 640 ? 24 : 28} />;
    }
    
    return <IoPaperPlaneOutline size={window.innerWidth < 640 ? 24 : 28} />;
  };
  
  const getButtonColor = () => {
    if (isValidatingTokens) {
      return 'text-yellow-500 hover:text-yellow-400 border-yellow-500 hover:shadow-yellow-500/50';
    }
    
    return 'text-[#00FF7F] hover:text-green-300 border-[#00FF7F] hover:shadow-[#00FF7F]/50';
  };

  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          className={`absolute right-2 bottom-2 transition-colors p-2 sm:p-3 bg-black bg-opacity-70 rounded-full border-2 hover:bg-opacity-90 shadow-lg ${getButtonColor()}`}
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          disabled={isValidatingTokens}
          onClick={(event) => {
            event.preventDefault();
            onClick?.(event);
          }}
          title={
            isValidatingTokens 
              ? "Validating tokens..." 
              : isStreaming 
                ? "Stop generation" 
                : "Send message"
          }
        >
          {getButtonContent()}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}