import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

const MEMORY_DIR = 'memories'

// Ensure memories directory exists
if (!existsSync(MEMORY_DIR)) {
  mkdirSync(MEMORY_DIR, { recursive: true })
}

// Get user-specific directory
const getUserDir = (token: string) => join(MEMORY_DIR, token)

// Ensure user directory exists
const ensureUserDir = (token: string) => {
  const userDir = getUserDir(token)
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true })
  }
}

/**
 * Read memories for a user, optionally filtered by query
 */
export const readMemories = (token: string, query?: string): string[] => {
  ensureUserDir(token)
  const userDir = getUserDir(token)
  
  try {
    const files = readdirSync(userDir).filter((f: string) => f.endsWith('.md'))
    
    const memories = files.map((file: string) => {
      const content = readFileSync(join(userDir, file), 'utf-8')
      return { file, content }
    })

    // Filter by query if provided
    if (query) {
      return memories
        .filter((m: { file: string; content: string }) => 
          m.file.includes(query) || 
          m.content.toLowerCase().includes(query.toLowerCase())
        )
        .map((m: { file: string; content: string }) => m.content)
    }

    return memories.map((m: { file: string; content: string }) => m.content)
  } catch (error) {
    return []
  }
}

/**
 * Write a memory for a user
 */
export const writeMemory = (token: string, title: string, content: string): string => {
  ensureUserDir(token)
  const userDir = getUserDir(token)
  
  // Sanitize title for filename
  const filename = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.md'
  
  const filepath = join(userDir, filename)
  
  // Add metadata
  const fullContent = `# ${title}\n\n${content}\n\n---\n*Created: ${new Date().toISOString()}*`
  
  writeFileSync(filepath, fullContent, 'utf-8')
  
  return filename
}

/**
 * Update an existing memory for a user
 */
export const updateMemory = (token: string, filename: string, title: string, content: string): boolean => {
  ensureUserDir(token)
  const userDir = getUserDir(token)
  
  // If filename changed, we need to rename
  const newFilename = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.md'
  
  const oldPath = join(userDir, filename)
  const newPath = join(userDir, newFilename)
  
  // Check if old file exists
  if (!existsSync(oldPath)) {
    return false
  }
  
  // Add metadata
  const fullContent = `# ${title}\n\n${content}\n\n---\n*Updated: ${new Date().toISOString()}*`
  
  writeFileSync(newPath, fullContent, 'utf-8')
  
  // Delete old file if name changed
  if (oldPath !== newPath && existsSync(oldPath)) {
    unlinkSync(oldPath)
  }
  
  return true
}

/**
 * Delete a memory for a user
 */
export const deleteMemory = (token: string, filename: string): boolean => {
  ensureUserDir(token)
  const userDir = getUserDir(token)
  const filepath = join(userDir, filename)
  
  if (!existsSync(filepath)) {
    return false
  }
  
  unlinkSync(filepath)
  return true
}

/**
 * Generate a new user token
 */
export const generateToken = (): string => {
  return randomBytes(16).toString('hex')
}
