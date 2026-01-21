import Anthropic from '@anthropic-ai/sdk';

// Model constants
export const MODELS = {
  HAIKU: 'claude-3-5-haiku-20241022',
  SONNET: 'claude-sonnet-4-20250514',
  OPUS: 'claude-opus-4-5-20251101',
} as const;

export type ModelType = 'haiku' | 'sonnet' | 'opus';

// Map friendly names to model IDs
const MODEL_MAP: Record<ModelType, string> = {
  haiku: MODELS.HAIKU,
  sonnet: MODELS.SONNET,
  opus: MODELS.OPUS,
};

// Create Anthropic client (supports BYOK)
function createClient(apiKey?: string): Anthropic {
  return new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });
}

// Default client for non-BYOK requests
const defaultClient = createClient();

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
}

export interface ChatResponse {
  content: string;
  fileChanges: FileChange[];
}

export interface ChatOptions {
  model?: ModelType;
  apiKey?: string; // For BYOK users
}

const SYSTEM_PROMPT = `You are an AI coding assistant integrated into "Poolside Code", a mobile app that lets users edit code through conversation. You help users modify their code projects stored in OneDrive.

IMPORTANT GUIDELINES:
1. When the user asks you to make changes to code, respond with BOTH:
   - A natural language explanation of what you're doing
   - The actual file changes in a structured format

2. For file changes, use this exact format at the end of your response:
   ---FILE_CHANGES_START---
   {"changes": [
     {"path": "relative/path/to/file.ts", "action": "modify", "content": "full file content here"},
     {"path": "new/file.ts", "action": "create", "content": "new file content"}
   ]}
   ---FILE_CHANGES_END---

3. Always provide the COMPLETE file content, not just the changed parts.

4. Keep explanations concise since users are on mobile devices.

5. If you need more information about the project structure or specific files, ask the user or request to see the relevant files.

6. Respect the project context - follow the coding conventions and patterns mentioned.

7. Never modify files listed in the "Do Not Modify" section of the context.`;

export async function streamChat(
  messages: ChatMessage[],
  projectContext: string,
  onChunk: (chunk: string) => void,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const { model = 'sonnet', apiKey } = options;
  const client = apiKey ? createClient(apiKey) : defaultClient;
  const modelId = MODEL_MAP[model];

  const systemMessage = `${SYSTEM_PROMPT}\n\n---PROJECT CONTEXT---\n${projectContext}\n---END CONTEXT---`;

  let fullResponse = '';

  const stream = await client.messages.stream({
    model: modelId,
    max_tokens: 4096,
    system: systemMessage,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      const text = event.delta.text;
      fullResponse += text;
      onChunk(text);
    }
  }

  // Parse file changes from the response
  const fileChanges = parseFileChanges(fullResponse);

  // Remove the file changes JSON from the visible response
  const cleanedContent = fullResponse
    .replace(/---FILE_CHANGES_START---[\s\S]*?---FILE_CHANGES_END---/g, '')
    .trim();

  return {
    content: cleanedContent,
    fileChanges,
  };
}

export async function chat(
  messages: ChatMessage[],
  projectContext: string,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const { model = 'sonnet', apiKey } = options;
  const client = apiKey ? createClient(apiKey) : defaultClient;
  const modelId = MODEL_MAP[model];

  const systemMessage = `${SYSTEM_PROMPT}\n\n---PROJECT CONTEXT---\n${projectContext}\n---END CONTEXT---`;

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: systemMessage,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const content =
    response.content[0].type === 'text' ? response.content[0].text : '';

  const fileChanges = parseFileChanges(content);
  const cleanedContent = content
    .replace(/---FILE_CHANGES_START---[\s\S]*?---FILE_CHANGES_END---/g, '')
    .trim();

  return {
    content: cleanedContent,
    fileChanges,
  };
}

function parseFileChanges(content: string): FileChange[] {
  const match = content.match(
    /---FILE_CHANGES_START---([\s\S]*?)---FILE_CHANGES_END---/
  );
  if (!match) return [];

  try {
    const json = JSON.parse(match[1].trim());
    return json.changes || [];
  } catch (error) {
    console.error('Failed to parse file changes:', error);
    return [];
  }
}

export async function analyzeProject(
  files: string[],
  options: ChatOptions = {}
): Promise<string> {
  const { model = 'haiku', apiKey } = options; // Use Haiku for analysis (cheaper)
  const client = apiKey ? createClient(apiKey) : defaultClient;
  const modelId = MODEL_MAP[model];

  const fileList = files.join('\n');

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyze this project structure and identify:
1. The main programming languages used
2. Frameworks or libraries (look for package.json, requirements.txt, etc.)
3. Project type (web app, API, mobile app, etc.)
4. Key directories and their purposes

File structure:
${fileList}

Respond in JSON format:
{
  "languages": ["TypeScript", "JavaScript"],
  "frameworks": ["React", "Node.js"],
  "projectType": "Web Application",
  "keyDirectories": {
    "src": "Source code",
    "tests": "Test files"
  }
}`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '{}';
}

export async function generateContextFile(
  projectName: string,
  analysis: string,
  userAnswers: Record<string, string>,
  options: ChatOptions = {}
): Promise<string> {
  const { model = 'sonnet', apiKey } = options;
  const client = apiKey ? createClient(apiKey) : defaultClient;
  const modelId = MODEL_MAP[model];

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Generate a context.md file for this project based on the analysis and user answers.

Project Name: ${projectName}

Auto-detected Analysis:
${analysis}

User-provided Information:
- Overview: ${userAnswers.overview || 'Not provided'}
- Tech Stack: ${userAnswers.techStack || 'Not provided'}
- Conventions: ${userAnswers.conventions || 'Not provided'}
- Do Not Modify: ${userAnswers.doNotModify || 'Not provided'}

Generate a well-structured context.md file using this format:

# Project Context - [Project Name]

## Overview
[What the project does]

## Tech Stack
[Frameworks, libraries, languages]

## Project Structure
[Key folders and their purposes]

## Important Conventions
[Code patterns, naming conventions]

## Do Not Modify
[Files/folders that should not be changed]

## Recent Changes
[Empty for now - will be auto-updated]`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
