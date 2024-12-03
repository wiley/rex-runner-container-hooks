/* eslint-disable @typescript-eslint/no-unused-vars */
import * as fs from 'fs'
import * as core from '@actions/core'
import { RunScriptStepArgs } from 'hooklib'
import { execPodStep, copyToPod, copyFromPod } from '../k8s'
import { findParentGitRepos, writeEntryPointScript } from '../k8s/utils'
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
    await copyFromPod(
      state.jobPod,
      JOB_CONTAINER_NAME,
      '/__w/_temp/_runner_file_commands/.',
      '/home/runner/_work/_temp/_runner_file_commands/'
    )
    const gitRepos = findParentGitRepos('/__w')
    core.debug( findParentGitRepos('__w').length > 0 ? `found the following git repos: ${gitRepos}` : 'No git repos found')
    core.debug(`Found get repos: " ${gitRepos}`)
    for (const gitRepo of gitRepos) {
      await copyFromPod(
        state.jobPod,
        JOB_CONTAINER_NAME,
        gitRepo,
        '/home/runner/_work/'
      )
    }
  } catch (err) {
    core.debug(`execPodStep failed: ${JSON.stringify(err)}`)
    const message = (err as any)?.response?.body?.message || err
    throw new Error(`failed to run script step: ${message}`)
  } finally {
    fs.rmSync(runnerPath)
  }
}
