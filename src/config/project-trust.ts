import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectArtifacts {
  hasConfig: boolean;
  hasPlugins: boolean;
  hasAgentDoc: boolean;
  fingerprint: string;
}

export type ProjectTrustStatus = 'none' | 'pending' | 'trusted';

export interface ProjectTrust {
  status: ProjectTrustStatus;
  workspace: string;
  hasConfig: boolean;
  hasPlugins: boolean;
  hasAgentDoc: boolean;
  fingerprint: string;
}

const PLUGIN_EXTENSIONS = /\.(?:mjs|js|ts)$/i;
const AGENT_DOC_PATHS = ['AGENT.md', join('.banana', 'AGENT.md')];

function readIfExists(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

function pluginFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => PLUGIN_EXTENSIONS.test(name))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

/** 检查一个工作区里会影响 agent 行为的项目级文件，并生成稳定指纹。 */
export function inspectProject(workspace: string): ProjectArtifacts {
  const configPath = join(workspace, '.banana', 'config.json');
  const config = readIfExists(configPath);
  const plugins = pluginFiles(join(workspace, '.banana', 'tools'));
  const agentDoc = AGENT_DOC_PATHS.map((relative) => join(workspace, relative))
    .map((path) => (existsSync(path) ? readIfExists(path) : null))
    .find((content): content is string => content !== null);

  const parts: string[] = [];
  if (config !== null) parts.push(`config\0${config}`);
  for (const file of plugins) {
    const content = readIfExists(file);
    if (content !== null) parts.push(`plugin:${file}\0${content}`);
  }
  if (agentDoc) parts.push(`agent\0${agentDoc}`);

  const fingerprint = createHash('sha256').update(parts.join('\0')).digest('hex');
  return {
    hasConfig: config !== null,
    hasPlugins: plugins.length > 0,
    hasAgentDoc: Boolean(agentDoc),
    fingerprint,
  };
}
