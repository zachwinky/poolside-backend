import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Helper to get user's GitHub token
async function getGitHubToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  });
  return user?.githubAccessToken || null;
}

// Helper for GitHub API calls
async function githubFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  return response as unknown as Response;
}

// GET /api/github/repos - List user's repositories
router.get('/repos', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = await getGitHubToken(req.user!.userId);
    if (!token) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 30;

    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      res.status(response.status).json({ error: errorData.message || 'Failed to fetch repos' });
      return;
    }

    const repos = await response.json() as Array<{
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
      private: boolean;
      description: string | null;
      default_branch: string;
      updated_at: string;
      language: string | null;
    }>;

    res.json({
      repos: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        description: repo.description,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        language: repo.language,
      })),
    });
  } catch (error) {
    console.error('GitHub repos error:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// GET /api/github/branches - List repository branches
router.get('/branches', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = await getGitHubToken(req.user!.userId);
    if (!token) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    const { owner, repo } = req.query;
    if (!owner || !repo) {
      res.status(400).json({ error: 'Owner and repo are required' });
      return;
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      res.status(response.status).json({ error: errorData.message || 'Failed to fetch branches' });
      return;
    }

    const branches = await response.json() as Array<{
      name: string;
      commit: { sha: string };
      protected: boolean;
    }>;

    res.json({
      branches: branches.map((branch) => ({
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected,
      })),
    });
  } catch (error) {
    console.error('GitHub branches error:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// GET /api/github/tree - Get repository file tree
router.get('/tree', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = await getGitHubToken(req.user!.userId);
    if (!token) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    const { owner, repo, ref } = req.query;
    if (!owner || !repo) {
      res.status(400).json({ error: 'Owner and repo are required' });
      return;
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref || 'HEAD'}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      res.status(response.status).json({ error: errorData.message || 'Failed to fetch tree' });
      return;
    }

    const data = await response.json() as {
      sha: string;
      tree: Array<{
        path: string;
        type: string;
        sha: string;
        size?: number;
      }>;
      truncated: boolean;
    };

    res.json({
      sha: data.sha,
      tree: data.tree.map((item) => ({
        path: item.path,
        type: item.type === 'tree' ? 'tree' : 'blob',
        sha: item.sha,
        size: item.size,
      })),
      truncated: data.truncated,
    });
  } catch (error) {
    console.error('GitHub tree error:', error);
    res.status(500).json({ error: 'Failed to fetch tree' });
  }
});

// GET /api/github/file - Get file content
router.get('/file', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = await getGitHubToken(req.user!.userId);
    if (!token) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    const { owner, repo, path, ref } = req.query;
    if (!owner || !repo || !path) {
      res.status(400).json({ error: 'Owner, repo, and path are required' });
      return;
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      res.status(response.status).json({ error: errorData.message || 'Failed to fetch file' });
      return;
    }

    const data = await response.json() as {
      path: string;
      sha: string;
      size: number;
      content: string;
      encoding: string;
    };

    // Decode base64 content
    const content = data.encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : data.content;

    res.json({
      path: data.path,
      sha: data.sha,
      size: data.size,
      content,
    });
  } catch (error) {
    console.error('GitHub file error:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// POST /api/github/commit - Commit file changes
router.post('/commit', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = await getGitHubToken(req.user!.userId);
    if (!token) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    const { owner, repo, branch, message, files } = req.body;
    if (!owner || !repo || !branch || !message || !files || !files.length) {
      res.status(400).json({ error: 'Owner, repo, branch, message, and files are required' });
      return;
    }

    // Get the latest commit SHA for the branch
    const refResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!refResponse.ok) {
      res.status(400).json({ error: 'Failed to get branch reference' });
      return;
    }

    const refData = await refResponse.json() as { object: { sha: string } };
    const baseSha = refData.object.sha;

    // Get the tree SHA from the latest commit
    const commitResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseSha}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!commitResponse.ok) {
      res.status(400).json({ error: 'Failed to get commit' });
      return;
    }

    const commitData = await commitResponse.json() as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file: { path: string; content: string; action: string }) => {
        if (file.action === 'delete') {
          return {
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: null,
          };
        }

        // Create blob for the file content
        const blobResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: file.content,
              encoding: 'utf-8',
            }),
          }
        );

        if (!blobResponse.ok) {
          throw new Error(`Failed to create blob for ${file.path}`);
        }

        const blobData = await blobResponse.json() as { sha: string };

        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blobData.sha,
        };
      })
    );

    // Create a new tree
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems,
        }),
      }
    );

    if (!treeResponse.ok) {
      res.status(400).json({ error: 'Failed to create tree' });
      return;
    }

    const treeData = await treeResponse.json() as { sha: string };

    // Create the commit
    const newCommitResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          tree: treeData.sha,
          parents: [baseSha],
        }),
      }
    );

    if (!newCommitResponse.ok) {
      res.status(400).json({ error: 'Failed to create commit' });
      return;
    }

    const newCommitData = await newCommitResponse.json() as { sha: string; html_url: string };

    // Update the reference to point to the new commit
    const updateRefResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sha: newCommitData.sha,
        }),
      }
    );

    if (!updateRefResponse.ok) {
      res.status(400).json({ error: 'Failed to update branch reference' });
      return;
    }

    res.json({
      commit: {
        sha: newCommitData.sha,
        message,
        url: newCommitData.html_url,
      },
    });
  } catch (error) {
    console.error('GitHub commit error:', error);
    res.status(500).json({ error: 'Failed to commit changes' });
  }
});

export default router;
