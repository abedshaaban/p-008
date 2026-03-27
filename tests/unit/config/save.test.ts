import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveState, withStateLock } from '../../../src/config/save'
import { createTempDir } from '../../helpers/tempDir'

const tempDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('saveState', () => {
  it('writes branches.json inside the state directory', async () => {
    const projectRoot = await createTempDir('save-state')
    tempDirs.push(projectRoot)

    await saveState(projectRoot, {
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })

    const raw = await fs.readFile(path.join(projectRoot, 'state', 'branches.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({
      defaultBaseBranch: 'main',
      settings: { json: true, interactive: false },
      workspaces: [{ branch: 'main', folderName: 'main', goal: '' }]
    })
  })
})

describe('withStateLock', () => {
  it('creates and releases the lock file around the callback', async () => {
    const projectRoot = await createTempDir('state-lock')
    tempDirs.push(projectRoot)

    const result = await withStateLock(projectRoot, async () => {
      await expect(fs.access(path.join(projectRoot, 'state', 'branches.lock'))).resolves.toBeUndefined()
      return 'ok'
    })

    expect(result).toBe('ok')
    await expect(fs.access(path.join(projectRoot, 'state', 'branches.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('releases the lock file when the callback throws', async () => {
    const projectRoot = await createTempDir('state-lock-throw')
    tempDirs.push(projectRoot)

    await expect(
      withStateLock(projectRoot, async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    await expect(fs.access(path.join(projectRoot, 'state', 'branches.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('waits for an existing lock to be released', async () => {
    const projectRoot = await createTempDir('state-lock-wait')
    tempDirs.push(projectRoot)

    const stateDir = path.join(projectRoot, 'state')
    const lockPath = path.join(stateDir, 'branches.lock')
    await fs.mkdir(stateDir, { recursive: true })
    await fs.writeFile(lockPath, '123\n', 'utf8')

    const pending = withStateLock(projectRoot, async () => 'acquired')
    const releaseTimer = setTimeout(async () => {
      await fs.unlink(lockPath)
    }, 150)

    await expect(pending).resolves.toBe('acquired')
    clearTimeout(releaseTimer)
  })

  it('times out if the lock never clears', async () => {
    const projectRoot = await createTempDir('state-lock-timeout')
    tempDirs.push(projectRoot)

    const existsError = Object.assign(new Error('exists'), { code: 'EEXIST' })
    const openSpy = vi.spyOn(fs, 'open').mockRejectedValue(existsError as never)
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(10_001)

    await expect(withStateLock(projectRoot, async () => 'never')).rejects.toThrow('timed out waiting for state lock')

    openSpy.mockRestore()
    nowSpy.mockRestore()
  })
})
