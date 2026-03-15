# Sandboxed Code Execution

This document outlines the security considerations and recommendations for running LLM-generated code in production.

## Current Implementation

The current implementation in [`src/lib/executor/runner.ts`](../src/lib/executor/runner.ts) executes generated code in a temporary directory (`/tmp/ai-idea-{uuid}`) with the following security measures:

1. **Path Traversal Protection**: Validates that all file paths stay within the work directory
2. **Environment Isolation**: Only passes `PATH` and `FORCE_COLOR` environment variables to executed processes
3. **Timeout Limits**: Configurable timeouts (default 60s for generation, 120s for execution)
4. **Process Termination**: Uses SIGTERM to stop runaway processes

## Security Concerns

The current approach has the following vulnerabilities:

### 1. No Container Isolation
Code runs on the same host as the application, potentially allowing:
- Access to system resources (CPU, memory, disk)
- Network access to internal services
- Reading environment variables if improperly configured
- Fork bombs and resource exhaustion

### 2. No Network Isolation
Generated code can make network requests to:
- Internal services and databases
- Cloud provider APIs
- Command-and-control servers

### 3. No Resource Limits
- No CPU limits
- No memory limits
- No disk I/O limits
- No network bandwidth limits

## Recommended Solutions

### Option 1: Docker-based Sandboxing (Recommended)

Use ephemeral Docker containers to run generated code:

```typescript
// Example: Docker-based executor
async function runInDocker(workDir: string, timeout: number) {
  const containerId = randomUUID();
  
  await runCommand("docker", [
    "run",
    "--rm",
    `--name=${containerId}`,
    `-v${workDir}:/app`,
    "--network=none",  // No network access
    "--memory=512m",   // Memory limit
    "--cpus=1.0",     // CPU limit
    "--pids-limit=100", // Prevent fork bombs
    "node:20-alpine",
    "sh", "-c",
    "npm install && npm start"
  ], { timeout });
}
```

Benefits:
- Complete isolation from host system
- Resource limits (CPU, memory, disk)
- Network isolation option
- Clean environment each run

Trade-offs:
- Slower execution (container startup)
- Requires Docker daemon
- More complex error handling

### Option 2: WebAssembly Sandbox

Use a WebAssembly-based sandbox like QuickJS or Wasmer:

```typescript
// Example: WASM-based executor
import { WASI } from "wasmer";

async function runWasm(files: ProjectFiles) {
  const wasi = new WASI({
    env: {},
    preopenDirectories: { "/tmp": "/tmp" },
  });
  
  const instance = await WebAssembly.instantiate(wasmModule, {
    wasi_snapshot_preview1: wasi.importObject,
  });
  
  wasi.start(instance);
}
```

Benefits:
- Fast startup
- Strong isolation
- Small footprint

Trade-offs:
- Limited language support (mostly WASM-compilable languages)
- More complex integration

### Option 3: Firecracker MicroVMs

Use AWS Firecracker or similar for stronger isolation:

Benefits:
- VM-level isolation
- Near-native performance
- Full Linux environment

Trade-offs:
- Higher resource overhead
- More complex setup

## Implementation Roadmap

1. **Phase 1 (Quick Win)**: Add Docker-based execution as optional feature
   - Add `DOCKER_ENABLED` environment variable
   - Implement Docker executor with resource limits
   - Fall back to current implementation if Docker unavailable

2. **Phase 2 (Enhanced Security)**: Add network isolation
   - Run containers with `--network=none`
   - Add optional file access restrictions

3. **Phase 3 (Production Hardening)**: Add full sandboxing
   - Implement resource limits (CPU, memory, disk)
   - Add execution time limits
   - Implement proper cleanup on errors

## Environment Variables

Add the following to `.env`:

```env
# Code Execution
DOCKER_ENABLED=false
DOCKER_IMAGE=node:20-alpine
DOCKER_MEMORY_LIMIT=512m
DOCKER_CPU_LIMIT=1.0
DOCKER_NETWORK_MODE=bridge  # or "none" for isolation
```

## Testing

When implementing sandboxing:

1. Test path traversal attempts are blocked
2. Test resource exhaustion is prevented
3. Test network isolation works
4. Test cleanup on errors
5. Test timeout handling

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Firecracker MicroVM Security](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md)
- [WebAssembly Security Model](https://webassembly.org/docs/security/)
