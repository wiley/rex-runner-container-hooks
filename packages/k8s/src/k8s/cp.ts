import * as fs from 'fs'
import * as tar from 'tar'
import * as core from '@actions/core'
import { tmpdir } from 'os'
import * as k8s from '@kubernetes/client-node'
import { randomUUID } from 'crypto'
import { WritableStreamBuffer } from "stream-buffers";


export class Cp {
  execInstance: k8s.Exec
  constructor(config: k8s.KubeConfig, execInstance?: k8s.Exec) {
    this.execInstance = execInstance || new k8s.Exec(config)
  }

  /**
   * @param {string} namespace - The namespace of the pod to exec the command inside.
   * @param {string} podName - The name of the pod to exec the command inside.
   * @param {string} containerName - The name of the container in the pod to exec the command inside.
   * @param {string} srcPath - The source path in local
   * @param {string} tgtPath - The target path in the pod
   * @param {string} [cwd] - The directory that is used as the parent in the host when uploading
   */
  async cpToPod(
    namespace: string,
    podName: string,
    containerName: string,
    srcPath: string,
    tgtPath: string,
    cwd?: string
  ): Promise<void> {
    // Generate a temporary file for the tar archive.
    const tmpFileName = await this.generateTmpFileName()
    const command = ['tar', 'xf', '-', '-C', tgtPath]

    core.debug(`Archiving ${srcPath} to ${tmpFileName}`)
    await tar.c({ file: tmpFileName, cwd }, [srcPath])

    // Ensure the tar file exists.
    if (!fs.existsSync(tmpFileName)) {
      core.error(`Tar file ${tmpFileName} does not exist`)
      throw new Error(`Tar file ${tmpFileName} does not exist`)
    }

    // Get the file size for logging purposes.
    const stats = fs.statSync(tmpFileName)
    const fileSizeInBytes = stats.size
    core.info(`Transferring to pod ${srcPath}: ${fileSizeInBytes.toLocaleString()} Bytes`)

    const readStream = fs.createReadStream(tmpFileName)

    core.debug('Exec cpToPod')

    // Refactor this part to wait for the status in the callback
    return await new Promise<void>(async (resolve, reject) => {
      ;(
        await this.execInstance.exec(
          namespace,
          podName,
          containerName,
          command,
          null,
          null,
          readStream,
          false,
          async ({ status }) => {
            // this never happens
            core.debug(`cpToPod status: ${status}`)

            if (status === 'Failure') {
              reject(new Error(`Error from cpToPod`))
            } else {
              resolve()
            }
          }
        )
      ).addEventListener('close', () => {
        core.debug('Done copying files to pod')
        resolve()
      })
    })
  }

  async cpFromPod(
    namespace: string,
    podName: string,
    containerName: string,
    srcPath: string,
    tgtPath: string,
    cwd?: string
  ): Promise<void> {
    // Generate a temporary file for the tar archive.
    const tmpFileName = await this.generateTmpFileName()
    const command = ['tar', 'zcf', '-']
    if (cwd) {
      command.push('-C', cwd);
    }
    command.push(srcPath);
    const writerStream = fs.createWriteStream(tmpFileName);
    const errStream = new WritableStreamBuffer();
    core.debug(`Archiving ${srcPath} to ${tmpFileName} remotely`)
    core.debug('Exec cpFromPod')

    // Refactor this part to wait for the status in the callback
    return new Promise((resolve, reject) => {
       this.execInstance
        .exec(namespace, podName, containerName, command, writerStream, errStream, null, false, async ({ status }) => {
          try {
            // core.debug(`waiting before close stream`)
            // const stats0 = fs.statSync(tmpFileName)
            // const fileSizeInBytes0 = stats0.size
            // core.info(`Transferring from before closing strm remote ${srcPath}: ${fileSizeInBytes0.toLocaleString()} Bytes`)
            // await sleep(1000);
            writerStream.close();
            if (status === 'Failure' || errStream.size()) {
              return reject(new Error(`Error from cpFromPod - details: \n ${errStream.getContentsAsString()}`));
            }
            const stats = fs.statSync(tmpFileName)
            const fileSizeInBytes = stats.size
            core.info(`Transferring from remote after closing the stream ${srcPath}: ${fileSizeInBytes.toLocaleString()} Bytes`)
            core.debug(`waiting after close stream`)
            await sleep(1000);
            const stats1 = fs.statSync(tmpFileName)
            const fileSizeInBytes1 = stats1.size
            core.info(`get file last time, transferring from remote ${srcPath}: ${fileSizeInBytes1.toLocaleString()} Bytes`)
            await tar.x({
              file: tmpFileName,
              cwd: tgtPath,
            });
            resolve();
          }
          catch (e) {
            reject(e);
          }
        })
        .catch(reject);
    });
  }
  async generateTmpFileName(): Promise<string> {
    let tmpFileName: string

    let i = 0
    do {
      tmpFileName = `${tmpdir()}/${randomUUID()}`

      core.debug(`Checking if tmp file ${tmpFileName} exists`)

      try {
        await fs.promises.access(tmpFileName, fs.constants.W_OK)
        core.debug('Tmp file already exists')
      } catch (err) {
        return tmpFileName
      }
      i++
    } while (i < 10)

    throw new Error('Cannot generate tmp file name')
  }
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
