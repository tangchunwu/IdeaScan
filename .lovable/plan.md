

## Plan: Optimize Agent Message Rendering

Based on the current `OpenClawChannel.tsx`, the assistant message rendering can be improved in several areas:

### Changes

**1. Enhanced Markdown Rendering (`OpenClawChannel.tsx`)**
- Add syntax-highlighted code blocks with a copy button (using `<pre>` + copy-to-clipboard)
- Style tables, blockquotes, and lists for better readability
- Add `remark-gfm` support via ReactMarkdown for tables/strikethrough
- Improve `prose` Tailwind classes for tighter, chat-optimized typography

**2. Improved Tool Call Display**
- Show tool arguments preview (e.g., file name, search query) instead of just the tool name
- Add a completion checkmark animation when tool finishes
- Use color-coded badges: blue for calling, green for done

**3. Better Streaming UX**
- Add a blinking cursor at the end of streaming content
- Smoother transition when streaming content finalizes into a message

**4. Message Layout Polish**
- Wider max-width for assistant messages (`max-w-[85%]` instead of `75%`) since agent responses are often longer
- Better spacing between code blocks and text
- Add a subtle timestamp on hover for each message

### Files to Edit
- `src/components/openclaw/OpenClawChannel.tsx` — All rendering improvements
- `package.json` — Add `remark-gfm` if not present

