import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainer');

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

let webcontainerInstance: Promise<WebContainer | null> = Promise.resolve(null);

if (!import.meta.env.SSR) {
  webcontainerInstance = import.meta.hot?.data.webcontainer ?? 
    Promise.resolve().then(async () => {
      try {
        logger.info('Booting WebContainer...');
        const instance = await WebContainer.boot({ workdirName: WORK_DIR_NAME });
        logger.info('WebContainer booted successfully');
        webcontainerContext.loaded = true;
        return instance;
      } catch (error) {
        logger.error('Failed to boot WebContainer:', error);
        return null;
      }
    });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainerInstance;
  }
}

export const webcontainer = webcontainerInstance;

// Helper function to safely get WebContainer with proper error handling
export async function getWebContainerSafely(): Promise<WebContainer | null> {
  try {
    const container = await webcontainer;
    if (!container) {
      logger.warn('WebContainer is null');
      return null;
    }
    
    // Verify container is properly initialized
    if (!container.workdir) {
      logger.warn('WebContainer workdir not available');
      return null;
    }
    
    return container;
  } catch (error) {
    logger.error('Error getting WebContainer:', error);
    return null;
  }
}