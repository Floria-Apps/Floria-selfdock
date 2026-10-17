# Security policy

Floria SelfDock can start, stop and restart containers, so we take security seriously.

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately through
[GitHub's private vulnerability reporting](https://github.com/FloriaApps/Floria-selfdock/security/advisories/new)
and include:

- what you found and why it matters,
- steps to reproduce it,
- the version you tested.

We will reply as soon as we can, work on a fix, and credit you in the release notes if you wish.

## Good to know

- The default `docker-compose.yml` puts a [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) between SelfDock and Docker, so SelfDock can only list, read logs, start, stop and restart.
- Mounting `/var/run/docker.sock` directly (even with `:ro`) gives full control of the host to anything that can reach the dashboard. Do not expose SelfDock to the internet without HTTPS and a strong password.
