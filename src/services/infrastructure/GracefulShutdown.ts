/**
 * GracefulShutdown - Cleanup utilities for graceful exit
 *
 * Extracted from worker-service.ts to provide centralized shutdown coordination.
 * Handles:
 * - HTTP server closure (with Windows-specific delays)
 * - Session manager shutdown coordination
 * - Child process cleanup (Windows zombie port fix)
 */

import http from 'http';
import { logger } from '../../utils/logger.js';
import {
  getChildProcesses,
  forceKillProcess,
  waitForProcessesExit,
  removePidFile
} from './ProcessManager.js';

export interface ShutdownableService {
  shutdownAll(): Promise<void>;
}

export interface CloseableClient {
  close(): Promise<void>;
}

export interface CloseableDatabase {
  close(): Promise<void>;
}

/**
 * Stoppable service interface for ChromaMcpManager
 */
export interface StoppableService {
  stop(): Promise<void>;
}

/**
 * Configuration for graceful shutdown
 */
export interface GracefulShutdownConfig {
  server: http.Server | null;
  sessionManager: ShutdownableService;
  mcpClient?: CloseableClient;
  dbManager?: CloseableDatabase;
  chromaMcpManager?: StoppableService;
}

/**
 * Perform graceful shutdown of all services
 *
 * IMPORTANT: On Windows, we must kill all child processes before exiting
 * to prevent zombie ports. The socket handle can be inherited by children,
 * and if not properly closed, the port stays bound after process death.
 */
export async function performGracefulShutdown(config: GracefulShutdownConfig): Promise<void> {
  logger.info('SYSTEM', 'Shutdown initiated');

  // Clean up PID file on shutdown
  removePidFile();

  // STEP 1: Enumerate all child processes BEFORE we start closing things
  const childPids = await getChildProcesses(process.pid);
  logger.info('SYSTEM', 'Found child processes', { count: childPids.length, pids: childPids });

  // STEP 2: Close HTTP server first
  if (config.server) {
    try {
      await closeHttpServer(config.server);
      logger.info('SYSTEM', 'HTTP server closed');
    } catch (error) {
      logger.error('SYSTEM', 'Failed to close HTTP server', {}, error as Error);
    }
  }

  // STEP 3: Stop Chroma MCP connection EARLY — it's a pure subprocess that
  // doesn't need session drain. Killing it first ensures it's cleaned up even
  // if later steps (sessionManager, mcpClient) hang and exhaust the hard timeout.
  if (config.chromaMcpManager) {
    try {
      logger.info('SHUTDOWN', 'Stopping Chroma MCP connection...');
      await withTimeout(config.chromaMcpManager.stop(), 4000, 'chromaMcpManager.stop');
      logger.info('SHUTDOWN', 'Chroma MCP connection stopped');
    } catch (error) {
      logger.error('SYSTEM', 'Failed to stop Chroma MCP', {}, error as Error);
    }
  }

  // STEP 4: Shutdown active sessions
  try {
    await withTimeout(config.sessionManager.shutdownAll(), 4000, 'sessionManager.shutdownAll');
  } catch (error) {
    logger.error('SYSTEM', 'Failed to shutdown sessions', {}, error as Error);
  }

  // STEP 5: Close MCP client connection (signals child to exit gracefully)
  if (config.mcpClient) {
    try {
      await withTimeout(config.mcpClient.close(), 2000, 'mcpClient.close');
      logger.info('SYSTEM', 'MCP client closed');
    } catch (error) {
      logger.error('SYSTEM', 'Failed to close MCP client', {}, error as Error);
    }
  }

  // STEP 6: Close database connection (includes ChromaSync cleanup)
  if (config.dbManager) {
    try {
      await withTimeout(config.dbManager.close(), 2000, 'dbManager.close');
    } catch (error) {
      logger.error('SYSTEM', 'Failed to close database', {}, error as Error);
    }
  }

  // STEP 7: Force kill any remaining child processes (Windows zombie port fix)
  if (childPids.length > 0) {
    logger.info('SYSTEM', 'Force killing remaining children');
    for (const pid of childPids) {
      await forceKillProcess(pid);
    }
    // Wait for children to fully exit
    await waitForProcessesExit(childPids, 5000);
  }

  logger.info('SYSTEM', 'Worker shutdown complete');
}

/**
 * Run a promise with a timeout. If the promise doesn't settle within `ms`,
 * the returned promise rejects with a timeout error. The original promise
 * is NOT cancelled — it just becomes unobserved.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeoutId));
}

/**
 * Close HTTP server with Windows-specific delays
 * Windows needs extra time to release sockets properly
 */
async function closeHttpServer(server: http.Server): Promise<void> {
  // Close all active connections
  server.closeAllConnections();

  // Give Windows time to close connections before closing server (prevents zombie ports)
  if (process.platform === 'win32') {
    await new Promise(r => setTimeout(r, 500));
  }

  // Close the server
  await new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  });

  // Extra delay on Windows to ensure port is fully released
  if (process.platform === 'win32') {
    await new Promise(r => setTimeout(r, 500));
    logger.info('SYSTEM', 'Waited for Windows port cleanup');
  }
}
