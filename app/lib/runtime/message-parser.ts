import type { ActionType, BoltAction, BoltActionData, FileAction, ShellAction } from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import { extractStrategyClassName, generateStrategyName } from '~/utils/strategy-naming';
import { desanitizeForAI } from '~/utils/content-sanitizer';
import { supabase } from '~/lib/superbase/client';
import { chatId, urlId } from '~/lib/persistence/useChatHistory';

// Persist and restore strategy name per chat (client-side only)
function saveStrategyNameForChat(name: string) {
  if (typeof window === 'undefined') return;
  try {
    const id = (urlId.get && urlId.get()) || (chatId.get && chatId.get()) || '';
    if (!id) return;
    localStorage.setItem(`strategyName:${id}`, name);
  } catch {}
}

function loadStrategyNameForChat(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const id = (urlId.get && urlId.get()) || (chatId.get && chatId.get()) || '';
    if (!id) return undefined;
    const v = localStorage.getItem(`strategyName:${id}`);
    return v || undefined;
  } catch { return undefined; }
}


const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<boltAction';
const ARTIFACT_ACTION_TAG_CLOSE = '</boltAction>';

const logger = createScopedLogger('MessageParser');

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
  onCodeStream?: (code: string, filePath: string) => void;
}

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  currentArtifact?: BoltArtifactData;
  currentAction: BoltActionData;
  actionId: number;
}

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  #onCodeStreamCallback?: (code: string, filePath: string) => void;
  currentStrategyName?: string;
  #strategyNamesByMessage = new Map<string, string>();

  constructor(private _options: StreamingMessageParserOptions = {}) {
    this.#onCodeStreamCallback = _options.onCodeStream;
  }

  parse(messageId: string, input: string) {
    // Restore strategy name for this message if it exists
    if (this.#strategyNamesByMessage.has(messageId)) {
      this.currentStrategyName = this.#strategyNamesByMessage.get(messageId);
      console.log('[MessageParser] Restored strategy name for message:', messageId, this.currentStrategyName);
    }

    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideAction: false,
        insideArtifact: false,
        currentAction: { content: '' },
        actionId: 0,
      };

      this.#messages.set(messageId, state);
    }

    
    // Restore previously generated strategy name for this chat on refresh
    if (!this.currentStrategyName) {
      const restored = loadStrategyNameForChat();
      if (restored) {
        this.currentStrategyName = restored;
        console.log('[MessageParser] Restored strategy name from localStorage for chat:', restored);
      }
    }

let output = '';
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        if (currentArtifact === undefined) {
          unreachable('Artifact not initialized');
        }

        if (state.insideAction) {
          const closeIndex = input.indexOf(ARTIFACT_ACTION_TAG_CLOSE, i);

          const currentAction = state.currentAction;

          if (closeIndex !== -1) {
            currentAction.content += input.slice(i, closeIndex);

            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              content += '\n';
              
              // Stream code to workbench immediately for Python files with proper naming
              if (this.#onCodeStreamCallback && this.#isPythonCode(content, currentAction.filePath)) {
                console.log('[MessageParser] Processing Python code for proper naming');
                console.log('[MessageParser] Current strategy name stored:', this.currentStrategyName);

                // CRITICAL: Use the stored strategy name to ensure class name consistency across revisions
                const strategyName = this.currentStrategyName || 'trendstrategy';
                // Capitalize first letter for class name (filename is already lowercase)
                const capitalizedClassName = strategyName.charAt(0).toUpperCase() + strategyName.slice(1);
                console.log('[MessageParser] Using consistent class name:', capitalizedClassName);
                console.log('[MessageParser] This ensures class name remains same across all code revisions');

                // Update class name in the code to match the filename
                // This is crucial for maintaining consistency when users revise their strategies
                const updatedContent = this.#updateClassNameInCode(content, capitalizedClassName);
                console.log('[MessageParser] Updated class name in code to:', capitalizedClassName);
                console.log('[MessageParser] Streaming Python code to workbench with path:', currentAction.filePath);

                this.#onCodeStreamCallback(updatedContent, currentAction.filePath);

                // CRITICAL: Update the action content with the corrected class name
                // so ActionRunner saves the same content that's displayed in workbench
                // This ensures database consistency across revisions
                content = updatedContent; // Update the local content variable
                console.log('[MessageParser] Updated local content variable with corrected class name for database consistency');
                console.log('[MessageParser] Class name consistency guaranteed: filename and class match for all revisions');
              }
            }

            currentAction.content = content;

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,

              /**
               * We decrement the id because it's been incremented already
               * when `onActionOpen` was emitted to make sure the ids are
               * the same.
               */
              actionId: String(state.actionId - 1),

              action: currentAction as BoltAction,
            });

            state.insideAction = false;
            state.currentAction = { content: '' };

            i = closeIndex + ARTIFACT_ACTION_TAG_CLOSE.length;
          } else {
            break;
          }
        } else {
          const actionOpenIndex = input.indexOf(ARTIFACT_ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (actionOpenIndex !== -1 && (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)) {
            const actionEndIndex = input.indexOf('>', actionOpenIndex);

            if (actionEndIndex !== -1) {
              state.insideAction = true;

              state.currentAction = this.#parseActionTag(input, actionOpenIndex, actionEndIndex);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as BoltAction,
              });

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseIndex !== -1) {
            this._options.callbacks?.onArtifactClose?.({ messageId, ...currentArtifact });

            state.insideArtifact = false;
            state.currentArtifact = undefined;

            i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          } else {
            break;
          }
        }
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        let j = i;
        let potentialTag = '';

        while (j < input.length && potentialTag.length < ARTIFACT_TAG_OPEN.length) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            if (nextChar && nextChar !== '>' && nextChar !== ' ') {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf('>', j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);

              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const artifactId = this.#extractAttribute(artifactTag, 'id') as string;

              if (!artifactTitle) {
                logger.warn('Artifact title missing');
              }

              if (!artifactId) {
                logger.warn('Artifact id missing');
              }

              state.insideArtifact = true;

              const currentArtifact = {
                id: artifactId,
                title: artifactTitle,
              } satisfies BoltArtifactData;

              state.currentArtifact = currentArtifact;

              this._options.callbacks?.onArtifactOpen?.({ messageId, ...currentArtifact });

              const artifactFactory = this._options.artifactElement ?? createArtifactElement;

              output += artifactFactory({ messageId });

              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }

            break;
          } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            output += input.slice(i, j + 1);
            i = j + 1;
              
              // Store the strategy name for this message to persist across refreshes
              if (this.currentStrategyName) {
                this.#strategyNamesByMessage.set(messageId, this.currentStrategyName);
                console.log('[MessageParser] Stored strategy name for message persistence:', messageId, this.currentStrategyName);
              }
            break;
          }

          j++;
        }

        if (j === input.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
          break;
        }
      } else {
        output += input[i];
        i++;
      }

      if (earlyBreak) {
        break;
      }
    }

    state.position = i;

    return output;
  }

  reset() {
    this.#messages.clear();
    this.#strategyNamesByMessage.clear();
    this.currentStrategyName = undefined;
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);

    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'file') {
      const filePath = this.#extractAttribute(actionTag, 'filePath') as string;

      if (!filePath) {
        logger.debug('File path not specified');
      }

      // CRITICAL: Filename and class name consistency for Python strategy files
      if (filePath && filePath.endsWith('.py')) {
        if (this.currentStrategyName) {
          // REUSE previously generated name for this chat (strategy revision scenario)
          const consistentFilePath = `${this.currentStrategyName}.py`;
          console.log('[MessageParser] REVISION DETECTED: Reusing existing strategy name:', this.currentStrategyName);
          console.log('[MessageParser] Overriding AI filename:', filePath, '->', consistentFilePath);
          console.log('[MessageParser] This ensures filename consistency across all code revisions');
          (actionAttributes as FileAction).filePath = consistentFilePath;
        } else {
          // INITIAL GENERATION: generate unique name using sanitized base + timestamp + random
          const timestamp = Date.now().toString(36);
          const randomPart = Math.random().toString(36).substring(2, 10);
          const baseName = this.#sanitizeNameFromFilePath(filePath);
          const strategyName = `${baseName}${timestamp}${randomPart}`;
          const properFilePath = `${strategyName}.py`;
          console.log('[MessageParser] INITIAL GENERATION: Creating new strategy name');
          console.log('[MessageParser] Overriding AI filename:', filePath, '->', properFilePath);
          this.currentStrategyName = strategyName;
          console.log('[MessageParser] Stored strategy name for this chat session:', this.currentStrategyName);
          console.log('[MessageParser] All future revisions will use this same filename and class name');
          (actionAttributes as FileAction).filePath = properFilePath;
          try { saveStrategyNameForChat(this.currentStrategyName as string); } catch {}
        }
      } else {
        (actionAttributes as FileAction).filePath = filePath;
      }
    } else if (actionType !== 'shell') {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as FileAction | ShellAction;
  }

  #isPythonCode(content: string, filePath?: string): boolean {
    return filePath?.endsWith('.py') || (content.includes('class') && content.includes('IStrategy'));
  }

  #updateClassNameInCode(content: string, newClassName: string): string {
    console.log('[MessageParser] #updateClassNameInCode called with newClassName:', newClassName);
    console.log('[MessageParser] Content preview:', content.substring(0, 200) + '...');
    console.log('[MessageParser] Content includes IStrategy:', content.includes('IStrategy'));
    
    // Extract current class name from the code and replace with new one
    const classMatch = content.match(/class\s+(\w+)\s*\(\s*IStrategy\s*\)/);
    console.log('[MessageParser] Class match result:', classMatch);
    
    if (classMatch && classMatch[1]) {
      const currentClassName = classMatch[1];
      console.log('[MessageParser] Updating class name from', currentClassName, 'to', newClassName);
      
      // Replace the class definition
      const updatedContent = content.replace(
        new RegExp(`class\\s+${currentClassName}\\s*\\(\\s*IStrategy\\s*\\)`, 'g'),
        `class ${newClassName}(IStrategy)`
      );
      
      console.log('[MessageParser] Class replacement completed');
      console.log('[MessageParser] Updated content preview:', updatedContent.substring(0, 300) + '...');
      console.log('[MessageParser] Class name replacement completed');
      return updatedContent;
    }
    
    console.log('[MessageParser] No IStrategy class found to update');
   
    // If no IStrategy class found, try to find any class definition and update it
    const anyClassMatch = content.match(/class\s+(\w+)\s*\(/);
    console.log('[MessageParser] Any class match result:', anyClassMatch);
   
    if (anyClassMatch && anyClassMatch[1]) {
      const currentClassName = anyClassMatch[1];
      console.log('[MessageParser] Updating any class name from', currentClassName, 'to', newClassName);
      
      // Replace any class definition and add IStrategy inheritance
      const updatedContent = content.replace(
        new RegExp(`class\\s+${currentClassName}\\s*\\([^)]*\\)`, 'g'),
        `class ${newClassName}(IStrategy)`
      );
      
      console.log('[MessageParser] Any class replacement completed');
      console.log('[MessageParser] Updated content preview:', updatedContent.substring(0, 300) + '...');
      return updatedContent;
    }
   
    console.log('[MessageParser] No class definition found at all');
    return content;
  }

  // Sanitize filePath -> safe base name for strategy/file/class
  #sanitizeNameFromFilePath(filePath: string): string {
    console.log('[MessageParser] Sanitizing filePath for strategy name:', filePath);
    // get basename and drop extension
    const base = (filePath.split(/[\\/]/).pop() || filePath).replace(/\.[^.]+$/, '');
    // remove unwanted brand words
    let cleaned = base.replace(/freqtrade/gi, '').replace(/10xtraders/gi, '');
    // keep only letters and numbers
    // cleaned = cleaned.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
    cleaned = cleaned.replace(/[^a-zA-Z]+/g, '').toLowerCase();
    if (!cleaned) cleaned = 'strategy';
    if (!/^[a-z]/.test(cleaned)) cleaned = 's' + cleaned; // must start with a letter
    console.log('[MessageParser] Sanitized base name:', cleaned);
    return cleaned;
  }

  // Save Python script to database immediately after generation
  async #savePythonScriptToDatabase(strategyName: string, content: string) {
    try {
      console.log('[MessageParser] Saving Python script to database:', strategyName);
      
      // Get authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('[MessageParser] No authenticated user, skipping database save');
        return;
      }
      
      // Get current chat ID and URL ID
      const currentChatId = chatId.get();
      const currentUrlId = urlId.get();
      
      // Use either the URL ID or chat ID, with a fallback
      let associatedChatId = currentChatId || currentUrlId;
      
      // If we don't have any ID, generate one and set it consistently
      if (!associatedChatId) {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 10);
        associatedChatId = `chat_${timestamp}${randomPart}`;
        chatId.set(associatedChatId);
        urlId.set(associatedChatId);
        console.log('[MessageParser] Generated new chat ID:', associatedChatId);
      }
      
      console.log('[MessageParser] Using chat ID for association:', associatedChatId);
      
      // Prepare desanitized content for database storage
      const databaseContent = desanitizeForAI(content);
      console.log('[MessageParser] Content prepared for database storage');
      
      // Save to database with exact filename
      const { data, error } = await supabase.from('trading_scripts').upsert({
        user_id: user.id,
        name: strategyName, // Use exact strategy name from filename
        content: databaseContent, // Use desanitized content for database
        description: 'Generated trading strategy',
        chat_id: associatedChatId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,name', // Handle conflicts based on user_id and name
        ignoreDuplicates: false
      }).select();

      if (error) {
        console.error('[MessageParser] Failed to save script to database:', error.message);
      } else {
        console.log('[MessageParser] Script saved successfully with exact filename:', {
          savedData: data,
          filename: strategyName
        });
      }
    } catch (error) {
      console.error('[MessageParser] Error in savePythonScriptToDatabase:', error);
    }
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    const match = tag.match(new RegExp(`${attributeName}="([^"]*)"`, 'i'));
    return match ? match[1] : undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__boltArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')} style="display: none;"></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
