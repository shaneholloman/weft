// Mock for @cloudflare/sandbox - not supported in vitest-pool-workers
export class Sandbox {
  static fromClass() {
    return class MockSandbox {};
  }
}
