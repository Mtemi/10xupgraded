import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import * as nodePath from 'node:path';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { supabase } from '~/lib/superbase/client';
import { desanitizeForAI } from '~/utils/content-sanitizer';

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
  messageId: string;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();

  actions: ActionsMap = map({});

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      messageId: data.messageId, // Store messageId for database operations
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return;
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: true });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId);
      })
      .catch((error) => {
        console.error('Action failed:', error);
      });
  }

  async #executeAction(actionId: string) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action, action.messageId);
          break;
        }
      }

      this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
    } catch (error) {
      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const webcontainer = await this.#webcontainer;

    const process = await webcontainer.spawn('jsh', ['-c', action.content], {
      env: { npm_config_yes: true },
    });

    action.abortSignal.addEventListener('abort', () => {
      process.kill();
    });

    process.output.pipeTo(
      new WritableStream({
        write(data) {
          console.log(data);
        },
      }),
    );

    const exitCode = await process.exit;

    logger.debug(`Process terminated with code ${exitCode}`);
  }

    // Function to extract the strategy class name from Python code
    #extractStrategyClassName(content: string): string | null {
      // Look for class definition that inherits from IStrategy
      const classMatch = content.match(/class\s+(\w+)\s*\(\s*IStrategy\s*\)/);
      if (classMatch && classMatch[1]) {
        return classMatch[1];
      }
      
      // If not found, try any class definition
      const anyClassMatch = content.match(/class\s+(\w+)\s*\(/);
      if (anyClassMatch && anyClassMatch[1]) {
        return anyClassMatch[1];
      }
      
      return null;
    }
  
  async #runFileAction(action: ActionState, messageId: string) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    // Signal that ActionRunner is active to prevent chat sync conflicts
    sessionStorage.setItem('actionRunnerActive', 'true');

    console.log('[ActionRunner] Starting file action execution:', {
      filePath: action.filePath,
      contentLength: action.content?.length || 0,
      contentPreview: action.content?.substring(0, 100) + '...'
    });
  
    const webcontainer = await this.#webcontainer;
  
    let folder = nodePath.dirname(action.filePath);
  
    // Remove trailing slashes
    folder = folder.replace(/\/+$/g, '');
  
    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        console.log('[ActionRunner] Created folder successfully:', folder);
        logger.debug('Created folder', folder);
      } catch (error) {
        console.error('[ActionRunner] Failed to create folder:', folder, error);
        logger.error('Failed to create folder\n\n', error);
      }
    }
  
    // Use the content as-is since MessageParser has already set the correct class name
    let finalContent = action.content;
    console.log('[ActionRunner] Using content as provided by MessageParser (class name already correct)');

    try {
      // Write file to WebContainer first
      console.log('[ActionRunner] Writing file to WebContainer:', action.filePath);
      await webcontainer.fs.writeFile(action.filePath, finalContent);
      console.log('[ActionRunner] File written successfully to WebContainer');
      logger.debug(`File written: ${action.filePath}`);

      // Save Python files to database immediately after WebContainer write
      if (action.filePath.endsWith('.py')) {
        console.log('[ActionRunner] Saving Python file to database:', action.filePath);
        await this.#savePythonFileToDatabase(action.filePath, finalContent, messageId);
        
        // Signal that Python file save is complete and chat sync can proceed
        console.log('[ActionRunner] Python file save complete, signaling chat sync can proceed');
        window.dispatchEvent(new CustomEvent('pythonFileSaveComplete', {
          detail: { filePath: action.filePath, messageId }
        }));
      }
    } catch (error) {
      console.error('[ActionRunner] Failed to write file:', error);
      logger.error('Failed to write file\n\n', error);
    } finally {
      // Clear the ActionRunner active flag
      sessionStorage.removeItem('actionRunnerActive');
      
      // Allow chat sync to proceed after a brief delay
      setTimeout(() => {
        // Trigger any pending chat syncs
        window.dispatchEvent(new CustomEvent('actionRunnerComplete'));
      }, 500);
    }
  }

  // Save Python script to database with exact filename and content from action
  async #savePythonFileToDatabase(filePath: string, content: string, messageId: string) {
    try {
      console.log('[ActionRunner] Starting database save for file:', filePath);
      
      // Get the real chat ID from the current URL path instead of using messageId
      let associatedChatId = messageId; // fallback
      
      try {
        // Extract chat ID from current URL path: /chat/actual_chat_id
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const chatIdMatch = currentPath.match(/\/chat\/([^\/]+)/);
        if (chatIdMatch && chatIdMatch[1]) {
          associatedChatId = chatIdMatch[1];
          console.log('[ActionRunner] Extracted chat ID from URL:', associatedChatId);
        } else {
          console.log('[ActionRunner] No chat ID in URL, using messageId as fallback:', messageId);
        }
      } catch (urlError) {
        console.log('[ActionRunner] Error extracting chat ID from URL, using messageId:', messageId);
      }
      
      // Skip database save if no supabase client available
      if (!supabase) {
        console.log('[ActionRunner] No Supabase client available, skipping database save');
        return;
      }
      
      // Extract strategy name from filePath (remove .py extension)
      const strategyName = filePath.split('/').pop()?.replace('.py', '') || 'defaultstrategy';
      console.log('[ActionRunner] Using strategy name for database:', strategyName);
      
      console.log('[ActionRunner] Using messageId as chat ID for association:', associatedChatId);
      
      // Prepare desanitized content for database storage
      const databaseContent = desanitizeForAI(content);
      console.log('[ActionRunner] Content prepared for database storage');
      
      console.log('[ActionRunner] Attempting database upsert operation...');
      
      // Get user for database operations (no timeout - let it complete naturally)
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          console.log('[ActionRunner] No authenticated user, skipping database save');
          return;
        }
        
        console.log('[ActionRunner] Authenticated user found, proceeding with database save');
        
        // Perform database upsert operation
        const { data, error } = await supabase.from('trading_scripts').upsert({
          user_id: user.id,
          name: strategyName,
          content: databaseContent,
          description: 'Generated trading strategy',
          chat_id: associatedChatId,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,name',
          ignoreDuplicates: false
        }).select();
        
        if (error) {
          console.error('[ActionRunner] Database upsert error:', error);
          return; // Exit early on database error
        }
        
        console.log('[ActionRunner] Database upsert successful:', {
          savedData: data,
          filename: strategyName
        });
        console.log('[ActionRunner] Script saved successfully to database:', {
          savedData: data,
          filename: strategyName,
          chatId: associatedChatId,
          messageId: messageId
        });
        
        console.log('[ActionRunner] Starting auto-redeploy check...');
        // Auto-redeploy bot if there's an active configuration for this strategy
        await this.#autoRedeployBot(user, strategyName, messageId);
        console.log('[ActionRunner] Auto-redeploy check completed');
        
      } catch (authError) {
        console.error('[ActionRunner] Error in database operations:', authError);
        console.log('[ActionRunner] Skipping database save due to auth error');
        return;
      }
    } catch (error) {
      console.error('[ActionRunner] Error in savePythonFileToDatabase:', error);
    }
  }

  // Update class name in Python content to match filename
  // This method is no longer needed since MessageParser handles class name updates
  // Keeping it for potential future use but it should not be called
  #updateClassNameInContent(content: string, newClassName: string): string {
    console.log('[ActionRunner] #updateClassNameInContent - This method should not be called anymore');
    console.log('[ActionRunner] Content is already properly formatted by MessageParser');
    return content;
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  // Auto-redeploy bot when strategy is updated (using messageId instead of session)
  async #autoRedeployBot(user: any, strategyName: string, messageId: string) {
    console.log('[ActionRunner] #autoRedeployBot - Starting auto-redeployment check for strategy:', strategyName);
    console.log('[ActionRunner] #autoRedeployBot - User details:', {
      userId: user.id,
      userEmail: user.email
    });
    
    try {
      console.log('[ActionRunner] #autoRedeployBot - Fetching bot configurations from database...');
      // Check if there's an active bot configuration for this strategy
      const { data: botConfigs, error: configError } = await supabase
        .from('bot_configurations')
        .select('*')
        .eq('user_id', user.id)
        .eq('name', strategyName);

      if (configError) {
        console.error('[ActionRunner] #autoRedeployBot - Failed to fetch bot configurations:', configError);
        return;
      }

      console.log('[ActionRunner] #autoRedeployBot - Bot configurations query result:', {
        configCount: botConfigs?.length || 0,
        configs: botConfigs?.map(c => ({ id: c.id, name: c.name, strategy: c.config?.strategy }))
      });

      // Find bot configuration that uses this strategy
      const matchingConfig = botConfigs?.find(config => 
        config.config?.strategy === strategyName
      );
      console.log('[ActionRunner] #autoRedeployBot - Matching config search result:', {
        found: !!matchingConfig,
        configId: matchingConfig?.id,
        configName: matchingConfig?.name,
        configStrategy: matchingConfig?.config?.strategy
      });

      if (!matchingConfig) {
        console.log('[ActionRunner] #autoRedeployBot - No matching bot configuration found for strategy:', strategyName);
        return;
      }

      console.log('[ActionRunner] #autoRedeployBot - Found matching bot configuration, initiating auto-redeployment:', {
        botId: matchingConfig.id,
        strategyName: strategyName,
        configDetails: {
          exchange: matchingConfig.config?.exchange?.name,
          hasApiKeys: !!(matchingConfig.config?.exchange?.key && matchingConfig.config?.exchange?.secret)
        }
      });

      // Get session for authentication (we need this for the deployment API)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('[ActionRunner] #autoRedeployBot - No valid session for deployment:', sessionError);
        return;
      }

      // Make deployment request similar to BotDeployButton
      const apiUrl = `/apa/user/${user.email}/${strategyName}?bot_id=${matchingConfig.id}`;
      console.log('[ActionRunner] #autoRedeployBot - Deployment API URL:', apiUrl);
      console.log('[ActionRunner] #autoRedeployBot - Request payload preview:', {
        configKeys: Object.keys(matchingConfig.config || {}),
        hasExchange: !!matchingConfig.config?.exchange,
        hasStrategy: !!matchingConfig.config?.strategy
      });
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(matchingConfig.config)
      });
      
      console.log('[ActionRunner] #autoRedeployBot - Deployment API response status:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('[ActionRunner] #autoRedeployBot - Deployment API error response:', error);
        throw new Error(error.error || 'Failed to auto-redeploy bot');
      }
      
      const result = await response.json();
      console.log('[ActionRunner] #autoRedeployBot - Auto-redeployment initiated successfully:', {
        result,
        strategyName,
        botId: matchingConfig.id
      });
      
    } catch (error) {
      console.error('[ActionRunner] #autoRedeployBot - Auto-redeployment failed:', {
        error: error instanceof Error ? error.message : String(error),
        strategyName,
        userId: user.id
      });
      // Don't throw error to avoid breaking the file save operation
    }
  }
}