// Suppress console.error in tests unless DEBUG environment variable is set
if (!process.env.DEBUG) {
  global.console.error = jest.fn();
}

// Increase timeout for E2E tests
jest.setTimeout(30000);