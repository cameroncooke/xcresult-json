// Global test setup

// Mock chalk at the module level
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    yellow: (str: string) => str,
    red: (str: string) => str,
  },
}));

// Mock execa at the module level  
jest.mock('execa', () => ({
  execa: jest.fn(),
}));