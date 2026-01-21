import { Router, Request, Response } from 'express';
import {
  streamChat,
  chat,
  analyzeProject,
  generateContextFile,
  ModelType,
} from '../services/claude';

const router = Router();

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: string;
  stream?: boolean;
  model?: ModelType;
  apiKey?: string; // For BYOK users
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
