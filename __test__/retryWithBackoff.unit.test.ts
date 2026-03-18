import * as utils from '../lib/utils'

// Mock @actions/core to avoid side effects in tests
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn()
}))

describe('retryWithBackoff', () => {
  const shouldRetry = (e: unknown) =>
    typeof e === 'object' && e !== null && (e as any).status === 422

  test('succeeds on first attempt without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('success')
    const result = await utils.retryWithBackoff(fn, shouldRetry, 2, 1)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries on 422 and succeeds on second attempt', async () => {
    const error = Object.assign(new Error('Validation Failed'), {status: 422})
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success')
    const result = await utils.retryWithBackoff(fn, shouldRetry, 2, 1)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('exhausts retries on persistent 422 and throws', async () => {
    const error = Object.assign(new Error('Validation Failed'), {status: 422})
    const fn = jest.fn().mockRejectedValue(error)
    await expect(
      utils.retryWithBackoff(fn, shouldRetry, 2, 1)
    ).rejects.toThrow('Validation Failed')
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  test('does not retry on non-422 errors', async () => {
    const error = Object.assign(new Error('Forbidden'), {status: 403})
    const fn = jest.fn().mockRejectedValue(error)
    await expect(
      utils.retryWithBackoff(fn, shouldRetry, 2, 1)
    ).rejects.toThrow('Forbidden')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries up to maxRetries times before throwing', async () => {
    const error = Object.assign(new Error('Validation Failed'), {status: 422})
    const fn = jest.fn().mockRejectedValue(error)
    await expect(
      utils.retryWithBackoff(fn, shouldRetry, 3, 1)
    ).rejects.toThrow('Validation Failed')
    expect(fn).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
  })
})
