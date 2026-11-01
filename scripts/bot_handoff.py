"""Route changed inbox paths to Grok Bot routines without calling a model to route."""

import json
import os
from pathlib import PurePosixPath
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


def route_tasks(paths):
    routes = {}
    for path in paths:
        parts = PurePosixPath(path).parts
        if (len(parts) == 5 and parts[:2] == ("shared", "tasks")
                and parts[3] == "inbox" and parts[4].endswith(".md")):
            routes.setdefault(parts[2], []).append(path)
    return routes


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def changed_paths(before, after):
    # New branch: compare against an empty tree. Ordinary pushes use their full range.
    if before and set(before) == {"0"}:
        before = subprocess.check_output(
            ["git", "hash-object", "-t", "tree", "--stdin"], input=b""
        ).decode().strip()
    before = before or f"{after}^"
    data = subprocess.check_output([
        "git", "diff", "--no-renames", "--diff-filter=AM", "--name-only", "-z",
        before, after, "--", "shared/tasks/",
    ])
    return [path.decode("utf-8") for path in data.split(b"\0") if path]


def main():
    after = os.environ.get("HANDOFF_AFTER") or "HEAD"
    routes = route_tasks(changed_paths(os.environ.get("HANDOFF_BEFORE"), after))
    enabled = (os.environ.get("HANDOFF_ENABLED") == "true"
               and os.environ.get("HANDOFF_EVENT") == "push")
    print(f"Mode: {'live' if enabled else 'dry run'}; recipients: {len(routes)}")
    for bot, paths in routes.items():
        print(f"Recipient: {bot}; task files: {len(paths)}")
    if not enabled or not routes:
        return 0

    try:
        config = json.loads(os.environ.get("GROK_BOT_WEBHOOKS") or "{}")
        # Check all recipient settings before sending any webhook.
        for bot in routes:
            endpoint = config[bot]
            url = urlsplit(endpoint["url"])
            if (url.scheme != "https" or not url.hostname or url.username
                    or url.password or not endpoint["key"]):
                raise ValueError("Invalid webhook configuration")
    except (ValueError, KeyError, TypeError):
        print("::error::Set GROK_BOT_WEBHOOKS with HTTPS url and key for every recipient.")
        return 1

    opener = build_opener(NoRedirect)
    failed = False
    for bot, paths in routes.items():
        body = json.dumps({
            "repository": os.environ.get("GITHUB_REPOSITORY"),
            "ref": "refs/heads/main",
            "commit": after,
            "task_paths": paths,
        }).encode("utf-8")
        request = Request(config[bot]["url"], data=body, method="POST", headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config[bot]['key']}",
        })
        try:
            with opener.open(request, timeout=30) as response:
                if response.status != 200:
                    raise ValueError("Unexpected response")
            print(f"Accepted: {bot} (acceptance does not mean task completion)")
        except (HTTPError, URLError, TimeoutError, ValueError):
            # Never print the URL, key, response body, or exception containing them.
            print(f"::error::Webhook failed for {bot}; check the routine and its secret.")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
