// The button's built-in action: the prompt it submits when `buttonPrompt` is
// empty, and the name the hover card gives it. The prompt asks for a handoff
// file, what the next session reads to carry on without this conversation:
// the task, the state of the work, the decisions and their reasons, the files
// and commands that matter, the open problems, the next steps and the dead
// ends, as facts for a reader who has the repository and nothing else.

/** What the hover card says the button does, with the built-in prompt. */
export const HANDOFF_LABEL = 'Write a handoff for the next session'

/** The file the built-in prompt writes, in the project root. */
export const HANDOFF_FILE = 'HANDOFF.md'

export const HANDOFF_PROMPT = `Write a handoff for the next session: a file the next Claude session reads to carry on this work without this conversation.

Write it to ${HANDOFF_FILE} in the project root. If one is already there, read it first and keep only what is still true. Do not commit it, do not start new work and do not change any other file.

Write for a reader who has the repository but not this conversation. State facts, not the story of how they were found. Be specific: paths, names, commands and exact error text. Say plainly what is not done, not verified or uncertain. Leave out secrets, tokens and credentials. Keep it as short as it can be while complete: a few hundred words is usually right, a long session may need more.

Use these sections, in this order, and leave out a section that would be empty:

# Handoff
One line: the date and the project or branch.

## Task
What was asked, in the user's own words where they matter, and what finished looks like.

## State
What is done and verified, what is done but not verified, what is in progress and what has not been started. The branch, and what the working tree holds that is not committed: files changed, created or deleted.

## Decisions
Each decision made and why, including what was considered and rejected, and every instruction, preference or correction the user gave along the way.

## Map
The files that matter and what each one does, the entry points, and the commands that build, run and test, as they were actually run and seen to work.

## Open problems
Blockers, failing tests or checks with their exact output, and open questions for the user.

## Next steps
In order, the first one concrete enough to start at once.

## Dead ends
What was tried and did not work, and why, so it is not tried again.

When the file is written, reply with its path, two or three lines on where the work stands, and this line for the next session to begin with: Read ${HANDOFF_FILE} and continue from its next steps.`

/** How much of a custom prompt's first line the hover card shows when `buttonLabel` is empty. */
const LABEL_CHARS = 60

/**
 * The button's prompt and label from the options: an empty `buttonPrompt`
 * is the built-in handoff prompt; an empty `buttonLabel` names the built-in
 * prompt by its own label and a custom one by its first line, cut to
 * `LABEL_CHARS` with an ellipsis.
 */
export function buttonAction(prompt: string, label: string): { prompt: string; label: string; builtIn: boolean } {
  const text = prompt.trim()
  const name = label.trim()
  if (text === '') return { prompt: HANDOFF_PROMPT, label: name || HANDOFF_LABEL, builtIn: true }
  if (name) return { prompt: text, label: name, builtIn: false }
  const first = text.split('\n').map(line => line.trim()).find(line => line !== '') ?? text
  const chars = Array.from(first)
  return { prompt: text, label: chars.length > LABEL_CHARS ? chars.slice(0, LABEL_CHARS - 1).join('') + '…' : first, builtIn: false }
}
