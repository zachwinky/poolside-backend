import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';

export interface DriveItem {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  lastModified: string;
  children?: DriveItem[];
}

export function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

export async function listDriveItems(
  accessToken: string,
  path: string = '/'
): Promise<DriveItem[]> {
  const client = createGraphClient(accessToken);

  try {
    let endpoint: string;
    if (path === '/') {
      endpoint = '/me/drive/root/children';
    } else {
      endpoint = `/me/drive/root:${path}:/children`;
    }

    const response = await client.api(endpoint).get();

    return response.value.map((item: any) => ({
      id: item.id,
      name: item.name,
      path: path === '/' ? `/${item.name}` : `${path}/${item.name}`,
      isFolder: !!item.folder,
      size: item.size,
      lastModified: item.lastModifiedDateTime,
    }));
  } catch (error) {
    console.error('Failed to list drive items:', error);
    throw error;
  }
}

export async function getFileContent(
  accessToken: string,
  path: string
): Promise<string> {
  const client = createGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/drive/root:${path}:/content`)
      .get();

    // For text files, response is the content directly
    if (typeof response === 'string') {
      return response;
    }

    // For binary/blob responses, convert to string
    if (response instanceof ArrayBuffer) {
      return new TextDecoder().decode(response);
    }

    return String(response);
  } catch (error) {
    console.error('Failed to get file content:', error);
    throw error;
  }
}

export async function writeFileContent(
  accessToken: string,
  path: string,
  content: string
): Promise<DriveItem> {
  const client = createGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/drive/root:${path}:/content`)
      .put(content);

    return {
      id: response.id,
      name: response.name,
      path: path,
      isFolder: false,
      size: response.size,
      lastModified: response.lastModifiedDateTime,
    };
  } catch (error) {
    console.error('Failed to write file:', error);
    throw error;
  }
}

export async function deleteFile(
  accessToken: string,
  path: string
): Promise<void> {
  const client = createGraphClient(accessToken);

  try {
    await client.api(`/me/drive/root:${path}`).delete();
  } catch (error) {
    console.error('Failed to delete file:', error);
    throw error;
  }
}

export async function createFolder(
  accessToken: string,
  parentPath: string,
  folderName: string
): Promise<DriveItem> {
  const client = createGraphClient(accessToken);

  try {
    const endpoint =
      parentPath === '/'
        ? '/me/drive/root/children'
        : `/me/drive/root:${parentPath}:/children`;

    const response = await client.api(endpoint).post({
      name: folderName,
      folder: {},
    });

    return {
      id: response.id,
      name: response.name,
      path:
        parentPath === '/'
          ? `/${folderName}`
          : `${parentPath}/${folderName}`,
      isFolder: true,
      lastModified: response.lastModifiedDateTime,
    };
  } catch (error) {
    console.error('Failed to create folder:', error);
    throw error;
  }
}

export async function listAllFiles(
  accessToken: string,
  path: string,
  maxDepth: number = 3
): Promise<string[]> {
  const files: string[] = [];

  async function recurse(currentPath: string, depth: number) {
    if (depth > maxDepth) return;

    const items = await listDriveItems(accessToken, currentPath);

    for (const item of items) {
      if (item.isFolder) {
        await recurse(item.path, depth + 1);
      } else {
        files.push(item.path);
      }
    }
  }

  await recurse(path, 0);
  return files;
}

export async function getFileTree(
  accessToken: string,
  path: string,
  maxDepth: number = 2
): Promise<DriveItem> {
  const client = createGraphClient(accessToken);

  async function buildTree(
    currentPath: string,
    depth: number
  ): Promise<DriveItem[]> {
    if (depth > maxDepth) return [];

    const items = await listDriveItems(accessToken, currentPath);
    const result: DriveItem[] = [];

    for (const item of items) {
      const treeItem: DriveItem = { ...item };
      if (item.isFolder && depth < maxDepth) {
        treeItem.children = await buildTree(item.path, depth + 1);
      }
      result.push(treeItem);
    }

    return result;
  }

  // Get the root folder info
  let rootInfo: any;
  if (path === '/') {
    rootInfo = await client.api('/me/drive/root').get();
  } else {
    rootInfo = await client.api(`/me/drive/root:${path}`).get();
  }

  const root: DriveItem = {
    id: rootInfo.id,
    name: rootInfo.name,
    path: path,
    isFolder: true,
    lastModified: rootInfo.lastModifiedDateTime,
    children: await buildTree(path, 0),
  };

  return root;
}
