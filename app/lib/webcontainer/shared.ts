import { WebContainer } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;

export async function getWebContainer() {
  if (!import.meta.env.SSR) {
    if (webcontainerInstance) {
      return webcontainerInstance;
    }

    try {
      webcontainerInstance = await WebContainer.boot({
        workdirName: 'project'
      });
      return webcontainerInstance;
    } catch (error) {
      console.error('Error initializing WebContainer:', error);
      throw error;
    }
  }
  return null;
}

export function resetWebContainer() {
  if (webcontainerInstance) {
    // Clean up any resources if needed
    webcontainerInstance = null;
  }
}