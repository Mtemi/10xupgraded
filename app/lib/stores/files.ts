import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { getEncoding } from 'istextorbinary';
import { map, type MapStore } from 'nanostores';
// import { Buffer } from 'node:buffer';
// import * as nodePath from 'node:path';
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import { supabase } from '~/lib/superbase/client';
import { extractStrategyClassName } from '~/utils/strategy-naming';
import { toast } from 'react-toastify';
import { desanitizeForAI } from '~/utils/content-sanitizer';

// Browser-compatible buffer handling - use dynamic imports or skip on client

const logger = createScopedLogger('FilesStore');

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export class FilesStore {
  #webcontainer: Promise<WebContainer>;

  /**
   * Tracks the number of files without folders.
   */
  #size = 0;

  /**
   * @note Keeps track all modified files with their original content since the last user message.
   * Needs to be reset when the user sends another message and all changes have to be submitted
   * for the model to be aware of the changes.
   */
  #modifiedFiles: Map<string, string> = import.meta.hot?.data.modifiedFiles ?? new Map();

  /**
   * Map of files that matches the state of WebContainer.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.files ?? map({});

  get filesCount() {
    return this.#size;
  }

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
    }

    this.#init();
  }

  getFile(filePath: string) {
    const dirent = this.files.get()[filePath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent;
  }

  getFileModifications() {
    return computeFileModifications(this.files.get(), this.#modifiedFiles);
  }

  resetFileModifications() {
    this.#modifiedFiles.clear();
  }

  // New method for immediate file creation during streaming (before WebContainer)
  createFileImmediate(filePath: string, content: string) {
    console.log('[FilesStore] Creating file immediately for real-time display:', filePath);
    
    // Immediately update the files map for real-time display
    this.files.setKey(filePath, { 
      type: 'file', 
      content, 
      isBinary: false 
    });
    
    this.#size++;
  }

  // New method for immediate file updates during streaming
  updateFileImmediate(filePath: string, content: string) {
    console.log('[FilesStore] Updating file immediately for real-time display:', filePath);
    
    // Immediately update the files map for real-time display
    this.files.setKey(filePath, { 
      type: 'file', 
      content, 
      isBinary: false 
    });
  }
  async saveFile(filePath: string, content: string) {
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = nodePath.relative(webcontainer.workdir, filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, write '${relativePath}'`);
      }

      const oldContent = this.getFile(filePath)?.content;

      if (!oldContent) {
        unreachable('Expected content to be defined');
      }

      await webcontainer.fs.writeFile(relativePath, content);

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }

      // we immediately update the file and don't rely on the `change` event coming from the watcher
      this.files.setKey(filePath, { type: 'file', content, isBinary: false });

      // If this is a Python strategy file, also update the database
      if (filePath.endsWith('.py')) {
        await this.#updateStrategyInDatabase(filePath, content);
      }
      // If this is a Python strategy file, also update the database
      logger.info('File updated');
    } catch (error) {
      logger.error('Failed to update file content\n\n', error);

      throw error;
    }
  }

  /**
   * Updates the strategy in the database when a Python file is saved
   */
  async #updateStrategyInDatabase(filePath: string, content: string) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        logger.info('No authenticated user, skipping database update');
        return;
      }

      // Extract strategy name from file path (remove .py extension)
      const fileName = nodePath.basename(filePath, '.py');
      logger.info(`Updating strategy in database: ${fileName}`);

      // Convert content back to freqtrade format before saving to database
      const desanitizedContent = desanitizeForAI(content);

      // Update the existing strategy in the database
      const { error: updateError } = await supabase
        .from('trading_scripts')
        .update({
          content: desanitizedContent,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('name', fileName);

      if (updateError) {
        logger.error('Failed to update strategy in database:', updateError);
        toast.error('Failed to save strategy to database');
      } else {
        logger.info('Strategy updated successfully in database');
        toast.success('Strategy saved successfully');
      }
    } catch (error) {
      logger.error('Error updating strategy in database:', error);
      toast.error('Failed to save strategy to database');
    }
  }
  async #init() {
    const webcontainer = await this.#webcontainer;

    webcontainer.internal.watchPaths(
      { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
      bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
    );
  }

  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    for (const { type, path, buffer } of watchEvents) {
      // remove any trailing slashes
      const sanitizedPath = path.replace(/\/+$/g, '');

      switch (type) {
        case 'add_dir': {
          // we intentionally add a trailing slash so we can distinguish files from folders in the file tree
          this.files.setKey(sanitizedPath, { type: 'folder' });
          break;
        }
        case 'remove_dir': {
          this.files.setKey(sanitizedPath, undefined);

          for (const [direntPath] of Object.entries(this.files)) {
            if (direntPath.startsWith(sanitizedPath)) {
              this.files.setKey(direntPath, undefined);
            }
          }

          break;
        }
        case 'add_file':
        case 'change': {
          if (type === 'add_file') {
            this.#size++;
          }

          let content = '';

          /**
           * @note This check is purely for the editor. The way we detect this is not
           * bullet-proof and it's a best guess so there might be false-positives.
           * The reason we do this is because we don't want to display binary files
           * in the editor nor allow to edit them.
           */
          const isBinary = isBinaryFile(buffer);

          if (!isBinary) {
            content = this.#decodeFileContent(buffer);
          }

          this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });

          break;
        }
        case 'remove_file': {
          this.#size--;
          this.files.setKey(sanitizedPath, undefined);
          break;
        }
        case 'update_directory': {
          // we don't care about these events
          break;
        }
      }
    }
  }

  #decodeFileContent(buffer?: Uint8Array) {
    if (!buffer || buffer.byteLength === 0) {
      return '';
    }

    try {
      return utf8TextDecoder.decode(buffer);
    } catch (error) {
      console.log(error);
      return '';
    }
  }
}

function isBinaryFile(buffer: Uint8Array | undefined) {
  if (buffer === undefined) {
    return false;
  }

  // Temporarily disable binary detection to fix client-side hydration
  return false;
  
  // TODO: Fix this properly for server-side binary detection
  // return getEncoding(convertToBuffer(buffer), { chunkLength: 100 }) === 'binary';
}

/**
 * Converts a `Uint8Array` into a Node.js `Buffer` by copying the prototype.
 * The goal is to  avoid expensive copies. It does create a new typed array
 * but that's generally cheap as long as it uses the same underlying
 * array buffer.
 */
function convertToBuffer(view: Uint8Array): any {
  // Temporarily return view as-is to fix client-side hydration
  return view;
  
  // TODO: Implement proper server-side Buffer conversion
}
