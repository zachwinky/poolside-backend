import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  streamChat,
  chat,
  chatWithTools,
  streamChatWithTools,
  analyzeProject,
  generateContextFile,
  ModelType,
  ToolCall,
  ToolResult,
} from '../services/claude';
import {
  getFileContent as getOneDriveFile,
  listAllFiles as listOneDriveFiles,
} from '../services/onedrive';
import prisma from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest, JWTPayload } from '../middleware/auth';

const router = Router();

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: string;
  stream?: boolean;
  model?: ModelType;
  apiKey?: string; // For BYOK users
}

interface ChatWithToolsRequest extends ChatRequest {
  enableTools?: boolean;
  storageType?: 'onedrive' | 'github';
  storageToken?: string; // OneDrive access token
  projectPath?: string; // Base path in OneDrive
  github?: {
    owner: string;
    repo: string;
    branch: string;
  };
  fileList?: string[]; // Cached file list for search
}

// Validate model type
function isValidModel(model: unknown): model is ModelType {
  return model === 'haiku' || model === 'sonnet' || model === 'opus';
}

// POST /api/chat - Send a message to Claude
router.post('/', async (req: Request, res: Response) => {
  try {
    const { messages, context, stream = false, model, apiKey }: ChatRequest =
      req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    // Validate model if provided
    const validModel = model && isValidModel(model) ? model : 'sonnet';

    const options = {
      model: validModel,
      apiKey: apiKey || undefined,
    };

    if (stream) {
      // Set up SSE for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const result = await streamChat(
        messages,
        context || '',
        (chunk) => {
          res.write(
            `data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`
          );
        },
        options
      );

      // Send final message with file changes
      res.write(
        `data: ${JSON.stringify({
          type: 'complete',
          content: result.content,
          fileChanges: result.fileChanges,
        })}\n\n`
      );
      res.end();
    } else {
      const result = await chat(messages, context || '', options);
      res.json(result);
    }
  } catch (error) {
    console.error('Chat error:', error);

    // Check for API key errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
      if (error.message.includes('rate limit')) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// Helper to get GitHub token from user
async function getGitHubToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  });
  return user?.githubAccessToken || null;
}

// Helper to fetch file from GitHub
async function getGitHubFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string = 'HEAD'
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${path}`);
  }

  const data = await response.json() as { content: string; encoding: string };
  return data.encoding === 'base64'
    ? Buffer.from(data.content, 'base64').toString('utf-8')
    : data.content;
}

// Execute a tool call and return the result
async function executeToolCall(
  toolCall: ToolCall,
  storageType: 'onedrive' | 'github',
  storageToken: string,
  projectPath: string,
  github?: { owner: string; repo: string; branch: string },
  fileList?: string[]
): Promise<ToolResult> {
  try {
    switch (toolCall.name) {
      case 'read_file': {
        const { path } = toolCall.input as { path: string };
        let content: string;

        if (storageType === 'github' && github) {
          content = await getGitHubFileContent(
            storageToken,
            github.owner,
            github.repo,
            path,
            github.branch
          );
        } else {
          // OneDrive - combine project path with file path
          const fullPath = projectPath === '/'
            ? `/${path}`
            : `${projectPath}/${path}`;
          content = await getOneDriveFile(storageToken, fullPath);
        }

        return {
          toolCallId: toolCall.id,
          result: `File: ${path}\n\n${content}`,
        };
      }

      case 'read_multiple_files': {
        const { paths } = toolCall.input as { paths: string[] };
        const results: string[] = [];

        for (const path of paths) {
          try {
            let content: string;

            if (storageType === 'github' && github) {
              content = await getGitHubFileContent(
                storageToken,
                github.owner,
                github.repo,
                path,
                github.branch
              );
            } else {
              const fullPath = projectPath === '/'
                ? `/${path}`
                : `${projectPath}/${path}`;
              content = await getOneDriveFile(storageToken, fullPath);
            }

            results.push(`=== File: ${path} ===\n${content}`);
          } catch (e) {
            results.push(`=== File: ${path} ===\nError: Could not read file`);
          }
        }

        return {
          toolCallId: toolCall.id,
          result: results.join('\n\n'),
        };
      }

      case 'search_files': {
        const { query } = toolCall.input as { query: string };

        // Use the cached file list if available
        let files = fileList || [];

        if (!fileList || fileList.length === 0) {
          // Fetch file list if not provided
          if (storageType === 'onedrive') {
            files = await listOneDriveFiles(storageToken, projectPath, 4);
          }
          // For GitHub, we'd need to fetch the tree, but we assume fileList is provided
        }

        // Simple pattern matching
        const pattern = query.toLowerCase();
        const isGlob = pattern.includes('*');

        let matches: string[];
        if (isGlob) {
          // Convert glob to regex
          const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');
          const regex = new RegExp(regexPattern);
          matches = files.filter(f => regex.test(f.toLowerCase()));
        } else {
          matches = files.filter(f => f.toLowerCase().includes(pattern));
        }

        if (matches.length === 0) {
          return {
            toolCallId: toolCall.id,
            result: `No files found matching "${query}"`,
          };
        }

        return {
          toolCallId: toolCall.id,
          result: `Found ${matches.length} file(s) matching "${query}":\n${matches.slice(0, 50).join('\n')}${matches.length > 50 ? `\n... and ${matches.length - 50} more` : ''}`,
        };
      }

      default:
        return {
          toolCallId: toolCall.id,
          result: `Unknown tool: ${toolCall.name}`,
          isError: true,
        };
    }
  } catch (error) {
    return {
      toolCallId: toolCall.id,
      result: `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

// POST /api/chat/with-tools - Chat with tool use support (agentic loop)
router.post('/with-tools', async (req: Request, res: Response) => {
  try {
    const {
      messages,
      context,
      stream = false,
      model,
      apiKey,
      enableTools = true,
      storageType = 'onedrive',
      storageToken,
      projectPath = '/',
      github,
      fileList,
    }: ChatWithToolsRequest = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    if (enableTools && !storageToken) {
      res.status(400).json({ error: 'Storage token required for tool use' });
      return;
    }

    // Resolve the actual storage token
    // For GitHub: storageToken is a JWT, we need to verify it and get the user's GitHub token
    // For OneDrive: storageToken is already the OneDrive access token
    let resolvedStorageToken = storageToken;

    if (enableTools && storageType === 'github' && storageToken) {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          res.status(500).json({ error: 'JWT not configured' });
          return;
        }

        const payload = jwt.verify(storageToken, secret) as JWTPayload;
        const githubToken = await getGitHubToken(payload.userId);

        if (!githubToken) {
          res.status(400).json({ error: 'GitHub not connected. Please connect GitHub in settings.' });
          return;
        }

        resolvedStorageToken = githubToken;
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          res.status(401).json({ error: 'Token expired. Please refresh and try again.' });
          return;
        }
        res.status(403).json({ error: 'Invalid authentication token' });
        return;
      }
    }

    const validModel = model && isValidModel(model) ? model : 'sonnet';
    const options = {
      model: validModel,
      apiKey: apiKey || undefined,
      enableTools,
    };

    // Convert messages to the format expected by chatWithTools
    let apiMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const MAX_TOOL_ITERATIONS = 10;
    let iterations = 0;
    let finalContent = '';
    let allFileChanges: Array<{ path: string; action: string; content?: string }> = [];
    let toolResults: ToolResult[] | undefined;

    if (stream) {
      // Set up SSE for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        const result = await streamChatWithTools(
          apiMessages,
          context || '',
          (chunk) => {
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          },
          (toolCalls) => {
            // Notify client about tool calls
            res.write(`data: ${JSON.stringify({ type: 'tool_calls', toolCalls })}\n\n`);
          },
          { ...options, toolResults }
        );

        finalContent = result.content;
        if (result.fileChanges.length > 0) {
          allFileChanges = [...allFileChanges, ...result.fileChanges];
        }

        // If Claude wants to use tools, execute them
        if (result.stopReason === 'tool_use' && result.toolCalls && result.toolCalls.length > 0) {
          // Execute all tool calls
          toolResults = await Promise.all(
            result.toolCalls.map(tc =>
              executeToolCall(tc, storageType, resolvedStorageToken!, projectPath, github, fileList)
            )
          );

          // Send tool results to client
          res.write(`data: ${JSON.stringify({ type: 'tool_results', results: toolResults })}\n\n`);

          // Add assistant's response with tool use to messages
          apiMessages = [
            ...apiMessages,
            {
              role: 'assistant' as const,
              content: result.content,
            },
          ];

          // Continue the loop
          continue;
        }

        // No more tool calls, we're done
        break;
      }

      // Send final message
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        content: finalContent,
        fileChanges: allFileChanges,
        iterations,
      })}\n\n`);
      res.end();
    } else {
      // Non-streaming version
      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        const result = await chatWithTools(
          apiMessages,
          context || '',
          { ...options, toolResults }
        );

        finalContent = result.content;
        if (result.fileChanges.length > 0) {
          allFileChanges = [...allFileChanges, ...result.fileChanges];
        }

        // If Claude wants to use tools, execute them
        if (result.stopReason === 'tool_use' && result.toolCalls && result.toolCalls.length > 0) {
          // Execute all tool calls
          toolResults = await Promise.all(
            result.toolCalls.map(tc =>
              executeToolCall(tc, storageType, resolvedStorageToken!, projectPath, github, fileList)
            )
          );

          // Add assistant's response to messages for context
          apiMessages = [
            ...apiMessages,
            {
              role: 'assistant' as const,
              content: result.content,
            },
          ];

          // Continue the loop
          continue;
        }

        // No more tool calls, we're done
        break;
      }

      res.json({
        content: finalContent,
        fileChanges: allFileChanges,
        iterations,
      });
    }
  } catch (error) {
    console.error('Chat with tools error:', error);

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
      if (error.message.includes('rate limit')) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// POST /api/chat/analyze - Analyze a project structure
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const {
      files,
      apiKey,
    }: { files: string[]; apiKey?: string } = req.body;

    if (!files || !Array.isArray(files)) {
      res.status(400).json({ error: 'Files array is required' });
      return;
    }

    const analysis = await analyzeProject(files, {
      model: 'haiku', // Always use Haiku for analysis (cheaper)
      apiKey: apiKey || undefined,
    });
    res.json({ analysis: JSON.parse(analysis) });
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze project' });
  }
});

// POST /api/chat/generate-context - Generate context.md file
router.post('/generate-context', async (req: Request, res: Response) => {
  try {
    const {
      projectName,
      analysis,
      userAnswers,
      model,
      apiKey,
    }: {
      projectName: string;
      analysis: string;
      userAnswers: Record<string, string>;
      model?: ModelType;
      apiKey?: string;
    } = req.body;

    if (!projectName) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }

    const validModel = model && isValidModel(model) ? model : 'sonnet';

    const contextContent = await generateContextFile(
      projectName,
      analysis || '{}',
      userAnswers || {},
      {
        model: validModel,
        apiKey: apiKey || undefined,
      }
    );

    res.json({ content: contextContent });
  } catch (error) {
    console.error('Generate context error:', error);
    res.status(500).json({ error: 'Failed to generate context' });
  }
});

export default router;
