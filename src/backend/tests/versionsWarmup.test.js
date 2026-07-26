jest.mock('../lib/tableStorage', () => ({
  getTableClient: jest.fn()
}));

jest.mock('../lib/versionsStore', () => ({
  writeVersions: jest.fn()
}));

const { getTableClient } = require('../lib/tableStorage');
const { writeVersions } = require('../lib/versionsStore');
const versionsWarmup = require('../VersionsWarmup');

function createContext() {
  const logFn = jest.fn();
  logFn.info = jest.fn();
  logFn.warn = jest.fn();
  logFn.error = jest.fn();
  return { log: logFn };
}

function tableClientWith(entities) {
  return {
    async *listEntities() {
      for (const entity of entities) {
        yield entity;
      }
    }
  };
}

describe('VersionsWarmup function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds and stores the snapshot', async () => {
    getTableClient.mockReturnValue(tableClientWith([
      { PayloadJson: JSON.stringify({ owner: 'actions', name: 'actions_checkout', releaseInfo: [{ tag_name: 'v4' }] }) },
      { PayloadJson: JSON.stringify({ owner: 'actions', name: 'actions_setup-node' }) }
    ]));
    writeVersions.mockResolvedValue({ etag: '"abc"', payloadHash: 'abc', rawBytes: 100, gzipBytes: 40 });

    const context = createContext();
    await versionsWarmup(context);

    expect(writeVersions).toHaveBeenCalledTimes(1);
    const snapshot = writeVersions.mock.calls[0][0];
    expect(snapshot.count).toBe(2);
    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('count=2'));
  });

  it('rethrows so the invocation is recorded as failed', async () => {
    getTableClient.mockReturnValue(tableClientWith([]));
    writeVersions.mockRejectedValue(new Error('blob unavailable'));

    const context = createContext();

    await expect(versionsWarmup(context)).rejects.toThrow('blob unavailable');
    expect(context.log.error).toHaveBeenCalled();
  });
});
