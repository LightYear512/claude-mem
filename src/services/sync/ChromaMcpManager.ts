/**
 * ChromaMcpManager - Singleton managing a persistent MCP connection to chroma-mcp via uvx
 *
 * Replaces ChromaServerManager (which spawned `npx chroma run`) with a stdio-based
 * MCP client that communicates with chroma-mcp as a subprocess. The chroma-mcp server
 * handles its own embedding and persistent storage, eliminating the need for a separate
 * HTTP server, chromadb npm package, and ONNX/WASM embedding dependencies.
 *
 * Lifecycle: lazy-connects on first callTool() use, maintains a single persistent
 * connection per worker lifetime, and auto-reconnects if the subprocess dies.
 *
 * Cross-platform: Linux, macOS, Windows
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { logger } from '../../utils/logger.js';
import { SettingsDefaultsManager } from '../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../shared/paths.js';

const CHROMA_MCP_CLIENT_NAME = 'claude-mem-chroma';
const CHROMA_MCP_CLIENT_VERSION = '1.0.0';
const MCP_CONNECTION_TIMEOUT_MS = 30_000;
const RECONNECT_BACKOFF_MS = 10_000; // Don't retry connections faster than this after failure
const DEFAULT_CHROMA_DATA_DIR = path.join(os.homedir(), '.claude-mem', 'chroma');

export class ChromaMcpManager {
  private static instance: ChromaMcpManager | null = null;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected: boolean = false;
  private lastConnectionFailureTimestamp: number = 0;
  private connecting: Promise<void> | null = null;
  private stopped: boolean = false;

  private constructor() {}

  /**
   * Get or create the singleton instance
   */
  static getInstance(): ChromaMcpManager {
    if (!ChromaMcpManager.instance) {
      ChromaMcpManager.instance = new ChromaMcpManager();
    }
    return ChromaMcpManager.instance;
  }

  /**
   * Ensure the MCP client is connected to chroma-mcp.
   * Uses a connection lock to prevent concurrent connection attempts.
   * If the subprocess has died since the last use, reconnects transparently.
   */
  private async ensureConnected(): Promise<void> {
    // Reject all connections after stop() to prevent fire-and-forget tasks
    // (e.g., backfillAllProjects) from respawning the subprocess during shutdown.
    if (this.stopped) {
      throw new Error('ChromaMcpManager has been stopped');
    }

    if (this.connected && this.client) {
      return;
    }

    // Backoff: don't retry connections too fast after a failure
    const timeSinceLastFailure = Date.now() - this.lastConnectionFailureTimestamp;
    if (this.lastConnectionFailureTimestamp > 0 && timeSinceLastFailure < RECONNECT_BACKOFF_MS) {
      throw new Error(`chroma-mcp connection in backoff (${Math.ceil((RECONNECT_BACKOFF_MS - timeSinceLastFailure) / 1000)}s remaining)`);
    }

    // If another caller is already connecting, wait for that attempt
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = this.connectInternal();
    try {
      await this.connecting;
    } catch (error) {
      this.lastConnectionFailureTimestamp = Date.now();
      throw error;
    } finally {
      this.connecting = null;
    }
  }

  /**
   * Internal connection logic - spawns uvx chroma-mcp and performs MCP handshake.
   * Called behind the connection lock to ensure only one connection attempt at a time.
   */
  private async connectInternal(): Promise<void> {
    // Clean up any stale client/transport from a dead subprocess.
    // Close transport first (kills subprocess via SIGTERM) before client
    // to avoid hanging on a stuck process.
    if (this.transport) {
      try { await this.transport.close(); } catch { /* already dead */ }
    }
    if (this.client) {
      try { await this.client.close(); } catch { /* already dead */ }
    }
    this.client = null;
    this.transport = null;
    this.connected = false;

    const commandArgs = this.buildCommandArgs();
    const spawnEnvironment = this.getSpawnEnv();

    // On Windows, .cmd files require shell resolution. Since MCP SDK's
    // StdioClientTransport doesn't support `shell: true`, route through
    // cmd.exe which resolves .cmd/.bat extensions and PATH automatically.
    // This also fixes Git Bash compatibility (#1062) since cmd.exe handles
    // Windows-native command resolution regardless of the calling shell.
    const isWindows = process.platform === 'win32';
    const uvxSpawnCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'uvx';
    const uvxSpawnArgs = isWindows ? ['/c', 'uvx', ...commandArgs] : commandArgs;

    logger.info('CHROMA_MCP', 'Connecting to chroma-mcp via MCP stdio', {
      command: uvxSpawnCommand,
      args: uvxSpawnArgs.join(' ')
    });

    // Windows: MCP SDK's StdioClientTransport only sets windowsHide for Electron
    // (via isElectron() check), not for Bun/Node.js. Without windowsHide, spawning
    // cmd.exe creates a persistent visible console window. Temporarily patch
    // child_process.spawn to inject windowsHide: true before the MCP SDK spawns
    // the subprocess. In the esbuild CJS bundle, both our code and the inlined
    // MCP SDK reference the same require('child_process') module object, so
    // property-level patching affects the SDK's spawn calls.
    // Use runtime require() instead of ESM namespace to get a mutable module reference.
    const cp = typeof globalThis.require === 'function'
      ? globalThis.require('child_process')
      : require('child_process');
    const origSpawn = cp.spawn;
    if (isWindows) {
      cp.spawn = function patchedSpawn(
        command: string,
        args: readonly string[],
        options: any
      ) {
        return origSpawn.call(cp, command, args, { ...options, windowsHide: true });
      };
    }

    this.transport = new StdioClientTransport({
      command: uvxSpawnCommand,
      args: uvxSpawnArgs,
      env: spawnEnvironment,
      stderr: 'pipe'
    });

    this.client = new Client(
      { name: CHROMA_MCP_CLIENT_NAME, version: CHROMA_MCP_CLIENT_VERSION },
      { capabilities: {} }
    );

    const mcpConnectionPromise = this.client.connect(this.transport);
    // Restore original spawn — the subprocess was already created synchronously
    // within connect() before any async operations.
    if (isWindows) {
      cp.spawn = origSpawn;
    }
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`MCP connection to chroma-mcp timed out after ${MCP_CONNECTION_TIMEOUT_MS}ms`)),
        MCP_CONNECTION_TIMEOUT_MS
      );
    });

    try {
      await Promise.race([mcpConnectionPromise, timeoutPromise]);
    } catch (connectionError) {
      // Connection failed or timed out - kill the subprocess to prevent zombies
      clearTimeout(timeoutId!);
      logger.warn('CHROMA_MCP', 'Connection failed, killing subprocess to prevent zombie', {
        error: connectionError instanceof Error ? connectionError.message : String(connectionError)
      });
      try { await this.transport.close(); } catch { /* best effort */ }
      try { await this.client.close(); } catch { /* best effort */ }
      this.client = null;
      this.transport = null;
      this.connected = false;
      throw connectionError;
    }
    clearTimeout(timeoutId!);

    this.connected = true;

    logger.info('CHROMA_MCP', 'Connected to chroma-mcp successfully');

    // Listen for transport close to mark connection as dead and apply backoff.
    // CRITICAL: Guard with reference check to prevent stale onclose handlers from
    // previous transports overwriting the current connection (race condition).
    const currentTransport = this.transport;
    this.transport.onclose = () => {
      if (this.transport !== currentTransport) {
        logger.debug('CHROMA_MCP', 'Ignoring stale onclose from previous transport');
        return;
      }
      logger.warn('CHROMA_MCP', 'chroma-mcp subprocess closed unexpectedly, applying reconnect backoff');
      this.connected = false;
      this.client = null;
      this.transport = null;
      this.lastConnectionFailureTimestamp = Date.now();
    };
  }

  /**
   * Build the uvx command arguments based on current settings.
   * In local mode: uses persistent client with local data directory.
   * In remote mode: uses http client with configured host/port/auth.
   */
  private buildCommandArgs(): string[] {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    const chromaMode = settings.CLAUDE_MEM_CHROMA_MODE || 'local';
    const pythonVersion = process.env.CLAUDE_MEM_PYTHON_VERSION || settings.CLAUDE_MEM_PYTHON_VERSION || '3.13';

    if (chromaMode === 'remote') {
      const chromaHost = settings.CLAUDE_MEM_CHROMA_HOST || '127.0.0.1';
      const chromaPort = settings.CLAUDE_MEM_CHROMA_PORT || '8000';
      const chromaSsl = settings.CLAUDE_MEM_CHROMA_SSL === 'true';
      const chromaTenant = settings.CLAUDE_MEM_CHROMA_TENANT || 'default_tenant';
      const chromaDatabase = settings.CLAUDE_MEM_CHROMA_DATABASE || 'default_database';
      const chromaApiKey = settings.CLAUDE_MEM_CHROMA_API_KEY || '';

      const args = [
        '--python', pythonVersion,
        'chroma-mcp',
        '--client-type', 'http',
        '--host', chromaHost,
        '--port', chromaPort
      ];

      if (chromaSsl) {
        args.push('--ssl');
      }

      if (chromaTenant !== 'default_tenant') {
        args.push('--tenant', chromaTenant);
      }

      if (chromaDatabase !== 'default_database') {
        args.push('--database', chromaDatabase);
      }

      if (chromaApiKey) {
        args.push('--api-key', chromaApiKey);
      }

      return args;
    }

    // Local mode: persistent client with data directory
    return [
      '--python', pythonVersion,
      'chroma-mcp',
      '--client-type', 'persistent',
      '--data-dir', DEFAULT_CHROMA_DATA_DIR.replace(/\\/g, '/')
    ];
  }

  /**
   * Call a chroma-mcp tool by name with the given arguments.
   * Lazily connects on first call. Reconnects if the subprocess has died.
   *
   * @param toolName - The chroma-mcp tool name (e.g. 'chroma_query_documents')
   * @param toolArguments - The tool arguments as a plain object
   * @returns The parsed JSON result from the tool's text output
   */
  async callTool(toolName: string, toolArguments: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();

    logger.debug('CHROMA_MCP', `Calling tool: ${toolName}`, {
      arguments: JSON.stringify(toolArguments).slice(0, 200)
    });

    let result;
    try {
      result = await this.client!.callTool({
        name: toolName,
        arguments: toolArguments
      });
    } catch (transportError) {
      // Transport error: chroma-mcp subprocess likely died (e.g., killed by orphan reaper,
      // HNSW index corruption). Mark connection dead and retry once after reconnect (#1131).
      // Without this retry, callers see a one-shot error even though reconnect would succeed.
      this.connected = false;
      this.client = null;
      this.transport = null;

      logger.warn('CHROMA_MCP', `Transport error during "${toolName}", reconnecting and retrying once`, {
        error: transportError instanceof Error ? transportError.message : String(transportError)
      });

      try {
        await this.ensureConnected();
        result = await this.client!.callTool({
          name: toolName,
          arguments: toolArguments
        });
      } catch (retryError) {
        this.connected = false;
        throw new Error(`chroma-mcp transport error during "${toolName}" (retry failed): ${retryError instanceof Error ? retryError.message : String(retryError)}`);
      }
    }

    // MCP tools signal errors via isError flag on the CallToolResult
    if (result.isError) {
      const errorText = (result.content as Array<{ type: string; text?: string }>)
        ?.find(item => item.type === 'text')?.text || 'Unknown chroma-mcp error';
      throw new Error(`chroma-mcp tool "${toolName}" returned error: ${errorText}`);
    }

    // Extract text from MCP CallToolResult: { content: Array<{ type, text? }> }
    const contentArray = result.content as Array<{ type: string; text?: string }>;
    if (!contentArray || contentArray.length === 0) {
      return null;
    }

    const firstTextContent = contentArray.find(item => item.type === 'text' && item.text);
    if (!firstTextContent || !firstTextContent.text) {
      return null;
    }

    // chroma-mcp returns JSON for query/get results, but plain text for
    // mutating operations (e.g. "Successfully created collection ...").
    // Try JSON parse first; if it fails, return the raw text for non-error responses.
    try {
      return JSON.parse(firstTextContent.text);
    } catch {
      // Plain text response (e.g. "Successfully created collection cm__foo")
      // Return null for void-like success messages, callers don't need the text
      return null;
    }
  }

  /**
   * Check if the MCP connection is alive by calling chroma_list_collections.
   * Returns true if the connection is healthy, false otherwise.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.callTool('chroma_list_collections', { limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gracefully stop the MCP connection and kill the chroma-mcp subprocess.
   *
   * Close transport first (kills subprocess via SIGTERM) before client
   * to avoid hanging on a stuck process - mirrors connectInternal() cleanup.
   *
   * Sets stopped flag to prevent fire-and-forget tasks (backfillAllProjects)
   * from respawning the subprocess between stop() and process.exit().
   */
  async stop(): Promise<void> {
    // Prevent any future reconnections (must be set before any await)
    this.stopped = true;

    // If a connection attempt is in progress, wait briefly for the transport
    // to be created so we can kill its subprocess. Don't wait for the full
    // 30s connection timeout — the 10s shutdown force-exit timer would fire
    // first, calling process.exit() and orphaning the subprocess.
    if (this.connecting) {
      try {
        await Promise.race([
          this.connecting,
          new Promise<void>(resolve => setTimeout(resolve, 2000))
        ]);
      } catch { /* ignore - we're stopping anyway */ }
    }

    if (!this.client && !this.transport) {
      logger.debug('CHROMA_MCP', 'No active MCP connection to stop');
      return;
    }

    logger.info('CHROMA_MCP', 'Stopping chroma-mcp MCP connection');

    // Capture subprocess PID and find its children BEFORE transport.close().
    // transport.close() escalates stdin-close → SIGTERM → SIGKILL on the
    // direct child (e.g., uvx). On platforms where uvx doesn't exec() into
    // Python, the grandchild (actual chroma-mcp) survives as an orphan.
    const subprocessPid = this.transport?.pid ?? null;
    const childPids = (subprocessPid != null && process.platform !== 'win32')
      ? this.findChildPids(subprocessPid)
      : [];

    // Windows: Kill the entire process tree BEFORE transport.close() destroys
    // the parent-child relationship. taskkill /T relies on the tree being intact
    // to propagate to grandchildren (uvx → python/chroma-mcp). If we let
    // transport.close() kill cmd.exe first, the grandchildren become orphans
    // and taskkill can no longer reach them via the tree.
    if (subprocessPid != null && process.platform === 'win32') {
      if (Number.isInteger(subprocessPid) && subprocessPid > 0) {
        try {
          execSync(`taskkill /PID ${subprocessPid} /T /F`, {
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
          });
          logger.debug('CHROMA_MCP', 'Killed subprocess tree on Windows', { pid: subprocessPid });
        } catch { /* process may have already exited */ }
      }
    }

    // Close transport first (kills subprocess via SIGTERM) before client
    // to avoid hanging on a stuck process.
    if (this.transport) {
      try { await this.transport.close(); } catch { /* already dead */ }
    }
    if (this.client) {
      try { await this.client.close(); } catch { /* already dead */ }
    }

    // Kill any surviving grandchildren (e.g., Python chroma-mcp when uvx
    // spawned it as a subprocess instead of exec'ing into it).
    for (const pid of childPids) {
      try {
        process.kill(pid, 'SIGKILL');
        logger.debug('CHROMA_MCP', 'Killed surviving child process', { pid });
      } catch { /* already dead */ }
    }

    this.client = null;
    this.transport = null;
    this.connected = false;
    this.connecting = null;

    logger.info('CHROMA_MCP', 'chroma-mcp MCP connection stopped');
  }

  /**
   * Find direct child PIDs of a given parent PID (Unix only).
   * Used to identify grandchild processes (e.g., Python chroma-mcp) that
   * transport.close() won't kill because SIGKILL doesn't propagate to children.
   */
  private findChildPids(parentPid: number): number[] {
    // SECURITY: Validate PID is a positive integer to prevent command injection
    if (!Number.isInteger(parentPid) || parentPid <= 0) return [];

    try {
      const stdout = execSync(`pgrep -P ${parentPid}`, {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return stdout.trim().split('\n')
        .filter(line => line.trim().length > 0 && /^\d+$/.test(line.trim()))
        .map(line => parseInt(line.trim(), 10))
        .filter(pid => pid > 0);
    } catch {
      // pgrep exits 1 when no matches — not an error
      return [];
    }
  }

  /**
   * Reset the singleton instance (for testing).
   * Awaits stop() to prevent dual subprocesses.
   */
  static async reset(): Promise<void> {
    if (ChromaMcpManager.instance) {
      await ChromaMcpManager.instance.stop();
    }
    ChromaMcpManager.instance = null;
  }

  /**
   * Get or create a combined SSL certificate bundle for Zscaler/corporate proxy environments.
   * On macOS, combines the Python certifi CA bundle with any Zscaler certificates from
   * the system keychain. Caches the result for 24 hours at ~/.claude-mem/combined_certs.pem.
   *
   * Returns the path to the combined cert file, or undefined if not needed/available.
   */
  private getCombinedCertPath(): string | undefined {
    const combinedCertPath = path.join(os.homedir(), '.claude-mem', 'combined_certs.pem');

    if (fs.existsSync(combinedCertPath)) {
      const stats = fs.statSync(combinedCertPath);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 24 * 60 * 60 * 1000) {
        return combinedCertPath;
      }
    }

    if (process.platform !== 'darwin') {
      return undefined;
    }

    try {
      let certifiPath: string | undefined;
      try {
        certifiPath = execSync(
          'uvx --with certifi python -c "import certifi; print(certifi.where())"',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
        ).trim();
      } catch {
        return undefined;
      }

      if (!certifiPath || !fs.existsSync(certifiPath)) {
        return undefined;
      }

      let zscalerCert = '';
      try {
        zscalerCert = execSync(
          'security find-certificate -a -c "Zscaler" -p /Library/Keychains/System.keychain',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
        );
      } catch {
        return undefined;
      }

      if (!zscalerCert ||
          !zscalerCert.includes('-----BEGIN CERTIFICATE-----') ||
          !zscalerCert.includes('-----END CERTIFICATE-----')) {
        return undefined;
      }

      const certifiContent = fs.readFileSync(certifiPath, 'utf8');
      const tempPath = combinedCertPath + '.tmp';
      fs.writeFileSync(tempPath, certifiContent + '\n' + zscalerCert);
      fs.renameSync(tempPath, combinedCertPath);

      logger.info('CHROMA_MCP', 'Created combined SSL certificate bundle for Zscaler', {
        path: combinedCertPath
      });

      return combinedCertPath;
    } catch (error) {
      logger.debug('CHROMA_MCP', 'Could not create combined cert bundle', {}, error as Error);
      return undefined;
    }
  }

  /**
   * Build subprocess environment with SSL certificate overrides for enterprise proxy compatibility.
   * If a combined cert bundle exists (Zscaler), injects SSL_CERT_FILE, REQUESTS_CA_BUNDLE, etc.
   * Otherwise returns a plain string-keyed copy of process.env.
   */
  private getSpawnEnv(): Record<string, string> {
    const baseEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        baseEnv[key] = value;
      }
    }

    const combinedCertPath = this.getCombinedCertPath();
    if (!combinedCertPath) {
      return baseEnv;
    }

    logger.info('CHROMA_MCP', 'Using combined SSL certificates for enterprise compatibility', {
      certPath: combinedCertPath
    });

    return {
      ...baseEnv,
      SSL_CERT_FILE: combinedCertPath,
      REQUESTS_CA_BUNDLE: combinedCertPath,
      CURL_CA_BUNDLE: combinedCertPath,
      NODE_EXTRA_CA_CERTS: combinedCertPath
    };
  }
}
