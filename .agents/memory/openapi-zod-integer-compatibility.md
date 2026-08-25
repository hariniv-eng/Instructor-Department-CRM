---
name: OpenAPI Zod integer compatibility
description: The workspace API generator targets an older Zod runtime that cannot consume generated integer validators.
---

Use OpenAPI `number` schemas for numeric IDs and counts in this workspace unless the Zod dependency is upgraded in lockstep with the generator.

**Why:** The current generator emits `zod.int()` for OpenAPI `integer`, but the installed Zod runtime lacks that helper, which breaks library typechecking after code generation.

**How to apply:** Before adding numeric API fields, prefer `type: number` and enforce integer semantics in the server route or database schema where needed.