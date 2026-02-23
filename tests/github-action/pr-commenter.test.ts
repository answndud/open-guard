import { describe, expect, it, vi } from "vitest";
import { postOrUpdateComment } from "../../github-action/pr-commenter.js";

describe("pr commenter", () => {
  it("updates existing OpenGuard comment", async () => {
    const listComments = vi.fn(async () => ({
      data: [
        { id: 1, body: "regular comment" },
        { id: 42, body: "<!-- openguard-pr-comment --> old" },
      ],
    }));
    const updateComment = vi.fn(async () => ({}));
    const createComment = vi.fn(async () => ({}));

    const octokit = {
      rest: {
        issues: {
          listComments,
          updateComment,
          createComment,
        },
      },
    };

    await postOrUpdateComment(
      octokit as Parameters<typeof postOrUpdateComment>[0],
      { owner: "acme", repo: "openguard" },
      7,
      "new body",
    );

    expect(listComments).toHaveBeenCalledTimes(1);
    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(createComment).not.toHaveBeenCalled();
    expect(updateComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "openguard",
      comment_id: 42,
      body: "new body",
    });
  });

  it("creates comment when marker is absent", async () => {
    const listComments = vi.fn(async () => ({
      data: [
        { id: 1, body: "regular comment" },
        { id: 2, body: null },
      ],
    }));
    const updateComment = vi.fn(async () => ({}));
    const createComment = vi.fn(async () => ({}));

    const octokit = {
      rest: {
        issues: {
          listComments,
          updateComment,
          createComment,
        },
      },
    };

    await postOrUpdateComment(
      octokit as Parameters<typeof postOrUpdateComment>[0],
      { owner: "acme", repo: "openguard" },
      8,
      "fresh body",
    );

    expect(listComments).toHaveBeenCalledTimes(1);
    expect(updateComment).not.toHaveBeenCalled();
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "openguard",
      issue_number: 8,
      body: "fresh body",
    });
  });
});
