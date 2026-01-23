import Anthropic from '@anthropic-ai/sdk';
import type { Tool, ToolUseBlock, TextBlock, ContentBlock, MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';

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
  content: string | ContentBlock[];
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface ChatResponse {
  content: string;
  fileChanges: FileChange[];
  toolCalls?: ToolCall[];
  stopReason?: string;
}

export interface ChatOptions {
  model?: ModelType;
  apiKey?: string; // For BYOK users
}

export interface ChatWithToolsOptions extends ChatOptions {
  enableTools?: boolean;
  toolResults?: ToolResult[];
}

// Tool definitions for file reading
export const FILE_TOOLS: Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the project. Use this to examine code, configuration files, or any text file in the project. ALWAYS use this tool when you need to see file contents before making changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The relative path to the file within the project (e.g., "src/components/App.tsx")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_multiple_files',
    description: 'Read the contents of multiple files at once. More efficient than reading files one by one.',
    input_schema: {
      type: 'object' as const,
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of relative file paths to read',
        },
      },
      required: ['paths'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files in the project that match a pattern or contain specific text in their name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query - can be a filename pattern (e.g., "*.tsx") or text to search for in file names',
        },
      },
      required: ['query'],
    },
  },
];

const SYSTEM_PROMPT = `You are an AI coding assistant integrated into "Poolside Code", a mobile app that lets users edit code through conversation. You help users modify their code projects stored in OneDrive or GitHub.

IMPORTANT GUIDELINES:

1. FILE READING: You have tools to read files from the project. When the user asks about code or wants changes:
   - Use read_file or read_multiple_files to examine the actual file contents BEFORE making changes
   - Use search_files to find files when you're not sure of the exact path
   - ALWAYS read a file before modifying it - never guess at its contents

2. When the user asks you to make changes to code, respond with BOTH:
   - A natural language explanation of what you're doing
   - The actual file changes in a structured format

3. For file changes, use this exact format at the end of your response:
   ---FILE_CHANGES_START---
   {"changes": [
     {"path": "relative/path/to/file.ts", "action": "modify", "content": "full file content here"},
     {"path": "new/file.ts", "action": "create", "content": "new file content"}
   ]}
   ---FILE_CHANGES_END---

4. Always provide the COMPLETE file content, not just the changed parts.

5. Keep explanations concise since users are on mobile devices.

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

// Extract text content from response
function extractTextContent(content: ContentBlock[]): string {
  return content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

// Extract tool calls from response
function extractToolCalls(content: ContentBlock[]): ToolCall[] {
  return content
    .filter((block): block is ToolUseBlock => block.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

// Chat with tools support - handles the agentic loop
export async function chatWithTools(
  messages: MessageParam[],
  projectContext: string,
  options: ChatWithToolsOptions = {}
): Promise<ChatResponse> {
  const { model = 'sonnet', apiKey, enableTools = true, toolResults } = options;
  const client = apiKey ? createClient(apiKey) : defaultClient;
  const modelId = MODEL_MAP[model];

  const systemMessage = `${SYSTEM_PROMPT}\n\n---PROJECT CONTEXT---\n${projectContext}\n---END CONTEXT---`;

  // Build the messages array
  let apiMessages: MessageParam[] = [...messages];

  // If we have tool results, we need to add them as a user message
  if (toolResults && toolResults.length > 0) {
    const toolResultContent: ToolResultBlockParam[] = toolResults.map((tr) => ({
      type: 'tool_result' as const,
      tool_use_id: tr.toolCallId,
      content: tr.result,
      is_error: tr.isError,
    }));

    apiMessages.push({
      role: 'user',
      content: toolResultContent,
    });
  }

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: systemMessage,
    messages: apiMessages,
    tools: enableTools ? FILE_TOOLS : undefined,
  });

  const textContent = extractTextContent(response.content);
  const toolCalls = extractToolCalls(response.content);

  const fileChanges = parseFileChanges(textContent);
  const cleanedContent = textContent
    .replace(/---FILE_CHANGES_START---[\s\S]*?---FILE_CHANGES_END---/g, '')
    .trim();

  return {
    content: cleanedContent,
    fileChanges,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    stopReason: response.stop_reason || undefined,
  };
}

// Streaming chat with tools support
export async function streamChatWithTools(
  messages: MessageParam[],
  projectContext: string,
  onChunk: (chunk: string) => void,
  onToolUse: (toolCalls: ToolCall[]) => void,
  options: ChatWithToolsOptions = {}
): Promise<ChatResponse> {
  const { model = 'sonnet', apiKey, enableTools = true, toolResults } = options;
  const client = apiKey ? createClient(apiKey) : defaultClient;
  const modelId = MODEL_MAP[model];

  const systemMessage = `${SYSTEM_PROMPT}\n\n---PROJECT CONTEXT---\n${projectContext}\n---END CONTEXT---`;

  // Build the messages array
  let apiMessages: MessageParam[] = [...messages];

  // If we have tool results, add them
  if (toolResults && toolResults.length > 0) {
    const toolResultContent: ToolResultBlockParam[] = toolResults.map((tr) => ({
      type: 'tool_result' as const,
      tool_use_id: tr.toolCallId,
      content: tr.result,
      is_error: tr.isError,
    }));

    apiMessages.push({
      role: 'user',
      content: toolResultContent,
    });
  }

  let fullResponse = '';
  const toolCalls: ToolCall[] = [];
  let currentToolUse: Partial<ToolUseBlock> | null = null;
  let toolInputJson = '';

  const stream = await client.messages.stream({
    model: modelId,
    max_tokens: 4096,
    system: systemMessage,
    messages: apiMessages,
    tools: enableTools ? FILE_TOOLS : undefined,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      if (event.content_block.type === 'tool_use') {
        currentToolUse = {
          type: 'tool_use',
          id: event.content_block.id,
          name: event.content_block.name,
        };
        toolInputJson = '';
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullResponse += text;
        onChunk(text);
      } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
        toolInputJson += event.delta.partial_json;
      }
    } else if (event.type === 'content_block_stop' && currentToolUse) {
      try {
        const input = JSON.parse(toolInputJson || '{}');
        toolCalls.push({
          id: currentToolUse.id!,
          name: currentToolUse.name!,
          input,
        });
      } catch (e) {
        console.error('Failed to parse tool input:', e);
      }
      currentToolUse = null;
      toolInputJson = '';
    }
  }

  // Notify about tool calls if any
  if (toolCalls.length > 0) {
    onToolUse(toolCalls);
  }

  const fileChanges = parseFileChanges(fullResponse);
  const cleanedContent = fullResponse
    .replace(/---FILE_CHANGES_START---[\s\S]*?---FILE_CHANGES_END---/g, '')
    .trim();

  const finalMessage = await stream.finalMessage();

  return {
    content: cleanedContent,
    fileChanges,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    stopReason: finalMessage.stop_reason || undefined,
  };
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
