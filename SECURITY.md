# Security policy

cueq is under development and has no production-supported release or guaranteed
security maintenance period. Use invented data for local evaluation; do not
load real employment, payroll, health, or other personal records.

## Reporting a vulnerability

Use GitHub's [private vulnerability report](https://github.com/sebastianspicker/cueq/security/advisories/new).
Do not report suspected vulnerabilities in public issues. If the private form
is unavailable, keep the details private until a reporting channel is available.

Include the affected commit or tag, steps to reproduce the problem, and its
likely impact. A small test case and a suggested mitigation are useful if you
have them. Leave out credentials, tokens, real personal data, and production
logs.

Reports are welcome, but the project cannot promise a response or fix within a
specific time.

## Security design

[docs/SECURITY.md](docs/SECURITY.md) explains authentication, access controls,
privacy protections, and known limitations. It describes the implementation;
it is not a security certification.
