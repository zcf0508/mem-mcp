---
name: memory-management
description: Manages long-term memory for users across conversations. Automatically queries relevant memories when starting a new topic, and saves important personal information, habits, schedules, and user-requested memories. Use this when: discussing user background, preferences, or plans; starting a new task or project; users mention personal details or ask to remember something.
---

# Memory Management Skill

This skill enables Claude to maintain persistent memory of user information across conversations through the Memory MCP Server.

## When to Query Memory

Query the user's memories in these situations:

1. **New Conversation or Topic Start**: When beginning a fresh conversation or switching to a new topic, query relevant memories to provide context.
   - Example: User asks about their development project → check for existing project notes and habits

2. **User Background References**: When users mention personal context, background, or previous discussions
   - Example: "As I mentioned before..." → query for related past discussions

3. **Continuity Check**: After a topic shift or resumption, verify what you should remember
   - Example: User returns to an old topic → query for previous context
   - **Note**: Query once per topic; don't re-query repeatedly

4. **Explicit Requests**: Always respect user's direct requests to recall or verify information

## What to Save as Long-Term Memory

Save information in these categories:

### Personal Information
- Full name, contact details, location
- Education background and credentials
- Professional role and organization
- Career goals and aspirations
- Timezone and availability preferences

### Development Habits & Preferences
- Programming languages and frameworks they work with
- Preferred development tools and IDEs
- Code style preferences and standards they follow
- Testing and deployment practices
- Architecture patterns they prefer
- Learning pace and style preferences

### Schedule & Availability
- Regular working hours and time zones
- Known commitments and recurring meetings
- Project deadlines
- Planned leave or time off
- Regular activity schedules (gym, meetings, etc.)

### Important Context
- Current projects and their status
- Team composition and roles
- Important constraints and requirements
- Past decisions and why they were made
- Ongoing challenges and solutions tried

### User-Requested Memories
- **Always save** when users explicitly ask to remember something
- "Remember that...", "Save that I...", "Note that..."
- Don't require them to be perfectly formatted—capture the intent

## How to Use the Memory API

### Available Tools

#### 1. read_memory
Retrieves user memories, optionally filtered by search query.

**Input:**
```json
{
  "query": "optional search term (e.g., 'Python' or 'deadlines')"
}
```

**Usage Pattern:**
```
When starting a new topic, call: read_memory(query="relevant keywords about the topic")
Example: read_memory(query="TypeScript development practices")
```

#### 2. write_memory
Creates a new memory entry.

**Input:**
```json
{
  "title": "Brief title (auto-formatted to filename)",
  "content": "Full memory content with details"
}
```

**Usage Pattern:**
```
After gathering important information:
write_memory(
  title="User Development Habits",
  content="Prefers TypeScript, uses Cursor IDE, likes test-driven development..."
)
```

#### 3. update_memory
Updates an existing memory entry. **Critical: Preserve original content.**

**Input:**
```json
{
  "filename": "current-filename.md",
  "title": "Updated title",
  "content": "Updated content (must preserve original, only append or modify specific parts)"
}
```

**⚠️ Update Rules:**
- NEVER summarize or condense existing content
- Append new information to the end, or insert in the appropriate section
- Only modify specific parts that conflict with new information
- Original content length should be preserved (adding info = longer content)

#### 4. delete_memory
Deletes a memory entry.

**Input:**
```json
{
  "filename": "filename-to-delete.md"
}
```

## Implementation Guidelines

### Query Strategy
1. **On conversation start**: Query with broad terms related to user background
2. **On topic shift**: Query with specific topic keywords
3. **One query per topic**: Don't re-query the same information repeatedly within a conversation
4. **Respect "no memory" requests**: If user asks not to remember something, delete it

### Save Strategy
1. **Immediate save**: User-explicit requests ("remember X", "note that")
2. **Natural save points**: After discussion of personal details, after completing projects, when learning user preferences
3. **Consolidate**: If updating existing memory, merge new information rather than creating duplicates
4. **Preserve original content**: When updating, NEVER summarize or condense existing content. Only append new information or modify specific conflicting parts. A 2000-word memory with 40 words of new info should result in ~2040 words, not 540 words.

### Format for Memory Entries
- Use clear titles that are searchable keywords
- Organize content with bullet points or sections
- Include context about when information was learned
- Update timestamps when information changes
- Remove outdated information when no longer relevant

## Examples

### Example 1: New Project Discussion
```
User: "I'm starting a new web project using React and TypeScript"

Action:
1. Query: read_memory(query="React projects development setup")
2. Use retrieved information to understand their setup patterns
3. After discussion, save: write_memory(
     title="React Project - 2025",
     content="Building React app with TypeScript..."
   )
```

### Example 2: Personal Preference
```
User: "I prefer working in the mornings, usually until 2 PM"

Action:
1. Save immediately: write_memory(
     title="Working Hours Preference",
     content="Prefers working in mornings, typically available until 2 PM"
   )
```

### Example 3: Topic Continuation
```
User: "Back to the Python data pipeline I mentioned before..."

Action:
1. Query: read_memory(query="Python data pipeline")
2. Retrieve previous context and continue conversation with full context
3. No need to re-query during the conversation
```

## Important Reminders

- 🔒 **Privacy**: User memories are isolated by token. Each user's data is separate.
- ⚡ **Efficiency**: Query once per clear topic, not per message
- 📝 **Clarity**: Save information with clear titles for easy future retrieval
- 🤝 **Respect**: Always ask before saving sensitive information (except explicit requests)
- 🔄 **Maintenance**: Update memories when information changes, delete when obsolete
- 💬 **Transparency**: When retrieving memories, you can optionally acknowledge: "I remembered that you..."

## Skill Boundaries

This skill does NOT handle:
- Temporary conversation context (use normal conversation history)
- Real-time system information or API responses (not memory)
- Information the user wants to keep private (ask before saving)
- System-level configuration details (user manages directly)

## Testing Checklist

Before using this skill in production:
- [ ] Can successfully read and write memories
- [ ] Query correctly filters relevant memories
- [ ] Update creates new title filenames when title changes
- [ ] Delete removes memory entries
- [ ] Token isolation prevents cross-user access
- [ ] Handles missing or empty memories gracefully
