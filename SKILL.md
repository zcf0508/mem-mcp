---
name: memory-management
description: Manages long-term memory for users across conversations. Automatically queries relevant memories when starting a new topic, and saves important personal information, habits, schedules, and user-requested memories. Use this when discussing user background, preferences, or plans; starting a new task or project; users mention personal details or ask to remember something.
---

# Memory Management Skill

This skill enables Claude to maintain persistent memory of user information across conversations through the Memory MCP Server.

## Query Strategy (When & How)

**When to Query**: 1) New conversation/topic start - query relevant memories for context. 2) User references background ("As I mentioned...") - query related past discussions. 3) Topic resumption - verify previous context. 4) Explicit recall requests. Query once per topic, don't re-query repeatedly.

**Recommended Flow**: In new conversations, call `list_memory_titles` FIRST to see all available memories, then use `read_memory` with specific filenames or keywords to retrieve relevant ones. This improves recall accuracy significantly.

## What to Save as Long-Term Memory

**Personal Info**: Name, contact, location, education, professional role, career goals, timezone preferences.
**Dev Habits**: Languages/frameworks, preferred tools/IDEs, code style standards, testing/deployment practices, architecture patterns, learning style.
**Schedule**: Working hours, timezone, recurring meetings, deadlines, planned leave, regular activities.
**Context**: Current projects & status, team composition, constraints/requirements, past decisions & rationale, ongoing challenges.
**User-Requested**: Always save when users say "remember that...", "save that I...", "note that..." - capture the intent.

## Available Tools

### list_memory_titles
**Purpose**: Discover all available memories. Call this FIRST in new conversations to see what memories exist.
**Input**: None required
**Output**: One memory per line in format `filename|title|priority|lastAccessedAt`, e.g. `work-schedule.md|工作安排|P1|2026-02-10T08:00:00.000Z`
**Usage**: `list_memory_titles()` → Review titles and priorities → Then call `read_memory` with relevant keywords or filenames

### read_memory
**Purpose**: Retrieve memories, optionally filtered by search query.
**Input**: `{ "query": "optional search term" }` - If omitted, returns all memories.
**Usage**: `read_memory(query="TypeScript practices")` or `read_memory()` for all

### write_memory
**Purpose**: Create a new memory entry with optional priority.
**Input**: `{ "title": "Brief searchable title", "content": "Full memory content with details", "priority": "P0|P1|P2 (optional, default P2)" }`
**Priority Guide**: P0 = core identity, long-term preferences, safety rules (never evicted). P1 = current projects, active strategies (evicted after 90 days without access). P2 = one-off events, debug notes, temporary preferences (evicted after 30 days without access).
**Usage**: `write_memory(title="User Dev Habits", content="Prefers TypeScript...", priority="P1")`

### update_memory
**Purpose**: Update an existing memory. **Critical: Preserve original content - only append or modify specific parts, NEVER summarize.**
**Input**: `{ "filename": "current-filename.md", "title": "Updated title", "content": "Updated content (must preserve original)", "priority": "P0|P1|P2 (optional, keeps current)" }`
**Rules**: Original 2000-word memory + 40 new words = ~2040 words result, NOT 540 words. Append new info or modify conflicting parts only.

### delete_memory
**Purpose**: Delete a memory entry permanently (not archived).
**Input**: `{ "filename": "filename-to-delete.md" }`

### search_archive
**Purpose**: Search archived (evicted) memories. Use when current memories don't have the answer — old memories may be in the archive.
**Input**: `{ "query": "search term" }`
**Usage**: When `read_memory` returns nothing relevant, try `search_archive(query="Python pipeline")` to check cold storage.

### evict_memories
**Purpose**: Manually trigger memory eviction sweep. Normally runs automatically on read (at most once per 24h).
**Input**: `{ "dryRun": true|false (optional, default false) }`
**Usage**: `evict_memories(dryRun=true)` to preview what would be archived, then `evict_memories()` to execute.

## Implementation Guidelines

**Query Strategy**: On conversation start → `list_memory_titles()` first, then query with specific keywords. On topic shift → query specific topic keywords. One query per topic. Respect "no memory" requests by deleting.

**Save Strategy**: Immediate save for explicit requests ("remember X"). Natural save points after personal details discussion, project completion, learning preferences. Consolidate by updating existing memories rather than creating duplicates. Assign appropriate priority: P0 for identity/preferences, P1 for active projects, P2 for transient info.

**Format**: Use searchable keyword titles. Organize with bullet points/sections. Include context about when info was learned. Update timestamps on changes. Remove outdated info.

## Examples

**New Project**: User mentions "starting React/TypeScript project" → 1) `list_memory_titles()` 2) `read_memory(query="React projects")` 3) After discussion: `write_memory(title="React Project 2025", content="...", priority="P1")`

**Personal Preference**: User says "I prefer morning work until 2PM" → Immediately: `write_memory(title="Working Hours", content="Prefers mornings until 2PM", priority="P0")`

**Topic Continuation**: User says "Back to that Python pipeline..." → `read_memory(query="Python pipeline")` → If not found: `search_archive(query="Python pipeline")` → Continue with full context

**Temporary Note**: User debugs a timezone issue → `write_memory(title="TZ Debug", content="Server uses UTC, local is CST+8", priority="P2")`

## Important Reminders

🔒 **Privacy**: User memories isolated by token. ⚡ **Efficiency**: Query once per topic, use `list_memory_titles` first for discovery. 📝 **Clarity**: Searchable titles for easy retrieval. 🤝 **Respect**: Ask before saving sensitive info (except explicit requests). 🔄 **Maintenance**: Update when info changes, delete when obsolete. 💬 **Transparency**: Optionally acknowledge "I remembered that you..."

## Boundaries

This skill does NOT handle: Temporary conversation context (use normal history), real-time system info/API responses, private info user wants to keep private (ask first), system-level configuration.
