---
type: llm
---
PASS if the plan for launch is a single app with one simple place to store data (a managed database, local storage or similar), and it does not plan a load balancer, cache layer, message queue, CDN for user uploads, microservices, read replicas or multiple regions for launch.

FAIL if the launch plan includes any of those infrastructure parts as needed now.
