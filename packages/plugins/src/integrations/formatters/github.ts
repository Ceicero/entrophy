import type { AlertEmbedData } from './types';

const GITHUB_BLACK = 0x24292e;

interface GithubRepo {
  full_name?: string;
  html_url?: string;
}
interface GithubUser {
  login?: string;
  html_url?: string;
  avatar_url?: string;
}
interface GithubCommit {
  id?: string;
  message?: string;
  url?: string;
  author?: { name?: string };
}

export interface GithubPushPayload {
  ref?: string;
  repository?: GithubRepo;
  pusher?: { name?: string };
  sender?: GithubUser;
  commits?: GithubCommit[];
  compare?: string;
}

export interface GithubPullRequestPayload {
  action?: string;
  repository?: GithubRepo;
  sender?: GithubUser;
  pull_request?: { number?: number; title?: string; html_url?: string; user?: GithubUser; merged?: boolean };
}

export interface GithubIssuesPayload {
  action?: string;
  repository?: GithubRepo;
  sender?: GithubUser;
  issue?: { number?: number; title?: string; html_url?: string };
}

export interface GithubReleasePayload {
  action?: string;
  repository?: GithubRepo;
  sender?: GithubUser;
  release?: { name?: string | null; tag_name?: string; html_url?: string; prerelease?: boolean };
}

export interface GithubStarPayload {
  action?: string;
  repository?: GithubRepo & { stargazers_count?: number };
  sender?: GithubUser;
}

export interface GithubWorkflowRunPayload {
  action?: string;
  repository?: GithubRepo;
  sender?: GithubUser;
  workflow_run?: {
    name?: string;
    html_url?: string;
    conclusion?: string | null;
    status?: string;
    head_branch?: string;
  };
}

function branchFromRef(ref?: string): string {
  return ref ? ref.replace('refs/heads/', '') : 'unknown';
}

function repoName(payload: { repository?: GithubRepo }): string {
  return payload.repository?.full_name ?? 'unknown repository';
}

function baseEmbed(payload: { repository?: GithubRepo; sender?: GithubUser }): Partial<AlertEmbedData> {
  return {
    color: GITHUB_BLACK,
    authorName: repoName(payload),
    authorIconUrl: payload.sender?.avatar_url,
    footer: 'GitHub',
  };
}

function formatPush(payload: GithubPushPayload): AlertEmbedData | null {
  const commits = payload.commits ?? [];
  if (commits.length === 0) return null;
  const branch = branchFromRef(payload.ref);
  const lines = commits
    .slice(0, 5)
    .map(
      (c) =>
        `[\`${(c.id ?? '').slice(0, 7)}\`](${c.url ?? '#'}) ${(c.message ?? '').split('\n')[0]} — ${c.author?.name ?? 'unknown'}`,
    );
  return {
    ...baseEmbed(payload),
    title: `${commits.length} new commit${commits.length === 1 ? '' : 's'} to ${branch}`,
    url: payload.compare ?? payload.repository?.html_url,
    description: lines.join('\n'),
  } as AlertEmbedData;
}

function formatPullRequest(payload: GithubPullRequestPayload): AlertEmbedData | null {
  const pr = payload.pull_request;
  if (!pr) return null;
  const verb =
    payload.action === 'closed' ? (pr.merged ? 'merged' : 'closed') : (payload.action ?? 'updated');
  return {
    ...baseEmbed(payload),
    title: `Pull request #${pr.number} ${verb}: ${pr.title ?? ''}`,
    url: pr.html_url,
    description: `by ${pr.user?.login ?? 'unknown'}`,
  } as AlertEmbedData;
}

function formatIssues(payload: GithubIssuesPayload): AlertEmbedData | null {
  const issue = payload.issue;
  if (!issue) return null;
  return {
    ...baseEmbed(payload),
    title: `Issue #${issue.number} ${payload.action ?? 'updated'}: ${issue.title ?? ''}`,
    url: issue.html_url,
    description: `by ${payload.sender?.login ?? 'unknown'}`,
  } as AlertEmbedData;
}

function formatRelease(payload: GithubReleasePayload): AlertEmbedData | null {
  const release = payload.release;
  if (!release || payload.action !== 'published') return null;
  return {
    ...baseEmbed(payload),
    title: `${release.prerelease ? 'Pre-release' : 'Release'} published: ${release.name ?? release.tag_name ?? ''}`,
    url: release.html_url,
  } as AlertEmbedData;
}

function formatStar(payload: GithubStarPayload): AlertEmbedData | null {
  if (payload.action !== 'created') return null;
  return {
    ...baseEmbed(payload),
    title: `⭐ New star from ${payload.sender?.login ?? 'someone'}`,
    url: payload.repository?.html_url,
    description:
      payload.repository?.stargazers_count !== undefined
        ? `${payload.repository.stargazers_count} total stars`
        : undefined,
  } as AlertEmbedData;
}

function formatWorkflowRun(payload: GithubWorkflowRunPayload): AlertEmbedData | null {
  const run = payload.workflow_run;
  if (!run || payload.action !== 'completed') return null;
  const outcome = run.conclusion ?? run.status ?? 'unknown';
  return {
    ...baseEmbed(payload),
    title: `Workflow "${run.name ?? ''}" ${outcome} on ${run.head_branch ?? 'unknown'}`,
    url: run.html_url,
  } as AlertEmbedData;
}

/** GitHub event types this formatter recognizes and produces an embed for by default. */
export const SUPPORTED_GITHUB_EVENTS = [
  'push',
  'pull_request',
  'issues',
  'release',
  'star',
  'workflow_run',
] as const;
export type SupportedGithubEvent = (typeof SUPPORTED_GITHUB_EVENTS)[number];

/**
 * Formats a GitHub webhook delivery into an alert embed, or `null` when the event type isn't one this connector
 * alerts on, or the specific action within a supported type isn't alert-worthy (e.g. an `issues` `edited` action).
 */
export function formatGithubEventEmbed(eventType: string, payload: unknown): AlertEmbedData | null {
  switch (eventType) {
    case 'push':
      return formatPush(payload as GithubPushPayload);
    case 'pull_request':
      return formatPullRequest(payload as GithubPullRequestPayload);
    case 'issues':
      return formatIssues(payload as GithubIssuesPayload);
    case 'release':
      return formatRelease(payload as GithubReleasePayload);
    case 'star':
      return formatStar(payload as GithubStarPayload);
    case 'workflow_run':
      return formatWorkflowRun(payload as GithubWorkflowRunPayload);
    default:
      return null;
  }
}
