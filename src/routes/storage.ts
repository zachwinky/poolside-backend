import { Router, Request, Response } from 'express';
import {
  listDriveItems,
  getFileContent,
  writeFileContent,
  deleteFile,
  createFolder,
  getFileTree,
  listAllFiles,
} from '../services/onedrive';

const router = Router();

// Middleware to extract access token from Authorization header
function getAccessToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// GET /api/storage/list - List items in a directory
router.get('/list', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const path = (req.query.path as string) || '/';
    const items = await listDriveItems(accessToken, path);
    res.json({ items });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: 'Failed to list directory' });
  }
});

// GET /api/storage/file - Get file content
router.get('/file', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const path = req.query.path as string;
    if (!path) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    const content = await getFileContent(accessToken, path);
    res.json({ content });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file content' });
  }
});

// PUT /api/storage/file - Write file content
router.put('/file', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const { path, content }: { path: string; content: string } = req.body;
    if (!path) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    const result = await writeFileContent(accessToken, path, content || '');
    res.json({ item: result });
  } catch (error) {
    console.error('Write file error:', error);
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// DELETE /api/storage/file - Delete a file
router.delete('/file', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const path = req.query.path as string;
    if (!path) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    await deleteFile(accessToken, path);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// POST /api/storage/folder - Create a folder
router.post('/folder', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const { parentPath, folderName }: { parentPath: string; folderName: string } =
      req.body;
    if (!folderName) {
      res.status(400).json({ error: 'Folder name is required' });
      return;
    }

    const result = await createFolder(accessToken, parentPath || '/', folderName);
    res.json({ item: result });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// GET /api/storage/tree - Get file tree structure
router.get('/tree', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const path = (req.query.path as string) || '/';
    const maxDepth = parseInt(req.query.maxDepth as string) || 2;

    const tree = await getFileTree(accessToken, path, maxDepth);
    res.json({ tree });
  } catch (error) {
    console.error('Get tree error:', error);
    res.status(500).json({ error: 'Failed to get file tree' });
  }
});

// GET /api/storage/files - List all files (flat list)
router.get('/files', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const path = (req.query.path as string) || '/';
    const maxDepth = parseInt(req.query.maxDepth as string) || 3;

    const files = await listAllFiles(accessToken, path, maxDepth);
    res.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// POST /api/storage/batch-write - Write multiple files at once
router.post('/batch-write', async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const {
      files,
    }: { files: Array<{ path: string; content: string; action: string }> } =
      req.body;

    if (!files || !Array.isArray(files)) {
      res.status(400).json({ error: 'Files array is required' });
      return;
    }

    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        if (file.action === 'delete') {
          await deleteFile(accessToken, file.path);
          results.push({ path: file.path, action: 'deleted' });
        } else {
          const result = await writeFileContent(
            accessToken,
            file.path,
            file.content || ''
          );
          results.push({ path: file.path, action: file.action, item: result });
        }
      } catch (error) {
        errors.push({ path: file.path, error: String(error) });
      }
    }

    res.json({ results, errors });
  } catch (error) {
    console.error('Batch write error:', error);
    res.status(500).json({ error: 'Failed to batch write files' });
  }
});

export default router;
