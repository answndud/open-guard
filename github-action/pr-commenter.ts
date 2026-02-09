import type { Octokit } from "@actions/github";

const COMMENT_MARKER = "<!-- openguard-pr-comment -->";

export async function postOrUpdateComment(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  pullNumber: number,
  body: string,
): Promise<void> {
  const existing = await findExistingComment(octokit, repo, pullNumber);
  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: repo.owner,
      repo: repo.repo,
      comment_id: existing.id,
      body,
    });
    return;
  }

  await octokit.rest.issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: pullNumber,
    body,
  });
}

async function findExistingComment(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  pullNumber: number,
): Promise<{ id: number } | null> {
  const comments = await octokit.rest.issues.listComments({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  for (const comment of comments.data) {
    if (comment.body && comment.body.includes(COMMENT_MARKER)) {
      return { id: comment.id };
    }
  }

  return null;
}
