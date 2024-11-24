/* eslint-disable @typescript-eslint/no-unused-vars */
import * as fs from 'fs'
import * as core from '@actions/core'
import * as path from 'path'
import { RunScriptStepArgs } from 'hooklib'
import { execPodStep, copyToPod, copyFromPod } from '../k8s'
import { writeEntryPointScript } from '../k8s/utils'
import { JOB_CONTAINER_NAME } from './constants'

export async function runScriptStep(
  args: RunScriptStepArgs,
  state,
  responseFile
): Promise<void> {
  const { entryPoint, entryPointArgs, environmentVariables } = args
  const { containerPath, runnerPath } = writeEntryPointScript(
    args.workingDirectory,
    entryPoint,
    entryPointArgs,
    args.prependPath,
    environmentVariables
  )

  args.entryPoint = 'sh'
  args.entryPointArgs = ['-e', containerPath]
  try {
    core.debug('Starting script step')
    core.debug('response file:' + responseFile)
    await copyToPod(
      state.jobPod,
      JOB_CONTAINER_NAME,
      '/home/runner/_work/_temp',
      '/__w/'
    )

    core.debug('Running script by execPodStep')
    await execPodStep(
      [args.entryPoint, ...args.entryPointArgs],
      state.jobPod,
      JOB_CONTAINER_NAME
    )
    const githuboutput = process.env.GITHUB_OUTPUT
    if (githuboutput) {
      try {
        core.debug('GITHUB_OUTPUT is presented: ' + githuboutput)
        const resolvedPath = path.resolve(githuboutput)
        if (fs.existsSync(resolvedPath)) {
          const fileName = path.basename(resolvedPath) // Extract the filename
          const directoryName = path.dirname(resolvedPath) // Extract the directory name
          core.debug(
            'GITHUB_OUTPUT is a path, its dir is: ' +
              directoryName +
              ' its filename is: ' +
              fileName
          )
          core.debug(
            'Copying from: ' +
              resolvedPath +
              'to /home/runner/_work/_temp/_runner_file_commands/'
          )
          await copyFromPod(
            state.jobPod,
            JOB_CONTAINER_NAME,
            '/__w/_temp/_runner_file_commands/*',
            '/home/runner/_work/_temp/_runner_file_commands/'
          )
        } else {
          core.debug(
            `The path specified in GITHUB_OUTPUT does not exist: ${resolvedPath}`
          )
        }
      } catch (error) {
        console.error(`Error validating GITHUB_OUTPUT path:`, error)
      }
    } else {
      console.warn('GITHUB_OUTPUT environment variable is not set.')
    }
  } catch (err) {
    core.debug(`execPodStep failed: ${JSON.stringify(err)}`)
    const message = (err as any)?.response?.body?.message || err
    throw new Error(`failed to run script step: ${message}`)
  } finally {
    fs.rmSync(runnerPath)
  }
}
