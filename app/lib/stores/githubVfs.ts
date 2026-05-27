import { atom, map, type MapStore, type WritableAtom } from 'nanostores';
import type { FileMap } from './files';
import { gitHubApiService } from '~/lib/services/githubApiService';
import { toast } from 'react-toastify';
import { Buffer } from 'buffer';

export interface VfsConnection {
  owner: string;
  repo: string;
  branch: string;
}

export class GithubVfsStore {
  isVfsModeActive: WritableAtom<boolean> = atom(false);
  vfsConnection: WritableAtom<VfsConnection | null> = atom(null);
  
  files: MapStore<FileMap> = map({});
  
  // Track files that have been modified locally but not pushed
  dirtyFiles: WritableAtom<Set<string>> = atom(new Set<string>());

  async connect(owner: string, repo: string, branch: string = 'main') {
    this.vfsConnection.set({ owner, repo, branch });
    this.isVfsModeActive.set(true);
    
    // Fetch the tree structure
    try {
      const treeData = await gitHubApiService.getRepositoryTree(owner, repo, branch, true);
      
      const fileMap: FileMap = {};
      
      // Initialize with folders and files
      treeData.tree.forEach((item: any) => {
        if (item.type === 'tree') {
          fileMap[item.path] = { type: 'folder' };
        } else if (item.type === 'blob') {
          fileMap[item.path] = { 
            type: 'file', 
            content: '', 
            isBinary: false, 
          } as any;
          (fileMap[item.path] as any).isFetched = false;
          (fileMap[item.path] as any).sha = item.sha;
        }
      });
      
      this.files.set(fileMap);
      toast.success(`Connected to ${owner}/${repo} in VFS Mode`);
    } catch (e) {
      console.error("VFS Connect error", e);
      toast.error(`Failed to connect to ${owner}/${repo}`);
      this.isVfsModeActive.set(false);
      this.vfsConnection.set(null);
    }
  }

  disconnect() {
    this.isVfsModeActive.set(false);
    this.vfsConnection.set(null);
    this.files.set({});
    this.dirtyFiles.set(new Set());
  }

  // Fetch content on demand
  async fetchFileContentIfNeeded(filePath: string) {
    const conn = this.vfsConnection.get();
    if (!conn) return;

    const fileMap = this.files.get();
    const file = fileMap[filePath] as any;
    
    if (file && file.type === 'file' && !file.isFetched) {
      try {
        const { content, encoding } = await gitHubApiService.getFileContent(conn.owner, conn.repo, filePath, conn.branch);
        
        let decodedContent = '';
        let isBinary = false;
        
        if (encoding === 'base64') {
          // Decode base64 safely
          try {
            decodedContent = typeof window !== 'undefined' 
              ? decodeURIComponent(escape(window.atob(content))) 
              : Buffer.from(content, 'base64').toString('utf-8');
          } catch (e) {
            // Probably binary or malformed
            isBinary = true;
            decodedContent = content; // Keep base64 
          }
        } else {
          decodedContent = content;
        }

        this.files.setKey(filePath, {
          ...file,
          content: decodedContent,
          isBinary,
          isFetched: true
        });
      } catch (e) {
        console.error("Failed to fetch file content", e);
        toast.error(`Failed to fetch ${filePath}`);
      }
    }
  }

  async saveFile(filePath: string, content: string) {
    const file = this.files.get()[filePath];
    this.files.setKey(filePath, {
      ...(file || { type: 'file' as const }),
      content,
      isBinary: false,
      isFetched: true
    } as any);

    const dirty = new Set(this.dirtyFiles.get());
    dirty.add(filePath);
    this.dirtyFiles.set(dirty);
  }

  async createFile(filePath: string, content: string | Uint8Array = '') {
    const stringContent = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
    this.files.setKey(filePath, {
      type: 'file',
      content: stringContent,
      isBinary: false,
      isFetched: true
    } as any);

    const dirty = new Set(this.dirtyFiles.get());
    dirty.add(filePath);
    this.dirtyFiles.set(dirty);
    return true;
  }

  async deleteFile(filePath: string) {
    this.files.setKey(filePath, undefined);
    const dirty = new Set(this.dirtyFiles.get());
    dirty.add(filePath);
    this.dirtyFiles.set(dirty);
    return true;
  }

  async createFolder(folderPath: string) {
    this.files.setKey(folderPath, { type: 'folder' });
    return true;
  }

  async deleteFolder(folderPath: string) {
    const fileMap = this.files.get();
    const dirty = new Set(this.dirtyFiles.get());

    for (const [path, dirent] of Object.entries(fileMap)) {
      if (path === folderPath || path.startsWith(folderPath + '/')) {
        this.files.setKey(path, undefined);
        dirty.add(path);
      }
    }
    this.dirtyFiles.set(dirty);
    return true;
  }

  async pushChanges(message: string = 'Update from Snehra OmniForge') {
    const conn = this.vfsConnection.get();
    if (!conn) return false;

    const dirty = this.dirtyFiles.get();
    if (dirty.size === 0) {
      toast.info('No changes to push');
      return true;
    }

    const fileMap = this.files.get();
    const filesToCommit = Array.from(dirty).map(path => {
      const dirent = fileMap[path];
      return {
        path,
        content: dirent === undefined ? null : (dirent.type === 'file' ? dirent.content : undefined)
      };
    }).filter(f => f.content !== undefined); 

    try {
      await gitHubApiService.commitMultipleFiles(
        conn.owner,
        conn.repo,
        conn.branch,
        filesToCommit as any,
        message
      );
      this.dirtyFiles.set(new Set());
      toast.success('Changes pushed to GitHub successfully!');
      return true;
    } catch (e) {
      console.error("Failed to push changes", e);
      toast.error('Failed to push changes to GitHub');
      return false;
    }
  }
}

export const githubVfsStore = new GithubVfsStore();
