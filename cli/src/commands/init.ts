import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import ora from 'ora';
import * as p from '@clack/prompts';
import type { AIType } from '../types/index.js';
import { AI_TYPES } from '../types/index.js';
import { copyFolders, installFromZip, createTempDir, cleanup } from '../utils/extract.js';
import { generatePlatformFiles, generateAllPlatformFiles } from '../utils/template.js';
import { detectAIType, getAITypeDescription } from '../utils/detect.js';
import { logger } from '../utils/logger.js';
import {
  getLatestRelease,
  getAssetUrl,
  downloadRelease,
  GitHubRateLimitError,
  GitHubDownloadError,
} from '../utils/github.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// From dist/index.js -> ../assets (one level up to cli/, then assets/)
const ASSETS_DIR = join(__dirname, '..', 'assets');

interface InitOptions {
  ai?: AIType;
  force?: boolean;
  offline?: boolean;
  legacy?: boolean; // Use old ZIP-based install
}

/**
 * Try to install from GitHub release (legacy method)
 * Returns the copied folders if successful, null if failed
 */
async function tryGitHubInstall(
  targetDir: string,
  aiType: AIType,
  spinner: ReturnType<typeof ora>
): Promise<string[] | null> {
  let tempDir: string | null = null;

  try {
    spinner.text = 'Fetching latest release from GitHub...';
    const release = await getLatestRelease();
    const assetUrl = getAssetUrl(release);

    if (!assetUrl) {
      throw new GitHubDownloadError('No ZIP asset found in latest release');
    }

    spinner.text = `Downloading ${release.tag_name}...`;
    tempDir = await createTempDir();
    const zipPath = join(tempDir, 'release.zip');

    await downloadRelease(assetUrl, zipPath);

    spinner.text = 'Extracting and installing files...';
    const { copiedFolders, tempDir: extractedTempDir } = await installFromZip(
      zipPath,
      targetDir,
      aiType
    );

    // Cleanup temp directory
    await cleanup(extractedTempDir);

    return copiedFolders;
  } catch (error) {
    // Cleanup temp directory on error
    if (tempDir) {
      await cleanup(tempDir);
    }

    if (error instanceof GitHubRateLimitError) {
      spinner.warn('GitHub rate limit reached, using template generation...');
      return null;
    }

    if (error instanceof GitHubDownloadError) {
      spinner.warn('GitHub download failed, using template generation...');
      return null;
    }

    // Network errors or other fetch failures
    if (error instanceof TypeError && error.message.includes('fetch')) {
      spinner.warn('Network error, using template generation...');
      return null;
    }

    // Unknown errors - still fall back
    spinner.warn('Download failed, using template generation...');
    return null;
  }
}

/**
 * Install using template generation (new method)
 */
async function templateInstall(
  targetDir: string,
  aiType: AIType,
  spinner: ReturnType<typeof ora>
): Promise<string[]> {
  spinner.text = 'Generating skill files from templates...';

  if (aiType === 'all') {
    return generateAllPlatformFiles(targetDir);
  }

  return generatePlatformFiles(targetDir, aiType);
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log();
  p.intro(chalk.bgCyan.black(' UI/UX Pro Max Installer '));

  let selectedTypes: AIType[] = [];

  // If --ai flag is provided, use that single type
  if (options.ai) {
    selectedTypes = [options.ai];
    p.log.info(`Installing for: ${chalk.cyan(getAITypeDescription(options.ai))}`);
  } else {
    // Auto-detect installed AI assistants
    const { detected } = detectAIType();

    if (detected.length > 0) {
      p.log.info(`Detected: ${detected.map(t => chalk.cyan(getAITypeDescription(t))).join(', ')}`);
    }

    // Filter out 'all' from AI_TYPES for multi-select
    const selectableTypes = AI_TYPES.filter(t => t !== 'all');

    // Multi-select prompt
    const selected = await p.multiselect({
      message: 'Select AI assistants to install for:',
      options: selectableTypes.map(type => ({
        value: type,
        label: getAITypeDescription(type),
        hint: detected.includes(type) ? 'detected' : undefined,
      })),
      initialValues: detected.length > 0 ? detected : ['claude'],
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    selectedTypes = selected as AIType[];
  }

  if (selectedTypes.length === 0) {
    p.log.error('No AI assistants selected');
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Installing skill files...');

  const cwd = process.cwd();
  const allCopiedFolders: string[] = [];

  try {
    for (const aiType of selectedTypes) {
      // Use legacy ZIP-based install if --legacy flag is set
      if (options.legacy) {
        const oraSpinner = ora().start();
        // Try GitHub download first (unless offline mode)
        if (!options.offline) {
          const githubResult = await tryGitHubInstall(cwd, aiType, oraSpinner);
          if (githubResult) {
            allCopiedFolders.push(...githubResult);
            oraSpinner.stop();
            continue;
          }
        }
        // Fall back to bundled assets if GitHub failed or offline mode
        const folders = await copyFolders(ASSETS_DIR, cwd, aiType);
        allCopiedFolders.push(...folders);
        oraSpinner.stop();
      } else {
        // Use new template-based generation (default)
        const folders = await generatePlatformFiles(cwd, aiType);
        allCopiedFolders.push(...folders);
      }
    }

    spinner.stop('Installation complete');

    // Summary - deduplicate folders
    const uniqueFolders = [...new Set(allCopiedFolders)];

    console.log();
    p.log.success(`Installed for ${chalk.cyan(selectedTypes.length)} AI assistant(s):`);
    for (const aiType of selectedTypes) {
      p.log.message(`  ${chalk.green('✓')} ${getAITypeDescription(aiType)}`);
    }

    console.log();
    p.log.step('Created folders:');
    for (const folder of uniqueFolders) {
      p.log.message(`  ${chalk.dim(folder)}`);
    }

    console.log();
    p.outro(chalk.green('Done! Restart your AI coding assistant to use the skill.'));

  } catch (error) {
    spinner.stop('Installation failed');
    if (error instanceof Error) {
      p.log.error(error.message);
    }
    process.exit(1);
  }
}
