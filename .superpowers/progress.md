# Execution ledger — external object test app
Ruling: No Git repository exists, so worktree, per-task commits, and git-based task scripts are inapplicable — execute in the session workspace with test evidence — cost if wrong: the deliverable has no commit history.
Pre-flight: Task 1 server supplies config.js consumed by Task 4; Task 2 messenger and Task 3 height APIs are consumed by Task 4; interfaces are consistent.
Task 1: complete (tests: node --test test\server.test.js -> 5/5 pass)
Task 2: complete (tests: node --test test\messenger.test.js -> 6/6 pass)
Task 3: complete (tests: node --test test\height.test.js -> 5/5 pass)
Task 4: complete (tests: node --test test\app.test.js -> 6/6 pass)
Task 5: complete (tests: npm test -> 23/23 pass; HTTP 200 verified; browser add-content height 1363 -> 1504 verified)
Final: fixed outbound-log resize feedback loop — observeHeight target isolation test RED→GREEN, suite 23/23
Final: fixed non-shrinking viewport-coupled measurements — body content-box test RED→GREEN, suite 25/25
Final: fixed incomplete whole-page observation and fallback feedback — body observer tests RED→GREEN, fixed-height log, suite 25/25
Final: minor (deferred): HEAD /config.js Content-Length differs from GET and 405 omits Allow header
Final: minor (deferred): query-only parent origin cannot override server frame-ancestors policy
Final: minor (deferred): status/config failures are not consistently announced and logged
